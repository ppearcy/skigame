// Settings schema + persistence. Everything the Customize panel touches lives here.

export const DEFAULTS = {
  // skier looks
  suitColor: '#e74c3c',
  scarfColor: '#f1c40f',
  skiColor: '#2980d9',
  theme: 'day',          // day | sunset | night

  // mountain
  steepness: 1.0,        // base downhill grade multiplier
  hilliness: 1.0,        // undulation amplitude multiplier
  rocks: 1.0,            // obstacle density (0 disables)
  coins: 1.0,            // coin density (0 disables)
  animals: 1.0,          // rideable animal frequency (0 disables)

  // physics / difficulty
  speed: 1.0,            // terminal speed multiplier
  gravity: 1.0,
  avalanche: 1.0,        // chase aggression

  // effects
  snowfall: true,
  sound: true,
  screenShake: true,
};

const SETTINGS_KEY = 'alpinedash.settings.v1';
const BEST_KEY = 'alpinedash.best.v1';

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* ignore */ }
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
  }
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function loadBest() {
  const n = Number(localStorage.getItem(BEST_KEY));
  return Number.isFinite(n) ? n : 0;
}

export function saveBest(score) {
  try { localStorage.setItem(BEST_KEY, String(Math.floor(score))); } catch { /* ignore */ }
}

// --- small shared utilities ---

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// deterministic 0..1 hash of two ints (for terrain decorations)
export function hash2(seed, i) {
  let h = (seed ^ Math.imul(i, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21F0AAAD) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735A2D97) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
