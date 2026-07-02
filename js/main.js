import { loadSettings, loadBest, saveBest, clamp, lerp } from './config.js';
import { Terrain } from './terrain.js';
import { Player, MOUNTS } from './player.js';
import { Entities } from './entities.js';
import { Avalanche } from './avalanche.js';
import { Background, THEMES, drawTerrain, drawEntity, drawPlayer, drawPlayerShadow, drawAvalanche, drawDebris } from './render.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

const PX_PER_M = 40;

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

    // adaptive resolution: starts at the device cap, steps down if the
    // frame time stays high so weaker phones keep a smooth frame rate
    this.dprCap = 2;
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
    this.rings = []; // expanding shockwave rings (perfect landings, pickups)
    this.poses = []; // recent player poses, for the high-speed ghost trail
    this.power = null;        // active timed power-up: { kind, t }
    this.nextMilestone = 500; // next distance celebration (m)
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

    // sustained slow frames -> drop render resolution one notch
    this.frameAvg += (clamp(rawMs, 0, 100) - this.frameAvg) * 0.04;
    if (++this.perfCheck >= 150) {
      this.perfCheck = 0;
      if (this.frameAvg > 26 && this.dprCap > 1) {
        this.dprCap = Math.max(1, this.dprCap - 0.5);
        this.frameAvg = 16;
        this.resize();
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

      // timed power-up ticks down
      if (this.power) {
        this.power.t -= dt;
        if (this.power.t <= 0) this.power = null;
      }
      // magnet: nearby coins swarm toward the skier
      if (this.power?.kind === 'magnet') {
        for (const it of this.entities.items) {
          if (it.type !== 'coin' || it.dead) continue;
          const dx = p.cx - it.x, dy = p.cy - it.y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < 380) {
            const pull = (500 + (380 - d) * 4.5) * dt / d;
            it.x += dx * pull;
            it.y += dy * pull;
          }
        }
      }
      // distance milestones deserve a little party
      if (p.x / PX_PER_M >= this.nextMilestone) {
        this.float(p.x, p.y - 115, `${this.nextMilestone} m!`, '#b0e8ff', 22);
        this.ring(p.x, p.y - 40, '#b0e8ff');
        this.sound.milestone();
        this.nextMilestone += 500;
      }
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
      // snowmobile chugs out little exhaust puffs
      if (p.mount === 'snowmobile' && Math.random() < 0.45) {
        this.particles.push({
          x: p.x - 30, y: p.y - 8,
          vx: -p.vx * 0.15 + (Math.random() - 0.5) * 40,
          vy: -30 - Math.random() * 50,
          life: 0.5 + Math.random() * 0.3, maxLife: 0.8,
          size: 3 + Math.random() * 3, color: '#9aa7b5', grav: -60,
        });
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

    // rocket flame streaming behind the skier
    if (p.boostTimer > 0 && (p.state === 'ground' || p.state === 'air')) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x: p.x - 14 + (Math.random() - 0.5) * 8,
          y: p.y - 14 + (Math.random() - 0.5) * 10,
          vx: -p.vx * 0.35 + (Math.random() - 0.5) * 70,
          vy: (Math.random() - 0.5) * 90,
          life: 0.28 + Math.random() * 0.14, maxLife: 0.42,
          size: 2.5 + Math.random() * 3.5,
          color: Math.random() < 0.5 ? '#ffb03a' : '#ff5e3a', grav: -120,
        });
      }
    }

    this.updateFx(dt);
    this.updateCamera(dt);

    if (!this.demo) {
      this.ui.updateHUD(p.x / PX_PER_M, this.coins, this.score, p.mount, p.combo, this.powerLabel());
    }
  }

  // short status string for the HUD power-up slot
  powerLabel() {
    const p = this.player;
    let txt = '';
    if (p.shield) txt += '🛡 ';
    if (this.power) {
      txt += `${this.power.kind === 'magnet' ? '🧲' : '🚀'} ${Math.ceil(this.power.t)}s`;
    }
    return txt.trim();
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
          if (ev.perfect) {
            const pts = 50;
            this.trickScore += pts;
            this.float(p.x, p.y - 52, `PERFECT! +${pts}`, '#7ef2c0', 15);
            this.ring(p.x, p.y - 8, '#7ef2c0');
            this.sound.perfect();
          }
          break;
        case 'ramp':
          this.sound.ramp();
          this.buzz(10);
          this.burst(p.x, p.y + 6, 10, '#ffffff', 220);
          this.float(p.x, p.y - 62, 'BIG AIR!', '#ffd75e', 15);
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

      // skiing across a kicker's lip fires the launch (no circle test)
      if (it.type === 'ramp') {
        if (!it.used && p.state === 'ground' && px >= it.x - 10 && px <= it.x + 60) {
          it.used = true;
          p.launchRamp();
        }
        continue;
      }

      const dy = (it.y + (it.bob || 0)) - py;
      const rr = it.r + 24;
      if (dx * dx + dy * dy > rr * rr) {
        // dodging a rock by a hair pays out once it's safely behind you
        if (it.type === 'rock' && !it.passed && px > it.x + 12) {
          it.passed = true;
          if (p.state !== 'crash' && p.grace <= 0) {
            const clear = Math.hypot(px - it.x, py - (it.y - it.r));
            if (clear < 130) {
              this.trickScore += 25;
              this.float(it.x, it.y - it.r - 34, 'CLOSE! +25', '#ffb0d8', 13);
            }
          }
        }
        continue;
      }

      if (it.type === 'coin') {
        it.dead = true;
        this.coins++;
        this.sound.coin();
        this.burst(it.x, it.y, 6, '#ffd75e', 150);
      } else if (it.type === 'powerup') {
        if (p.state === 'crash') continue;
        it.dead = true;
        this.collectPowerup(it);
      } else if (it.type === 'rock') {
        if (p.state === 'crash' || p.grace > 0) continue;
        it.dead = true;
        if (p.mount === 'yeti' || p.boostTimer > 0) {
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
        } else if (p.shield) {
          p.shield = false;
          this.sound.smash();
          this.shake = Math.max(this.shake, 6);
          this.float(it.x, it.y - 50, 'SHIELD!', '#7ee8f2', 16);
          this.burst(it.x, it.y - 10, 16, '#7ee8f2', 340);
          this.ring(p.x, p.y - 16, '#7ee8f2');
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

  collectPowerup(it) {
    const p = this.player;
    switch (it.kind) {
      case 'magnet':
        this.power = { kind: 'magnet', t: 7 };
        this.float(p.x, p.y - 70, '🧲 MAGNET!', '#6fc3ff', 17);
        break;
      case 'shield':
        p.shield = true;
        this.float(p.x, p.y - 70, '🛡 SHIELD!', '#7ee8f2', 17);
        break;
      case 'rocket':
        p.boostTimer = 4.5;
        this.power = { kind: 'rocket', t: 4.5 };
        this.float(p.x, p.y - 70, '🚀 ROCKET!', '#ffb03a', 17);
        break;
    }
    this.sound.powerup();
    this.buzz(12);
    this.ring(it.x, it.y, '#ffffff');
    this.burst(it.x, it.y, 12, '#ffffff', 240);
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

    for (const r of this.rings) {
      r.life -= dt;
      r.r += 320 * dt;
    }
    this.rings = this.rings.filter(r => r.life > 0);

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

  updateCamera(dt) {
    const p = this.player;
    const targetZoom = clamp(1.06 - p.speed * 0.00021, 0.8, 1.0);
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, 1 - Math.exp(-2.2 * dt));
    const z = this.cam.zoom;
    const tx = p.x - (this.w / z) * 0.34;
    const ty = p.y - (this.h / z) * 0.52;
    this.cam.x = tx; // horizontal follow is exact to avoid speed wobble
    this.cam.y = lerp(this.cam.y, ty, 1 - Math.exp(-5.5 * dt));
    const maxOff = (this.h / z) * 0.22;
    this.cam.y = clamp(this.cam.y, ty - maxOff, ty + maxOff);
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

  ring(x, y, color) {
    this.rings.push({ x, y, color, r: 12, life: 0.45 });
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

    // ski trail, fading out behind the skier
    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(140,170,200,1)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        ctx.globalAlpha = (i / this.trail.length) * 0.4;
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
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
      const ghost = clamp((p.speed - 850) / 700, 0, 1);
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

      // shield bubble hugging the skier
      if (p.shield) {
        const pulse = 0.35 + 0.15 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(126,232,242,${pulse + 0.25})`;
        ctx.fillStyle = `rgba(126,232,242,${pulse * 0.25})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 36 + Math.sin(this.time * 4) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // magnet field shimmer
      if (this.power?.kind === 'magnet') {
        const a = 0.22 + 0.1 * Math.sin(this.time * 8);
        ctx.strokeStyle = `rgba(111,195,255,${a})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 2; k++) {
          const rr = 48 + k * 22 + Math.sin(this.time * 5 + k * 2) * 5;
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    if (!this.demo) {
      drawAvalanche(ctx, this.avalanche, this.terrain, theme, left, this.time);
    }

    // expanding celebration rings
    for (const r of this.rings) {
      ctx.globalAlpha = clamp(r.life / 0.45, 0, 1) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // particles
    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
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
    if (!this.demo && this.player.speed > 1050 && this.state === 'playing') {
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
