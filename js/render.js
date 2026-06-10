import { mulberry32, hash2, clamp } from './config.js';
import { MOUNTS } from './player.js';

export const THEMES = {
  day: {
    skyTop: '#7cc4ef', skyBot: '#dff2fd',
    ridgeFar: '#bcdcf0', ridgeNear: '#9cc6e4',
    snow: '#ffffff', snowDeep: '#d4e8f5', snowLine: '#ffffff',
    tree: '#2e6b4f', treeSnow: '#eef8ff',
    sun: '#fff6c9', stars: false,
    avalanche: '#f4fbff', avalancheShade: '#c2dcef',
  },
  sunset: {
    skyTop: '#3d2a63', skyBot: '#ff9d6e',
    ridgeFar: '#8d6a9e', ridgeNear: '#6d4f86',
    snow: '#ffe3d1', snowDeep: '#d8a8a0', snowLine: '#fff1e6',
    tree: '#3a3354', treeSnow: '#ffd9c4',
    sun: '#ffb45e', stars: false,
    avalanche: '#ffe9da', avalancheShade: '#d9a795',
  },
  night: {
    skyTop: '#060d24', skyBot: '#1c3257',
    ridgeFar: '#26395c', ridgeNear: '#1b2c4a',
    snow: '#bcd2ec', snowDeep: '#8aa6c9', snowLine: '#dcebff',
    tree: '#152a3a', treeSnow: '#bcd2ec',
    sun: '#f4f6ff', stars: true,
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
    // two parallax ridge polylines (heights in 0..1 of screen)
    this.ridges = [this.makeRidge(rng, 0.32), this.makeRidge(rng, 0.45)];
    this.flakes = Array.from({ length: 130 }, () => ({
      x: rng(), y: rng(), s: 1 + rng() * 2.2, w: rng() * Math.PI * 2,
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
    }

    // sun / moon
    ctx.fillStyle = theme.sun;
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.18, theme.stars ? 26 : 46, 0, Math.PI * 2);
    ctx.fill();
    if (!theme.stars) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.18, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawRidges(ctx, w, h, theme, camX, time) {
    const colors = [theme.ridgeFar, theme.ridgeNear];
    const factors = [0.07, 0.16];
    for (let r = 0; r < 2; r++) {
      const pts = this.ridges[r];
      const segW = 190 - r * 40;
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
        const y = (a * (1 - u) + b * u) * h + h * (0.18 + r * 0.16);
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
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

export function drawTerrain(ctx, terrain, theme, left, right, bottom) {
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

  // crisp snow line on top
  ctx.beginPath();
  for (let x = left; x <= right + step; x += step) {
    const y = terrain.groundY(x);
    if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = theme.snowLine;
  ctx.lineWidth = 5;
  ctx.stroke();

  drawTrees(ctx, terrain, theme, left, right);
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
  }
}

function drawRock(ctx, it) {
  const { x, y, r } = it;
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
  ctx.fillStyle = '#f5b81d';
  ctx.beginPath();
  ctx.ellipse(it.x, y, it.r * (0.35 + 0.65 * squash), it.r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.ellipse(it.x, y, it.r * (0.35 + 0.65 * squash) * 0.62, it.r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
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

export function drawPlayer(ctx, p, settings, time) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

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

// ----------------------------------------------------------------- avalanche

export function drawAvalanche(ctx, av, terrain, theme, camLeft, time) {
  const front = av.front;
  if (front < camLeft - 100) return;

  ctx.fillStyle = theme.avalanche;

  // solid mass behind the rolling front
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
