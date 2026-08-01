// Headless smoke test: stubs just enough DOM/canvas to boot the real game,
// pump a few thousand frames through menu -> run -> tricks -> death, and
// assert the simulation behaves sanely. Run with: node test/smoke.mjs

import assert from 'node:assert';

// ---------------------------------------------------------------- DOM stubs

const noop = () => {};

function makeElement(id) {
  return {
    id,
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop,
    parentElement: { querySelector: () => null },
    textContent: '',
    value: '',
    checked: false,
  };
}

function makeCtx() {
  const gradient = { addColorStop: noop };
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => gradient;
      }
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop in t) return t[prop];
      return noop; // any canvas method becomes a no-op
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

const elements = new Map();
const canvas = makeElement('game');
canvas.getContext = () => makeCtx();
canvas.width = 0;
canvas.height = 0;
elements.set('game', canvas);

globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  },
  querySelectorAll: () => [],
  addEventListener: noop,
  hidden: false,
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: noop,
  // no AudioContext: Sound should degrade gracefully
};

globalThis.localStorage = {
  store: new Map(),
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
  setItem(k, v) { this.store.set(k, String(v)); },
};

const rafQueue = [];
globalThis.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };

let fakeNow = 0;
globalThis.performance = { now: () => fakeNow };

function pump(frames, dtMs = 16.7) {
  for (let i = 0; i < frames; i++) {
    fakeNow += dtMs;
    const batch = rafQueue.splice(0, rafQueue.length);
    assert.ok(batch.length > 0, 'game loop should keep scheduling frames');
    for (const cb of batch) cb(fakeNow);
  }
}

// ------------------------------------------------------------------- the run

const { game } = await import('../js/main.js');

// 1. menu demo scene runs without exploding
pump(240);
assert.strictEqual(game.state, 'menu');
assert.ok(game.player.x > 500, `demo skier should travel (x=${game.player.x})`);

// 2. start a real run
game.startRun();
assert.strictEqual(game.state, 'playing');
pump(120);
assert.ok(game.player.x > 300, 'player slides downhill');
assert.ok(game.avalanche.front < game.player.x, 'avalanche trails the player');

// 3a. deterministic flip-physics check: a held jump accumulates at least one
// flip's worth of rotation within typical airtime
{
  const { Player } = await import('../js/player.js');
  const { Terrain } = await import('../js/terrain.js');
  const { DEFAULTS } = await import('../js/config.js');
  const t = new Terrain({ ...DEFAULTS }, 12345);
  const p = new Player({ ...DEFAULTS }, t);
  p.press();
  assert.strictEqual(p.state, 'air');
  let air = 0;
  const step = 1 / 60;
  while (p.state === 'air' && air < 3) { p.update(step, true, t); air += step; }
  assert.ok(air > 0.5, `held jump should give real airtime (${air.toFixed(2)}s)`);
  const flipped = Math.floor(p.trickRot / (Math.PI * 1.6));
  // trickRot resets on landing, so peek via combo/event instead
  const flipEvent = p.events.find(e => e.type === 'flip');
  assert.ok(flipEvent || p.state === 'crash',
    'a fully-held jump must either complete a flip or over-rotate into a crash');
  console.log(`  flip physics: airtime=${air.toFixed(2)}s outcome=${flipEvent ? `${flipEvent.n} flip(s)` : p.state}`);
}

// 3b. jump + hold-then-release tricks, repeatedly, for ~30s of game time
let sawAir = false;
let crashes = 0;
for (let round = 0; round < 30; round++) {
  game.press(); // jump (also sets held=true)
  pump(31);     // ~0.52s of hold -> rotation
  if (game.player.state === 'air') sawAir = true;
  game.held = false; // release: auto-level assist helps stick the landing
  pump(32);
  if (game.player.state === 'crash') crashes++;
  // like a human would: ski clean until the avalanche gap is safe again
  let safety = 40;
  while (game.avalanche.distanceTo(game.player) < 900 && safety-- > 0) pump(10);
  if (game.state !== 'playing') break;
}
assert.ok(sawAir, 'jumping should put the player in the air');
// the bot can't see rocks, so an unlucky crash streak may end the run — but
// only after meaningful progress
assert.ok(game.player.x > 4000, `should cover ground (x=${Math.floor(game.player.x)})`);
if (game.state !== 'playing') {
  console.log('  (run ended early to a rock-crash streak — acceptable)');
  let guard = 300;
  while (game.state !== 'gameover' && guard-- > 0) pump(1);
  game.startRun();
  pump(60);
}
console.log(
  `  after tricks: x=${Math.floor(game.player.x)} score=${Math.floor(game.score)}` +
  ` coins=${game.coins} trickPts=${Math.floor(game.trickScore)}` +
  ` crashes=${crashes} state=${game.state}`
);

// 4. settings sliders are respected by spawners (0 disables)
assert.ok(game.entities.items.length > 0, 'entities should spawn');

// 4b. forward visibility: you need real runway to react to what's coming
{
  game.settings.view = 1.2;
  game.startRun();
  pump(180);
  const base = game.lookahead / 40;
  assert.ok(base > 28, `should see well down the slope (${base.toFixed(1)} m)`);

  // the skier is framed left of centre, but not jammed against the edge
  const frac = (game.player.x - game.cam.x) * game.cam.zoom / game.w;
  assert.ok(frac > 0.1 && frac < 0.3, `skier framed left of centre (${frac.toFixed(2)})`);

  // hazards exist beyond the right edge for the edge markers to point at
  const edge = game.cam.x + game.w / game.cam.zoom;
  assert.ok(game.entities.items.some(it => !it.dead && it.x > edge),
    'entities should be spawned past the right edge');

  // and the view setting actually widens the frame
  game.settings.view = 1.8;
  pump(180);
  const wide = game.lookahead / 40;
  game.settings.view = 0.8;
  pump(180);
  const narrow = game.lookahead / 40;
  assert.ok(wide > narrow * 1.3,
    `view setting should widen the frame (${narrow.toFixed(1)} m -> ${wide.toFixed(1)} m)`);
  game.settings.view = 1.2;
  console.log(`  visibility: ${base.toFixed(1)} m ahead (${narrow.toFixed(1)}–${wide.toFixed(1)} m across the view slider)`);
}

// 5. force a catch: park the player, the avalanche must close in and end the run
if (game.state === 'playing') {
  game.player.state = 'crash';
  game.player.crashTimer = 1e9; // pin the skier down
  game.player.vx = 0;
  let guard = 4000;
  while (game.state === 'playing' && guard-- > 0) pump(1);
  assert.ok(guard > 0, 'avalanche should catch a stopped player');
}
pump(120); // ride out the dying timer
assert.strictEqual(game.state, 'gameover');
assert.ok(Number(localStorage.getItem('alpinedash.best.v1')) > 0, 'best score saved');

// 6. retry resets cleanly
game.startRun();
pump(120);
assert.strictEqual(game.state, 'playing');
assert.ok(game.coins === 0 || game.coins > 0, 'coins counter valid');
assert.ok(game.player.x < 2000, 'fresh run starts near origin');

// 7. every theme + extreme settings render without throwing
for (const theme of ['day', 'sunset', 'night']) {
  game.settings.theme = theme;
  pump(10);
}
Object.assign(game.settings, {
  steepness: 1.6, hilliness: 2, rocks: 2, coins: 2, animals: 2,
  speed: 1.5, gravity: 0.7, avalanche: 2, snowfall: true,
});
game.startRun();
pump(400);
Object.assign(game.settings, {
  steepness: 0.6, hilliness: 0.3, rocks: 0, coins: 0, animals: 0,
  speed: 0.7, gravity: 1.5, avalanche: 0.4, snowfall: false,
});
game.startRun();
pump(400);
assert.ok(game.entities.items.length === 0, 'density 0 disables all spawns');

console.log('✔ smoke test passed');
