import { clamp } from './config.js';

// The chasing avalanche. Tracks an exponential moving average of the player's
// speed so a crash (instant speed ~0) lets it close in fast, while clean play
// holds it at a tense-but-fair distance behind.

export class Avalanche {
  constructor(settings) {
    this.aggr = settings.avalanche;
    this.front = -1150;       // leading edge x
    this.ema = 320;           // smoothed player speed
    this.speed = 320;
  }

  distanceTo(player) { return player.x - this.front; }

  update(dt, player) {
    const moving = player.state === 'ground' || player.state === 'air';
    const ps = moving ? Math.max(player.vx, 0) : 0;
    this.ema += (ps - this.ema) * Math.min(1, dt * 0.5);

    // trailing gap scales with speed (~1.15s behind) so one full-speed crash
    // is survivable but a quick second one is not
    const desired = Math.max(700, this.ema * 1.15) / this.aggr;
    const dist = this.distanceTo(player);
    let spd = this.ema * 0.98
      + (dist - desired) * 0.45 * this.aggr    // rubber band
      + 45 * this.aggr
      + (moving ? 0 : 240 * this.aggr);        // surge while the skier tumbles
    this.speed = clamp(spd, 200, this.ema * 1.9 + 500);
    this.front += this.speed * dt;
  }

  caught(player) { return this.distanceTo(player) < 24; }
}
