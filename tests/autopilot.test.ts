import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { Autopilot } from '../src/sim/autopilot';
import { World, defaultRunOptions } from '../src/sim/world';

const DT = 1 / 120;

function run(seed: number, metres: number, startDist = 0, tutorial: { move: boolean; hop: boolean } | null = null): string | null {
  const w = new World();
  w.start({ ...defaultRunOptions(), seed, startDist, tutorial });
  const ap = new Autopilot(w);
  ap.seekShells = seed % 2 === 0; // half the runs chase shells (harder paths), half play safe
  const end = startDist + metres;
  let steps = 0;
  while (w.dist < end && steps++ < 120 * 60 * 30) {
    ap.update();
    w.step(DT);
    w.events.length = 0;
    if (w.mode === 'crashing') return `seed ${seed} start ${startDist}: ${w.crashKind} at ${w.dist.toFixed(0)} m (last pattern ${w.spawner.lastPattern})`;
  }
  return null;
}

describe('autopilot fairness (zero unavoidable crashes)', () => {
  it('30 seeds × 5 km from the start', () => {
    const fails: string[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const f = run(seed, 5000);
      if (f) fails.push(f);
    }
    expect(fails).toEqual([]);
  }, 120_000);

  it('starting inside every later tier', () => {
    const fails: string[] = [];
    for (const start of CFG.tierStarts.slice(1)) {
      for (let seed = 100; seed < 106; seed++) {
        const f = run(seed, 1500, start);
        if (f) fails.push(f);
      }
    }
    expect(fails).toEqual([]);
  }, 120_000);

  it('the scripted tutorial is survivable and hands over to normal play', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), seed: 4, tutorial: { move: false, hop: false } });
    expect(w.tutorialActive).toBe(true);
    const ap = new Autopilot(w);
    let steps = 0;
    while (w.dist < 600 && steps++ < 120 * 300) {
      ap.update();
      w.step(DT * w.timeScale);
      w.events.length = 0;
      expect(w.mode).toBe('running');
    }
    expect(w.tutorialActive).toBe(false);
    expect(w.learned.move && w.learned.hop).toBe(true);
  }, 60_000);
});
