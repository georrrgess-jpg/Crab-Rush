import { describe, expect, it } from 'vitest';
import { CFG, speedAt } from '../src/config';
import { HAZARDS, INTRO_PATTERNS, PATTERNS, PATTERN_BY_ID, patternRows, rowSpacing, toSolverRows, type Pattern } from '../src/sim/patterns';
import { initialStates, solveRows } from '../src/sim/solver';
import { Spawner } from '../src/sim/spawner';
import { World, defaultRunOptions } from '../src/sim/world';

function speedRange(minTier: number, maxTier: number): number[] {
  const a = CFG.tierStarts[minTier] as number;
  const last = CFG.tierStarts.length - 1;
  // the top tier is open-ended: test it up to 2 km past its start (speed is near its cap by then)
  const b = maxTier >= last ? (CFG.tierStarts[last] as number) + 2000 : (CFG.tierStarts[maxTier + 1] as number);
  return [speedAt(a), speedAt((a + b) / 2), speedAt(b)];
}

describe('pattern library', () => {
  it('has about 30 patterns and parses all of them', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(30);
  });

  for (const pt of PATTERNS) {
    it(`${pt.def.id} is solvable from every lane (both mirror states) at its tier speeds`, () => {
      const tierMax = pt.def.maxTier ?? CFG.tierStarts.length - 1;
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

  it('each hazard debuts alone in its intro pattern, before any combo uses it (Update 7)', () => {
    HAZARDS.forEach((h, i) => {
      const pt = PATTERN_BY_ID.get(INTRO_PATTERNS[h]);
      expect(pt?.hazards, h).toBe(1 << i);
    });
    const proto = Spawner.prototype as unknown as { place: (pt: Pattern, ...rest: unknown[]) => void };
    const orig = proto.place;
    for (const seed of [1, 2, 3]) {
      const order: string[] = [];
      proto.place = function (pt: Pattern, ...rest: unknown[]) {
        order.push(pt.def.id);
        orig.call(this, pt, ...rest);
      };
      const w = new World();
      w.start({ ...defaultRunOptions(), seed, tutorial: null, god: true });
      for (let n = 0; n < 120 * 90 && w.dist < 1500; n++) {
        w.step(1 / 120);
        w.events.length = 0;
      }
      proto.place = orig;
      HAZARDS.forEach((h, i) => {
        const first = order.find((id) => ((PATTERN_BY_ID.get(id)?.hazards ?? 0) & (1 << i)) !== 0);
        expect(first, `seed ${seed} ${h}: ${order.join(' ')}`).toBe(INTRO_PATTERNS[h]);
      });
    }
  });
});
