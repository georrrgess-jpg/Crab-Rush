# Crab Rush: Update 9 Plan ("Big Splash")

The owner asked for:
- better gameplay;
- better animation for the crab, the coins (shells) and the environment;
- more detailed obstacles;
- a fix for the glitched blue crabs;
- a more intuitive UI on phone and PC;
- a more detailed crab model;
- anything else that needs it.

Six tracks run in parallel on separate files. Then one verification pass:
- build and tests;
- smoke test (run on its own);
- ui-audit at the five viewports;
- perf budgets;
- screenshots, push and deploy.

## What's wrong with the blue crabs

The blue crabs are the scuttler obstacles, which hop one lane sideways. I captured them with close-up cameras (new `cam(x, y, z, look)` hook). Most of the trouble comes from bolting separate parts together without a rig:
- **Legs:** they render as flat, dark, box-like slabs reaching the floor, like table legs. The knee joints are visibly broken.
- **Face:** the brows and the mouth plate are loose black boxes floating off the shell.
- **Claws:** they are pale, ghostly spheres that barely read from the run camera. They have no outline and are mostly hidden by the body.
- **Scuttle:** the sideways move is a whole-body bob with no leg motion.

## Tracks

### Blue crab and obstacles
Files: `src/render/models/obstacles.ts`, `src/render/entities.ts`.
- Rebuild the scuttler as one cohesive rock crab:
  - a smooth sculpted carapace with tapered, jointed legs;
  - big readable claws in front with outlines;
  - eyes and brows that are part of the face, not loose boxes.
- Give it a proper rig:
  - the left and right leg sets step alternately while it crosses;
  - the claws snap during the warning;
  - the body sways.
- Add more detail to every other obstacle, with High-only extras.

Proof:
- the `models.mjs` sheet;
- close-up captures;
- `tests/hitbox.test.ts` and `tests/obstacle-budget.test.ts`.

### Player crab model and animation
File: `src/render/models/crab.ts` (also `hats.ts` if needed).
- Model:
  - more sculpted shell detail: rim bevel, ridges, a speckle pattern and a belly plate;
  - better eyes, segmented legs and detailed claws.
- Animation:
  - a calmer lane-change yaw, since on the run the crab turns too far sideways;
  - follow-through on stops, plus better idle, run, hop and land.
- Budget: the High budget may grow to 11000 triangles and Low stays at 3500. Update the test accordingly.

Proof:
- `crab-closeup` and `anim-strip`;
- crab, pose, clip and hats tests.

### Shells (coins), pickups and environment animation
Files: `src/render/shells.ts`, `fx.ts`, `life.ts`, `scenery.ts`, `props.ts`, `sky.ts`, `ocean.ts`, `backdrop.ts`, and FX wiring in `view.ts`.
- **Shells:**
  - a spin-and-bob with a glint sweep;
  - a magnetised stretch and a collect "pop" with a sparkle burst;
  - big shells that read as special.
- **Power-ups:** a breathing bubble.
- **Environment:**
  - palms and grass swaying in the wind;
  - flags fluttering;
  - birds and boats moving;
  - foam rolling;
  - clouds drifting.

Everything stays within budget (High/Medium-only extras). Proof: `perf.mjs` and screenshots.

### UI, phone and PC
Files: `src/ui/**`, plus UI wiring in `src/game.ts`.
- Onboarding:
  - clear first-run hints;
  - control hints that match the device: keys on PC, swipes on phones.
- Navigation:
  - obvious back buttons, a back key (Esc) everywhere and clear focus rings;
  - larger, clearer tap targets and labelled icons;
  - a run HUD that is easier to read at a glance.
- Screens:
  - a pause menu showing the controls;
  - a results screen with a clear next step;
  - Home with a stronger hierarchy on phone and desktop.

Proof:
- `ui-audit` at the five sizes;
- the smoke test;
- before and after screenshots.

### Gameplay
Files: `src/sim/**` (except `levelData`), `src/config.ts` gameplay regions, tests.
- Shell layouts that guide play:
  - arcs over hop obstacles;
  - zig-zags that lead into lane changes;
  - big-shell rewards on the risky line.
- Close-shave and graze feedback events.
- Fairness, balance and pattern tests must stay green, with balance medians within ±15%.

### Verification and ship
Done centrally:
- merge the tracks;
- move tunables into `config.ts`;
- update the docs;
- push;
- update the artifact;
- send screenshots.

Constraints carried over:
- pure sim, with tunables in `config.ts`;
- no downloaded assets;
- no allocation in the frame loop;
- draw-call and triangle budgets per tier;
- five viewports;
- `npm run build && npm test` before every push.
