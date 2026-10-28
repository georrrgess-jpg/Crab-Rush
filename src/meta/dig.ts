/**
 * Treasure Dig (UPDATE5_PLAN.md §3), pure: a 6 × 5 dig site hides three relics plus shells, pearls,
 * bonus spades and a stick of dynamite. Spades come from playing; each spade digs one tile. Empty
 * holes say how close the nearest relic still buried is (hot / warm / cold). Find all three relics
 * to clear the site, open its chest and move on to the next one.
 */
import { CFG } from '../config';

export const COLS = 6;
export const ROWS = 5;
export const TILES = COLS * ROWS;

export type TileKind = 'empty' | 'shells' | 'pearls' | 'spade' | 'dynamite' | 'relic';

export interface Site {
  n: number;
  kind: TileKind[];
  /** shells / pearls / spades in the tile */
  amount: number[];
  /** relic index 0..2 for relic tiles, else -1 */
  relic: number[];
}

export interface DigState {
  spades: number;
  /** current site number (1-based) and the tiles dug in it */
  site: number;
  dug: number[];
  /** relic ids in the museum */
  relics: string[];
  /** sites cleared, tiles dug (lifetime) */
  cleared: number;
  totalDug: number;
}

export const SITE_THEMES = ['Sunny Shore', 'Boardwalk Pier', 'Tide Pool Cove', 'Sunset Lagoon', 'Moonlit Bay'] as const;

/** Twelve relic sets of three: the Relic Museum. Sets repeat after site 12 (the museum is complete). */
export const RELIC_SETS: { name: string; relics: [string, string, string] }[] = [
  { name: 'Pirate Hoard', relics: ['Doubloon', 'Brass Compass', 'Spyglass'] },
  { name: 'Lost Lighthouse', relics: ['Lantern Lens', 'Keeper’s Key', 'Logbook'] },
  { name: 'Mermaid Treasures', relics: ['Pearl Comb', 'Shell Mirror', 'Coral Crown'] },
  { name: 'Ancient Crabs', relics: ['Fossil Claw', 'Stone Shell', 'Amber Eye'] },
  { name: 'Shipwreck', relics: ['Ship’s Bell', 'Anchor Charm', 'Captain’s Hat Pin'] },
  { name: 'Sunken Temple', relics: ['Jade Mask', 'Sun Disc', 'Idol Crab'] },
  { name: 'Surfer’s Stash', relics: ['Vintage Fin', 'Wax Bar', 'Lucky Puka'] },
  { name: 'Royal Beach', relics: ['Sand Sceptre', 'Tide Ring', 'Starfish Brooch'] },
  { name: 'Deep Sea', relics: ['Glow Pearl', 'Angler Lamp', 'Kraken Tooth'] },
  { name: 'Sky Islands', relics: ['Cloud Feather', 'Gull Medal', 'Kite Rune'] },
  { name: 'Volcano Isle', relics: ['Obsidian Shard', 'Lava Pearl', 'Ember Shell'] },
  { name: 'Golden Age', relics: ['Golden Crab', 'Crown Shell', 'Eternal Sand'] },
];

/** a relic's museum id: "set:index" */
export const relicId = (site: number, i: number): string => `${(site - 1) % RELIC_SETS.length}:${i}`;
export const RELIC_TOTAL = RELIC_SETS.length * 3;

/** shapes as [dx, dy] cells: a 1×2, a 2×2 and a 1×3 (the long ones may stand upright) */
const SHAPES: [number, number][][] = [
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0]],
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The layout of site `n` (deterministic). */
export function generateSite(n: number): Site {
  const r = rng(7919 * n + 1013);
  const kind: TileKind[] = Array(TILES).fill('empty');
  const amount: number[] = Array(TILES).fill(0);
  const relic: number[] = Array(TILES).fill(-1);
  SHAPES.forEach((shape, ri) => {
    for (let tries = 0; tries < 200; tries++) {
      const up = shape.length !== 4 && r() < 0.5;
      const cells = shape.map(([dx, dy]) => (up ? [dy, dx] : [dx, dy]) as [number, number]);
      const w = Math.max(...cells.map((c) => c[0])) + 1;
      const h = Math.max(...cells.map((c) => c[1])) + 1;
      const x0 = Math.floor(r() * (COLS - w + 1));
      const y0 = Math.floor(r() * (ROWS - h + 1));
      const idx = cells.map(([dx, dy]) => (y0 + dy) * COLS + x0 + dx);
      if (idx.some((i) => kind[i] !== 'empty')) continue;
      for (const i of idx) {
        kind[i] = 'relic';
        relic[i] = ri;
      }
      return;
    }
    throw new Error(`site ${n}: no room for relic ${ri}`);
  });
  const free = kind.map((k, i) => (k === 'empty' ? i : -1)).filter((i) => i >= 0);
  // shuffle the free tiles, then hand out the prizes
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [free[i], free[j]] = [free[j] as number, free[i] as number];
  }
  const D = CFG.dig;
  let k = 0;
  const put = (t: TileKind, count: number, amt: () => number): void => {
    for (let c = 0; c < count; c++) {
      const i = free[k++] as number;
      kind[i] = t;
      amount[i] = amt();
    }
  };
  put('shells', D.shellPiles, () => Math.round((D.pileBase + D.pileGrow * Math.min(n, 20)) * (0.7 + r() * 0.6)));
  put('pearls', D.pearlTiles, () => 1 + Math.floor(r() * (2 + Math.min(n, 10) / 3)));
  put('spade', D.spadeTiles, () => (r() < 0.25 ? 2 : 1));
  put('dynamite', 1, () => 0);
  return { n, kind, amount, relic };
}

export function defaultDig(): DigState {
  return { spades: CFG.dig.startSpades, site: 1, dug: [], relics: [], cleared: 0, totalDug: 0 };
}

export interface DigReward {
  shells: number;
  pearls: number;
  boosts: number;
  xp: number;
  /** wardrobe item "slot:id" */
  item: string | null;
}

/** The chest for clearing site `n`. */
export function siteReward(n: number): DigReward {
  const D = CFG.dig;
  return {
    shells: D.chestShells + D.chestGrow * Math.min(n - 1, 20),
    pearls: D.chestPearls + 3 * Math.min(n - 1, 15),
    boosts: n % 2 === 0 ? 1 : 0,
    xp: 150 + 25 * Math.min(n, 20),
    item: n === 5 ? 'bodies:pearl' : null,
  };
}

export interface DugTile {
  i: number;
  kind: TileKind;
  amount: number;
  relic: number;
  /** freed by dynamite (no spade spent) */
  blast: boolean;
}

export interface DigResult {
  tiles: DugTile[];
  shells: number;
  pearls: number;
  spades: number;
  /** relic ids completed by this dig (all tiles of the relic now dug) */
  found: string[];
  /** set when this dig cleared the site; `st.site` has already moved on */
  cleared: { n: number; reward: DigReward } | null;
}

/** relic tiles of the current site still buried */
function buried(site: Site, dug: readonly number[]): number[] {
  return site.kind.map((k, i) => (k === 'relic' && !dug.includes(i) ? i : -1)).filter((i) => i >= 0);
}

/**
 * Dig tile `i` (spends a spade). Mutates `st`. Returns null when the dig isn't possible (no spades,
 * already dug, out of range).
 */
export function dig(st: DigState, i: number): DigResult | null {
  if (!Number.isInteger(i) || i < 0 || i >= TILES || st.dug.includes(i) || st.spades < 1) return null;
  const site = generateSite(st.site);
  st.spades--;
  const res: DigResult = { tiles: [], shells: 0, pearls: 0, spades: 0, found: [], cleared: null };
  const queue: [number, boolean][] = [[i, false]];
  while (queue.length) {
    const [t, blast] = queue.shift() as [number, boolean];
    if (st.dug.includes(t)) continue;
    st.dug.push(t);
    st.totalDug++;
    const kind = site.kind[t] as TileKind;
    const amount = site.amount[t] as number;
    res.tiles.push({ i: t, kind, amount, relic: site.relic[t] as number, blast });
    if (kind === 'shells') res.shells += amount;
    else if (kind === 'pearls') res.pearls += amount;
    else if (kind === 'spade') res.spades += amount;
    else if (kind === 'dynamite') {
      const x = t % COLS;
      const y = Math.floor(t / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + (dx as number);
        const ny = y + (dy as number);
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) queue.push([ny * COLS + nx, true]);
      }
    }
  }
  st.spades = Math.min(CFG.dig.maxSpades, st.spades + res.spades);
  // relics completed by this dig
  for (let ri = 0; ri < 3; ri++) {
    const cells = site.relic.map((r, k) => (r === ri ? k : -1)).filter((k) => k >= 0);
    if (cells.every((k) => st.dug.includes(k)) && res.tiles.some((d) => d.relic === ri)) {
      const id = relicId(st.site, ri);
      res.found.push(id);
      if (!st.relics.includes(id)) st.relics.push(id);
    }
  }
  if (buried(site, st.dug).length === 0) {
    res.cleared = { n: st.site, reward: siteReward(st.site) };
    st.cleared++;
    st.site++;
    st.dug = [];
  }
  return res;
}

export type Heat = 'hot' | 'warm' | 'cold';

/** How close an empty hole is to the nearest relic tile still buried (Manhattan distance). */
export function heat(site: Site, dug: readonly number[], i: number): Heat {
  const x = i % COLS;
  const y = Math.floor(i / COLS);
  let best = 99;
  for (const k of buried(site, dug)) best = Math.min(best, Math.abs((k % COLS) - x) + Math.abs(Math.floor(k / COLS) - y));
  return best <= 1 ? 'hot' : best <= 2 ? 'warm' : 'cold';
}

/** Spades earned by a run, a level, a race or a Daily Tide (UPDATE5_PLAN.md §3). */
export function spadesFor(o: { distance?: number; daily?: boolean; level?: boolean; newStars?: number; race?: boolean; win?: boolean; goals?: number }): number {
  const D = CFG.dig;
  let n = 0;
  if (o.distance !== undefined && !o.level && !o.race) n += 1 + Math.min(D.runCap - 1, Math.floor(o.distance / D.perMetres));
  if (o.daily) n += D.daily;
  if (o.level) n += 1 + (o.newStars ?? 0);
  if (o.race) n += 2 + (o.win ? 1 : 0);
  n += o.goals ?? 0;
  return n;
}

export function sanitizeDig(raw: unknown): DigState {
  const d = defaultDig();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : dflt);
  d.spades = int(r.spades, 0, CFG.dig.maxSpades, d.spades);
  d.site = int(r.site, 1, 9999, 1);
  d.cleared = int(r.cleared, 0, 9999, 0);
  d.totalDug = int(r.totalDug, 0, 1e7, 0);
  if (Array.isArray(r.dug)) d.dug = [...new Set(r.dug.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < TILES))];
  // a site that somehow has every relic dug is complete: start the next one fresh
  if (buried(generateSite(d.site), d.dug).length === 0) d.dug = [];
  if (Array.isArray(r.relics)) d.relics = [...new Set(r.relics.filter((x): x is string => typeof x === 'string' && /^\d{1,2}:[0-2]$/.test(x) && Number(x.split(':')[0]) < RELIC_SETS.length))];
  return d;
}
