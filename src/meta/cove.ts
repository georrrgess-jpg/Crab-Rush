/**
 * Crab Cove (UPDATE3_PLAN.md §6), pure: a personal island with 12 plots to decorate. Decorations add
 * Comfort; Comfort sets how fast Tide Gifts (shells) wash up, banked up to 8 hours.
 */
export type Currency = 'shells' | 'pearls';

export interface Decor {
  id: string;
  name: string;
  comfort: number;
  cost: number;
  currency: Currency;
}

const d = (id: string, name: string, comfort: number, cost: number, currency: Currency = 'shells'): Decor => ({ id, name, comfort, cost, currency });

/** 24 decorations, cheapest first. Pearl items are the rare, exclusive ones. */
export const DECOR: Decor[] = [
  d('starfish', 'Starfish Patch', 4, 150),
  d('bucket', 'Bucket & Spade', 4, 150),
  d('flowers', 'Flower Bed', 6, 250),
  d('chair', 'Deck Chair', 6, 300),
  d('ball', 'Beach Ball', 5, 300),
  d('bench', 'Driftwood Bench', 8, 450),
  d('torches', 'Tiki Torches', 8, 500),
  d('surfboards', 'Surfboard Rack', 10, 650),
  d('castle', 'Grand Sandcastle', 12, 800),
  d('net', 'Fishing Net', 10, 700),
  d('hammock', 'Hammock', 14, 1000),
  d('bonfire', 'Bonfire', 16, 1200),
  d('rockpool', 'Rock Pool', 14, 1100),
  d('lifeguard', 'Lifeguard Tower', 18, 1600),
  d('flamingo', 'Pink Flamingo', 12, 15, 'pearls'),
  d('palms', 'Palm Pair', 12, 1300),
  d('chest', 'Treasure Chest', 18, 25, 'pearls'),
  d('statue', 'Crab Statue', 22, 40, 'pearls'),
  d('lighthouse', 'Little Lighthouse', 24, 2600),
  d('tiki', 'Tiki Hut', 26, 3000),
  d('arch', 'Shell Arch', 28, 60, 'pearls'),
  d('lanterns', 'Lantern String', 10, 900),
  d('fountain', 'Pearl Fountain', 34, 90, 'pearls'),
  d('rainbow', 'Rainbow Kite', 30, 75, 'pearls'),
];
export const DECOR_BY_ID = new Map(DECOR.map((x) => [x.id, x]));

export const PLOTS = 12;
export const BASE_COMFORT = 10;
/** Tide Gifts: shells per hour at the base comfort, the most per hour, and how long they bank */
export const GIFT_MIN = 40;
export const GIFT_MAX = 300;
export const GIFT_CAP_HOURS = 8;
const HOUR = 3600_000;

/** the best Comfort a full Cove can reach (the 12 comfiest decorations) */
export const MAX_COMFORT = BASE_COMFORT + [...DECOR].sort((a, b) => b.comfort - a.comfort).slice(0, PLOTS).reduce((s, x) => s + x.comfort, 0);

export interface CoveState {
  /** decoration id on each plot (null = empty) */
  plots: (string | null)[];
  /** decorations bought (each can be placed once) */
  owned: string[];
  /** last time gifts were collected or the bank was updated (ms) */
  lastGift: number;
  /** gifts carried over from before the last update */
  banked: number;
}

export function defaultCove(now = 0): CoveState {
  return { plots: Array.from({ length: PLOTS }, () => null), owned: [], lastGift: now, banked: 0 };
}

export function comfort(c: CoveState): number {
  let n = BASE_COMFORT;
  for (const id of c.plots) if (id) n += DECOR_BY_ID.get(id)?.comfort ?? 0;
  return n;
}

/** shells per hour for a Comfort value: a straight line from GIFT_MIN to GIFT_MAX */
export function giftRate(comf: number): number {
  const t = Math.max(0, Math.min(1, (comf - BASE_COMFORT) / (MAX_COMFORT - BASE_COMFORT)));
  return Math.round(GIFT_MIN + (GIFT_MAX - GIFT_MIN) * t);
}

export function giftCap(comf: number): number {
  return giftRate(comf) * GIFT_CAP_HOURS;
}

/** shells waiting on the beach right now */
export function pendingGifts(c: CoveState, now: number): number {
  const comf = comfort(c);
  const hours = Math.max(0, now - c.lastGift) / HOUR;
  return Math.floor(Math.min(giftCap(comf), c.banked + giftRate(comf) * hours));
}

/** Bank what has accrued so far (call before Comfort changes, so the old rate pays up to now). */
export function settle(c: CoveState, now: number): void {
  const comf = comfort(c);
  const hours = Math.max(0, now - c.lastGift) / HOUR;
  c.banked = Math.min(giftCap(comf), c.banked + giftRate(comf) * hours);
  c.lastGift = now;
}

/** Collect the gift pile; returns the shells. */
export function collectGifts(c: CoveState, now: number): number {
  const n = pendingGifts(c, now);
  c.banked = 0;
  c.lastGift = now;
  return n;
}

export interface Wallet {
  shells: number;
  pearls: number;
}

export function canBuy(c: CoveState, w: Wallet, id: string): boolean {
  const x = DECOR_BY_ID.get(id);
  return !!x && !c.owned.includes(id) && w[x.currency] >= x.cost;
}

export function buyDecor(c: CoveState, w: Wallet, id: string): boolean {
  if (!canBuy(c, w, id)) return false;
  const x = DECOR_BY_ID.get(id) as Decor;
  w[x.currency] -= x.cost;
  c.owned.push(id);
  return true;
}

/** Put an owned decoration on a plot (moving it if it's already placed). */
export function place(c: CoveState, plot: number, id: string, now: number): boolean {
  if (plot < 0 || plot >= PLOTS || !c.owned.includes(id)) return false;
  settle(c, now);
  const at = c.plots.indexOf(id);
  if (at >= 0) c.plots[at] = null;
  c.plots[plot] = id;
  return true;
}

/** Take a decoration off its plot (it stays owned). */
export function store(c: CoveState, plot: number, now: number): boolean {
  if (!c.plots[plot]) return false;
  settle(c, now);
  c.plots[plot] = null;
  return true;
}

export function placed(c: CoveState, id: string): boolean {
  return c.plots.includes(id);
}
