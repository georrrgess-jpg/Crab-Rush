/** Daily Tide (UPDATE2_PLAN.md §6.2): date-seeded course, rotating modifier, streak with savers. Pure. */

export type Modifier = 'lowTide' | 'gullDay' | 'bigWaves' | 'mirror' | 'magnetMadness' | 'nightRun' | 'ballStorm';

export const MODIFIERS: { id: Modifier; name: string; desc: string }[] = [
  { id: 'lowTide', name: 'Low Tide', desc: 'More shells, but faster' },
  { id: 'gullDay', name: 'Gull Day', desc: 'Twice the gulls' },
  { id: 'bigWaves', name: 'Big Waves', desc: 'Only waves and logs' },
  { id: 'mirror', name: 'Mirror Beach', desc: 'The world is flipped' },
  { id: 'magnetMadness', name: 'Magnet Madness', desc: 'Magnet always on, speed ramps twice as fast' },
  { id: 'nightRun', name: 'Night Run', desc: 'Lanterns light the way' },
  { id: 'ballStorm', name: 'Ball Storm', desc: 'Beach balls everywhere' },
];

export interface DailyState {
  lastDate: string; // last date with a finished attempt ('' = never)
  streak: number;
  savers: number;
  bestToday: number;
  bestDate: string;
  history: string[]; // recent dates with a finish (max 30)
}

export function defaultDaily(): DailyState {
  return { lastDate: '', streak: 0, savers: 0, bestToday: 0, bestDate: '', history: [] };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date key YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from key a to key b (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number) as [number, number, number];
  const pb = b.split('-').map(Number) as [number, number, number];
  const ua = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const ub = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((ub - ua) / 86400000);
}

/** Deterministic seed for a date (FNV-1a). */
export function seedFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

export function modifierFor(key: string): Modifier {
  const days = daysBetween('2026-01-01', key);
  const n = MODIFIERS.length;
  return (MODIFIERS[((days % n) + n) % n] as (typeof MODIFIERS)[number]).id;
}

/** Streak as displayed on a given day (0 if it has lapsed beyond what savers can cover). */
export function currentStreak(s: DailyState, today: string): number {
  if (!s.lastDate) return 0;
  const gap = daysBetween(s.lastDate, today);
  if (gap <= 1) return s.streak;
  if (gap - 1 <= s.savers) return s.streak;
  return 0;
}

export interface FinishResult {
  firstToday: boolean;
  streak: number;
  usedSavers: number;
  newBest: boolean;
  /** streak milestones reached today (7, 30) */
  milestone: number | null;
}

/** Record a finished Daily Tide attempt on `today` with `score`. */
export function recordFinish(s: DailyState, today: string, score: number): FinishResult {
  const firstToday = s.lastDate !== today;
  let usedSavers = 0;
  let milestone: number | null = null;
  if (firstToday) {
    const gap = s.lastDate ? daysBetween(s.lastDate, today) : Infinity;
    if (gap === 1) s.streak++;
    else if (gap > 1 && gap - 1 <= s.savers) {
      usedSavers = gap - 1;
      s.savers -= usedSavers;
      s.streak++;
    } else s.streak = 1;
    s.lastDate = today;
    s.history = [...s.history.filter((d) => d !== today), today].slice(-30);
    // one saver earned every 7 streak days (keep at most 2)
    if (s.streak % 7 === 0) s.savers = Math.min(2, s.savers + 1);
    if (s.streak === 7 || s.streak === 30) milestone = s.streak;
  }
  if (s.bestDate !== today) {
    s.bestDate = today;
    s.bestToday = 0;
  }
  const newBest = score > s.bestToday;
  if (newBest) s.bestToday = score;
  return { firstToday, streak: s.streak, usedSavers, newBest, milestone };
}
