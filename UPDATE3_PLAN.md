# Crab Dash: Update 3 Plan ("Shell Shock")

The plan for the third major update. Read it alongside `PLAN.md` (v1), `UPDATE2_PLAN.md` (Update 2) and `CLAUDE.md` (working rules). All earlier rules still apply: no downloaded assets, the sim stays pure, the 120 Hz fixed step, the five reference viewports, and the per-tier performance budgets.

---

## 0. Summary

The owner asked for six things. Update 3 answers each of them:

| Ask | Answer in Update 3 |
|---|---|
| A main menu that is more detailed, intuitive and visually stunning, with epic animations | **Home v3**: a boot cinematic, a living time-of-day diorama, a mode carousel with animated illustrated cards, a profile card, an animated nav, wave-wipe and card-morph transitions, and per-screen camera moves (§2) |
| Fine-tune how the game works and fix discrepancies such as bugged animations | An **audit phase** backed by automated checks for rig/model sanity, hat clipping, UI overlap at every viewport and animation pops, plus a fix list from the Update 2 audit (§1) |
| Polish in-game animations | **Animation pass**: anticipation and follow-through on hops, lean and roll on lane changes, planted-foot gait, landing and bump reactions, pickup reactions, smoother cross-fades (§3) |
| Add more detail to the crabs, and find and smooth out bugs in the crab model | **Crab v3**: a sculpted carapace with rim, ridges, speckles and back plates; jointed legs with knuckles and tips; serrated two-tone claws; segmented eye stalks; mouthparts and a bigger expressive mouth. Model bugs are fixed and guarded by tests (§4) |
| Add more detail to the new feature | **Island Hop+**: an animated map with a walking crab, island treasure chests, a Tide Rush hard mode with crowns, two new obstacles, four bonus levels, and level previews. The Sunny Pass, Daily Tide and Wardrobe get depth too: outfits, dyes, new cosmetics and a Daily history (§5) |
| Another feature menu that keeps players coming back | **Crab Cove**: a personal island hangout to build and decorate. Its comfort sets how fast Tide Gifts build up, crab friends move in and hand out quest chains, and a Trophy Shelf shows achievements. It brings in a second currency, **Pearls**, which buys exclusive items (§6) |

Out of scope: online play, accounts, monetisation, new endless zones.

---

## 1. Audit and fixes (fine-tuning)

### 1.1 Issues found in the Update 2 audit
The audit used animation strips (`scripts/anim-strip.mjs`) and screenshots at every viewport.

| # | Area | Issue | Fix |
|---|---|---|---|
| 1 | Crab | The Claw Clap dance raises both claws in front of the eyes, hiding the face | Clap below eye height, with the claws angled out |
| 2 | Crab | Lane changes barely show: no body roll or lean, and the legs don't scramble | A lane-change overlay with roll toward the move, a lead-claw swing, scrambling legs and a squash on arrival (§3) |
| 3 | Crab | The bucket-hat brim cuts through the eye stalks; other hats may clip on some bodies | A per-hat clearance check against the eye stalks (automated test), with offsets or brim shapes fixed where it fails |
| 4 | Crab | On a crash, the hat can fly at the camera and fill the screen | Launch the hat away from the camera, sideways and up, with a capped size on screen |
| 5 | Crab | The mouth is a thin line you can barely see at game distance | A larger mouth with a dark interior and tongue, and six readable shapes |
| 6 | Crab | The back of the shell is a smooth dome with no detail | Back plates, rim serrations, speckles and a tail flap (§4) |
| 7 | Crab | The legs look thin and spidery, and the feet slide while running | Thicker segments with knuckles and dark tips; planted-foot gait (§3) |
| 8 | UI | Tier-up toasts stacked over the results header (fixed late in Update 2 by merging them; verify) | A toast-safe zone: toasts dodge the active card's header |
| 9 | UI | The Home "Next reward" chip touches the logo on tall phones | Rebuilt in Home v3 (§2) |
| 10 | UI | The Wardrobe red dot only counts affordable crabs and upgrades, not newly earned items | "New" tracking per item: a dot on the tab and a NEW tag on the tile until it's seen |
| 11 | UI | The results "Next crab" teaser ignores the Pass and the Wardrobe | Results tease the nearest reward from any source (pass tier, crab price, island chest, Cove) |
| 12 | Flow | The Escape from level-end smoke check is timing-sensitive | Make transition timing deterministic under test (the router reports when it settles); keep the wait-for-state check |
| 13 | Code | Dead imports (`selectCrab` in `game.ts`) and other leftovers | Lint pass (TypeScript `noUnusedLocals` for `src/`) |

### 1.2 New automated guards
- **Rig sanity** (`tests/crab.test.ts`):
  - every vertex is bound to a valid bone;
  - no NaN values or zero-area triangles;
  - left/right mirror symmetry within a tolerance for the body, legs, claws and eyes;
  - normals point outward (a sampled ray-parity check);
  - the outline hull covers the body.
- **Hat clearance** (`tests/hats.test.ts`): for every body × hat pair, hat vertices stay outside the eye-stalk capsules and above the carapace surface.
- **Pose sweep** (`tests/anim.test.ts`):
  - sample every state, emote and dance at 30 points;
  - all joint angles stay finite and within limits;
  - claw positions never enter the eye volume, except in emotes that are allowed to;
  - the pose delta at state switches stays under a threshold (no pops when cross-fades are cut short).
- **UI overlap sweep** (`scripts/ui-audit.mjs`): every screen at the five reference viewports. It records the bounding boxes of key elements and fails on overlaps between elements that must not touch, on text overflowing its container, on tap targets under 44 px, and on horizontal scroll.

---

## 2. Main menu overhaul (Home v3)

### 2.1 Boot cinematic (first open of each session, skippable, about 4 s)
1. Black, then a sunrise colour fade. The camera starts low over open ocean, waves rolling under it.
2. It sweeps forward over a breaking wave (spray particles) toward the beach.
3. The logo letters drop in one by one with squash-and-stretch and a water splash. The straw hat spins down onto the "C".
4. The sand on the mound bulges and the crab **bursts out** (sand burst, spin, land with squash), then waves at the camera.
5. The UI panels slide in staggered from their edges, and the Play card pulses once.
- Tap or any key skips straight to the end state. With Reduce Motion it's a 300 ms fade to the end state.
- Built on the existing camera springs and a small **timeline** helper in `render/anim/` (keyframed tracks with eases), so it's testable and deterministic.

### 2.2 Living diorama
- **Time of day follows the local clock**: morning, noon, golden hour and night palettes for the Home sky, so evening players see a sunset beach with lanterns.
- The ambient life gets a Home-only pass: a crab family wanders on the mound edge, gulls land on the umbrella, a beach ball rolls in now and then.
- Tapping the crab plays emotes as now. Tapping the beach ball kicks it. Tapping the ocean makes a splash. These are small, discoverable touches.
- **Parallax**: the camera drifts slightly with device tilt (when allowed) or the mouse.

### 2.3 Layout
- **Top bar**:
  - a **profile card**: a live portrait of the equipped crab, the player's chosen title (from achievements), a pass-tier ring around the portrait, and the streak flame;
  - **currency pills** for shells and pearls that count up with a coin-fly when rewards arrive;
  - an inbox bell that collects gifts and messages.
- **Mode carousel** (right on landscape, bottom on portrait): four large cards.
  - **Beach Run, Island Hop, Daily Tide and Crab Cove**, each with an illustrated, animated scene in layered SVG/CSS (rolling waves, bobbing island, a calendar flipping, a Cove with smoke from a bonfire).
  - Each card shows live progress: best distance, stars, today's modifier and streak, gifts waiting.
  - Swipe, arrow keys or the mouse wheel moves between cards. The focused card lifts with a light sheen; side cards peek with a 3D tilt. Enter or tap plays.
  - The Golden Shell boost toggle lives on the Beach Run card.
- **Goals drawer**: a pull-up sheet with v1 goals, Cove quests and the next achievement, each with a progress bar.
- **Animated bottom nav**: a "bubble" indicator slides between tabs; icons do a small spring on press. The tabs are Home, Wardrobe, Pass, Cove and More (Stats, Settings, How to play).
- **"What's new" sheet** on the first open after the update, covering Update 3's features.

### 2.4 Motion language
- **Transitions**:
  - a wave-wipe (an SVG wave sweeping across) between Home and a run;
  - a card morph (the tapped card expands into the next screen's header) for menu screens;
  - shared-element moves for currency pills.
- **Micro-interactions**: buttons squash on press and spring back; hover tilt with a moving specular sheen on desktop; badges bounce once when they change.
- **Per-screen cameras**: the Wardrobe dollies to a close-up of the crab on a turntable plinth, the Island Hop map pans the camera out over the ocean, and Crab Cove flies the camera to the Cove island.
- Everything respects Reduce Motion: crossfades only, no camera flights.
- **Budget**: UI animation is CSS transform and opacity only; no layout thrash; the main thread stays under 1 ms per frame for the UI.

---

## 3. In-game animation polish

- **Hop**:
  - an anticipation crouch of 40 ms (visual only: the sim hop still starts on the input frame);
  - stretch on take-off and tuck at the apex;
  - legs trail on the way down;
  - a landing squash scaled by fall speed, with a sand ring.
- **Lane change**:
  - the body rolls about 14° into the move and yaws slightly;
  - the lead claw swings out and the legs scramble at double rate;
  - a squash and settle wobble on arrival;
  - a dust arc behind.
  - Mid-air lane changes get a small barrel twist.
- **Planted-foot gait**:
  - feet lock to the ground during the stance phase (foot target in world space sliding with the track), then lift in an arc;
  - the stride length scales with speed, which removes foot sliding.
- **Bumps and near misses**: a head-whip away from the obstacle, eyes squeezed shut, and a sweat drop on close shaves.
- **Pickups**:
  - eyes track the nearest shell strand;
  - a tiny happy hop of the body on big shells;
  - a sparkle burst that also tints the shell glow.
- **Power-ups**:
  - shield: the crab bobs inside the bubble;
  - magnet: claws raised like antennae;
  - Wave Rider: crouch and arm-balance sway that reacts to lane changes.
- **Crash**: unchanged in spirit, but the hat flies away from the camera, and the dizzy stars get a twinkle and a soft bob.
- **Cross-fades**: velocity-aware blending (springs on blend weights) so interrupted states never pop. The pose-sweep test (§1.2) enforces it.
- **Obstacles and world**:
  - sandcastle flags flutter;
  - gulls flap and screech as they dive;
  - beach balls squash on bounce;
  - logs roll a little when hopped;
  - waves curl and foam.

---

## 4. Crab v3 (more detail, with model bugs fixed)

The budgets: High about 9k triangles for the crab; Low about 3.5k via LOD; the outline still uses the low-detail hull.

- **Carapace**:
  - a sculpted lathe-plus-displacement shell with a defined rim lip, front notch and side spines;
  - two raised ridges and fine speckles (vertex-painted);
  - the back has segmented plates and a small tail flap visible from behind;
  - a two-tone gradient (darker top, warm sides) and a glossy highlight decal;
  - every body pattern (spots, stars, rainbow, gold) is re-mapped onto the new UVs, and the rainbow pattern is redone so it reads cleanly.
- **Legs**:
  - three tapered segments with knuckle joints;
  - dark, slightly glossy tips and tiny bristle strokes;
  - thicker upper segments so they read as legs, not wires.
- **Claws**:
  - a chunky palm with a serrated inner edge on both fingers;
  - a lighter inner colour, knuckle bumps and a wrist joint;
  - the pinch opens and closes with emotion.
- **Eyes**:
  - segmented stalks with a little collar;
  - the iris gets a catch-light and rim; pupils dilate (wide on crash or wonder, small on effort);
  - eyelids follow the eyeball.
- **Face**:
  - mouthparts (two small plates) under a bigger mouth;
  - six mouth shapes: smile, grin, O, gasp, determined and wobbly-dizzy;
  - cheek blush that pulses on happy moments.
- **Belly**: segmented abdomen plates in the belly colour.
- **New bodies**: Reef (teal, spotted), Lava (dark with glowing cracks), Pearl (iridescent, Cove exclusive).

---

## 5. Deeper Update 2 features

### 5.1 Island Hop+
- **Animated map**:
  - a little crab walks the dotted path to the selected level;
  - the path draws itself as levels are cleared;
  - islands bob, waves move, clouds drift;
  - completing a level launches confetti from its node.
- **Island chests** at 6, 12 and 18 stars per island, holding shells, pearls and pass XP. The chest opens with a 3D-styled UI animation.
- **Tide Rush** (hard mode), unlocked per island after it's complete:
  - the same levels at +18% speed with no power-ups;
  - each level awards a **crown** for a clean finish;
  - crowns feed achievements and the Gold Crown hat.
- **Two new obstacles**, both pure sim entities validated by the solver:
  - **Coconut Drop**: a palm shadow marks a lane, then a coconut falls. It behaves like a gull row but uses the palm prop.
  - **Shell Rings**: floating rings in a lane that give bonus shells and +1 streak when you run or hop through. They're optional and placed on safe rows.
- **Four bonus levels**, one per island and unlocked with that island's chest at 18 stars, using the new obstacles.
- **Level preview**: the intro screen shows a minimap strip of the level's sections (icons for its obstacles) and its best time.

### 5.2 Sunny Pass, Daily Tide and Wardrobe
- **Wardrobe**:
  - **Outfits**: three saved presets of body, hat, trail and dance;
  - **Dyes**: every hat in 3 colourways, unlocked with pearls;
  - **Surprise Me**: a random outfit from owned items;
  - "NEW" tags, a 3D turntable plinth with a spotlight, and a dance preview button that orbits the camera.
- **Sunny Pass**:
  - a tier-reached animation in the track (the road lights up up to the current tier);
  - the next big reward previewed in 3D on the right;
  - after tier 40, a **bonus loop** of a pearl chest every 1,000 XP.
- **Daily Tide**:
  - a 30-day history calendar with your score each day;
  - a modifier "almanac" listing all seven twists, so players learn the rotation;
  - a personal best for each modifier.

---

## 6. New feature: Crab Cove

A personal island you build and decorate. It gives players a reason to come back between runs and turns progress into something they can see.

### 6.1 Loop
1. **Tide Gifts**: the Cove washes up shells over time. The rate is set by **Comfort**, the sum of the decorations' comfort values. Gifts build up to a cap (8 hours of gifts), so returning is rewarded without being a chore. Tap the glowing gift pile to collect: shells fly to the counter.
2. **Decorate**: there are 12 placement plots on the Cove island. You buy decorations with shells (common items) or pearls (rare and exclusive ones), then place, move or store them. There are 24 decorations, each a 3D model built in code from existing props plus new ones:
   - tiki hut, hammock, bonfire, surfboard rack, sand sculpture, lighthouse model, rock pool, flower bed, flamingo, lanterns, pier stub, treasure chest, and more.
3. **Crab friends**: six NPC crabs (Shelly, Captain Barnacle, Coco, Pip, Granny Pinch, DJ Claws) move in when Comfort passes a threshold and then wander the Cove.
   - Each friend offers a **quest chain** of 3 quests, such as "Hop 25 logs" or "Earn 3 stars on Boardwalk Pier".
   - Quests pay pearls, decorations and a friend-themed hat.
   - Quests track across every mode.
4. **Trophy Shelf**: 36 achievements (bronze, silver, gold) covering distance, shells, stars, crowns, streaks, cosmetics and Cove. Each earned trophy appears as a model on the shelf in the Cove and pays pearls; some unlock **titles** shown on the profile card.

### 6.2 Economy
- **Pearls** are rarer than shells. They come from achievements, quests, island chests and the post-40 pass loop, and buy exclusive decorations, dyes and the Pearl body.
- Comfort sets the gift rate: about 40 shells per hour at the start, rising to 160 per hour with a full Cove, capped at 8 hours. (Tuned down from 300 in Phase G: at 300 a full Cove out-earned 15 minutes of play; at 160 two daily collects pay about three quarters of that.)
- Nothing is time-gated except the gift cap. There are no energy systems.

### 6.3 Screen
- The camera flies to the Cove island, a small scene beside the beach built from the shared scenery code and drawn only while the Cove is open, within the Home budget.
- **UI**:
  - a top bar with Comfort, the gift pile, pearls and shells;
  - a bottom drawer with tabs for Decorate, Friends and Trophies;
  - an edit mode where tapping a plot shows a placement ghost, and tapping an item places it with a pop animation and dust;
  - friends show speech bubbles with their quest.
- The Cove gets its own Home carousel card and a nav tab. Badges show waiting gifts, finished quests and new trophies.

### 6.4 Save v3
- New fields:
  - `cove` (plots, owned decorations, last gift time, gift banked, comfort cache);
  - `pearls`;
  - `achievements` (earned, progress counters);
  - `friends` (moved in, quest index, progress);
  - `crowns` per level, `chests` per island;
  - `outfits`, `dyes`, `seen` items, `title`, `daily.history` scores, `daily.bestByModifier`.
- Each field has a default and sanitising, and there's a v2→v3 migration test (no lost progress).

---

## 7. Audio
- A boot cinematic sting (wave crash, logo drops, crab burst) plus a Home loop variant by time of day (night: softer).
- Cove ambience: a tropical loop with a bonfire crackle.
- New SFX:
  - gift collect, pearl, decoration place, friend chatter (pitched blips), trophy, chest open;
  - coconut whistle and thud, ring chime;
  - carousel swipe ticks.

---

## 8. Technical approach

### 8.1 Structure
- `src/meta/cove.ts` (gifts, comfort, placement rules), `src/meta/achievements.ts` (definitions, evaluator), `src/meta/friends.ts` (quest chains), `src/meta/chests.ts`. All pure and tested.
- `src/render/cove.ts` builds the Cove scene. `src/render/models/decor.ts` holds the decoration models. `src/render/anim/timeline.ts` drives the cinematic.
- `src/ui/home.ts` is rewritten (Home v3), plus `src/ui/carousel.ts`, `src/ui/cove.ts`, `src/ui/trophies.ts` and `src/ui/transitions.ts` (wave wipe, card morph).
- `scripts/ui-audit.mjs` runs the overlap and overflow sweep.

### 8.2 Performance budgets (unchanged)
- The Cove scene and the Home diorama must stay within each tier's budget. The Cove uses merged static geometry per plot, instanced foliage, and friends drawn as skinned crabs on Low detail with no outlines on Low.
- The crab's triangle increase is paid for by tightening scenery LOD distances on Medium and Low if needed.
- `scripts/perf.mjs` gets Home and Cove scenes added.

### 8.3 Risks
- **Scope**: the Cove is the biggest new piece. Cut-down order if needed: fewer decorations (keep 16), fewer friends (keep 4), then dyes.
- **Cinematic on slow devices**: skip automatically if the first frames run over 50 ms.
- **The bigger crab model on Low**: LOD to 3.5k triangles and test with perf.

---

## 9. Phases

Each phase ends green: `npm run build && npm test`, the smoke test, perf within budget, then screenshots reviewed, commit and push. 📸 marks the checkpoints where screenshots go to the owner.

- **Phase A: Audit and fixes**
  - The guards in §1.2 and the fixes in §1.1.
  - 📸 Before and after strips (lane change, clap, bucket hat, crash).
- **Phase B: Crab v3 and the animation pass**
  - §4 and §3.
  - 📸 A turntable (front, side, back), a hop strip, a lane-change strip, emotes, and the new bodies.
- **Phase C: Home v3**
  - The boot cinematic, diorama, carousel, profile card, nav, transitions and per-screen cameras (§2).
  - 📸 Cinematic frames, Home at five viewports, transitions.
- **Phase D: Island Hop+**
  - Animated map, chests, Tide Rush and crowns, coconut and rings, bonus levels, previews (§5.1).
  - 📸 Map, chest opening, a new obstacle, Tide Rush results.
- **Phase E: Crab Cove**
  - Meta modules, save v3, Cove scene and decorations, gifts, friends and quests, Trophy Shelf, pearls (§6).
  - 📸 Empty and decorated Cove, edit mode, friends, trophies.
- **Phase F: Feature depth**
  - Outfits, dyes, NEW tags, the pass bonus loop, the Daily history and almanac (§5.2).
  - Audio (§7).
- **Phase G: Polish and ship**
  - Full UI audit at every viewport, perf, balance (Cove income vs run income), README and CLAUDE.md updates.
  - 📸 Final set.

## 10. Definition of done
- [ ] Every fix in §1.1 verified with a strip or screenshot. The guards in §1.2 run in `npm test` or the smoke test.
- [ ] Crab v3 within budget on every tier. No clipping across any body × hat. No foot sliding at any speed.
- [ ] Home v3 with the cinematic (skippable, and Reduce Motion safe), carousel, profile and transitions, and no overlaps at any viewport.
- [ ] Island Hop+: chests, Tide Rush with crowns, two new obstacles that pass the solver and autopilot, and 4 bonus levels.
- [ ] Crab Cove: 12 plots, 24 decorations, gifts, 6 friends with quest chains, 36 achievements, pearls.
- [ ] Save v3 migration tested. No v2 player loses progress.
- [ ] Bundle stays at or under 450 KB gzipped. No console errors.
