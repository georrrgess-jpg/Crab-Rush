import { describe, expect, it } from 'vitest';
import { GOAL_POOL, Goals, goalById, type RunSnapshot } from '../src/sim/goals';

const stats = (o: Partial<RunSnapshot['stats']> = {}): RunSnapshot['stats'] => ({
  shells: 0, bonus: 0, closeShaves: 0, hops: 0, laneChanges: 0, powerups: 0, powerKinds: { magnet: 0, shield: 0, rider: 0 },
  wavesHopped: 0, obstaclesHopped: 0, maxStreak: 0, maxDistNoShell: 0, maxDistNoHop: 0, zonesReached: 0, bumps: 0, ...o,
});
const run = (distance: number, o: Partial<RunSnapshot['stats']> = {}, zone = 0): RunSnapshot => ({ distance, stats: stats(o), zone });

describe('goals', () => {
  it('starts with three tier-1 goals', () => {
    const g = new Goals({ active: [], completed: [], progress: {} });
    expect(g.state.active).toHaveLength(3);
    for (const id of g.state.active) expect(goalById(id).tier).toBe(1);
  });
  it('completes a goal live during a run and pays on finish', () => {
    const g = new Goals({ active: [], completed: [], progress: {} });
    expect(g.state.active[0]).toBe('run300');
    const done = g.checkLive(run(320));
    expect(done.map((d) => d.id)).toContain('run300');
    const { completed, reward } = g.finishRun(run(320));
    expect(completed.map((d) => d.id)).toContain('run300');
    expect(reward).toBeGreaterThanOrEqual(60);
    expect(g.state.active).toHaveLength(3);
    expect(g.state.active).not.toContain('run300');
  });
  it('remembers the best single-run attempt and accumulates totals', () => {
    const g = new Goals({ active: ['run300', 'play3', 'hop5'], completed: [], progress: {} });
    g.finishRun(run(120, { hops: 2 }));
    g.finishRun(run(80, { hops: 1 }));
    expect(g.state.progress.run300).toBe(120);
    expect(g.state.progress.play3).toBe(2);
    expect(g.state.progress.hop5).toBe(2); // best single run, not a sum
    const r = g.finishRun(run(50));
    expect(r.completed.map((d) => d.id)).toContain('play3');
  });
  it('moves through every tier and then generates endless goals', () => {
    const g = new Goals({ active: [], completed: [], progress: {} });
    const huge = run(10000, { shells: 10000, hops: 100, laneChanges: 100, powerups: 10, wavesHopped: 50, powerKinds: { magnet: 3, shield: 3, rider: 3 }, closeShaves: 20, maxDistNoShell: 2000, maxDistNoHop: 2000, maxStreak: 100, obstaclesHopped: 100 }, 3);
    for (let i = 0; i < 20; i++) g.finishRun(huge);
    for (const def of GOAL_POOL) expect(g.state.completed).toContain(def.id);
    expect(g.state.active.every((id) => id.startsWith('gen-'))).toBe(true);
  });
  it('drops unknown goal ids from old saves', () => {
    const g = new Goals({ active: ['nope', 'run300'], completed: [], progress: {} });
    expect(g.state.active).not.toContain('nope');
    expect(g.state.active).toHaveLength(3);
  });
});
