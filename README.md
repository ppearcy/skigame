# Alpine Dash ⛷️

A customizable, browser-based endless skiing game inspired by *Ski Safari*.
Race down an infinite procedurally-generated mountain, jump off crests, hold
to backflip, ride animals, grab coins — and stay ahead of the avalanche.

No build step, no dependencies: plain HTML5 canvas + ES modules.

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

- Land sideways and you **crash** — the avalanche closes in fast while you tumble.
- **Rocks** crash you. **Coins** are worth 25 points each.
- Hit **ramps** for a huge launch — the faster you're going, the bigger the air.
- Land flush with the slope after real airtime for a **PERFECT!** bonus.
- Barely dodging a rock pays a **near-miss** bonus.
- Grab **power-up orbs**:
  - 🧲 **Magnet** — nearby coins swarm to you for 7 s
  - 🛡 **Shield** — absorbs one rock hit (kept until used)
  - 🚀 **Rocket** — big speed boost that smashes straight through rocks
- **Ride animals** by skiing into them:
  - 🐧 **Penguin** — faster, higher jumps
  - 🦍 **Yeti** — smashes straight through rocks (+50 each)
  - 🛷 **Snowmobile** — fastest, but wrecks on the first rock it hits
- Consecutive flip landings build a **combo multiplier** (shown live in the HUD).
- Every 500 m earns a milestone fanfare.
- Score = distance (m) + coins×25 + trick points. Best score is saved locally.

## Customize

The **Customize** menu (saved to `localStorage`) lets you tune:

- **Skier** — suit / scarf / ski colors, plus Day / Sunset / Night themes
- **Mountain** — steepness, hilliness, and the density of rocks, coins, animals, ramps, and power-ups (set any to 0 to disable)
- **Physics** — top speed, gravity, and avalanche aggression
- **Effects** — snowfall, sound, screen shake, vibration (mobile)

Physics and density sliders apply live; steepness/hilliness shape the next run.

## Mobile

The game is touch-first friendly: safe-area (notch) aware HUD, large touch
targets, no pull-to-refresh or double-tap zoom, haptic feedback on jumps,
flips, and crashes, and adaptive render resolution that steps down
automatically if the device can't hold a smooth frame rate.

## Code tour

| File | What it does |
|---|---|
| `js/main.js` | Game loop, input, camera, collisions, particles, scoring |
| `js/terrain.js` | Infinite slope: downhill grade + two octaves of smoothed noise |
| `js/player.js` | Skier physics: slope sliding, jumps, flip rotation, crashes |
| `js/entities.js` | Spawning of rocks, coins, animals, ramps, and power-ups |
| `js/avalanche.js` | Rubber-banded chase logic keyed off smoothed player speed |
| `js/render.js` | Themes, parallax background, terrain, characters, avalanche |
| `js/audio.js` | Procedural WebAudio sound effects (no asset files) |
| `js/ui.js` | Menus, HUD, and the settings panel bindings |
| `js/config.js` | Settings schema, persistence, shared math helpers |

## Tests

A headless smoke test exercises the full game loop under stubbed DOM/canvas:

```sh
node test/smoke.mjs
```
