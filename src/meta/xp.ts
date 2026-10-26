/** Sunny Pass XP (UPDATE2_PLAN.md §6.1). Pure. */
export const PASS_TIERS = 40;

export interface XpSources {
  distance?: number;
  shells?: number;
  goals?: number;
  stars?: number;
  firstClears?: number;
  daily?: boolean;
  /** daily streak length (days, incl. today) */
  streak?: number;
}

/** Daily streak XP multiplier bonus: +10% per extra day, capped at +70%. */
export function streakBonus(streak: number): number {
  return Math.min(0.7, Math.max(0, streak - 1) * 0.1);
}

export function xpFor(s: XpSources): number {
  let xp = Math.floor((s.distance ?? 0) / 10) + Math.floor((s.shells ?? 0) / 5) + (s.goals ?? 0) * 50 + (s.stars ?? 0) * 40 + (s.firstClears ?? 0) * 60;
  if (s.daily) xp += 150;
  if (s.daily && s.streak) xp = Math.round(xp * (1 + streakBonus(s.streak)));
  return xp;
}

/** XP needed to go from `tier` to `tier + 1` (tier starts at 0). */
export function tierCost(tier: number): number {
  return 100 + 25 * tier;
}

export function totalXpForTier(tier: number): number {
  let t = 0;
  for (let i = 0; i < tier; i++) t += tierCost(i);
  return t;
}

export interface TierInfo {
  tier: number; // tiers reached (0..PASS_TIERS)
  into: number; // xp into the current tier
  need: number; // xp needed for the next tier (0 at max)
}

export function tierFromXp(xp: number): TierInfo {
  let tier = 0;
  let rest = Math.max(0, Math.floor(xp));
  while (tier < PASS_TIERS && rest >= tierCost(tier)) {
    rest -= tierCost(tier);
    tier++;
  }
  return { tier, into: tier >= PASS_TIERS ? 0 : rest, need: tier >= PASS_TIERS ? 0 : tierCost(tier) };
}
