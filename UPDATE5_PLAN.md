# Crab Dash: Update 5 Plan ("Treasure Tide")

Update 4 shipped Crab Cup, a harder Beach Run and a cleaner phone layout. Update 5 polishes how the
game *feels*, makes the main menu bright and inviting, fixes the Wardrobe on phones, replaces Crab
Cove with a stickier feature (Treasure Dig), and gives the Beach Run two new hooks (Shell Fever and
Second Chance). It is scoped to land in one working session: every item below is a contained change
with a check that proves it.

## 1. What was asked, and the answer

| Ask | Answer in Update 5 | Phase |
|---|---|---|
| Fix the crab's eyes (cohesive, not glitched) | Iris, pupil and highlights become caps that wrap the eyeball instead of flat discs that poke out at angles; eyes can't swing up into the hat; lids match the shell | A |
| Smoother, slightly slower side-to-side | Lane glide becomes a critically damped spring (eases in *and* out, no snap at the start); 0.13 s → 0.17 s to settle; the crab leans with lateral velocity | A |
| Cool jump-then-swipe-down animation | **Sand Slam**: tuck-and-spin on the dive, then on impact a shockwave ring across the sand, a radial sand burst, a crater scorch that fades, a squash pose, a camera punch and a heavier thump. Gameplay bonus: the shockwave pulls in nearby shells | A |
| Smaller magnet range, more satisfying draw | Range: 2 lanes / 30 m → 1 lane either side / 16 m. Pulled shells accelerate along a curved arc, spin and shrink into the crab instead of sliding in a straight line | A |
| Power-ups never on top of another power-up or a shell | Shell strands skip the cell holding a power-up (and 1.4 m either side); no power-up spawns within 12 m of another | A |
| Stunning but light coin pickup | Pickup = a scale-pop and spin, a gold ring burst (one pooled sprite, no new draw calls), a short sparkle; the HUD counter does a springy bump with a rolling number. Particle counts scale with quality tier | A |
| More addictive, fun basic mode | **Shell Fever**: a meter fills from shells and close shaves; when full, 6 s of 2× shells, a golden trail, a short-range auto-pull and a music lift. **Second Chance**: once per run, after a crash, continue for pearls (cost rises per day) or for free with the daily freebie; obstacles ahead clear and you get 2 s of protection | B |
| Remove decorations, replace with something better and stickier | **Treasure Dig** replaces Crab Cove (see §3) | C |
| Redesign the UI: vibrant, smooth, unique; bright main menu | New bright palette (sunshine yellow, coral, aqua, candy pink), glossy candy buttons, a sunburst behind the logo, a big pulsing Play button, white frosted top bar and nav with colourful icons, animated sparkles on cards. Applied app-wide through the design tokens | D |
| Fix the Wardrobe on phones | Portrait phones: the crab preview gets the top ~40% (camera framed for it), the panel the rest; a 4-column compact grid; Outfits and Surprise move into a compact chip row; detail bar slimmer. Short-landscape keeps the side-by-side layout | D |
| Further detail the maps | Each zone gets new props: dune grass tufts, driftwood, seaweed, starfish clusters, beach towels and sandcastle ruins (Shore); rope posts, lamp posts, crates and gull perches (Pier); coral heads and anemones (Tide Pool); lanterns, tiki torches and flower bushes (Sunset). Plus a moving fishing boat and sail boats offshore. Small props only near the track; budgets hold on every tier | E |

## 2. Feel (Phase A) details

- **Lane spring:** `x'' = ω²(target − x) − 2ω·x'`, with ω chosen so that 95% of the move is done in
  `CFG.laneChangeTime = 0.17`. The fairness solver and autopilot tests must stay green (they use
  the sim, so they test the new curve directly).
- **Slam:** a `slamLand` event carries x and the fall speed. View: shockwave ring (one mesh, scaled
  and faded), a crater decal (one mesh, reused), 18 sand particles, `crab.slamPose()` (squash +
  claws out), and camera shake plus a small FOV kick. Sim: a slam landing marks shells within 4 m
  ahead in the player's lane and its neighbours as magnet-pulled.
- **Magnet pull:** each pulled shell gets `pullT`; it moves along a quadratic curve from its start
  to the crab with an ease-in (accelerating), so the last frames feel like a snap into the crab.
- **Pickup FX:** `ShellPop` pool in the view (InstancedMesh of ring sprites, 24 max), plus a tiny
  sparkle burst. Low tier: ring only.

## 3. Treasure Dig (Phase C)

A dig site is a 6 × 5 grid of sand tiles hiding **3 relics** (shapes 1×2, 2×2 and 1×3), shell piles,
pearls, bonus spades and one stick of dynamite. Each tap spends a **spade** and digs a tile.

- **Spades come from playing:** a Beach Run pays 1 + 1 per 400 m (max 6); Daily Tide +3; a level
  clear +1 (+1 per new star); a race +2 (+1 for a win); each goal +1. Store up to 50.
- **Hot or cold:** an empty hole shows how close the nearest unfound relic tile is (red adjacent,
  orange 2 away, blue further). Skill, not just luck.
- **Dynamite** digs a plus shape for free. **Bonus spades** refund.
- **Clearing a site** (all three relics) opens a site chest: shells and pearls that grow with every
  site, and on set sites an exclusive item (the six friend hats that lived in Crab Cove, then the
  Pearl crab at site 8). The next site has a new theme (Shore, Pier, Tide Pool, Sunset, Night).
- **Relic Museum:** every relic found goes into a 36-piece collection (12 sites × 3). Collection
  progress shows on Home.
- **Pure + deterministic:** `src/meta/dig.ts` (no DOM, no three), layouts seeded from the site
  number. Tested: layouts always fit, every tile is reachable, hot/cold distances, rewards, save
  sanitising.
- **Trophies & titles** move to their own page (from the More sheet and the profile card). The
  Cove family "Homemaker" becomes "Treasure Hunter" (sites cleared 3/10/25).
- **Save v5:** `cove` and `friends` are dropped; players are refunded half the price of every owned
  decoration (shells and pearls) plus 10 spades; friend hats already earned stay owned.
- Home: the Cove card and nav tab become **Dig**, showing spades in hand and relics found.

## 4. Second Chance and Fever (Phase B)

- **Fever:** meter in `World.fever` (0..1); +1/40 per shell, +0.1 per close shave; decays slowly
  after 3 s without a pickup. Full → `fever` event, 6 s of 2× shell value; HUD meter under the
  shell pill. Off in races and levels (they have their own systems).
- **Second Chance:** Beach Run and Daily Tide only, once per run. The crash slow-mo is followed by
  a "Keep going?" card with a 4 s ring timer: *Continue* (free once a day, then 5, 10, 15 pearls…)
  or *No thanks*. Continuing calls `World.revive()`: mode back to running, obstacles within 30 m
  cleared, 2 s invulnerability, speed kept. The run's results then include everything.

## 5. Phases and checks

| Phase | Work | Done when |
|---|---|---|
| **A** | Eyes, lane spring, Sand Slam, magnet range + curve, power-up spacing, pickup FX | Eye close-ups clean from every angle; tests (fairness, autopilot, clip, pose) green; screenshots |
| **B** | Shell Fever, Second Chance | Sim tests for fever/revive; smoke covers revive |
| **C** | Treasure Dig + Trophies page, Cove/friends removed, save v5 | `dig.test.ts`, migration tests, smoke, ui-audit at 5 sizes |
| **D** | Vibrant UI tokens + Home redesign + Wardrobe phone layout | ui-audit clean; phone shots show the crab and ≥ 2 rows of items |
| **E** | Map detail props | perf.mjs passes on high/medium/low |
| **F** | What's new (Update 5), README/CLAUDE.md, full build/test/smoke/audit/perf, screenshots, push, Pages deploy | Everything green; live build updated |

Constraints carried over: sim stays pure, tunables in `src/config.ts`, no downloaded assets, no
allocations in the frame loop, budgets per tier (High 100/150k, Medium 80/100k, Low 60/60k).
