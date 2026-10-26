import { describe, expect, it } from 'vitest';
import { CFG, speedAt } from '../src/config';
import { MODIFIERS, type Modifier, seedFor } from '../src/meta/daily';
import { Autopilot } from '../src/sim/autopilot';
import { World, defaultRunOptions } from '../src/sim/world';
import { PATTERN_BY_ID } from '../src/sim/patterns';

const DT = 1 / 120;

function run(modifier: Modifier, seed: number, metres: number): { fail: string | null; w: World; patterns: Map<string, number> } {
  const w = new World();
  w.start({ ...defaultRunOptions(), seed, modifier });
  const ap = new Autopilot(w);
  ap.seekShells = seed % 2 === 0;
  const patterns = new Map<string, number>();
  let last = '';
  let steps = 0;
  while (w.dist < metres && steps++ < 120 * 60 * 30) {
    ap.update();
    w.step(DT);
    w.events.length = 0;
    const lp = w.spawner.lastPattern;
    if (lp !== last) {
      last = lp;
      patterns.set(lp, (patterns.get(lp) ?? 0) + 1);
    }
    if (w.mode === 'crashing') return { fail: `${modifier} seed ${seed}: ${w.crashKind} at ${w.dist.toFixed(0)} m (last pattern ${lp})`, w, patterns };
  }
  return { fail: null, w, patterns };
}

describe('Daily Tide modifiers (UPDATE2_PLAN.md §6.2)', () => {
  it('every modifier stays fair: the autopilot survives 3 km on 4 daily seeds', () => {
    const fails: string[] = [];
    for (const m of MODIFIERS) {
      for (const key of ['2026-10-26', '2026-11-02', '2027-01-15', '2027-06-30']) {
        const r = run(m.id, seedFor(key), 3000);
        if (r.fail) fails.push(r.fail);
      }
    }
    expect(fails).toEqual([]);
  }, 240_000);

  it('a modifier makes the run a daily run', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), modifier: 'gullDay' });
    expect(w.kind).toBe('daily');
    w.start(defaultRunOptions());
    expect(w.kind).toBe('endless');
  });

  it('Low Tide is faster; Magnet Madness ramps sooner', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), modifier: 'lowTide' });
    expect(w.speedForDist(500)).toBeCloseTo(speedAt(500) * CFG.daily.lowTideSpeed);
    w.start({ ...defaultRunOptions(), modifier: 'magnetMadness' });
    expect(w.speedForDist(1000)).toBeGreaterThan(speedAt(1000) + 1);
  });

  it('themed days lean on their obstacle', () => {
    const count = (m: Modifier, ch: string): number => {
      const { patterns } = run(m, 7, 2500);
      let n = 0;
      let all = 0;
      for (const [id, c] of patterns) {
        if (id === 'breather') continue;
        all += c;
        if (PATTERN_BY_ID.get(id)?.rows.some((r) => [...ch].some((x) => r.includes(x)))) n += c;
      }
      return n / Math.max(1, all);
    };
    expect(count('gullDay', 'G')).toBeGreaterThan(0.3);
    expect(count('ballStorm', 'Rr')).toBeGreaterThan(0.3);
    expect(count('bigWaves', 'BGRr')).toBeLessThan(0.15);
  }, 60_000);

  it('Magnet Madness pulls shells without a power-up', () => {
    const { w } = run('magnetMadness', 3, 400);
    expect(w.stats.shells).toBeGreaterThan(40);
  }, 30_000);
});
