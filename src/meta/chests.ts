/**
 * Island Hop+ progression (UPDATE3_PLAN.md §5.1), pure: island treasure chests at 6/12/18 stars,
 * Tide Rush crowns, and the bonus level each island's last chest opens.
 */
import { CFG } from '../config';
import { BONUS_LEVELS, LEVELS } from '../sim/levelData';
import { grant, type WardrobeState } from './wardrobe';
import { islandComplete, islandStars, type Records } from './islands';

export const CHEST_STARS = CFG.island.chests as readonly number[];
/** crowns needed for the Lava crab, and for the all-crowns pearl prize */
export const CROWNS_FOR_LAVA = 12;
export const ALL_CROWNS = LEVELS.length + BONUS_LEVELS.length;

export interface ChestReward {
  shells: number;
  pearls: number;
  xp: number;
  /** a wardrobe body granted with this chest */
  body: string | null;
  /** the island's bonus level opened by this chest */
  bonus: string | null;
}

export interface ChestTarget {
  levels: Records;
  chests: number[][];
  shells: number;
  pearls: number;
  xp: number;
  wardrobe: WardrobeState;
}

export function chestReward(island: number, k: number, firstEver: boolean): ChestReward {
  const base = [[250, 5, 80], [500, 10, 150], [900, 20, 250]][k] as [number, number, number];
  return {
    shells: base[0] + island * 100,
    pearls: base[1],
    xp: base[2],
    body: firstEver ? 'reef' : null,
    bonus: k === CHEST_STARS.length - 1 ? (BONUS_LEVELS.find((l) => l.island === island)?.id ?? null) : null,
  };
}

/** Chests reached (by island stars) but not opened yet: [island, k][] */
export function chestsReady(s: Pick<ChestTarget, 'levels' | 'chests'>): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const stars = islandStars(s.levels, i);
    CHEST_STARS.forEach((need, k) => {
      if (stars >= need && !(s.chests[i] ?? []).includes(k)) out.push([i, k]);
    });
  }
  return out;
}

/** Open a chest (mutates the save); null if it isn't ready. */
export function openChest(s: ChestTarget, island: number, k: number): ChestReward | null {
  if (!chestsReady(s).some(([i, kk]) => i === island && kk === k)) return null;
  const firstEver = s.chests.every((c) => c.length === 0);
  const r = chestReward(island, k, firstEver);
  s.shells += r.shells;
  s.pearls += r.pearls;
  s.xp += r.xp;
  if (r.body) grant(s.wardrobe, 'bodies', r.body);
  (s.chests[island] ??= []).push(k);
  return r;
}

/** A bonus level is open once its island's last chest has been opened. */
export function bonusUnlocked(chests: number[][], island: number): boolean {
  return (chests[island] ?? []).includes(CHEST_STARS.length - 1);
}

/** Tide Rush opens on an island once all six of its levels are cleared. */
export function rushUnlocked(levels: Records, island: number): boolean {
  return islandComplete(levels, island);
}

export interface CrownResult {
  newCrown: boolean;
  lava: boolean;
  allCrowns: boolean;
  pearls: number;
}

/** Award a Tide Rush crown for a clean finish (flag reached, no bumps). Mutates. */
export function awardCrown(s: { crowns: string[]; pearls: number; wardrobe: WardrobeState }, id: string): CrownResult {
  if (s.crowns.includes(id)) return { newCrown: false, lava: false, allCrowns: false, pearls: 0 };
  s.crowns.push(id);
  const lava = s.crowns.length === CROWNS_FOR_LAVA && grant(s.wardrobe, 'bodies', 'lava');
  const allCrowns = s.crowns.length === ALL_CROWNS;
  const pearls = 3 + (allCrowns ? 150 : 0);
  s.pearls += pearls;
  return { newCrown: true, lava, allCrowns, pearls };
}
