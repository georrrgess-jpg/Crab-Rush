/** Island Hop progression (UPDATE2_PLAN.md §5.2), pure: star totals, gates, rewards. */
import { CFG } from '../config';
import { LEVELS } from '../sim/levelData';
import { mergeStars, starCount } from '../sim/objectives';

export interface LevelRecordLike {
  stars: [boolean, boolean, boolean];
  best: number;
}

export type Records = Record<string, LevelRecordLike>;

export const ISLAND_NAMES = ['Sunny Shore', 'Boardwalk Pier', 'Tide Pool Cove', 'Sunset Lagoon'] as const;
/** the wardrobe hat each island's completion grants (src/meta/wardrobe.ts sources) */
export const ISLAND_REWARD_HATS = ['propeller', 'bucket', 'snorkel', 'halo'] as const;
export const TOTAL_STARS = LEVELS.length * 3;

export function totalStars(r: Records): number {
  let n = 0;
  for (const l of LEVELS) n += starCount(r[l.id]?.stars);
  return n;
}

export function islandStars(r: Records, island: number): number {
  let n = 0;
  for (const l of LEVELS) if (l.island === island) n += starCount(r[l.id]?.stars);
  return n;
}

export function islandUnlocked(r: Records, island: number): boolean {
  return totalStars(r) >= (CFG.island.gates[island] ?? Infinity);
}

/** Levels open in order within an unlocked island: level n needs level n-1 cleared. */
export function levelUnlocked(r: Records, id: string): boolean {
  const l = LEVELS.find((x) => x.id === id);
  if (!l || !islandUnlocked(r, l.island)) return false;
  if (l.index === 1) return true;
  const prev = LEVELS.find((x) => x.island === l.island && x.index === l.index - 1);
  return !!prev && !!r[prev.id]?.stars[0];
}

export function islandComplete(r: Records, island: number): boolean {
  return LEVELS.filter((l) => l.island === island).every((l) => !!r[l.id]?.stars[0]);
}

/** The next level to play: the first unlocked one not yet cleared, else the last unlocked. */
export function nextLevel(r: Records): string {
  let last = LEVELS[0]!.id;
  for (const l of LEVELS) {
    if (!levelUnlocked(r, l.id)) continue;
    last = l.id;
    if (!r[l.id]?.stars[0]) return l.id;
  }
  return last;
}

export interface LevelReward {
  stars: [boolean, boolean, boolean];
  newStars: number;
  firstClear: boolean;
  shells: number;
  xp: number;
  islandCompleted: number | null;
  goldCrab: boolean;
}

/**
 * Apply a level result to the records and work out the rewards: first clear gives shells (by island)
 * and XP, every new star gives XP, finishing an island's six levels grants its hat, and all 72 stars
 * unlock the Golden Crab. Mutates `r`.
 */
export function applyLevelResult(r: Records, id: string, stars: readonly boolean[], time: number): LevelReward {
  const l = LEVELS.find((x) => x.id === id);
  if (!l) throw new Error(`unknown level ${id}`);
  const prev = r[id];
  const before = starCount(prev?.stars);
  const wasComplete = islandComplete(r, l.island);
  const hadAll = totalStars(r) >= TOTAL_STARS;
  const merged = mergeStars(prev?.stars, stars);
  const firstClear = !prev?.stars[0] && !!stars[0];
  r[id] = { stars: merged, best: stars[0] ? (prev?.best ? Math.min(prev.best, time) : time) : (prev?.best ?? 0) };
  const newStars = starCount(merged) - before;
  return {
    stars: merged,
    newStars,
    firstClear,
    shells: firstClear ? (CFG.island.firstClearShells[l.island] as number) : 0,
    xp: newStars * 40 + (firstClear ? 60 : 0),
    islandCompleted: !wasComplete && islandComplete(r, l.island) ? l.island : null,
    goldCrab: !hadAll && totalStars(r) >= TOTAL_STARS,
  };
}
