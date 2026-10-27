/**
 * Island Hop levels (UPDATE2_PLAN.md §5.3): data-driven courses built from library patterns and inline
 * grids. A level is "compiled" once into placed blocks (track positions, speed, spacing) so the
 * spawner, the fairness validation and the HUD progress bar all agree on the same layout.
 *
 * Grid cells (top line = farthest row, like patterns): the pattern alphabet plus
 *   d  golden sand dollar (ground)        D  bounce pad with a high sand dollar at its apex
 *   ^  bounce pad                         H  hourglass shell (Great Wave chase levels)
 *   T  tide pool (walkable, slows you)    P  power-up (kind from the section)
 *   C  coconut drop (a palm's shadow marks the lane, then it falls; plays like a gull G)
 *   o  shell ring (fly or run through it for bonus shells and +1 streak; never blocks)
 */
import { CFG } from '../config';
import type { PowerKind } from './events';
import { PATTERN_BY_ID, mirrorRow, rowSpacing, toSolverRows } from './patterns';
import { initialStates, solveRows, type SolverState } from './solver';

export type StarRule =
  | { kind: 'noBumps' }
  | { kind: 'shells'; pct: number }
  | { kind: 'noHops' }
  | { kind: 'time'; s: number }
  | { kind: 'noPower' }
  | { kind: 'hourglasses'; n: number }
  | { kind: 'streak'; n: number }
  | { kind: 'rings'; n: number };

export type Section =
  | { pattern: string; mirror?: boolean; powerup?: PowerKind; gap?: number }
  | { grid: string; spacing?: number; powerup?: PowerKind; gap?: number };

export interface LevelDef {
  id: string;
  island: number;
  /** 1..6 within the island */
  index: number;
  name: string;
  /** the Great Wave chases the crab */
  chase?: boolean;
  /** an island bonus level (unlocked by its 18-star chest; not counted in the 72 stars) */
  bonus?: boolean;
  star3: StarRule;
  sections: Section[];
}

export interface Block {
  /** rows in arrival order (nearest first) */
  rows: string[];
  /** track position of the first row, relative to the level start */
  at: number;
  spacing: number;
  v: number;
  powerup?: PowerKind;
  id: string;
}

export interface CompiledLevel {
  def: LevelDef;
  blocks: Block[];
  /** flag position relative to the level start */
  length: number;
  speed: readonly [number, number];
  dollars: number;
  hourglasses: number;
  /** Tide Rush (hard mode): compiled faster, so its rows are spread out to stay fair */
  rush: boolean;
}

const GRID_OK = /^[.BLWRGsSPlrwdD^HTCo]{3}$/;

function gridRows(grid: string, id: string): string[] {
  const lines = grid
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (const l of lines) {
    if (!GRID_OK.test(l)) throw new Error(`level ${id}: bad grid row "${l}"`);
    if (/[Ww]/.test(l) && l !== 'WWW' && l !== 'www') throw new Error(`level ${id}: sweep rows must be whole (${l})`);
  }
  return lines.reverse();
}

/** Speed along a level: a gentle ramp from start to end speed over its length. */
export function levelSpeed(speed: readonly [number, number], rel: number, length: number): number {
  const t = Math.max(0, Math.min(1, rel / Math.max(1, length)));
  return speed[0] + (speed[1] - speed[0]) * t;
}

export function compileLevel(def: LevelDef, rush = false): CompiledLevel {
  const base = CFG.island.speeds[def.island] as readonly [number, number];
  const mul = rush ? CFG.island.rushSpeed : 1;
  const speed = [base[0] * mul, base[1] * mul] as const;
  // two passes: the second uses the ramp over the first pass's length
  let length = 0;
  let blocks: Block[] = [];
  for (let pass = 0; pass < 2; pass++) {
    blocks = [];
    let at = CFG.island.firstRowAt;
    let first = true;
    for (const [i, sec] of def.sections.entries()) {
      const v = pass === 0 ? speed[0] : levelSpeed(speed, at, length);
      const gap = rowSpacing(sec.gap ?? CFG.island.sectionGap, v);
      if (!first) at += gap;
      first = false;
      let rows: string[];
      let base: number;
      let id: string;
      if ('pattern' in sec) {
        const pt = PATTERN_BY_ID.get(sec.pattern);
        if (!pt) throw new Error(`level ${def.id}: unknown pattern ${sec.pattern}`);
        rows = sec.mirror ? pt.rows.map(mirrorRow) : pt.rows.slice();
        base = pt.def.spacing;
        id = sec.pattern;
      } else {
        rows = gridRows(sec.grid, def.id);
        base = sec.spacing ?? 10;
        id = `${def.id}#${i}`;
      }
      const sp = rowSpacing(base, v);
      const b: Block = { rows, at, spacing: sp, v, id };
      if (sec.powerup) b.powerup = sec.powerup;
      blocks.push(b);
      at += (rows.length - 1) * sp;
    }
    length = at + CFG.island.flagAfter;
  }
  let dollars = 0;
  let hourglasses = 0;
  for (const b of blocks) for (const r of b.rows) for (const c of r) {
    if (c === 'd' || c === 'D') dollars++;
    if (c === 'H') hourglasses++;
  }
  return { def, blocks, length, speed, dollars, hourglasses, rush };
}

/** Pickups and pads are free cells for the solver. */
function solverRow(r: string): string {
  return r.replace(/[dDH^To]/g, '.').replace(/C/g, 'G');
}

/**
 * Fairness check (UPDATE2_PLAN.md §5.3): every block, at its speed, must be survivable from every
 * state the previous blocks can leave the player in (the same "no traps" rule the spawner uses).
 * Returns null when fair, else a description of the first unfair block.
 */
export function validateLevel(cl: CompiledLevel): string | null {
  let states: SolverState[] = initialStates();
  let lastAt = 0;
  for (const b of cl.blocks) {
    const rows = b.rows.map(solverRow);
    const sr = toSolverRows(rows, b.v);
    const vs = b.v * 1.03;
    const dts = rows.map((_, i) => (i === 0 ? (b.at - lastAt) / vs : b.spacing / vs));
    const out = new Map<string, SolverState>();
    for (const s of states) {
      const res = solveRows([s], sr, dts);
      if (res.length === 0) return `${cl.def.id}: block ${b.id} at ${b.at.toFixed(0)} m is unfair from lane ${s.lane}`;
      for (const r of res) out.set(`${r.lane}|${r.grp ? 1 : 0}|${Math.round(r.lo * 50)}|${Math.round(r.hi * 50)}|${Math.round(r.last * 20)}|${r.moved ? 1 : 0}`, r);
    }
    states = [...out.values()];
    lastAt = b.at + (b.rows.length - 1) * b.spacing;
  }
  return null;
}
