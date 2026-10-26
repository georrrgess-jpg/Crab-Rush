/**
 * Row-level fairness solver (PLAN.md §2.7). A "row" is a line of three lane cells that crosses the
 * player at time t. The solver tracks every state the player could legitimately be in (lane, hop
 * group, recent lane change) and checks that at least one path survives each row, with the human
 * reaction constraints from the plan:
 *   rule 2: a lane change of k lanes needs dt >= 0.30 + 0.15 k
 *   rule 3: separate hops need dt >= 0.70 between the rows they clear
 *   rule 4: a sweep never follows within 0.6 s of a lane change
 * The same code validates patterns in tests, gates the spawner at runtime and drives the autopilot.
 */
import { CFG } from '../config';

export const enum Cell {
  Free = 0,
  Hop = 1,
  Solid = 2,
}

export interface SolverRow {
  cells: [Cell, Cell, Cell];
  /** hop-start window (relative to the row time) that clears each Hop cell */
  lo: [number, number, number];
  hi: [number, number, number];
  sweep: boolean;
}

export interface SolverState {
  lane: number;
  grp: boolean;
  lo: number;
  hi: number;
  /** seconds since the last row that needed a hop (capped) */
  last: number;
  moved: boolean;
  /** this row started a new hop group (informational, not part of the state identity) */
  ng?: boolean;
}

const T = CFG.hop.airtime;
const APEX = CFG.hop.apex;
const PLAYER_D = CFG.player.d;

export const LANE_BASE = 0.3;
export const LANE_PER = 0.15;
export const HOP_GAP = 0.7;
export const SWEEP_AFTER_MOVE = 0.6;
const LAST_CAP = 5;

/** Hop-start window clearing an obstacle of height h and depth d that crosses the player at relative time 0. */
export function hopWindow(h: number, d: number, closingSpeed: number): { lo: number; hi: number } {
  const a = (1 - Math.sqrt(Math.max(0, 1 - h / APEX))) / 2;
  const half = (d + PLAYER_D) / 2 / closingSpeed;
  return { lo: half - (1 - a) * T, hi: -half - a * T };
}

export function emptyRow(): SolverRow {
  return { cells: [Cell.Free, Cell.Free, Cell.Free], lo: [0, 0, 0], hi: [0, 0, 0], sweep: false };
}

export function initialStates(lanes: number[] = [0, 1, 2]): SolverState[] {
  return lanes.map((lane) => ({ lane, grp: false, lo: 0, hi: 0, last: LAST_CAP, moved: false }));
}

function key(s: SolverState): string {
  return `${s.lane}|${s.grp ? 1 : 0}|${s.grp ? Math.round(s.lo * 50) : 0}|${s.grp ? Math.round(s.hi * 50) : 0}|${Math.round(s.last * 20)}|${s.moved ? 1 : 0}`;
}

/** Advance the state set across one row that arrives `dt` seconds after the previous one. */
export function advance(states: readonly SolverState[], row: SolverRow, dt: number, laneBase = LANE_BASE): SolverState[] {
  const out = new Map<string, SolverState>();
  for (const s of states) {
    const grp0 = s.grp && s.hi - dt > -2; // old groups can no longer be extended once far in the past
    for (let b = 0; b < CFG.laneCount; b++) {
      const k = Math.abs(b - s.lane);
      if (k > 0 && dt < laneBase + LANE_PER * k - 1e-9) continue;
      if (row.sweep && s.moved && dt < SWEEP_AFTER_MOVE - 1e-9) continue;
      const cell = row.cells[b] as Cell;
      if (cell === Cell.Solid) continue;
      const base: SolverState = {
        lane: b,
        grp: grp0,
        lo: s.lo - dt,
        hi: s.hi - dt,
        last: Math.min(LAST_CAP, s.last + dt),
        moved: k > 0,
      };
      if (cell === Cell.Free) {
        const n = base;
        out.set(key(n), n);
        continue;
      }
      // Hop cell: extend the open hop or start a new one.
      const rlo = row.lo[b] as number;
      const rhi = row.hi[b] as number;
      if (rlo > rhi + 1e-9) continue; // obstacle cannot be hopped at this speed
      if (base.grp) {
        const lo = Math.max(base.lo, rlo);
        const hi = Math.min(base.hi, rhi);
        if (lo <= hi + 1e-9) {
          const n: SolverState = { ...base, lo, hi, last: 0, ng: false };
          out.set(key(n), n);
        }
      }
      if (base.last >= HOP_GAP - 1e-9) {
        const n: SolverState = { ...base, grp: true, lo: rlo, hi: rhi, last: 0, ng: true };
        out.set(key(n), n);
      }
    }
  }
  return [...out.values()];
}

/** Run a whole pattern; rows are in arrival order. Returns the surviving states (empty = unfair). */
export function solveRows(start: readonly SolverState[], rows: readonly SolverRow[], dts: readonly number[]): SolverState[] {
  let cur = start as SolverState[];
  for (let i = 0; i < rows.length; i++) {
    cur = advance(cur, rows[i] as SolverRow, dts[i] as number);
    if (cur.length === 0) return cur;
  }
  return cur;
}
