import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { Autopilot } from '../src/sim/autopilot';
import { LEVELS } from '../src/sim/levelData';
import { compileLevel, validateLevel, type CompiledLevel } from '../src/sim/levels';
import { evalStars } from '../src/sim/objectives';
import { World, defaultRunOptions } from '../src/sim/world';

const DT = 1 / 120;

/** Play a level with the autopilot; returns the finished world (or the crash description). */
export function playLevel(cl: CompiledLevel, seekShells = true): { w: World; crash: string | null } {
  const w = new World();
  const start = (CFG.zoneStarts[cl.def.island] as number) + CFG.island.startOffset;
  w.start({ ...defaultRunOptions(), seed: 1, startDist: start, tutorial: null, level: cl });
  const ap = new Autopilot(w);
  ap.seekShells = seekShells;
  let steps = 0;
  while (w.mode === 'running' && steps++ < 120 * 200) {
    ap.update();
    w.step(DT);
    w.events.length = 0;
  }
  return { w, crash: w.mode === 'crashing' ? `${cl.def.id}: ${w.crashKind} at ${(w.dist - start).toFixed(0)} m` : null };
}

describe('Island Hop levels', () => {
  it('there are 24 levels, 6 per island, ids unique, level 6 is a chase', () => {
    expect(LEVELS.length).toBe(24);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(24);
    for (let i = 0; i < 4; i++) {
      const isl = LEVELS.filter((l) => l.island === i);
      expect(isl.map((l) => l.index)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(isl.find((l) => l.index === 6)?.chase).toBe(true);
    }
  });

  for (const def of LEVELS) {
    describe(def.id, () => {
      const cl = compileLevel(def);
      it('has 3 sand dollars (chase: 6 hourglasses) and fits inside its island', () => {
        expect(cl.dollars).toBe(3);
        if (def.chase) expect(cl.hourglasses).toBeGreaterThanOrEqual(5);
        expect(cl.length).toBeGreaterThan(300);
        const start = (CFG.zoneStarts[def.island] as number) + CFG.island.startOffset;
        const next = CFG.zoneStarts[def.island + 1];
        if (next !== undefined) expect(start + cl.length + 20).toBeLessThan(next);
      });
      it('passes the fairness solver', () => {
        expect(validateLevel(cl)).toBeNull();
      });
      it('the autopilot clears it with all three sand dollars', () => {
        const { w, crash } = playLevel(cl);
        expect(crash).toBeNull();
        const stars = evalStars(def.star3, w.levelStats);
        if (process.env.LEVELS) console.log(def.id, `${cl.length.toFixed(0)} m`, `${w.levelStats.time.toFixed(1)} s`, `dollars ${w.levelStats.dollars}`, `stars ${stars.map(Number).join('')}`, def.chase ? `gap ${w.chaseGap?.toFixed(1)}` : '');
        expect(w.levelStats.finished).toBe(true);
        expect(w.levelStats.dollars).toBe(3);
      });
    });
  }
});
