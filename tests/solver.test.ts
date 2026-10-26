import { describe, expect, it } from 'vitest';
import { initialStates, solveRows, hopWindow } from '../src/sim/solver';
import { toSolverRows } from '../src/sim/patterns';

const v = 12;
const solve = (rows: string[], dts: number[], lanes = [1]) => solveRows(initialStates(lanes), toSolverRows(rows, v), dts);

describe('fairness solver', () => {
  it('accepts a simple dodge with enough time', () => {
    expect(solve(['.B.'], [1]).length).toBeGreaterThan(0);
  });
  it('rejects a lane change when there is not enough time (rule 2)', () => {
    // two staggered walls: gap lane 0 then gap lane 2 only 0.4 s apart
    expect(solve(['.BB', 'BB.'], [1, 0.4], [0]).length).toBe(0);
    expect(solve(['.BB', 'BB.'], [1, 0.7], [0]).length).toBeGreaterThan(0);
  });
  it('rejects two separate hops closer than 0.7 s (rule 3)', () => {
    expect(solve(['.l.', '.l.'], [1, 0.8]).length).toBeGreaterThan(0);
    expect(solve(['lll'.replace(/l/g, 'L'), 'LLL'], [1, 0.5]).length).toBe(0);
  });
  it('rejects a sweep right after a forced lane change (rule 4)', () => {
    // lane 1 start; first row blocks lanes 1 → must move; sweep 0.4 s later is unfair
    expect(solve(['B.B'.replace('B.B', '.BB'), 'WWW'], [1, 0.4], [1]).length).toBe(0);
    expect(solve(['.BB', 'WWW'], [1, 0.8], [1]).length).toBeGreaterThan(0);
  });
  it('rejects fully solid rows', () => {
    expect(solve(['BBB'], [1]).length).toBe(0);
  });
  it('hop windows have workable slack at tutorial speed and at max speed', () => {
    for (const sp of [9, 12, 24]) {
      const w = hopWindow(0.6, 0.6, sp);
      expect(w.hi - w.lo).toBeGreaterThan(0.15);
      const sw = hopWindow(0.5, 1.4, sp);
      expect(sw.hi - sw.lo).toBeGreaterThan(0.12);
      const r = hopWindow(0.9, 1.0, sp + 5);
      expect(r.hi - r.lo).toBeGreaterThan(0.1);
    }
  });
});
