# Crab Dash

A three-lane endless beach runner for iPhone, Chromebook and PC browsers. Scuttle down the sand as Sandy the crab: dodge sandcastles, beach balls, logs, gulls and waves, grab golden shells, unlock five more crabs and upgrade your power-ups. Runs last a couple of minutes and restart in one tap.

Everything you see and hear is generated in code: the models, textures, sound effects and music. The whole game downloads in about 250 KB.

![Gameplay](docs/screenshots/m3-pier-desktop.png)

## Play

Once GitHub Pages is enabled (see below), the game is published at:

**https://georrrgess-jpg.github.io/Crab-Rush/**

On an **iPhone**, open that link in Safari, tap Share, then **Add to Home Screen**. It then runs full-screen like an app. Sound needs the silent switch turned off.

### Controls

| | Touch | Keyboard | Mouse |
|---|---|---|---|
| Change lane | Swipe left or right, or tap the left/right half of the screen (the ◀ ▶ buttons do the same) | ← → or A D | Click the left/right half |
| Hop | Swipe up | ↑, W or Space | — |
| Drop fast (while airborne) | Swipe down | ↓ or S | — |
| Pause | Pause button | Esc or P | Pause button |

You can change lanes in mid-air. Hitting something head-on ends the run; clipping it from the side only bumps you back.

### What's in the game

- **One mode, Beach Run:** an endless run through four areas. Sunny Shore leads to Boardwalk Pier at 700 m, Tide Pool Cove at 1,600 m, and the endless Sunset Lagoon from 2,800 m.
- **Obstacles:**
  - Tall ones (sandcastles, crates, boulders, gulls): dodge them.
  - Low ones (logs, deck chairs, urchins, beach balls): hop or dodge.
  - Waves and gaps in the boardwalk: hop.
- **Power-ups:**
  - Shell Magnet pulls shells toward you.
  - Bubble Shield absorbs one crash.
  - Wave Rider lets you surf over everything.

  Each has 4 upgrade levels.
- **Progress:**
  - Shells unlock crabs (Chill, Blossom, Skipper and Cap'n Pinch). Dazzle is earned by reaching Sunset Lagoon.
  - Three goals are always active and pay bonus shells.
  - A banner on the track marks your best distance.

## Turning on GitHub Pages (one time)

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Run the workflow: **Actions → Build and deploy to GitHub Pages → Run workflow**, picking the branch with the game. It also runs automatically on every push to `main`.

GitHub Pages needs a public repository, or a paid GitHub plan for private ones. If the run is refused for the branch, open **Settings → Environments → github-pages** and allow that branch, or merge the work into the default branch first.

## Development

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev              # dev server (also reachable from a phone on the same network)
npm test                 # unit tests: fairness solver, patterns, autopilot 30 seeds × 5 km, goals, economy, save, audio, quality
npm run build            # production build into dist/
npm run shots -- <label> # real screenshots via Playwright into docs/screenshots/
node scripts/smoke.mjs   # end-to-end smoke test in Chromium (controls, tutorial, shop, settings, pause, results)
BALANCE=1 npx vitest run tests/balance.test.ts   # run length / shell income for simulated novice, average and skilled players
```

### Debug URL flags

| Flag | Effect |
|---|---|
| `?debug` | Overlay with fps, frame time, draw calls, triangles, DPR, quality tier, speed, tier, zone and current pattern |
| `?seed=N` | Fixed random seed |
| `?start=1500` | Start a run at that distance (or zone) |
| `?god` | No crashes |
| `?autopilot` | The game plays itself |
| `?quality=low\|medium\|high` | Force a graphics tier |
| `?reset` | Wipe saved progress on load |

### How it's built

- **Three.js + TypeScript + Vite**, with no other runtime dependencies besides two self-hosted fonts.
- **`src/sim/`** is the pure simulation and never imports three.js. It covers player physics, collisions, the spawner and the goals and economy logic.
  - The **pattern library** has 33 handcrafted obstacle patterns.
  - A **fairness solver** checks every pattern against human reaction-time rules, and again at runtime before it is placed. The autopilot test drives the real simulation for 150 km without an unavoidable crash.
- **`src/render/`** draws the game:
  - Matcap "toy" shading with vertex colours.
  - Scenery tiles merged into a few draw calls, plus instanced shells, shadows and particles.
  - Sky and ocean shaders.
  - Auto quality that scales resolution, and between runs the graphics tier.
- **`src/ui/`** is the DOM/CSS interface. **`src/core/`** has the fixed 120 Hz loop, input, save, audio and quality code.
- Every tunable lives in **`src/config.ts`**. The design and the plan are in **[`PLAN.md`](PLAN.md)**.

### Performance budgets (measured at the busiest moments)

| Tier | Draw calls | Triangles | Budget |
|---|---|---|---|
| High | ≤ 60 | ≤ 80k | 100 / 150k |
| Low | ≤ 57 | ≤ 56k | 60 / 60k |
