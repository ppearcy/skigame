import { mulberry32 } from './config.js';

// Spawns and tracks world objects ahead of the camera. Rocks come in designed,
// speed-aware patterns (think Geometry Dash): every layout is clearable with a
// well-timed jump, the gap to the next pattern scales with how fast the player
// is actually moving, and harder patterns only unlock deeper into the run.
// Clusters are telegraphed by warning signs and topped with coin arcs that
// trace the jump line. Coins also spawn on their own in ground lines or arcs.

const ANIMAL_KINDS = ['penguin', 'yeti', 'snowmobile'];

export class Entities {
  constructor(settings, terrain, seed) {
    this.s = settings;
    this.terrain = terrain;
    this.rng = mulberry32(seed);
    this.items = [];
    // first spawns: give the player a grace zone
    this.nextRock = 1700;
    this.nextCoin = 800;
    this.nextAnimal = 2400;
    this.speedEst = 600; // smoothed player speed, drives pattern spacing
  }

  rand(lo, hi) { return lo + this.rng() * (hi - lo); }

  update(dt, camLeft, camRight, time, playerSpeed) {
    if (playerSpeed) this.speedEst += (playerSpeed - this.speedEst) * Math.min(1, dt * 2);
    const spawnTo = camRight + 900;

    if (this.s.rocks > 0.05) {
      while (this.nextRock < spawnTo) {
        const end = this.spawnRockPattern(this.nextRock);
        // reaction gap: seeing one pattern must leave time to answer the next
        const gap = ((this.speedEst * 1.05 + 420) / this.s.rocks) * this.rand(0.95, 1.7);
        this.nextRock = end + Math.max(gap, this.speedEst * 0.55);
      }
    }
    if (this.s.coins > 0.05) {
      while (this.nextCoin < spawnTo) {
        this.spawnCoins(this.nextCoin);
        this.nextCoin += this.rand(900, 2000) / this.s.coins;
      }
    }
    if (this.s.animals > 0.05) {
      while (this.nextAnimal < spawnTo) {
        this.spawnAnimal(this.nextAnimal);
        this.nextAnimal += this.rand(2600, 5200) / this.s.animals;
      }
    }

    // cull behind the avalanche / camera
    const cutoff = camLeft - 700;
    this.items = this.items.filter(it => it.x > cutoff && !it.dead);

    // coins bob gently
    for (const it of this.items) {
      if (it.type === 'coin') it.bob = Math.sin(time * 4 + it.phase) * 4;
    }
  }

  // ------------------------------------------------------------ rock patterns

  // a rock hidden just past a blind crest feels unfair — nudge the spot
  // forward until the ground is flat or compressing (visible on approach)
  visibleSpot(x) {
    for (let i = 0; i < 10; i++) {
      const convex = this.terrain.slopeAt(x + 50) - this.terrain.slopeAt(x - 50);
      if (convex < 0.12) break;
      x += 48;
    }
    return x;
  }

  choosePattern(meters) {
    const opts = [['single', 1]];
    if (meters > 120) opts.push(['double', 0.75]);
    if (meters > 300) opts.push(['wall', 0.55]);
    if (meters > 520) opts.push(['pair', 0.6]);
    let roll = this.rng() * opts.reduce((sum, [, w]) => sum + w, 0);
    for (const [name, w] of opts) {
      roll -= w;
      if (roll <= 0) return name;
    }
    return 'single';
  }

  // returns the x where the pattern ends
  spawnRockPattern(x0) {
    const x = this.visibleSpot(x0);
    const type = this.choosePattern(x / 40);
    const speed = this.speedEst;

    switch (type) {
      case 'double': { // two tight rocks, one jump clears both
        const w = this.cluster(x, 2, 64);
        this.guideArc(x, x + w);
        return x + w;
      }
      case 'wall': { // three-rock row: one committed jump, telegraphed
        this.sign(x, speed);
        const w = this.cluster(x, 3, 66);
        this.guideArc(x, x + w);
        return x + w;
      }
      case 'pair': { // two distinct jumps, spaced by the current jump distance
        this.sign(x, speed);
        this.rock(x);
        const x2 = this.visibleSpot(x + speed * 0.8 + 340);
        this.rock(x2);
        return x2;
      }
      default:
        this.rock(x);
        return x;
    }
  }

  rock(x, rmax = 26) {
    const r = this.rand(16, rmax);
    this.items.push({
      type: 'rock', x,
      y: this.terrain.groundY(x) - r * 0.45,
      r,
      variant: this.rng(),
    });
  }

  cluster(x, n, gap) {
    for (let k = 0; k < n; k++) this.rock(x + k * gap, 22);
    return (n - 1) * gap;
  }

  // warning sign planted upstream of a harder pattern
  sign(x, speed) {
    const sx = x - Math.max(360, speed * 0.5);
    this.items.push({ type: 'sign', x: sx, y: this.terrain.groundY(sx), r: 0 });
  }

  // an arc of coins tracing the jump line over a cluster
  guideArc(xa, xb) {
    if (this.s.coins <= 0.05) return;
    const n = 5;
    const span = (xb - xa) + 300;
    const cx = (xa + xb) / 2;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const x = cx - span / 2 + span * t;
      const lift = 52 + Math.sin(t * Math.PI) * 86;
      this.items.push({
        type: 'coin', x,
        y: this.terrain.groundY(x) - lift,
        r: 12, bob: 0,
        phase: this.rng() * Math.PI * 2,
      });
    }
  }

  // ------------------------------------------------------------ coins/animals

  spawnCoins(x0) {
    const arc = this.rng() < 0.45;
    const n = 6 + Math.floor(this.rng() * 4);
    for (let k = 0; k < n; k++) {
      const x = x0 + k * 56;
      const lift = arc ? 70 + Math.sin((k / (n - 1)) * Math.PI) * 95 : 42;
      this.items.push({
        type: 'coin', x,
        y: this.terrain.groundY(x) - lift,
        r: 12, bob: 0,
        phase: this.rng() * Math.PI * 2,
      });
    }
  }

  spawnAnimal(x) {
    const kind = ANIMAL_KINDS[Math.floor(this.rng() * ANIMAL_KINDS.length)];
    this.items.push({
      type: 'animal', kind, x,
      y: this.terrain.groundY(x),
      r: 28,
      phase: this.rng() * Math.PI * 2,
    });
  }
}
