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

/**
 * A box with rounded, smooth-shaded edges (108 triangles): the toy-shader bevel. The 3x3x3 grid's
 * inner lines are pulled to `r` from each edge, and every vertex is pushed onto a radius-r shell
 * around the inner box, so edges catch a highlight and the outline hull stays closed.
 */
export function roundBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pa = g.attributes.position as THREE.BufferAttribute;
  const na = g.attributes.normal as THREE.BufferAttribute;
  const half = [w / 2, h / 2, d / 2];
  const rr = Math.min(r, ...half.map((x) => x * 0.95));
  const v = [0, 0, 0];
  const n = [0, 0, 0];
  for (let i = 0; i < pa.count; i++) {
    v[0] = pa.getX(i);
    v[1] = pa.getY(i);
    v[2] = pa.getZ(i);
    for (let k = 0; k < 3; k++) {
      const hh = half[k] as number;
      const c = v[k] as number;
      if (Math.abs(Math.abs(c) - hh) > 1e-5) v[k] = Math.sign(c) * (hh - rr);
    }
    let l = 0;
    for (let k = 0; k < 3; k++) {
      const hh = (half[k] as number) - rr;
      const c = v[k] as number;
      const inner = Math.max(-hh, Math.min(hh, c));
      n[k] = c - inner;
      v[k] = inner;
      l += (n[k] as number) * (n[k] as number);
    }
    l = Math.sqrt(l) || 1;
    pa.setXYZ(i, (v[0] as number) + ((n[0] as number) / l) * rr, (v[1] as number) + ((n[1] as number) / l) * rr, (v[2] as number) + ((n[2] as number) / l) * rr);
    na.setXYZ(i, (n[0] as number) / l, (n[1] as number) / l, (n[2] as number) / l);
  }
  g.deleteAttribute('uv');
  return g;
}

/** Merge a sub-model (built at the origin) into `b` with a transform, keeping its colours. */
function place(b: GeoBuilder, sub: GeoBuilder, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): void {
  const g = sub.build();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  b.raw(g);
}

/** A torus with a chosen tube resolution (rings, hoops, rope). */
function torusGeo(r: number, tube: number, radial: number, seg: number, arc = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, radial, seg, arc);
  g.deleteAttribute('uv');
  return g;
}

/** Open cylinder (no caps): hoops and bands that sit on another surface. */
function bandGeo(r: number, h: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true);
  g.deleteAttribute('uv');
  return g;
}

/** A five-armed starfish lying in the xy plane, facing +z (radius ~r). */
function starfish(b: GeoBuilder, col: number, r: number, pos: V3, rot: V3, lo = false): void {
  const s = new GeoBuilder();
  s.sphere(col, r * 0.34, [0, 0, 0], [1, 1, 0.45], lo ? 5 : 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    s.cone(col, r * 0.2, r * 0.85, [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0], [0, 0, a - Math.PI / 2], 4, [1, 1, 0.5]);
  }
  if (!lo) s.sphere(0xfff0d8, r * 0.08, [0, 0, r * 0.14], [1, 1, 1], 4);
  place(b, s, pos, rot);
}

// ------------------------------------------------------------------ zone 0 (Sunny Shore)
/**
 * Sandcastle v2 (UPDATE2_PLAN.md §2.3): lathed towers with dripped crenellations, shell decorations,
 * glowing windows and a fluttering flag. Variant 1 is a stacked bucket castle. Max radius ~1 m.
 */
export function sandcastle(variant = 0, lo = false, rich = false): THREE.BufferGeometry {
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
  if (rich) {
    // High: a moat ridge of patted sand, pebbles and shells round the foot, a starfish on the wall
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      const col = [0xf7a6b8, 0xfff4e6, 0xffd0a0, 0xc9d6e8][i % 4] as number;
      b.sphere(col, 0.06 + hash(i, 5, variant) * 0.03, [Math.sin(a) * 1.0, 0.05, Math.cos(a) * 1.0], [1, 0.55, 1], 6, [0, a, 0]);
    }
    starfish(b, 0xff8a4a, 0.13, variant === 0 ? [-0.48, 0.55, 0.7] : [0.55, 1.0, 0.56], [-0.2, variant === 0 ? -0.55 : 0.6, 0.3]);
    b.sphere(0x3fae5a, 0.05, [variant === 0 ? 0.62 : -0.5, 0.1, 0.7], [1.2, 2.2, 0.6], 5);
  }
  const g = b.build();
  // castles are deeper than wide on the run camera's axis only by a little: squash front-to-back to fit
  // the block hitbox (w 1.8, d 1.2) while the front still reads round
  g.scale(1, 1, 0.7);
  return addWind(g, (x, y) => (y > flagTop[1] - 0.25 && x > 0.03 ? -0.06 * Math.min(1, x / 0.42) : 0));
}

// ------------------------------------------------------------------ zone 1 (Boardwalk Pier) block
/** One wooden crate at the origin (bottom at y 0): bevelled body, a lighter frame and brace on the front. */
function crate(col: number, w: number, h: number, d: number, lo: boolean, rich: boolean, stencil = 0): GeoBuilder {
  const s = new GeoBuilder();
  const frame = new THREE.Color(col).offsetHSL(0, -0.05, 0.08).getHex();
  const groove = new THREE.Color(col).multiplyScalar(0.62).getHex();
  if (lo) s.box(col, w, h, d, [0, h / 2, 0]);
  else {
    s.geo(roundBox(w, h, d, 0.06), col, [0, h / 2, 0]).paint((x, y, z, c) => {
      c.multiplyScalar(0.9 + 0.1 * sstep(0, h, y));
    });
  }
  const fz = d / 2 + 0.012;
  const t = 0.11;
  // front and side frames: posts, rails and a diagonal brace (the side frame on High only)
  const faces: [number, number, number][] = rich ? [[0, fz, w], [Math.PI / 2, w / 2 + 0.012, d]] : [[0, fz, w]];
  for (const [yaw, off, span] of faces) {
    const f = new GeoBuilder();
    f.box(frame, span - 0.04, t, 0.035, [0, t / 2 + 0.02, 0]);
    f.box(frame, span - 0.04, t, 0.035, [0, h - t / 2 - 0.02, 0]);
    if (!lo) {
      f.box(frame, t, h - 0.04, 0.035, [-span / 2 + t / 2 + 0.02, h / 2, 0]);
      f.box(frame, t, h - 0.04, 0.035, [span / 2 - t / 2 - 0.02, h / 2, 0]);
      f.box(groove, span - 0.2, 0.02, 0.02, [0, h * 0.37, -0.008]);
      f.box(groove, span - 0.2, 0.02, 0.02, [0, h * 0.63, -0.008]);
    }
    const dw = span - 0.3;
    const dh = h - 0.3;
    f.box(frame, Math.hypot(dw, dh), 0.1, 0.035, [0, h / 2, 0.006], [0, 0, Math.atan2(dh, dw) * (stencil % 2 ? -1 : 1)]);
    if (rich) for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) f.sphere(0x4a4a52, 0.022, [x * (span / 2 - 0.07), h / 2 + y * (h / 2 - 0.075), 0.02], [1, 1, 0.6], 4);
    place(s, f, [Math.sin(yaw) * off, 0, Math.cos(yaw) * off], [0, yaw, 0]);
  }
  // a stencilled mark on the front: a fish (1) or an anchor-ish cross (2)
  if (!lo && stencil > 0) {
    const mk = 0x2f5f9a;
    if (stencil === 1) {
      s.sphere(mk, 0.13, [-0.04, h * 0.5 + 0.15, fz + 0.02], [1.3, 0.6, 0.1], 6);
      s.cone(mk, 0.09, 0.14, [0.17, h * 0.5 + 0.15, fz + 0.02], [0, 0, Math.PI / 2], 3, [1, 1, 0.1]);
    } else {
      s.box(mk, 0.05, 0.3, 0.012, [0.0, h * 0.5 + 0.12, fz + 0.025]);
      s.box(mk, 0.2, 0.05, 0.012, [0.0, h * 0.5 + 0.22, fz + 0.025]);
      s.torus(mk, 0.12, 0.025, [0, h * 0.5 + 0.02, fz + 0.025], [0, 0, Math.PI], 8, [1, 1, 0.3]);
    }
  }
  return s;
}

/** A wooden barrel at the origin: bulging staves, iron hoops and a lid rim. */
function barrel(r: number, h: number, lo: boolean): GeoBuilder {
  const s = new GeoBuilder();
  const seg = lo ? 8 : 12;
  s.lathe(0xb07a42, [[0, 0], [r * 0.86, 0], [r * 0.93, h * 0.12], [r, h * 0.5], [r * 0.93, h * 0.88], [r * 0.86, h], [r * 0.78, h], [r * 0.76, h * 0.96], [0, h * 0.96]], seg).paint((x, y, z, c) => {
    // alternating stave shades and a darker lid
    const a = Math.atan2(z, x);
    c.multiplyScalar(0.9 + 0.12 * Math.max(0, Math.cos(a * seg)));
    if (y > h * 0.955 && Math.hypot(x, z) < r * 0.8) c.set(0x8a5a2b);
  });
  for (const y of lo ? [0.2, 0.8] : [0.14, 0.32, 0.68, 0.86]) {
    const rr = r * (0.93 + 0.07 * Math.sin(Math.PI * y)) + 0.012;
    s.geo(bandGeo(rr, h * 0.06, seg), 0x50525a, [0, h * y, 0]);
  }
  return s;
}

/**
 * Boardwalk block (Update 8): a crate stack with a barrel, a life ring and coiled rope. Variant 1 is a
 * long fish crate with a barrel and a small crate on top. Fits w ~2.0, d ~1.3, h ~2.35.
 */
export function crateBlock(variant = 0, lo = false, rich = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const rope = 0xe9dcc0;
  if (variant === 0) {
    place(b, crate(0xc28a50, 1.12, 1.15, 1.15, lo, rich, 1), [-0.42, 0, 0], [0, 0.06, 0]);
    place(b, barrel(0.44, 1.08, lo), [0.56, 0, 0.05]);
    place(b, crate(0xa8743f, 0.96, 0.98, 0.96, lo, rich, 0), [-0.12, 1.15, -0.02], [0, -0.18, 0]);
    // life ring hung on the barrel's front
    b.geo(torusGeo(0.27, 0.075, lo ? 4 : 6, lo ? 10 : 16), 0xe53935, [0.58, 0.55, 0.52], [-0.12, 0, 0]).paint((x, y, z, c) => {
      const a = Math.atan2(y - 0.55, x - 0.58);
      if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2 === 0) c.set(0xfafafa);
    });
    if (!lo) {
      // coiled rope on the top crate and a lantern
      for (let i = 0; i < 3; i++) b.geo(torusGeo(0.24 - i * 0.06, 0.04, 4, 12), rope, [-0.18, 2.17 + i * 0.06, 0], [Math.PI / 2, 0, 0]);
      b.box(0x30343c, 0.16, 0.04, 0.16, [0.56, 1.1, 0.05]);
      b.cyl(0xffd76a, 0.06, 0.06, 0.16, [0.56, 1.2, 0.05], [0, 0, 0], 6);
      b.cone(0x30343c, 0.1, 0.1, [0.56, 1.33, 0.05], [0, 0, 0], 6);
    }
    if (rich) {
      b.torus(0x30343c, 0.05, 0.012, [0.56, 1.41, 0.05], [0, 0, 0], 8);
      // rope trailing down the side
      b.tube(rope, [[-0.4, 2.15, 0.22], [-0.62, 1.95, 0.45], [-0.75, 1.3, 0.52], [-0.95, 0.2, 0.5]], 0.035, 4, 8, 'end');
    }
  } else {
    place(b, crate(0x5fa8b8, 1.98, 0.98, 1.18, lo, rich, 2), [0, 0, 0]);
    place(b, barrel(0.4, 1.3, lo), [-0.45, 0.98, 0.02]);
    place(b, crate(0xc9955a, 0.82, 0.7, 0.84, lo, rich, 0), [0.5, 0.98, 0.05], [0, 0.22, 0]);
    // a net of floats draped over the long crate's corner
    for (let i = 0; i < (lo ? 2 : 4); i++) b.sphere(i % 2 ? 0xffc933 : 0xff7a1a, 0.11, [0.98 - i * 0.04, 0.78 - i * 0.2, 0.36 - i * 0.12], [1, 1, 1], lo ? 6 : 8);
    if (!lo) {
      b.tube(rope, [[0.95, 0.95, 0.5], [1.0, 0.7, 0.4], [0.97, 0.3, 0.1], [0.98, 0.05, -0.2]], 0.03, 4, 8, false);
      for (let i = 0; i < 2; i++) b.geo(torusGeo(0.18 - i * 0.05, 0.04, 4, 12), rope, [0.5, 1.72 + i * 0.06, 0.05], [Math.PI / 2, 0, 0]);
    }
    if (rich) {
      // a gull feather and a fish tail poking out of the long crate
      b.cone(0x7fb2d6, 0.1, 0.22, [-0.85, 0.98, 0.42], [0.4, 0, 0.6], 4, [1, 1, 0.3]);
      b.sphere(0xfafafa, 0.04, [0.15, 1.01, 0.55], [0.6, 3.0, 0.6], 4, [0.5, 0, -0.4]);
    }
  }
  return b.build();
}

// ------------------------------------------------------------------ zone 2 (Tide Pool Cove) block
/**
 * Tide-pool rock block (Update 8). Variant 0 is a sea stack (a big sculpted rock capped by a smaller one)
 * with strata, a mossy top, barnacles and a starfish; variant 1 is a balanced cairn of three smooth
 * banded pebbles. Fits w ~2.0, d ~1.4, h ~2.35.
 */
export function rockBlock(variant = 0, lo = false, rich = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const seed = 17 + variant * 6;
  const n3 = (x: number, y: number, z: number): number =>
    Math.sin(x * 2.1 + seed) * Math.sin(y * 2.7 + seed * 0.7) * Math.sin(z * 2.3 + seed * 1.3) * 0.5 + Math.sin(x * 5.3 + y * 3.1 + seed) * 0.18;
  const strata = (x: number, y: number, z: number, c: THREE.Color): void => {
    const band = Math.sin(y * 9 + Math.sin(x * 1.7 + z * 1.3) * 0.9);
    c.multiplyScalar(0.88 + band * 0.08 + hash(Math.round(x * 14), Math.round(y * 14), Math.round(z * 14)) * 0.06);
    if (y < 0.35) c.lerp(new THREE.Color(0x4f4038), sstep(0.35, 0.02, y) * 0.55);
  };
  if (variant === 0) {
    b.ico(0x9b8577, 1.0, [0, 0.82, 0], [0.98, 0.84, 0.66], lo ? 1 : 2, 0.06, seed)
      .warp((p) => {
        const k = 1 + n3(p.x, p.y, p.z) * 0.2;
        p.set(p.x * k, 0.82 + (p.y - 0.82) * k, p.z * k);
        if (p.y < 0.06) p.y = 0.06 * (1 - Math.exp((p.y - 0.06) * 6));
      })
      .paint(strata);
    b.ico(0xa8927f, 0.5, [0.1, 1.8, -0.02], [1.15, 0.92, 1.0], lo ? 1 : 2, 0.08, seed + 5)
      .warp((p) => {
        const k = 1 + n3(p.x * 2, p.y * 2, p.z * 2) * 0.16;
        p.set(0.1 + (p.x - 0.1) * k, 1.8 + (p.y - 1.8) * k, -0.02 + (p.z + 0.02) * k);
      })
      .paint((x, y, z, c) => {
        strata(x, y, z, c);
        // moss on the cap
        if (y > 2.0) c.lerp(new THREE.Color(0x4f9a46), sstep(2.0, 2.2, y) * (0.6 + 0.4 * Math.sin(x * 7 + z * 5)));
      });
    if (!lo) starfish(b, 0xff7a3a, 0.2, [-0.38, 0.95, 0.66], [-0.15, -0.35, 0.4]);
    if (!lo) {
      for (let i = 0; i < 8; i++) {
        const a = -1.0 + hash(seed, i, 1) * 2.0;
        const y = 0.18 + hash(seed, i, 2) * 0.5;
        b.cone(0xf2ece0, 0.055, 0.07, [Math.sin(a) * 0.92, y, Math.cos(a) * 0.62], [Math.PI / 2 - 0.3, a, 0], 5);
      }
      // seaweed draped over the shoulder
      b.tube(0x2f8a4a, [[0.55, 1.52, 0.3], [0.78, 1.3, 0.45], [0.85, 0.9, 0.5], [0.9, 0.5, 0.45]], (t) => 0.06 - t * 0.03, 3, 6, false);
    }
    if (rich) {
      // a pink anemone tucked in the crease and a few pebbles
      b.cyl(0xff8fb1, 0.1, 0.07, 0.1, [0.38, 1.3, 0.55], [0.9, 0, 0], 8);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cone(0xffc2d4, 0.025, 0.1, [0.38 + Math.cos(a) * 0.07, 1.36 + Math.sin(a) * 0.05, 0.61], [0.9 + Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], 4);
      }
      for (let i = 0; i < 4; i++) b.sphere(0x8a7a6e, 0.08, [-0.8 + i * 0.45, 0.04, 0.72 - (i % 2) * 0.1], [1.2, 0.5, 1], 5);
    }
  } else {
    // balanced pebbles: wide flat bottom, a middle stone and a small top stone, each with a quartz band
    const stones: [number, number, number, number, number, number][] = [
      // x, y, rx, ry, rz, tilt
      [0, 0.46, 1.0, 0.46, 0.68, 0.0],
      [0.08, 1.26, 0.74, 0.4, 0.55, 0.08],
      [-0.04, 1.96, 0.5, 0.34, 0.42, -0.12],
    ];
    const cols = [0x8f8a86, 0xa79b8f, 0x7f8790];
    stones.forEach(([x, y, rx, ry, rz, tilt], i) => {
      b.sphere(cols[i] as number, 1, [x, y, 0], [rx, ry, rz], lo ? 7 : 12, [0, 0, tilt])
        .warp((p) => {
          // flatten the contact faces so each stone sits on the next
          const ly = (p.y - y) / ry;
          if (ly < -0.75) p.y = y - ry * (0.75 + (-ly - 0.75) * 0.35);
          if (ly > 0.8 && i < 2) p.y = y + ry * (0.8 + (ly - 0.8) * 0.4);
        })
        .paint((px, py, pz, c) => {
          const ly = (py - y) / ry;
          c.multiplyScalar(0.92 + hash(Math.round(px * 9), Math.round(py * 9), Math.round(pz * 9)) * 0.1);
          // a quartz band and a wet foot
          if (Math.abs(ly - 0.1 + px * 0.25) < 0.14) c.lerp(new THREE.Color(0xf4efe6), 0.75);
          if (py < 0.25) c.lerp(new THREE.Color(0x4f4038), sstep(0.25, 0.02, py) * 0.5);
        });
    });
    if (!lo) starfish(b, 0xffb03a, 0.17, [0.42, 1.28, 0.5], [-0.25, 0.5, -0.3]);
    if (!lo) {
      for (let i = 0; i < 6; i++) {
        const a = -1.0 + hash(seed, i, 1) * 2.0;
        b.cone(0xf2ece0, 0.05, 0.06, [Math.sin(a) * 0.95, 0.18 + hash(seed, i, 2) * 0.3, Math.cos(a) * 0.62], [Math.PI / 2 - 0.3, a, 0], 5);
      }
      b.tube(0x3a9a50, [[-0.5, 1.5, 0.3], [-0.72, 1.2, 0.45], [-0.85, 0.85, 0.6]], (t) => 0.05 - t * 0.025, 3, 5, false);
    }
    if (rich) {
      // a snail on the top stone and moss in the cracks
      b.sphere(0xd98a4a, 0.08, [0.18, 2.2, 0.2], [1, 1, 0.8], 6);
      b.sphere(0xe9d8b8, 0.05, [0.26, 2.17, 0.24], [1.4, 0.6, 0.7], 5);
      for (let i = 0; i < 4; i++) b.sphere(0x5fa04f, 0.08, [-0.6 + i * 0.4, 0.88, 0.42 + (i % 2) * 0.06], [1.5, 0.4, 1], 5);
    }
  }
  return b.build();
}

/** Driftwood v2: a swept, gnarled log with knots, stubs and barnacles. Spans x -1..1, ~0.6 m tall. */
export function driftwoodLog(variant = 0, lo = false, rich = false): THREE.BufferGeometry {
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
  // (kept low and tight: the log fills the 2.0 x 0.6 x 0.6 low-obstacle box)
  b.tube(bark, [[-0.4, 0.52, 0.04 * k], [-0.5, 0.68, 0.1 * k]], (t) => 0.07 - t * 0.03, 5, 2, 'end');
  b.tube(bark, [[0.5, 0.5, -0.08 * k], [0.64, 0.62, -0.16 * k]], (t) => 0.06 - t * 0.025, 5, 2, 'end');
  if (variant === 1) {
    // forked branch sweeping along the top toward the far end
    b.tube(bark, [[0.1, 0.45, -0.1], [0.4, 0.62, -0.18], [0.78, 0.68, -0.22]], (t) => 0.1 - t * 0.055, radial - 3, lo ? 3 : 6, 'end');
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
    // a strand of seaweed draped over the top
    b.tube(0x3a9a50, [[0.2 * k, 0.6, 0.0], [0.24 * k, 0.5, 0.26], [0.3 * k, 0.24, 0.33], [0.36 * k, 0.04, 0.36]], (t) => 0.045 - t * 0.02, 3, 6, false);
  }
  if (rich) {
    // High: pale bark rims round the cut ends and a resting shell
    for (const [x, r] of [[-1.0, 0.3], [1.0, 0.27]] as [number, number][]) {
      b.geo(torusGeo(r - 0.01, 0.03, 4, radial), 0xc79a62, [x, 0.3, path[x < 0 ? 0 : 3]![2]], [0, Math.PI / 2, 0]);
    }
    b.sphere(0xf7a6b8, 0.07, [-0.55, 0.05, 0.33], [1, 0.5, 0.9], 6);
  }
  return b.build();
}

/**
 * Low obstacles for the Boardwalk Pier (zone 1) and Tide Pool Cove (zone 2), Update 8.
 * Zone 1: a surfboard standing in two stands (0) or a cooler and a boom box (1).
 * Zone 2: a ledge of urchins (0) or a coral ridge (1). Each fits w ~2.1, d ~0.7, h ~0.65.
 */
export function lowBarrier(zone: number, variant = 0, lo = false, rich = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  if (zone === 1 && variant === 0) {
    // a surfboard standing on its rail in two little wooden stands: its painted deck faces the camera
    for (const x of [-0.6, 0.6]) {
      if (lo) b.box(0xa8743f, 0.18, 0.08, 0.62, [x, 0.04, 0]);
      else b.geo(roundBox(0.18, 0.09, 0.64, 0.03), 0xa8743f, [x, 0.045, 0]);
      for (const z of [-0.085, 0.085]) b.box(0xc9955a, 0.08, 0.26, 0.05, [x, 0.2, z]);
    }
    b.sphere(0xff7a1a, 1, [0, 0.335, 0], [1.2, 0.29, 0.05], lo ? 10 : 14)
      .warp((p) => {
        const u = p.x / 1.2;
        // pointed nose at +x, squared tail, a little rocker
        const taper = u > 0 ? 1 - u * u * 0.55 : 1 - u * u * 0.18;
        p.y = 0.335 + (p.y - 0.335) * taper + u * u * 0.05;
        p.z -= u * u * 0.03;
      })
      .paint((x, y, z, c) => {
        const u = x / 1.2;
        const w = 0.29 * (u > 0 ? 1 - u * u * 0.55 : 1 - u * u * 0.18);
        const e = Math.abs(y - 0.335 - u * u * 0.05) / Math.max(0.01, w);
        if (e > 0.74) c.set(0x2fb7c8);
        else if (e < 0.08) c.set(0xfff4dc);
        if (Math.abs(u + 0.42) < 0.05 || Math.abs(u + 0.3) < 0.025) c.set(0xfff4dc);
        if (z < 0) c.multiplyScalar(0.85);
      });
    if (!lo) {
      // a sun decal on the deck and the leash coiled at the tail
      b.cyl(0xffd23a, 0.1, 0.1, 0.02, [0.38, 0.35, 0.05], [Math.PI / 2, 0, 0], 10);
      b.geo(torusGeo(0.09, 0.016, 4, 10), 0x30343c, [-1.0, 0.2, 0.08], [0, 0, 0]);
    }
    if (rich) {
      // a towel over the nose end and a wax bar on one stand
      b.box(0x3dae4f, 0.34, 0.5, 0.02, [0.86, 0.32, 0.075]).paint((x, y, z, c) => {
        if (Math.floor((y + 1) * 14) % 2 === 0) c.set(0xfff4dc);
      });
      b.box(0xffe9a8, 0.1, 0.05, 0.08, [-0.6, 0.115, 0.2], [0, 0.3, 0]);
    }
  } else if (zone === 1) {
    // cooler: bevelled blue body, white lid with a rim, handles and a latch
    const body = lo ? new THREE.BoxGeometry(1.3, 0.5, 0.64) : roundBox(1.3, 0.5, 0.64, 0.07);
    b.geo(body, 0x2f8fd6, [-0.36, 0.26, 0]).paint((x, y, z, c) => {
      if (y < 0.1) c.multiplyScalar(0.8);
    });
    b.geo(lo ? new THREE.BoxGeometry(1.36, 0.1, 0.68) : roundBox(1.36, 0.11, 0.69, 0.045), 0xfafafa, [-0.36, 0.56, 0]);
    b.box(0xd8dde4, 0.22, 0.12, 0.04, [-0.36, 0.48, 0.33]);
    for (const x of [-1.03, 0.31]) b.box(0xd8dde4, 0.05, 0.08, 0.32, [x, 0.38, 0]);
    // boom box: bevelled case, two speakers and a handle
    b.geo(lo ? new THREE.BoxGeometry(0.62, 0.38, 0.28) : roundBox(0.62, 0.38, 0.28, 0.05), 0xff4f9a, [0.7, 0.19, 0.12], [0, -0.25, 0]);
    for (const dx of [-0.16, 0.16]) {
      const x = 0.7 + Math.cos(0.25) * dx;
      const z = 0.12 + Math.sin(0.25) * dx + 0.15;
      b.cyl(0x30343c, 0.11, 0.11, 0.03, [x, 0.19, z], [Math.PI / 2, -0.25, 0], lo ? 8 : 12);
      if (!lo) b.cyl(0x8a8f98, 0.04, 0.04, 0.035, [x, 0.19, z + 0.01], [Math.PI / 2, -0.25, 0], 6);
    }
    b.tube(0x30343c, [[0.47, 0.36, 0.06], [0.52, 0.5, 0.08], [0.88, 0.5, 0.18], [0.93, 0.36, 0.2]], 0.025, 4, lo ? 4 : 8, false);
    if (rich) {
      // a soda can and a striped towel peeking from under the lid
      b.cyl(0xe53935, 0.05, 0.05, 0.14, [0.18, 0.07, 0.36], [0, 0, 0], 8);
      b.box(0xffc933, 0.5, 0.012, 0.18, [-0.6, 0.5, 0.36], [-0.5, 0, 0]);
    }
  } else if (variant === 0) {
    // urchin ledge: a flat, wet rock with three urchins whose spines stay upright and inside the box
    b.ico(0x7d6a5c, 1, [0, 0.13, 0], [1.08, 0.2, 0.36], lo ? 1 : 2, 0.1, 31).paint((x, y, z, c) => {
      c.multiplyScalar(0.85 + hash(Math.round(x * 10), 1, Math.round(z * 10)) * 0.2);
      if (y > 0.2) c.lerp(new THREE.Color(0x4f9a46), 0.35);
    });
    const spines = lo ? 7 : 11;
    for (const [x, z, s0] of [[-0.62, 0.0, 1.2], [0.02, 0.04, 1.32], [0.64, -0.02, 1.12]] as V3[]) {
      const y0 = 0.3;
      b.sphere(0x6a3a8a, 0.19 * s0, [x, y0, z], [1, 0.85, 1], lo ? 6 : 9).paint((px, py, pz, c) => {
        c.lerp(new THREE.Color(0x2a1640), sstep(0.42, 0.18, py));
        if (py > 0.42) c.lerp(new THREE.Color(0xb07ad6), 0.35);
      });
      for (let i = 0; i < spines; i++) {
        const a = (i / spines) * Math.PI * 2 + hash(x * 10, i, 1) * 0.3;
        const up = 0.35 + hash(x * 10, i, 2) * 0.6;
        const len = (0.2 + hash(x * 10, i, 3) * 0.08) * s0;
        const hr = Math.sqrt(1 - up * up);
        b.seg(0x2a1640, [x, y0, z], [x + Math.cos(a) * hr * len, y0 + up * len, z + Math.sin(a) * hr * len * 0.55], 0.024, 0.004, 3);
      }
    }
    if (!lo) starfish(b, 0xff7a3a, 0.13, [-0.3, 0.26, 0.24], [-1.2, 0, 0.4]);
    if (rich) for (let i = 0; i < 5; i++) b.sphere(0x9b8577, 0.05, [-0.9 + i * 0.45, 0.03, 0.32], [1.3, 0.6, 1], 5);
    return addWind(b.build(), (x, y) => Math.max(0, y - 0.38) * 0.1);
  } else {
    // coral ridge: a low rock with branching pink coral, a brain coral and an anemone
    b.ico(0x8a7466, 1, [0, 0.12, 0], [1.1, 0.19, 0.34], lo ? 1 : 2, 0.1, 37).paint((x, y, z, c) => c.multiplyScalar(0.85 + hash(Math.round(x * 10), 2, Math.round(z * 10)) * 0.2));
    const branch = (x: number, z: number, h: number, lean: number, col: number): void => {
      b.tube(col, [[x, 0.2, z], [x + lean * 0.4, 0.2 + h * 0.55, z], [x + lean, 0.2 + h, z * 0.6]], (t) => 0.06 - t * 0.025, lo ? 3 : 5, lo ? 2 : 4, 'end');
      if (!lo) b.tube(col, [[x + lean * 0.4, 0.2 + h * 0.5, z], [x + lean * 0.4 - 0.12, 0.2 + h * 0.85, z + 0.04]], (t) => 0.04 - t * 0.015, 4, 2, 'end');
    };
    branch(-0.75, 0.0, 0.46, 0.1, 0xff6f8f);
    branch(-0.45, 0.05, 0.4, -0.12, 0xff8f6f);
    branch(0.55, -0.02, 0.46, 0.14, 0xff6f8f);
    branch(0.82, 0.04, 0.34, -0.08, 0xffa05a);
    // brain coral in the middle
    b.sphere(0xf0c060, 0.28, [0.04, 0.3, 0.02], [1.15, 0.85, 0.95], lo ? 7 : 11).paint((x, y, z, c) => {
      if (Math.sin(x * 40 + Math.sin(z * 30) * 2) > 0.3) c.multiplyScalar(0.78);
    });
    if (!lo) {
      b.cyl(0x9a5ad6, 0.09, 0.06, 0.1, [-0.15, 0.25, 0.2], [0, 0, 0], 8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.cone(0xd8a8ff, 0.022, 0.12, [-0.15 + Math.cos(a) * 0.06, 0.34, 0.2 + Math.sin(a) * 0.06], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], 4);
      }
    }
    if (rich) {
      starfish(b, 0xffd23a, 0.11, [0.3, 0.24, 0.25], [-1.1, 0, -0.3]);
      for (let i = 0; i < 4; i++) b.sphere(0xfff4e6, 0.04, [-0.95 + i * 0.6, 0.03, 0.3], [1.2, 0.5, 1], 5);
    }
    return addWind(b.build(), (x, y) => Math.max(0, y - 0.35) * 0.06);
  }
  return b.build();
}

/** Cross-sections (z, y, foam) for the breakers: the front face rises concave into a lip that curls forward. */
type Prof = [number, number, number][];
const TALL_WAVE: Prof = [
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
/** Update 8 sweep: a low curling shore break that fits the 0.5 m hop-over box (crest ~0.58 m). */
const LOW_WAVE: Prof = [
  [0.78, 0.0, 0.7],
  [0.62, 0.04, 0.3],
  [0.46, 0.13, 0.05],
  [0.34, 0.26, 0.0],
  [0.29, 0.38, 0.08],
  [0.31, 0.48, 0.4],
  [0.36, 0.55, 0.85],
  [0.26, 0.6, 1.0],
  [0.06, 0.6, 0.95],
  [-0.16, 0.52, 0.6],
  [-0.42, 0.34, 0.35],
  [-0.64, 0.14, 0.45],
  [-0.76, 0.0, 0.8],
];

/** Wave v3: a curling breaker with an overhanging lip, foam beads on the crest and hop chevrons. */
export function waveSweep(lo = false, chevrons = true, beads = true): THREE.BufferGeometry {
  return breaker(LOW_WAVE, lo, chevrons, beads);
}

function breaker(prof: Prof, lo: boolean, chevrons: boolean, beads: boolean): THREE.BufferGeometry {
  const W = 6.8;
  const crest = Math.max(...prof.map((p) => p[1]));
  const tall = crest > 0.9;
  const segs = tall ? (lo ? 18 : 32) : lo ? 17 : 30;
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
      const k = y / crest;
      const lean = Math.sin(u * 11 + 1.3) * 0.04 * k;
      pos.push(x, y * (1 + ripple * (tall ? 1 : 0.5)) + (y > 0.05 ? Math.sin(u * 17 + z * 4) * 0.025 * (tall ? 1 : 0.6) : 0), z + lean);
      // translucent-looking face: lighter where the water thins toward the lip
      c.copy(deep).lerp(mid, Math.min(1, k * 2.2)).lerp(shallow, Math.max(0, (k - 0.32) / 0.55) * 0.85);
      c.lerp(foam, f * (0.75 + 0.25 * Math.sin(u * 40 + y * 9)));
      // a pale sunlit band just under the lip (reads as a glassy face from the run camera)
      if (!tall && z > 0.25 && k > 0.55 && k < 0.85) c.lerp(new THREE.Color(0xbff6ff), 0.45);
      // the low break needs a bold white crest to read across three lanes from the run camera
      if (!tall && k > 0.86) c.lerp(foam, 0.6);
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
    const r = (0.07 + hash(i, 3, 1) * 0.07) * (tall ? 1 : 0.6);
    if (tall) b.sphere(0xffffff, r, [x, 1.1 + hash(i, 4, 1) * 0.05, 0.48 + hash(i, 5, 1) * 0.16], [1.3, 0.8, 1], 5);
    else b.sphere(0xffffff, r, [x, 0.585 + hash(i, 4, 1) * 0.02, 0.2 + hash(i, 5, 1) * 0.14], [1.4, 0.7, 1], 5);
  }
  // chevron markers on the water in front of the crest
  for (const x of chevrons ? [-1.8, 0, 1.8] : []) {
    for (let k = 0; k < 2; k++) {
      const z = tall ? 1.15 + k * 0.5 : 1.0 + k * 0.42;
      b.box(0xfff1a8, 0.62, 0.05, 0.14, [x - 0.28, 0.06, z], [0, -0.7, 0]);
      b.box(0xfff1a8, 0.62, 0.05, 0.14, [x + 0.28, 0.06, z], [0, 0.7, 0]);
    }
  }
  return b.build();
}

/**
 * Beach ball v3: six crisp gores (segments aligned to the seams, so colour never smears across one),
 * smooth shading, white caps with a raised button and valve. Rolls about x. Radius 0.56.
 */
export function beachBall(lo = false): THREE.BufferGeometry {
  const r = BALL_R;
  // smooth normals are computed on the indexed sphere, then kept when it's split for per-face colour
  const g = new THREE.SphereGeometry(r, lo ? 12 : 24, lo ? 8 : 12).toNonIndexed();
  g.deleteAttribute('uv');
  const pa = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pa.count * 3);
  const palette = [0xe53935, 0xfafafa, 0x2f6fd6, 0xfafafa, 0xffc933, 0xfafafa].map((h) => new THREE.Color(h));
  const cap = new THREE.Color(0xffffff);
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
    const sector = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6;
    c.copy(Math.abs(cy / 3) > r * 0.9 ? cap : (palette[sector] as THREE.Color));
    for (let k = 0; k < 3; k++) {
      // a soft shade toward the poles keeps the ball round under flat toy lighting
      const y = Math.abs(pa.getY(t + k)) / r;
      const f = 1 - y * y * 0.12;
      col.set([c.r * f, c.g * f, c.b * f], (t + k) * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const b = new GeoBuilder();
  b.raw(g);
  // pole buttons (a raised bevelled disc) and the valve
  for (const sy of [1, -1]) b.lathe(0xf4f4f4, [[0.1, -0.02], [0.095, 0.0], [0.075, 0.024], [0, 0.026]], lo ? 6 : 10, [0, sy * (r - 0.005), 0], [sy > 0 ? 0 : Math.PI, 0, 0]);
  if (!lo) {
    b.cyl(0xf2f2f2, 0.035, 0.045, 0.06, [0.24, r * 0.88, 0.0], [0, 0, -0.45], 6);
    b.cyl(0xd0d0d0, 0.02, 0.02, 0.02, [0.255, r * 0.88 + 0.035, 0.0], [0, 0, -0.45], 6);
  }
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
/** Heater-shield outline (about 0.6 wide, 0.7 tall), centred on the origin. */
function shieldShape(k: number): THREE.Shape {
  const sh = new THREE.Shape();
  sh.moveTo(-0.3 * k, 0.3 * k);
  sh.quadraticCurveTo(0, 0.38 * k, 0.3 * k, 0.3 * k);
  sh.quadraticCurveTo(0.32 * k, -0.08 * k, 0, -0.38 * k);
  sh.quadraticCurveTo(-0.32 * k, -0.08 * k, -0.3 * k, 0.3 * k);
  return sh;
}

function starShape(r: number, inner: number): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? inner : r;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  return sh;
}

function extrude(shape: THREE.Shape, depth: number, bevel: number, curveSegments = 8): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/**
 * Power-up icons v3 (Update 8): a bevelled horseshoe magnet with chamfered pole tips and a gloss streak,
 * a heater shield with a gold rim and a star, and a rockered surfboard with rails, stringer and fin.
 * The surfboard is also the Wave Rider board under the crab (view.ts), so it keeps its size.
 */
export function powerupIcon(kind: 'magnet' | 'shield' | 'rider'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  if (kind === 'magnet') {
    b.geo(torusGeo(0.27, 0.1, 8, 14, Math.PI), 0xe53935, [0, 0.02, 0]).paint((x, y, z, c) => {
      c.multiplyScalar(0.85 + 0.25 * sstep(0.0, 0.35, y) * (z > 0 ? 1 : 0.7));
    });
    for (const x of [-0.27, 0.27]) {
      b.cyl(0xe53935, 0.1, 0.1, 0.12, [x, -0.04, 0], [0, 0, 0], 10);
      // silver pole tip with a chamfered end and a dark gap line
      b.lathe(0xe8eef4, [[0, -0.27], [0.08, -0.27], [0.1, -0.25], [0.1, -0.11], [0.104, -0.1]], 10, [x, 0, 0]);
      b.geo(bandGeo(0.103, 0.012, 10), 0x8a929c, [x, -0.104, 0]);
    }
    // gloss streak along the arc and a little spark over each pole
    b.geo(torusGeo(0.295, 0.022, 4, 10, Math.PI * 0.42), 0xffffff, [0, 0.02, 0.085], [0, 0, Math.PI * 0.3]);
    b.box(0xffffff, 0.024, 0.09, 0.024, [-0.31, -0.06, 0.09]);
    for (const s of [-1, 1]) {
      b.box(0xffe14a, 0.05, 0.13, 0.02, [s * 0.45, -0.24, 0], [0, 0, s * 0.5]);
      b.box(0xffe14a, 0.05, 0.1, 0.02, [s * 0.5, -0.12, 0], [0, 0, s * 1.2]);
    }
  } else if (kind === 'shield') {
    b.geo(extrude(shieldShape(1), 0.06, 0.035, 6), 0xffc933, [0, 0, 0]).paint((x, y, z, c) => c.multiplyScalar(0.88 + 0.22 * sstep(-0.3, 0.35, y)));
    for (const f of [1, -1]) {
      b.geo(extrude(shieldShape(0.78), 0.03, 0.012, 5), 0x2f6fd6, [0, -0.005, f * 0.05]).paint((x, y, z, c) => {
        c.multiplyScalar(0.85 + 0.3 * sstep(-0.3, 0.3, y));
        // a lighter half (heraldic split) reads as a highlight
        if (x < 0) c.lerp(new THREE.Color(0x5fa0ff), 0.35);
      });
      b.geo(extrude(starShape(0.15, 0.065), 0.03, 0.01, 1), 0xfff4dc, [0, 0.0, f * 0.075]);
    }
    b.box(0xffffff, 0.035, 0.18, 0.02, [-0.15, 0.12, 0.085], [0, 0, -0.25]);
  } else {
    // surfboard (long axis y, nose at +y, deck +z)
    b.sphere(0xff7a1a, 1, [0, 0, 0], [0.1, 0.3, 0.042], 14)
      .warp((p) => {
        const u = p.y / 0.3;
        p.x *= u > 0 ? 1 - u * u * 0.6 : 1 - u * u * 0.2;
        p.z += u * u * 0.03;
      })
      .paint((x, y, z, c) => {
        const u = y / 0.3;
        const w = 0.1 * (u > 0 ? 1 - u * u * 0.6 : 1 - u * u * 0.2);
        if (Math.abs(x) / Math.max(0.005, w) > 0.7) c.set(0x2fb7c8);
        if (z > 0 && Math.abs(x) < 0.01) c.set(0xfff4dc);
        if (Math.abs(u - 0.25) < 0.06 || Math.abs(u - 0.4) < 0.03) c.set(0xfff4dc);
        if (z < 0) c.multiplyScalar(0.85);
      });
    b.cone(0x2f6fd6, 0.06, 0.08, [0, -0.22, -0.065], [-Math.PI / 2, 0, 0], 3, [0.25, 1, 1]);
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
/**
 * Golden sand dollar v2 (Update 8): one lathed coin with a bevelled, raised rim and a domed face, a
 * five-petal star and a centre pearl on each face. ~600 triangles (was ~1800).
 */
export function sandDollar(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // profile around the coin's axis (z after rotation): back centre -> rim -> front centre
  const prof: [number, number][] = [[0, -0.06], [0.3, -0.05], [0.38, -0.068], [0.43, -0.062], [0.465, -0.03], [0.47, 0.0], [0.465, 0.03], [0.43, 0.062], [0.38, 0.068], [0.3, 0.05], [0, 0.06]];
  b.lathe(0xffcf3a, prof, 22, [0, 0, 0], [Math.PI / 2, 0, 0]).paint((x, y, z, c) => {
    const r = Math.hypot(x, y);
    // dark groove inside the rim, bright rim crest, a gentle dome highlight toward the top
    if (r > 0.33 && r < 0.37) c.set(0xd8901a);
    else if (r >= 0.37 && r < 0.45) c.set(0xffe27a);
    else if (r >= 0.45) c.set(0xe8a020);
    c.multiplyScalar(0.92 + 0.14 * sstep(-0.4, 0.4, y));
  });
  for (const f of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      // a flat oval petal along its spoke
      const pg = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 8);
      pg.scale(0.48, 1, 1.25);
      pg.rotateX(Math.PI / 2);
      pg.rotateZ(a - Math.PI / 2);
      pg.deleteAttribute('uv');
      b.geo(pg, 0xfff3c0, [Math.cos(a) * 0.19, Math.sin(a) * 0.19, f * 0.058]);
    }
    b.sphere(0xfff8dc, 0.055, [0, 0, f * 0.06], [1, 1, 0.45], 8);
  }
  return b.build();
}

/** Hourglass v2 (chase levels): bevelled gold caps, turned wooden posts, a glass with a gloss streak and sand. */
export function hourglass(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (const s of [1, -1]) {
    const y0 = s * 0.42;
    b.lathe(0xe9b53a, s > 0 ? [[0.3, -0.045], [0.33, -0.025], [0.33, 0.02], [0.3, 0.045], [0, 0.05]] : [[0, -0.05], [0.3, -0.045], [0.33, -0.02], [0.33, 0.025], [0.3, 0.045]], 12, [0, y0, 0]).paint((x, y, z, c) => {
      if (Math.abs(Math.hypot(x, z) - 0.33) < 0.012) c.set(0xffe27a);
    });
    b.ico(0xe9b53a, 0.06, [0, y0 + s * 0.06, 0], [1, 0.6, 1], 1);
  }
  b.lathe(0xbfeaff, [[0.02, -0.39], [0.25, -0.33], [0.26, -0.2], [0.18, -0.08], [0.045, 0], [0.18, 0.08], [0.26, 0.2], [0.25, 0.33], [0.02, 0.39]], 12).paint((x, y, z, c) => {
    // gloss streak on the camera side
    const a = Math.atan2(z, x);
    if (Math.abs(a - 1.9) < 0.25 && Math.abs(y) > 0.1) c.set(0xffffff);
  });
  b.cone(0xffb347, 0.2, 0.2, [0, -0.29, 0], [Math.PI, 0, 0], 12);
  b.cone(0xffb347, 0.13, 0.12, [0, 0.19, 0], [0, 0, 0], 10);
  b.cyl(0xffb347, 0.012, 0.012, 0.2, [0, -0.1, 0], [0, 0, 0], 4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    b.lathe(0x9a6a3a, [[0.022, -0.38], [0.03, -0.3], [0.02, -0.15], [0.03, 0.0], [0.02, 0.15], [0.03, 0.3], [0.022, 0.38]], 5, [Math.cos(a) * 0.29, 0, Math.sin(a) * 0.29]);
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
  const g = breaker(TALL_WAVE, false, false, false);
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

/** Where each scuttler claw pivots (x is mirrored for the left claw). */
export const SCUTTLE_SHOULDER: V3 = [0.36, 0.3, 0.2];

/**
 * Scuttler v2 (Update 8): a grumpy blue-grey rock crab sized to its hitbox (w 1.4, d 0.9, h 0.65).
 * A domed, knobbly carapace with a pale bevelled rim and front teeth, stubby eyes with highlights and
 * cross brows, and three bent legs a side. Body only; the claws are separate (they rise as a warning).
 */
export function scuttlerBody(lo = false, rich = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const seg = lo ? 10 : 14;
  const shell = 0x4f6a86;
  const dark = 0x2f4258;
  const rim = 0x9fb6cc;
  b.sphere(shell, 1, [0, 0.33, -0.02], [0.56, 0.27, 0.42], seg).warp((p) => {
    // flat belly and a slightly squared front edge
    if (p.y < 0.24) p.y = 0.24 - (0.24 - p.y) * 0.45;
    if (p.z > 0.2) p.y -= (p.z - 0.2) * 0.12;
  }).paint((x, y, z, c) => {
    const r = Math.hypot(x / 0.56, (z + 0.02) / 0.42);
    c.multiplyScalar(0.86 + 0.18 * sstep(0.3, 0.58, y));
    // mottled shell, a pale rim band where the dome turns under, and a darker belly
    c.multiplyScalar(0.92 + 0.12 * Math.max(0, Math.sin(x * 11) * Math.sin(z * 9 + 1)));
    if (r > 0.86 && y > 0.25) c.lerp(new THREE.Color(rim), 0.7);
    if (y < 0.26) c.lerp(new THREE.Color(dark), 0.6);
  });
  // knobbly back and a couple of barnacles
  const knobs: V3[] = lo ? [[0, 0.58, -0.08], [-0.2, 0.53, 0.02], [0.2, 0.53, 0.02]] : [[0, 0.59, -0.08], [-0.2, 0.55, 0.04], [0.2, 0.55, 0.04], [-0.12, 0.55, -0.25], [0.14, 0.54, -0.24], [0, 0.57, 0.12]];
  for (const k of knobs) b.ico(0x6f8aa6, 0.065, k, [1, 0.6, 1], 0);
  if (!lo) b.cone(0xf2ece0, 0.05, 0.06, [0.3, 0.5, -0.18], [0.4, 0, -0.6], 5);
  // pale teeth along the front rim
  const nT = lo ? 4 : 6;
  for (let i = 0; i < nT; i++) {
    const a = -0.9 + (i / (nT - 1)) * 1.8;
    b.cone(rim, 0.045, 0.1, [Math.sin(a) * 0.55, 0.33, Math.cos(a) * 0.4], [Math.PI / 2, 0, 0], 4);
  }
  // eyes on stubby stalks, with pupils, highlights and angry brows
  for (const s of [-1, 1]) {
    b.cyl(dark, 0.035, 0.045, 0.14, [s * 0.14, 0.58, 0.28], [0.2, 0, 0], 5);
    b.sphere(0xffffff, 0.075, [s * 0.14, 0.68, 0.3], [1, 1, 1], lo ? 6 : 7);
    b.ico(0x14141c, 0.04, [s * 0.13, 0.68, 0.365], [1, 1, 0.6], 0);
    if (!lo) b.ico(0xffffff, 0.013, [s * 0.12, 0.695, 0.392], [1, 1, 1], 0);
    b.box(0x1c2836, 0.13, 0.035, 0.04, [s * 0.13, 0.765, 0.32], [0, 0, s * 0.45]);
  }
  // a frowning mouth plate
  b.box(0x22303f, 0.16, 0.035, 0.03, [0, 0.36, 0.43], [0, 0, 0]);
  if (!lo) b.box(rim, 0.04, 0.025, 0.03, [0.05, 0.355, 0.445]);
  // legs: three a side, bent knee up, tips pointed
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = 0.12 - i * 0.18;
    const knee: V3 = [s * 0.62, 0.4, z * 1.15];
    b.seg(shell, [s * 0.44, 0.3, z], knee, 0.05, 0.042, lo ? 3 : 4);
    b.seg(dark, knee, [s * 0.7, 0.0, z * 1.25], 0.042, 0.012, lo ? 3 : 4);
    if (rich) b.ico(rim, 0.045, knee, [1, 1, 1], 0);
  }
  if (rich) {
    // seaweed snagged on the shell and a tiny starfish hitch-hiker
    b.tube(0x3a9a50, [[-0.32, 0.5, -0.1], [-0.45, 0.42, 0.05], [-0.55, 0.3, 0.12]], (t) => 0.035 - t * 0.015, 3, 4, false);
    starfish(b, 0xff8a4a, 0.07, [0.24, 0.52, -0.12], [-1.0, 0, 0.3]);
  }
  return b.build();
}

/**
 * One scuttler claw, pivot at the shoulder (x mirrored by scale). The arm reaches forward and out so
 * the pincer sits in front of the body; the rig pitches it up (rotation.x < 0) as a warning.
 */
export function scuttlerClaw(lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const shell = 0x5f7c9a;
  b.seg(0x4f6a86, [0, 0, 0], [0.1, 0.03, 0.1], 0.06, 0.055, 5);
  b.ico(0x6f8aa6, 0.06, [0.1, 0.03, 0.1], [1, 1, 1], 0);
  // the pincer: a fat palm with a pale underside, a fixed finger and a moving thumb
  b.sphere(shell, 0.15, [0.15, 0.06, 0.23], [0.8, 0.7, 1.0], lo ? 7 : 9).paint((x, y, z, c) => {
    if (y < 0.03) c.lerp(new THREE.Color(0xdfe6ee), 0.6);
    c.multiplyScalar(0.9 + 0.2 * sstep(0.0, 0.16, y));
  });
  b.cone(0xe0e6ee, 0.05, 0.16, [0.16, 0.1, 0.37], [Math.PI / 2 - 0.25, 0, 0], 5);
  b.cone(0xe0e6ee, 0.04, 0.12, [0.17, 0.0, 0.35], [Math.PI / 2 + 0.3, 0, 0], 5);
  if (!lo) b.ico(0xffffff, 0.028, [0.1, 0.125, 0.24], [1, 0.6, 1.4], 0);
  return b.build();
}

/** A sand arrow showing which way the scuttler will go (points +x). */
export function scuttleArrow(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0xffd23a, 0.9, 0.02, 0.22, [-0.15, 0.03, 0]);
  b.cone(0xffd23a, 0.3, 0.42, [0.48, 0.03, 0], [0, 0, -Math.PI / 2], 3, [1, 1, 0.12]);
  return b.build();
}

/**
 * The model drawn for a sim obstacle at rest (Update 8), by kind, zone skin (0 shore, 1 boardwalk,
 * 2 tide pools; 3 sunset reuses 0) and variant (entity id % 2). entities.ts builds its views from
 * this, and hitbox tests can measure the same meshes. Sweep: the wave body without its flat hop
 * chevrons (sand decals ahead of the wave). Roller: the ball resting on the sand. Scuttle: the body
 * with both claws in their resting pose.
 */
export function obstacleModel(kind: 'block' | 'low' | 'sweep' | 'roller' | 'scuttle', skin: number, variant = 0, lo = false, rich = false): THREE.BufferGeometry {
  const z = skin === 3 ? 0 : skin;
  switch (kind) {
    case 'block':
      return z === 1 ? crateBlock(variant, lo, rich) : z === 2 ? rockBlock(variant, lo, rich) : sandcastle(variant, lo, rich);
    case 'low':
      return z === 1 || z === 2 ? lowBarrier(z, variant, lo, rich) : driftwoodLog(variant, lo, rich);
    case 'sweep':
      return waveSweep(lo, false);
    case 'roller': {
      const g = beachBall(lo);
      g.translate(0, BALL_R, 0);
      return g;
    }
    case 'scuttle': {
      const b = new GeoBuilder();
      b.raw(scuttlerBody(lo, rich));
      for (const s of [-1, 1]) {
        const c = scuttlerClaw(lo);
        c.scale(s, 1, 1);
        if (s < 0) flipWinding(c);
        c.translate(s * SCUTTLE_SHOULDER[0], SCUTTLE_SHOULDER[1], SCUTTLE_SHOULDER[2]);
        b.raw(c);
      }
      return b.build();
    }
  }
}

/** Beach ball radius (the roller rests on the sand at this height). */
export const BALL_R = 0.56;

function flipWinding(g: THREE.BufferGeometry): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (const a of [g.attributes.position, g.attributes.normal, g.attributes.color] as THREE.BufferAttribute[]) {
    for (let i = 0; i < p.count; i += 3) {
      const x = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)];
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x[0] as number, x[1] as number, x[2] as number);
    }
  }
}
