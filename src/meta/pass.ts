/** Sunny Pass reward track (UPDATE2_PLAN.md §6.1). Pure. */
import { PASS_TIERS, tierFromXp, totalXpForTier } from './xp';
import { grant, type Slot, type WardrobeState } from './wardrobe';

export type Reward =
  | { kind: 'shells'; amount: number }
  | { kind: 'item'; slot: Slot; id: string }
  | { kind: 'boost' };

/** Item rewards by tier (1-based); everything else alternates shells and boosts. */
const ITEM_TIERS: Record<number, [Slot, string]> = {
  3: ['trails', 'bubbles'],
  5: ['hats', 'parrot'],
  6: ['dances', 'spin'],
  8: ['bodies', 'coral'],
  10: ['hats', 'sunflower'],
  13: ['trails', 'petals'],
  15: ['hats', 'beanie'],
  16: ['dances', 'wave'],
  18: ['trails', 'sparkles'],
  20: ['hats', 'chef'],
  22: ['dances', 'shimmy'],
  24: ['bodies', 'midnight'],
  28: ['trails', 'notes'],
  30: ['hats', 'headphones'],
  33: ['dances', 'hattoss'],
  35: ['hats', 'viking'],
  38: ['trails', 'rainbow'],
  40: ['hats', 'crown'],
};

export function rewardFor(tier: number): Reward {
  const item = ITEM_TIERS[tier];
  if (item) return { kind: 'item', slot: item[0], id: item[1] };
  if (tier % 4 === 0) return { kind: 'boost' };
  return { kind: 'shells', amount: 100 + tier * 15 };
}

export const PASS_REWARDS: Reward[] = Array.from({ length: PASS_TIERS }, (_, i) => rewardFor(i + 1));

export const MAX_BOOSTS = 3;

export interface PassTarget {
  xp: number;
  passClaimed: number[];
  shells: number;
  boosts: number;
  wardrobe: WardrobeState;
}

/** Tiers reached but not yet claimed. */
export function claimable(s: PassTarget): number[] {
  const { tier } = tierFromXp(s.xp);
  const out: number[] = [];
  for (let t = 1; t <= tier; t++) if (!s.passClaimed.includes(t)) out.push(t);
  return out;
}

/** Claim one tier's reward. Returns the reward, or null if not claimable. */
export function claim(s: PassTarget, tier: number): Reward | null {
  if (!claimable(s).includes(tier)) return null;
  const r = rewardFor(tier);
  if (r.kind === 'shells') s.shells += r.amount;
  else if (r.kind === 'boost') s.boosts = Math.min(MAX_BOOSTS, s.boosts + 1);
  else grant(s.wardrobe, r.slot, r.id);
  s.passClaimed.push(tier);
  return r;
}

/** After tier 40 (UPDATE3_PLAN.md §5.2): a bonus chest every 1,000 XP. */
export const BONUS_XP = 1000;
export const BONUS_REWARD = { pearls: 8, shells: 300 } as const;

export function bonusReady(xp: number, claimed: number): number {
  const over = xp - totalXpForTier(PASS_TIERS);
  return over <= 0 ? 0 : Math.max(0, Math.floor(over / BONUS_XP) - claimed);
}

/** XP into the next bonus chest (0..BONUS_XP) */
export function bonusProgress(xp: number): number {
  const over = xp - totalXpForTier(PASS_TIERS);
  return over <= 0 ? 0 : over % BONUS_XP;
}
