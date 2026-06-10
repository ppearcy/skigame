// Tiny WebAudio synth — no asset files needed.

export class Sound {
  constructor(settings) {
    this.s = settings;
    this.ctx = null;
  }

  ensure() {
    if (!this.s.sound) return false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0 } = {}) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(freq + slide, 30), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { vol = 0.2, delay = 0, low = false } = {}) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    let node = src;
    if (low) {
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      src.connect(filt);
      node = filt;
    }
    node.connect(gain).connect(this.ctx.destination);
    src.start(t0);
  }

  jump()  { this.noise(0.16, { vol: 0.1 }); this.tone(300, 0.18, { type: 'sine', vol: 0.1, slide: 240 }); }
  coin()  { this.tone(980, 0.07, { type: 'square', vol: 0.07 }); this.tone(1470, 0.12, { type: 'square', vol: 0.06, delay: 0.06 }); }
  flip(n) {
    for (let k = 0; k < Math.min(n + 2, 5); k++) {
      this.tone(520 * Math.pow(1.26, k), 0.12, { type: 'triangle', vol: 0.12, delay: k * 0.07 });
    }
  }
  crash() { this.noise(0.4, { vol: 0.28, low: true }); this.tone(160, 0.3, { type: 'sawtooth', vol: 0.1, slide: -110 }); }
  thud()  { this.noise(0.12, { vol: 0.13, low: true }); }
  mount() { this.tone(620, 0.09, { type: 'triangle', vol: 0.12 }); this.tone(930, 0.12, { type: 'triangle', vol: 0.12, delay: 0.08 }); }
  smash() { this.noise(0.25, { vol: 0.22 }); this.tone(110, 0.2, { type: 'square', vol: 0.1, slide: -60 }); }
  gameOver() {
    this.noise(0.9, { vol: 0.3, low: true });
    [380, 300, 226, 152].forEach((f, k) => this.tone(f, 0.26, { type: 'triangle', vol: 0.12, delay: k * 0.18 }));
  }
}
