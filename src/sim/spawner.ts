import { CFG, tierAt, tierProgress, zoneAt } from '../config';
import type { Rng } from '../core/rng';
import { HAZARDS, INTRO_PATTERNS, PATTERNS, PATTERN_BY_ID, patternRows, rowSpacing, toSolverRows, type Pattern } from './patterns';
import { initialStates, solveRows, type SolverState } from './solver';
import type { PowerKind } from './events';
import { POWER_KINDS } from './events';
import { PAD_APEX_T, type World } from './world';
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

interface Strand {
  pts: { lane: number; wz: number; big: boolean }[];
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

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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

  constructor(private w: World, private rng: Rng, startDist: number, tutorial: TutorialFlags | null) {
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

  private breather(wz0: number, withPower: boolean): void {
    const rng = this.rng;
    const lane = rng.int(3);
    const weave = rng.next() < 0.4;
    const L = CFG.breatherLength;
    const rows = ['.s.', '.s.', '.s.'].map(() => '...');
    const mk = (l: number): string => '.'.repeat(l) + 's' + '.'.repeat(2 - l);
    const lanes = weave ? [lane, (lane + (lane === 0 ? 1 : -1) + 3) % 3, lane] : [lane, lane, lane];
    for (let i = 0; i < 3; i++) rows[i] = mk(lanes[i] as number);
    const pt: Pattern = {
      def: { id: 'breather', minTier: 0, weight: 0, spacing: L / 2, template: '' },
      rows,
      hasPower: false,
    };
    if (withPower) {
      // power-up sits in the middle row of the shell line
      pt.rows[1] = '.'.repeat(lanes[1] as number) + 'P' + '.'.repeat(2 - (lanes[1] as number));
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
    const strands: Strand[] = [];
    let active = new Map<number, Strand>();
    let firstObstacleWz = Infinity;

    for (let i = 0; i < rows.length; i++) {
      const wz = wz0 + i * sp;
      const row = rows[i] as string;
      if (row === 'WWW' || row === 'www') {
        w.addEntity('sweep', 1, wz, { skin: zoneAt(wz) });
        firstObstacleWz = Math.min(firstObstacleWz, wz);
        if (row === 'www') {
          // arcs over the lane(s) the shell path arrives in, else the middle
          const prev = rows[i - 1] as string | undefined;
          const lanes: number[] = [];
          if (prev) for (let l = 0; l < 3; l++) if (prev[l] === 's' || prev[l] === 'S') lanes.push(l);
          if (lanes.length === 0) lanes.push(1);
          for (const l of lanes) this.arc(l, wz, CFG.obstacle.sweep.h);
        }
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
              if (ch === 'l') this.arc(l, wz, CFG.obstacle.low.h);
              break;
            case 'R':
            case 'r': {
              // the ball rolls toward the player and meets them exactly at this row (see World.rollerWz)
              w.addEntity('roller', l, wz, { skin: zoneAt(wz), vz: -CFG.rollerSpeed, meetWz: wz });
              firstObstacleWz = Math.min(firstObstacleWz, wz);
              if (ch === 'r') this.arc(l, wz, CFG.obstacle.roller.h);
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

      // shell strands: link marks in consecutive rows
      const next = new Map<number, Strand>();
      const claimed = new Set<Strand>();
      for (let l = 0; l < 3; l++) {
        const ch = row[l] as string;
        const isShell = ch === 's' || ch === 'S' || ch === 'P';
        if (!isShell) continue;
        let st = active.get(l);
        if (!st || claimed.has(st)) {
          st = undefined;
          for (const d of [-1, 1]) {
            const cand = active.get(l + d);
            if (cand && !claimed.has(cand) && !Array.from(next.values()).includes(cand)) {
              st = cand;
              break;
            }
          }
        }
        if (!st) {
          st = { pts: [] };
          strands.push(st);
        }
        claimed.add(st);
        st.pts.push({ lane: l, wz, big: ch === 'S' });
        next.set(l, st);
      }
      active = next;
    }

    for (const st of strands) this.layStrand(st);

    if (scripted) {
      const idx = TUTORIAL_SCRIPT.findIndex((s) => s.id === pt.def.id);
      const script = TUTORIAL_SCRIPT[idx];
      if (script) w.tutorialSteps.push({ ...script, wz: Number.isFinite(firstObstacleWz) ? firstObstacleWz : wz0, done: false });
    }
    this.lastRowWz = wz0 + (rows.length - 1) * sp;
  }

  private layStrand(st: Strand): void {
    const w = this.w;
    const X = CFG.laneX;
    const y = CFG.shell.y;
    for (let i = 0; i < st.pts.length; i++) {
      const a = st.pts[i]!;
      const b = st.pts[i + 1];
      if (!b) {
        w.addShell(X[a.lane] as number, y, a.wz, a.big);
        break;
      }
      const dz = b.wz - a.wz;
      const n = Math.max(1, Math.round(dz / (CFG.shell.spacing * (w.modifier === 'lowTide' ? CFG.daily.lowTideShells : 1))));
      for (let j = 0; j < n; j++) {
        const u = j / n;
        const x = (X[a.lane] as number) + ((X[b.lane] as number) - (X[a.lane] as number)) * smooth(0.3, 0.7, u);
        w.addShell(x, y, a.wz + dz * u, j === 0 && a.big);
      }
    }
  }

  /** Five shells arcing over an obstacle, following a well-timed hop. */
  private arc(lane: number, wz: number, h: number): void {
    const x = CFG.laneX[lane] as number;
    for (let k = -2; k <= 2; k++) {
      const y = h + 0.1 + (CFG.hop.apex - h - 0.1) * (1 - (k / 2) * (k / 2));
      this.w.addShell(x, y, wz + k * 1.4, false);
    }
  }
}
