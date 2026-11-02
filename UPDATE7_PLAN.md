# Crab Rush: Update 7 Plan ("Polish Pass", 50-minute timebox)

Goal: improve animations, graphics, detail and UI; improve functionality; fine-tune the escalating
difficulty; make the crab model fully cohesive. Five parallel tracks on disjoint files, then one
verification pass (build, tests, smoke, ui-audit at the five viewports, perf budgets), push, deploy.

| Track | Files | Work | Proof |
|---|---|---|---|
| **Crab** | `src/render/models/crab.ts`, `hats.ts` | Close every seam: legs and claws meet the shell, eye stalks root into the carapace, no floating parts from any angle or body skin; smoother run/hop/land/idle motion | crab-closeup (all angles, several bodies), crab/pose/clip/hats tests |
| **Difficulty** | `src/config.ts` (speed, tiers, gaps, breathers), `src/sim/patterns.ts`, `spawner.ts` | A smoother escalation: a gentler first minute, mechanics introduced one at a time, steady pressure through each zone, no spikes; fair at every speed | autopilot fairness + pattern tests, `BALANCE=1` report |
| **Graphics & detail** | `src/render/*` except the crab model | Richer lighting and sky, water sparkle, prop and obstacle detail, juicier effects, within the per-tier budgets | perf.mjs, screenshots |
| **UI** | `src/ui/*.css`, `src/ui/*.ts` except `home.ts` wiring in `game.ts` | Smoother transitions and micro-animations, results and pause polish, consistent spacing and states | ui-audit at five sizes |
| **Functionality** | `src/core/input.ts`, `src/game.ts` | Gamepad support, better keyboard navigation in menus, quality-of-life fixes found while auditing the flows | smoke test |

Constraints carried over: pure sim, tunables in `config.ts`, no downloaded assets, no allocation in the
frame loop, draw-call/triangle budgets per tier, five viewports, `npm run build && npm test` before push.
