/** Versioned save in localStorage, robust to corruption and private-mode storage errors (PLAN.md §8.4).
 * v2 (UPDATE2_PLAN.md §8.2) adds XP/Sunny Pass, the Wardrobe, Island Hop level records, Daily Tide and
 * boosts; v1 blobs migrate transparently. */
import { defaultDaily, type DailyState } from '../meta/daily';
import { PASS_TIERS } from '../meta/xp';
import { ITEM_BY_ID, V1_CRAB_HATS, defaultWardrobe, exists, syncFromCrabs, type Slot, type WardrobeState } from '../meta/wardrobe';

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';
export type TouchButtons = 'auto' | 'show' | 'hide';

export interface Settings {
  music: number;
  sfx: number;
  quality: QualitySetting;
  touchButtons: TouchButtons;
  /** null = follow the OS preference */
  reduceMotion: boolean | null;
  haptics: boolean;
  leftHanded: boolean;
  swipeSensitivity: 'low' | 'normal' | 'high';
  /** high-contrast obstacle outlines (colour-blind friendly) */
  contrastOutlines: boolean;
}

export interface LevelRecord {
  stars: [boolean, boolean, boolean];
  best: number;
}

export interface LifetimeStats {
  runs: number;
  totalShells: number;
  totalDistance: number;
  totalHops: number;
  totalWaves: number;
  totalPowerups: number;
  totalCloseShaves: number;
  /** runs played with each body (favourite crab on the Stats page) */
  runsByCrab: Record<string, number>;
  /** longest single run in seconds */
  longestRun: number;
}

export const SAVE_VERSION = 2;

export interface SaveData {
  v: 2;
  shells: number;
  best: number;
  stats: LifetimeStats;
  crabs: { owned: string[]; selected: string };
  upgrades: { magnet: number; shield: number; rider: number };
  goals: { active: string[]; completed: string[]; progress: Record<string, number> };
  zonesSeen: number[];
  tutorial: { move: boolean; hop: boolean };
  settings: Settings;
  xp: number;
  passClaimed: number[];
  boosts: number;
  wardrobe: WardrobeState;
  levels: Record<string, LevelRecord>;
  daily: DailyState;
  /** wardrobe items the player has looked at ("slot:id"); owned but unseen items show NEW */
  seen: string[];
}

export const SAVE_KEY = 'crabdash.save';

export function defaultSave(): SaveData {
  return {
    v: 2,
    shells: 0,
    best: 0,
    stats: { runs: 0, totalShells: 0, totalDistance: 0, totalHops: 0, totalWaves: 0, totalPowerups: 0, totalCloseShaves: 0, runsByCrab: {}, longestRun: 0 },
    crabs: { owned: ['sandy'], selected: 'sandy' },
    upgrades: { magnet: 0, shield: 0, rider: 0 },
    goals: { active: [], completed: [], progress: {} },
    zonesSeen: [0],
    tutorial: { move: false, hop: false },
    settings: { music: 0.5, sfx: 0.8, quality: 'auto', touchButtons: 'auto', reduceMotion: null, haptics: true, leftHanded: false, swipeSensitivity: 'normal', contrastOutlines: false },
    xp: 0,
    passClaimed: [],
    boosts: 0,
    wardrobe: defaultWardrobe(),
    levels: {},
    daily: defaultDaily(),
    seen: ['bodies:sandy', 'hats:straw', 'hats:none', 'trails:sand', 'dances:clap'],
  };
}

function sanitizeWardrobe(raw: unknown, ownedCrabs: string[], selected: string): WardrobeState {
  const w = defaultWardrobe();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const owned = (r.owned && typeof r.owned === 'object' ? r.owned : {}) as Record<string, unknown>;
  for (const slot of ['bodies', 'hats', 'trails', 'dances'] as Slot[]) {
    for (const id of strArr(owned[slot])) if (exists(slot, id) && !w.owned[slot].includes(id)) w.owned[slot].push(id);
  }
  syncFromCrabs(w, ownedCrabs);
  const eq = (r.equipped && typeof r.equipped === 'object' ? r.equipped : null) as Record<string, unknown> | null;
  if (eq) {
    if (typeof eq.body === 'string' && w.owned.bodies.includes(eq.body)) w.equipped.body = eq.body;
    if (typeof eq.hat === 'string' && w.owned.hats.includes(eq.hat)) w.equipped.hat = eq.hat;
    if (typeof eq.trail === 'string' && w.owned.trails.includes(eq.trail)) w.equipped.trail = eq.trail;
    if (typeof eq.dance === 'string' && w.owned.dances.includes(eq.dance)) w.equipped.dance = eq.dance;
  } else {
    // v1 migration: wear the selected crab with its own hat
    w.equipped.body = selected;
    w.equipped.hat = V1_CRAB_HATS[selected] ?? 'straw';
  }
  return w;
}

function sanitizeLevels(raw: unknown): Record<string, LevelRecord> {
  const out: Record<string, LevelRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    const st = Array.isArray(rec.stars) ? rec.stars : [];
    out[id] = { stars: [st[0] === true, st[1] === true, st[2] === true], best: num(rec.best, 0) };
  }
  return out;
}

function sanitizeDaily(raw: unknown): DailyState {
  const d = defaultDaily();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const isKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return {
    lastDate: isKey(r.lastDate) ? r.lastDate : '',
    streak: Math.floor(num(r.streak, 0, 0, 100000)),
    savers: Math.floor(num(r.savers, 0, 0, 2)),
    bestToday: num(r.bestToday, 0),
    bestDate: isKey(r.bestDate) ? r.bestDate : '',
    history: Array.isArray(r.history) ? r.history.filter(isKey).slice(-30) : [],
  };
}

const num = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Validate an unknown blob into a SaveData; anything missing or malformed falls back to defaults. */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  // migration hook: future versions transform older blobs here before validation
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const st = (r.stats ?? {}) as Record<string, unknown>;
  const cr = (r.crabs ?? {}) as Record<string, unknown>;
  const up = (r.upgrades ?? {}) as Record<string, unknown>;
  const go = (r.goals ?? {}) as Record<string, unknown>;
  const tu = (r.tutorial ?? {}) as Record<string, unknown>;
  const owned = strArr(cr.owned);
  if (!owned.includes('sandy')) owned.unshift('sandy');
  const selected = typeof cr.selected === 'string' && owned.includes(cr.selected) ? cr.selected : 'sandy';
  const q = s.quality;
  const tb = s.touchButtons;
  const progress: Record<string, number> = {};
  if (go.progress && typeof go.progress === 'object') {
    for (const [k, v] of Object.entries(go.progress as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) progress[k] = v;
  }
  const crabs = { owned: [...new Set(owned)], selected };
  const wardrobe = sanitizeWardrobe(r.wardrobe, crabs.owned, selected);
  const claimed = Array.isArray(r.passClaimed)
    ? [...new Set(r.passClaimed.filter((t): t is number => typeof t === 'number' && Number.isInteger(t) && t >= 1 && t <= PASS_TIERS))]
    : [];
  return {
    v: 2,
    shells: Math.floor(num(r.shells, 0)),
    best: num(r.best, 0),
    stats: {
      runs: num(st.runs, 0),
      totalShells: num(st.totalShells, 0),
      totalDistance: num(st.totalDistance, 0),
      totalHops: num(st.totalHops, 0),
      totalWaves: num(st.totalWaves, 0),
      totalPowerups: num(st.totalPowerups, 0),
      totalCloseShaves: num(st.totalCloseShaves, 0),
      runsByCrab: countMap(st.runsByCrab),
      longestRun: num(st.longestRun, 0),
    },
    crabs,
    upgrades: { magnet: Math.floor(num(up.magnet, 0, 0, 4)), shield: Math.floor(num(up.shield, 0, 0, 4)), rider: Math.floor(num(up.rider, 0, 0, 4)) },
    goals: { active: strArr(go.active), completed: strArr(go.completed), progress },
    zonesSeen: Array.isArray(r.zonesSeen) ? [...new Set([0, ...r.zonesSeen.filter((z): z is number => typeof z === 'number' && z >= 0 && z < 4)])] : [0],
    tutorial: { move: bool(tu.move, false), hop: bool(tu.hop, false) },
    settings: {
      music: num(s.music, d.settings.music, 0, 1),
      sfx: num(s.sfx, d.settings.sfx, 0, 1),
      quality: q === 'low' || q === 'medium' || q === 'high' || q === 'auto' ? q : 'auto',
      touchButtons: tb === 'show' || tb === 'hide' || tb === 'auto' ? tb : 'auto',
      reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : null,
      haptics: bool(s.haptics, true),
      leftHanded: bool(s.leftHanded, false),
      swipeSensitivity: s.swipeSensitivity === 'low' || s.swipeSensitivity === 'high' ? s.swipeSensitivity : 'normal',
      contrastOutlines: bool(s.contrastOutlines, false),
    },
    xp: Math.floor(num(r.xp, 0)),
    passClaimed: claimed,
    boosts: Math.floor(num(r.boosts, 0, 0, 3)),
    wardrobe,
    levels: sanitizeLevels(r.levels),
    daily: sanitizeDaily(r.daily),
    // older saves had no NEW tracking: everything already owned counts as seen
    seen: Array.isArray(r.seen) ? [...new Set(strArr(r.seen).filter((k) => ITEM_BY_ID.has(k)))] : ownedKeys(wardrobe),
  };
}

function ownedKeys(w: WardrobeState): string[] {
  return (Object.keys(w.owned) as Slot[]).flatMap((slot) => w.owned[slot].map((id) => `${slot}:${id}`));
}

/** string → non-negative integer counts */
function countMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
  return out;
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Wraps localStorage; falls back to memory when storage throws (Safari private mode, blocked storage). */
export class SaveStore {
  data: SaveData;
  private memory = new Map<string, string>();
  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? SaveStore.probe() : storage;
    this.data = this.load();
  }

  private static probe(): StorageLike | null {
    try {
      const ls = globalThis.localStorage;
      const k = '__crab_probe';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return ls;
    } catch {
      return null;
    }
  }

  private read(): string | null {
    try {
      return this.storage ? this.storage.getItem(SAVE_KEY) : (this.memory.get(SAVE_KEY) ?? null);
    } catch {
      return this.memory.get(SAVE_KEY) ?? null;
    }
  }

  load(): SaveData {
    const raw = this.read();
    if (!raw) return defaultSave();
    try {
      return sanitize(JSON.parse(raw));
    } catch {
      return defaultSave();
    }
  }

  save(): void {
    const json = JSON.stringify(this.data);
    try {
      if (this.storage) this.storage.setItem(SAVE_KEY, json);
      else this.memory.set(SAVE_KEY, json);
    } catch {
      this.memory.set(SAVE_KEY, json);
    }
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }
}
