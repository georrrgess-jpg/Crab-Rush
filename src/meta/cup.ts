/**
 * Crab Cup progression (UPDATE4_PLAN.md §5.3), pure: cups of three races, points per place, unlocks,
 * gold trophies and rewards.
 */
import { CFG } from '../config';

export interface RaceDef {
  id: string;
  name: string;
  /** track position where the race starts and its length in metres */
  start: number;
  length: number;
  seed: number;
}

export interface CupDef {
  id: string;
  name: string;
  /** rival ids (src/sim/race.ts RIVALS) */
  rivals: string[];
  /** rival skill multiplier (faster reactions, longer look-ahead) */
  skill: number;
  races: RaceDef[];
  reward: { shells: number; pearls: number; item?: string; title?: string };
}

export const CUPS: CupDef[] = [
  {
    id: 'sandy',
    name: 'Sandy Cup',
    rivals: ['shelly', 'barnacle', 'pip'],
    skill: 0.85,
    races: [
      { id: 'sandy-1', name: 'Shoreline Sprint', start: 60, length: 1100, seed: 9101 },
      { id: 'sandy-2', name: 'Pier Pressure', start: 450, length: 1200, seed: 9102 },
      { id: 'sandy-3', name: 'Boardwalk Dash', start: 720, length: 1200, seed: 9103 },
    ],
    reward: { shells: 300, pearls: 10, title: 'Speedy Claws' },
  },
  {
    id: 'tidal',
    name: 'Tidal Cup',
    rivals: ['barnacle', 'pip', 'coco'],
    skill: 1.0,
    races: [
      { id: 'tidal-1', name: 'Rock Pool Rally', start: 1400, length: 1300, seed: 9201 },
      { id: 'tidal-2', name: 'Cove Crossing', start: 1650, length: 1400, seed: 9202 },
      { id: 'tidal-3', name: 'Lagoon Run', start: 2500, length: 1400, seed: 9203 },
    ],
    reward: { shells: 500, pearls: 25, item: 'hats:helmet' },
  },
  {
    id: 'sunset',
    name: 'Sunset Cup',
    rivals: ['pip', 'coco', 'barnacle'],
    skill: 1.2,
    races: [
      { id: 'sunset-1', name: 'Golden Hour', start: 2900, length: 1500, seed: 9301 },
      { id: 'sunset-2', name: 'Lantern Lane', start: 4100, length: 1600, seed: 9302 },
      { id: 'sunset-3', name: 'Riptide Grand Prix', start: 4300, length: 1800, seed: 9303 },
    ],
    reward: { shells: 800, pearls: 60, title: 'Cup Champion' },
  },
];

export const CUP_BY_ID = new Map(CUPS.map((c) => [c.id, c]));

export interface CupState {
  /** points per race id for the cup run in progress (cleared when a cup is restarted) */
  current: { cup: string; results: Record<string, number>; rivals: Record<string, number> } | null;
  /** best total points per cup */
  best: Record<string, number>;
  /** cups cleared (top 3 overall) and cups won with 1st in every race */
  cleared: string[];
  golds: string[];
  /** lifetime races and wins */
  races: number;
  wins: number;
}

export function defaultCupState(): CupState {
  return { current: null, best: {}, cleared: [], golds: [], races: 0, wins: 0 };
}

export function pointsFor(place: number): number {
  return CFG.race.points[place - 1] ?? 0;
}

export function cupUnlocked(st: CupState, id: string): boolean {
  const i = CUPS.findIndex((c) => c.id === id);
  if (i <= 0) return i === 0;
  return st.cleared.includes((CUPS[i - 1] as CupDef).id);
}

/** the next race in a cup run (null when all three are done) */
export function nextRace(st: CupState, cupId: string): RaceDef | null {
  const cup = CUP_BY_ID.get(cupId);
  if (!cup) return null;
  const done = st.current?.cup === cupId ? st.current.results : {};
  return cup.races.find((r) => done[r.id] === undefined) ?? null;
}

export interface CupOutcome {
  points: number;
  /** overall place in the cup, from the rivals' simulated totals */
  place: number;
  cleared: boolean;
  firstClear: boolean;
  gold: boolean;
  firstGold: boolean;
}

/**
 * Record one race: `standings` lists every racer's place ('you' is the player). Points add up for the
 * player and each rival; after the cup's third race the cup outcome is returned. Mutates `st`.
 */
export function recordRace(st: CupState, cupId: string, raceId: string, standings: { id: string; place: number }[]): CupOutcome | null {
  if (st.current?.cup !== cupId) st.current = { cup: cupId, results: {}, rivals: {} };
  const cur = st.current;
  const me = standings.find((x) => x.id === 'you');
  const racePlace = me?.place ?? 4;
  cur.results[raceId] = racePlace;
  for (const x of standings) if (x.id !== 'you') cur.rivals[x.id] = (cur.rivals[x.id] ?? 0) + pointsFor(x.place);
  st.races++;
  if (racePlace === 1) st.wins++;
  const cup = CUP_BY_ID.get(cupId) as CupDef;
  if (cup.races.some((r) => cur.results[r.id] === undefined)) return null;
  const places = cup.races.map((r) => cur.results[r.id] as number);
  const points = places.reduce((a, p) => a + pointsFor(p), 0);
  // ties go to the player
  const place = 1 + Object.values(cur.rivals).filter((t) => t > points).length;
  const cleared = place <= 3;
  const firstClear = cleared && !st.cleared.includes(cupId);
  if (firstClear) st.cleared.push(cupId);
  const gold = places.every((p) => p === 1);
  const firstGold = gold && !st.golds.includes(cupId);
  if (firstGold) st.golds.push(cupId);
  st.best[cupId] = Math.max(st.best[cupId] ?? 0, points);
  st.current = null;
  return { points, place, cleared, firstClear, gold, firstGold };
}

/** Points so far in the cup run in progress: the player's and each rival's */
export function cupTable(st: CupState, cupId: string): { you: number; rivals: Record<string, number> } {
  if (st.current?.cup !== cupId) return { you: 0, rivals: {} };
  const you = Object.values(st.current.results).reduce((a, p) => a + pointsFor(p), 0);
  return { you, rivals: { ...st.current.rivals } };
}

/** profile titles earned by clearing cups */
export function cupTitles(st: CupState): string[] {
  return CUPS.filter((c) => c.reward.title && st.cleared.includes(c.id)).map((c) => c.reward.title as string);
}

export function sanitizeCup(raw: unknown): CupState {
  const d = defaultCupState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const ids = new Set(CUPS.map((c) => c.id));
  const races = new Set(CUPS.flatMap((c) => c.races.map((x) => x.id)));
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  if (Array.isArray(r.cleared)) d.cleared = r.cleared.filter((x): x is string => typeof x === 'string' && ids.has(x));
  if (Array.isArray(r.golds)) d.golds = r.golds.filter((x): x is string => typeof x === 'string' && ids.has(x));
  if (r.best && typeof r.best === 'object') for (const [k, v] of Object.entries(r.best)) if (ids.has(k)) d.best[k] = num(v);
  d.races = num(r.races);
  d.wins = num(r.wins);
  const cur = r.current as { cup?: unknown; results?: unknown } | null | undefined;
  if (cur && typeof cur.cup === 'string' && ids.has(cur.cup) && cur.results && typeof cur.results === 'object') {
    const results: Record<string, number> = {};
    for (const [k, v] of Object.entries(cur.results)) if (races.has(k) && typeof v === 'number' && v >= 1 && v <= 4) results[k] = Math.floor(v);
    const rivals: Record<string, number> = {};
    const rv = (cur as { rivals?: unknown }).rivals;
    if (rv && typeof rv === 'object') for (const [k, v] of Object.entries(rv)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && k.length < 20) rivals[k] = Math.floor(v);
    d.current = { cup: cur.cup, results, rivals };
  }
  return d;
}
