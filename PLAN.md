# Crab Dash: Game Plan & Implementation Handoff

This is the handoff for the implementing model. Read the whole thing once before starting, then re-read the relevant section at the start of each milestone.
Concept art: `docs/concept/crab-dash-concept.webp`. Working rules: `CLAUDE.md`.

---

## 0. Summary

**Crab Dash** is a three-lane endless beach runner that plays in the browser. You play Sandy, a crab in a straw hat, scuttling down a sand track toward a distant lighthouse. You swipe or tap to change lanes and swipe up to hop. Along the way you grab golden shells and dodge sandcastles, beach balls, logs and waves. A run lasts 1–3 minutes and restarts with one tap. Every run earns shells toward new crabs and power-up upgrades, and three active goals always give you something specific to chase.

| Decision | Choice |
|---|---|
| Format | Static web game for Safari, Chrome, Edge and Firefox. It can be installed to an iPhone home screen (PWA manifest) |
| Tech | Three.js + TypeScript + Vite. No other runtime dependencies besides two font packages |
| Look | Stylized "glossy toy" low-poly 3D. Every model, texture, sound and the music are generated in code, so there are no downloaded assets |
| Mode | One: **Beach Run** (endless) |
| Verbs | Change lane (left/right), hop (up), slam (down, only while airborne) |
| Fail | A head-on hit ends the run. Clipping an obstacle from the side only bounces you back |
| Progress | Best distance · shells (the only currency) → 5 crabs + 3 power-up upgrades · 3 rotating goals · 4 zones to discover |
| Hosting | GitHub Pages via a GitHub Actions workflow |

---

## 1. Reading the concept art

**What the art shows** and how each element becomes part of the game:

| In the art | In the game |
|---|---|
| "Crab Dash" logo: chunky orange-yellow letters, straw hat on the "C", a shell between the words | Game name and title logo, built with CSS and inline SVG |
| 3 sand lanes divided by raised sand ridges, running to the horizon | The track. The ridges are low cosmetic berms; you hop lanes over them |
| Red crab, straw hat with a navy band, facing the camera, kicking up sand | Player character **Sandy**. She faces the camera and scuttles sideways (it's a crab), and sand puffs follow her |
| Shell counter top-left ("12"), distance top-right ("240m" + checkered flag) | The HUD, laid out as drawn |
| Large round blue ◀ ▶ buttons | Touch hint buttons. The real hit zones are the left and right halves of the screen |
| Glowing golden scallop shells in a trail | Collectibles, laid in lines and arcs that suggest a path through each pattern |
| Beach ball rolling with motion streaks | **ROLLER** obstacle: rolls toward you down a lane |
| Wave across the track with ^^ chevrons; panel 2 shows an ↑ arrow over it | **SWEEP** obstacle: covers all lanes and must be hopped. The chevrons on it are the "hop" cue |
| Sandcastle with flag; panel 2 shows a sidestep arrow | **BLOCK** obstacle: tall, so you have to dodge it |
| Panel 1 "Move left or right" | The core verb |
| Panel 3: six crabs (red/straw hat, blue/sunglasses, pink/flower, green/pirate hat, yellow/captain hat, rainbow/top hat) | The six playable crabs |
| Palms, red-white and blue-white umbrellas, rocks, starfish, tiny crabs, driftwood logs, a pier, huts, ocean on the right, lighthouse island, sailboats, clouds | Scenery for Zone 1, "Sunny Shore". Logs also become the **LOW** obstacle. The lighthouse sits on the horizon as a visual goal |
| Bright late-morning palette | Zone 1 palette. Later zones move through the day toward sunset |

**What I'm proposing (not in the art):** hop and slam, the Gull Drop obstacle, 3 power-ups and their upgrades, goals, zones 2–4, the best-distance banner, shell streaks and close shaves.

### Design pillars
1. **Readable in 10 seconds.** Dodge things, hop waves, grab shells.
2. **Snappy and fair.** Input responds on the same frame. Every crash is clearly the player's mistake, and every pattern can be solved.
3. **Always a next thing.** The best-distance banner, the next zone, the next goal and the next unlock are always within reach.
4. **Runs everywhere.** 60 fps on an iPhone or mid-range Chromebook, and loads in under 3 seconds.

---

## 2. Gameplay rules

### 2.1 Moment to moment
The crab runs forward on its own and speeds up over time. Every 1–2 seconds a row of obstacles arrives, and the player reads the lanes, picks a line, and changes lanes or hops. The interesting decisions are:
- **Safe lane or shell lane.** Shell trails deliberately run through slightly riskier lines.
- **Hop or switch** for logs and beach balls. Hopping keeps your lane and your shell line, but you're stuck in the air for 0.55 s.
- **Late dodges.** Leaving a lane at the last moment earns a "Close shave!" bonus.

### 2.2 Controls

| Action | Touch | Keyboard | Mouse |
|---|---|---|---|
| Lane left / right | Swipe ◀ ▶ anywhere, or tap the left/right half of the screen | ← → or A D | Click the left/right half |
| Hop | Swipe ▲ | ↑, W or Space | — |
| Slam (while airborne) | Swipe ▼ | ↓ or S | — |
| Pause | Pause button | Esc or P | Pause button |
| Menus | Tap | Enter/Space = primary button, Esc = back | Click |

Use **Pointer Events** throughout so touch, mouse and pen share one code path. Chromebooks with touchscreens produce both kinds of input at once.

**Feel rules** (these matter more than anything else):
- Resolve a swipe **during the move** as soon as the finger has travelled 22 CSS px (about 3% of the short side). Don't wait for release. A tap is a release after less than 22 px of movement within 300 ms.
- A lane change takes **0.13 s** with an ease-out curve. A new input during a change retargets immediately, so two quick swipes cross two lanes. Lane changes work in the air too.
- **Hop buffer:** a hop pressed up to 0.12 s before landing fires on landing.
- **Slam:** while airborne, gravity triples and the crab lands within about 0.1 s. This lets skilled players hop early and still recover.
- **Sideswipe:** moving into a lane where a BLOCK, ROLLER or gull overlaps the crab bounces the crab back with a 0.25 s wobble and a "bonk", and resets the shell streak. It never ends the run.
- **Head-on hit = crash**, unless a shield or invincibility is active.
- **Forgiving hitboxes.** The player box is 0.9 w × 0.8 d × 0.9 h, while the crab looks about 1.3 m wide. Obstacle boxes are 85% of their visual size.
- Key repeat is ignored. One press = one action.

### 2.3 Obstacles
These are behaviours; each zone has its own skin for each behaviour (see 2.8). The hop apex is 1.5 m.

| Type | Rule | Hitbox (w×d×h, m) | First appears |
|---|---|---|---|
| **BLOCK** | Fills 1 lane and is tall. Dodge only | 1.8 × 1.2 × 2.2 | Tutorial |
| **LOW** | 1 lane (or 2 lanes from tier 2). Hop or dodge | 2.0 × 0.6 × 0.6 per lane | Tutorial |
| **SWEEP** | Covers all 3 lanes. You must be airborne as it passes | 6.8 × 1.4 × 0.5 | Tutorial |
| **ROLLER** | Beach ball rolling toward you in a lane, 5 m/s faster than your closing speed, spinning with a dust trail. Hop or dodge | Ø 1.1 | Tier 1 |
| **GULL DROP** | A shadow appears in a lane at least 1.2 s ahead. The gull lands there about 0.8 s before you arrive and stays, flapping. Dodge only | as BLOCK | Tier 2 (Pier) |

The rule worth remembering: **tall = dodge, low = hop or dodge, full-width = hop.** Silhouettes must make this obvious without relying on colour.

### 2.4 Shells
- A shell is worth 1. A **Big Shell** (rare: larger, pulsing glow) is worth 10. The pickup radius is a generous 0.9 m.
- Shells are laid in **lines** (2.5 m apart), **arcs** over LOW, ROLLER and SWEEP (so hops pay off), and **zigzags** through BLOCK patterns (so they teach the path).
- **Shell streak.** Each pickup within 0.5 s of the previous one raises the pickup chime one step on a pentatonic scale. A gap resets it. From a streak of 10, a small "Streak ×N" appears. The streak only affects feel (and one goal), never the economy.
- **Close shave.** When a BLOCK, ROLLER or gull passes in the lane you left within the last 0.25 s, you get "Close shave! +3" with a whoosh. It rewards skillful late dodges.

### 2.5 Power-ups
A power-up floats in a bubble every 300–450 m (the first around 150 m). Only one can be active at a time; picking up a new one replaces the old.

| Power-up | Effect | Duration L0 → L4 |
|---|---|---|
| **Shell Magnet** (horseshoe) | Pulls in shells within 2 lanes and 30 m ahead | 8 s → 14 s |
| **Bubble Shield** | Absorbs one crash: the obstacle is knocked away, then 1 s of invincibility | 12 s → 24 s, or until it pops |
| **Wave Rider** (surfboard) | The crab surfs a wave 1.2 m above the track. It's invulnerable, runs at ×1.35 speed and collects shells in all lanes. On landing: 1 s of invincibility, and the spawner keeps the next 25 m clear | 4 s → 8 s |

Each upgrade has 4 levels costing **150 / 400 / 900 / 1,800** shells. The HUD shows the active power-up as an icon with a draining ring under the shell counter.

### 2.6 Crash, results, retry, pause
- **Crash:** 70 ms of hit-stop and a camera shake. The crab flips backward, the hat flies off and dizzy stars circle. Then 0.6 s of 0.4× slow-motion, and the results panel slides in about 1.0 s after impact.
- **Retry:** "Play Again" restarts in under 0.5 s with a quick fade and no camera intro. Space/Enter also restart, but only after a 0.6 s guard so a panicked press doesn't skip the results.
- There are no revives in v1. Runs are short, so a fast restart is what keeps people playing.
- **Pause** triggers on the pause button, Esc or P, and automatically when the tab is hidden, the window loses focus, or the viewport is resized or rotated mid-run. Resuming always plays a quick 3-2-1 (0.4 s per step).

### 2.7 Speed, difficulty and pattern generation
**Speed:** `v(d) = 10 + 14 · (1 − e^(−d/1800))` m/s, where d is distance in metres. That gives 10 m/s at the start, 13.3 at 500 m, 15.9 at 1 km, 19.3 at 2 km and 22.7 at 4 km, levelling off at 24. On the very first run the speed is capped at 9 m/s until the tutorial is finished.

**Tiers by distance:** T0 0–150 m (tutorial or gentle) · T1 150–700 · T2 700–1,600 · T3 1,600–2,800 · T4 2,800+.

**Generation:** the track is a sequence of **handcrafted patterns**, chosen with a seeded RNG by weighted random pick from those whose `minTier ≤ current tier`. The same pattern can't repeat within the last 4. Patterns are separated by an 8–14 m gap, and after every 3–4 patterns comes a 25 m **breather** with only a shell line in it. Higher tiers also reuse lower-tier patterns at tighter spacing.

**Pattern format** (a string grid; the top line is the farthest row, as seen on screen):
```ts
pattern('castle-slalom', { minTier: 1, spacing: 9 }, `
  B.s
  .s.
  s.B
`);
```
Legend: `.` empty · `B` block · `L` low · `W` sweep (always the full row `WWW`) · `R` roller (marks the point where the ball meets the player; the spawner starts it farther out) · `G` gull · `s` shell line · `S` big shell · `P` power-up slot. A **lowercase** obstacle letter (`l`, `r`, `w`) means "with a shell arc over it".
`spacing` is in metres at a reference speed of 12 m/s. At runtime, `rowSpacing = spacing × max(1, v/12)^0.5`, so the time between rows shrinks gently as you speed up while the rows stay readable.

**Fairness rules.** The pattern validator unit test checks these across each tier's speed range, and the spawner checks them again at runtime:
1. No row is blocked in all three lanes by BLOCK or G. There's always at least one lane you can pass on foot or by hopping.
2. Rows that force a lane change need `Δt ≥ 0.30 s + 0.15 s × lanes moved` between them.
3. Two rows that both force a hop need `Δt ≥ 0.70 s` between them. Validation never assumes the player will slam.
4. A SWEEP never comes within 0.6 s after a row that forces a lane change.
5. A gull's shadow appears at least 1.2 s before arrival. A roller is visible at least 1.3 s before contact.
6. Every pattern can be entered from any lane: its first row has at least 2 free lanes, or there's a lead-in of at least 1.0 s.
7. Power-ups and Big Shells are only placed in reachable lanes.

The validator is a small dynamic program over (row, lane) states. **Library target: about 30 patterns:** T0 ×4, T1 ×10, T2 ×8, T3 ×5, T4 ×4.

### 2.8 Zones (in-run variety)

| Zone | Starts | Time of day | Track | Scenery | Skins: BLOCK / LOW / SWEEP |
|---|---|---|---|---|---|
| **Sunny Shore** | 0 m | Late morning (as in the art) | Sand with ridges | Palms, umbrellas, huts, pier and lighthouse island in the distance, sailboats | Sandcastle / driftwood log / wave |
| **Boardwalk Pier** | 700 m | Bright noon | Wooden planks, rope posts, water on both sides | Lamp posts, bunting, striped kiosks, moored boats | Crate stack / folded deck chair / gap in the planks |
| **Tide Pool Cove** | 1,600 m | Golden afternoon | Darker wet sand with pebbles | Cliffs on the left, tide pools, coral, the lighthouse up close | Boulder with starfish / sea-urchin cluster / wave |
| **Sunset Lagoon** | 2,800 m, then endless | Sunset (orange, pink, purple) | Warm sand | Palm silhouettes, tiki torches, sun on the horizon, lanterns | Shore skins with warm lighting |

The beach ball (ROLLER) appears in every zone with colour variations, and gulls appear from the Pier onward.
**Zone transitions:** a driftwood arch with a sign spans the track at the zone's start. The palette blends over 40 m and a toast reads "New area: Boardwalk Pier!". The first visit to each zone pays a **+100 shell** discovery bonus.

---

## 3. Progression & replay

**Shells** are the only currency. You earn them from pickups, close shaves, goals and zone discoveries, and spend them on crabs and upgrades. Shells are never lost when you crash.

**Crabs** (from the art; cosmetic only, which keeps balance simple). Each has its own colours and headwear, a shop idle emote, and a coloured sand-puff trail.

| Crab | Look | Unlock |
|---|---|---|
| Sandy | Red, straw hat with navy band | Default |
| Chill | Blue, black sunglasses | 300 shells |
| Blossom | Pink, hibiscus flower | 800 shells |
| Skipper | Yellow, navy captain's hat | 1,500 shells |
| Cap'n Pinch | Green, pirate tricorn with skull | 2,500 shells |
| Dazzle | Rainbow gradient, black top hat | **Reach Sunset Lagoon** (2,800 m in one run). A skill unlock, not a purchase |

**Upgrades:** 3 power-ups × 4 levels (see 2.5).

**Goals:** 3 are active at any time. When one completes, it's replaced by the next goal from the lowest unfinished tier. Completing a goal mid-run shows a toast with a chime, and the reward is paid out on the results screen. After the pool runs out, generate scaled goals (for example, best distance + 500 m). Starting pool:

| Tier (reward) | Goals |
|---|---|
| 1 (60) | Run 300 m · Collect 40 shells in one run · Hop 5 times in one run · Switch lanes 25 times in one run · Grab a power-up · Play 3 runs |
| 2 (120) | Run 800 m · 100 shells in one run · Hop over 5 waves in one run · Reach Boardwalk Pier · Ride the Wave Rider · Get 3 close shaves in one run |
| 3 (220) | Run 1,500 m · 200 shells in one run · Run 500 m without collecting a shell · Reach Tide Pool Cove · Shell streak of 30 · 4 power-ups in one run |
| 4 (400) | Run 2,500 m · Reach Sunset Lagoon · 350 shells in one run · Run 1,000 m without hopping · Hop over 40 obstacles in one run |

**Best-distance banner:** a "BEST 812 m" banner arch stands on the track at your best distance. Passing it triggers **NEW BEST!** mid-run with confetti and a chime, so the reward lands while you're still playing.

**Results-screen nudges:** a progress bar toward the next unlock ("Chill 210/300"), "38 m short of your best", and the goal closest to completion.

**Why play another round:**
- Runs are short, and restarting takes one tap.
- The best banner is literally in front of you.
- A goal is usually only a few shells or metres from done.
- The next crab or upgrade is visibly close.
- The next zone is a mystery until you reach it.
- Upgrades make the next run measurably longer.

**Economy check:** a new player's run is about 400 m, which earns roughly 40–60 shells plus goal rewards. That means a first upgrade after 1–2 runs and a first crab after about 3 runs. Unlocking everything costs about 15k shells, or roughly 1.5–3 hours of play. Tune this in M5.

---

## 4. The first five minutes

| Time | What happens |
|---|---|
| 0:00 | The page loads in under 3 s behind a sand-coloured loader with the logo. The title screen shows a live beach scene: Sandy idles and bobs, the waves roll, the logo bounces in, and "Tap to Play" pulses. Music starts on the first tap (iOS requires a user gesture). |
| 0:05 | Tap. The camera swoops behind Sandy (0.8 s) and she starts running at once, slowly. A shell line runs down the middle lane, and each pickup chimes a little higher. |
| 0:10 | A sandcastle sits ahead in her lane. Prompt: **"Swipe ◀ ▶"** (or "◀ ▶ keys" on keyboard). Time slows down as it approaches until the player moves, and a shell zigzag rewards the dodge. |
| 0:20 | Two more castles in alternating lanes, this time without slow-motion. |
| 0:28 | A wave sweeps across all lanes with its chevrons glowing. Prompt: **"Swipe ▲ to hop"**, with slow-motion until the player hops. A shell arc sits over the wave. |
| 0:38 | A log with a shell arc on top teaches that hopping also collects. |
| 0:45 | A beach ball rolls in. Prompt: **"Hop or dodge!"** |
| 0:55 | A Magnet sits on a hop arc and shells stream in. "Nice! You're on your own now." The speed cap lifts and tier 1 starts. |
| ~1:45 | The first crash, usually around 300–500 m. Results: distance, shells, a goal completed ("Run 300 m, +60"), and a "Chill 112/300" progress bar. "Play Again" is one tap. |
| 2:00–5:00 | Runs 2–4. The best banner shows up on the track, and passing it gives a mid-run **NEW BEST!**. Goals complete with toasts, and the first upgrade (150) gets bought. Around run 3–4 the player reaches 700 m: the Pier arch, new scenery and the first gull. By minute 5 they've bought something, have seen or are close to a second zone, and are holding 3 concrete goals. |

The tutorial teaches each step only until the player has done it successfully once (flags are saved per action). If the player crashes during the tutorial, the next run skips the steps already learned. The slow-motion assist only exists on the first run.

---

## 5. Visual direction

**Style: glossy toy diorama.** Rounded, chunky low-poly shapes in the art's saturated palette, soft lighting, and no textures except a few small ones generated in code. We won't match the art's offline-rendered fidelity. What we will match is its **colours, shapes, composition and charm.**

**Palette** (lifted from the art; it lives in `config.ts`):

| Use | Hex |
|---|---|
| Sand light / mid / shadow / wet | `#F6DDA6` `#E9C37E` `#C99A5B` `#CFA46A` |
| Ocean shallow / mid / deep / foam | `#3FD6D0` `#1FA6D6` `#1570B8` `#FFFFFF` |
| Sky top / horizon | `#3FA2F2` `#CDEFFF` |
| Crab red / dark / belly | `#E5452B` `#B3261E` `#F7A76C` |
| Straw hat / band | `#F2CF7A` `#2C4FA3` |
| Shell gold / highlight / edge | `#FFC23A` `#FFEFA0` `#E08A12` |
| Palm trunk / leaves | `#A8743F` `#3DAE4F` `#2A8A3E` |
| Umbrellas | `#E53935` `#FFF7EC` `#2F6FD6` |
| UI navy / teal / rim / cream / orange / yellow / logo outline | `#173F66` `#1E5E8C` `#7CC8F2` `#FFF4DC` `#FF7A1A` `#FFC933` `#5A2A10` |

**Materials and lighting** (cheap on purpose):
- **Characters, obstacles, props and shells** use `MeshMatcapMaterial` with vertex colours. Generate one soft "clay" matcap on a canvas at boot (256 px radial gradient, warm highlight at the top-left, cool falloff at the rim), plus a gold matcap for shells. Both give a glossy toy look with no lighting cost. If matcap reads wrong next to the ground, switch those objects to `MeshLambertMaterial`; that call is yours.
- **Ground** uses `MeshLambertMaterial` with a 256 px canvas-generated sand speckle texture, plus a hemisphere light and one directional light.
- **Ocean and sky** each get a tiny custom shader. The sky is a vertical gradient with a sun glow. The ocean has scrolling colour bands, a foam line at the shore, and gentle vertex waves (flat on Low quality).
- **No shadow maps.** Use soft **blob shadows** under the crab, obstacles and props (one InstancedMesh of quads with a radial texture).
- **Fog** matches the horizon colour so far objects fade in instead of popping.
- **No post-processing.** Glows are additive sprites.

**Models** are built procedurally from primitives, with geometry merged per rigid part and coloured by vertex:
- **Crab:** a squashed-sphere body with a lighter belly, two eye stalks (white eyes, black pupils, highlight dots), two big claws with a pincer that opens and closes, 6 thin legs, and swappable headwear (straw hat, sunglasses, flower, pirate tricorn, captain's hat, top hat). The skins in the art are colour palettes plus headwear. Make Sandy *really* cute: big eyes, a blink every 2–4 s, and wobbly antennae.
- **Obstacles:** sandcastle (cylinder towers, cone roofs, crenellations, red flag), log (tapered cylinder with end rings), wave (curved extruded crest, foam lip, painted chevrons), beach ball (sphere with 6 coloured wedges), crate stack, deck chair, boulder (jittered icosahedron), urchins (spheres with spikes), gull, arch signs.
- **Props:** palms (segmented curved trunk, 6–7 leaf blades), umbrellas, towels, huts, rocks, starfish, tiny background crabs, lamp posts, bunting, tiki torches with flickering sprite flames, and on the backdrop the lighthouse island, sailboats and puffy clouds.

**Scene layout:** the player sits at z = 0 and the **world scrolls toward the camera**, which avoids precision drift. Lanes are at x = −2.2 / 0 / +2.2. The track spans ±3.4 with 0.15 m ridges at ±1.1 and 0.3 m berms at ±3.4. The beach is on the left; the shoreline foam starts at x ≈ +9 with ocean beyond. Objects spawn at z = −100 (beyond the fog) and despawn at z = +10. The far backdrop (island, lighthouse, boats, clouds, sun) is parented to the camera rig so it never needs recycling; it only drifts slowly.

**Camera:**
- Landscape: about (laneX·0.4, 4.6, 7.0), looking at (laneX·0.6, 0.6, −10), with a 55° vertical FOV.
- `fitCamera(aspect)` keeps the whole track (±3.4 m plus a 15% margin) visible at the player's depth in **portrait** by raising the FOV (up to 75°) and pulling back.
- The FOV eases from 55° to 62° as speed rises (+4° during Wave Rider).
- The camera shakes on crash and bump, unless Reduce Motion is on.

**Animation and "juice" checklist:**
- Legs scuttle with phase offsets, at a rate proportional to speed.
- Lane change: the body leans 12° into the move, plus a sand puff and a swish sound.
- Hop: squash 0.85/1.15 on take-off, stretch in the air, squash on landing with a puff and a thump.
- Shells spin and bob. A pickup is a pop, a sparkle burst and a bump on the HUD counter.
- At high speed, sand streak lines appear.
- Every 500 m, a "500 m!" pop with a chime.
- NEW BEST throws confetti.
- Power-ups: a pulsing bubble while active. The shield is a translucent bubble; the Wave Rider shows a board and spray.
- Crash: the hat flies off, the crab tumbles and dizzy stars circle.
- Title screen: idle bob, an occasional claw wave, and the wave cycle on the shoreline.

**Particles:** pooled, at most 200 on High and 80 on Low.

---

## 6. Interface

All UI is a **DOM/CSS overlay** above the canvas. That gives crisp text at any DPI, easy responsive layout, and accessibility. Use vanilla TypeScript with one module per screen, and no UI framework.

**Style** (matching the art):
- HUD pills are navy/teal with a light rim and a soft drop shadow.
- Menu panels are cream with a teal header band.
- Buttons are big, rounded and glossy with a darker bottom edge so they look pressable. Primary is orange; secondary is blue like the art's arrow buttons.
- Number badges are orange circles.
- Fonts: **Lilita One** for the logo, numbers and headings; **Fredoka 600** for body text. Self-host them via `@fontsource/*`.
- Logo: "Crab Dash" in Lilita One with a yellow-to-orange gradient fill, a dark brown stroke and stacked shadows, a slight tilt, an SVG straw hat on the "C", and a shell between the words.

| Screen | Content |
|---|---|
| **Loader** | Sand background, logo and a progress bar. It should only be visible for about a second |
| **Title** | Live 3D beach with Sandy idling. Logo, a pulsing "Tap to Play" ("Press Space" on keyboard), "Best: 1,240 m", a compact card listing the 3 goals, and buttons for **Crabs**, **Settings** and **?** (How to Play) |
| **HUD** | Shell pill top-left, distance pill top-right with the pause button just inside it, the power-up ring under the shell pill, goal and zone toasts sliding in at the top centre, and tutorial prompts in the lower-middle. On touch devices: ◀ ▶ hint buttons, mid-height at the sides in landscape (as in the art) and in the bottom corners in portrait, at 45% opacity, flashing when pressed |
| **Pause** | Dimmed scene (a flat dim; blur is too expensive). Resume / Restart / Settings / Home, plus the 3 goals with progress |
| **Results** | A big distance number with a **NEW BEST** burst, shells earned counting up (pickups, then close shaves, then goal rewards), goal rows ticking, a next-unlock progress bar, and buttons: **PLAY AGAIN** (largest), Crabs, Home. Single column in portrait, two columns in landscape |
| **Crabs (shop)** | The 3D crab preview in the canvas behind a transparent area, re-framed by the camera and swapped live while browsing. Tabs for **Crabs** (a 3×2 grid like art panel 3: the selected crab has a gold border, locked ones show a silhouette and their price or condition) and **Upgrades** (3 cards with icon, 4 level pips, "8 s → 10 s" and a Buy button), plus the shell balance |
| **Settings** | Music and SFX volume, Graphics (Auto/Low/Medium/High), touch buttons (Auto/Show/Hide), Reduce Motion (defaults to the OS preference), Reset progress (with a confirm step), credits |
| **How to Play** | The art's three panels rebuilt as cards ("Move left or right", "Dodge obstacles", "Collect shells & unlock") with simple SVG diagrams |

**Layout rules:**
- Touch targets are at least 48 px, and primary buttons are at least 64 px tall.
- Text uses `clamp()` and is never smaller than 14 px on a phone.
- Respect `env(safe-area-inset-*)`, and use `100dvh` with `position: fixed` for the root.
- Set `touch-action: none` and `overscroll-behavior: none`, disable text selection and callouts, and call `preventDefault` on `gesturestart` so iOS Safari can't pinch-zoom.
- Every screen must work at 360×640 portrait, 390×844, 844×390 landscape, 1366×768 and 1920×1080.

**Accessibility:**
- Obstacle types differ in silhouette, not just colour.
- Reduce Motion turns off shake, flashes and confetti.
- Every UI action is reachable by keyboard, with a visible focus ring.
- No strobing.

---

## 7. Audio

All sound is generated with the **Web Audio API**: SFX are synthesized into `AudioBuffer`s at boot, so there's nothing to download.

| Event | Sound |
|---|---|
| Shell | Bright bell ping whose pitch steps up a pentatonic scale (C6 D6 E6 G6 A6 C7…) with the streak, capped |
| Big shell | Sparkle chord |
| Lane change | Short band-passed noise swish, panned toward the direction of the move |
| Hop / land / slam | Rising "boing" · soft thump · downward whoosh plus thump |
| Sideswipe | Wooden "bonk" |
| Crash | Bonk, descending slide whistle and splash |
| Power-up / shield pop / Wave Rider | Rising arpeggio · bubble pop · surf whoosh plus chord |
| Close shave / goal / new best / zone | Whoosh with a tick · two-note chime · short fanfare · steel-drum motif |
| UI tap / purchase | Soft click · shell cascade |

**Music:** a sunny 8-bar loop at 104 BPM in C major over C–G–Am–F, with plucked-ukulele strums (Karplus–Strong), a marimba-like melody (sine with a fast decay), a triangle-wave bass and noise shakers. Render it **once** with an `OfflineAudioContext` into a looping buffer, so playback costs no CPU. On the title, pause and results screens the same loop runs through a low-pass filter, which opens up during a run. A compressor sits on the master bus. Default volumes: music 0.5, SFX 0.8.
If the generated music sounds grating, make it quieter and simpler. A pleasant minimal loop beats an annoying busy one.

**iOS:** resume the `AudioContext` on the first tap. Note that the iPhone's silent switch mutes Web Audio, which is expected. Suspend audio when the tab is hidden.

---

## 8. Technical approach

### 8.1 Stack and why
**Three.js (0.18x) + TypeScript 5.9 + Vite, deployed as a static site.** Pin exact versions in `package.json`.
- **A browser game works on all three target device types** with no install, from one codebase and one link. On iPhone it can be added to the home screen (PWA manifest) to run without Safari's toolbars.
- **The art is a perspective 3D lane runner**, and real 3D gives that depth for very little extra effort. Three.js is a small runtime (about 160 KB gzipped) that gives direct control over draw calls.
- **Procedural models, sounds and music** mean zero art pipeline, a download of about 1 MB total, and no licensing questions.
- **Rejected:**
  - Unity WebGL and Godot web: 10–40 MB builds, slow loads and iOS Safari memory problems.
  - Phaser or other 2D engines: they'd need fake-3D work plus raster art we can't produce well.

**Device and browser limitations to handle:**
- **iPhone:** no Fullscreen API (use PWA standalone instead), the audio unlock and silent switch above, a 30 fps cap in Low Power Mode, and possible 120 Hz frame rates. Requires WebGL2 (iOS 15+).
- **Low-end Chromebooks:** weak integrated GPUs, often with touchscreens, so mouse, touch and keyboard all have to work at once.
- **PCs:** high refresh rates (144 Hz).
- **Everywhere:** WebGL context loss (pause and show "Tap to reload"), and Safari private mode where `localStorage` may throw (wrap it in try/catch and fall back to memory). If WebGL2 is missing, show a friendly message.

### 8.2 Architecture
- **Separate the simulation from rendering.** `src/sim/` is pure TypeScript and **never imports three**. It owns the player, lanes, entities, collisions, spawner, goals, economy and seeded RNG (`mulberry32`). `src/render/` reads the sim state every frame and syncs pooled meshes by entity id. This lets Vitest run thousands of metres of gameplay headless.
- **Events.** The sim pushes events (`shell`, `bigShell`, `laneChange`, `hop`, `land`, `bump`, `crash`, `closeShave`, `powerup`, `powerupEnd`, `zoneEnter`, `goalComplete`, `newBest`, `milestone`) to a queue that render, audio and UI drain once per frame.
- **Fixed timestep.** The sim runs at 120 Hz with an accumulator (at most 8 steps per frame, frame dt clamped to 0.1 s), and rendering happens once per `requestAnimationFrame`. This keeps the game identical at 30, 60, 120 and 144 Hz and avoids tunnelling at speed.
- **Game state machine:** `BOOT → TITLE → INTRO → RUNNING ⇄ PAUSED → CRASHING → RESULTS → (RUNNING | TITLE | SHOP)`, plus `TITLE ⇄ SHOP / SETTINGS / HOWTO`.
- **Scenery** uses pre-built **30 m tiles**: about 6 variants per zone, each merged into one mesh per material when the zone loads, cycled and recycled as they pass the camera. That makes all roadside scenery cost about 8 draw calls. Shells use one `InstancedMesh` (capacity 256). Obstacles come from per-type pools. Nothing is allocated in the frame loop.
- **All tunables live in `src/config.ts`**: speeds, sizes, timings, prices, palette and quality presets. Patterns and goals live in their own data files.

```
index.html
public/            manifest.webmanifest, icons (generated)
src/
  main.ts  config.ts
  core/    loop.ts  input.ts  audio.ts  music.ts  save.ts  quality.ts  events.ts  rng.ts
  sim/     world.ts  player.ts  spawner.ts  patterns.ts  collisions.ts  powerups.ts  goals.ts  economy.ts  zones.ts  autopilot.ts
  render/  renderer.ts  camera.ts  environment.ts  ocean.ts  sky.ts  scenery.ts  particles.ts  materials.ts  sync.ts
           models/  crab.ts  obstacles.ts  props.ts  shell.ts  powerups.ts
  ui/      ui.ts  hud.ts  title.ts  pause.ts  results.ts  shop.ts  settings.ts  howto.ts  toasts.ts  tutorial.ts  styles.css
tests/     patterns.test.ts  autopilot.test.ts  save.test.ts  goals.test.ts  economy.test.ts
scripts/   screenshots.mjs  make-icons.mjs
docs/      concept/  screenshots/
.github/workflows/deploy.yml
```

### 8.3 Performance budget and quality scaling

| | High | Medium | Low |
|---|---|---|---|
| Max pixel ratio | min(dpr, 2) | 1.5 | 1.0 (dynamic down to 0.75) |
| Draw calls / triangles | ≤ 100 / 150k | ≤ 80 / 100k | ≤ 60 / 60k |
| Fog end (view distance) | 95 m | 85 m | 70 m |
| Scenery density / particles | 100% / 200 | 75% / 140 | 50% / 80 |
| Ocean vertex waves, cloud drift | On | On | Off |

- **Targets:** 60 fps on an iPhone 11 or newer, a mid-range Chromebook and any PC; at least 45 fps on a low-end Chromebook with Auto quality; never below 30. Load and first interaction under 3 s on 4G. Total transfer at most 1 MB.
- **Auto quality.** Pick the starting tier from dpr, core count and screen size. Then, while running, track the average frame time over a 2 s window. Two windows over 19 ms drop the pixel ratio by 0.25, and then the tier. Ten seconds under 12 ms raises it again up to the tier's maximum. A steady 33 ms with low variance means a 30 fps-capped device (iOS Low Power Mode): don't step down because of it.
- Turn antialiasing on only when dpr < 1.5 and the tier isn't Low.
- Update HUD text only when it changes (distance at 10 Hz at most).

### 8.4 Save data
Save to `localStorage` under the key `crabdash.save` as `{ v: 1, shells, best, stats: {runs, totalShells, totalDistance, ...}, crabs: {owned[], selected}, upgrades: {magnet, shield, rider}, goals: {active[], completed[]}, zonesSeen[], tutorial: {move, hop, done}, settings: {music, sfx, quality, touchButtons, reduceMotion} }`.
Validate on load and fall back to defaults if the data is corrupt. Write on run end, purchase, settings change, and on `pagehide`. Include a version field plus a migration hook.

### 8.5 Debug tooling (build it in M0, it pays for itself)
- **URL flags:** `?debug` (overlay: fps, frame ms, draw calls, triangles, dpr, speed, tier, zone, pattern id) · `?seed=N` · `?start=1500` (start at a distance or zone) · `?god` · `?autopilot` · `?quality=low|medium|high` · `?reset`.
- **`window.__crab`** test hooks for scripts: `startRun(opts)`, `setState(name)`, `crash()`, `grant(shells)`, `frames(n)`.
- **`npm run shots -- <label>`** (`scripts/screenshots.mjs`) builds the game, serves the preview build, drives Playwright through Title, Gameplay, Results and Shop at **390×844 (dpr 2), 1366×768 and 1920×1080**, and saves the images to `docs/screenshots/<label>-<screen>-<viewport>.png`. Chromium and Playwright are already installed here: use `require('playwright')` and **don't** run `playwright install`. Headless WebGL2 works through SwiftShader (software rendering), so screenshots are accurate but **headless fps tells you nothing**. Wait for enough frames before each capture.

### 8.6 Build and deploy
- `vite.config.ts` uses `base: './'` so the build works under the GitHub Pages sub-path.
- `.github/workflows/deploy.yml` runs build, then test, then a Pages deploy on push to `main` and on `workflow_dispatch`.
- **The owner must turn this on once:** repo Settings → Pages → Source: "GitHub Actions". GitHub Pages also needs a public repo or a paid plan. Tell the owner this at the end and don't block on it.
- Add a PWA manifest (`display: standalone`, any orientation, theme `#1E5E8C`), an `apple-touch-icon`, and icons generated by `scripts/make-icons.mjs`. A service worker and offline support are not in v1.

---

## 9. Starting values (tune these through playtesting)

These go in `config.ts`.

| Value | Start | Tune? |
|---|---|---|
| Lane x / lane-change time / input buffer | ±2.2 m / 0.13 s / 0.12 s | Feel |
| Hop airtime / apex / slam gravity | 0.55 s / 1.5 m / ×3 | Feel |
| Speed curve | `10 + 14(1−e^(−d/1800))` | Difficulty |
| Swipe threshold / tap max | 22 px / 300 ms | Feel |
| Row spacing scale | `spacing × max(1, v/12)^0.5` | Difficulty |
| Breather | 25 m after every 3–4 patterns | Pacing |
| Power-up interval | 300–450 m (first ~150 m) | Pacing |
| Close-shave window / reward | 0.25 s / +3 | Economy |
| Shell streak window | 0.5 s | Feel |
| Upgrade costs | 150 / 400 / 900 / 1,800 | Economy |
| Crab prices | 300 / 800 / 1,500 / 2,500 | Economy |
| Goal rewards by tier | 60 / 120 / 220 / 400 | Economy |
| Zone starts | 0 / 700 / 1,600 / 2,800 m | Pacing |
| Tutorial speed cap | 9 m/s until done | Onboarding |

---

## 10. Milestones

Commit at every meaningful step and push at the end of each milestone. 📸 marks a screenshot checkpoint for the owner (see §13).

**M0: Foundation** (keep it short)
- Vite + TypeScript + three scaffold, `config.ts`, fixed-step loop, state machine skeleton, Pointer Events input with swipe and tap resolution plus keyboard.
- Debug overlay and URL flags, the Vitest setup, the screenshot script and the deploy workflow.
- Done when: a blank scene renders at all three viewports, and `npm run build`, `npm test` and `npm run shots` all work.

**M1: Core playable, in greybox. Then the FUN GATE.**
- Scrolling track with 3 lanes; boxes and spheres are fine as stand-ins.
- Lane change, hop and slam with buffering and retargeting. BLOCK, LOW and SWEEP. Shells in lines and arcs. Head-on crash vs. sideswipe bump.
- The speed curve, a basic camera with `fitCamera`, instant restart, a minimal HUD, 6–8 rough patterns.
- **Fun gate.** Play at least 15 runs, by keyboard and through Playwright touch emulation. Check that:
  - lane changes feel instant;
  - a new player's run lasts 30–90 s;
  - every crash feels deserved;
  - grabbing shells feels good even with placeholder visuals;
  - you want to retry.

  If not, tune the values in §9 (lane time, hop, speed, spacing) **before** moving on. Write down what you changed.
- 📸 **Screenshot set 1: "First playable"**

**M2: Systems and content** (still mostly greybox)
- The full pattern library (~30) with the **validator test**, plus the **autopilot test**: 30 seeds × 5,000 m with zero unavoidable crashes.
- ROLLER and GULL. The 3 power-ups and their upgrades. Zone logic and transitions (with placeholder palettes). Goals, economy and the save system. Close shaves and streaks. The best banner.
- The first-run tutorial. Functional (unstyled) Title, Pause, Results, Shop and Settings screens.
- Done when: the full loop of title → run → results → shop → run works and progress persists across reloads.

**M3: Visual pass**
- The crab model and all 6 skins, every obstacle skin, all 4 zones' scenery tiles, the sky, ocean and backdrop.
- Blob shadows, particles, zone arches and transitions, and the shop's 3D preview.
- Fully styled UI that matches the art, plus the logo and the How to Play screen.
- 📸 **Screenshot set 2: "Visual pass"**: title, Shore gameplay, Pier, Cove, Sunset, results and shop, on phone and desktop.

**M4: Audio and juice**
- All SFX and the music loop.
- Hit-stop, shake, squash and stretch, streak pitches, toasts, NEW BEST mid-run, milestone pops, the crash sequence, and Reduce Motion support.

**M5: Device hardening, balance and polish**
- Quality tiers and auto scaling, checking draw-call and triangle budgets in the `?debug` overlay at each tier.
- Resize and rotation during a run, focus and visibility pause, safe areas, iOS quirks, context loss, the PWA manifest and icons.
- Economy and difficulty pass using autopilot stats and real play.
- Fix every known bug, then deploy.
- 📸 **Screenshot set 3: "Polished build"**, plus a short summary of what's left.

---

## 11. Definition of done (v1)
- [ ] One complete mode: title → tutorial (first run) → run → crash → results → retry, shop or home. No dead ends.
- [ ] All 5 obstacle behaviours, 3 power-ups with 4 upgrade levels each, 6 crabs, the goals system, 4 zones, the best banner, close shaves and streaks.
- [ ] Save and load of progress and settings, robust to corruption and to private mode.
- [ ] Touch, keyboard and mouse all work. Swipes resolve during the move, and the controls never feel laggy.
- [ ] Pause, resume (with countdown), restart, auto-pause on hide or blur, and resize and orientation changes all work cleanly at every listed viewport.
- [ ] Music and SFX, with volume settings. Audio unlocks correctly on iOS.
- [ ] `npm test` passes: the pattern validator, autopilot fairness (30 seeds × 5 km), save, goals and economy.
- [ ] No console errors or warnings during a 10-minute session. No per-frame allocations show up in a Chrome performance profile.
- [ ] The `?debug` overlay shows the budgets in §8.3 are met at each quality tier. The build is ≤ 1 MB transferred.
- [ ] The deploy workflow builds successfully, and the README explains how to play, run, build and deploy.

---

## 12. Testing checklist

**Automated (every milestone):** `npm run build`, `npm test`, `npm run shots`. Look at the screenshots yourself before sending them.

**Emulated (Playwright):**
- 360×640 and 390×844 portrait with touch: swipes, taps on each half, the arrow buttons, safe-area padding.
- 844×390 landscape.
- 1366×768 with keyboard only.
- 1920×1080 with mouse.
- Rotating and resizing mid-run triggers auto-pause and the layout recovers.
- Hidden tab → pause, then resume with a countdown.
- `?quality=low` still looks good.

**On real devices (the owner checks these; list them in the final handoff):**
- **iPhone (Safari and home-screen app):** loads fast; touch controls feel instant; no page scroll, zoom or bounce; text is readable; audio works after the first tap (silent switch off); smooth play; rotation; the app restores correctly after switching away.
- **Chromebook:** smooth at Auto quality; keyboard controls; touchscreen works (if it has one); the trackpad doesn't trigger accidental input; window resize works.
- **PC (Chrome/Edge/Firefox):** 60 fps or more, correct behaviour at 144 Hz, keyboard and mouse, the fullscreen browser window looks right.

---

## 13. Instructions for the implementing model (Sonnet)

- **Take as long as you need.** Quality, function and visual appeal matter more than speed. "Efficient" means no wasted effort or unnecessary complexity. It does not mean rushing, skipping validation, or leaving things unfinished.
- **You have authority** to make sensible implementation decisions and to solve routine problems without asking. Follow this plan, but when testing shows something better (feel, values, a material choice, a layout), go with it and note why in the commit message. Only ask the owner when missing information would substantially change the game.
- **Priorities:** a satisfying core loop first, then the essential features, then fixing meaningful bugs, and only then extras. Don't add modes, currencies or systems that aren't in this plan. Ideas go in §14.
- **Respect the fun gate** at the end of M1. Don't build content on top of controls that feel bad.
- **📸 Screenshots.** At each checkpoint (end of M1, M3 and M5, plus any other moment worth showing), capture **real** screenshots with `npm run shots` and look at them yourself. Commit them to `docs/screenshots/`, send them to the owner with the `SendUserFile` tool, and add 2–4 lines on what changed and what's next. Never send mock-ups or anything but the real game. If capturing fails, say so plainly and give an honest text update instead.
- **Git:** commit with clear messages, push to the designated branch (`claude/great-cray-2m0jl9` unless told otherwise), and **don't open a pull request** unless the owner asks for one.
- **At the end**, report: what's done, how to play it (including how to turn on GitHub Pages), known limitations, and the device checklist from §12 for the owner to try.

---

## 14. Not in v1 (future ideas, don't build these now)
Daily challenges and streaks · more modes (time trial, night run, boss chase) · online leaderboards · mix-and-match hats · achievements screen · revives · more zones and obstacle types · seasonal events · gamepad support · haptics · offline service worker · native app packaging (e.g. Capacitor) · ads or in-app purchases (avoid these).
