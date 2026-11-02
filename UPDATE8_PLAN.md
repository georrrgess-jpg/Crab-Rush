# Crab Rush: Update 8 Plan ("Fine Sand")

Goal: a quality pass across feel, looks and sound. The collisions should match what the player
sees. Lane changes and hops should feel crisp and readable. The map gets more detailed models. Any
model, sound or screen that lags behind the rest of the game is brought up to the same standard.
Six tracks work in parallel on separate files, then one verification pass (build, tests, smoke,
ui-audit at the five viewports, perf budgets), push and deploy.

| Track | Files | Work | Proof |
|---|---|---|---|
| **Mechanics & hit detection** | `src/sim/world.ts`, `types.ts`, `CFG.obstacle/player/hop/lane*` in `config.ts`, tests | Hitboxes measured against the real meshes (each obstacle's box matches its model; the player box matches the crab's body, not its claws); swept tests so a fast frame can't tunnel through or clip a corner; a coyote window and jump buffer on hops; lane input buffered during a lane glide; a lane-change cancel (reverse mid-glide) that turns back smoothly; landing that can't snag the front edge of an obstacle | new `tests/hitbox.test.ts` (box vs model bounds, near-miss and graze cases), feel/autopilot/pattern tests, `BALANCE=1` |
| **Crab animation** | `src/render/models/crab.ts` | Squash and stretch on takeoff and landing, anticipation on a lane change (lean into the turn, legs push off), a short skid on a reversal, leg cycle locked to ground speed, secondary motion in the eye stalks and claws; within the 9000/3500 triangle budget | anim-strip, pose/clip/hats tests |
| **Map models & graphics** | `src/render/props.ts`, `scenery.ts`, `backdrop.ts`, `life.ts`, `sky.ts`, `ocean.ts`, `fx.ts`, `view.ts` | More detailed palms (segmented trunks, coconuts, frond splits), beach huts, piers, lifeguard towers, rock formations with strata, dune grass clumps, shoreline foam and wet-sand band; landing dust, lane-change sand spray, a shadow that tightens as the crab falls; extra detail on High/Medium only | perf.mjs, screenshots |
| **Other models** | `src/render/models/obstacles.ts`, `shell.ts`, `entities.ts`, `rivals.ts` | Obstacles and pickups re-sculpted to the crab's level of detail (bevels, rims, highlights, readable silhouettes), and kept inside their hitboxes | models.mjs sheet |
| **Audio** | `src/core/audio.ts` | Richer synthesised SFX (layered jump/land, lane swish, pickup chimes that climb with a streak, crash with debris), music with real chord progressions, bass and percussion, plus a beach ambience bed | audio tests, listening via render-offline checks |
| **UI** | `src/ui/*` | Screens still behind the Update 6 look (Pass, Cup, Islands, Settings, Stats, Trophies, results, pause) brought up to it; consistent motion | ui-audit at five sizes |

Constraints carried over: pure sim, tunables in `config.ts`, no downloaded assets, no allocation in the
frame loop, draw-call/triangle budgets per tier, five viewports, `npm run build && npm test` before push.
