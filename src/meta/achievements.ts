/**
 * The Trophy Shelf (UPDATE3_PLAN.md §6.1), pure: 36 achievements in 12 families of bronze, silver and
 * gold. Each pays pearls; every gold also unlocks a title for the profile card.
 */
export interface Metrics {
  distance: number;
  best: number;
  shells: number;
  runs: number;
  hops: number;
  waves: number;
  closeShaves: number;
  powerups: number;
  stars: number;
  crowns: number;
  streak: number;
  items: number;
  comfort: number;
  friends: number;
  tier: number;
}

export type Tier = 0 | 1 | 2;
export const TIER_NAMES = ['Bronze', 'Silver', 'Gold'] as const;
export const TIER_PEARLS = [5, 10, 20] as const;

export interface Family {
  id: string;
  name: string;
  metric: keyof Metrics;
  targets: [number, number, number];
  text: (n: number) => string;
  /** the title a gold trophy unlocks */
  title: string;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

export const FAMILIES: Family[] = [
  { id: 'dist', name: 'Long Haul', metric: 'distance', targets: [10_000, 50_000, 200_000], text: (n) => `Run ${fmt(n)} m in total`, title: 'Marathon Crab' },
  { id: 'best', name: 'Far Out', metric: 'best', targets: [1000, 3000, 6000], text: (n) => `Reach ${fmt(n)} m in one run`, title: 'Horizon Chaser' },
  { id: 'shells', name: 'Shell Hoard', metric: 'shells', targets: [2000, 10_000, 50_000], text: (n) => `Collect ${fmt(n)} shells`, title: 'Shell Baron' },
  { id: 'runs', name: 'Regular', metric: 'runs', targets: [10, 50, 250], text: (n) => `Play ${fmt(n)} runs or levels`, title: 'Beach Regular' },
  { id: 'hops', name: 'Bouncy', metric: 'hops', targets: [100, 500, 2500], text: (n) => `Hop ${fmt(n)} times`, title: 'Pogo Pincer' },
  { id: 'waves', name: 'Surf Hopper', metric: 'waves', targets: [20, 100, 400], text: (n) => `Hop ${fmt(n)} waves`, title: 'Wave Whisperer' },
  { id: 'shaves', name: 'Daredevil', metric: 'closeShaves', targets: [10, 50, 200], text: (n) => `${fmt(n)} close shaves`, title: 'Daredevil' },
  { id: 'stars', name: 'Island Star', metric: 'stars', targets: [18, 45, 72], text: (n) => `Earn ${n} Island Hop stars`, title: 'Island Legend' },
  { id: 'crowns', name: 'Royalty', metric: 'crowns', targets: [3, 12, 28], text: (n) => `Earn ${n} Tide Rush crowns`, title: 'Crab Royalty' },
  { id: 'streak', name: 'Tide Keeper', metric: 'streak', targets: [3, 7, 30], text: (n) => `A ${n}-day Daily Tide streak`, title: 'Tide Keeper' },
  { id: 'style', name: 'Fashionista', metric: 'items', targets: [12, 25, 45], text: (n) => `Own ${n} wardrobe items`, title: 'Fashion Icon' },
  { id: 'cove', name: 'Homemaker', metric: 'comfort', targets: [60, 150, 280], text: (n) => `Reach ${n} Cove Comfort`, title: 'Cove Keeper' },
];

export const ACHIEVEMENTS = FAMILIES.flatMap((f) => [0, 1, 2].map((t) => ({ key: `${f.id}:${t}`, family: f, tier: t as Tier, target: f.targets[t] as number })));

/** Newly earned achievement keys (not in `earned` yet). */
export function evaluate(earned: readonly string[], m: Metrics): string[] {
  return ACHIEVEMENTS.filter((a) => !earned.includes(a.key) && m[a.family.metric] >= a.target).map((a) => a.key);
}

export function pearlsFor(key: string): number {
  const t = Number(key.split(':')[1] ?? 0);
  return TIER_PEARLS[t as Tier] ?? 0;
}

/** Titles the player may wear: the starting ones plus every gold family's. */
export function titlesFor(earned: readonly string[]): string[] {
  return ['Beach Rookie', ...FAMILIES.filter((f) => earned.includes(`${f.id}:2`)).map((f) => f.title)];
}
