import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as O from '../src/render/models/obstacles';
import * as P from '../src/render/props';

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.attributes.position!.count) / 3;

/** Obstacles appear several at a time; keep each model lean (UPDATE2_PLAN.md §2.4 LOD). */
const MODELS: [string, (lo: boolean) => THREE.BufferGeometry][] = [
  ['castle0', (lo) => O.sandcastle(0, lo)],
  ['castle1', (lo) => O.sandcastle(1, lo)],
  ['log0', (lo) => O.driftwoodLog(0, lo)],
  ['log1', (lo) => O.driftwoodLog(1, lo)],
  ['wave', (lo) => O.waveSweep(lo)],
  ['ball', (lo) => O.beachBall(lo)],
  ['gull', (lo) => O.gullGeometry(lo)],
  ['crates', (lo) => P.crateStack(0, lo)],
  ['chair', (lo) => P.deckChair(0, lo)],
  ['boulder', (lo) => P.boulder(17, lo)],
  ['urchins', (lo) => P.urchins(0, lo)],
];

describe('obstacle triangle budgets', () => {
  for (const [name, make] of MODELS) {
    it(`${name} stays lean (hi ≤ 3000, lo ≤ 1200)`, () => {
      const hi = tris(make(false));
      const lo = tris(make(true));
      if (process.env.OBS) console.log(name, hi, lo);
      expect(hi).toBeLessThanOrEqual(3000);
      expect(lo).toBeLessThanOrEqual(1200);
    });
  }
});
