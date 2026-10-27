/**
 * Claw clipping sweep: plays every animation with every hat and checks the skinned claw vertices against
 * the hat surface, the carapace and the eyeballs. Report: CLIP=1 npx vitest run tests/clip.test.ts
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CrabModel, type CrabDrive } from '../src/render/models/crab';
import { HAT_KINDS, type HatKind } from '../src/render/models/hats';
import type { Materials } from '../src/render/materials';
import { EYES } from './crabGeom';

const DT = 1 / 60;
const CLAW_BONES = new Set([13, 14, 15, 16, 17, 18]);
const B_BODY = 1;
const SHOULDERS = new Set([13, 16]);
const B_EYE = [2, 3];

function crab(): CrabModel {
  const m = new THREE.MeshBasicMaterial();
  return new CrabModel({ clay: m, gloss: m, gold: m, clayWind: m } as unknown as Materials);
}

const idle = (): CrabDrive => ({ running: false, grounded: true, vy: 0, vx: 0, speed: 0, crashT: -1, rider: false });
const runD = (o: Partial<CrabDrive> = {}): CrabDrive => ({ running: true, grounded: true, vy: 0, vx: 0, speed: 14, crashT: -1, rider: false, ...o });

/** a motion: a list of steps, each a drive held for some seconds with an optional trigger at its start */
type Step = { d: CrabDrive; s: number; at?: (c: CrabModel) => void };
export const MOTIONS: Record<string, Step[]> = {
  idle: [{ d: idle(), s: 3 }],
  run: [{ d: runD(), s: 2 }],
  lanes: [
    { d: runD({ vx: -14 }), s: 0.35, at: (c) => c.lane(-1) },
    { d: runD(), s: 0.4 },
    { d: runD({ vx: 14 }), s: 0.35, at: (c) => c.lane(1) },
    { d: runD(), s: 0.4 },
  ],
  hop: [
    { d: runD({ grounded: false, vy: 6 }), s: 0.3, at: (c) => c.hop() },
    { d: runD({ grounded: false, vy: 6, vx: 14 }), s: 0.1, at: (c) => c.lane(1) },
    { d: runD({ grounded: false, vy: -6 }), s: 0.35 },
    { d: runD(), s: 0.4, at: (c) => c.land(false) },
  ],
  slam: [
    { d: runD({ grounded: false, vy: 6 }), s: 0.2, at: (c) => c.hop() },
    { d: runD({ grounded: false, vy: -12 }), s: 0.2, at: (c) => c.slam() },
    { d: runD(), s: 0.5, at: (c) => c.land(true) },
  ],
  flinch: [
    { d: runD(), s: 0.6, at: (c) => c.flinch(-1) },
    { d: runD(), s: 0.6, at: (c) => c.flinch(1) },
  ],
  happy: [{ d: runD(), s: 0.8, at: (c) => c.happy() }],
  bump: [{ d: runD(), s: 0.8, at: (c) => c.bump() }],
  magnet: [{ d: runD({ magnet: true }), s: 1.5 }],
  shield: [{ d: runD({ shield: true }), s: 1.5 }],
  ride: [{ d: runD({ rider: true }), s: 1.5 }],
};
for (const e of ['sandy', 'chill', 'blossom', 'skipper', 'pinch', 'dazzle', 'yawn', 'wave', 'reef', 'lava', 'pearl']) MOTIONS[`emote ${e}`] = [{ d: idle(), s: 2.4, at: (c) => c.emote(e) }];
for (const n of ['clap', 'spin', 'wave', 'shimmy', 'hattoss', 'moonwalk']) MOTIONS[`dance ${n}`] = [{ d: idle(), s: 2.8, at: (c) => { c.dance = n; c.celebrate(); } }];

/** shell radius at height y (before the lathe's [1.05, 0.96, 0.82] scale), see buildCrab */
const PROFILE: [number, number][] = [[0.0, 0.12], [0.3, 0.13], [0.48, 0.2], [0.59, 0.31], [0.645, 0.43], [0.655, 0.5], [0.635, 0.57], [0.58, 0.67], [0.48, 0.78], [0.33, 0.87], [0.16, 0.915], [0.0, 0.93]];
function shellR(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (y >= a[1] && y <= b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / Math.max(1e-6, b[1] - a[1]);
  }
  return 0;
}
/** how deep a rest-space point sits inside the carapace (<= 0 outside) */
function shellDepth(p: THREE.Vector3): number {
  const y = p.y / 0.96;
  const r = shellR(y);
  if (r <= 0) return 0;
  return (r - Math.hypot(p.x / 1.05, p.z / 0.82)) * 0.82;
}

interface Result { hat: number; shell: number; eye: number; where?: string }

type Internals = { clayMesh: THREE.SkinnedMesh; glossMesh: THREE.SkinnedMesh; hatMesh: THREE.Mesh; skeleton: THREE.Skeleton; hatFlying: boolean };

/** Worst values over a motion: closest claw-to-hat distance, deepest claw point inside the shell / an eye. */
export function sweep(hat: HatKind, steps: Step[]): Result {
  const c = crab();
  c.setSkin(c['skin' as keyof CrabModel] as never, hat);
  const I = c as unknown as Internals;
  c.update(DT, idle());
  // claw vertices (primary bone is a claw bone), every other one
  const meshes = [I.clayMesh, I.glossMesh];
  const claws: [THREE.SkinnedMesh, number, number][] = [];
  for (const m of meshes) {
    const si = m.geometry.attributes.skinIndex!;
    const sw = m.geometry.attributes.skinWeight!;
    const pos = m.geometry.attributes.position!;
    for (let i = 0; i < si.count; i += 3) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      // the shoulder joint sits inside the shell at rest: only depth beyond the rest depth counts
      if (CLAW_BONES.has(si.getComponent(i, best))) claws.push([m, i, Math.max(0, shellDepth(new THREE.Vector3().fromBufferAttribute(pos, i)))]);
    }
  }
  // hat triangles in hat-mesh space
  const tris: THREE.Triangle[] = [];
  const hg = I.hatMesh.geometry;
  const hp = hg.attributes.position;
  if (hp) {
    const idx = hg.index;
    const n = idx ? idx.count : hp.count;
    const get = (k: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(hp, idx ? idx.getX(k) : k);
    for (let k = 0; k + 2 < n; k += 3) tris.push(new THREE.Triangle(get(k), get(k + 1), get(k + 2)));
  }
  hg.computeBoundingBox();
  const hatBox = (hg.boundingBox ?? new THREE.Box3()).clone().expandByScalar(0.05);
  const bones = I.skeleton.bones;
  const restOf = (b: number): THREE.Matrix4 => new THREE.Matrix4().multiplyMatrices(bones[b]!.matrixWorld, I.skeleton.boneInverses[b]!).invert();

  const res: Result = { hat: 9, shell: 0, eye: 0 };
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  const cp = new THREE.Vector3();
  for (const st of steps) {
    st.at?.(c);
    for (let t = 0; t < st.s; t += DT) {
      c.update(DT, st.d);
      c.root.updateMatrixWorld(true);
      const toBody = restOf(B_BODY);
      const toEye = B_EYE.map(restOf);
      const toHat = I.hatMesh.matrixWorld.clone().invert();
      const hatOn = I.hatMesh.visible && !I.hatFlying && tris.length > 0;
      for (const [m, i, rest] of claws) {
        v.fromBufferAttribute(m.geometry.attributes.position!, i);
        m.applyBoneTransform(i, v);
        v.applyMatrix4(m.matrixWorld);
        // shoulder vertices turn inside their socket in the shell: forearms and pincers only
        const sd = SHOULDERS.has(m.geometry.attributes.skinIndex!.getX(i)) ? 0 : shellDepth(q.copy(v).applyMatrix4(toBody)) - rest;
        if (sd > res.shell) {
          res.shell = sd;
          if (process.env.CLIP_DEBUG) {
            const r0 = new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position!, i);
            const si = m.geometry.attributes.skinIndex!;
            res.where = `bone ${si.getX(i)} rest (${r0.x.toFixed(2)},${r0.y.toFixed(2)},${r0.z.toFixed(2)}) now (${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}) t=${t.toFixed(2)}`;
          }
        }
        for (let e = 0; e < 2; e++) {
          const E = EYES[e]!;
          q.copy(v).applyMatrix4(toEye[e]!);
          res.eye = Math.max(res.eye, E.r - q.distanceTo(E.c));
        }
        if (hatOn) {
          q.copy(v).applyMatrix4(toHat);
          if (!hatBox.containsPoint(q)) continue;
          for (const tr of tris) {
            tr.closestPointToPoint(q, cp);
            const dd = cp.distanceTo(q);
            if (dd < res.hat) res.hat = dd;
          }
        }
      }
    }
  }
  return res;
}

describe('claw clipping (crab polish)', () => {
  it('reports', () => {
    if (!process.env.CLIP) return;
    const hats = (process.env.CLIP_HATS?.split(',') as HatKind[] | undefined) ?? HAT_KINDS;
    const only = process.env.CLIP_ONLY?.split(',');
    const rows: string[] = [];
    for (const name of Object.keys(MOTIONS)) {
      if (only && !only.includes(name)) continue;
      let worstHat = 9;
      let worstHatKind = '';
      let shell = 0;
      let eye = 0;
      for (const h of hats) {
        const r = sweep(h, MOTIONS[name]!);
        if (r.hat < worstHat) {
          worstHat = r.hat;
          worstHatKind = h;
        }
        shell = Math.max(shell, r.shell);
        eye = Math.max(eye, r.eye);
      }
      if (process.env.CLIP_DEBUG) rows.push(`   ${sweep(hats[0]!, MOTIONS[name]!).where ?? ''}`);
      rows.push(`${name.padEnd(16)} hat ${worstHat.toFixed(3)} (${worstHatKind}) shell ${shell.toFixed(3)} eye ${eye.toFixed(3)}`);
    }
    console.log(`\n${rows.join('\n')}\n`);
  }, 600_000);
});

// regression guard: the motions that reach the head, with the hats that crowd it most
describe('claws stay out of the eyes and the hat', () => {
  const cases: [string, HatKind[]][] = [
    ['emote sandy', ['straw', 'pirate', 'tophat']],
    ['emote wave', ['straw']],
    ['emote pinch', ['shades']],
    ['hop', ['straw']],
    ['dance hattoss', ['straw']],
  ];
  for (const [name, hats] of cases) {
    it(`${name} (${hats.join(', ')})`, () => {
      for (const h of hats) {
        const r = sweep(h, MOTIONS[name]!);
        expect(r.eye, `${h} eye`).toBe(0);
        expect(r.hat, `${h} hat`).toBeGreaterThan(0.002);
        expect(r.shell, `${h} shell`).toBeLessThan(0.005);
      }
    }, 60_000);
  }
});
