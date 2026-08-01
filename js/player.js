import { clamp, lerp, normAngle } from './config.js';

// Skier physics: constrained slide while grounded, projectile + held-button
// backflip rotation in the air. Emits events for the game layer to turn into
// sound / particles / score.

const MIN_SPEED = 150;
const FLIP_ROT = Math.PI * 1.45;   // rotation counted as one full flip
const CRASH_ANGLE = 1.35;          // landing tolerance (rad off the slope)

export const MOUNTS = {
  penguin:    { label: '🐧 Penguin',    thrust: 175, jump: 1.18, height: 17 },
  yeti:       { label: '🦍 Yeti',       thrust: 125, jump: 1.06, height: 27 },
  snowmobile: { label: '🛷 Snowmobile', thrust: 330, jump: 1.0,  height: 16 },
};

export class Player {
  constructor(settings, terrain) {
    this.s = settings;
    this.x = 0;
    this.y = terrain.groundY(0);
    this.vx = 300;
    this.vy = this.vx * terrain.slopeAt(0);
    this.angle = Math.atan(terrain.slopeAt(0));
    this.angVel = 0;
    this.state = 'ground';   // ground | air | crash | dead
    this.mount = null;
    this.trickRot = 0;
    this.airTime = 0;
    this.sinceGround = 0;    // coyote time
    this.crashTimer = 0;
    this.grace = 0;          // post-crash invulnerability to rocks
    this.combo = 0;
    this.events = [];        // consumed by game each frame
  }

  get grav() { return 2300 * this.s.gravity; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  // collision center sits a bit above the skis
  get cx() { return this.x + Math.sin(this.angle) * 16; }
  get cy() { return this.y - Math.cos(this.angle) * 16; }

  thrust() { return this.mount ? MOUNTS[this.mount].thrust : 0; }
  jumpMult() { return this.mount ? MOUNTS[this.mount].jump : 1; }
  // drag scales so the "speed" setting moves terminal velocity
  dragK() { return 0.00046 / (this.s.speed * this.s.speed); }

  press() {
    if (this.state === 'ground' || (this.state === 'air' && this.sinceGround < 0.12)) {
      const power = 860 * this.jumpMult();
      this.vy -= power;
      this.state = 'air';
      this.airTime = 0;
      this.trickRot = 0;
      this.sinceGround = 1; // consume coyote window
      this.events.push({ type: 'jump' });
    }
  }

  setMount(kind) {
    this.mount = kind;
    this.events.push({ type: 'mount', kind });
  }

  loseMount(reason) {
    if (!this.mount) return;
    const kind = this.mount;
    this.mount = null;
    this.events.push({ type: 'dismount', kind, reason });
  }

  crash() {
    if (this.state === 'crash' || this.state === 'dead') return;
    this.state = 'crash';
    this.crashTimer = 0.95;
    this.combo = 0;
    this.trickRot = 0;
    this.vx *= 0.3;
    this.vy = -200;                       // thrown into the air by the impact
    this.angVel = 9 + Math.random() * 5;  // violent forward tumble
    this.loseMount('crash');
    this.events.push({ type: 'crash' });
  }

  update(dt, held, terrain) {
    this.grace = Math.max(0, this.grace - dt);
    switch (this.state) {
      case 'ground': this.updateGround(dt, terrain); break;
      case 'air':    this.updateAir(dt, held, terrain); break;
      case 'crash':  this.updateCrash(dt, terrain); break;
      case 'dead':   break;
    }
  }

  updateGround(dt, terrain) {
    const sl = terrain.slopeAt(this.x);
    const theta = Math.atan(sl);
    let spd = this.speed;

    const a = this.grav * Math.sin(theta)        // gravity along slope
      + this.thrust()                            // mount engine/legs
      - 55 * Math.cos(theta)                     // rolling resistance
      - this.dragK() * spd * spd;                // air drag -> terminal speed
    spd = Math.max(spd + a * dt, MIN_SPEED);

    this.vx = Math.cos(theta) * spd;
    this.vy = Math.sin(theta) * spd;
    this.x += this.vx * dt;

    const gy = terrain.groundY(this.x);
    const straightY = this.y + this.vy * dt;
    if (gy > straightY + 3) {
      // ground fell away under us (crest) -> airborne
      this.state = 'air';
      this.airTime = 0;
      this.trickRot = 0;
      this.sinceGround = 0;
      this.y = straightY;
    } else {
      this.y = gy;
      this.angle = lerp(this.angle, theta, 1 - Math.exp(-14 * dt));
      this.sinceGround = 0;
    }
  }

  updateAir(dt, held, terrain) {
    this.airTime += dt;
    this.sinceGround += dt;

    // held => wind up a backflip (counter-clockwise while travelling right)
    const targetAV = held ? -12.5 : 0;
    const ramp = held ? 42 : 34; // fast wind-up, quick stop on release
    this.angVel += clamp(targetAV - this.angVel, -ramp * dt, ramp * dt);
    this.angle += this.angVel * dt;
    if (this.angVel < 0) this.trickRot += -this.angVel * dt;

    // gentle auto-level toward the slope once the spin has wound down,
    // so releasing in time recovers a slightly under-rotated flip
    if (!held && Math.abs(this.angVel) < 3.5) {
      const theta = Math.atan(terrain.slopeAt(this.x));
      const diff = normAngle(theta - this.angle);
      const assist = 5.0 * dt;
      this.angle += clamp(diff, -assist, assist);
    }

    this.vy += this.grav * dt;
    this.vx -= this.dragK() * 0.4 * this.vx * this.vx * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const gy = terrain.groundY(this.x);
    if (this.y >= gy) this.land(gy, terrain);
  }

  land(gy, terrain) {
    const theta = Math.atan(terrain.slopeAt(this.x));
    const diff = normAngle(this.angle - theta);
    this.y = gy;
    this.angVel = 0;

    if (Math.abs(diff) > CRASH_ANGLE && this.airTime > 0.12) {
      this.crash();
      return;
    }

    // project velocity onto the slope: slamming into a face costs speed
    let spd = Math.max(this.vx * Math.cos(theta) + this.vy * Math.sin(theta), MIN_SPEED);

    const flips = Math.floor(this.trickRot / FLIP_ROT);
    if (flips > 0) {
      this.combo++;
      spd += (135 + 18 * Math.min(this.combo, 8)) * flips;
      this.events.push({ type: 'flip', n: flips, combo: this.combo });
    }

    this.vx = Math.cos(theta) * spd;
    this.vy = Math.sin(theta) * spd;
    this.angle = theta;
    this.state = 'ground';
    this.trickRot = 0;
    const air = this.airTime;
    this.airTime = 0;
    this.events.push({ type: 'land', air });
  }

  updateCrash(dt, terrain) {
    this.crashTimer -= dt;
    // ragdoll: ballistic arc, bouncing and skidding down the slope
    this.vx = Math.max(this.vx - 700 * dt, 70);
    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const gy = terrain.groundY(this.x);
    if (this.y >= gy) {
      this.y = gy;
      if (this.vy > 150) {
        this.vy *= -0.38; // bounce off the snow
        this.events.push({ type: 'tumble' });
      } else {
        this.vy = Math.min(this.vy, terrain.slopeAt(this.x) * this.vx);
      }
    }
    this.angVel *= Math.exp(-1.8 * dt);
    this.angle += this.angVel * dt;
    if (this.crashTimer <= 0 && this.y >= gy - 4) {
      const theta = Math.atan(terrain.slopeAt(this.x));
      this.state = 'ground';
      this.angle = theta;
      this.y = gy;
      const spd = Math.max(this.vx, MIN_SPEED);
      this.vx = Math.cos(theta) * spd;
      this.vy = Math.sin(theta) * spd;
      this.grace = 1.2;
      this.events.push({ type: 'recover' });
    }
  }
}
