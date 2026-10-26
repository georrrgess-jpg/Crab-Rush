# Crab Dash: Update 2 Plan ("Sunny Season")

The plan for the second major update. Read it alongside `PLAN.md` (the v1 design) and `CLAUDE.md` (working rules). Every v1 rule still applies unless this document changes it: no downloaded assets, the sim stays pure, the 120 Hz fixed step, and the device targets.

---

## 0. Summary

Update 2 has three goals:

1. **Make the game beautiful.** New lighting and shading, rebuilt higher-quality models, a real animation system with personality, living scenery, and a fully redesigned UI with motion.
2. **Add a second mode: Island Hop.** 24 handcrafted levels across four islands, each scored with 3 stars, plus a "Great Wave" chase level that ends each island.
3. **Add a long-term motivation loop: the Sunny Pass.** A 40-level free reward track fed by every mode, a **Daily Tide** challenge with a streak, and a **Wardrobe** that turns hats, trails and colours into mix-and-match cosmetics.

| Area | v1 | Update 2 |
|---|---|---|
| Shading | Matcap clay, flat lighting | Custom "toy" shader: sun and sky light, warm wrap, rim light, zone-tinted, optional outlines |
| Models | Primitive spheres and boxes, about 200–2k triangles each | Sculpted procedural meshes (lathe/sweep/subdivided), bevels, painted detail |
| Animation | Sine legs, squash spring | Animation system: state machine, springs for secondary motion, anticipation and follow-through, emotes, crash tumble, victory dance |
| World | Static props | Swaying palms, flapping flags, lapping waves, sea life, ambient beach crabs, birds |
| UI | Static panels | Design-token system, animated screen transitions, count-ups, stagger reveals, 3D menu diorama, haptics |
| Modes | Beach Run | Beach Run, **Island Hop** (levels), **Daily Tide** |
| Progression | Shells → crabs and upgrades, goals | Plus **Sunny Pass** (XP, 40 tiers), **Wardrobe**, level stars, daily streak |

Out of scope: online features, accounts, monetisation, extra endless zones.

---

## 1. Art and rendering overhaul

### 1.1 Visual target
"A premium mobile toy diorama." Soft but directional sunlight, readable warm and cool shading, chunky rounded silhouettes, crisp outlines on the things that matter (the player, obstacles, pickups), and gentle motion everywhere. It should read as a polished, cohesive style rather than "low-poly placeholder".

### 1.2 Toy shader (`render/shaders/toy.ts`)
A single `ShaderMaterial` (or a `MeshLambertMaterial` patched with `onBeforeCompile`, whichever is simpler) used by every solid object, replacing matcap:

- Vertex colours × **half-Lambert wrap** sun term (`0.5·N·L + 0.5`, squared), lerped between a zone shadow colour and a zone sun colour.
- A **hemisphere sky term**: up faces pick up the sky colour, down faces the bounced sand colour.
- A **rim light**: `pow(1 − N·V, 3)` × the zone rim colour, giving a soft back-light glow at sunset.
- A **specular dot** for glossy materials (`uGloss` per material: the crab shell, beach balls, shells).
- **Fog** using three's fog chunks.
- All lighting colours come from the zone palette uniforms, so the time of day finally colours *objects* and not just the sky.

Keep three variants: `toy`, `toyGloss`, `toyGold`, and an unlit `toyEmissive` for flames and lanterns.

### 1.3 Outlines
An inverted-hull outline (a backface mesh scaled along normals, flat dark colour derived from the base colour) on the **crab, obstacles and power-ups only**:
- High and Medium tiers: on.
- Low tier: off.

This costs one extra draw call per outlined object, so pool it with the object, and **merge the outline into the same geometry** using a second material group to avoid the extra call where possible.

### 1.4 Shadows
- **High:** one 1024² directional shadow map that covers *only* a 20 m box around the crab (crab and obstacles cast; the ground receives through a cheap shadow-only pass in the ground shader). Blob shadows stay for everything else.
- **Medium and Low:** improved blob shadows that are elongated in the sun direction and fade with height.

### 1.5 Water and sky
- **Ocean v2:**
  - Depth gradient from a shoreline distance field, Fresnel toward the sky colour, and sun glint streaks.
  - Two scrolling procedural normal layers (computed in the shader, not textures) and animated shoreline wash, where the foam line advances and recedes.
  - Wet-sand darkening that follows the wash.
  - Low tier: the v1 shader plus the wash.
- **Sky v2:** three-stop gradient, sun disk with bloom halo, high cirrus streaks (procedural in the sky shader), and drifting cumulus as softer, rounder merged meshes with bottom shading.
- **Sunset Lagoon:** reflections of the sun on the water (a column of glints) and, past 4 km, a slow fade to dusk with stars (an additive points layer).

### 1.6 Colour grading and polish
- A per-zone `grade` uniform (exposure, saturation, warmth) applied in the toy and ground shaders. There is still no post-processing pass.
- A CSS vignette overlay (`radial-gradient`, pointer-events none) on the High and Medium tiers.
- Sand gets wind-ripple stripes baked into the ground texture, footprint decals behind the crab (a pooled instanced quad trail), and sparkle glints on wet sand.

### 1.7 Living world (all cheap, vertex-shader driven where possible)

| Element | How |
|---|---|
| Palms sway | Vertex shader bend weighted by height (vertex colour alpha stores the weight) |
| Flags, bunting, umbrellas flutter | Vertex shader sine displacement on flagged vertices |
| Background beach crabs scuttle | 6 instanced tiny crabs on the beach sides, walking loops |
| Gulls in the sky | 3–5 instanced gulls circling far away |
| Sea life | Dolphins leaping (an occasional arc animation), jumping fish near the pier, a turtle in the cove |
| Waves lapping | Ocean wash (1.5), plus spray particles at the rocks in the cove |
| Tiki flames | Flickering vertex animation plus an additive glow sprite |
| Zone ambience | Pier: lamps light up at the sunset transition; Cove: crabs pop out of tide pools; Sunset: fireflies (points) |

Respect `sceneryDensity`: Low disables sea life and background crabs.

---

## 2. Models v2

All models stay procedural, but get built with better tools.

### 2.1 Geometry toolkit additions (`render/geo.ts`)
- `lathe(profile, segs)` for vases, castles, palm trunks and hats.
- `sweep(path, radiusFn, segs)` for curved tubes: legs, claws, logs, rope.
- `rounded box` and `bevel` helpers, plus a `subdivide` (one Loop/Catmull-style smoothing pass) for organic shapes.
- `smoothNormals` (merged-vertex normals) so seams don't show.
- **Vertex-colour painting helpers:**
  - gradient by axis;
  - `spots(seed, colour, radius, count)` for speckles on shells and sand;
  - `stripes(axis, freq)`;
  - ambient occlusion baked by a height or concavity heuristic, darkening creases.

### 2.2 The crab (hero, about 6k triangles at High, about 2.5k at Low via LOD)
- **Body:** a lathe/sculpted carapace with a front ridge, a slightly bumpy rim and a painted darker top. The belly plate has segment lines.
- **Eyes:** larger, glossy, with an iris ring, two highlights and **eyelids** (separate meshes) that blink and squint.
- **Mouth:** a small curved mouth decal that changes per expression: smile, "O" on hop, grimace on bump, dizzy squiggle on crash.
- **Claws:** swept arms with an elbow joint; a pincer with an upper and lower jaw and serrated inner edges.
- **Legs:** three-segment swept legs (hip, knee, foot) per side.
- **Antennae:** two thin swept antennae with spring physics.
- **Headwear:** rebuilt hats with lathe brims and woven-texture vertex painting (straw hat), and an attach point that wobbles on a spring.

### 2.3 Obstacles and props
- **Sandcastle:** a lathe tower with dripped-sand crenellations, shell decorations, a waving flag and windows with a warm glow at sunset. Two variants.
- **Driftwood:** a swept, gnarled log with knots and barnacles, two variants.
- **Wave:** rebuilt as a curling breaker with an inner-tube curl, a foam lip of instanced spheres, spray particles, and animated forward lean as it approaches.
- **Beach ball:** smooth with seam lines and a glossy highlight; it squashes on bounce.
- **Gull:** proper folded wings, a tail and a head-tilt idle. On landing: flap, settle, and squawk (sound plus a beak-open frame).
- **Pier set:** crates with plank detail and rope, deck chairs with fabric sag, a boardwalk gap with broken plank ends.
- **Cove set:** boulders with strata bands and barnacles, urchins with longer animated wobbling spines.
- **Props:** about 40% more variety per zone (sand toys, buckets and spades, surfboards in the sand, lifeguard tower in Shore, fishing nets and gulls on posts on the Pier, crab burrows and starfish clusters in the Cove, hammocks and a bonfire in Sunset).
- **Shells and pickups:** a rebuilt scallop with ridges and a pearly gradient, a spinning sparkle glint sprite, and a magnet "pull streak" ribbon. Power-up bubbles become iridescent (hue-shift rim).

### 2.4 LOD
Every hero mesh ships at two levels of detail: High/Medium and Low. Obstacles more than 50 m away switch to Low (`THREE.LOD`, or manual distance selection in `EntityViews.sync`).

---

## 3. Animation system

### 3.1 Framework (`render/anim/`)
- **`Spring`**: a critically damped spring (stiffness, damping) for scalars and `Vector3`s. Used for the hat, antennae, eyes, body lean, squash and the camera.
- **`Tween`**: easing curves (back, elastic, cubic) with a pooled timeline. Used for UI-synchronised 3D moments and spawn pops.
- **`CrabAnimator`**: a state machine (`idle`, `run`, `laneLeft/Right`, `hopRise`, `hopFall`, `slam`, `land`, `bump`, `crash`, `celebrate`, `emote`, `ride`) with **cross-fades** (a 0.08–0.15 s blend of pose parameters). Each state is a pose function (time, params) → joint rotations. The animator blends the outputs.
- **Pose rig:** named joints (body, eyeL/R, lidL/R, antennaL/R, clawL/R (shoulder, elbow, jaw), leg[6] (hip, knee, foot), hat, mouth). These are plain `Object3D`s, so there's no skinning: rigid parts, cheap.

### 3.2 Required animations

| State | Key details |
|---|---|
| Run | 6-leg tripod gait (alternating triangles), body bob at 2× step frequency, slight side-to-side sway, claws pump, antennae trail on springs |
| Lane change | 40 ms anticipation lean away, then a fast sideways scuttle (legs speed up 2×), overshoot settle on a spring; dust from the leading feet |
| Hop | 50 ms crouch anticipation (squash 0.8), launch stretch, claws up and open, legs tuck mid-air, look down before landing, land squash with a leg splay |
| Slam | Spin half a turn into a dive, impact ring and sand burst, a small camera dip |
| Bump | Head snap and eyes squeeze shut, hat knocked crooked (springs back), stars for 0.3 s |
| Crash | Physics tumble: an impulse sets angular velocity, gravity bounces the crab twice and it ends on its back with legs wiggling; hat lands nearby; dizzy stars and swirly eyes |
| Celebrate | On NEW BEST, a level finish and results: claw clap, jump spin, a hat toss caught on the head |
| Idle and emotes | On title and shop: blink, look around (eyes track the cursor or tap on desktop), yawn, wave, a per-crab signature emote (Chill: shades slide down; Blossom: twirl; Skipper: salute; Pinch: claw spyglass; Dazzle: sparkle burst; Sandy: hat tip) |
| Ride | Surf stance: legs bent, claws out for balance, sway synchronised with the wave |

### 3.3 World and camera animation
- **Obstacle entrances:** sandcastles "build up" (scale-in with a back ease) when they enter 60 m, balls bounce in, and gull shadows pulse.
- **Camera springs:** lateral follow, a small FOV punch on hops and speed boosts, landing dip, and a slow orbit on crash. Shake becomes trauma-based (shake = trauma², decaying). Everything respects Reduce Motion.
- **Shell pickup:** the shell flies to the HUD counter along a curve (a DOM overlay sprite synced from the projected 3D position). The counter does a squash-pop.

---

## 4. UI and UX overhaul

### 4.1 Design system (`ui/tokens.css`)
- **CSS custom properties** for colour, radius, elevation, spacing (4 px scale), type scale (Lilita One for display, Fredoka for body) and motion (durations and easings).
- **Component classes:** `btn` (primary/secondary/ghost/icon), `card`, `chip`, `badge`, `progress`, `tabbar`, `toggle`, `slider`, `modal`, `toast`, `sheet` (bottom sheet on phones, side panel on desktop).
- **New icon set:** a consistent 2.5 px rounded stroke style with a filled accent.

### 4.2 Screen router
- **`ui/router.ts`:** a stack of screens with enter and exit animations (slide, fade or scale; 180–260 ms), focus management, back handling (Esc, the back button, and the Android back gesture via `popstate`), and per-screen camera presets.
- Screens become small classes with `mount`, `enter`, `exit` and `update`.

### 4.3 Screens

| Screen | Changes |
|---|---|
| **Home** | 3D diorama: the crab on a little sand mound with an umbrella and the camera slowly orbiting. A large **Play** card for Beach Run, plus cards for **Island Hop** and **Daily Tide** (with countdown and streak flame), the Sunny Pass bar at the top, and a bottom nav (Home / Wardrobe / Pass / Settings). Logo animates in. |
| **HUD** | Cleaner pills, the shell counter catching flying shells, the power-up timer as a radial pie with icon. Level mode adds a progress bar to the flag plus 3 golden sand dollar slots. Combo/streak meter with flame. Optional left-handed layout. |
| **Pause** | A bottom sheet with blurred-looking backdrop (a pre-rendered dim plus vignette). Current goals and level objectives. |
| **Results** | Staged reveal: distance count-up with tick sounds, then shells, bonuses, goals ticking off one by one, then XP filling the Pass bar (level-up burst), then unlock teaser. The crab celebrates or sulks in the background. Tap anywhere skips the animation. |
| **Island map** | A stylised 3D map of four islands joined by dotted paths, with level nodes (locked/unlocked/stars), a boat icon to travel, and a star counter. Island gates need N stars. |
| **Level intro and end** | Intro: level name, objectives and the 3 star conditions. End: stars fly in one by one, then Retry / Next / Map. |
| **Wardrobe** | Replaces Crabs. A turntable with the crab and tabs: **Crabs** (body), **Hats**, **Trails**, **Victory dances**. Try-on preview, owned/locked states, and the source of each item ("Pass tier 12", "Island 3 complete"). |
| **Sunny Pass** | A horizontally scrolling track of 40 tiers with reward cards and the current tier highlighted; claim buttons with burst animation. |
| **Daily Tide** | Today's modifiers, best score today, streak calendar (7-day strip), rewards. |
| **Settings** | Grouped sections, plus haptics on/off, left-handed HUD, swipe sensitivity (Low/Normal/High), colour-blind-friendly obstacle outlines, and a Stats subpage (lifetime distance, runs, favourite crab, best per mode). |

### 4.4 Feel and accessibility
- **Haptics** via `navigator.vibrate` where it's supported (Android and Chromebooks; iOS Safari ignores it). Light on lane change if enabled, medium on bump, heavy on crash.
- **Button feedback:** press scale, sound, and a ripple.
- **Text:** at least 14 px, 4.5:1 contrast for body text, every interactive element reachable by keyboard, and Reduce Motion disables transitions, swaps them for fades, and stops shake.
- **Loading:** a new loader with a crab-run animation; preload shader programs during the loader (`renderer.compile`) to avoid first-use hitches.

---

## 5. New mode: Island Hop

### 5.1 Concept
Short handcrafted courses (35–75 s each) with a finish flag. They reuse the v1 obstacle behaviours and pattern grid format, so authoring is fast and the fairness solver validates every level. The mode is about **mastery and collection**, as a contrast to endless survival.

### 5.2 Structure
- **Four islands, six levels each:** Sunny Shore, Boardwalk Pier, Tide Pool Cove, Sunset Lagoon.
  - Level 6 of each island is a **Great Wave chase.** A towering wave follows the crab and the screen edge foams. Every bump lets it gain ground, collecting hourglass shells pushes it back, and reaching the lighthouse flag wins.
- **Stars per level (3):**
  1. Reach the flag.
  2. Collect all 3 Golden Sand Dollars, which are placed on risky but fair lines.
  3. A level-specific challenge, for example "no bumps", "collect 80% of shells", "finish without hopping", or "finish in under 45 s" on speed-ramp levels.
- **Island gates:** Island 2 needs 10 stars, Island 3 needs 24, Island 4 needs 40. 72 stars in total.
- **Rewards:** first clear gives shells and XP; each star gives XP; completing an island gives a Wardrobe item (hat or trail); 72 stars unlocks a special "Gold Crab" body.
- **Fail and retry:** a crash fails the level and offers "Retry" instantly. There are no lives or energy. Fixed seeds per level, so the course is learnable.
- **Power-ups:** placed deliberately per level (no random power-ups). No upgrades apply, so levels are fair for everyone.

### 5.3 Level format (`sim/levels/*.ts`)
```ts
level('shore-3', {
  island: 0, speed: { start: 11, end: 14 }, length: 'auto',
  star3: { kind: 'noBumps' },
  sections: [
    { pattern: 'castle-pair' }, { gap: 10 },
    { grid: `
      d.B
      .s.
      B.s`, spacing: 9 },          // 'd' = golden sand dollar
    { pattern: 'wave-1', powerup: 'magnet' },
    ...
  ],
});
```
- Sections reference library patterns or inline grids. A new `d` cell marks a sand dollar, and `H` marks an hourglass shell (chase levels).
- **Validation:** every level passes the fairness solver at its speed range (unit test), and the autopilot must finish each level and collect all 3 dollars (unit test).
- **Difficulty curve:** island 1 sits at v1 tier 0–1 density, island 4 at tier 3–4. Each island introduces one twist:
  - Shore: sand dollars.
  - Pier: gulls plus planks that *collapse after you pass* (visual only).
  - Cove: **tide pools that slow you** (a new LOW variant that's walkable but slows speed by 15% for 1 s).
  - Sunset: **bounce pads** (a new cell `^` that auto-hops you, used to reach high sand dollars).

### 5.4 Sim changes
- `World` gets a `mode: 'endless' | 'level' | 'daily'` and a `RunRules` object (speed curve, finite length, power-up policy, objectives tracker).
- The spawner gains a **scripted section queue** (generalising the v1 tutorial queue) and an end-of-level flag entity.
- New entities: `dollar`, `hourglass`, `pad`, `tidepool`, `flag`, `chaseWave`.
- An **objectives tracker** (pure) evaluates star conditions live and at the finish.

---

## 6. Retention feature: Sunny Pass, Daily Tide, Wardrobe

### 6.1 Sunny Pass (the backbone)
- A free 40-tier track. **XP** comes from every mode:
  - distance ÷ 30 (retuned in Phase G from ÷ 10);
  - shells ÷ 15 (retuned in Phase G from ÷ 5);
  - goals: 50 each;
  - level stars: 40 each;
  - first clear: 60;
  - Daily Tide: 150 plus the streak bonus.
- XP per tier grows gently (`100 + 25·tier`), so about 20 tiers in the first 2–3 hours and all 40 in about 10 hours.
- **Rewards** alternate: shells, hats, trails, crab colour variants, victory dances, and "Golden Shell" boosts. A boost is a one-run 2× shells token; at most 3 stored; never required.
- Major rewards every 5 tiers show on the Home bar ("Next: Pirate Parrot hat, 2 tiers").
- The **Pass level badge** appears next to the player's best on Home and results.

### 6.2 Daily Tide (a reason to come back each day)
- One challenge per calendar day (local date seeds the RNG; everyone on the same day gets the same course).
- **One modifier per day** from a rotation:
  - "Low Tide": more shells, faster.
  - "Gull Day": twice as many gulls.
  - "Big Waves": only waves and logs.
  - "Mirror Beach".
  - "Magnet Madness": magnet always on, double speed ramp.
  - "Night Run": sunset palette, lanterns.
  - "Ball Storm".
- **Scoring:** distance plus a shells bonus. Unlimited attempts; the best counts.
- **Rewards:** the first finish of the day gives 150 XP and 100 shells. The **streak** (consecutive days with a finish) adds +10% XP per day up to +70%, and a 7-day streak gives a cosmetic.
- **Missing a day** resets the streak. To stay generous, one free "streak saver" is granted every 7 days and used automatically.
- Daily Tide is offline-friendly: it's purely client-side and date-based. Clock changes are allowed; there's no anti-cheat, since this is single-player.

### 6.3 Wardrobe (mix and match)
- Separate **body** (the six v1 crabs plus colour variants), **hat** (the six v1 hats plus 12 new ones, for example a parrot, sunflower, beanie, snorkel mask, crown, chef hat, propeller cap, flower crown, headphones, bucket hat, viking helmet and halo), **trail** (sand puffs, bubbles, petals, sparkles, music notes, rainbow), and **victory dance** (6).
- Any combination works, so hats need a standard attach socket plus per-body offsets.
- **Sources** are shown on every locked item: shells (existing crabs), Sunny Pass tiers, Island Hop completion, Daily streaks.
- **v1 migration:** owned crabs map to owned bodies plus their hats.

### 6.4 Why this keeps players engaged
- Every run in any mode visibly fills the Pass bar.
- Daily Tide gives a fresh reason each day, and the streak flame is visible on Home.
- Island Hop gives finite, completable goals: stars, gates, a level map to fill.
- The Wardrobe gives identity and expression.
- All of it is free and generous, with no timers that block play and no chores. Goals from v1 remain and also pay XP.

---

## 7. Audio refresh
- **Music:** three synthesised loops, each with its own mood:
  - the Beach Run loop, with a variant arrangement per zone: Pier adds whistle melody, Cove adds steel-drum arpeggio, Sunset slows to a mellow tempo;
  - an Island Hop loop that is upbeat with a bouncy bass;
  - a Great Wave chase loop that is driving and tense.

  Zones crossfade.
- **New SFX:** sand dollar chime (special), level win fanfare, star stamps (3 rising pitches), Pass tier-up, claim, wardrobe equip, gull squawk, bounce pad boing, tide pool splash, wave chase rumble (looped, volume by distance), UI swipe/whoosh for transitions.
- **Spatial touches:** pan SFX by x, and a low-pass on sounds behind the camera.
- Keep the total synthesis at boot under 150 ms of main-thread time by generating in chunks across idle frames.

---

## 8. Technical approach

### 8.1 Structure changes
```
src/render/shaders/     toy.ts  outline.ts  ground.ts  ocean2.ts  sky2.ts  foliage.ts
src/render/anim/        spring.ts  tween.ts  crabAnimator.ts  poses.ts
src/render/models/      crab2.ts  hats/*.ts  obstacles2.ts  props2/*.ts  sealife.ts
src/sim/modes/          rules.ts  levels.ts  daily.ts  objectives.ts
src/sim/levels/         shore.ts  pier.ts  cove.ts  sunset.ts
src/meta/               pass.ts  wardrobe.ts  daily.ts  xp.ts      (pure, tested)
src/ui/                 tokens.css  router.ts  screens/*.ts  components/*.ts
```

### 8.2 Save v2
Bump to `v: 2` with a migration from v1, covered by a unit test that loads a real v1 blob. New fields:
- `xp` and `passTier`, plus the list of claimed pass tiers;
- `wardrobe: {owned: {bodies, hats, trails, dances}, equipped}`;
- `levels: Record<id, {stars: boolean[3], best: number}>`;
- `daily: {lastDate, streak, savers, bestToday, history}`;
- `boosts`;
- new settings: `haptics`, `leftHanded` and `swipeSensitivity`.

### 8.3 Performance budgets (unchanged targets, new allocation)

| Tier | Calls | Triangles | Notes |
|---|---|---|---|
| High | ≤ 110 | ≤ 180k | Outlines on, crab shadow map, sea life, full foliage sway |
| Medium | ≤ 85 | ≤ 110k | Outlines on, no shadow map |
| Low | ≤ 60 | ≤ 60k | v1-like: LOD models, no outlines, no sea life, simpler ocean |

- Shader programs are precompiled in the loader.
- One material per shading class, so state switches stay minimal.
- Measure with the existing `perf.cjs` approach (make it a real script: `scripts/perf.mjs`) in every zone and in a busy level.
- If a phone can't hold 50+ fps on Auto, the auto-quality manager must reach Low within 6 s.

### 8.4 Risks and mitigations

| Risk | Mitigation |
|---|---|
| The custom shader costs too much on low-end GPUs | The Low tier keeps a Lambert-cheap path (no rim or specular), selected by define |
| Outlines double draw calls | Merge into the same geometry with a second group, and only on hero objects |
| The animation system grows complex | Pose functions are pure, so they're unit-testable; keep the state count to the table in 3.2 |
| Level authoring takes long | Reuse the grid format and library patterns; the solver and autopilot tests catch unfair layouts immediately |
| Save migration bugs | A migration test with real v1 blobs plus the corrupt-data fallback |
| iOS Safari quirks with the new UI | Test at 390×844 and 844×390 every phase; avoid `backdrop-filter` (expensive), use pre-dimmed overlays |

---

## 9. Phases

Each phase ends **green**: `npm test`, `node scripts/smoke.mjs`, `scripts/perf.mjs` within budget, screenshots reviewed, then commit and push. 📸 marks the checkpoints where screenshots go to the owner.

**Phase A: Foundations** (no visible change)
- Shader module with toy, outline and ground, the material registry, the animation framework (springs and tweens), the screen router and tokens.css, the save v2 migration, and the meta modules (xp, pass, wardrobe, daily) with tests.
- `scripts/perf.mjs`.
- Done when: v1 looks and plays the same, plus tests for migration, XP, pass and daily seed.

**Phase B: Rendering overhaul**
- Swap all materials to the toy shader, with zone lighting palettes.
- Ocean v2, sky v2, grading, vignette, improved shadows (and the High shadow map), sand ripples and footprints.
- 📸 Before and after comparisons in all four zones, on phone and desktop.

**Phase C: Models v2 and animation**
- The geometry toolkit, then crab v2 with the rig and `CrabAnimator` (every state in 3.2).
- Obstacles v2, power-ups and shells v2, prop expansion, living-world animation, LODs, obstacle entrances, camera springs, the shell-to-HUD fly.
- 📸 A crab turntable, a hop sequence strip (6 frames), a crash sequence strip, and each zone.

**Phase D: UI overhaul**
- All screens rebuilt on the router and design tokens: Home diorama, HUD, pause sheet, staged results, settings with stats, loader, transitions, haptics, accessibility pass.
- 📸 Every screen on 390×844, 844×390 and 1920×1080.

**Phase E: Island Hop**
- Level format, the scripted queue, new entities (sand dollar, hourglass, pad, tide pool, flag, chase wave), the objectives tracker.
- 24 levels authored and validated (solver plus autopilot clear tests).
- Island map, level intro and end screens, gates and rewards, the Great Wave chase.
- 📸 Map, a level in each island, a chase level, star results.

**Phase F: Sunny Pass, Daily Tide, Wardrobe**
- XP from all modes, the pass track screen with claiming, Daily Tide (modifier rotation, streak, savers), the Wardrobe (bodies, hats, trails, dances, 12 new hats, 6 trails, 6 dances), Home cards and badges.
- 📸 Pass, Daily, Wardrobe, Home with streak.

**Phase G: Audio and final polish**
- Music loops and per-zone variants, new SFX, spatial touches.
- Balance pass: XP curve, level difficulty with simulated players (extend the balance test to levels: a novice should clear island 1 levels in 1–3 attempts), economy.
- Bug bash, perf pass, README update, deploy.
- 📸 Final "Update 2" set plus a short summary.

---

## 10. Definition of done (Update 2)
- [ ] Every object uses the new shading. Zones visibly re-light objects. Outlines and shadows behave per tier.
- [ ] Crab v2 with every animation state in §3.2 and the six signature emotes. The living world elements in §1.7 are present.
- [ ] All screens moved to the new UI system, with transitions, Reduce Motion support, keyboard access, and layouts at all five reference viewports.
- [ ] Island Hop: 24 levels plus 4 chase levels counted within them, star scoring, gates, rewards. Every level passes the solver and is cleared by the autopilot with all sand dollars.
- [ ] Sunny Pass (40 tiers), Daily Tide (modifier rotation, streak, saver), Wardrobe mix-and-match with the v1 crabs migrated.
- [ ] Save v2 migration tested. No v1 player loses progress.
- [ ] Tests, smoke test (extended to the new screens and modes), soak test and perf budgets all pass. No console errors.
- [ ] Bundle stays at or under 450 KB gzipped (code plus fonts), with no external assets.

## 11. Testing checklist additions
- **Automated:** level solver and clear tests, migration tests, XP/pass/daily unit tests, smoke flows for the map → level → stars → next path, pass claim, wardrobe equip, and Daily Tide start/finish/streak (fake the date via a hook).
- **Devices (owner):** iPhone (feel of the new animations at 60 fps, transitions not janky, Daily date correct), Chromebook (Auto quality lands on a smooth tier, outlines are fine), PC (High tier shadows, 144 Hz smoothness).

## 12. Working agreement
- Same rules as v1 (`CLAUDE.md`).
- Ship phases in order.
- Don't start Phase E content until Phases B to D look right in screenshots.
- Prefer fewer, beautiful things over many average ones. If time runs short, cut prop variety before cutting animation quality, and cut chase levels down to 2 before cutting star scoring.
- Send real screenshots at each 📸, with 2–4 lines on what changed and what's next.
