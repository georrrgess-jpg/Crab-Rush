/**
 * Autopilot: plans a lane/hop path over the rows ahead using the fairness solver and executes it
 * through the real World.act() input path. Used by the fairness tests (zero unavoidable crashes) and
 * the ?autopilot demo/screenshot mode.
 */
import { CFG } from '../config';
import { Cell, advance, emptyRow, hopWindow, type SolverRow, type SolverState } from './solver';
import type { Entity } from './types';
import type { World } from './world';

interface Row {
  tt: number;
  row: SolverRow;
}

interface Step {
  s: SolverState;
  T: number;
}

export interface PilotProfile {
  /** seconds between deciding and acting (human reaction) */
  reaction: number;
  /** only rows arriving within this many seconds are considered */
  horizon: number;
  /** std-dev of hop timing error (s) */
  hopNoise: number;
}

export const PERFECT: PilotProfile = { reaction: 0, horizon: 3.2, hopNoise: 0 };

export class Autopilot {
  private tick = 0;
  private targetLane = 1;
  private hopAt = Infinity; // time (world.time) at which to hop
  private pending: { at: number; lane: number; hopAt: number }[] = [];
  private seed = 12345;
  /** when set, shells are ignored (pure survival mode used by the fairness test) */
  seekShells = true;

  constructor(private w: World, private every = 3, private profile: PilotProfile = PERFECT) {}

  private gauss(): number {
    // deterministic Box-Muller
    const r = (): number => {
      this.seed = (this.seed * 16807) % 2147483647;
      return this.seed / 2147483647;
    };
    return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  }

  update(): void {
    const w = this.w;
    if (w.mode !== 'running') return;
    if (this.tick++ % this.every === 0) {
      this.replan();
      if (this.profile.reaction > 0) {
        this.pending.push({ at: w.time + this.profile.reaction, lane: this.targetLane, hopAt: this.hopAt });
      }
    }
    let lane = this.targetLane;
    let hopAt = this.hopAt;
    if (this.profile.reaction > 0) {
      // act on the decision made `reaction` seconds ago
      while (this.pending.length > 1 && (this.pending[1] as { at: number }).at <= w.time) this.pending.shift();
      const d = this.pending[0];
      if (!d || d.at > w.time) return;
      lane = d.lane;
      hopAt = d.hopAt;
    }
    const p = w.player;
    if (p.lane !== lane && p.bumpT <= 0) w.act(lane < p.lane ? 'left' : 'right');
    if (w.time >= hopAt && p.grounded) {
      w.act('hop');
      this.hopAt = Infinity;
      for (const q of this.pending) q.hopAt = Infinity;
    }
  }

  private collectRows(): Row[] {
    const w = this.w;
    const rows: Row[] = [];
    const list: { tt: number; e: Entity }[] = [];
    for (const e of w.entities) {
      if (e.dead) continue;
      if (e.kind === 'arch' || e.kind === 'banner' || e.kind === 'powerup') continue;
      const closing = Math.max(1, w.speed - e.vz);
      const rel = e.wz - w.dist;
      const tt = rel / closing;
      if (tt < -0.08 || tt > this.profile.horizon) continue;
      list.push({ tt, e });
    }
    list.sort((a, b) => a.tt - b.tt);
    const O = CFG.obstacle;
    for (const { tt, e } of list) {
      let r = rows[rows.length - 1];
      if (!r || Math.abs(r.tt - tt) > 0.06) {
        r = { tt, row: emptyRow() };
        rows.push(r);
      }
      const closing = Math.max(1, w.speed - e.vz);
      const set = (lane: number, cell: Cell, win?: { lo: number; hi: number }): void => {
        if ((r!.row.cells[lane] as Cell) >= cell && cell !== Cell.Hop) return;
        if (r!.row.cells[lane] === Cell.Solid) return;
        r!.row.cells[lane] = cell;
        if (win) {
          // intersect windows if several hop obstacles share a lane
          if (r!.row.cells[lane] === Cell.Hop && r!.row.hi[lane]! !== 0) {
            r!.row.lo[lane] = Math.max(r!.row.lo[lane]!, win.lo);
            r!.row.hi[lane] = Math.min(r!.row.hi[lane]!, win.hi);
          } else {
            r!.row.lo[lane] = win.lo;
            r!.row.hi[lane] = win.hi;
          }
        }
      };
      switch (e.kind) {
        case 'block':
        case 'gull':
          set(e.lane, Cell.Solid);
          break;
        case 'low':
          set(e.lane, Cell.Hop, hopWindow(O.low.h, O.low.d, closing));
          break;
        case 'roller':
          set(e.lane, Cell.Hop, hopWindow(O.roller.h, O.roller.d, closing));
          break;
        case 'sweep': {
          r.row.sweep = true;
          const win = hopWindow(O.sweep.h, O.sweep.d, closing);
          for (let l = 0; l < 3; l++) {
            r.row.cells[l] = Cell.Hop;
            r.row.lo[l] = win.lo;
            r.row.hi[l] = win.hi;
          }
          break;
        }
        default:
          break;
      }
    }
    return rows.slice(0, 7);
  }

  private shellScore(): number[] {
    const w = this.w;
    const sc = [0, 0, 0];
    if (!this.seekShells) return sc;
    for (const s of w.shells) {
      const rel = s.wz - w.dist;
      if (rel < 0 || rel > 40 || s.dead) continue;
      const lane = Math.round((s.x + 2.2) / 2.2);
      if (lane >= 0 && lane < 3) sc[lane] = (sc[lane] as number) + 1 / (1 + rel * 0.05);
    }
    return sc;
  }

  private replan(): void {
    const w = this.w;
    const p = w.player;
    const rows = this.collectRows();
    const scores = this.shellScore();
    const order = (cur: number): number[] => {
      const lanes = [0, 1, 2];
      lanes.sort((a, b) => (scores[b] as number) - (scores[a] as number) + (b === cur ? 0.001 : 0) - (a === cur ? 0.001 : 0));
      return lanes;
    };

    const start: SolverState = p.grounded
      ? { lane: p.lane, grp: false, lo: 0, hi: 0, last: 5, moved: w.time - p.laneChangeAt < 0.3 }
      : { lane: p.lane, grp: true, lo: -p.airTime, hi: -p.airTime, last: 0, moved: w.time - p.laneChangeAt < 0.3 };

    const path: Step[] = [];
    const dfs = (i: number, s: SolverState, T: number): boolean => {
      if (i >= rows.length) return true;
      const r = rows[i] as Row;
      const dt = r.tt - T;
      const nexts = advance([s], r.row, dt, i === 0 ? 0.0 : undefined);
      const ord = order(s.lane);
      nexts.sort((a, b) => ord.indexOf(a.lane) - ord.indexOf(b.lane) || (a.grp ? 1 : 0) - (b.grp ? 1 : 0));
      for (const n of nexts) {
        path.push({ s: n, T: r.tt });
        if (dfs(i + 1, n, r.tt)) return true;
        path.pop();
      }
      return false;
    };

    let ok = dfs(0, start, 0);
    if (!ok) {
      // unavoidable under the solver's model: fall back to the best-effort greedy lane choice
      path.length = 0;
      let lane = p.lane;
      const r0 = rows[0];
      if (r0 && r0.row.cells[lane] === Cell.Solid) {
        const alt = [0, 1, 2].filter((l) => r0.row.cells[l] !== Cell.Solid).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0];
        if (alt !== undefined) lane = alt;
      }
      this.targetLane = lane;
      // best effort hop: centre the hop on the next hop obstacle in that lane
      this.hopAt = Infinity;
      for (const r of rows) {
        if (r.row.cells[lane] === Cell.Hop && r.tt > 0) {
          this.hopAt = w.time + Math.max(0, r.tt + ((r.row.lo[lane] as number) + (r.row.hi[lane] as number)) / 2);
          break;
        }
      }
      return;
    }
    ok = true;
    void ok;

    // target lane: the lane required at the first row, but when free, drift toward the best shell lane
    this.targetLane = path[0] ? path[0].s.lane : p.lane;

    // hop timing: find the first hop group not already in flight
    this.hopAt = Infinity;
    let first = -1;
    for (let i = 0; i < path.length; i++) {
      if ((path[i] as Step).s.ng) {
        first = i;
        break;
      }
    }
    if (first >= 0) {
      // the final window of that group is the state just before the next new group
      let last = first;
      for (let i = first + 1; i < path.length; i++) {
        if ((path[i] as Step).s.ng) break;
        if ((path[i] as Step).s.grp) last = i;
      }
      const st = path[last] as Step;
      const center = (st.s.lo + st.s.hi) / 2 + st.T;
      const noise = this.profile.hopNoise > 0 ? this.gauss() * this.profile.hopNoise : 0;
      this.hopAt = w.time + Math.max(0, center + noise);
    }
  }
}
