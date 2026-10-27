# Crab Dash: Update 4 Plan ("Race Day")

The plan for the fourth major update, in two parts. Read it alongside `PLAN.md`, `UPDATE2_PLAN.md`, `UPDATE3_PLAN.md` and `CLAUDE.md`. All earlier rules still apply: no downloaded assets, the sim stays pure, the 120 Hz fixed step, the five reference viewports, and the per-tier performance budgets.

The owner asked for the plan to come first and to steer the build, so every phase below has a written spec and checkable acceptance criteria. A phase is not started until the one before it passes its criteria.

---

## 0. Summary

| Ask | Answer in Update 4 |
|---|---|
| **Part 1.** A more intuitive, visually appealing and detailed UI, with high-quality animations | A shared **screen kit**: one header, scroll body and pinned action bar for every screen, a type and spacing scale that adapts to the screen, a toast lane, and bottom sheets. On top of it come richer card art, a consistent icon set and a motion system (springs, count-ups, staggered entrances, card-to-screen morphs) (§2, §3) |
| **Part 1.** High-quality, detailed models | **Models v2**: smooth-shaded, detailed obstacles, pickups and hero props, paid for by a scenery budget reclaim. Obstacles get new animations (gull wings, beach-ball bounce, sandcastle crumble, NPC crab scuttle), and the crab's back gets more detail now that it runs away from the camera (§4) |
| **Part 1.** The phone UI is cluttered and squished | A **phone-first pass** over every screen at 360×640, 390×844 and 844×390, with a per-screen spec (§2.3). It is enforced by new UI-audit rules: the primary button visible without scrolling, a minimum font size, no toast covering the wallet, and a cap on top-bar items |
| **Part 2.** A brand-new game mode | **Crab Cup**: race three rival crabs down the beach. Crashes cost time instead of ending the race, shells charge a Shell Dash boost, riptide currents push you forward, and the finish is a 3D podium. It has three cups of three races each, with trophies, rewards and rival personalities (§5) |
| **Part 2.** Harder Beach Run | A steeper **speed curve**, tighter gaps, a new **Riptide** tier past 4 km, and two new hazards: **scuttler crabs** that change lane and **double waves**. All of it stays fair under the existing solver and autopilot tests. Income is rebalanced so shorter runs still progress (§6) |

Out of scope: online multiplayer, accounts, monetisation, new zones for the endless run.

---

## 1. Audit (done before writing this plan)

Screenshots of every screen at 360×640, 390×844 and 844×390 (`docs/screenshots/a4-*`), a balance report and a performance check.

### 1.1 Phone UI problems found

| # | Screen | Problem |
|---|---|---|
| P1 | Home | The top row holds four chips (profile, shells, pearls, help). The profile name truncates to "B…" and the "Tier 0 · 0/100 XP" text spills outside the card at 360 px |
| P2 | Home | Seven stacked layers (top chips, logo, update tag, goals chip, carousel, dots, six-tab nav) leave the crab squeezed between them; the six nav labels are cramped |
| P3 | Home (landscape) | The carousel overlaps the crab and sits right on the nav bar; the next card is cut off ("Isla…") |
| P4 | Wardrobe | The Outfits row wraps badly: slot 3 drops to its own line beside "Surprise me", pushing the grid down |
| P5 | Daily Tide | The hero card is hidden under the header ("…Madness" cut off). Seven stacked panels before Play; at 844×390 the Play button sits below the fold |
| P6 | Crab Cove | Toasts land on the wallet (the shells count is unreadable). The Comfort bar, shells, pearls and gift button pile into the top-right corner |
| P7 | Sunny Pass | "Tier 31 of 40" breaks over two lines; the reward cards are cut at both edges with no hint that they scroll |
| P8 | Level Complete (landscape) | The Next Level, Retry and Map buttons are cut off at the bottom |
| P9 | All | No common header, so back buttons, titles and wallets sit in different places on every screen; spacing and type sizes vary from screen to screen |
| P10 | All | On phones, the important action (Play, Claim, Next) often needs scrolling; nothing is pinned |

### 1.2 Models and animation
- **Boulders and headlands:** flat-shaded, chunky facets. **Pier shacks:** plain boxes. Shells and power-ups are simple shapes.
- **Gulls:** wings are rigid planes. **Beach balls:** slide rather than roll and bounce. **Sandcastles:** pop out on a crash.
- **The crab:** now seen from behind on the run, so its back plates, rim and leg tips carry the look.
- **Performance headroom is thin:**

  | Tier | Draw calls | Triangles | Budget |
  |---|---|---|---|
  | High | 71 | 118k | 100 / 150k |
  | Medium | 63 | 96k | 80 / 100k |
  | Low | 50 | up to 59k | 60 / 60k |

  Any added detail must be paid for first (§4.1).

### 1.3 Difficulty today (`BALANCE=1` report)
- Median runs: novice 1.0 km, average 1.9 km, skilled 3.9 km.
- Speed climbs from 10 m/s toward 24 m/s with a 1,800 m time constant, so the first kilometre is gentle and the top tier starts at 2.8 km.
- Most crashes are blocks and sweeps; the hazard set has not changed since v1.

---

## 2. Part 1a: Screen kit and phone-first layout

### 2.1 Layout system (tokens and helpers)
- **Size classes**, set as a `data-size` attribute on `<html>` from the viewport and refreshed on resize:

  | Class | When |
  |---|---|
  | `compact` | width < 400 or height < 700, portrait |
  | `short` | height < 480, landscape |
  | `regular` | everything else |

  CSS uses these classes instead of scattered media queries.
- **Fluid type scale** in `tokens.css`, using `clamp()`:

  | Token | Range |
  |---|---|
  | Display | 28–44 px |
  | Title | 22–30 px |
  | Body | 15–17 px |
  | Caption | 12–13 px |

  **Nothing renders below 12 px.**
- **Spacing:** a 4/8 px grid (`--s-1`…`--s-6`).
- **Radius:** tokens for cards, pills and sheets.
- **Safe areas:** applied once by the screen kit, not per screen.

### 2.2 Screen kit (`src/ui/kit.ts`)
- `screen({ title, back, wallet, tabs?, body, actions? })` builds the shared parts:
  - **Header:** back button, title (auto-shrinks), wallet chip with shells and pearls stacked in one pill.
  - **Optional tab strip.**
  - **Scroll body.**
  - **Pinned action bar:** the primary button, plus up to two secondary buttons, on a frosted footer inside the safe area.
- **Toast lane:** a fixed slot under the header that never overlaps the header, wallet or action bar. Toasts queue (at most 2 visible) and condense on compact screens.
- **Bottom sheet:** drag-to-dismiss, used for secondary content on compact screens (outfits, calendar, almanac, item details).
- **Number roll:** an animated count-up for currencies and scores.
- Migrate every overlay screen to the kit:
  - Wardrobe, Pass, Daily, Map, Level intro and end, Cove, Stats, Settings, Results, Chest, Pause.
  - The kit removes about a dozen hand-rolled headers.

### 2.3 Per-screen phone spec (the target at 360×640)

| Screen | New layout |
|---|---|
| **Home** | **Top bar:** avatar with a level ring (tap for profile), then one wallet pill; Help moves into Settings. **Middle:** logo above the crab (smaller on compact). Goals become a small "3 goals" badge on the Play card. **Carousel:** the focused card takes 86% of the width and the neighbours peek 6% with fade edges; the dots hide on compact. **Nav:** five tabs (Home, Wardrobe, Pass, Cove, More); More opens a sheet with Stats, Settings, How to play and Daily history. **Landscape:** carousel on the right, crab on the left, nav as a vertical rail on the left. |
| **Wardrobe** | **Header:** wallet. **Tabs:** icons, with labels only on regular screens. **Outfits:** a single row of three compact slots plus a die button, in the tab strip's overflow; saving and loading happen in an Outfits sheet. **Grid:** 3 columns on compact, 4 on regular. **Detail strip:** pinned in the action bar (name, price, Wear or Buy). |
| **Daily Tide** | **Hero:** today's twist, never under the header. **Below the hero:** one stats row (streak, best, savers), then the reward track. **Calendar and almanac:** behind two chips that open sheets. **Play:** pinned in the action bar with the countdown under it. **Landscape:** two columns. |
| **Sunny Pass** | **Header row:** tier ring, progress bar and "Claim all" on one line. **Reward track:** fade edges and a scroll hint. **Bonus chests:** a strip above the track. |
| **Crab Cove** | **Top:** a single status bar with Comfort, gift progress and wallet; toasts go to the lane. **Drawer:** a bottom sheet that snaps to peek, half and full; the island camera reframes as the sheet moves. |
| **Results, Level intro, Level end, Chest** | **Main action pinned:** Play Again, Play, Next Level or Awesome. Secondary actions sit beside it, and the content scrolls above. |
| **Settings, Stats** | **Settings:** grouped lists with section headers. **Stats:** two-column tiles with big numbers, and a "Records" section. |
| **Run HUD** | **Pause button:** smaller on compact. **Lane arrows:** auto-hide after the first ten lane changes. **Power-up timer:** a ring around the pause button instead of a separate bar. |

### 2.4 Audit rules added to `scripts/ui-audit.mjs`
1. **Pinned action visible:** every screen's primary button is fully inside the viewport, with no scrolling, at all five viewports.
2. **Minimum font size:** at least 12 px for all visible text.
3. **Toast clearance:** a toast does not overlap the header, wallet or action bar. The audit forces a toast on every screen.
4. **Top-bar limit:** at most 3 interactive items in a header (back, title action, wallet).
5. **No truncated currency or score text.**
6. **The existing checks** stay: overlaps, text overflow, 44 px tap targets, horizontal scroll.

**Acceptance (Part 1a):**
- All rules pass at all five viewports.
- Before/after screenshots of every screen at 360×640 and 844×390 are sent to the owner.

---

## 3. Part 1b: Visual detail and UI motion

### 3.1 Visual detail
- **Mode cards:** layered illustrated SVG scenes with parallax layers that drift with device tilt (pointer on desktop). There are four cards:
  - Beach Run: sun, palms, waves;
  - Island Hop: island chain;
  - Daily: tide clock;
  - Crab Cup (new): race flags and a podium.
- **Icon set v2:** one stroke weight, a two-tone fill and the same 24 px grid. It replaces the mixed icons in the nav, tabs and settings.
- **Panels:**
  - a soft paper texture, generated as a CSS gradient noise pattern;
  - an inner highlight and a deeper drop shadow;
  - coloured section headers with small illustrated badges.
- **Rewards:** shells, pearls and XP get gem-like SVGs with highlights, used everywhere the currencies show.

### 3.2 Motion system (`src/ui/motion.ts`)
- **Press:** buttons press with a spring (scale 0.96, then overshoot); cards tilt slightly toward the touch point.
- **Entrances:** content staggers in (40 ms apart, rising 12 px with a fade). Exits are faster (120 ms).
- **Card morph:** a mode card grows into its screen (FLIP-style) and shrinks back on exit.
- **Rewards:** the number roll counts up, coins fly into the wallet pill along an arc, and the wallet bumps when they land.
- **Tab underline:** a spring indicator slides between tabs; the nav icons bounce when picked.
- **Reduce Motion:** fades only.
- **Performance:** only `transform` and `opacity` are animated; frame-time checks run on the slowest preset during the audit.

**Acceptance (Part 1b):**
- `npm run shots` scenes show the new card art and the icon set at every viewport.
- A recording strip (`scripts/ui-motion.mjs`) of the press, morph and reward-fly animations.
- With Reduce Motion on, nothing moves except fades.

---

## 4. Part 1c: Models v2 and in-game animation

### 4.1 Budget reclaim first
- **Scenery LOD:** tiles beyond 55 m use low-detail meshes. Palm trees and rocks past the fog midpoint switch to impostor billboards on Low.
- **Merge** the pier rope and post segments, and the lamp posts, into one instanced draw.
- **Target** (headroom used in §4.2):

  | Tier | Triangles | Draw calls |
  |---|---|---|
  | Medium | ≤ 85k | ≤ 72 |
  | Low | ≤ 50k | ≤ 52 |

### 4.2 Detailed models (all generated in code)

| Model | v2 detail |
|---|---|
| Sandcastle (block) | Smooth-shaded towers with crenellations, a shell-studded gate, flags that flutter in the wind shader, and a moat ring |
| Crate (block, pier) | Planks with nail heads and rope binding; stencilled fish logo |
| Boulder (block, cove) | Smooth noise-displaced rock with moss caps, barnacles and a wet sheen at the base |
| Gull (dive) | Layered wing feathers on a two-bone wing rig, a tail fan and an orange beak with a hook |
| Beach ball (roller) | Six-panel sphere with seams; it rolls (spin matches speed) and bounces |
| Log, deck chair, urchin (low) | Bark rings and a knot (log); slatted chair with a towel; urchin spines with a wobble |
| Shells | Ridged scallop with a pearly shader tint; big shells sparkle |
| Power-ups | Magnet, bubble and surfboard models in glass orbs with a spinning inner model and a halo |
| Hero props | Pier shack with awning, shutters and fish sign; lighthouse headland with smooth cliffs and a beam at night |

### 4.3 In-game animation
- **Gulls:** flap in, glide, flare their wings to land, then hop.
- **Beach balls:** spin and squash on each bounce.
- **Sandcastles:** crumble into pooled debris on a crash or shield hit.
- **Low obstacles:** wobble when grazed.
- **Shells:** spiral into the crab with a sparkle trail on pickup; big shells pop with a ring.
- **Power-ups:** the orb pops on pickup and its model flies onto the crab.
- **Crab, seen from behind:** more detailed back plates and rim, leg tips with dark claws, and a dust kick per footfall.

**Acceptance (Part 1c):**
- `perf.mjs` is green on all tiers.
- Close-up renders of every model (`scripts/models.mjs`, new) are sent to the owner.
- The animation strips (`scripts/anim-strip.mjs`) show the gull, ball and crumble sequences.

---

## 5. Part 2a: New mode, Crab Cup

### 5.1 Concept
Race three rival crabs over a 1,200–1,800 m course. Everyone runs the same course (the same seed), so dodging still matters. Finish in the top three to win. Each cup is three races, scored by points (10, 6, 3, 1).

### 5.2 Rules (sim: `src/sim/race.ts`)
- **Crashes:** a crash is a **stumble**. The racer tumbles for 0.9 s, is slowed to 40% speed, then recovers with 1 s of invulnerability. A shield still absorbs the hit.
- **Shell Dash:** shells fill a meter (25 shells). When it is full, a Dash fires automatically: 2.5 s at ×1.35 speed, which breaks low obstacles and hops waves on its own. Close shaves add 2 shells' worth.
- **Riptide currents:** marked lane strips, 12 m long, give ×1.2 speed while you are on them. The spawner places them as patterns.
- **Power-ups:** the magnet and shield appear; Wave Rider becomes "Surf Dash".
- **Positions:** decided by distance (finishing time once crossed). Ties go to whoever crossed first in sim time.
- **Rivals:** each runs its own `World` copy with the same seed, steered by an `Autopilot` with a per-rival skill profile, plus mild rubber-banding: speed ±3% depending on the gap to the player, capped.
- **Determinism:** pure sim and seeded, so a race replays exactly from its seed and inputs (tested).

### 5.3 Cups and rivals

| Cup | Races (zones) | Rival skill | Reward |
|---|---|---|---|
| Sandy Cup | Shore, Shore→Pier, Pier | novice → average | Racing Stripes trail, 300 shells |
| Tidal Cup | Pier→Cove, Cove, Cove→Lagoon | average → skilled | Race Helmet hat, 25 pearls |
| Sunset Cup | Lagoon, Lagoon at night, the full beach | skilled + rubber-band | Golden Trophy dance, the "Cup Champion" title, 60 pearls |

- **Rivals:** Shelly (steady), Captain Barnacle (aggressive dash timing) and Pip (reckless, fast). They reuse the Cove friends, so the two features connect.
- **Unlocks:** each cup unlocks when the previous one is cleared (top 3 overall).
- **Gold trophies:** finishing 1st in all three races of a cup earns a gold trophy, shown on the Cove Trophy Shelf.

### 5.4 Presentation
- **Grid:** the race opens with a start-line camera: rivals in three lanes and the player behind, a 3-2-1 countdown and an airhorn.
- **HUD:**
  - a position badge ("2nd") that bounces when it changes;
  - a progress strip with the crab heads;
  - the Shell Dash meter around the shell counter;
  - "+2 places!" callouts.
- **Rivals:**
  - Full crab models with their own colours and hats. On Low, a merged single-draw rival mesh: 3 draw calls in total.
  - Name tags fade with distance.
  - A rival in the player's lane at the same distance is pushed 0.35 m sideways so the models never overlap.
- **Finish:** a flag arch. Then a podium scene with the 3D podium, the top three crabs doing their dances, confetti, points and cup standings.
- **Screens:**
  - **Cup select:** three cup cards with trophies and locks.
  - **Race intro:** course strip, rivals and rewards.
  - **Race results:** podium plus standings.
  - **Cup results:** trophy.
- **Audio:** race music (a faster beach mix), countdown beeps, a Dash whoosh and crowd cheers at the finish.

### 5.5 Save v4
- `cup`:
  - `unlocked`;
  - `best[cupId]` (best total points);
  - `golds[cupId]`;
  - `races` (count).
- The new trophy family "Racer" (win 1 / 10 / 25 races) feeds the existing achievements.
- **Migration:** from v3, with defaults, sanitising and a migration test.

**Acceptance (Part 2a):**
- **Unit tests:**
  - a race is deterministic per seed;
  - all four racers always finish (no soft-lock);
  - a stumble never ends the race;
  - positions sort correctly;
  - rival autopilots finish every race in 99% of seeds;
  - the Dash meter maths.
- **Smoke:** open Crab Cup, finish a race on autopilot and see the podium.
- **Performance:** a race with 3 rivals stays within budget on every tier.
- **Screenshots:** grid, mid-race, Dash, podium, cup select (phone + desktop).

---

## 6. Part 2b: Harder Beach Run

### 6.1 Tuning (`CFG`)

| Knob | Now | Update 4 |
|---|---|---|
| `speed.start` | 10 | 11 |
| `speed.gain` | 14 | 17 (top speed 28 m/s) |
| `speed.tau` | 1,800 | 1,300 |
| `gapMin` / `gapMax` | 8 / 14 | 8 / 14 in tiers 0–1, then 7 / 12 (tiers 2–3) and 6 / 10 (tier 4+) |
| `breatherEvery` | 3–4 patterns | 4–5, then 5–6 past 2.8 km |
| `tierStarts` | 0, 150, 700, 1,600, 2,800 | 0, 150, 600, 1,400, 2,400, **4,000** (Riptide) |
| `rollerSpeed` | 5 | 5, then 7 past 2.4 km |

The first 150 m (the tutorial tier) stays gentle.

### 6.2 New hazards (sim, fairness-checked)
- **Scuttler crab:** a red rock crab that switches one lane mid-row.
  - It telegraphs for 0.8 s: claws raised and an arrow on the sand.
  - The solver treats it as occupying both lanes during the switch window.
  - Hop over it or dodge into the lane it left.
  - Appears from tier 2.
- **Double wave:** two sweeps 0.55 s apart. It needs a hop and then a second hop (or a slam to land early). From tier 3.
- **Riptide tier (tier 5, 4 km+):** combo patterns that mix scuttlers, gulls and rollers with shorter breathers. The sky darkens to storm clouds and the wind picks up.

### 6.3 Fairness and balance
- **Solver:** extended for lane-switching occupancy and double sweeps. Every new pattern is validated at the tier's top speed.
- **Autopilot:** learns to read scuttler telegraphs and double waves. The fairness test (hundreds of kilometres with no unavoidable crash) must still pass.
- **Targets** (`BALANCE=1`):

  | Profile | Median run |
  |---|---|
  | Novice | 550–750 m |
  | Average | 1.0–1.4 km |
  | Skilled | 2.2–3.0 km |

- **Income:**
  - Shells per metre goes up and the distance XP rate is retuned, so shells and XP per minute of play stay within ±10% of today.
  - Goals that ask for distance are rescaled.

**Acceptance (Part 2b):**
- The balance report hits the targets.
- Fairness, solver and autopilot tests pass.
- Income per minute stays within ±10%.

---

## 7. Phases

| Phase | Content | Exit criteria |
|---|---|---|
| **A** | Size classes, type and spacing tokens, screen kit, toast lane, sheets, number roll; ui-audit rules 1–5 written (failing) | Kit unit tests; audit rules run |
| **B** | Migrate every screen to the kit; phone layouts from §2.3; Home v4 layout and nav; landscape layouts | ui-audit fully green at 5 viewports; before/after screenshots 📸 |
| **C** | Card art, icon set v2, currency gems, motion system, card morph, reward fly | Motion strip; Reduce Motion check; 📸 |
| **D** | Budget reclaim, Models v2, obstacle animations, crab back detail | perf green on all tiers; model close-ups 📸 |
| **E** | Harder Beach Run: tuning, scuttler, double wave, Riptide tier, solver and autopilot updates, income retune | Balance targets; fairness tests; 📸 |
| **F** | Crab Cup: sim, rivals, Dash, currents, cups, screens, podium, save v4, audio | Race tests; smoke; perf; 📸 |
| **G** | Polish: What's new (Update 4), docs, full audit, deploy to GitHub Pages, final screenshots | Everything green; live site updated 📸 |

Every phase ends with `npm run build && npm test`, smoke and ui-audit (plus perf where models or scenes changed), then a commit, a push (which also deploys to Pages) and a short progress note to the owner.

## 8. Risks
- **Budget on Medium and Low:** models v2 and three rivals are the biggest risk, which is why the budget reclaim goes first. If headroom is short, rivals on Low use a merged mesh with no outline, and model detail is reduced at that tier rather than cut.
- **Fairness of the new hazards:** a lane-switching obstacle can create a trap. The solver change lands with targeted tests before any pattern uses it.
- **Too hard:** the difficulty changes are all `CFG` values, so the balance report decides the final numbers; the tutorial tier is untouched.
- **Scope:** Phases A–B (the phone fix) are the owner's sharpest pain and come first, so they ship value even if later phases need trimming.

## 9. Definition of done
- Each ask in §0 maps to shipped, screenshotted work.
- All automated checks pass: tests, smoke, ui-audit with the new rules, perf.
- The live GitHub Pages build shows Update 4. The What's new sheet introduces Crab Cup and the harder run.
