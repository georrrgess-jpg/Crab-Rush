import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { Autopilot } from '../src/sim/autopilot';
import { BONUS_LEVELS, LEVELS } from '../src/sim/levelData';
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

describe('Island Hop+ (UPDATE3_PLAN.md §5.1)', () => {
  it('one bonus level per island, using coconuts and rings', () => {
    expect(BONUS_LEVELS.map((l) => l.island)).toEqual([0, 1, 2, 3]);
    for (const l of BONUS_LEVELS) {
      const cells = compileLevel(l).blocks.flatMap((b) => b.rows).join('');
      expect(cells).toContain('C');
      expect(cells).toContain('o');
    }
  });
  for (const def of BONUS_LEVELS) {
    it(`${def.id} is fair and cleared with all sand dollars and its rings star`, () => {
      const cl = compileLevel(def);
      expect(cl.dollars).toBe(3);
      expect(validateLevel(cl)).toBeNull();
      const { w, crash } = playLevel(cl);
      expect(crash).toBeNull();
      expect(w.levelStats.dollars).toBe(3);
      if (process.env.LEVELS) console.log(def.id, 'rings', w.levelStats.rings, evalStars(def.star3, w.levelStats));
      expect(evalStars(def.star3, w.levelStats)[2]).toBe(true);
    });
  }
  it('Tide Rush: every level (and bonus level) is fair and clearable at rush speed', () => {
    const fails: string[] = [];
    for (const def of [...LEVELS, ...BONUS_LEVELS]) {
      const cl = compileLevel(def, true);
      expect(cl.speed[0]).toBeCloseTo((CFG.island.speeds[def.island] as readonly number[])[0]! * CFG.island.rushSpeed);
      const v = validateLevel(cl);
      if (v) fails.push(v);
      const { crash } = playLevel(cl, false);
      if (crash) fails.push(`rush ${crash}`);
    }
    expect(fails).toEqual([]);
  }, 120_000);
  it('Tide Rush has no power-ups', () => {
    const def = LEVELS.find((l) => l.id === 'shore-3')!;
    const { w } = playLevel(compileLevel(def, true));
    expect(w.stats.powerups).toBe(0);
  });
});

import { CHEST_STARS, awardCrown, bonusUnlocked, chestsReady, openChest } from '../src/meta/chests';
import { defaultSave } from '../src/core/save';
describe('island chests and crowns', () => {
  const withStars = (n: number) => {
    const d = defaultSave();
    const isl = LEVELS.filter((l) => l.island === 0);
    let left = n;
    for (const l of isl) {
      const k = Math.min(3, left);
      left -= k;
      d.levels[l.id] = { stars: [k > 0, k > 1, k > 2], best: 30 };
    }
    return d;
  };
  it('chests become ready at 6/12/18 island stars and open once', () => {
    expect(CHEST_STARS).toEqual([6, 12, 18]);
    const d = withStars(12);
    expect(chestsReady(d)).toEqual([[0, 0], [0, 1]]);
    const r = openChest(d, 0, 0)!;
    expect(r.body).toBe('reef'); // the very first chest brings the Reef crab
    expect(d.wardrobe.owned.bodies).toContain('reef');
    expect(d.pearls).toBe(5);
    expect(openChest(d, 0, 0)).toBeNull();
    expect(openChest(d, 0, 2)).toBeNull();
    expect(openChest(d, 0, 1)!.body).toBeNull();
  });
  it('the 18-star chest opens the bonus level', () => {
    const d = withStars(18);
    for (const k of [0, 1]) openChest(d, 0, k);
    expect(bonusUnlocked(d.chests, 0)).toBe(false);
    expect(openChest(d, 0, 2)!.bonus).toBe('shore-b');
    expect(bonusUnlocked(d.chests, 0)).toBe(true);
  });
  it('crowns: once per level, the Lava crab at 12', () => {
    const d = defaultSave();
    for (let i = 0; i < 11; i++) expect(awardCrown(d, LEVELS[i]!.id).lava).toBe(false);
    expect(awardCrown(d, LEVELS[0]!.id).newCrown).toBe(false);
    expect(awardCrown(d, LEVELS[11]!.id).lava).toBe(true);
    expect(d.wardrobe.owned.bodies).toContain('lava');
  });
});
