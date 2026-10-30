# Crab Rush: Update 6 Plan ("Menu Makeover")

The owner supplied five pieces of concept art (Home, the run HUD, Treasure Dig, Wardrobe, Daily
Tide). This update rebuilds the menus to match them while keeping every screen working at the five
reference viewports (360×640, 390×844, 844×390, 1366×768, 1920×1080) with touch, keyboard and mouse.

## 1. The look the concepts share

| Element | Concept | Today |
|---|---|---|
| Panels | Cream/white cards (#fffaf2), 20–28 px radius, soft drop shadow, thin white rim | Paper texture, heavy navy shadow |
| Titles | Big heavy navy display type (#14254f) on the card itself | White type on a violet→pink band |
| Back | Round blue button with a white chevron | Ghost button in the band |
| Primary | Wide orange gradient button with a big play icon | Orange candy button (keep, enlarge) |
| Secondary | Teal pills (Customize, Saved Outfits, Museum) | Blue candy buttons |
| Chips | Cream pills with icon + number (wallet, spades, timer) | White pills with gold rim |
| Nav | White pill bar, coloured icons, the current tab in a pale orange pill | Similar (keep, refine) |
| Brand | **Crab Rush** logo with palm leaves | "Crab Dash" |

The concepts brand the game **Crab Rush** (the repository's name), so the logo, page title, PWA
manifest and loader take that name.

## 2. Screens

**Home** (concept 1)
- Top left: profile card (avatar with level badge, title, "Level N" + XP bar with numbers).
- Top right: shells and pearls pills plus a **settings gear**.
- Left column: the Crab Rush logo, then a **Beach Goals** card (three goals with progress bars and
  rewards; the header chevron opens the goals sheet).
- Centre: the crab, with a teal **Customize** pill under it (opens the Wardrobe).
- Right column: a **Beach Run hero card** (title, "Endless adventure", Personal Best with a crown,
  an illustrated scene, a wide orange **Start Beach Run** button, the Golden Shell toggle), then
  three **mode rows** (Crab Cup, Island Hop, Daily Tide) with art, a stat line and a chevron.
- Bottom: the nav (Home, Wardrobe, Pass, Dig, More).
- Phones (portrait): profile + wallet on top, logo, crab, then the hero card and a row of three
  mode tiles; goals open from a chip. Short landscape: hero + rows on the right, crab in the middle.

**Run HUD** (concept 2): a white shell pill with the Fever bar under it, a centre distance pill with
a "Best" sub-pill (crown), a round aqua pause button, the active power-up as a round badge at the
bottom left with a seconds pill.

**Treasure Dig** (concept 3): a left column with a Site card (title, theme, a treasure-chest
illustration), a "Relics found n/3" card, a "Site reward" card and a big Museum button; the grid
sits in a wooden frame with rope corners; empty holes show Hot (flame), Warm (waves) or Cold
(droplet) with the word; a legend strip under the grid ("Choose a tile to dig · 1 shovel per dig").

**Wardrobe** (concept 4): landscape shows the crab on the left with a name card, **drag to rotate**,
Reset View and Saved Outfits; the right panel has tabs, **All / Owned / Locked** filters with the
collected count, item cards on a beach-sky background with Owned / Equipped / price / lock
badges, and a footer with the selected item, **Randomize Owned** and the Equip button. Phones keep
the crab-on-top layout from Update 5 with the same panel.

**Daily Tide** (concept 5): header with a "Resets in" timer pill; a large hero card for today's
twist (art, name, description, "Same course for everyone"); on the right the first-run reward
chips, Today's best, Current streak, the next streak reward with step dots, and the week; a wide
**Play Today's Tide** button; History and Tide Almanac pills.

**Everything else** (Pass, Cup, Islands, Settings, Stats, Trophies, results): they inherit the new
card, header, button and chip styles from one stylesheet (`src/ui/theme6.css`, replacing
`theme5.css`).

## 3. Work order and checks

1. `theme6.css`: tokens, cards, headers, buttons, chips, nav, sheets. Rename to Crab Rush.
2. Home rebuild (`home.ts`), keeping the handler API, keyboard focus order and test selectors.
3. HUD restyle (`ui.ts`): distance + best pill, power-up badge with seconds.
4. Treasure Dig, Wardrobe (filters, drag to rotate, Reset View, Randomize Owned) and Daily Tide.
5. `npm run build && npm test`, smoke, ui-audit at all five sizes, perf; screenshots; push;
   GitHub Pages and the artifact updated.

Constraints carried over: no downloaded assets (every illustration is inline SVG/CSS), animations
use transform/opacity, primary actions stay on screen, tap targets ≥ 40 px, text ≥ 12 px.
