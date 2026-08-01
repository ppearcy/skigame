import { mulberry32, hash2, clamp } from './config.js';
import { MOUNTS } from './player.js';

// Detail level, driven by the game loop's frame-time watchdog. A wider camera
// means more world on screen every frame, so devices that can't keep up drop
// the decorative passes (drift lines, sparkles, god rays, ridge treeline)
// before they lose resolution or frame rate.
let DETAIL = 1;
export function setDetail(level) { DETAIL = level; }

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
    ridgeSnowCap: '#f4fbff',
    bankTree: '#5d8ba4',
    snow: '#ffffff', snowDeep: '#cfe5f2', snowLine: '#ffffff',
    snowShadow: 'rgba(125,165,205,0.30)',
    snowTint: 'rgba(150,190,225,0.55)',
    tree: '#2e6b4f', treeDark: '#1d4c37', treeSnow: '#eef8ff',
    sun: '#fff6c9', rays: 'rgba(255,246,201,0.16)', stars: false,
    cloud: '#ffffff', cloudShade: '#d3e7f7', cloudAlpha: 0.72,
    avalanche: '#f4fbff', avalancheShade: '#c2dcef',
  },
  sunset: {
    skyTop: '#2c1b54', skyMid: '#a4467c', skyBot: '#ffb46e',
    haze: 'rgba(255,170,110,0.45)',
    ridgeFar: '#a576ab', ridgeMid: '#855c97', ridgeNear: '#634382',
    ridgeSnowCap: '#ffd9b8',
    bankTree: '#5c4272',
    snow: '#ffe7d6', snowDeep: '#d8a8a0', snowLine: '#fff3e8',
    snowShadow: 'rgba(150,90,115,0.30)',
    snowTint: 'rgba(190,110,120,0.45)',
    tree: '#3a3354', treeDark: '#2a2440', treeSnow: '#ffdfca',
    sun: '#ffb45e', rays: 'rgba(255,180,94,0.20)', stars: false,
    cloud: '#ffd7bb', cloudShade: '#c98d94', cloudAlpha: 0.6,
    avalanche: '#ffe9da', avalancheShade: '#d9a795',
  },
  night: {
    skyTop: '#04081c', skyMid: '#0d1d3f', skyBot: '#23406b',
    haze: 'rgba(120,160,220,0.28)',
    ridgeFar: '#2c4166', ridgeMid: '#213450', ridgeNear: '#172741',
    ridgeSnowCap: '#5f7ba6',
    bankTree: '#14243c',
    snow: '#c3d8ef', snowDeep: '#8aa6c9', snowLine: '#e2efff',
    snowShadow: 'rgba(40,70,120,0.35)',
    snowTint: 'rgba(60,100,165,0.5)',
    tree: '#152a3a', treeDark: '#0e1e2c', treeSnow: '#c3d8ef',
    sun: '#f4f6ff', rays: 'rgba(200,220,255,0.10)', stars: true,
    cloud: '#33456d', cloudShade: '#20304f', cloudAlpha: 0.4,
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
    // three parallax ridge polylines (heights in 0..1 of screen); the far
    // layer gets the most relief so the horizon reads as peaks, not plateaus
    this.ridges = [
      this.makeRidge(rng, 0.30, 0.19),
      this.makeRidge(rng, 0.38, 0.15),
      this.makeRidge(rng, 0.46, 0.11),
    ];
    // silhouetted conifers along the nearest ridge, closing the depth gap
    // between the far peaks and the slope you're actually skiing
    this.ridgeTrees = Array.from({ length: 60 }, () => ({
      t: rng(), size: 0.55 + rng() * 0.8, lean: (rng() - 0.5) * 0.18,
    }));
    this.flakes = Array.from({ length: 130 }, () => ({
      x: rng(), y: rng(), s: 1 + rng() * 2.2, w: rng() * Math.PI * 2,
    }));
    this.birds = Array.from({ length: 4 }, () => ({
      x: rng(), y: 0.1 + rng() * 0.22, s: 0.7 + rng() * 0.6,
      drift: 14 + rng() * 12, flap: rng() * Math.PI * 2,
    }));
  }

  makeRidge(rng, base, amp = 0.13) {
    const pts = [];
    let h = base;
    for (let i = 0; i < 64; i++) {
      h = clamp(h + (rng() - 0.5) * amp * 1.7, base - amp, base + amp);
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

    if (DETAIL) this.drawSunRays(ctx, w, h, theme, sx, sy, time);

    // atmospheric haze toward the horizon
    const hz = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.75);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(1, theme.haze);
    ctx.fillStyle = hz;
    ctx.fillRect(0, h * 0.3, w, h * 0.45);
  }

  // slow god-rays fanning out of the sun, breathing in and out. The wedges
  // are filled through a radial fade so they dissolve instead of ending in a
  // hard edge halfway across the sky.
  drawSunRays(ctx, w, h, theme, sx, sy, time) {
    const reach = Math.hypot(w, h) * 0.6;
    const fade = ctx.createRadialGradient(sx, sy, 0, sx, sy, reach);
    fade.addColorStop(0, theme.rays);
    fade.addColorStop(0.4, theme.rays);
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(time * 0.045);
    ctx.translate(-sx, -sy);
    ctx.fillStyle = fade;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const spread = 0.05 + 0.03 * Math.sin(time * 0.5 + k * 1.7);
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 0.35 + k);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - spread) * reach, sy + Math.sin(a - spread) * reach);
      ctx.lineTo(sx + Math.cos(a + spread) * reach, sy + Math.sin(a + spread) * reach);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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

  // sample one of the looping ridge polylines at a screen x
  ridgeY(pts, sx, off, segW, h, base) {
    const f = (sx + off) / segW;
    const i = Math.floor(f);
    const u = 0.5 - Math.cos((f - i) * Math.PI) * 0.5;
    const a = pts[((i % pts.length) + pts.length) % pts.length];
    const b = pts[(((i + 1) % pts.length) + pts.length) % pts.length];
    return (a * (1 - u) + b * u) * h + h * base;
  }

  // dark conifer silhouettes standing on the crest of the nearest ridge
  drawRidgeTrees(ctx, w, h, theme, camX) {
    const pts = this.ridges[2];
    const segW = 120, off = camX * 0.17, base = 0.38;
    const span = w + 160;
    ctx.fillStyle = theme.bankTree;
    for (const t of this.ridgeTrees) {
      const sx = ((t.t * span - camX * 0.17) % span + span) % span - 80;
      const y = this.ridgeY(pts, sx, off, segW, h, base) + 3;
      const s = 12 + t.size * 20;
      ctx.beginPath();
      ctx.moveTo(sx + t.lean * s, y - s);
      ctx.lineTo(sx - s * 0.32, y);
      ctx.lineTo(sx + s * 0.32, y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx + t.lean * s * 0.6, y - s * 0.62);
      ctx.lineTo(sx - s * 0.42, y + s * 0.16);
      ctx.lineTo(sx + s * 0.42, y + s * 0.16);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawRidges(ctx, w, h, theme, camX, time) {
    const colors = [theme.ridgeFar, theme.ridgeMid, theme.ridgeNear];
    const factors = [0.05, 0.10, 0.17];
    for (let r = 0; r < 3; r++) {
      const pts = this.ridges[r];
      const segW = 210 - r * 45;
      const off = camX * factors[r];
      const base = 0.14 + r * 0.12;

      ctx.fillStyle = colors[r];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let sx = -segW; sx <= w + segW; sx += 8) {
        ctx.lineTo(sx, this.ridgeY(pts, sx, off, segW, h, base));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // A sunlit band hugging the crest, then a bright snow cap on the line
      // itself. Two strokes give the layer volume for a fraction of what a
      // gradient across the whole polygon costs to rasterise.
      ctx.beginPath();
      for (let sx = -8; sx <= w + 8; sx += 8) {
        const y = this.ridgeY(pts, sx, off, segW, h, base);
        if (sx === -8) ctx.moveTo(sx, y + 22); else ctx.lineTo(sx, y + 22);
      }
      ctx.strokeStyle = theme.ridgeSnowCap;
      ctx.globalAlpha = 0.22 - r * 0.05;
      ctx.lineWidth = 44;
      ctx.stroke();

      ctx.globalAlpha = 0.75 - r * 0.18;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let sx = -8; sx <= w + 8; sx += 8) {
        const y = this.ridgeY(pts, sx, off, segW, h, base);
        if (sx === -8) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (r < 2) {
        // veil of haze between layers for depth
        ctx.fillStyle = theme.haze;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let sx = -segW; sx <= w + segW; sx += 8) {
          ctx.lineTo(sx, this.ridgeY(pts, sx, off, segW, h, base));
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    if (DETAIL) this.drawRidgeTrees(ctx, w, h, theme, camX);

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

    // clouds drift slowly in screen space: a shaded underbelly first, then
    // the lit body stacked on top, so they have some body instead of reading
    // as flat blobs
    for (const c of this.clouds) {
      const cx = ((c.x * w + time * c.drift - camX * 0.03) % (w + 260) + (w + 260)) % (w + 260) - 130;
      const cy = c.y * h;
      const puffs = [
        [0, 0, 50, 17], [30, -10, 33, 14], [-34, -5, 27, 12],
        [12, -19, 24, 12], [-14, -16, 20, 10],
      ];
      // one path, one gradient fill: overlapping ellipses drawn separately
      // leave hard seams where the shaded layer shows through
      const cg = ctx.createLinearGradient(0, cy - 32 * c.s, 0, cy + 20 * c.s);
      cg.addColorStop(0, theme.cloud);
      cg.addColorStop(1, theme.cloudShade);
      ctx.globalAlpha = theme.cloudAlpha;
      ctx.fillStyle = cg;
      ctx.beginPath();
      for (const [dx, dy, rx, ry] of puffs) {
        ctx.ellipse(cx + dx * c.s, cy + dy * c.s, rx * c.s, ry * c.s, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

// Slope-lit passes quantise their alpha into a handful of levels so each
// level can be stroked as one path. Per-segment strokes were the single most
// expensive thing on screen once the camera pulled back and doubled the
// number of visible segments.
const SHADE_LEVELS = 5;

function strokeByAlpha(ctx, xs, ys, dy, alphaAt, maxAlpha) {
  const n = xs.length;
  for (let level = 1; level <= SHADE_LEVELS; level++) {
    const lo = maxAlpha * (level - 1) / SHADE_LEVELS;
    const hi = maxAlpha * level / SHADE_LEVELS;
    ctx.globalAlpha = (lo + hi) / 2;
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < n - 1; i++) {
      const a = alphaAt(i);
      if (a < lo || a >= hi) { open = false; continue; }
      if (!open) { ctx.moveTo(xs[i], ys[i] + dy); open = true; }
      ctx.lineTo(xs[i + 1], ys[i + 1] + dy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawTerrain(ctx, terrain, theme, left, right, bottom, time) {
  const step = 14;
  // sample the surface once and reuse it for every pass below
  const n = Math.ceil((right + step - left) / step) + 1;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = left + i * step;
    ys[i] = terrain.groundY(xs[i]);
  }

  ctx.beginPath();
  ctx.moveTo(left, bottom);
  for (let i = 0; i < n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.lineTo(xs[n - 1], bottom);
  ctx.closePath();

  const gTop = ys[n >> 1];
  const g = ctx.createLinearGradient(0, gTop - 40, 0, gTop + 700);
  g.addColorStop(0, theme.snow);
  g.addColorStop(0.22, theme.snow);
  g.addColorStop(1, theme.snowDeep);
  ctx.fillStyle = g;
  ctx.fill();

  // soft shading just under the surface gives the snowpack depth
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (i === 0) ctx.moveTo(xs[i], ys[i] + 9); else ctx.lineTo(xs[i], ys[i] + 9);
  }
  ctx.strokeStyle = theme.snowShadow;
  ctx.lineWidth = 7;
  ctx.stroke();

  if (DETAIL) drawWindDrift(ctx, theme, xs, ys);

  // crisp snow line on top
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (i === 0) ctx.moveTo(xs[i], ys[i]); else ctx.lineTo(xs[i], ys[i]);
  }
  ctx.strokeStyle = theme.snowLine;
  ctx.lineWidth = 5;
  ctx.stroke();

  // sun-facing sheen: uphill faces (sun sits up-right) catch a bright edge
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  strokeByAlpha(ctx, xs, ys, -1.5,
    i => clamp(-((ys[i + 1] - ys[i]) / step) * 1.1 + 0.12, 0, 0.55), 0.55);

  // lee faces — the ground rolling over a crest and dropping away — sit in
  // shadow. Without this a crest is invisible until you're launching off it.
  ctx.strokeStyle = theme.snowTint;
  ctx.lineWidth = 30;
  strokeByAlpha(ctx, xs, ys, 17,
    i => clamp(((ys[i + 1] - ys[i]) / step - terrain.slope) * 0.85, 0, 0.4), 0.4);

  if (DETAIL) drawSparkles(ctx, terrain, left, right, time);
  drawTrees(ctx, terrain, theme, left, right);
}

// wind-carved drift lines following the surface at a few depths, so the
// snowfield has grain instead of reading as one flat wash of white
function drawWindDrift(ctx, theme, xs, ys) {
  ctx.strokeStyle = theme.snowTint;
  ctx.lineCap = 'round';
  const bands = [
    { depth: 30, alpha: 0.22, width: 2.4, phase: 0.0 },
    { depth: 66, alpha: 0.17, width: 3.2, phase: 1.7 },
    { depth: 118, alpha: 0.13, width: 4.0, phase: 3.4 },
    { depth: 190, alpha: 0.10, width: 5.0, phase: 5.1 },
  ];
  for (const band of bands) {
    ctx.globalAlpha = band.alpha;
    ctx.lineWidth = band.width;
    let drawing = false;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      // break the line into dashes so it looks wind-scoured, not ruled
      const on = Math.sin(x * 0.006 + band.phase) + Math.sin(x * 0.017 - band.phase) > -0.2;
      if (!on) { drawing = false; continue; }
      const y = ys[i] + band.depth + Math.sin(x * 0.013 + band.phase) * 5;
      if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
  // far pass first, then near, so the stand layers back-to-front
  for (const near of [false, true]) {
    for (let i = i0; i <= i1; i++) {
      const h = hash2(terrain.seed, i);
      if (h > 0.34) continue;
      const isNear = h > 0.17;
      if (isNear !== near) continue;
      const x = i * seg + (h * 977 % 1) * seg;
      const size = (isNear ? 40 : 24) + h * 80;
      const y = terrain.groundY(x) + (isNear ? 4 : 1);
      drawPine(ctx, x, y, size, theme, isNear, h);
    }
  }
}

function drawPine(ctx, x, y, size, theme, near, h) {
  // aerial perspective: distant trees take the hazy background green rather
  // than being faded out, which would make them look half-drawn
  const body = near ? theme.tree : shade(theme.tree, 1.55);
  const dark = near ? theme.treeDark : theme.tree;

  // grounding shadow, thrown down-slope away from the sun
  ctx.fillStyle = theme.snowShadow;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.12, y + 2, size * 0.52, size * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#6b4a35';
  ctx.fillRect(x - size * 0.05, y - size * 0.24, size * 0.1, size * 0.26);
  ctx.fillStyle = '#54382a';
  ctx.fillRect(x - size * 0.05, y - size * 0.24, size * 0.04, size * 0.26);

  // four tiers of boughs, each with a shaded left half and a snow-laden edge.
  // Every tier goes into one shared path per colour, so a tree costs a handful
  // of draw calls rather than a dozen.
  const TIERS = 4;
  const tierW = t => size * (0.56 - t * 0.11);
  const tierTop = t => y - size * (0.3 + t * 0.24);
  const drop = size * 0.2;

  ctx.fillStyle = body;
  ctx.beginPath();
  for (let t = 0; t < TIERS; t++) {
    const w = tierW(t), top = tierTop(t);
    ctx.moveTo(x, top - size * 0.2);
    ctx.lineTo(x - w, top + drop);
    ctx.lineTo(x - w * 0.55, top + drop * 0.72);
    ctx.lineTo(x + w * 0.55, top + drop * 0.72);
    ctx.lineTo(x + w, top + drop);
    ctx.closePath();
  }
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  for (let t = 0; t < TIERS; t++) {
    const w = tierW(t), top = tierTop(t);
    ctx.moveTo(x, top - size * 0.2);
    ctx.lineTo(x - w, top + drop);
    ctx.lineTo(x - w * 0.55, top + drop * 0.72);
    ctx.lineTo(x, top + drop * 0.72);
    ctx.closePath();
  }
  ctx.fill();

  // snow settled on the branch tips — only worth drawing on the near stand
  if (near) {
    ctx.strokeStyle = theme.treeSnow;
    ctx.lineWidth = Math.max(1.4, size * 0.045);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let t = 0; t < TIERS; t++) {
      const w = tierW(t), top = tierTop(t);
      ctx.moveTo(x - w * 0.85, top + drop * 0.9);
      ctx.lineTo(x - w * 0.15, top + drop * 0.1);
      ctx.moveTo(x + w * 0.2, top + drop * 0.15);
      ctx.lineTo(x + w * 0.8, top + drop * 0.86);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // snow cap on the crown
  ctx.fillStyle = theme.treeSnow;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 1.13);
  ctx.lineTo(x - size * 0.17, y - size * 0.88);
  ctx.quadraticCurveTo(x, y - size * 0.96, x + size * 0.17, y - size * 0.88);
  ctx.closePath();
  ctx.fill();

  // a couple of trees carry a lopsided cornice of powder
  if (h > 0.26) {
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.2, y - size * 0.62, size * 0.16, size * 0.06, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ entities

export function drawEntity(ctx, it, time, theme) {
  switch (it.type) {
    case 'rock': drawRock(ctx, it); break;
    case 'coin': drawCoin(ctx, it, time); break;
    case 'animal': drawAnimal(ctx, it, time); break;
  }
}

// Obstacles have to read as danger at a glance, especially now that the
// camera sits further back: dark mass, hard highlight, crisp snow cap.
function drawRock(ctx, it) {
  const { x, y, r } = it;
  const peak = y - r * 0.75 - it.variant * 6;

  // pooled shadow + the drift of snow piled against the upslope side
  ctx.fillStyle = 'rgba(80,115,160,0.3)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.1, y + r * 0.52, r * 1.35, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.8, y + r * 0.42, r * 0.6, r * 0.2, 0.12, 0, Math.PI * 2);
  ctx.fill();

  // dark body
  ctx.fillStyle = '#5c6a7a';
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.5);
  ctx.lineTo(x - r * 0.55, peak);
  ctx.lineTo(x + r * 0.15, y - r);
  ctx.lineTo(x + r * 0.9, y - r * 0.35);
  ctx.lineTo(x + r, y + r * 0.5);
  ctx.closePath();
  ctx.fill();

  // lit facet catching the sun from up-right
  ctx.fillStyle = '#8b9aab';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.15, y - r);
  ctx.lineTo(x + r * 0.9, y - r * 0.35);
  ctx.lineTo(x + r * 0.75, y + r * 0.5);
  ctx.lineTo(x + r * 0.1, y - r * 0.1);
  ctx.closePath();
  ctx.fill();

  // secondary facet + crack lines
  ctx.fillStyle = '#6e7d8d';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, peak);
  ctx.lineTo(x + r * 0.15, y - r);
  ctx.lineTo(x + r * 0.1, y - r * 0.1);
  ctx.lineTo(x - r * 0.45, y - r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(35,48,64,0.5)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.35);
  ctx.lineTo(x - r * 0.2, y - r * 0.25);
  ctx.lineTo(x + r * 0.1, y - r * 0.1);
  ctx.stroke();

  // snow cap over the crown
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.62, peak + r * 0.12);
  ctx.quadraticCurveTo(x - r * 0.2, peak - r * 0.34, x + r * 0.18, y - r * 1.03);
  ctx.quadraticCurveTo(x + r * 0.6, y - r * 0.78, x + r * 0.9, y - r * 0.38);
  ctx.quadraticCurveTo(x + r * 0.35, y - r * 0.62, x - r * 0.05, y - r * 0.5);
  ctx.quadraticCurveTo(x - r * 0.4, y - r * 0.42, x - r * 0.62, peak + r * 0.12);
  ctx.closePath();
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

// stroke a path twice: a dark casing first, then the colour on top. The
// outline is what keeps the skier legible against bright snow.
const INK = 'rgba(18,30,48,0.55)';
function inked(ctx, width, color, path) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 2.6;
  ctx.beginPath(); path(); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); path(); ctx.stroke();
}

// scale a '#rrggbb' colour's brightness: k < 1 shades it (shadowed side of a
// suit), k > 1 lifts it (distant trees washed out by haze)
function shade(hex, k) {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = v => clamp(Math.round(v * k), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawSkier(ctx, s, p, time) {
  if (p.state === 'crash') {
    drawCrashedSkier(ctx, s, time);
    return;
  }
  const crouch = p.state === 'air' ? 2 : 0;
  const onSkis = !p.mount || p.mount === 'penguin' || p.mount === 'yeti';
  const suitDark = shade(s.suitColor, 0.72);

  if (onSkis && !p.mount) {
    // skis, with curled tips and a bright topsheet stripe
    inked(ctx, 4, s.skiColor, () => {
      ctx.moveTo(-24, 0); ctx.lineTo(28, 0);
      ctx.moveTo(-18, 4); ctx.lineTo(33, 4);
    });
    ctx.strokeStyle = s.skiColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(28, -3, 3.5, Math.PI * 0.5, Math.PI * 1.6, true);
    ctx.arc(33, 1, 3.5, Math.PI * 0.5, Math.PI * 1.6, true);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-20, -1); ctx.lineTo(24, -1);
    ctx.stroke();
  }

  // boots + legs
  inked(ctx, 5, '#27384c', () => {
    ctx.moveTo(-3, -1); ctx.lineTo(0, -13 + crouch);
    ctx.moveTo(6, -1); ctx.lineTo(2, -13 + crouch);
  });
  ctx.fillStyle = '#1b2a3c';
  ctx.beginPath();
  ctx.roundRect(-6, -4.5, 8, 5, 2);
  ctx.roundRect(3, -4.5, 8, 5, 2);
  ctx.fill();

  // scarf, a two-tone ribbon snapping in the wind
  const wave = Math.sin(time * 14) * 3;
  inked(ctx, 4.5, s.scarfColor, () => {
    ctx.moveTo(8, -27 + crouch);
    ctx.quadraticCurveTo(-4, -28 + wave * 0.4, -16, -24 + wave);
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(6, -28.5 + crouch);
  ctx.quadraticCurveTo(-4, -29.5 + wave * 0.4, -15, -25.6 + wave);
  ctx.stroke();

  // torso, leaning into the fall line
  inked(ctx, 9, s.suitColor, () => {
    ctx.moveTo(0, -12 + crouch);
    ctx.lineTo(7, -25 + crouch);
  });
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-2.5, -12.5 + crouch);
  ctx.lineTo(4.5, -25 + crouch);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2.6, -12 + crouch);
  ctx.lineTo(9.5, -24 + crouch);
  ctx.stroke();

  // arm, pole and basket
  inked(ctx, 4.5, s.suitColor, () => {
    ctx.moveTo(6, -22 + crouch); ctx.lineTo(13, -14 + crouch);
  });
  ctx.fillStyle = '#2b3a4d';
  ctx.beginPath();
  ctx.arc(13.5, -13.5 + crouch, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4d5e70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(13, -14 + crouch); ctx.lineTo(7, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, -1); ctx.lineTo(9.5, -1);
  ctx.stroke();

  // head, helmet, goggles
  ctx.fillStyle = '#f0c8a0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(11, -31 + crouch, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = s.suitColor;
  ctx.beginPath();
  ctx.arc(11, -32 + crouch, 6.1, Math.PI * 0.95, Math.PI * 2.02);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = suitDark;
  ctx.beginPath();
  ctx.arc(11, -32 + crouch, 6.1, Math.PI * 1.5, Math.PI * 2.02);
  ctx.fill();
  // goggle lens with a specular streak
  ctx.fillStyle = '#1d2a3b';
  ctx.beginPath();
  ctx.roundRect(10.5, -33.4 + crouch, 7.4, 4, 1.6);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,215,255,0.75)';
  ctx.beginPath();
  ctx.roundRect(12.6, -32.9 + crouch, 3.4, 1.4, 0.7);
  ctx.fill();
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
