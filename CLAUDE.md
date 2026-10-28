# Crab Dash: working rules

Three-lane endless beach runner for the browser (Three.js + TypeScript + Vite). The v1 design is in **`PLAN.md`**; Update 2 ("Sunny Season") is in **`UPDATE2_PLAN.md`**; Update 3 ("Shell Shock") is in **`UPDATE3_PLAN.md`**; Update 4 ("Race Day") is in **`UPDATE4_PLAN.md`**; Update 5 ("Treasure Tide") is in **`UPDATE5_PLAN.md`**. Read them before doing any work. Concept art: `docs/concept/crab-dash-concept.webp`.

## Commands
- `npm run dev`: dev server
- `npm run build`: production build into `dist/`
- `npm test`: Vitest (pattern validator, autopilot fairness, save + v1→…→v5 migration, goals, economy, meta (XP/pass/wardrobe/daily/chests/dig/achievements), feel (lane spring, magnet, Fever, revive), crab poses and hats, springs/tweens, router, audio, quality)
- `npm run shots -- <label> [--no-build] [--only=title,run,...] [--views=phone,desktop,...]`: Playwright screenshots into `docs/screenshots/`. Chromium and Playwright are preinstalled: use `require('playwright')` and never run `playwright install`.
- `node scripts/smoke.mjs [--no-build]`: end-to-end browser smoke test (shader compile check, controls, tutorial, shop, settings, pause, rotation, results)
- `node scripts/perf.mjs [--no-build] [--tiers=high,medium,low]`: draw-call/triangle budget check per tier, zone, race, Home and Treasure Dig (exit 1 if over)
- `node scripts/ui-audit.mjs [--no-build] [--only=...] [--views=...]`: every screen at the five reference viewports; fails on overlapping controls, text overflow, tap targets under 40 px, horizontal scroll
- `node scripts/anim-strip.mjs <label> [--no-build]`: crab animation strips (run, turntable, hop, crash, emotes, dances, bodies, hats, lane, slam)
- `node scripts/models.mjs <label> [--no-build]`: model review sheet (every obstacle, pickup and hero prop on its own)
- `node scripts/ui-motion.mjs <label> [--no-build]`: UI motion frame strips (card morph, sheet, reward fly)
- `node scripts/crab-closeup.mjs <label> [--no-build] [--body=id] [--hat=id] [--eyes]`: large front / three-quarter / side / back renders of the crab for model review (`--eyes`: tight eye shots)
- `BALANCE=1 npx vitest run tests/balance.test.ts`: simulated-player balance report
- Test hooks live on `window.__crab` (see `installHooks` in `src/game.ts`): `startRun`, `race`, `reviveOn`, `fever`, `digKind`, `setState`, `frames`, `skip`, `crash`, `grant`, `xp`, `level`, `daily`, `setDate`, `wear`, `unlockAll`, `cine`, `whatsNew`, `shaderCheck`, `budgets`.

## Where things live (Update 2)
- `src/meta/`: pure progression logic (XP & Sunny Pass, Wardrobe catalogue, Daily Tide date/streak). Like `src/sim/`, no `three` and no DOM.
- `src/render/shaders/toy.ts`: toy shader family + outline; `src/render/anim/`: springs and tweens.
- `src/ui/router.ts` + `src/ui/tokens.css`: screen stack and design tokens for the Phase D UI.
- Screens: `src/ui/home.ts`, `results.ts`, `islands.ts` (map/intro/end), `shop.ts` (Wardrobe), `pass.ts` (Sunny Pass), `daily.ts` (Daily Tide), `settings.ts` (+ Stats). Styles in `src/ui/screens.css`.
- Island Hop: `src/sim/levels.ts` (format + compiler), `src/sim/levelData.ts` (24 levels), `src/sim/objectives.ts` (stars), `src/meta/islands.ts` (gates, rewards).
- Daily Tide modifiers live in the sim (`World.modifier`, spawner `themed()`), with knobs in `CFG.daily`.
- Audio (`src/core/audio.ts`): SFX and music loops are synthesised; `setTrack('beach'|'island'|'chase'|'mellow')`, `setZone(z)` crossfades the zone layers, `setRumble(0..1)` drives the chase rumble.

## Where things live (Update 3)
- Trophies and titles: `src/meta/achievements.ts`; page in `src/ui/trophies.ts` (Crab Cove was retired in Update 5).
- Island Hop+: `src/meta/chests.ts` (star chests, crowns, bonus levels); bonus levels and coconut/ring pieces in `src/sim/levelData.ts` / `levels.ts`.
- Home v3 + boot cinematic: `src/ui/home.ts`, `src/render/anim/timeline.ts`, `view.startCinematic`; the one-time "What's new" sheet is `src/ui/whatsnew.ts`.
- Crab model v3: `src/render/models/crab.ts` (shell sculpt, poses); hats and dyes in `hats.ts`. Guarded by `tests/pose.test.ts` and `tests/hats.test.ts`.
- Claw guard: `src/render/models/clawGuard.ts` keeps the claws out of the eyes and any hat at runtime (sphere proxies + a small solver in `CrabModel.solveClaw`). `tests/clip.test.ts` checks skinned claw vertices against the real hat mesh, shell and eyes; `CLIP=1 npx vitest run tests/clip.test.ts` prints the full motion × hat table.
- On the run the crab faces down the beach (yaw π, set in `GameView.frame`); lane/flinch/lean inputs are mirrored by `faceSign`. It turns back to the camera for menus and celebrations.
- Update 4 UI: `src/ui/kit.ts` (size classes on `<html data-size>`, Wallet, pageHead, actionBar, Sheet, toast lane) and `src/ui/motion.ts` (press, stagger, morph, reward fly, tab line); layouts in `src/ui/v4.css`. Primary actions stay on screen: `ui-audit` checks it.
- Scenery tiles have a far copy (`propsFar`: low palms, no small props) used beyond 30 m; the ocean grid is dense only near the track.
- Crab Cup (Update 4): `src/sim/race.ts` (rival Worlds on the same seed, each driven by an Autopilot, ±3% catch-up), `src/meta/cup.ts` (cups, points, unlocks, rewards), `src/render/rivals.ts` (low-detail rival crabs + DOM name tags), `src/ui/cup.ts` (cup select, podium), `src/ui/raceHud.ts`; styles in `src/ui/cup.css`; knobs in `CFG.race`. In a race, a hit is a stumble (`World.stumble`) and 25 shells fire a Shell Dash. Hooks: `race(cupId, {autopilot})`, `clearCups`, `raceInfo`.
## Where things live (Update 5)
- Treasure Dig: `src/meta/dig.ts` (seeded 6×5 sites, relics, hot/cold, chests, spades earned), `src/ui/dig.ts` (grid, museum, site chest); knobs in `CFG.dig`. Spades are paid in `Game.awardSpades` from runs, levels and races.
- Shell Fever and Second Chance live in the sim (`World.fever/feverT`, `World.revive()`); knobs `CFG.fever`, `CFG.revive`; the card is `src/ui/revive.ts`.
- Feel: lane glide is a critically damped spring (`CFG.laneChangeTime`); pulled shells fly an eased Bézier (`World.pull`, `CFG.pull`); Sand Slam pulls shells (`CFG.hop.slamReach`) and plays `SlamFx` (`src/render/fx.ts`). Power-up spacing: `CFG.powerupGap/powerupClear`.
- Vibrant theme: `src/ui/theme5.css` (loaded last); Update 5 screens in `src/ui/u5.css`. Map extras (`extras` in `Scenery.buildVariant`) are High/Medium only.
- Save format is v5 (`src/core/save.ts`); any new field needs a default, sanitising, and a migration test.

## Rules
- `src/sim/` never imports `three`. Rendering reads sim state; the sim emits events.
- All tunables go in `src/config.ts`. Patterns and goals are data files.
- No downloaded assets. Models, textures, SFX and music are generated in code.
- Don't allocate in the frame loop. Use pools and InstancedMesh. Stay within the draw-call and triangle budgets in PLAN.md §8.3.
- Keep the 120 Hz fixed-step sim. Swipes resolve during the move, not on release.
- Every screen must work at 360×640, 390×844, 844×390, 1366×768 and 1920×1080, with touch, keyboard and mouse.
- Run `npm run build && npm test` before every push.
- At milestones, send real screenshots to the owner with `SendUserFile`, plus a 2–4 line progress note (PLAN.md §13).
- Push to the designated branch. Don't open a PR unless asked.
