/** Shop rules: crab prices, the Dazzle skill unlock, upgrade costs. Operates on the save data. */
import { CFG } from '../config';
import type { SaveData } from '../core/save';
import type { PowerKind } from './events';
import { V1_CRAB_HATS, equip, syncFromCrabs } from '../meta/wardrobe';

export const CRAB_ORDER = ['sandy', 'chill', 'blossom', 'skipper', 'pinch', 'dazzle'] as const;
export const SKILL_UNLOCKS: Record<string, { zone: number; text: string }> = {
  dazzle: { zone: 3, text: 'Reach Sunset Lagoon' },
};

export function crabPrice(id: string): number {
  return CFG.crabPrices[id] ?? 0;
}

export function ownsCrab(save: SaveData, id: string): boolean {
  return save.crabs.owned.includes(id);
}

export function canBuyCrab(save: SaveData, id: string): boolean {
  if (ownsCrab(save, id) || SKILL_UNLOCKS[id]) return false;
  return save.shells >= crabPrice(id);
}

export function buyCrab(save: SaveData, id: string): boolean {
  if (!canBuyCrab(save, id)) return false;
  save.shells -= crabPrice(id);
  save.crabs.owned.push(id);
  syncFromCrabs(save.wardrobe, save.crabs.owned);
  return selectCrab(save, id);
}

export function selectCrab(save: SaveData, id: string): boolean {
  if (!ownsCrab(save, id)) return false;
  save.crabs.selected = id;
  // the v1 shop wears the crab with its own hat (the Wardrobe can mix later)
  equip(save.wardrobe, 'bodies', id);
  equip(save.wardrobe, 'hats', V1_CRAB_HATS[id] ?? 'straw');
  return true;
}

/** Grants skill unlocks earned by reaching zones; returns newly unlocked crab ids. */
export function grantSkillUnlocks(save: SaveData): string[] {
  const out: string[] = [];
  for (const [id, cond] of Object.entries(SKILL_UNLOCKS)) {
    if (!ownsCrab(save, id) && save.zonesSeen.includes(cond.zone)) {
      save.crabs.owned.push(id);
      syncFromCrabs(save.wardrobe, save.crabs.owned);
      out.push(id);
    }
  }
  return out;
}

/** Cost of the next level, or null when maxed. */
export function upgradeCost(level: number): number | null {
  return level >= CFG.upgradeCosts.length ? null : (CFG.upgradeCosts[level] as number);
}

export function buyUpgrade(save: SaveData, kind: PowerKind): boolean {
  const lvl = save.upgrades[kind];
  const cost = upgradeCost(lvl);
  if (cost === null || save.shells < cost) return false;
  save.shells -= cost;
  save.upgrades[kind] = lvl + 1;
  return true;
}

export function powerDuration(kind: PowerKind, level: number): number {
  return (CFG.powerupDurations[kind] as readonly number[])[Math.min(level, 4)] as number;
}

/** The cheapest thing still to buy, for the results-screen progress bar. */
export function nextUnlock(save: SaveData, names: Record<string, string>): { name: string; have: number; need: number } | null {
  const crabs = CRAB_ORDER.filter((id) => !ownsCrab(save, id) && !SKILL_UNLOCKS[id] && crabPrice(id) > 0).sort((a, b) => crabPrice(a) - crabPrice(b));
  const ups = (['magnet', 'shield', 'rider'] as PowerKind[])
    .map((k) => ({ k, cost: upgradeCost(save.upgrades[k]) }))
    .filter((u): u is { k: PowerKind; cost: number } => u.cost !== null);
  const options: { name: string; need: number }[] = [];
  const c = crabs[0];
  if (c) options.push({ name: names[c] ?? c, need: crabPrice(c) });
  const label: Record<PowerKind, string> = { magnet: 'Shell Magnet', shield: 'Bubble Shield', rider: 'Wave Rider' };
  for (const u of ups) options.push({ name: `${label[u.k]} Lv ${save.upgrades[u.k] + 1}`, need: u.cost });
  if (options.length === 0) return null;
  // prefer the next crab unless an upgrade is clearly cheaper and not yet affordable
  options.sort((a, b) => a.need - b.need);
  const affordableCrab = c && save.shells < crabPrice(c);
  const pick = affordableCrab ? (options.find((o) => o.name === (names[c] ?? c)) as { name: string; need: number }) : (options.find((o) => o.need > save.shells) ?? options[0]!);
  return { name: pick.name, have: save.shells, need: pick.need };
}
