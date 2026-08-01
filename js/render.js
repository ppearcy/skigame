import { mulberry32, hash2, clamp } from './config.js';
import { MOUNTS } from './player.js';

// '#rrggbb' -> 'rgba(r,g,b,a)' for gradient stops
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const THEMES = {
  day: {
    skyTop: '#3f9ce4', skyMid: '#8ecdf4', skyBot: '#eef9ff',
    haze: 'rgba(255,255,255,0.55)',
    ridgeFar: '#d3e8f6', ridgeMid: '#b6d8ec', ridgeNear: '#97c4e1',
    snow: '#ffffff', snowDeep: '#cfe5f2', snowLine: '#ffffff',
    snowShadow: 'rgba(125,165,205,0.30)',
    tree: '#2e6b4f', treeSnow: '#eef8ff',
    sun: '#fff6c9', stars: false,
    avalanche: '#f4fbff', avalancheShade: '#c2dcef',
  },
  sunset: {
    skyTop: '#2c1b54', skyMid: '#a4467c', skyBot: '#ffb46e',
    haze: 'rgba(255,170,110,0.45)',
    ridgeFar: '#a576ab', ridgeMid: '#855c97', ridgeNear: '#634382',
    snow: '#ffe7d6', snowDeep: '#d8a8a0', snowLine: '#fff3e8',
    snowShadow: 'rgba(150,90,115,0.30)',
    tree: '#3a3354', treeSnow: '#ffdfca',
    sun: '#ffb45e', stars: false,
    avalanche: '#ffe9da', avalancheShade: '#d9a795',
  },
  night: {
    skyTop: '#04081c', skyMid: '#0d1d3f', skyBot: '#23406b',
    haze: 'rgba(120,160,220,0.28)',
    ridgeFar: '#2c4166', ridgeMid: '#213450', ridgeNear: '#172741',
    snow: '#c3d8ef', snowDeep: '#8aa6c9', snowLine: '#e2efff',
    snowShadow: 'rgba(40,70,120,0.35)',
    tree: '#152a3a', treeSnow: '#c3d8ef',
    sun: '#f4f6ff', stars: true,
    aurora: ['#46f0b0', '#5ab2ff', '#b07bff'],
    avalanche: '#d4e4f7', avalancheShade: '#93accc',
  },
};

// ---------------------------------------------------------------- background

export class Background {
  constructor(seed) {
    const rng = mulberry32(seed);
    this.stars = Array.from({ length: 90 }, () => ({
      x: rng(), y: rng() * 0.6, r: 0.6 + rng() * 1.4, tw: rng() * Math.PI * 2,
    }));
    this.clouds = Array.from({ length: 7 }, () => ({
      x: rng(), y: 0.08 + rng() * 0.3, s: 0.6 + rng() * 1.1, drift: 4 + rng() * 8,
    }));
    // three parallax ridge polylines (heights in 0..1 of screen)
    this.ridges = [
      this.makeRidge(rng, 0.30),
      this.makeRidge(rng, 0.38),
      this.makeRidge(rng, 0.46),
    ];
    this.flakes = Array.from({ length: 130 }, () => ({
      x: rng(), y: rng(), s: 1 + rng() * 2.2, w: rng() * Math.PI * 2,
    }));
    this.birds = Array.from({ length: 4 }, () => ({
      x: rng(), y: 0.1 + rng() * 0.22, s: 0.7 + rng() * 0.6,
      drift: 14 + rng() * 12, flap: rng() * Math.PI * 2,
    }));
  }

  makeRidge(rng, base) {
    const pts = [];
    let h = base;
    for (let i = 0; i < 64; i++) {
      h = clamp(h + (rng() - 0.5) * 0.16, base - 0.13, base + 0.13);
      pts.push(h);
    }
    return pts;
  }

  drawSky(ctx, w, h, theme, time) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.skyTop);
    g.addColorStop(0.55, theme.skyMid);
    g.addColorStop(1, theme.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (theme.stars) {
      ctx.fillStyle = '#dfe9ff';
      for (const s of this.stars) {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.7 + s.tw));
        ctx.globalAlpha = a;
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      this.drawAurora(ctx, w, h, theme, time);
      this.drawShootingStar(ctx, w, h, time);
    }

    // sun / moon with a smooth radial halo
    const sx = w * 0.78, sy = h * 0.18;
    const core = theme.stars ? 26 : 46;
    const breathe = 1 + 0.04 * Math.sin(time * 0.6);
    const halo = ctx.createRadialGradient(sx, sy, core * 0.5, sx, sy, core * 3.8 * breathe);
    halo.addColorStop(0, withAlpha(theme.sun, 0.55));
    halo.addColorStop(0.35, withAlpha(theme.sun, 0.18));
    halo.addColorStop(1, withAlpha(theme.sun, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sx, sy, core * 3.8 * breathe, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = theme.sun;
    ctx.beginPath(); ctx.arc(sx, sy, core, 0, Math.PI * 2); ctx.fill();
    if (theme.stars) {
      // moon craters
      ctx.fillStyle = 'rgba(150,170,205,0.45)';
      ctx.beginPath(); ctx.arc(sx - 8, sy - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 6, sy + 7, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 9, sy - 8, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // atmospheric haze toward the horizon
    const hz = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.75);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(1, theme.haze);
    ctx.fillStyle = hz;
    ctx.fillRect(0, h * 0.3, w, h * 0.45);
  }

  // occasional meteor streaking across the night sky
  drawShootingStar(ctx, w, h, time) {
    const period = 8.5;
    const cycle = Math.floor(time / period);
    const t = (time % period) / 0.8; // first 0.8s of each cycle
    if (t > 1) return;
    const h1 = hash2(0x5747, cycle), h2 = hash2(0x5748, cycle);
    if (h1 > 0.8) return; // some cycles stay quiet
    const x0 = (0.1 + h1 * 0.7) * w, y0 = (0.04 + h2 * 0.2) * h;
    const x = x0 + t * 300, y = y0 + t * 130;
    const fade = Math.sin(t * Math.PI);
    ctx.strokeStyle = `rgba(235,243,255,${0.85 * fade})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 70 * fade, y - 30 * fade);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  drawAurora(ctx, w, h, theme, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    theme.aurora.forEach((color, bi) => {
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 18) {
        const y = h * (0.13 + bi * 0.065)
          + Math.sin(x * 0.004 + time * (0.45 + bi * 0.16) + bi * 2.1) * 30
          + Math.sin(x * 0.011 - time * 0.6 + bi) * 13;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      const breathe = 0.17 + 0.06 * Math.sin(time * 0.8 + bi * 1.4);
      ctx.lineWidth = 30 + bi * 10;
      ctx.globalAlpha = breathe;
      ctx.stroke();
      ctx.lineWidth = (30 + bi * 10) * 2.3; // wide soft halo pass
      ctx.globalAlpha = breathe * 0.5;
      ctx.stroke();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawRidges(ctx, w, h, theme, camX, time) {
    const colors = [theme.ridgeFar, theme.ridgeMid, theme.ridgeNear];
    const factors = [0.05, 0.10, 0.17];
    for (let r = 0; r < 3; r++) {
      const pts = this.ridges[r];
      const segW = 210 - r * 45;
      const off = camX * factors[r];
      ctx.fillStyle = colors[r];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let sx = -segW; sx <= w + segW; sx += 8) {
        const world = sx + off;
        const f = world / segW;
        const i = Math.floor(f);
        const t = f - i;
        const u = 0.5 - Math.cos(t * Math.PI) * 0.5;
        const a = pts[((i % pts.length) + pts.length) % pts.length];
        const b = pts[(((i + 1) % pts.length) + pts.length) % pts.length];
        const y = (a * (1 - u) + b * u) * h + h * (0.14 + r * 0.12);
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      if (r < 2) {
        // veil of haze between layers for depth
        ctx.fillStyle = theme.haze;
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // distant birds gliding between the ridges (daytime themes only)
    if (!theme.stars) {
      ctx.strokeStyle = 'rgba(35,55,85,0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const b of this.birds) {
        const bx = ((b.x * w + time * b.drift - camX * 0.045) % (w + 120) + (w + 120)) % (w + 120) - 60;
        const by = b.y * h + Math.sin(time * 0.7 + b.flap) * 9;
        const wing = (0.5 + 0.5 * Math.sin(time * 6 + b.flap)) * 5 * b.s;
        ctx.beginPath();
        ctx.moveTo(bx - 7 * b.s, by - wing);
        ctx.quadraticCurveTo(bx, by + 2 * b.s, bx + 7 * b.s, by - wing);
        ctx.stroke();
      }
    }

    // clouds drift slowly in screen space
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const c of this.clouds) {
      const cx = ((c.x * w + time * c.drift - camX * 0.03) % (w + 260) + (w + 260)) % (w + 260) - 130;
      const cy = c.y * h;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 52 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 30 * c.s, cy - 9 * c.s, 32 * c.s, 13 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 34 * c.s, cy - 5 * c.s, 26 * c.s, 11 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawSnowfall(ctx, w, h, dt, windX) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const f of this.flakes) {
      f.y += (24 + f.s * 22) * dt / h;
      f.w += dt * 2;
      f.x += (Math.sin(f.w) * 14 - windX * (0.18 + f.s * 0.12)) * dt / w;
      if (f.y > 1) { f.y -= 1; f.x = Math.random(); }
      if (f.x < 0) f.x += 1;
      if (f.x > 1) f.x -= 1;
      ctx.globalAlpha = 0.35 + f.s * 0.2;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------- terrain

export function drawTerrain(ctx, terrain, theme, left, right, bottom, time) {
  const step = 14;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  for (let x = left; x <= right + step; x += step) {
    ctx.lineTo(x, terrain.groundY(x));
  }
  ctx.lineTo(right + step, bottom);
  ctx.closePath();

  const gTop = terrain.groundY((left + right) / 2);
  const g = ctx.createLinearGradient(0, gTop, 0, gTop + 600);
  g.addColorStop(0, theme.snow);
  g.addColorStop(1, theme.snowDeep);
  ctx.fillStyle = g;
  ctx.fill();

  // soft shading just under the surface gives the snowpack depth
  ctx.beginPath();
  for (let x = left; x <= right + step; x += step) {
    const y = terrain.groundY(x) + 9;
    if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = theme.snowShadow;
  ctx.lineWidth = 7;
  ctx.stroke();

  // crisp snow line on top
  ctx.beginPath();
  for (let x = left; x <= right + step; x += step) {
    const y = terrain.groundY(x);
    if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = theme.snowLine;
  ctx.lineWidth = 5;
  ctx.stroke();

  // sun-facing sheen: uphill faces (sun sits up-right) catch a bright edge
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  for (let x = left; x <= right; x += step) {
    const y0 = terrain.groundY(x);
    const y1 = terrain.groundY(x + step);
    const a = clamp(-((y1 - y0) / step) * 1.1 + 0.12, 0, 0.55);
    if (a < 0.05) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x, y0 - 1.5);
    ctx.lineTo(x + step, y1 - 1.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawSparkles(ctx, terrain, left, right, time);
  drawTrees(ctx, terrain, theme, left, right);
}

// glittering specks in the snowpack, twinkling on their own clocks
function drawSparkles(ctx, terrain, left, right, time) {
  const STEP = 85;
  const i0 = Math.floor(left / STEP);
  const i1 = Math.ceil(right / STEP);
  ctx.fillStyle = '#ffffff';
  for (let i = i0; i <= i1; i++) {
    const h = hash2(terrain.seed ^ 0x55aa, i);
    if (h > 0.62) continue;
    const x = i * STEP + h * 80;
    const depth = 10 + ((h * 1337) % 1) * 62;
    const tw = Math.sin(time * (1.5 + h * 2.2) + h * 40);
    if (tw < 0.3) continue;
    const a = (tw - 0.3) / 0.7;
    const y = terrain.groundY(x) + depth;
    const s = 1.1 + h * 1.7;
    ctx.globalAlpha = a * 0.85;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s * 2);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTrees(ctx, terrain, theme, left, right) {
  const seg = terrain.o1.seg;
  const i0 = Math.floor(left / seg) - 1;
  const i1 = Math.ceil(right / seg) + 1;
  for (let i = i0; i <= i1; i++) {
    const h = hash2(terrain.seed, i);
    if (h > 0.34) continue;
    const x = i * seg + (h * 977 % 1) * seg;
    const size = 26 + h * 80;
    const y = terrain.groundY(x) + 2;
    drawPine(ctx, x, y, size, theme);
  }
}

function drawPine(ctx, x, y, size, theme) {
  // grounding shadow
  ctx.fillStyle = theme.snowShadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, size * 0.5, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b4a35';
  ctx.fillRect(x - 2.5, y - size * 0.22, 5, size * 0.24);
  ctx.fillStyle = theme.tree;
  for (let t = 0; t < 3; t++) {
    const w = size * (0.55 - t * 0.13);
    const top = y - size * (0.34 + t * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, top - size * 0.18);
    ctx.lineTo(x - w, top + size * 0.22);
    ctx.lineTo(x + w, top + size * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  // snow cap
  ctx.fillStyle = theme.treeSnow;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 1.12);
  ctx.lineTo(x - size * 0.18, y - size * 0.86);
  ctx.lineTo(x + size * 0.18, y - size * 0.86);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------ entities

export function drawEntity(ctx, it, time, theme) {
  switch (it.type) {
    case 'rock': drawRock(ctx, it); break;
    case 'coin': drawCoin(ctx, it, time); break;
    case 'animal': drawAnimal(ctx, it, time); break;
    case 'sign': drawSign(ctx, it, time); break;
  }
}

// striped warning sign telegraphing a rock cluster ahead
function drawSign(ctx, it, time) {
  const { x, y } = it;
  ctx.fillStyle = '#5d4a37';
  ctx.fillRect(x - 2.5, y - 48, 5, 48);
  const wob = Math.sin(time * 2.4 + x * 0.01) * 0.04;
  ctx.save();
  ctx.translate(x, y - 60);
  ctx.rotate(Math.PI / 4 + wob);
  const s = 15;
  ctx.fillStyle = '#ffb52e';
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.strokeStyle = '#2b323c';
  ctx.lineWidth = 3;
  ctx.strokeRect(-s + 1.5, -s + 1.5, s * 2 - 3, s * 2 - 3);
  ctx.restore();
  ctx.fillStyle = '#2b323c';
  ctx.font = '800 20px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', x, y - 53);
  // snow cap
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(x, y - 76, 9, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(ctx, it) {
  const { x, y, r } = it;
  ctx.fillStyle = 'rgba(110,145,185,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.5, r * 1.25, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7e8b99';
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.5);
  ctx.lineTo(x - r * 0.55, y - r * 0.75 - it.variant * 6);
  ctx.lineTo(x + r * 0.15, y - r);
  ctx.lineTo(x + r * 0.9, y - r * 0.35);
  ctx.lineTo(x + r, y + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a6b3c0';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y - r * 0.75 - it.variant * 6);
  ctx.lineTo(x + r * 0.15, y - r);
  ctx.lineTo(x + r * 0.2, y - r * 0.3);
  ctx.lineTo(x - r * 0.3, y - r * 0.2);
  ctx.closePath();
  ctx.fill();
  // snow dusting
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.1, y - r * 0.92, r * 0.42, r * 0.16, -0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(ctx, it, time) {
  const y = it.y + (it.bob || 0);
  const squash = Math.abs(Math.sin(time * 3 + it.phase)); // fake spin

  // warm glow so coins read from a distance
  const pulse = 0.2 + 0.08 * Math.sin(time * 3 + it.phase);
  const glow = ctx.createRadialGradient(it.x, y, it.r * 0.3, it.x, y, it.r * 2.4);
  glow.addColorStop(0, `rgba(255,214,90,${pulse})`);
  glow.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(it.x, y, it.r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f5b81d';
  ctx.beginPath();
  ctx.ellipse(it.x, y, it.r * (0.35 + 0.65 * squash), it.r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.ellipse(it.x, y, it.r * (0.35 + 0.65 * squash) * 0.62, it.r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  // passing glint
  const g = Math.sin(time * 1.7 + it.phase * 1.3);
  if (g > 0.55) {
    const a = (g - 0.55) / 0.45;
    const gx = it.x - it.r * 0.35, gy = y - it.r * 0.45, s = 4.5;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(time * 1.2);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
    ctx.moveTo(0, -s); ctx.lineTo(0, s);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawAnimal(ctx, it, time) {
  const bob = Math.sin(time * 5 + it.phase) * 2;
  ctx.save();
  ctx.translate(it.x, it.y + bob);
  switch (it.kind) {
    case 'penguin': drawPenguin(ctx, time); break;
    case 'yeti': drawYeti(ctx, time); break;
    case 'snowmobile': drawSnowmobile(ctx, time, true); break;
  }
  ctx.restore();
}

export function drawPenguin(ctx, time) {
  // body
  ctx.fillStyle = '#22303e';
  ctx.beginPath();
  ctx.ellipse(0, -20, 14, 20, 0.12, 0, Math.PI * 2);
  ctx.fill();
  // belly
  ctx.fillStyle = '#f4f8fb';
  ctx.beginPath();
  ctx.ellipse(3, -17, 8.5, 14, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // beak + feet
  ctx.fillStyle = '#f59e2d';
  ctx.beginPath();
  ctx.moveTo(11, -32); ctx.lineTo(20, -29); ctx.lineTo(11, -26);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(-6, -3, 8, 3.5);
  ctx.fillRect(3, -3, 8, 3.5);
  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(8, -33, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(9, -33, 1.6, 0, Math.PI * 2); ctx.fill();
  // flipper
  ctx.fillStyle = '#22303e';
  ctx.save();
  ctx.translate(-2, -20);
  ctx.rotate(Math.sin(time * 9) * 0.3 + 0.5);
  ctx.beginPath();
  ctx.ellipse(0, 6, 4, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawYeti(ctx, time) {
  const run = Math.sin(time * 10);
  // legs
  ctx.strokeStyle = '#dde9f5';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -26); ctx.lineTo(-9 + run * 5, -2);
  ctx.moveTo(8, -26); ctx.lineTo(11 - run * 5, -2);
  ctx.stroke();
  // body
  ctx.fillStyle = '#eef5fc';
  ctx.beginPath();
  ctx.ellipse(0, -34, 19, 23, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // face
  ctx.fillStyle = '#9fb6cc';
  ctx.beginPath();
  ctx.ellipse(9, -42, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(7, -44, 2.6, 0, Math.PI * 2); ctx.arc(13, -44, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b2735';
  ctx.beginPath(); ctx.arc(8, -44, 1.3, 0, Math.PI * 2); ctx.arc(14, -44, 1.3, 0, Math.PI * 2); ctx.fill();
  // horns
  ctx.fillStyle = '#cfd8e2';
  ctx.beginPath(); ctx.moveTo(-2, -52); ctx.lineTo(-7, -60); ctx.lineTo(2, -54); ctx.closePath(); ctx.fill();
  // arm
  ctx.strokeStyle = '#eef5fc';
  ctx.beginPath();
  ctx.moveTo(-4, -38); ctx.lineTo(-16, -28 + run * 4);
  ctx.stroke();
}

export function drawSnowmobile(ctx, time, idle) {
  // track
  ctx.fillStyle = '#2b3440';
  ctx.beginPath();
  ctx.roundRect(-26, -10, 40, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#4a5563';
  for (let k = 0; k < 5; k++) {
    const off = ((time * (idle ? 0 : 90)) % 8);
    ctx.fillRect(-23 + k * 8 + off * 0.5, -9, 3, 8);
  }
  // body
  ctx.fillStyle = '#d8342c';
  ctx.beginPath();
  ctx.moveTo(-24, -10);
  ctx.lineTo(-18, -24);
  ctx.lineTo(8, -24);
  ctx.lineTo(26, -13);
  ctx.lineTo(26, -8);
  ctx.lineTo(14, -6);
  ctx.closePath();
  ctx.fill();
  // windshield + handlebar
  ctx.strokeStyle = '#bcd9ee';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(8, -24); ctx.lineTo(13, -33); ctx.stroke();
  ctx.strokeStyle = '#2b3440';
  ctx.beginPath(); ctx.moveTo(4, -24); ctx.lineTo(0, -31); ctx.stroke();
  // front ski
  ctx.strokeStyle = '#f0a13a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(18, -2); ctx.lineTo(34, -4); ctx.stroke();
}

// -------------------------------------------------------------------- player

// soft contact shadow on the snow below the skier; shrinks and fades with
// height so airs read clearly against the white slope
export function drawPlayerShadow(ctx, p, terrain, theme) {
  const gy = terrain.groundY(p.x);
  const height = clamp(gy - p.y, 0, 480);
  const sc = 1 - height / 560;
  ctx.fillStyle = theme.snowShadow;
  ctx.globalAlpha = 0.35 + 0.45 * sc;
  ctx.beginPath();
  ctx.ellipse(p.x, gy + 3, 12 + 24 * sc, 2.5 + 4.5 * sc, Math.atan(terrain.slopeAt(p.x)), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawPlayer(ctx, p, settings, time) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  if (p.grace > 0) ctx.globalAlpha = 0.55 + 0.4 * Math.sin(time * 22); // blink

  if (p.mount) {
    switch (p.mount) {
      case 'penguin': drawPenguin(ctx, time); break;
      case 'yeti': drawYeti(ctx, time); break;
      case 'snowmobile': drawSnowmobile(ctx, time, false); break;
    }
    ctx.translate(0, -MOUNTS[p.mount].height);
  }

  drawSkier(ctx, settings, p, time);
  ctx.restore();
}

function drawSkier(ctx, s, p, time) {
  if (p.state === 'crash') {
    drawCrashedSkier(ctx, s, time);
    return;
  }
  const crouch = p.state === 'air' ? 2 : 0;
  const onSkis = !p.mount || p.mount === 'penguin' || p.mount === 'yeti';

  if (onSkis && !p.mount) {
    // skis
    ctx.strokeStyle = s.skiColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-24, 0); ctx.lineTo(28, 0);
    ctx.moveTo(-18, 4); ctx.lineTo(33, 4);
    ctx.stroke();
    // curled tips
    ctx.beginPath();
    ctx.arc(28, -3, 3.5, Math.PI * 0.5, Math.PI * 1.6, true);
    ctx.arc(33, 1, 3.5, Math.PI * 0.5, Math.PI * 1.6, true);
    ctx.stroke();
  }

  // legs
  ctx.strokeStyle = '#27384c';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -1); ctx.lineTo(0, -13 + crouch);
  ctx.moveTo(6, -1); ctx.lineTo(2, -13 + crouch);
  ctx.stroke();

  // scarf, trailing behind
  const wave = Math.sin(time * 14) * 3;
  ctx.strokeStyle = s.scarfColor;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(8, -27 + crouch);
  ctx.quadraticCurveTo(-4, -28 + wave * 0.4, -16, -24 + wave);
  ctx.stroke();

  // body (leaning forward)
  ctx.strokeStyle = s.suitColor;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, -12 + crouch);
  ctx.lineTo(7, -25 + crouch);
  ctx.stroke();

  // arm + pole
  ctx.strokeStyle = s.suitColor;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(6, -22 + crouch); ctx.lineTo(13, -14 + crouch);
  ctx.stroke();
  ctx.strokeStyle = '#5a6b7d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(13, -14 + crouch); ctx.lineTo(7, 2);
  ctx.stroke();

  // head + helmet + goggles
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(11, -31 + crouch, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.suitColor;
  ctx.beginPath();
  ctx.arc(11, -32 + crouch, 5.8, Math.PI * 0.95, Math.PI * 2.02);
  ctx.fill();
  ctx.fillStyle = '#243447';
  ctx.fillRect(11, -33 + crouch, 6.5, 3.4);
}

// ragdoll pose: limbs flailing, skis gone (they fly off as debris)
function drawCrashedSkier(ctx, s, time) {
  const flail = Math.sin(time * 26);
  ctx.lineCap = 'round';

  // legs kicked out at different angles
  ctx.strokeStyle = '#27384c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-1, -10); ctx.lineTo(-13, -2 + flail * 3);
  ctx.moveTo(1, -10); ctx.lineTo(12, 0 - flail * 3);
  ctx.stroke();

  // body horizontal-ish
  ctx.strokeStyle = s.suitColor;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-4, -12); ctx.lineTo(8, -18);
  ctx.stroke();

  // arms thrown wide
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(-11, -24 + flail * 2);
  ctx.moveTo(5, -17); ctx.lineTo(15, -26 - flail * 2);
  ctx.stroke();

  // scarf whipping around
  ctx.strokeStyle = s.scarfColor;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(10, -20);
  ctx.quadraticCurveTo(2 + flail * 3, -30, -8 + flail * 5, -27);
  ctx.stroke();

  // head
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(12, -21, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.suitColor;
  ctx.beginPath();
  ctx.arc(12, -22, 5.8, Math.PI * 0.9, Math.PI * 1.97);
  ctx.fill();
}

// loose skis tumbling away after a crash
export function drawDebris(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.rot);
  ctx.globalAlpha = Math.min(d.life / 0.5, 1);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-d.len / 2, 0);
  ctx.lineTo(d.len / 2, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ----------------------------------------------------------------- avalanche

export function drawAvalanche(ctx, av, terrain, theme, camLeft, time) {
  const front = av.front;
  if (front < camLeft - 100) return;

  // solid mass behind the rolling front, shaded darker toward its base
  const gyF = terrain.groundY(front);
  const body = ctx.createLinearGradient(0, gyF - 420, 0, gyF + 60);
  body.addColorStop(0, theme.avalanche);
  body.addColorStop(0.75, theme.avalanche);
  body.addColorStop(1, theme.avalancheShade);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(camLeft - 200, terrain.groundY(camLeft - 200) - 900);
  for (let x = camLeft - 200; x <= front; x += 40) {
    const n = Math.sin(x * 0.02 + time * 6) * 14 + Math.sin(x * 0.013 - time * 4) * 10;
    ctx.lineTo(x, terrain.groundY(x) - 95 - n - (front - x) * 0.06);
  }
  ctx.lineTo(front, terrain.groundY(front) + 50);
  ctx.lineTo(camLeft - 200, terrain.groundY(camLeft - 200) + 400);
  ctx.closePath();
  ctx.fill();

  // rolling puffs along the leading edge
  for (let k = 0; k < 14; k++) {
    const x = front - k * 46;
    if (x < camLeft - 150) break;
    const gy = terrain.groundY(x);
    const wob = Math.sin(time * 7 + k * 1.7);
    const r = 42 + k * 5 + wob * 7;
    ctx.fillStyle = k % 2 ? theme.avalancheShade : theme.avalanche;
    ctx.beginPath();
    ctx.arc(x, gy - 30 - k * 6 - wob * 8, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.avalanche;
    ctx.beginPath();
    ctx.arc(x - 14, gy - 75 - k * 7 + wob * 10, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  // dark chunks of packed snow tumbling inside the front
  ctx.fillStyle = theme.avalancheShade;
  for (let k = 0; k < 7; k++) {
    const ph = time * 4.5 + k * 1.31;
    const x = front - 24 - (k * 67) % 300;
    if (x < camLeft - 150) continue;
    const gy = terrain.groundY(x);
    const yy = gy - 36 - Math.abs(Math.sin(ph)) * 75 - k * 4;
    const s = 5 + (k % 3) * 3;
    ctx.save();
    ctx.translate(x, yy);
    ctx.rotate(ph * 1.6);
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }

  // spray flung ahead of the front
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let k = 0; k < 8; k++) {
    const ph = time * 9 + k * 2.4;
    const x = front + 20 + (ph % 3) * 30 + k * 12;
    const gy = terrain.groundY(x);
    ctx.beginPath();
    ctx.arc(x, gy - 20 - Math.abs(Math.sin(ph)) * 60, 4 + (k % 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
