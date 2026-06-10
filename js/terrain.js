import { mulberry32, clamp } from './config.js';

// Infinite procedural slope: a constant downhill grade plus two octaves of
// smooth undulation (cosine-interpolated random walks). World y grows downward.

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

export class Terrain {
  constructor(settings, seed) {
    this.seed = seed;
    this.slope = 0.30 * settings.steepness;
    const h = settings.hilliness;
    this.o1 = new Octave(180, 42 * h, seed);
    this.o2 = new Octave(680, 105 * h, seed ^ 0x5bd1e995);
  }

  groundY(x) {
    return 260 + x * this.slope + this.o1.sample(x) + this.o2.sample(x);
  }

  slopeAt(x) {
    return (this.groundY(x + 3) - this.groundY(x - 3)) / 6;
  }
}
