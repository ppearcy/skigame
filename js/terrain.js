import { mulberry32, hash2, clamp } from './config.js';

// Infinite procedural slope with rotating "zones": a constant downhill grade
// plus two octaves of smooth undulation, overlaid with per-zone character —
// wave rollers, mogul bumps, kicker ramps, cliff ledges, and long steep
// plunges. Zones keep the mountain from ever feeling samey. World y grows
// downward.

const IBASE = 256; // allows queries down to x = -IBASE * seg

class Octave {
  constructor(seg, amp, seed) {
    this.seg = seg;
    this.amp = amp;
    this.rng = mulberry32(seed);
    this.values = [0];
  }

  value(i) {
    const idx = i + IBASE;
    const v = this.values;
    while (v.length <= idx) {
      const prev = v[v.length - 1];
      const step = (this.rng() - 0.5) * 2 * this.amp * 0.85;
      v.push(clamp(prev + step, -this.amp, this.amp));
    }
    return v[idx];
  }

  sample(x) {
    const f = x / this.seg;
    const i = Math.floor(f);
    const t = f - i;
    const u = 0.5 - Math.cos(t * Math.PI) * 0.5; // cosine ease
    return this.value(i) * (1 - u) + this.value(i + 1) * u;
  }
}

export const ZONE_LEN = 3600;
const BLEND = 340; // zone-local waves fade in/out over this span at each edge

// weighted picker: cruise is the breather between the flavorful zones
const ZONE_TABLE = [
  'cruise', 'cruise',
  'rollers', 'rollers',
  'moguls', 'moguls',
  'kickers', 'kickers',
  'cliffs', 'cliffs',
  'steep', 'steep',
];

const smooth = t => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

export class Terrain {
  constructor(settings, seed) {
    this.seed = seed;
    this.slope = 0.40 * settings.steepness;
    const h = settings.hilliness;
    this.o1 = new Octave(180, 42 * h, seed);
    this.o2 = new Octave(680, 105 * h, seed ^ 0x5bd1e995);
    this.o3 = new Octave(64, 34 * Math.min(h, 1.6), seed ^ 0x2545f491); // moguls
    this.hill = h;
    this.zones = new Map(); // zone index -> feature description
    this.cum = [0];         // cum[i] = permanent drop accumulated by zones < i
  }

  zone(i) {
    let z = this.zones.get(i);
    if (z) return z;
    if (i < 1) {
      // warm-up runway before and around the start line
      z = { type: 'cruise', amp: 0, wl: 560, phase: 0, mogul: 0, drops: [], kickers: [] };
    } else {
      z = this.makeZone(i, this.zone(i - 1).type);
    }
    this.zones.set(i, z);
    return z;
  }

  makeZone(i, prevType) {
    const r = k => hash2(this.seed ^ 0x7a0e11, i * 16 + k);
    const pick = Math.floor(r(0) * ZONE_TABLE.length);
    let type = ZONE_TABLE[pick];
    if (type === prevType) type = ZONE_TABLE[(pick + 5) % ZONE_TABLE.length];
    if (type === prevType) type = prevType === 'cruise' ? 'rollers' : 'cruise';

    const x0 = i * ZONE_LEN;
    const h = this.hill;
    const z = { type, amp: 0, wl: 480, phase: r(1) * Math.PI * 2, mogul: 0, drops: [], kickers: [] };

    switch (type) {
      case 'cruise':
        z.amp = 28 * Math.min(h, 1.3);
        z.wl = 620;
        break;
      case 'rollers': // big surfable waves — pump the crests for air
        z.amp = (74 + r(2) * 46) * Math.min(h, 1.6);
        z.wl = 400 + r(3) * 220;
        break;
      case 'moguls': // dense chatter bumps: quasi-regular washboard + noise
        z.mogul = 1;
        z.mogulWl = 120 + r(5) * 40;
        z.mogulAmp = 17 * Math.min(h, 1.6);
        z.amp = 26 * Math.min(h, 1.6);
        z.wl = 340 + r(3) * 140;
        break;
      case 'kickers': { // built ramps with a sharp lip: hit fast, fly far
        const n = 2 + Math.floor(r(2) * 2);
        for (let k = 0; k < n; k++) {
          z.kickers.push({
            x: x0 + ZONE_LEN * (0.16 + (k + r(4 + k) * 0.55) * (0.68 / n)),
            up: 75 + r(8 + k) * 55,
            w1: 230 + r(12 + k) * 80, // ramp face
            w2: 52,                   // sharp back edge
          });
        }
        break;
      }
      case 'cliffs': { // ledges that drop away under you — huge natural airs
        const n = 2 + Math.floor(r(2) * 2);
        for (let k = 0; k < n; k++) {
          z.drops.push({
            x: x0 + ZONE_LEN * (0.14 + k * (0.66 / n) + r(4 + k) * 0.09),
            h: 190 + r(8 + k) * 130,
            w: 95 + r(12 + k) * 45,
          });
        }
        break;
      }
      case 'steep': // one long committed plunge through the zone
        z.drops.push({ x: x0 + ZONE_LEN * 0.2, h: 560 + r(2) * 300, w: ZONE_LEN * 0.5 });
        z.amp = 24 * Math.min(h, 1.3);
        z.wl = 540;
        break;
    }
    return z;
  }

  // total drop banked by all zones before zone i (drops finish inside their
  // zone, so this makes groundY continuous across boundaries)
  cumDrop(i) {
    if (i <= 0) return 0;
    const c = this.cum;
    while (c.length <= i) {
      const j = c.length - 1;
      let tot = 0;
      for (const d of this.zone(j).drops) tot += d.h;
      c.push(c[j] + tot);
    }
    return c[i];
  }

  zoneTypeAt(x) {
    return this.zone(Math.floor(x / ZONE_LEN)).type;
  }

  groundY(x) {
    const i = Math.floor(x / ZONE_LEN);
    const z = this.zone(i);
    let y = 260 + x * this.slope + this.o1.sample(x) + this.o2.sample(x) + this.cumDrop(i);

    // zone-local waves fade to zero at the edges so zones join seamlessly
    const inz = x - i * ZONE_LEN;
    const w = smooth(inz / BLEND) * smooth((ZONE_LEN - inz) / BLEND);
    if (z.amp) y += Math.sin((x * Math.PI * 2) / z.wl + z.phase) * z.amp * w;
    if (z.mogul) {
      y += (this.o3.sample(x)
        + Math.sin((x * Math.PI * 2) / z.mogulWl + z.phase) * z.mogulAmp) * w;
    }

    for (const d of z.drops) y += d.h * smooth((x - d.x) / d.w);
    for (const k of z.kickers) {
      y -= k.up * smooth((x - k.x) / k.w1) * (1 - smooth((x - k.x - k.w1) / k.w2));
    }
    return y;
  }

  slopeAt(x) {
    return (this.groundY(x + 3) - this.groundY(x - 3)) / 6;
  }
}
