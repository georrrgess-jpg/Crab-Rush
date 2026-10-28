/** Versioned save in localStorage, robust to corruption and private-mode storage errors (PLAN.md §8.4).
 * v2 (UPDATE2_PLAN.md §8.2) adds XP/Sunny Pass, the Wardrobe, Island Hop level records, Daily Tide and
 * boosts; v1 blobs migrate transparently. */
import { defaultDaily, type DailyState } from '../meta/daily';
import { type DigState, defaultDig, sanitizeDig } from '../meta/dig';
import { ACHIEVEMENTS } from '../meta/achievements';
import { PASS_TIERS } from '../meta/xp';
import { CFG } from '../config';
import { ITEM_BY_ID, V1_CRAB_HATS, defaultWardrobe, exists, syncFromCrabs, type Slot, type WardrobeState } from '../meta/wardrobe';
import { type CupState, defaultCupState, sanitizeCup } from '../meta/cup';

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

export const SAVE_VERSION = 5;

export interface SaveData {
  v: 5;
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
  // ---- v3 (UPDATE3_PLAN.md §6.4)
  /** the rare currency (achievements, quests, chests, Cove) */
  pearls: number;
  /** opened island chests: per island, the chest indexes (0..2) */
  chests: number[][];
  /** level ids with a Tide Rush crown */
  crowns: string[];
  /** Treasure Dig (Update 5, save v5; replaced Crab Cove) */
  dig: DigState;
  /** earned trophy keys ("family:tier") */
  achievements: string[];
  /** the title shown on the profile card ('' = automatic) */
  title: string;
  /** Crab Cup (Update 4, save v4) */
  cup: CupState;
  /** Wardrobe outfits: three saved looks */
  outfits: (Outfit | null)[];
  /** hat dyes owned (indexes 1..3; 0 is the original) and the dye worn per hat */
  dyes: Record<string, number[]>;
  hatDye: Record<string, number>;
  /** Sunny Pass bonus chests claimed after tier 40 */
  passBonus: number;
  /** Second Chance (Update 5): uses on `date` (the first each day is free) */
  revive: { date: string; used: number };
}

export interface Outfit {
  body: string;
  hat: string;
  trail: string;
  dance: string;
}

export const SAVE_KEY = 'crabdash.save';

export function defaultSave(): SaveData {
  return {
    v: 5,
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
    pearls: 0,
    chests: [[], [], [], []],
    crowns: [],
    dig: defaultDig(),
    achievements: [],
    title: '',
    cup: defaultCupState(),
    outfits: [null, null, null],
    dyes: {},
    hatDye: {},
    passBonus: 0,
    revive: { date: '', used: 0 },
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
    scores: Object.fromEntries(Object.entries(countMap(r.scores)).filter(([k]) => isKey(k))),
    bestByMod: countMap(r.bestByMod),
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
  // v4 → v5: Crab Cove is gone. Owned decorations are refunded at half price, plus a starter
  // pile of spades for Treasure Dig.
  const refund = legacyCoveRefund(r);
  return {
    v: 5,
    shells: Math.floor(num(r.shells, 0)) + refund.shells,
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
    pearls: Math.floor(num(r.pearls, 0)) + refund.pearls,
    chests: [0, 1, 2, 3].map((i) => {
      const c = Array.isArray(r.chests) ? (r.chests as unknown[])[i] : null;
      return Array.isArray(c) ? [...new Set(c.filter((k): k is number => k === 0 || k === 1 || k === 2))].sort() : [];
    }),
    crowns: [...new Set(strArr(r.crowns))],
    dig: (() => {
      const dg = sanitizeDig(r.dig);
      if (refund.spades) dg.spades = Math.min(CFG.dig.maxSpades, dg.spades + refund.spades);
      return dg;
    })(),
    achievements: [...new Set(strArr(r.achievements).filter((k) => ACHIEVEMENTS.some((a) => a.key === k)))],
    title: typeof r.title === 'string' ? r.title.slice(0, 40) : '',
    cup: sanitizeCup(r.cup),
    outfits: [0, 1, 2].map((i) => sanitizeOutfit(Array.isArray(r.outfits) ? (r.outfits as unknown[])[i] : null, wardrobe)),
    dyes: sanitizeDyes(r.dyes, wardrobe),
    hatDye: Object.fromEntries(Object.entries(countMap(r.hatDye)).filter(([k, v]) => v >= 1 && v <= 3 && sanitizeDyes(r.dyes, wardrobe)[k]?.includes(v))),
    passBonus: Math.floor(num(r.passBonus, 0)),
    revive: (() => {
      const rv = (r.revive ?? {}) as Record<string, unknown>;
      return { date: typeof rv.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rv.date) ? rv.date : '', used: Math.floor(num(rv.used, 0, 0, 99)) };
    })(),
  };
}

function ownedKeys(w: WardrobeState): string[] {
  return (Object.keys(w.owned) as Slot[]).flatMap((slot) => w.owned[slot].map((id) => `${slot}:${id}`));
}

function sanitizeOutfit(raw: unknown, w: WardrobeState): Outfit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (slot: Slot, v: unknown): v is string => typeof v === 'string' && w.owned[slot].includes(v);
  if (!ok('bodies', r.body) || !ok('hats', r.hat) || !ok('trails', r.trail) || !ok('dances', r.dance)) return null;
  return { body: r.body, hat: r.hat, trail: r.trail, dance: r.dance };
}

function sanitizeDyes(raw: unknown, w: WardrobeState): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [hat, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!w.owned.hats.includes(hat) || !Array.isArray(v)) continue;
    const ds = [...new Set(v.filter((x): x is number => x === 1 || x === 2 || x === 3))].sort();
    if (ds.length) out[hat] = ds;
  }
  return out;
}

/** Crab Cove decoration prices (v4 saves): [cost, 1 = pearls] */
const LEGACY_DECOR: Record<string, [number, number]> = { starfish: [150, 0], bucket: [150, 0], flowers: [250, 0], chair: [300, 0], ball: [300, 0], bench: [450, 0], torches: [500, 0], surfboards: [650, 0], castle: [800, 0], net: [700, 0], hammock: [1000, 0], bonfire: [1200, 0], rockpool: [1100, 0], lifeguard: [1600, 0], flamingo: [15, 1], palms: [1300, 0], chest: [25, 1], statue: [40, 1], lighthouse: [2600, 0], tiki: [3000, 0], arch: [60, 1], lanterns: [900, 0], fountain: [90, 1], rainbow: [75, 1] };

/** what a v4 save with a Crab Cove gets back on migrating to v5 */
export function legacyCoveRefund(r: Record<string, unknown>): { shells: number; pearls: number; spades: number } {
  const cove = r.cove as { owned?: unknown } | undefined;
  if (!cove || typeof cove !== 'object' || 'dig' in r) return { shells: 0, pearls: 0, spades: 0 };
  let shells = 0;
  let pearls = 0;
  for (const id of new Set(strArr(cove.owned))) {
    const p = LEGACY_DECOR[id];
    if (!p) continue;
    if (p[1]) pearls += Math.floor(p[0] / 2);
    else shells += Math.floor(p[0] / 2);
  }
  return { shells, pearls, spades: CFG.dig.legacySpades };
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
