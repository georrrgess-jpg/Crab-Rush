import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_SKINS, CrabModel, type CrabDrive } from '../src/render/models/crab';
import type { Materials } from '../src/render/materials';

/** CrabModel only needs materials as handles; plain ones work in node. */
function crab(): CrabModel {
  const m = new THREE.MeshBasicMaterial();
  return new CrabModel({ clay: m, gloss: m, gold: m, clayWind: m } as unknown as Materials);
}

const idle = (): CrabDrive => ({ running: false, grounded: true, vy: 0, vx: 0, speed: 0, crashT: -1, rider: false });
const runD = (): CrabDrive => ({ running: true, grounded: true, vy: 0, vx: 0, speed: 14, crashT: -1, rider: false });

/** bone world positions (eyes 2,3; claw tips 15,18) */
function joints(c: CrabModel): { eyes: THREE.Vector3[]; claws: THREE.Vector3[]; all: THREE.Vector3[] } {
  c.root.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  c.root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const byName = (n: number): THREE.Vector3 => bones.find((b) => b.name === `b${n}`)!.getWorldPosition(new THREE.Vector3());
  return { eyes: [byName(2), byName(3)], claws: [byName(15), byName(18)], all: bones.map((b) => b.getWorldPosition(new THREE.Vector3())) };
}

/** eyeball centre is offset up from the eye bone; approximate it in world space */
function eyeballs(c: CrabModel): THREE.Vector3[] {
  c.root.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  c.root.traverse((o) => {
    if (o.name === 'b2' || o.name === 'b3') out.push(new THREE.Vector3(o.name === 'b2' ? -0.06 : 0.06, 0.28, 0.07).applyMatrix4(o.matrixWorld));
  });
  return out;
}

/** Smallest front-view (x/y) distance between a claw and an eyeball while the claw is in front of it:
 * what the camera sees as a claw covering the face. */
function clawEyeMin(setup: (c: CrabModel) => void, seconds: number): number {
  const c = crab();
  c.update(1 / 60, idle());
  setup(c);
  let min = 9;
  for (let t = 0; t < seconds; t += 1 / 60) {
    c.update(1 / 60, idle());
    // in the crab's own frame (spins turn the whole crab; that is not a claw over the face)
    let b0 = c.root as THREE.Object3D;
    c.root.traverse((o) => { if (o.name === 'b0') b0 = o; });
    const inv = b0.matrixWorld.clone().invert();
    const e = eyeballs(c).map((v) => v.applyMatrix4(inv));
    const j = { claws: joints(c).claws.map((v) => v.applyMatrix4(inv)) };
    for (const a of j.claws) for (const b of e) if (a.z > b.z - 0.05) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return min;
}

describe('pose sweep (UPDATE3_PLAN.md §1.2)', () => {
  it('reports', () => {
    if (!process.env.POSE) return;
    const rows: string[] = [];
    for (const d of ['clap', 'spin', 'wave', 'shimmy', 'hattoss', 'moonwalk']) rows.push(`dance ${d}: ${clawEyeMin((c) => { c.dance = d; c.celebrate(); }, 2.6).toFixed(3)}`);
    for (const e of ['sandy', 'chill', 'blossom', 'skipper', 'pinch', 'dazzle', 'yawn', 'wave']) rows.push(`emote ${e}: ${clawEyeMin((c) => c.emote(e), 2.4).toFixed(3)}`);
    console.log(rows.join('\n'));
  });

  // dances are for showing off the face: claws stay clear of the eyes
  for (const d of ['clap', 'spin', 'wave', 'shimmy', 'hattoss', 'moonwalk']) {
    it(`the ${d} dance keeps the claws off the eyes`, () => {
      expect(clawEyeMin((c) => { c.dance = d; c.celebrate(); }, 2.6)).toBeGreaterThan(0.28);
    });
  }

  it('every pose stays finite for every body', () => {
    for (const skin of BODY_SKINS.slice(0, 3)) {
      const c = crab();
      c.setSkin(skin);
      const seq: [CrabDrive, number][] = [[idle(), 0.5], [runD(), 1], [{ ...runD(), grounded: false, vy: 5 }, 0.3], [{ ...runD(), grounded: false, vy: -5 }, 0.3], [runD(), 0.3], [{ ...runD(), crashT: 0 }, 2], [idle(), 1]];
      for (const [d, s] of seq) for (let t = 0; t < s; t += 1 / 60) {
        c.update(1 / 60, d);
        for (const p of joints(c).all) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      }
    }
  });

  it('no pops: joints never jump more than 18 cm in one frame (the fast gait moves feet ~15 cm) when states are cut short', () => {
    const c = crab();
    let prev = joints(c).all;
    let worst = 0;
    let where = '';
    const step = (d: CrabDrive, label: string): void => {
      c.update(1 / 60, d);
      const now = joints(c).all;
      for (let i = 0; i < now.length; i++) {
        const j = now[i]!.distanceTo(prev[i]!);
        if (j > worst) {
          worst = j;
          where = label;
        }
      }
      prev = now;
    };
    // interrupt everything with everything
    for (let k = 0; k < 20; k++) step(idle(), 'idle');
    c.emote('blossom');
    for (let k = 0; k < 20; k++) step(idle(), 'emote');
    for (let k = 0; k < 30; k++) step(runD(), 'emote→run');
    c.hop();
    for (let k = 0; k < 10; k++) step({ ...runD(), grounded: false, vy: 4 }, 'hop');
    c.lane(1);
    for (let k = 0; k < 10; k++) step({ ...runD(), grounded: false, vy: -2, vx: 8 }, 'air lane');
    c.land(false);
    for (let k = 0; k < 20; k++) step(runD(), 'land');
    c.dance = 'shimmy';
    c.celebrate();
    for (let k = 0; k < 30; k++) step(idle(), 'dance');
    for (let k = 0; k < 30; k++) step(runD(), 'dance→run');
    expect(worst, `worst jump ${worst.toFixed(3)} at ${where}`).toBeLessThan(0.18);
  });
});
