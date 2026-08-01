import { loadSettings, loadBest, saveBest, clamp, lerp } from './config.js';
import { Terrain } from './terrain.js';
import { Player, MOUNTS } from './player.js';
import { Entities } from './entities.js';
import { Avalanche } from './avalanche.js';
import { Background, THEMES, setDetail, drawTerrain, drawEntity, drawPlayer, drawPlayerShadow, drawAvalanche, drawDebris } from './render.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

const PX_PER_M = 40;

// Camera framing. The skier sits well left of centre so most of the screen is
// the ground you're about to cover, and the view pulls back as you speed up so
// obstacles appear with enough warning to set up a jump.
const ANCHOR_X = 0.22;     // skier's screen position, as a fraction of width
const LEAD_PER_SPEED = 0.06; // extra world px of lookahead per px/s of speed
const LEAD_MAX = 160;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.settings = loadSettings();
    this.sound = new Sound(this.settings);
    this.ui = new UI(this.settings, {
      play: () => this.startRun(),
      retry: () => this.startRun(),
      resume: () => this.setPaused(false),
      pause: () => this.setPaused(true),
      quit: () => this.toMenu(),
      settingsChanged: () => { /* theme/colors read live each frame */ },
    });

    this.state = 'menu'; // menu | playing | paused | dying | gameover
    this.held = false;
    this.time = 0;
    this.shake = 0;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.last = performance.now();

    // adaptive quality: starts at the device cap and steps down if the frame
    // time stays high, so weaker phones keep a smooth frame rate — resolution
    // first, then decorative render passes
    this.dprCap = 2;
    this.detail = 1;
    this.frameAvg = 16;
    this.perfCheck = 0;

    this.bindInput();
    this.bindFullscreen();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // iOS Safari resizes the visual viewport (not the window) when the
    // address bar collapses; orientation changes can report stale sizes
    // unless we re-measure a beat later
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setPaused(true);
    });

    this.newRun(true); // ambient demo behind the menu
    requestAnimationFrame(t => this.loop(t));
  }

  // ------------------------------------------------------------ run lifecycle

  newRun(demo) {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.demo = demo;
    this.terrain = new Terrain(this.settings, seed);
    this.player = new Player(this.settings, this.terrain);
    this.entities = new Entities(this.settings, this.terrain, seed ^ 0xabcdef);
    this.avalanche = new Avalanche(this.settings);
    this.bg = new Background(seed ^ 0x1234);
    this.coins = 0;
    this.trickScore = 0;
    this.particles = [];
    this.floaters = [];
    this.debris = [];
    this.trail = [];
    this.poses = []; // recent player poses, for the high-speed ghost trail
    this.time = 0;
    this.shake = 0;
    this.dieTimer = 0;
    this.cam.x = this.player.x - 300;
    this.cam.y = this.player.y - 300;
    this.cam.zoom = 1;
  }

  startRun() {
    this.newRun(false);
    this.state = 'playing';
    this.held = false;
    this.ui.showGame();
    this.sound.ensure();
    this.tryAutoFullscreen();
  }

  toMenu() {
    this.newRun(true);
    this.state = 'menu';
    this.ui.refreshBest();
    this.ui.showOnly('menu');
  }

  setPaused(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      this.ui.showOnly('paused');
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      this.held = false;
      this.ui.showGame();
      this.last = performance.now();
    }
  }

  get score() {
    return this.player.x / PX_PER_M + this.coins * 25 + this.trickScore;
  }

  die(caught) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.dieTimer = 1.0;
    this.deathCaught = caught;
    this.player.state = 'dead';
    this.held = false;
    this.shake = 22;
    this.sound.gameOver();
    this.buzz([60, 50, 90]);
    this.burst(this.player.x, this.player.y - 15, 26, '#ffffff', 380);
  }

  finishDeath() {
    const stats = {
      dist: this.player.x / PX_PER_M,
      coins: this.coins,
      trickScore: this.trickScore,
      score: this.score,
      caught: this.deathCaught,
    };
    const isBest = stats.score > loadBest();
    if (isBest) saveBest(stats.score);
    this.state = 'gameover';
    this.ui.showGameOver(stats, isBest);
  }

  // ------------------------------------------------------------------- input

  bindInput() {
    this.canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.press();
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault()); // long-press menu on mobile
    window.addEventListener('pointerup', () => { this.held = false; });
    window.addEventListener('pointercancel', () => { this.held = false; });

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.press();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing') this.setPaused(true);
        else if (this.state === 'paused') this.setPaused(false);
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.held = false;
    });
  }

  press() {
    if (this.state !== 'playing') return;
    this.held = true;
    this.player.press();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
  }

  bindFullscreen() {
    const btn = document.getElementById('btn-fullscreen');
    if (!btn) return;

    const update = () => {
      const inFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      btn.textContent = inFS ? '✕' : '⛶';
      btn.title = inFS ? 'Exit fullscreen' : 'Fullscreen';
    };

    btn.addEventListener('click', () => {
      const inFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (inFS) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      } else {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
      }
    });

    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);

    // hide button if the API isn't available (some iOS in-app browsers)
    const el = document.documentElement;
    if (el && !el.requestFullscreen && !el.webkitRequestFullscreen) {
      btn.style.display = 'none';
    }
  }

  // auto-enter fullscreen on first play (mobile UX convenience)
  tryAutoFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const el = document.documentElement;
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' })
      ?.catch(() => {}); // silently ignore if blocked
  }

  buzz(pattern) {
    if (!this.settings.haptics) return;
    try { globalThis.navigator?.vibrate?.(pattern); } catch { /* unsupported */ }
  }

  // ------------------------------------------------------------------ update

  loop(now) {
    const rawMs = now - this.last;
    const dt = clamp(rawMs / 1000, 0, 1 / 30);
    this.last = now;

    // sustained slow frames -> shed render resolution, then decoration
    this.frameAvg += (clamp(rawMs, 0, 100) - this.frameAvg) * 0.04;
    if (++this.perfCheck >= 150) {
      this.perfCheck = 0;
      if (this.frameAvg > 26) {
        if (this.dprCap > 1) {
          this.dprCap = Math.max(1, this.dprCap - 0.5);
          this.frameAvg = 16;
          this.resize();
        } else if (this.detail > 0) {
          // already at 1x: give up the decorative passes rather than the
          // wider camera, which is what makes the game playable
          this.detail = 0;
          this.frameAvg = 16;
          setDetail(0);
        }
      }
    }

    if (this.state === 'playing' || this.state === 'menu' || this.state === 'dying') {
      this.update(dt);
    }
    this.render(dt);
    requestAnimationFrame(t => this.loop(t));
  }

  update(dt) {
    this.time += dt;
    const p = this.player;

    if (this.state === 'dying') {
      this.dieTimer -= dt;
      this.avalanche.front += this.avalanche.speed * dt;
      this.updateFx(dt);
      if (this.dieTimer <= 0) this.finishDeath();
      return;
    }

    p.update(dt, this.held && !this.demo, this.terrain);
    this.handleEvents();

    this.poses.push({ x: p.x, y: p.y, angle: p.angle, state: p.state, mount: p.mount, grace: 0 });
    if (this.poses.length > 10) this.poses.shift();

    const camLeft = this.cam.x;
    const camRight = this.cam.x + this.w / this.cam.zoom;
    this.entities.update(dt, camLeft, camRight, this.time);

    if (!this.demo) {
      this.checkCollisions();
      this.avalanche.update(dt, p);
      if (this.avalanche.caught(p)) this.die(true);
    } else {
      this.avalanche.front = p.x - 4000; // keep it offstage behind the menu
    }

    // ski trail + snow spray
    if (p.state === 'ground') {
      this.trail.push({ x: p.x, y: p.y + 3 });
      if (this.trail.length > 220) this.trail.shift();
      if (p.speed > 330) {
        for (let i = 0; i < 2; i++) {
          this.particles.push({
            x: p.x - 18 + Math.random() * 10, y: p.y,
            vx: -p.vx * 0.25 + (Math.random() - 0.5) * 60,
            vy: -60 - Math.random() * 120,
            life: 0.45, maxLife: 0.45, size: 2 + Math.random() * 3,
            color: '#ffffff', grav: 700,
          });
        }
      }
    } else if (p.state === 'crash') {
      // churned-up snow billowing around the tumbling skier
      for (let i = 0; i < 3; i++) {
        this.particles.push({
          x: p.x + (Math.random() - 0.5) * 30, y: p.y - Math.random() * 18,
          vx: -p.vx * 0.3 + (Math.random() - 0.5) * 160,
          vy: -40 - Math.random() * 160,
          life: 0.5 + Math.random() * 0.3, maxLife: 0.8,
          size: 2.5 + Math.random() * 4, color: '#ffffff', grav: 500,
        });
      }
    }

    this.updateFx(dt);
    this.updateCamera(dt);

    if (!this.demo) {
      this.ui.updateHUD(p.x / PX_PER_M, this.coins, this.score, p.mount);
    }
  }

  handleEvents() {
    const p = this.player;
    for (const ev of p.events) {
      switch (ev.type) {
        case 'jump':
          this.sound.jump();
          this.buzz(8);
          break;
        case 'land':
          // big airs kick up a puff of powder on touchdown
          if (ev.air > 0.3) {
            this.burst(p.x, p.y, Math.min(6 + ev.air * 10, 18), '#ffffff', 200);
            if (ev.air > 0.6) this.shake = Math.max(this.shake, 4);
          }
          break;
        case 'flip': {
          const pts = 100 * ev.n * (1 + 0.25 * (ev.combo - 1));
          this.trickScore += pts;
          const label = ev.n > 1 ? `${ev.n}x BACKFLIP!` : 'BACKFLIP!';
          this.float(p.x, p.y - 70, `${label} +${Math.floor(pts)}`, '#ffd75e', 20);
          if (ev.combo > 1) this.float(p.x, p.y - 96, `combo ×${ev.combo}`, '#9fd8ff', 14);
          this.sound.flip(ev.n);
          this.buzz(15);
          this.burst(p.x, p.y - 20, 14, '#ffd75e', 230);
          break;
        }
        case 'crash':
          this.sound.crash();
          this.buzz([30, 40, 30]);
          this.shake = Math.max(this.shake, 13);
          this.burst(p.x, p.y - 10, 24, '#ffffff', 360);
          // skis rip off and tumble away
          for (let k = 0; k < 2; k++) {
            this.debris.push({
              x: p.x, y: p.y - 4,
              vx: p.vx * 0.6 + (Math.random() - 0.5) * 220,
              vy: -260 - Math.random() * 200,
              rot: p.angle, rotVel: (Math.random() - 0.5) * 24,
              len: 48 + k * 9, life: 2.4, stuck: false,
              color: this.settings.skiColor,
            });
          }
          break;
        case 'tumble': // each bounce off the snow during the ragdoll
          this.sound.thud();
          this.shake = Math.max(this.shake, 5);
          this.burst(p.x, p.y - 4, 9, '#ffffff', 200);
          break;
        case 'mount':
          this.sound.mount();
          this.buzz(12);
          this.float(p.x, p.y - 70, MOUNTS[ev.kind].label + '!', '#9fff9f', 18);
          break;
        case 'dismount':
          if (ev.reason === 'break') {
            this.float(p.x, p.y - 70, 'Snowmobile wrecked!', '#ff9f7a', 16);
          }
          break;
      }
    }
    p.events.length = 0;
  }

  checkCollisions() {
    const p = this.player;
    if (p.state === 'dead') return;
    const px = p.cx, py = p.cy;

    for (const it of this.entities.items) {
      if (it.dead) continue;
      const dx = it.x - px;
      if (dx < -80 || dx > 80) continue;
      const dy = (it.y + (it.bob || 0)) - py;
      const rr = it.r + 24;
      if (dx * dx + dy * dy > rr * rr) continue;

      if (it.type === 'coin') {
        it.dead = true;
        this.coins++;
        this.sound.coin();
        this.burst(it.x, it.y, 6, '#ffd75e', 150);
      } else if (it.type === 'rock') {
        if (p.state === 'crash' || p.grace > 0) continue;
        it.dead = true;
        if (p.mount === 'yeti') {
          this.trickScore += 50;
          this.sound.smash();
          this.shake = Math.max(this.shake, 6);
          this.float(it.x, it.y - 50, 'SMASH! +50', '#cfe3ff', 16);
          this.burst(it.x, it.y - 10, 16, '#8b98a6', 340);
        } else if (p.mount === 'snowmobile') {
          p.loseMount('break');
          this.sound.smash();
          this.shake = Math.max(this.shake, 8);
          this.burst(it.x, it.y - 10, 16, '#d8342c', 340);
        } else {
          p.crash();
        }
      } else if (it.type === 'animal') {
        if (p.state === 'crash') continue;
        it.dead = true;
        p.setMount(it.kind);
      }
    }
  }

  updateFx(dt) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.vy += (pt.grav || 0) * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    this.particles = this.particles.filter(pt => pt.life > 0);

    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 46 * dt;
    }
    this.floaters = this.floaters.filter(f => f.life > 0);

    // loose skis: fly, spin, then stick in the snow and fade
    for (const d of this.debris) {
      if (d.stuck) {
        d.life -= dt;
        continue;
      }
      d.vy += 1900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.rotVel * dt;
      const gy = this.terrain.groundY(d.x);
      if (d.y >= gy - 2) {
        d.y = gy - 2;
        d.stuck = true;
        d.rot = Math.atan(this.terrain.slopeAt(d.x)) + (Math.random() - 0.5) * 0.9;
      }
    }
    this.debris = this.debris.filter(d => d.life > 0);

    this.shake = Math.max(0, this.shake - 34 * dt);
  }

  // world px of slope visible ahead of the skier — the number the "view
  // distance" setting is really tuning
  get lookahead() {
    return this.cam.x + this.w / this.cam.zoom - this.player.x;
  }

  updateCamera(dt) {
    const p = this.player;
    // the view setting divides the zoom, so a bigger value pulls the camera
    // back and puts more of the mountain on screen. Narrow windows (phones,
    // especially in portrait) get extra pull-back, otherwise they'd see far
    // less of the slope ahead than a desktop at the same setting.
    const view = clamp(this.settings.view || 1, 0.8, 1.8)
      * clamp(1100 / Math.max(this.w, 1), 1, 1.7);
    const targetZoom = clamp(1.06 - p.speed * 0.00024, 0.78, 1.0) / view;
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, 1 - Math.exp(-2.2 * dt));
    const z = this.cam.zoom;
    // shift further forward the faster you go: high speed needs more warning
    const lead = clamp(p.speed * LEAD_PER_SPEED, 0, LEAD_MAX);
    const tx = p.x + lead - (this.w / z) * ANCHOR_X;
    // Centre the band of slope that actually fits on screen. On a wide, steep
    // view the ground ahead drops most of a screen height, so the skier rides
    // high and the sky stops eating the frame; on a tall phone the drop is a
    // thin diagonal, so the skier sits closer to the middle instead of leaving
    // half the screen as blank snow.
    const drop = (this.w * this.terrain.slope) / Math.max(this.h, 1);
    const anchorY = clamp(0.5 - drop * 0.5, 0.26, 0.5);
    const ty = p.y - (this.h / z) * anchorY;
    this.cam.x = tx; // horizontal follow is exact to avoid speed wobble
    this.cam.y = lerp(this.cam.y, ty, 1 - Math.exp(-5.5 * dt));
    const maxOff = (this.h / z) * 0.22;
    this.cam.y = clamp(this.cam.y, ty - maxOff, ty + maxOff);
  }

  // Chevrons pinned to the right edge for hazards that are still off-screen.
  // Even with the pulled-back camera, top speed eats the screen quickly — this
  // gives a beat of warning before a rock or a ride enters the frame.
  drawHazardMarkers(ctx, w, h) {
    const p = this.player;
    const z = this.cam.zoom;
    const edge = this.cam.x + w / z;   // world x at the right edge of the screen
    const far = edge + 1200;           // how far past it we peek

    for (const it of this.entities.items) {
      if (it.dead || it.type === 'coin') continue;
      if (it.x < edge + 20 || it.x > far) continue;

      const near = 1 - (it.x - edge) / (far - edge); // 0 far away, 1 entering
      const y = clamp((it.y - this.cam.y) * z, 46, h - 46);
      const x = w - 26;
      const rock = it.type === 'rock';

      ctx.globalAlpha = 0.25 + near * 0.6;
      ctx.fillStyle = rock ? '#ff6a4d' : '#8dff9d';
      ctx.beginPath();
      ctx.moveTo(x + 11, y);
      ctx.lineTo(x - 6, y - 11);
      ctx.lineTo(x - 6, y + 11);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.2 + near * 0.45;
      ctx.strokeStyle = 'rgba(10,25,50,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.globalAlpha = 0.35 + near * 0.5;
      ctx.font = '700 11px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#eaf4ff';
      ctx.fillText(`${Math.round((it.x - p.x) / PX_PER_M)}m`, x - 10, y + 4);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  burst(x, y, n, color, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * spread;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        size: 2 + Math.random() * 3.5, color, grav: 600,
      });
    }
  }

  float(x, y, text, color, size) {
    this.floaters.push({ x, y, text, color, size, life: 1.25 });
  }

  // ------------------------------------------------------------------ render

  render(dt) {
    const { ctx, w, h, dpr } = this;
    const theme = THEMES[this.settings.theme] || THEMES.day;
    const z = this.cam.zoom;

    const shakeX = this.settings.screenShake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.settings.screenShake ? (Math.random() - 0.5) * this.shake : 0;

    // --- screen space: sky + parallax ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg.drawSky(ctx, w, h, theme, this.time);
    this.bg.drawRidges(ctx, w, h, theme, this.cam.x, this.time);

    // --- world space ---
    ctx.setTransform(
      dpr * z, 0, 0, dpr * z,
      dpr * (-this.cam.x * z + shakeX),
      dpr * (-this.cam.y * z + shakeY)
    );
    const left = this.cam.x - 60;
    const right = this.cam.x + w / z + 60;
    const bottom = this.cam.y + h / z + 80;

    drawTerrain(ctx, this.terrain, theme, left, right, bottom, this.time);

    // ski tracks: two carved grooves with a bright lip, fading out behind
    if (this.trail.length > 1) {
      ctx.lineCap = 'round';
      const passes = [
        { dy: 0.5, width: 5, color: 'rgba(255,255,255,0.9)', alpha: 0.30 },
        { dy: 2.5, width: 2.4, color: 'rgba(120,155,195,1)', alpha: 0.45 },
        { dy: 6.0, width: 2.4, color: 'rgba(120,155,195,1)', alpha: 0.38 },
      ];
      // fade the tracks out in chunks: one stroke per chunk instead of one
      // per segment, which matters now that more of the trail is on screen
      const T = this.trail;
      const CHUNKS = 8;
      for (const pass of passes) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = pass.width;
        for (let c = 0; c < CHUNKS; c++) {
          const i0 = Math.floor((T.length - 1) * c / CHUNKS);
          const i1 = Math.floor((T.length - 1) * (c + 1) / CHUNKS);
          if (i1 <= i0) continue;
          ctx.globalAlpha = ((c + 1) / CHUNKS) * pass.alpha;
          ctx.beginPath();
          ctx.moveTo(T[i0].x, T[i0].y + pass.dy);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(T[i].x, T[i].y + pass.dy);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    for (const it of this.entities.items) {
      if (it.dead || it.x < left || it.x > right) continue;
      drawEntity(ctx, it, this.time, theme);
    }

    for (const d of this.debris) drawDebris(ctx, d);

    if (this.player.state !== 'dead' || !this.deathCaught) {
      const p = this.player;
      drawPlayerShadow(ctx, p, this.terrain, theme);

      // translucent afterimages once you're really flying
      const ghost = this.detail ? clamp((p.speed - 850) / 700, 0, 1) : 0;
      if (ghost > 0 && (p.state === 'ground' || p.state === 'air')) {
        const taps = [[8, 0.20], [5, 0.12], [2, 0.06]];
        for (const [back, alpha] of taps) {
          const pose = this.poses[this.poses.length - 1 - back];
          if (!pose) continue;
          ctx.globalAlpha = alpha * ghost;
          drawPlayer(ctx, pose, this.settings, this.time);
        }
        ctx.globalAlpha = 1;
      }

      drawPlayer(ctx, p, this.settings, this.time);
    }

    if (!this.demo) {
      drawAvalanche(ctx, this.avalanche, this.terrain, theme, left, this.time);
    }

    // particles: soft halo + brighter core so powder reads as puffs, not dots
    for (const pt of this.particles) {
      const a = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = a * 0.28;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floating texts
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp(f.life / 0.6, 0, 1);
      ctx.font = `800 ${f.size}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,25,50,0.55)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // --- screen space again: weather + warnings ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.settings.snowfall) {
      this.bg.drawSnowfall(ctx, w, h, dt, this.player ? this.player.vx : 0);
    }

    // faint speed streaks once you're really moving
    if (this.detail && !this.demo && this.player.speed > 1050 && this.state === 'playing') {
      const boost = clamp((this.player.speed - 1050) / 900, 0, 1);
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let k = 0; k < 7; k++) {
        const len = 80 + (k % 3) * 45;
        const sx = w - (((this.time * 1500 + k * 331) % (w + len + 120)) - len);
        const sy = h * (0.08 + ((k * 0.137) % 0.84));
        ctx.globalAlpha = 0.05 + boost * 0.06;
        ctx.lineWidth = 2 + (k % 2);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + len, sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // soft vignette to focus the action
    if (!this._vig || this._vigW !== w || this._vigH !== h) {
      this._vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      this._vig.addColorStop(0, 'rgba(10,20,45,0)');
      this._vig.addColorStop(1, 'rgba(10,20,45,0.24)');
      this._vigW = w;
      this._vigH = h;
    }
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, w, h);

    if (!this.demo && this.settings.hazardMarkers && (this.state === 'playing' || this.state === 'paused')) {
      this.drawHazardMarkers(ctx, w, h);
    }

    if (this.state === 'playing' && !this.demo) {
      const dist = this.avalanche.distanceTo(this.player);
      if (dist < 560) {
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 9);
        ctx.globalAlpha = pulse;
        ctx.font = '800 34px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ff5e4e';
        ctx.fillText('⚠', 18, h * 0.5);
        ctx.font = '700 15px "Trebuchet MS", sans-serif';
        ctx.fillText(`${Math.max(0, Math.floor(dist / PX_PER_M))} m`, 18, h * 0.5 + 24);
        ctx.globalAlpha = 1;
      }
    }
  }
}

export const game = new Game();
if (typeof window !== 'undefined') window.__game = game; // console/test access
