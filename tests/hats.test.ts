import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HAT_KINDS, buildHat } from '../src/render/models/hats';

import { EYES } from './crabGeom';

/** Sample points of a hat in crab model space: vertices and triangle centroids. */
export function hatPoints(kind: (typeof HAT_KINDS)[number]): THREE.Vector3[] {
  const h = buildHat(kind);
  if (!h.geo) return [];
  const pos = h.geo.attributes.position!;
  const m = new THREE.Matrix4().makeRotationX(h.rx).setPosition(...h.pos);
  const pts: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i).applyMatrix4(m);
    b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
    pts.push(a.clone(), new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3), a.clone().lerp(b, 0.5), b.clone().lerp(c, 0.5), c.clone().lerp(a, 0.5));
  }
  return pts;
}

/** How deep (metres) the hat cuts into the eyeballs; 0 = clear. */
export function eyeClip(kind: (typeof HAT_KINDS)[number]): number {
  let worst = 0;
  for (const p of hatPoints(kind)) for (const e of EYES) worst = Math.max(worst, e.r - p.distanceTo(e.c));
  return worst;
}

describe('hat clearance (UPDATE3_PLAN.md §1.2)', () => {
  it('reports', () => {
    if (process.env.HATS) console.log(HAT_KINDS.map((k) => `${k}:${eyeClip(k).toFixed(3)}`).join(' '));
  });
  // the snorkel mask is meant to sit over the eyes (its glass is in front of them, not through them)
  for (const k of HAT_KINDS.filter((x) => x !== 'none')) {
    it(`${k} does not cut through the eyes`, () => {
      expect(eyeClip(k)).toBeLessThan(0.012);
    });
  }
});
