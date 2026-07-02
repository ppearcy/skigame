import { mulberry32 } from './config.js';

// Spawns and tracks world objects ahead of the camera: rocks (obstacles),
// coins (in ground lines or arcs over crests), rideable animals, jump
// ramps and power-up orbs.

const ANIMAL_KINDS = ['penguin', 'yeti', 'snowmobile'];
const POWERUP_KINDS = ['magnet', 'shield', 'rocket'];

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
    this.nextRamp = 2900;
    this.nextPowerup = 3600;
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
    if (this.s.ramps > 0.05) {
      while (this.nextRamp < spawnTo) {
        this.spawnRamp(this.nextRamp);
        this.nextRamp += this.rand(3200, 6400) / this.s.ramps;
      }
    }
    if (this.s.powerups > 0.05) {
      while (this.nextPowerup < spawnTo) {
        this.spawnPowerup(this.nextPowerup);
        this.nextPowerup += this.rand(4200, 7800) / this.s.powerups;
      }
    }

    // cull behind the avalanche / camera
    const cutoff = camLeft - 700;
    this.items = this.items.filter(it => it.x > cutoff && !it.dead);

    // coins and power-ups bob gently
    for (const it of this.items) {
      if (it.type === 'coin') it.bob = Math.sin(time * 4 + it.phase) * 4;
      else if (it.type === 'powerup') it.bob = Math.sin(time * 2.6 + it.phase) * 7;
    }
  }

  spawnRock(x) {
    const r = this.rand(16, 26);
    this.items.push({
      type: 'rock', x,
      y: this.terrain.groundY(x) - r * 0.45,
      r,
      variant: this.rng(),
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

  // a kicker: skiing across its lip launches the player skyward.
  // The wedge geometry is frozen at spawn (terrain is static per run).
  spawnRamp(x) {
    const w = 120 + this.rng() * 70;
    this.items.push({
      type: 'ramp', x, w,
      h: 30 + this.rng() * 20,
      y: this.terrain.groundY(x),
      yBack: this.terrain.groundY(x - w),
      r: 46, used: false,
    });
  }

  spawnPowerup(x) {
    const kind = POWERUP_KINDS[Math.floor(this.rng() * POWERUP_KINDS.length)];
    this.items.push({
      type: 'powerup', kind, x,
      y: this.terrain.groundY(x) - 70,
      r: 20, bob: 0,
      phase: this.rng() * Math.PI * 2,
    });
  }
}
