/**
 * Balance report (opt-in): BALANCE=1 npx vitest run tests/balance.test.ts
 * Simulates players of different skill (reaction delay, look-ahead, hop timing noise) and prints
 * run length and shell income, for tuning PLAN.md §9 values.
 */
import { it } from 'vitest';
import { Autopilot, type PilotProfile } from '../src/sim/autopilot';
import { World, defaultRunOptions } from '../src/sim/world';

const PROFILES: Record<string, PilotProfile> = {
  novice: { reaction: 0.42, horizon: 1.3, hopNoise: 0.09 },
  average: { reaction: 0.32, horizon: 1.7, hopNoise: 0.06 },
  skilled: { reaction: 0.24, horizon: 2.3, hopNoise: 0.035 },
};

it.skipIf(!process.env.BALANCE)('balance report', () => {
  const lines: string[] = [];
  for (const [name, prof] of Object.entries(PROFILES)) {
    const ds: number[] = [];
    const ts: number[] = [];
    const shells: number[] = [];
    const kinds: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const w = new World();
      w.start({ ...defaultRunOptions(), seed, tutorial: null });
      const ap = new Autopilot(w, 3, prof);
      ap.seekShells = name !== 'novice';
      let n = 0;
      while (w.mode === 'running' && n++ < 120 * 600) {
        ap.update();
        w.step(1 / 120);
        w.events.length = 0;
      }
      ds.push(w.dist);
      ts.push(w.time);
      shells.push(w.runShells);
      kinds[w.crashKind || 'none'] = (kinds[w.crashKind || 'none'] ?? 0) + 1;
    }
    const q = (a: number[], f: number): number => [...a].sort((x, y) => x - y)[Math.floor(a.length * f)] as number;
    lines.push(`${name.padEnd(8)} dist p25/med/p75 ${q(ds, 0.25).toFixed(0)}/${q(ds, 0.5).toFixed(0)}/${q(ds, 0.75).toFixed(0)} m · time med ${q(ts, 0.5).toFixed(0)} s · shells med ${q(shells, 0.5)} · crashes ${JSON.stringify(kinds)}`);
  }
  console.log(`\n${lines.join('\n')}\n`);
}, 120_000);
