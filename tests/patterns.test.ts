import { describe, expect, it } from 'vitest';
import { CFG, speedAt } from '../src/config';
import { PATTERNS, patternRows, rowSpacing, toSolverRows } from '../src/sim/patterns';
import { initialStates, solveRows } from '../src/sim/solver';

function speedRange(minTier: number, maxTier: number): number[] {
  const a = CFG.tierStarts[minTier] as number;
  const b = maxTier >= 4 ? 4500 : (CFG.tierStarts[maxTier + 1] as number);
  return [speedAt(a), speedAt((a + b) / 2), speedAt(b)];
}

describe('pattern library', () => {
  it('has about 30 patterns and parses all of them', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(30);
  });

  for (const pt of PATTERNS) {
    it(`${pt.def.id} is solvable from every lane (both mirror states) at its tier speeds`, () => {
      const tierMax = pt.def.maxTier ?? 4;
      for (const v of speedRange(pt.def.minTier, Math.min(tierMax, pt.def.minTier + 1))) {
        for (const mirror of [false, true]) {
          const rows = patternRows(pt, mirror);
          const sr = toSolverRows(rows, v);
          const sp = rowSpacing(pt.def.spacing, v);
          const dts = rows.map((_, i) => (i === 0 ? 1.0 : sp / v));
          for (const lane of [0, 1, 2]) {
            const out = solveRows(initialStates([lane]), sr, dts);
            expect(out.length, `${pt.def.id} lane ${lane} mirror ${mirror} v=${v.toFixed(1)}`).toBeGreaterThan(0);
          }
        }
      }
    });
  }

  it('no row is blocked in all three lanes by solid obstacles', () => {
    for (const pt of PATTERNS) {
      for (const r of pt.rows) expect(r === 'BBB' || /^[BG]{3}$/.test(r), `${pt.def.id} ${r}`).toBe(false);
    }
  });
});
