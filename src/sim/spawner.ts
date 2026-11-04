import { CFG, tierAt, tierProgress, zoneAt } from '../config';
import { Rng } from '../core/rng';
import { HAZARDS, INTRO_PATTERNS, PATTERNS, PATTERN_BY_ID, patternRows, rowSpacing, toSolverRows, type Pattern } from './patterns';
import { advance, initialStates, solveRows, type SolverRow, type SolverState } from './solver';
import type { LineKind, PowerKind } from './events';
import { POWER_KINDS } from './events';
import { PAD_APEX_T, hopHeight, type World } from './world';
import type { Block } from './levels';
import type { Modifier } from '../meta/daily';

/** The scripted first-run tutorial: pattern id → the lesson it teaches. */
export const TUTORIAL_SCRIPT: { id: string; step: string; need: 'move' | 'hop' | 'none'; slow: boolean; group: 'move' | 'hop' | 'misc' }[] = [
  { id: 'castle-left', step: 'move', need: 'move', slow: true, group: 'move' },
  { id: 'castle-pair', step: 'move2', need: 'none', slow: false, group: 'move' },
  { id: 'wave-1', step: 'hop', need: 'hop', slow: true, group: 'hop' },
  { id: 'log-hop', step: 'log', need: 'none', slow: false, group: 'hop' },
  { id: 'ball-solo', step: 'ball', need: 'none', slow: false, group: 'hop' },
  { id: 'power-arc', step: 'power', need: 'none', slow: false, group: 'misc' },
];

export type TutorialFlags = { move: boolean; hop: boolean };

export function tutorialQueue(flags: TutorialFlags | null): typeof TUTORIAL_SCRIPT {
  if (!flags || (flags.move && flags.hop)) return [];
  return TUTORIAL_SCRIPT.filter((s) => (s.group === 'move' ? !flags.move : s.group === 'hop' ? !flags.hop : true));
}

/** Daily Tide: does this pattern fit the day's theme (gulls, waves/logs, balls)? */
function themed(pt: Pattern, mod: Modifier | null): boolean {
  if (!mod) return false;
  const has = (chars: string): boolean => pt.rows.some((r) => [...chars].some((c) => r.includes(c)));
  if (mod === 'gullDay') return has('G');
  if (mod === 'bigWaves') return has('WwLl') && !has('BGRr');
  if (mod === 'ballStorm') return has('Rr');
  return false;
}

/** Update 9: one point of a shell line, from a pattern cell */
export interface LinePt {
  lane: number;
  wz: number;
  /** row index in the pattern */
  row: number;
  /** a hop obstacle in this lane and row: the line arcs over it (else a shell on the sand) */
  arc: boolean;
  big: boolean;
  /** a block or gull right beside it in its row (the risky line) */
  risky: boolean;
}

export interface Strand {
  pts: LinePt[];
}

const isMark = (c: string | undefined): boolean => c === 's' || c === 'S' || c === 'P';
const OBSTACLE = 'BLWRGlrwC<>^T';

/** Update 9: lanes (bit mask) a row puts an obstacle in; scuttlers count in both of their lanes */
export function busyLanes(row: string | undefined): number {
  if (!row) return 0;
  let m = 0;
  for (let l = 0; l < 3; l++) {
    const c = row[l] as string;
    if (!OBSTACLE.includes(c)) continue;
    m |= 1 << l;
    if (c === '<' && l > 0) m |= 1 << (l - 1);
    if (c === '>' && l < 2) m |= 1 << (l + 1);
  }
  return m;
}

/** lanes (bit mask) with a dodge-only obstacle (block, gull, coconut) */
function solidLanes(row: string | undefined): number {
  if (!row) return 0;
  let m = 0;
  for (let l = 0; l < 3; l++) if ('BGC'.includes(row[l] as string)) m |= 1 << l;
  return m;
}

/**
 * Update 9: the line points of a pattern row. Shell marks (s, S, P) are points on the sand; a hop
 * obstacle with an arc (l, r, the lanes of a www row next to the line, a scuttler's landing lane next
 * to the line) is an arc point.
 */
export function rowPoints(rows: readonly string[], i: number, wz: number): LinePt[] {
  const row = rows[i] as string;
  const prev = rows[i - 1];
  const next = rows[i + 1];
  const near = (l: number): boolean => isMark(prev?.[l]) || isMark(next?.[l]) || 'lr'.includes(prev?.[l] ?? '.') || 'lr'.includes(next?.[l] ?? '.');
  const solid = solidLanes(row);
  const pts: LinePt[] = [];
  const add = (lane: number, arc: boolean, big: boolean): void => {
    if (pts.some((q) => q.lane === lane)) return;
    pts.push({ lane, wz, row: i, arc, big, risky: !arc && (solid & (lane > 0 ? 1 << (lane - 1) : 0) | solid & (lane < 2 ? 1 << (lane + 1) : 0)) !== 0 });
  };
  if (row === 'www') {
    // over the lane(s) the line arrives in; else the lane(s) it leaves in; else the middle
    const into = (r: string | undefined, l: number): boolean => isMark(r?.[l]) || 'lr'.includes(r?.[l] ?? '.');
    for (let l = 0; l < 3; l++) if (into(prev, l)) add(l, true, false);
    if (pts.length === 0) for (let l = 0; l < 3; l++) if (into(next, l)) add(l, true, false);
    if (pts.length === 0) add(1, true, false);
    return pts.sort((a, b) => a.lane - b.lane);
  }
  if (row === 'WWW') return pts;
  // a scuttler lands in the next lane before it reaches the crab: an arc there when the line runs into it
  for (let l = 0; l < 3; l++) {
    const c = row[l] as string;
    if (c !== '<' && c !== '>') continue;
    const to = l + (c === '>' ? 1 : -1);
    if (near(to) && !(solid & (1 << to))) add(to, true, false);
  }
  for (let l = 0; l < 3; l++) {
    const c = row[l] as string;
    if (c === 'l' || c === 'r') add(l, true, false);
    else if (isMark(c)) add(l, false, c === 'S');
  }
  return pts.sort((a, b) => a.lane - b.lane);
}

/** Island Hop cells the solver doesn't see (pickups, pads, pools) are free; coconuts play like gulls */
export function solverChars(r: string): string {
  return r.replace(/[dDH^To]/g, '.').replace(/C/g, 'G');
}

/**
 * Update 9: is following this strand a fair path? The fairness solver runs over the pattern with the
 * player held to the strand's lane at each of its rows (and hopping its arcs, which are hop cells),
 * from any lane, and must come out alive at the end. `dts[0]` is the lead-in before the first row.
 */
export function followable(sr: readonly SolverRow[], dts: readonly number[], pts: readonly LinePt[]): boolean {
  const at: number[] = sr.map(() => -1);
  for (const q of pts) at[q.row] = q.lane;
  let states: SolverState[] = initialStates();
  for (let i = 0; i < sr.length; i++) {
    states = advance(states, sr[i] as SolverRow, dts[i] as number);
    const lane = at[i] as number;
    if (lane >= 0) states = states.filter((st) => st.lane === lane);
    if (states.length === 0) return false;
  }
  return true;
}

/**
 * Update 9: keep every strand a fair path at speed v: a strand that isn't is cut before its first
 * point the solver can't reach (the rest becomes a strand of its own, checked the same way); an arc
 * point that can't be followed even alone loses its arc shells. Returns the strands to lay.
 */
export function fairStrands(strands: Strand[], rows: readonly string[], sp: number, v: number): Strand[] {
  const sr = toSolverRows(rows.map(solverChars), v);
  const dts = rows.map((_, i) => (i === 0 ? 1.0 : sp / v));
  const out: Strand[] = [];
  const queue = strands.slice();
  while (queue.length > 0) {
    const st = queue.shift() as Strand;
    if (st.pts.length === 0) continue;
    if (followable(sr, dts, st.pts)) {
      out.push(st);
      continue;
    }
    // the longest followable head
    let k = st.pts.length - 1;
    while (k > 0 && !followable(sr, dts, st.pts.slice(0, k))) k--;
    if (k === 0) {
      // even its first point alone is unfair: skip it (an arc), or keep a lone sand shell
      const q = st.pts[0] as LinePt;
      if (!q.arc) out.push({ pts: [q] });
      queue.unshift({ pts: st.pts.slice(1) });
      continue;
    }
    out.push({ pts: st.pts.slice(0, k) });
    queue.unshift({ pts: st.pts.slice(k) });
  }
  return out;
}

/** Update 9: link the line points of consecutive rows into strands (same lane first, else a neighbouring lane). */
export function buildStrands(rows: readonly string[], wzOf: (i: number) => number): Strand[] {
  const strands: Strand[] = [];
  let active = new Map<number, Strand>();
  for (let i = 0; i < rows.length; i++) {
    const next = new Map<number, Strand>();
    const claimed = new Set<Strand>();
    const pts = rowPoints(rows, i, wzOf(i));
    // straight continuations claim their strands first, so a diagonal never steals one
    for (const pass of [0, 1]) {
      for (const q of pts) {
        if (next.has(q.lane)) continue;
        let st: Strand | undefined;
        if (pass === 0) {
          const c = active.get(q.lane);
          if (c && !claimed.has(c)) st = c;
          else continue;
        } else {
          for (const d of [-1, 1]) {
            const c = active.get(q.lane + d);
            if (c && !claimed.has(c)) {
              st = c;
              break;
            }
          }
        }
        if (!st) {
          st = { pts: [] };
          strands.push(st);
        }
        claimed.add(st);
        st.pts.push(q);
        next.set(q.lane, st);
      }
    }
    active = next;
  }
  return strands;
}

/** Update 7: a per-tier [lo, hi] range at track position d, gliding toward the next tier's across the tier. */
function tierRange(table: readonly (readonly [number, number])[], d: number): [number, number] {
  const t = tierAt(d);
  const r0 = (table[t] ?? table[table.length - 1]) as readonly [number, number];
  const r1 = (table[t + 1] ?? r0) as readonly [number, number];
  const f = tierProgress(d);
  return [r0[0] + (r1[0] - r0[0]) * f, r0[1] + (r1[1] - r0[1]) * f];
}

const INTRO_IDS = new Set<string>(Object.values(INTRO_PATTERNS));
/** exactly one bit set */
const single = (m: number): boolean => m !== 0 && (m & (m - 1)) === 0;

/** Chooses, validates and places patterns ahead of the player. */
export class Spawner {
  states: SolverState[] = initialStates();
  private lastRowWz: number;
  private sinceBreather = 0;
  private breatherEvery: number;
  private recent: string[] = [];
  private queue: string[] = [];
  private nextPowerAt: number;
  private archDone: boolean[] = [];
  private bannerDone = false;
  scriptLen = 0;
  lastPattern = '';
  lastPower: PowerKind | null = null;
  /** Island Hop: index of the next level block to place */
  private blockIdx = 0;
  /** Update 7: hazards this run has already shown (bit mask, see `HAZARDS`), patterns since the last debut */
  private seen = 0;
  private sinceIntro = 99;
  private flagDone = false;

  /** Update 9: shell-only choices (Big Shells, river shapes) roll their own dice, so tuning the shell
   *  lines never reshuffles the obstacles a seed deals (Daily Tide and Crab Cup courses stay put) */
  private shellRng: Rng;

  constructor(private w: World, private rng: Rng, startDist: number, tutorial: TutorialFlags | null) {
    this.shellRng = new Rng((w.opts.seed ^ 0x5bd1e995) >>> 0);
    this.lastRowWz = startDist + 30;
    this.breatherEvery = this.pickBreather();
    const script = tutorialQueue(tutorial);
    this.scriptLen = script.length;
    this.nextPowerAt = startDist + (script.length > 0 ? 1e9 : CFG.powerupFirst);
    this.queue = script.map((s) => s.id);
    // Don't spawn arches for zones we start beyond.
    for (let z = 0; z < CFG.zoneStarts.length; z++) this.archDone[z] = (CFG.zoneStarts[z] as number) <= startDist;
    // starting further down the beach: hazards from the tiers we skipped need no debut
    const t0 = tierAt(startDist);
    HAZARDS.forEach((h, i) => {
      if ((PATTERN_BY_ID.get(INTRO_PATTERNS[h])?.def.minTier ?? 0) < t0) this.seen |= 1 << i;
    });
  }

  private pickBreather(): number {
    const [a, b] = tierRange(CFG.breatherByTier, this.lastRowWz);
    return Math.min(Math.round(b), Math.floor(a + this.rng.next() * (b - a + 1)));
  }

  /** Called every sim step: keep the track filled to the spawn horizon. */
  update(): void {
    const horizon = this.w.dist + CFG.spawnAhead;
    if (this.w.level) {
      this.updateLevel(horizon);
      return;
    }
    let guard = 0;
    while (this.lastRowWz < horizon && guard++ < 6) this.spawnNext();
    for (let z = 1; z < CFG.zoneStarts.length; z++) {
      const at = CFG.zoneStarts[z] as number;
      if (!this.archDone[z] && horizon >= at) {
        this.archDone[z] = true;
        this.w.addEntity('arch', 1, at, { skin: z });
      }
    }
    // Crab Cup: the finish arch
    const race = this.w.opts.race;
    if (race && !this.flagDone && race.finishAt <= horizon) {
      this.flagDone = true;
      this.w.addEntity('flag', 1, race.finishAt, { skin: 0, state: 0 });
    }
    if (!this.bannerDone && this.w.bestAtStart > 60 && horizon >= this.w.bestAtStart && this.w.bestAtStart > this.w.startDist + 20) {
      this.bannerDone = true;
      this.w.addEntity('banner', 1, this.w.bestAtStart, {});
    }
  }

  /** Island Hop: place the level's blocks in order as they come within the horizon, then the flag. */
  private updateLevel(horizon: number): void {
    const L = this.w.level!;
    const base = this.w.levelStart;
    while (this.blockIdx < L.blocks.length) {
      const b = L.blocks[this.blockIdx] as Block;
      if (base + b.at > horizon) break;
      this.blockIdx++;
      const pt: Pattern = { def: { id: b.id, minTier: 0, weight: 0, spacing: b.spacing, template: '' }, rows: b.rows, hasPower: b.rows.some((r) => r.includes('P')) };
      this.place(pt, false, base + b.at, b.v, false, b);
    }
    if (!this.flagDone && base + L.length <= horizon) {
      this.flagDone = true;
      this.w.addEntity('flag', 1, base + L.length, { skin: L.def.island, state: L.def.chase ? 1 : 0 });
    }
  }

  /** Power-up flow: schedule the next one after a pickup/spawn. */
  private schedulePower(wz: number): void {
    const [a, b] = CFG.powerupInterval as readonly [number, number];
    this.nextPowerAt = wz + this.rng.range(a, b);
  }

  private pickPower(): PowerKind {
    const kinds = POWER_KINDS.filter((k) => k !== this.lastPower);
    const weights = kinds.map((k) => (k === 'magnet' ? 0.4 : k === 'shield' ? 0.35 : 0.25));
    const k = this.rng.weighted(kinds, weights);
    this.lastPower = k;
    return k;
  }

  private spawnNext(): void {
    const w = this.w;
    const rng = this.rng;
    const [gMin, gMax] = tierRange(CFG.gapByTier, this.lastRowWz);
    const gap0 = rng.range(gMin, gMax);
    const probeWz = this.lastRowWz + gap0;

    // Scripted tutorial patterns
    if (this.queue.length > 0) {
      const id = this.queue.shift() as string;
      const pt = PATTERN_BY_ID.get(id) as Pattern;
      const wz0 = this.lastRowWz + 24;
      this.place(pt, false, wz0, w.speedForDist(wz0), true);
      if (this.queue.length === 0) this.nextPowerAt = this.lastRowWz + CFG.powerupFirst * 1.5;
      return;
    }

    const tier = tierAt(probeWz);
    const wantBreather = this.sinceBreather >= this.breatherEvery;
    const powerDue = probeWz >= this.nextPowerAt;

    if (!wantBreather) {
      const mod = w.modifier;
      let cands = PATTERNS.filter(
        (pt) => pt.def.weight > 0 && (pt.def.minTier <= tier || (themed(pt, mod) && pt.def.minTier <= tier + 1)) && (pt.def.maxTier ?? 99) >= tier && !this.recent.includes(pt.def.id),
      );
      // Big Waves: only waves and logs (if this tier has any)
      if (mod === 'bigWaves') {
        const only = cands.filter((pt) => themed(pt, mod));
        if (only.length > 0) cands = only;
      }
      // Update 7: a hazard debuts alone in its intro pattern (one debut per `introGap` patterns);
      // until then no other pattern uses it
      const seen = this.seen;
      const known = cands.filter((pt) => ((pt.hazards ?? 0) & ~seen) === 0);
      const intro = cands.find((pt) => INTRO_IDS.has(pt.def.id) && single((pt.hazards ?? 0) & ~seen));
      cands = intro && (this.sinceIntro >= CFG.introGap || known.length === 0) ? [intro] : known;
      // patterns new in this tier fade in over its first part instead of arriving all at once
      const [nw0, nw1] = CFG.newPatternWeight as readonly [number, number];
      // (the top tier has no end, so its fade uses the previous tier's length)
      const ts = CFG.tierStarts;
      const top = tier > 0 && tier === ts.length - 1;
      const prog = top ? (probeWz - (ts[tier] as number)) / ((ts[tier] as number) - (ts[tier - 1] as number)) : tierProgress(probeWz);
      const newW = nw0 + (nw1 - nw0) * Math.min(1, Math.max(0, prog) / CFG.newPatternRamp);
      const v = w.speedForDist(probeWz);
      let pool = cands.slice();
      for (let attempt = 0; attempt < 8 && pool.length > 0; attempt++) {
        const pt = rng.weighted(pool, pool.map((c) => c.def.weight * (c.def.minTier === tier ? newW : 1) * (themed(c, mod) ? CFG.daily.themeWeight : 1)));
        pool = pool.filter((c) => c !== pt);
        const mirror = rng.next() < 0.5;
        const rows = patternRows(pt, mirror);
        const sp = rowSpacing(pt.def.spacing, v);
        const vs = v * 1.03;
        const sr = toSolverRows(rows, v);
        for (let extra = 0; extra <= 22; extra += 3) {
          const gap = gap0 + extra;
          const dts = rows.map((_, i) => (i === 0 ? gap / vs : sp / vs));
          const res = this.universal(this.states, sr, dts);
          if (res) {
            this.states = res;
            this.place(pt, mirror, this.lastRowWz + gap, v, false);
            this.sinceIntro = pt === intro ? 0 : this.sinceIntro + 1;
            this.recent.push(pt.def.id);
            if (this.recent.length > CFG.patternNoRepeat) this.recent.shift();
            this.sinceBreather++;
            return;
          }
        }
      }
    }
    this.breather(this.lastRowWz + 4, powerDue);
  }

  /** Every surviving state must keep surviving (no traps); returns the union of end states or null. */
  private universal(from: readonly SolverState[], sr: ReturnType<typeof toSolverRows>, dts: number[]): SolverState[] | null {
    const out = new Map<string, SolverState>();
    for (const s of from) {
      const res = solveRows([s], sr, dts);
      if (res.length === 0) return null;
      for (const r of res) out.set(`${r.lane}|${r.grp ? 1 : 0}|${Math.round(r.lo * 50)}|${Math.round(r.hi * 50)}|${Math.round(r.last * 20)}|${r.moved ? 1 : 0}`, r);
    }
    return [...out.values()];
  }

  /**
   * A breather: no obstacles, just a shell river (Update 9: `riverRows` rows that wander a lane or
   * two, sometimes ending in a Big Shell), with the power-up in its middle when one is due.
   */
  private breather(wz0: number, withPower: boolean): void {
    const rng = this.rng;
    const sr = this.shellRng;
    const n = Math.max(2, CFG.lines.riverRows);
    const L = CFG.breatherLength;
    // (the course's dice: the river's lane, and a roll kept so the obstacle sequence matches earlier updates)
    const lanes: number[] = [rng.int(3)];
    const weave = rng.next() < 0.4;
    let turns = 0;
    for (let i = 1; i < n; i++) {
      const cur = lanes[i - 1] as number;
      let nl = cur;
      if (turns < (weave ? 2 : 1) && sr.next() < 0.55) nl = cur !== 1 ? 1 : sr.next() < 0.5 ? 0 : 2;
      if (nl !== cur) turns++;
      lanes.push(nl);
    }
    const mk = (l: number, c: string): string => '.'.repeat(l) + c + '.'.repeat(2 - l);
    const rows = lanes.map((l) => mk(l, 's'));
    if (sr.next() < CFG.lines.riverBig) rows[n - 1] = mk(lanes[n - 1] as number, 'S');
    const pt: Pattern = {
      def: { id: 'breather', minTier: 0, weight: 0, spacing: L / (n - 1), template: '' },
      rows,
      hasPower: false,
    };
    if (withPower) {
      // the power-up sits in the middle of the river
      const k = n >> 1;
      pt.rows[k] = mk(lanes[k] as number, 'P');
      this.schedulePower(wz0 + L);
    }
    this.place(pt, false, wz0, this.w.speedForDist(wz0), false);
    this.sinceIntro++;
    this.states = initialStates();
    this.sinceBreather = 0;
    this.breatherEvery = this.pickBreather();
    this.recent.push('breather');
    if (this.recent.length > CFG.patternNoRepeat) this.recent.shift();
  }

  /** Create obstacles, pickups and shell strands for a pattern. */
  private place(pt: Pattern, mirror: boolean, wz0: number, v: number, scripted: boolean, block?: Block): void {
    const w = this.w;
    const rows = patternRows(pt, mirror);
    const sp = pt.def.id === 'breather' || block ? pt.def.spacing : rowSpacing(pt.def.spacing, v);
    this.lastPattern = pt.def.id;
    this.seen |= pt.hazards ?? 0;
    let firstObstacleWz = Infinity;

    for (let i = 0; i < rows.length; i++) {
      const wz = wz0 + i * sp;
      const row = rows[i] as string;
      if (row === 'WWW' || row === 'www') {
        w.addEntity('sweep', 1, wz, { skin: zoneAt(wz) });
        firstObstacleWz = Math.min(firstObstacleWz, wz);
      } else {
        for (let l = 0; l < 3; l++) {
          const ch = row[l] as string;
          switch (ch) {
            case 'B':
              w.addEntity('block', l, wz, { skin: zoneAt(wz) });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              break;
            case 'L':
            case 'l':
              w.addEntity('low', l, wz, { skin: zoneAt(wz) });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              break;
            case 'R':
            case 'r': {
              // the ball rolls toward the player and meets them exactly at this row (see World.rollerWz)
              w.addEntity('roller', l, wz, { skin: zoneAt(wz), vz: -CFG.rollerSpeed, meetWz: wz });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              break;
            }
            case 'G':
              w.addEntity('gull', l, wz, { skin: zoneAt(wz) });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              break;
            case 'C':
              // a coconut: the palm's shadow warns, then it drops (the sim treats it as a gull)
              w.addEntity('gull', l, wz, { skin: zoneAt(wz), alt: 1 });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              break;
            case 'o':
              w.addEntity('ring', l, wz, {});
              break;
            case '<':
            case '>':
              w.addEntity('scuttle', l, wz, { skin: zoneAt(wz), toLane: l + (ch === '>' ? 1 : -1) });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              break;
            case 'P': {
              // Tide Rush: no power-ups (the shell strand through the cell still counts)
              if (w.level?.rush) break;
              // never two power-ups on top of each other
              if (w.powerupNear(wz, CFG.powerupGap)) break;
              const kind: PowerKind = block ? (block.powerup ?? 'magnet') : scripted ? 'magnet' : this.pickPower();
              w.addEntity('powerup', l, wz, { power: kind, skin: POWER_KINDS.indexOf(kind) });
              if (!scripted && !block) this.schedulePower(wz);
              break;
            }
            // ---- Island Hop cells
            case 'd':
              w.addEntity('dollar', l, wz, {});
              break;
            case 'D':
              // a bounce pad and a sand dollar floating at the top of its arc
              w.addEntity('pad', l, wz, { skin: zoneAt(wz) });
              w.addEntity('dollar', l, wz + v * PAD_APEX_T, { y: CFG.island.padApex + 0.35 });
              break;
            case '^':
              w.addEntity('pad', l, wz, { skin: zoneAt(wz) });
              break;
            case 'H':
              w.addEntity('hourglass', l, wz, {});
              break;
            case 'T':
              w.addEntity('tidepool', l, wz, { skin: zoneAt(wz) });
              break;
            default:
              break;
          }
        }
      }
    }

    // Update 9: shell lines (strands of shells, arcs over hop obstacles, lane changes that lead the way)
    const river = pt.def.id === 'breather';
    const strands = river ? buildStrands(rows, (i) => wz0 + i * sp) : fairStrands(buildStrands(rows, (i) => wz0 + i * sp), rows, sp, v);
    if (!scripted && !block && !river && this.shellRng.next() < CFG.lines.bigChance) {
      // one Big Shell on the riskiest point: a hop's apex or right beside a block
      const risky = strands.flatMap((st) => st.pts.filter((q) => q.arc || q.risky));
      if (risky.length > 0) (risky[this.shellRng.int(risky.length)] as LinePt).big = true;
    }
    for (const st of strands) this.layLine(st, rows, v, river);

    if (scripted) {
      const idx = TUTORIAL_SCRIPT.findIndex((s) => s.id === pt.def.id);
      const script = TUTORIAL_SCRIPT[idx];
      if (script) w.tutorialSteps.push({ ...script, wz: Number.isFinite(firstObstacleWz) ? firstObstacleWz : wz0, done: false });
    }
    this.lastRowWz = wz0 + (rows.length - 1) * sp;
  }

  /** Update 9: what a strand is made of (see LineKind) */
  static lineKind(st: Strand, river: boolean): LineKind {
    if (river) return 'river';
    const arc = st.pts.some((q) => q.arc);
    let turn = false;
    for (let i = 1; i < st.pts.length; i++) if ((st.pts[i] as LinePt).lane !== (st.pts[i - 1] as LinePt).lane) turn = true;
    return arc && turn ? 'hopTurn' : arc ? 'arc' : turn ? 'zig' : 'trail';
  }

  /**
   * Update 9: lay one strand as a shell line. Points on the sand are single shells; arc points are a
   * hop's arc (taking off half an airtime before the obstacle, the middle of its hop window, so the
   * shells trace the hop that clears it). Between points the line is filled at the shell spacing; a
   * lane change becomes two lean shells, each reachable from its own lane, placed clear of the rows'
   * obstacles (early when a block waits in the lane being left).
   */
  private layLine(st: Strand, rows: readonly string[], v: number, river: boolean): void {
    const w = this.w;
    const X = CFG.laneX;
    const L = CFG.lines;
    const y0 = CFG.shell.y;
    const T = CFG.hop.airtime;
    const half = (v * T) / 2;
    const sp = CFG.shell.spacing * Math.pow(Math.max(1, v / CFG.rowSpacingRefSpeed), L.spacingExp) * (w.modifier === 'lowTide' ? CFG.daily.lowTideShells : 1);
    const line = w.beginLine(Spawner.lineKind(st, river));

    // anchors: a shell on the sand (z0 = z1) or a hop arc from take-off z0 to landing z1
    const an: { lane: number; z0: number; z1: number; arc: boolean; big: boolean; row: number }[] = [];
    for (const q of st.pts) {
      const prev = an[an.length - 1];
      if (q.arc) {
        let c = q.wz;
        let big = q.big;
        if (prev?.arc && prev.lane === q.lane && prev.z1 > c - half) {
          // too close for two hops: one hop clears both (the solver groups them), centred between them
          c = (prev.z0 + half + c) / 2;
          big ||= prev.big;
          an.pop();
        } else if (prev && !prev.arc && prev.z1 > c - half - 0.5) {
          // a sand shell under the take-off
          big ||= prev.big;
          an.pop();
        }
        an.push({ lane: q.lane, z0: c - half, z1: c + half, arc: true, big, row: q.row });
      } else {
        if (prev?.arc && q.wz < prev.z1 + 1.0) continue; // under the landing
        an.push({ lane: q.lane, z0: q.wz, z1: q.wz, arc: false, big: q.big, row: q.row });
      }
    }

    const add = (x: number, y: number, z: number, big = false): void => {
      w.addShell(x, y, z, big, line);
    };
    for (let i = 0; i < an.length; i++) {
      const a = an[i]!;
      const xa = X[a.lane] as number;
      if (a.arc) {
        const n = Math.max(4, Math.round((v * T) / sp));
        let apex = 0;
        for (let k = 1; k <= n; k++) if (hopHeight((T * k) / n) > hopHeight((T * apex) / n)) apex = k;
        for (let k = 0; k <= n; k++) {
          const t = (T * k) / n;
          add(xa, y0 + hopHeight(t), a.z0 + v * t, a.big && k === apex);
        }
      } else add(xa, y0, a.z0, a.big);

      const b = an[i + 1];
      if (!b) break;
      // fill the stretch between a's end and b's start
      const z0 = a.z1;
      const z1 = b.z0;
      const len = z1 - z0;
      if (len <= 0.05) continue;
      const fillSame = (lane: number, from: number, to: number): void => {
        const n = Math.round((to - from) / sp);
        for (let j = 1; j < n; j++) add(X[lane] as number, y0, from + ((to - from) * j) / n);
      };
      if (a.lane === b.lane) {
        fillSame(a.lane, z0, z1);
        continue;
      }
      // a lane change: lean shells, clear of the obstacles of the rows on either side
      const xb = X[b.lane] as number;
      const dir = Math.sign(xb - xa);
      const lanes = (1 << a.lane) | (1 << b.lane);
      const cA = a.arc ? 0.5 : busyLanes(rows[a.row]) & lanes ? L.clearAfter + L.clearAfterT * v : 0;
      const cB = Math.max(L.leadT * v, b.arc || busyLanes(rows[b.row]) & lanes ? L.clearBefore + L.clearBeforeT * v : 0);
      let g = Math.max(sp, v * L.leanGapT);
      let r0 = z0 + cA;
      let r1 = z1 - cB;
      if (r1 - r0 < g) {
        if (r1 - r0 >= 1.5) g = r1 - r0; // a quicker turn that still keeps the clearances
        else {
          // no room for the clearances: the middle of the stretch
          g = Math.min(g, len * 0.6);
          r0 = z0 + (len - g) / 2;
          r1 = r0 + g;
        }
      }
      const early = b.arc ? busyLanes(rows[b.row]) & (1 << a.lane) : solidLanes(rows[b.row]) & (1 << a.lane);
      const zA = r0 + (r1 - r0 - g) * (early ? L.turnEarly : L.turnAt);
      const zB = zA + g;
      fillSame(a.lane, z0, zA);
      // (a lean shell right on top of its neighbour is left out)
      if (zA - z0 > 1.0) add(xa + dir * L.lean, y0, zA);
      if (z1 - zB > 1.0) add(xb - dir * L.lean, y0, zB);
      fillSame(b.lane, zB, z1);
    }
  }
}
