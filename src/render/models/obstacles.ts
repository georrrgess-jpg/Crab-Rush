import * as THREE from 'three';
import { CFG, PALETTE } from '../../config';
import { GeoBuilder, addWind } from '../geo';
import type { Materials } from '../materials';

/** Reusable obstacle geometries, one per (kind, zone skin). Each is a single merged mesh. */
export class ObstacleGeos {
  private cache = new Map<string, THREE.BufferGeometry>();

  get(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.cache.get(key);
    if (!g) {
      g = make();
      this.cache.set(key, g);
    }
    return g;
  }
}

const SAND = [0xe9c37e, 0xdcb36b, 0xf2d49a, 0xcda35f];

const hash = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const sstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
type V3 = [number, number, number];

/** packed-sand look: grain speckle, mould rings and darker damp sand at the foot */
function sandPaint(x: number, y: number, z: number, c: THREE.Color): void {
  c.multiplyScalar(0.93 + hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30)) * 0.12);
  c.multiplyScalar(0.8 + 0.2 * sstep(0, 0.35, y));
}

/** Drips of wet sand hanging from a tower rim (radius r at height y). */
function drips(b: GeoBuilder, cx: number, cz: number, r: number, y: number, n: number, seed: number, seg: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, i, 1) * 0.3;
    const len = 0.08 + hash(seed, i, 2) * 0.14;
    b.sphere(SAND[2] as number, 0.055, [cx + Math.cos(a) * r, y - len * 0.6, cz + Math.sin(a) * r], [1, len / 0.055, 0.7], seg, [0, -a, 0]);
  }
}

/** Crenellated top for a tower of radius r at height y. */
function crenels(b: GeoBuilder, cx: number, cz: number, r: number, y: number, n: number, col: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.box(col, r * 0.42, 0.18, 0.16, [cx + Math.cos(a) * r * 0.92, y + 0.09, cz + Math.sin(a) * r * 0.92], [0, -a + Math.PI / 2, 0]);
  }
}

// ------------------------------------------------------------------ zone 0 (Sunny Shore)
/**
 * Sandcastle v2 (UPDATE2_PLAN.md §2.3): lathed towers with dripped crenellations, shell decorations,
 * glowing windows and a fluttering flag. Variant 1 is a stacked bucket castle. Max radius ~1 m.
 */
export function sandcastle(variant = 0, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const sg = (n: number): number => Math.max(5, Math.round(lo ? n * 0.55 : n));
  const window = (x: number, y: number, z: number, yaw: number, s = 1): void => {
    b.box(0x5a3418, 0.13 * s, 0.2 * s, 0.06, [x, y, z], [0, yaw, 0]);
    b.box(0xffc65a, 0.08 * s, 0.13 * s, 0.065, [x, y - 0.01, z], [0, yaw, 0]);
  };
  let flagTop: V3;
  if (variant === 0) {
    // mound + main drum wall with mould rings
    b.lathe(SAND[1] as number, [[0, 0], [1.02, 0], [1.0, 0.1], [0.92, 0.18], [0, 0.2]], sg(18)).paint(sandPaint);
    b.lathe(SAND[0] as number, [[0.86, 0.12], [0.85, 0.45], [0.82, 0.88], [0.86, 0.92], [0.86, 0.98], [0, 0.98]], sg(20)).paint((x, y, z, c) => {
      sandPaint(x, y, z, c);
      if (Math.abs(((y * 6) % 1) - 0.5) < 0.06) c.multiplyScalar(0.9);
    });
    crenels(b, 0, 0, 0.86, 0.98, lo ? 6 : 10, SAND[2] as number);
    if (!lo) drips(b, 0, 0, 0.87, 0.98, 12, 3, 6);
    // central keep
    b.lathe(SAND[2] as number, [[0.5, 0.95], [0.47, 1.4], [0.45, 1.78], [0.5, 1.82], [0, 1.82]], sg(16)).paint(sandPaint);
    crenels(b, 0, 0, 0.5, 1.82, lo ? 5 : 7, SAND[0] as number);
    if (!lo) drips(b, 0, 0, 0.5, 1.82, 8, 7, 6);
    // three turrets with red roofs
    for (const [x, z, h] of [[-0.66, 0.42, 1.25], [0.66, 0.42, 1.25], [0, -0.7, 1.4]] as V3[]) {
      b.lathe(SAND[3] as number, [[0.24, 0], [0.22, h * 0.6], [0.2, h], [0.26, h + 0.04], [0, h + 0.04]], sg(10), [x, 0, z]).paint(sandPaint);
      b.lathe(0xd9573a, [[0.3, 0], [0.18, 0.18], [0.0, 0.42]], sg(10), [x, h + 0.02, z]).paint((px, py, pz, c) => c.multiplyScalar(0.85 + (py - h) * 0.4));
      if (!lo) window(x * 1.02, h * 0.65, z + 0.23, 0, 0.8);
    }
    // arched door and keep window
    b.box(0x6d4724, 0.32, 0.4, 0.08, [0, 0.32, 0.86]);
    b.cyl(0x6d4724, 0.16, 0.16, 0.08, [0, 0.52, 0.86], [Math.PI / 2, 0, 0], sg(10));
    window(0, 1.42, 0.47, 0);
    // shell decorations pressed into the wall
    if (!lo) {
      for (const [a, y, col] of [[-0.5, 0.62, 0xf7a6b8], [0.45, 0.4, 0xfff4e6], [0.9, 0.7, 0xf7a6b8], [-1.0, 0.35, 0xfff4e6], [0.2, 0.75, 0xffd0a0]] as V3[]) {
        b.sphere(col, 0.07, [Math.sin(a) * 0.86, y, Math.cos(a) * 0.86], [1, 0.8, 0.45], 6, [0, a, 0]);
      }
    }
    flagTop = [0, 2.6, 0];
    b.cyl(0x7a5530, 0.022, 0.022, 0.8, [0, 2.22, 0], [0, 0, 0], 5);
  } else {
    // bucket castle: three stacked bucket moulds with ridges
    const tiers: [number, number, number][] = [[0.95, 0.0, 0.7], [0.66, 0.7, 0.6], [0.4, 1.3, 0.5]];
    for (let i = 0; i < tiers.length; i++) {
      const [r, y0, h] = tiers[i] as [number, number, number];
      b.lathe(SAND[i % 3] as number, [[r, y0], [r * 0.95, y0 + h * 0.5], [r * 0.85, y0 + h], [0, y0 + h]], sg(18)).paint((x, y, z, c) => {
        sandPaint(x, y, z, c);
        const a = Math.atan2(z, x);
        c.multiplyScalar(0.94 + Math.max(0, Math.cos(a * 14)) * 0.08);
      });
      crenels(b, 0, 0, r * 0.85, y0 + h, lo ? 5 : 8, SAND[(i + 1) % 3] as number);
      if (!lo && i < 2) drips(b, 0, 0, r * 0.86, y0 + h, 9, 11 + i, 6);
      if (!lo) window(0, y0 + h * 0.5, r * 0.92, 0, 1 - i * 0.2);
    }
    // a big scallop pressed into the front and a spade stuck in the side
    b.sphere(0xf7a6b8, 0.16, [0.3, 0.35, 0.88], [1, 1, 0.3], sg(8));
    b.box(0x2f6fd6, 0.06, 0.9, 0.06, [-0.85, 0.75, 0.2], [0, 0, 0.35]);
    b.box(0xe53935, 0.26, 0.3, 0.04, [-0.66, 0.25, 0.2], [0, 0, 0.35]);
    flagTop = [0, 2.35, 0];
    b.cyl(0x7a5530, 0.022, 0.022, 0.7, [0, 2.0, 0], [0, 0, 0], 5);
  }
  // flag on the top (flutters; see addWind below)
  b.box(0xe53935, 0.42, 0.24, 0.02, [flagTop[0] + 0.22, flagTop[1] - 0.1, flagTop[2]]);
  b.sphere(0xffd23a, 0.04, flagTop, [1, 1, 1], 5);
  const g = b.build();
  return addWind(g, (x, y) => (y > flagTop[1] - 0.25 && x > 0.03 ? -0.06 * Math.min(1, x / 0.42) : 0));
}

/** Driftwood v2: a swept, gnarled log with knots, stubs and barnacles. Spans x -1..1, ~0.6 m tall. */
export function driftwoodLog(variant = 0, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const bark = 0xa8743f;
  const seed = 3 + variant * 17;
  const radial = lo ? 6 : 11;
  const k = variant === 0 ? 1 : -1;
  const path: V3[] = [[-1.0, 0.3, 0.02 * k], [-0.45, 0.32, 0.07 * k], [0.25, 0.29, -0.05 * k], [1.0, 0.31, 0.03 * k]];
  b.tube(bark, path, (t) => 0.29 + Math.sin(t * 19 + variant * 2) * 0.025 + Math.sin(t * 7) * 0.015 - t * 0.03, radial, lo ? 6 : 14, false);
  b.paint((x, y, z, c) => {
    const a = Math.atan2(z, y - 0.3);
    c.multiplyScalar(0.82 + 0.2 * (0.5 + 0.5 * Math.sin(a * 7 + x * 2.5 + Math.sin(x * 9) * 0.6)));
    if (y < 0.12) c.multiplyScalar(0.85);
  });
  // cut ends with growth rings
  for (const [x, r] of [[-1.0, 0.3], [1.0, 0.27]] as [number, number][]) {
    b.cyl(0xe2bd8a, r, r, 0.05, [x, 0.3, path[x < 0 ? 0 : 3]![2]], [0, 0, Math.PI / 2], radial).paint((px, py, pz, c) => {
      const d = Math.hypot(py - 0.3, pz);
      c.multiplyScalar(0.86 + 0.16 * (0.5 + 0.5 * Math.cos(d * 70)));
    });
  }
  // stubs, knots, barnacles
  b.tube(bark, [[-0.4, 0.55, 0.05 * k], [-0.48, 0.75, 0.14 * k]], (t) => 0.07 - t * 0.03, 5, 2, 'end');
  b.tube(bark, [[0.5, 0.52, -0.1 * k], [0.62, 0.66, -0.22 * k]], (t) => 0.06 - t * 0.025, 5, 2, 'end');
  if (variant === 1) {
    // forked branch rising off the back
    b.tube(bark, [[0.15, 0.4, -0.15], [0.35, 0.7, -0.45], [0.7, 0.85, -0.6]], (t) => 0.12 - t * 0.07, radial - 2, lo ? 3 : 6, 'end');
  }
  for (const [x, a] of [[0.05, 1.0], [-0.7, 2.1], [0.75, 0.4]] as [number, number][]) {
    b.sphere(0x6b4423, 0.08, [x, 0.3 + Math.cos(a) * 0.27, Math.sin(a) * 0.27], [1, 1, 0.5], 6, [a, 0, 0]);
  }
  if (!lo) {
    for (let i = 0; i < 6; i++) {
      const x = -0.85 + hash(seed, i, 1) * 0.5;
      const a = 0.6 + hash(seed, i, 2) * 1.2;
      b.cone(0xf2ece0, 0.035, 0.05, [x, 0.3 + Math.cos(a) * 0.3, Math.sin(a) * 0.3], [a, 0, 0], 5);
    }
  }
  return b.build();
}

/** Wave v2: a curling breaker with an overhanging lip, foam beads on the crest and hop chevrons. */
export function waveSweep(lo = false, chevrons = true, beads = true): THREE.BufferGeometry {
  const W = 6.8;
  // cross-section in (z, y, foam): front face rises concave into a lip that curls forward
  const prof: [number, number, number][] = [
    [0.95, 0.0, 0.35],
    [0.75, 0.12, 0.1],
    [0.56, 0.36, 0.0],
    [0.47, 0.62, 0.05],
    [0.5, 0.86, 0.25],
    [0.62, 1.0, 0.75],
    [0.56, 1.09, 1.0],
    [0.3, 1.12, 0.9],
    [0.0, 1.02, 0.55],
    [-0.35, 0.74, 0.35],
    [-0.7, 0.34, 0.5],
    [-0.85, 0.0, 0.85],
  ];
  const segs = lo ? 18 : 32;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new THREE.Color(PALETTE.oceanDeep);
  const mid = new THREE.Color(PALETTE.oceanMid);
  const shallow = new THREE.Color(PALETTE.oceanShallow);
  const foam = new THREE.Color(0xffffff);
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const x = (u - 0.5) * W;
    const ripple = Math.sin(u * Math.PI * 6) * 0.05;
    for (const [z, y, f] of prof) {
      const lean = Math.sin(u * 11 + 1.3) * 0.04 * (y / 1.1);
      pos.push(x, y * (1 + ripple) + (y > 0.05 ? Math.sin(u * 17 + z * 4) * 0.025 : 0), z + lean);
      // translucent-looking face: lighter where the water thins toward the lip
      c.copy(deep).lerp(mid, Math.min(1, y / 0.5)).lerp(shallow, Math.max(0, (y - 0.35) / 0.6) * 0.85);
      c.lerp(foam, f * (0.75 + 0.25 * Math.sin(u * 40 + y * 9)));
      col.push(c.r, c.g, c.b);
    }
  }
  const n = prof.length;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const bb = a + 1;
      const c2 = a + n;
      const d = c2 + 1;
      idx.push(a, c2, bb, bb, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const b = new GeoBuilder();
  b.raw(g);
  // foam beads along the lip
  const nBeads = beads ? (lo ? 8 : 20) : 0;
  for (let i = 0; i < nBeads; i++) {
    const x = -W / 2 + 0.1 + (i / (nBeads - 1)) * (W - 0.2);
    const r = 0.07 + hash(i, 3, 1) * 0.07;
    b.sphere(0xffffff, r, [x, 1.1 + hash(i, 4, 1) * 0.05, 0.48 + hash(i, 5, 1) * 0.16], [1.3, 0.8, 1], 5);
  }
  // chevron markers on the water in front of the crest
  for (const x of chevrons ? [-1.8, 0, 1.8] : []) {
    for (let k = 0; k < 2; k++) {
      const z = 1.15 + k * 0.5;
      b.box(0xfff1a8, 0.62, 0.05, 0.14, [x - 0.28, 0.06, z], [0, -0.7, 0]);
      b.box(0xfff1a8, 0.62, 0.05, 0.14, [x + 0.28, 0.06, z], [0, 0.7, 0]);
    }
  }
  return b.build();
}

/** Beach ball v2: pillowy six-panel ball with white caps and a valve. Rolls about x. */
export function beachBall(lo = false): THREE.BufferGeometry {
  // crisp six-gore panels: colour per triangle (no blur across seams), white caps and a valve
  const r = 0.58;
  const g = new THREE.SphereGeometry(r, lo ? 12 : 24, lo ? 8 : 14).toNonIndexed();
  const pa = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pa.count * 3);
  const palette = [0xe53935, 0xffffff, 0x2f6fd6, 0xffffff, 0xffc933, 0xffffff].map((h) => new THREE.Color(h));
  const cap = new THREE.Color(0xffffff);
  const seam = new THREE.Color(0xd8d8d8);
  const c = new THREE.Color();
  for (let t = 0; t < pa.count; t += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pa.getX(t + k);
      cy += pa.getY(t + k);
      cz += pa.getZ(t + k);
    }
    const f = ((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6;
    const sector = Math.floor(f) % 6;
    const edge = Math.min(f % 1, 1 - (f % 1));
    c.copy(Math.abs(cy / 3) > r * 0.84 ? cap : (palette[sector] as THREE.Color));
    if (!lo && edge < 0.06 && Math.abs(cy / 3) <= r * 0.84) c.copy(seam);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const b = new GeoBuilder();
  b.raw(g);
  b.cyl(0xf2f2f2, 0.06, 0.07, 0.05, [0, r + 0.01, 0], [0, 0, 0], 8);
  const out = b.build();
  // rolling axis is x, so rotate the poles onto the x axis
  out.rotateZ(Math.PI / 2);
  out.computeBoundingSphere();
  return out;
}

// gull rig joints: root, body, head, jaw, wingL, wingR, tail
export const GULL_JOINTS: { pos: V3; parent: number }[] = [
  { pos: [0, 0, 0], parent: -1 },
  { pos: [0, 0.75, 0], parent: 0 },
  { pos: [0, 1.18, 0.22], parent: 1 },
  { pos: [0, 1.33, 0.5], parent: 2 },
  { pos: [-0.3, 1.0, -0.05], parent: 1 },
  { pos: [0.3, 1.0, -0.05], parent: 1 },
  { pos: [0, 0.85, -0.45], parent: 1 },
];

/** Gull v2 geometry, rigidly skinned to GULL_JOINTS. Wings are modelled spread; the rig folds them. */
export function gullGeometry(lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const s = (n: number): number => Math.max(5, Math.round(lo ? n * 0.6 : n));
  const white = 0xfafafa;
  const grey = 0xb4bec8;
  b.bone(1).sphere(white, 0.46, [0, 0.8, 0], [0.92, 0.84, 1.3], s(14)).paint((x, y, z, c) => {
    if (y > 0.92 && z < 0.2) c.lerp(new THREE.Color(grey), sstep(0.92, 1.1, y));
  });
  b.bone(1).tube(white, [[0, 0.95, 0.2], [0, 1.12, 0.26]], 0.17, s(10), 2, false);
  // legs and webbed feet
  for (const x of [-0.14, 0.14]) {
    b.bone(1).tube(0xff9a1f, [[x, 0.45, 0.02], [x, 0.04, 0.06]], 0.032, 5, 2, false);
    b.bone(1).box(0xff9a1f, 0.2, 0.035, 0.22, [x, 0.02, 0.13]);
  }
  // head: eyes with highlights, grey brow, upper beak with the red spot
  b.bone(2).sphere(white, 0.26, [0, 1.36, 0.3], [1, 1.02, 1.05], s(14));
  for (const x of [-0.13, 0.13]) {
    b.bone(2).sphere(0x14141c, 0.045, [x, 1.42, 0.48], [1, 1, 0.7], 6);
    b.bone(2).sphere(0xffffff, 0.016, [x - 0.012, 1.44, 0.515], [1, 1, 1], 4);
    b.bone(2).box(0x9aa4ae, 0.12, 0.03, 0.06, [x, 1.5, 0.46], [0, 0, x > 0 ? -0.3 : 0.3]);
  }
  b.bone(2).cone(0xffb21f, 0.075, 0.32, [0, 1.36, 0.66], [Math.PI / 2, 0, 0], s(8), [1, 0.8, 1]);
  b.bone(2).sphere(0xe53935, 0.025, [0, 1.32, 0.72], [1, 1, 1], 4);
  b.bone(3).cone(0xff9a1f, 0.05, 0.24, [0, 1.3, 0.62], [Math.PI / 2, 0, 0], s(6), [1, 0.6, 1]);
  // wings: spread, three tones out to black tips
  for (const [bone, sg] of [[4, -1], [5, 1]] as [number, number][]) {
    b.bone(bone).sphere(0xdfe6ec, 0.3, [sg * 0.62, 1.0, -0.06], [1.5, 0.16, 0.72], s(10));
    b.bone(bone).sphere(grey, 0.24, [sg * 1.0, 1.0, -0.1], [1.4, 0.14, 0.6], s(8));
    b.bone(bone).sphere(0x2a2f38, 0.13, [sg * 1.32, 1.0, -0.13], [1.4, 0.12, 0.5], 6);
  }
  // tail fan
  b.bone(6).sphere(grey, 0.22, [0, 0.86, -0.62], [1.0, 0.18, 1.1], s(8)).paint((x, y, z, c) => {
    if (z < -0.75) c.set(0x2a2f38);
  });
  return b.build();
}

/** Build a rigid-skinned instance (bones + skinned mesh) for a shared geometry. */
export function makeRig(geo: THREE.BufferGeometry, mat: THREE.Material, joints: { pos: V3; parent: number }[], outline?: THREE.Material): { group: THREE.Group; bones: THREE.Bone[]; mesh: THREE.SkinnedMesh; line: THREE.SkinnedMesh | null } {
  const group = new THREE.Group();
  const bones = joints.map(() => new THREE.Bone());
  joints.forEach((j, i) => {
    const b = bones[i] as THREE.Bone;
    if (j.parent < 0) {
      b.position.set(...j.pos);
      group.add(b);
    } else {
      const p = (joints[j.parent] as { pos: V3 }).pos;
      b.position.set(j.pos[0] - p[0], j.pos[1] - p[1], j.pos[2] - p[2]);
      (bones[j.parent] as THREE.Bone).add(b);
    }
  });
  group.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  mesh.bind(skel, new THREE.Matrix4());
  let line: THREE.SkinnedMesh | null = null;
  if (outline) {
    line = new THREE.SkinnedMesh(geo, outline);
    line.frustumCulled = false;
    group.add(line);
    line.bind(skel, new THREE.Matrix4());
  }
  return { group, bones, mesh, line };
}

/** Wave Rider: a rounded mound of water with a foam rim that the crab surfs on. */
export function riderWave(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const pa = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pa.count * 3);
  const deep = new THREE.Color(PALETTE.oceanMid);
  const shallow = new THREE.Color(PALETTE.oceanShallow);
  const foam = new THREE.Color(0xffffff);
  const c = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const ang = Math.atan2(pa.getZ(i), pa.getX(i));
    c.copy(deep).lerp(shallow, Math.min(1, y * 1.6));
    // frothy crest and a foam band along the rim
    const froth = Math.max(0, y - 0.72) * 3.2 + (y < 0.12 ? (0.12 - y) * 6 : 0) + Math.max(0, Math.sin(ang * 9)) * 0.08;
    c.lerp(foam, Math.min(1, froth));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.scale(1.6, 0.42, 2.3);
  return g;
}

// ------------------------------------------------------------------ power-ups
export function powerupIcon(kind: 'magnet' | 'shield' | 'rider'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  if (kind === 'magnet') {
    // horseshoe: torus arc + coloured tips
    const arc = new THREE.TorusGeometry(0.28, 0.09, 8, 16, Math.PI);
    b.geo(arc, 0xe53935, [0, 0.02, 0], [0, 0, 0]);
    b.cyl(0xe8eef4, 0.09, 0.09, 0.14, [-0.28, -0.05, 0], [0, 0, 0], 8);
    b.cyl(0xe8eef4, 0.09, 0.09, 0.14, [0.28, -0.05, 0], [0, 0, 0], 8);
    b.cyl(0x2f6fd6, 0.09, 0.09, 0.1, [-0.28, -0.16, 0], [0, 0, 0], 8);
    b.cyl(0x2f6fd6, 0.09, 0.09, 0.1, [0.28, -0.16, 0], [0, 0, 0], 8);
  } else if (kind === 'shield') {
    b.cyl(0x2f6fd6, 0.3, 0.3, 0.1, [0, 0.05, 0], [Math.PI / 2, 0, 0], 14, [1, 1, 1.15]);
    b.sphere(0x2f6fd6, 0.3, [0, -0.1, 0], [1, 0.9, 0.35], 12);
    b.cyl(0xffd23a, 0.2, 0.2, 0.12, [0, 0.04, 0.02], [Math.PI / 2, 0, 0], 12, [1, 1, 1.1]);
    b.sphere(0xffffff, 0.09, [0, 0.04, 0.09], [1, 1, 0.5], 8);
  } else {
    // surfboard
    b.sphere(0xff7a1a, 0.18, [0, 0, 0], [0.55, 1.6, 0.25], 12);
    b.sphere(0xffffff, 0.04, [0, 0.0, 0.05], [0.6, 3.6, 0.3], 8);
    b.cone(0x2f6fd6, 0.04, 0.12, [0, -0.3, 0.03], [Math.PI, 0, 0], 6);
  }
  return b.build();
}

// ------------------------------------------------------------------ signs & arches
export function signTexture(text: string, sub: string, color = '#ff7a1a'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#7a5530';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#9a6f3f';
  for (let y = 0; y < 160; y += 40) g.fillRect(0, y, 512, 4);
  g.fillStyle = '#fff4dc';
  g.fillRect(14, 14, 484, 132);
  g.strokeStyle = '#5a2a10';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 484, 132);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = "56px 'Lilita One', 'Fredoka', sans-serif";
  g.fillStyle = color;
  g.strokeStyle = '#5a2a10';
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.strokeText(text, 256, 66);
  g.fillText(text, 256, 66);
  g.font = "30px 'Fredoka', sans-serif";
  g.fillStyle = '#173f66';
  g.fillText(sub, 256, 118);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Driftwood arch spanning the track; the sign plane is added separately so its texture can change. */
export function archFrame(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wood = 0xa8743f;
  const hw = CFG.trackHalfWidth + 0.5;
  for (const s of [-1, 1]) {
    b.cyl(wood, 0.22, 0.28, 4.6, [s * hw, 2.3, 0], [0, 0, s * 0.03], 8);
    b.cyl(0xc9955a, 0.2, 0.2, 0.06, [s * hw, 4.6, 0], [0, 0, 0], 8);
    b.sphere(0xe9dfc8, 0.2, [s * hw, 0.2, 0.4], [1, 0.8, 1], 6);
  }
  b.cyl(wood, 0.2, 0.2, hw * 2 + 0.8, [0, 4.55, 0], [0, 0, Math.PI / 2], 8);
  // bunting
  const cols = [0xe53935, 0xffc933, 0x2f6fd6, 0x3dae4f];
  for (let i = 0; i < 9; i++) {
    const x = -hw + 0.6 + (i / 8) * (hw * 2 - 1.2);
    b.cone(cols[i % 4] as number, 0.2, 0.4, [x, 4.2 - Math.sin((i / 8) * Math.PI) * 0.15, 0.06], [Math.PI, 0, 0], 3, [1, 1, 0.3]);
  }
  return b.build();
}

export function makeSignMesh(mats: Materials, tex: THREE.Texture): THREE.Mesh {
  void mats;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.44), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(0, 3.55, 0.08);
  return m;
}

// ------------------------------------------------------------------ Island Hop (UPDATE2_PLAN.md §5.4)
/** Golden sand dollar: a thick coin with a five-petal star, standing up to face the camera. */
export function sandDollar(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0xffcf3a, 0.46, 0.46, 0.09, [0, 0, 0], [Math.PI / 2, 0, 0], 24).paint((x, y, z, c) => {
    const r = Math.hypot(x, y);
    if (r > 0.4) c.set(0xe8a020);
  });
  // raised rim and petals on both faces
  for (const f of [1, -1]) {
    b.torus(0xfff0a0, 0.41, 0.035, [0, 0, f * 0.045], [0, 0, 0], 24);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      b.sphere(0xfff6c8, 0.11, [Math.cos(a) * 0.2, Math.sin(a) * 0.2, f * 0.05], [0.55, 1.2, 0.25], 8, [0, 0, a - Math.PI / 2]);
    }
    b.sphere(0xffe27a, 0.06, [0, 0, f * 0.05], [1, 1, 0.4], 6);
  }
  return b.build();
}

/** Hourglass shell (chase levels): glass bulbs with sand, gold caps. */
export function hourglass(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0xe9b53a, 0.32, 0.32, 0.07, [0, 0.42, 0], [0, 0, 0], 14);
  b.cyl(0xe9b53a, 0.32, 0.32, 0.07, [0, -0.42, 0], [0, 0, 0], 14);
  b.lathe(0xbfeaff, [[0.02, -0.39], [0.26, -0.3], [0.24, -0.12], [0.05, 0], [0.24, 0.12], [0.26, 0.3], [0.02, 0.39]], 14);
  b.cone(0xffb347, 0.2, 0.22, [0, -0.27, 0], [Math.PI, 0, 0], 10);
  b.cone(0xffb347, 0.14, 0.14, [0, 0.2, 0], [0, 0, 0], 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.cyl(0xe9b53a, 0.025, 0.025, 0.8, [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [0, 0, 0], 5);
  }
  return b.build();
}

/** Bounce pad: a striped cushion on springs. */
export function bouncePad(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x2a2f38, 0.85, 0.95, 0.12, [0, 0.06, 0], [0, 0, 0], 20);
  for (let i = 0; i < 3; i++) b.torus(0xc8ced6, 0.55, 0.04, [0, 0.16 + i * 0.07, 0], [Math.PI / 2, 0, 0], 16);
  b.lathe(0xe53935, [[0.01, 0.42], [0.55, 0.4], [0.78, 0.33], [0.8, 0.27], [0, 0.27]], 20).paint((x, y, z, c) => {
    const a = Math.atan2(z, x);
    if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0) c.set(0xfff4dc);
  });
  b.sphere(0xffd23a, 0.12, [0, 0.43, 0], [1, 0.4, 1], 8);
  return b.build();
}

/** Tide pool: shallow water in a ring of rocks (walkable, slows you). */
export function tidePoolPatch(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x8a7466, 1.02, 1.1, 0.08, [0, 0.02, 0], [0, 0, 0], 16, [1, 1, 1.3]);
  b.cyl(0x3fc6d8, 0.9, 0.9, 0.04, [0, 0.07, 0], [0, 0, 0], 16, [1, 1, 1.3]).paint((x, y, z, c) => c.lerp(new THREE.Color(0xbff6ff), Math.max(0, 0.6 - Math.hypot(x, z / 1.3)) * 0.8));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.ico(i % 2 ? 0x9b8577 : 0x7d6a5c, 0.16, [Math.cos(a) * 1.0, 0.06, Math.sin(a) * 1.3], [1.2, 0.6, 1], 0, 0.2, 60 + i);
  }
  b.sphere(0xff7a3a, 0.1, [0.35, 0.1, 0.2], [1, 0.3, 1], 6);
  b.sphere(0xb06ad6, 0.08, [-0.4, 0.1, -0.5], [1, 0.3, 1], 6);
  return b.build();
}

/** Finish arch: posts, a chequered banner and pennants. `light` adds a little lighthouse (chase levels). */
export function finishArch(light = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const hw = CFG.trackHalfWidth + 0.5;
  for (const s of [-1, 1]) {
    b.cyl(0xf4f4f4, 0.2, 0.24, 4.4, [s * hw, 2.2, 0], [0, 0, 0], 10).paint((x, y, z, c) => {
      if (Math.floor(y * 2.2) % 2 === 0) c.set(0xe53935);
    });
    b.sphere(0xffd23a, 0.26, [s * hw, 4.5, 0], [1, 1, 1], 10);
    b.cone(0x3fd6d0, 0.3, 0.7, [s * hw + s * 0.32, 4.95, 0], [0, 0, -s * Math.PI / 2], 3, [0.4, 1, 1]);
  }
  b.box(0xffffff, hw * 2, 1.0, 0.12, [0, 3.85, 0]).paint((x, y, z, c) => {
    const cx = Math.floor((x + hw) / 0.5);
    const cy = Math.floor((y - 3.35) / 0.5);
    if ((cx + cy) % 2 === 0) c.set(0x1a1a24);
  });
  for (let i = 0; i < 9; i++) {
    const x = -hw + 0.5 + (i / 8) * (hw * 2 - 1);
    b.cone([0xe53935, 0xffc933, 0x2f6fd6, 0x3dae4f][i % 4] as number, 0.18, 0.36, [x, 3.15, 0.08], [Math.PI, 0, 0], 3, [1, 1, 0.3]);
  }
  if (light) {
    b.lathe(0xffffff, [[0.7, 0], [0.55, 3.5], [0.5, 4.2], [0, 4.2]], 14, [hw + 3.2, 0, -2]).paint((x, y, z, c) => {
      if (Math.floor(y * 1.4) % 2 === 1) c.set(0xe53935);
    });
    b.cyl(0xfff3a0, 0.42, 0.42, 0.6, [hw + 3.2, 4.5, -2], [0, 0, 0], 10);
    b.cone(0xe53935, 0.6, 0.6, [hw + 3.2, 5.1, -2], [0, 0, 0], 10);
  }
  return addWind(b.build(), (x, y) => (y > 3.0 && y < 3.4 ? -0.04 : 0));
}

/** The Great Wave (chase levels): a towering curl that faces the crab from behind. */
export function greatWave(): THREE.BufferGeometry {
  const g = waveSweep(false, false, false);
  // unit height (crest ≈ 1): the view scales it so the crest stays below the crab on screen
  g.scale(2.4, 1 / 1.12, 2.2);
  g.rotateY(Math.PI);
  g.computeBoundingSphere();
  return g;
}

// ---- Island Hop+ (UPDATE3_PLAN.md §5.1) ----------------------------------------------------------

/** A coconut (hairy brown ball with three "eyes"); it drops from the palm canopy above the lane. */
export function coconut(lo = false): THREE.BufferGeometry {
  // fibrous husk with ridges, three eyes and a little tuft at the stem
  const b = new GeoBuilder();
  b.sphere(0x7a4a24, 0.42, [0, 0, 0], [1, 1.08, 1], lo ? 10 : 16)
    .warp((p) => {
      const a = Math.atan2(p.z, p.x);
      const k = 1 + (lo ? 0 : Math.max(0, Math.sin(a * 3)) * 0.06 + Math.sin(a * 26 + p.y * 9) * 0.012);
      p.set(p.x * k, p.y, p.z * k);
    })
    .paint((x, y, z, c) => {
      const f = Math.sin(Math.atan2(z, x) * 26 + y * 9) * 0.5 + 0.5;
      c.multiplyScalar(0.72 + f * 0.36);
      if (y > 0.3) c.lerp(new THREE.Color(0x4a2a10), sstep(0.3, 0.45, y) * 0.6);
    });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.sphere(0x2a1608, 0.055, [Math.cos(a) * 0.1, 0.43, Math.sin(a) * 0.1], [1, 0.45, 1], 6);
  }
  if (!lo) for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.seg(0x8a5a2b, [0, 0.44, 0], [Math.cos(a) * 0.12, 0.56, Math.sin(a) * 0.12], 0.02, 0.006, 3);
  }
  return b.build();
}

/** The palm canopy a coconut hangs from: fronds plus a little cluster, high over the lane. */
export function coconutCanopy(lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const n = lo ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.tube(i % 2 ? 0x2f9e4a : 0x3dae5a, [[0, 0, 0], [Math.cos(a) * 0.8, 0.12, Math.sin(a) * 0.8], [Math.cos(a) * 1.5, -0.35, Math.sin(a) * 1.5]], (t) => 0.18 * (1 - t) + 0.03, 4, lo ? 4 : 6, false);
  }
  for (let i = 0; i < 2; i++) b.sphere(0x7a4a24, 0.26, [Math.cos(i * 2.4) * 0.3, -0.2, Math.sin(i * 2.4) * 0.3], [1, 1.1, 1], 8);
  return addWind(b.build(), (x, y, z) => Math.min(1, Math.hypot(x, z) / 1.5));
}

/** A shell ring: a golden hoop studded with little shells. */
export function shellRing(lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.torus(0xffc93a, 0.78, 0.085, [0, 0, 0], [0, 0, 0], lo ? 18 : 30).paint((x, y, z, c) => c.multiplyScalar(0.9 + 0.2 * Math.max(0, y / 0.8)));
  const k = lo ? 6 : 10;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    b.sphere(i % 2 ? 0xfff2c8 : 0xff9ab0, 0.07, [Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0.07], [1, 1, 0.6], 6);
  }
  return b.build();
}
