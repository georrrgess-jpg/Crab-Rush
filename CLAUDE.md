# Crab Dash: working rules

Three-lane endless beach runner for the browser (Three.js + TypeScript + Vite). The v1 design is in **`PLAN.md`**; Update 2 ("Sunny Season") is planned in **`UPDATE2_PLAN.md`**. Read both before doing any work. Concept art: `docs/concept/crab-dash-concept.webp`.

## Commands
- `npm run dev`: dev server
- `npm run build`: production build into `dist/`
- `npm test`: Vitest (pattern validator, autopilot fairness, save + v1→v2 migration, goals, economy, meta (XP/pass/wardrobe/daily), springs/tweens, router, audio, quality)
- `npm run shots -- <label> [--no-build] [--only=title,run,...] [--views=phone,desktop,...]`: Playwright screenshots into `docs/screenshots/`. Chromium and Playwright are preinstalled: use `require('playwright')` and never run `playwright install`.
- `node scripts/smoke.mjs [--no-build]`: end-to-end browser smoke test (shader compile check, controls, tutorial, shop, settings, pause, rotation, results)
- `node scripts/perf.mjs [--no-build] [--tiers=high,medium,low]`: draw-call/triangle budget check per tier and zone (exit 1 if over)
- `BALANCE=1 npx vitest run tests/balance.test.ts`: simulated-player balance report
- Test hooks live on `window.__crab` (see `installHooks` in `src/game.ts`): `startRun`, `setState`, `frames`, `skip`, `crash`, `grant`, `shaderCheck`, `budgets`.

## Where things live (Update 2)
- `src/meta/`: pure progression logic (XP & Sunny Pass, Wardrobe catalogue, Daily Tide date/streak). Like `src/sim/`, no `three` and no DOM.
- `src/render/shaders/toy.ts`: toy shader family + outline; `src/render/anim/`: springs and tweens.
- `src/ui/router.ts` + `src/ui/tokens.css`: screen stack and design tokens for the Phase D UI.
- Save format is v2 (`src/core/save.ts`); any new field needs a default, sanitising, and a migration test.

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
