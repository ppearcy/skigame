# Alpine Dash ⛷️

A customizable, browser-based endless skiing game inspired by *Ski Safari*.
Race down an infinite procedurally-generated mountain, jump off crests, hold
to backflip, ride animals, grab coins — and stay ahead of the avalanche.

No build step, no runtime dependencies: plain HTML5 canvas + ES modules.
(Playwright is a dev dependency, used only by the browser tests.)

## Run it

Any static file server works (ES modules require http://, not file://):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve`, or just deploy the folder to GitHub Pages / Netlify.

## How to play

| Input | Action |
|---|---|
| **Hold** space / click / touch | Jump (when on the ground) |
| **Keep holding** in the air | Backflip |
| Release before landing | Land clean — flips give a speed boost + trick points |
| Esc / P | Pause |

- The camera rides well ahead of you and pulls back as you speed up, so
  rocks and crests show up with time to set up a jump. Hazards that are still
  off-screen get a **chevron on the right edge** with their distance.
- Land sideways and you **crash** — the avalanche closes in fast while you tumble.
- **Rocks** crash you. **Coins** are worth 25 points each.
- **Ride animals** by skiing into them:
  - 🐧 **Penguin** — faster, higher jumps
  - 🦍 **Yeti** — smashes straight through rocks (+50 each)
  - 🛷 **Snowmobile** — fastest, but wrecks on the first rock it hits
- Consecutive flip landings build a **combo multiplier**.
- Score = distance (m) + coins×25 + trick points. Best score is saved locally.

## Customize

The **Customize** menu (saved to `localStorage`) lets you tune:

- **Skier** — suit / scarf / ski colors, plus Day / Sunset / Night themes
- **Mountain** — steepness, hilliness, and the density of rocks, coins, and animals (set any to 0 to disable)
- **Camera** — view distance (how far ahead you see) and off-screen hazard markers
- **Physics** — top speed, gravity, and avalanche aggression
- **Effects** — snowfall, sound, screen shake, vibration (mobile)

Camera, physics and density sliders apply live; steepness/hilliness shape the
next run.

## Mobile

The game is touch-first friendly: safe-area (notch) aware HUD, large touch
targets, no pull-to-refresh or double-tap zoom, and haptic feedback on jumps,
flips, and crashes.

Narrow screens get extra camera pull-back, so a phone in portrait still sees a
useful stretch of slope ahead. If a device can't hold a smooth frame rate the
game steps down render resolution first, then drops decorative passes (drift
lines, sparkles, god rays, the ridge treeline) — the wide view is the last
thing to go, because it's what makes the game playable.

## Code tour

| File | What it does |
|---|---|
| `js/main.js` | Game loop, input, camera, collisions, particles, scoring |
| `js/terrain.js` | Infinite slope: downhill grade + two octaves of smoothed noise |
| `js/player.js` | Skier physics: slope sliding, jumps, flip rotation, crashes |
| `js/entities.js` | Spawning of rocks, coin lines/arcs, and rideable animals |
| `js/avalanche.js` | Rubber-banded chase logic keyed off smoothed player speed |
| `js/render.js` | Themes, parallax background, terrain, characters, avalanche |
| `js/audio.js` | Procedural WebAudio sound effects (no asset files) |
| `js/ui.js` | Menus, HUD, and the settings panel bindings |
| `js/config.js` | Settings schema, persistence, shared math helpers |

## Tests

A headless smoke test exercises the full game loop under stubbed DOM/canvas —
no browser needed:

```sh
npm test
```

A Playwright suite drives the real game in Chromium: menu, HUD, jumping,
pausing, persistence, every theme, and the forward-visibility guarantees
(lookahead distance, framing, phone viewports).

```sh
npx playwright install chromium   # once
npm run test:e2e
```

Both run in CI on every push. To eyeball the graphics, `npm run shots` writes
gameplay screenshots (desktop in each theme, plus a portrait phone) to
`shots/`.
