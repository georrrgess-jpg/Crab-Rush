/** Versioned save in localStorage, robust to corruption and private-mode storage errors (PLAN.md §8.4). */
export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';
export type TouchButtons = 'auto' | 'show' | 'hide';

export interface Settings {
  music: number;
  sfx: number;
  quality: QualitySetting;
  touchButtons: TouchButtons;
  /** null = follow the OS preference */
  reduceMotion: boolean | null;
}

export interface LifetimeStats {
  runs: number;
  totalShells: number;
  totalDistance: number;
  totalHops: number;
  totalWaves: number;
  totalPowerups: number;
  totalCloseShaves: number;
}

export interface SaveData {
  v: 1;
  shells: number;
  best: number;
  stats: LifetimeStats;
  crabs: { owned: string[]; selected: string };
  upgrades: { magnet: number; shield: number; rider: number };
  goals: { active: string[]; completed: string[]; progress: Record<string, number> };
  zonesSeen: number[];
  tutorial: { move: boolean; hop: boolean };
  settings: Settings;
}

export const SAVE_KEY = 'crabdash.save';

export function defaultSave(): SaveData {
  return {
    v: 1,
    shells: 0,
    best: 0,
    stats: { runs: 0, totalShells: 0, totalDistance: 0, totalHops: 0, totalWaves: 0, totalPowerups: 0, totalCloseShaves: 0 },
    crabs: { owned: ['sandy'], selected: 'sandy' },
    upgrades: { magnet: 0, shield: 0, rider: 0 },
    goals: { active: [], completed: [], progress: {} },
    zonesSeen: [0],
    tutorial: { move: false, hop: false },
    settings: { music: 0.5, sfx: 0.8, quality: 'auto', touchButtons: 'auto', reduceMotion: null },
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
  return {
    v: 1,
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
    },
    crabs: { owned: [...new Set(owned)], selected },
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
    },
  };
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
