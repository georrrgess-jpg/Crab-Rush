import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { World, defaultRunOptions } from '../src/sim/world';

const DT = 1 / 120;

/** a god-mode run that records every power-up and shell as it spawns */
function survey(seed: number, metres: number) {
  const w = new World();
  w.start({ ...defaultRunOptions(), seed, tutorial: null, god: true });
  const powers = new Map<number, { x: number; wz: number }>();
  const shells = new Map<number, { x: number; wz: number }>();
  while (w.dist < metres) {
    w.step(DT);
    w.events.length = 0;
    for (const e of w.entities) if (e.kind === 'powerup' && !powers.has(e.id)) powers.set(e.id, { x: e.x, wz: e.wz });
    for (const s of w.shells) if (!s.magnet && !shells.has(s.id)) shells.set(s.id, { x: s.x, wz: s.wz });
  }
  return { powers: [...powers.values()], shells: [...shells.values()] };
}

describe('Update 5 feel (UPDATE5_PLAN.md §2)', () => {
  it('power-ups never overlap each other or a shell', () => {
    for (const seed of [3, 8, 15, 27]) {
      const { powers, shells } = survey(seed, 4000);
      expect(powers.length).toBeGreaterThan(3);
      const sorted = powers.map((p) => p.wz).sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect((sorted[i] as number) - (sorted[i - 1] as number)).toBeGreaterThanOrEqual(CFG.powerupGap - 1e-6);
      for (const p of powers) for (const s of shells) expect(Math.abs(s.wz - p.wz) < CFG.powerupClear && Math.abs(s.x - p.x) < 1.2).toBe(false);
    }
  });

  it('the lane glide eases in and out and settles in laneChangeTime', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), seed: 1, tutorial: null, god: true });
    w.step(DT);
    w.act('right');
    const xs: number[] = [];
    for (let i = 0; i < 60; i++) {
      w.step(DT);
      xs.push(w.player.x);
    }
    const target = CFG.laneX[2] as number;
    // gentle start: the first step covers well under a tenth of the move
    expect(xs[0] as number).toBeLessThan(target * 0.06);
    // 95% done by laneChangeTime (+ one step of slack), never overshooting
    expect(xs[Math.ceil(CFG.laneChangeTime / DT)] as number).toBeGreaterThan(target * 0.93);
    expect(Math.max(...xs)).toBeLessThanOrEqual(target + 1e-3);
  });

  it('the magnet only reaches the neighbouring lanes and 16 m ahead', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), seed: 4, tutorial: null, god: true });
    w.step(DT);
    w.shells.length = 0;
    w.addShell(CFG.laneX[1] as number, 0.6, w.dist + 10, false);
    w.addShell(CFG.laneX[2] as number, 0.6, w.dist + 12, false);
    w.addShell(CFG.laneX[1] as number, 0.6, w.dist + 25, false);
    w.player.lane = 0;
    w.player.x = CFG.laneX[0] as number;
    w.activate('magnet');
    w.step(DT);
    expect(w.shells.map((s) => s.magnet)).toEqual([true, false, false]);
  });

  it('a pulled shell flies into the crab and is collected', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), seed: 4, tutorial: null, god: true });
    w.step(DT);
    w.shells.length = 0;
    w.addShell(CFG.laneX[0] as number, 0.6, w.dist + 12, false);
    w.pull(w.shells[0]!);
    const before = w.runShells;
    for (let i = 0; i < 120 && w.runShells === before; i++) w.step(DT);
    expect(w.runShells).toBe(before + 1);
  });

  it('a Sand Slam pulls in shells just ahead', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), seed: 5, tutorial: null, god: true });
    w.step(DT);
    w.act('hop');
    for (let i = 0; i < 20; i++) w.step(DT);
    w.shells.length = 0;
    w.addShell(CFG.laneX[0] as number, 0.6, w.dist + 4, false);
    w.addShell(CFG.laneX[1] as number, 0.6, w.dist + 30, false);
    w.act('slam');
    for (let i = 0; i < 60 && !w.player.grounded; i++) w.step(DT);
    w.step(DT);
    expect(w.shells.filter((s) => s.magnet).length).toBe(1);
  });
});
