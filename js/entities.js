import { mulberry32 } from './config.js';

// Spawns and tracks world objects ahead of the camera: rocks (obstacles),
// coins (in ground lines or arcs over crests), rideable animals, and boost
// rings that fling you forward when you thread them.

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
    this.nextBoost = 3000;
  }

  rand(lo, hi) { return lo + this.rng() * (hi - lo); }

  update(dt, camLeft, camRight, time) {
    const spawnTo = camRight + 900;

    if (this.s.rocks > 0.05) {
      while (this.nextRock < spawnTo) {
        this.spawnRock(this.nextRock);
        this.nextRock += this.rand(900, 2600) / this.s.rocks;
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
    if (this.s.coins > 0.05) { // boost rings ride the coin density setting
      while (this.nextBoost < spawnTo) {
        this.spawnBoost(this.nextBoost);
        this.nextBoost += this.rand(2800, 5400) / Math.min(this.s.coins, 1.5);
      }
    }

    // cull behind the avalanche / camera
    const cutoff = camLeft - 700;
    this.items = this.items.filter(it => it.x > cutoff && !it.dead);

    // coins and boost rings bob gently
    for (const it of this.items) {
      if (it.type === 'coin') it.bob = Math.sin(time * 4 + it.phase) * 4;
      else if (it.type === 'boost') it.bob = Math.sin(time * 3 + it.phase) * 6;
    }
  }

  // steep cliff faces are no place for a rock: nudge forward until the
  // ground is rideable so obstacles stay fair
  fairX(x) {
    for (let tries = 0; tries < 6 && Math.abs(this.terrain.slopeAt(x)) > 1.15; tries++) {
      x += 130;
    }
    return x;
  }

  spawnRock(x) {
    x = this.fairX(x);
    const r = this.rand(16, 26);
    this.items.push({
      type: 'rock', x,
      y: this.terrain.groundY(x) - r * 0.45,
      r,
      variant: this.rng(),
    });
  }

  spawnBoost(x) {
    x = this.fairX(x);
    const lift = 40 + this.rng() * 120; // low rings reachable on the ground
    this.items.push({
      type: 'boost', x,
      y: this.terrain.groundY(x) - lift,
      r: 22, bob: 0,
      phase: this.rng() * Math.PI * 2,
    });
  }

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
