import * as THREE from 'three';
import { PALETTE } from '../config';
import { GeoBuilder, addWind } from './geo';

/** Deterministic tiny RNG for prop variation. */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V3 = [number, number, number];

const hash = (x: number, y: number, z: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const sstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A palm frond: a drooping double-sided strip. */
function frond(base: V3, yaw: number, len: number, droop: number, width: number, colA: number, colB: number, n = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const ca = new THREE.Color(colA);
  const cb = new THREE.Color(colB);
  const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3(base[0], base[1], base[2])
      .addScaledVector(dir, t * len)
      .add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.6) * len * 0.22 - t * t * droop, 0));
    spine.push(p);
  }
  const w = (t: number): number => width * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.35);
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a = spine[i] as THREE.Vector3;
    const b = spine[i + 1] as THREE.Vector3;
    // leaflets droop at the edges
    const l0 = a.clone().addScaledVector(side, w(t0)).add(new THREE.Vector3(0, -w(t0) * 0.45, 0));
    const r0 = a.clone().addScaledVector(side, -w(t0)).add(new THREE.Vector3(0, -w(t0) * 0.45, 0));
    const l1 = b.clone().addScaledVector(side, w(t1)).add(new THREE.Vector3(0, -w(t1) * 0.45, 0));
    const r1 = b.clone().addScaledVector(side, -w(t1)).add(new THREE.Vector3(0, -w(t1) * 0.45, 0));
    const quads: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Color][] = [
      [a, b, l1, l0, ca],
      [b, a, r0, r1, cb],
    ];
    for (const [p0, p1, p2, p3, c] of quads) {
      for (const [x, y, z] of [p0, p1, p2, p0, p2, p3].map((v) => [v.x, v.y, v.z])) {
        pos.push(x as number, y as number, z as number);
        col.push(c.r, c.g, c.b);
      }
      // back face
      for (const [x, y, z] of [p0, p2, p1, p0, p3, p2].map((v) => [v.x, v.y, v.z])) {
        pos.push(x as number, y as number, z as number);
        col.push(c.r * 0.8, c.g * 0.8, c.b * 0.8);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Free-form triangle soup with vertex colours: thin double-sided parts (leaflets, blades, awning
 * stripes, flaps) cost two triangles a face instead of a box's twelve.
 */
class Poly {
  private pos: number[] = [];
  private col: number[] = [];
  private static c = new THREE.Color();
  tri(a: V3, b: V3, c: V3, color: number | THREE.Color, back = 0.78): this {
    const k = Poly.c.set(color as THREE.ColorRepresentation);
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(k.r, k.g, k.b);
    if (back > 0) {
      this.pos.push(...a, ...c, ...b);
      for (let i = 0; i < 3; i++) this.col.push(k.r * back, k.g * back, k.b * back);
    }
    return this;
  }
  quad(a: V3, b: V3, c: V3, d: V3, color: number | THREE.Color, back = 0.78): this {
    return this.tri(a, b, c, color, back).tri(a, c, d, color, back);
  }
  get empty(): boolean {
    return this.pos.length === 0;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: number, k: number): number => new THREE.Color(c).multiplyScalar(k).getHex();

/**
 * Ringed palm trunk (Update 8): each segment flares into a lip and steps in to the next, so the
 * trunk reads as stacked leaf scars; dark at each step, light at each lip. Rings sit square to the
 * curve. Indexed per band, so shading is smooth inside a band and crisp at each ring.
 */
function ringedTrunk(curve: (t: number) => V3, segs: number, radial: number, rBase: number, rTop: number, col: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const base = new THREE.Color(col);
  const tmp = new THREE.Color();
  const T = new THREE.Vector3();
  const U = new THREE.Vector3();
  const W = new THREE.Vector3();
  const ring = (t: number, rad: number, k: number): number => {
    const a = curve(Math.max(0, t - 0.01));
    const b = curve(Math.min(1, t + 0.01));
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    U.set(1, 0, 0).addScaledVector(T, -T.x).normalize();
    W.crossVectors(T, U);
    const p = curve(t);
    const start = pos.length / 3;
    tmp.copy(base).multiplyScalar(k);
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      // a slightly fibrous, uneven rim
      const rr = rad * (1 + Math.sin(ang * 3 + t * 40) * 0.04);
      pos.push(p[0] + (U.x * Math.cos(ang) + W.x * Math.sin(ang)) * rr, p[1] + (U.y * Math.cos(ang) + W.y * Math.sin(ang)) * rr, p[2] + (U.z * Math.cos(ang) + W.z * Math.sin(ang)) * rr);
      colr.push(tmp.r, tmp.g, tmp.b);
    }
    return start;
  };
  const band = (a: number, b: number): void => {
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      idx.push(a + j, a + j1, b + j, a + j1, b + j1, b + j);
    }
  };
  const radius = (t: number): number => rBase + (rTop - rBase) * t + Math.max(0, 0.25 - t) * 0.35; // a flared foot
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    // body of the segment: tucked at the bottom, flaring to a lip at the top
    const a = ring(t0, radius(t0) * 0.86, 0.74);
    const m = ring(t0 + (t1 - t0) * 0.55, radius(t0) * 0.95, 0.98);
    const l = ring(t1 - 0.004, radius(t1) * 1.06, 1.16);
    band(a, m);
    band(m, l);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A split palm frond (Update 8): a curved rachis with separate leaflets fanning off both sides,
 * gaps between them, tips drooping more toward the end of the frond.
 */
function splitFrond(p: Poly, base: V3, yaw: number, pitch: number, len: number, droop: number, width: number, colA: number, colB: number, n = 8): void {
  const dir: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const side: V3 = [-dir[2], 0, dir[0]];
  const spine = (t: number): V3 => {
    const rise = Math.sin(t * Math.PI * 0.55) * len * pitch - t * t * droop;
    return [base[0] + dir[0] * t * len, base[1] + rise, base[2] + dir[2] * t * len];
  };
  const ca = new THREE.Color(colA);
  const cb = new THREE.Color(colB);
  const c = new THREE.Color();
  // rachis: a thin vertical ribbon so the stem reads from the side
  const rs = Math.max(2, n >> 1);
  for (let i = 0; i < rs; i++) {
    const a = spine(i / rs);
    const b = spine((i + 1) / rs);
    const th = 0.05 * (1 - i / rs);
    p.quad(a, b, [b[0], b[1] - th * 0.6, b[2]], [a[0], a[1] - th, a[2]], shade(colB, 0.9), 0.8);
  }
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const w = width * Math.sin(Math.min(1, t * 1.1) * Math.PI) * (1.05 - t * 0.3);
    if (w < 0.04) continue;
    const r0 = spine(t - 0.92 / n);
    const r1 = spine(t);
    const tipT = Math.min(1, t + 0.4 / n);
    const sp = spine(tipT);
    for (const s of [-1, 1]) {
      // leaflets sweep forward and hang down at the edges, more at the tip
      const hang = w * (0.35 + t * 0.6);
      const tip: V3 = [sp[0] + side[0] * s * w, sp[1] - hang, sp[2] + side[2] * s * w];
      c.copy(s > 0 ? ca : cb).lerp(new THREE.Color(0xd8e070), Math.max(0, t - 0.7) * 0.35);
      p.tri(r0, r1, tip, c, 0.72);
    }
  }
}

/** `lo`: background palms (fewer trunk rings, coarse unsplit fronds, no coconuts). */
export function palm(seed: number, h = 6, lean = 1.2, trunkCol: number = PALETTE.palmTrunk, leafA: number = PALETTE.palmLeaf, leafB: number = PALETTE.palmLeafDark, lo = false): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  // a gentle S: the trunk leans out, then turns back up toward the light
  const bend = (r() - 0.5) * 0.6;
  const curve = (t: number): V3 => [lean * t * t - Math.sin(t * Math.PI) * bend * 0.4, h * t, lean * 0.3 * t * t + Math.sin(t * Math.PI) * bend * 0.3];
  if (lo) {
    const segs = 4;
    let prev: V3 = [0, 0, 0];
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const q = curve(t);
      b.seg(shade(trunkCol, i % 2 === 0 ? 1.12 : 0.92), prev, q, 0.24 - t * 0.08, 0.26 - (t - 1 / segs) * 0.08, 5);
      prev = q;
    }
  } else {
    b.raw(ringedTrunk(curve, 9, 6, 0.25, 0.16, trunkCol));
  }
  const top = curve(1);
  const n = (lo ? 7 : 8) + Math.floor(r() * 2);
  if (lo) {
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + r() * 0.4;
      b.raw(frond([top[0], top[1] + 0.05, top[2]], yaw, 2.2 + r() * 0.8, 1.4 + r() * 0.6, 0.42, i % 2 ? leafA : leafB, i % 2 ? leafB : leafA, 3));
    }
  } else {
    // crown: a fibrous boot where the fronds spring from
    b.ico(0x8a5a2b, 0.24, [top[0], top[1] - 0.02, top[2]], [1, 0.8, 1], 0, 0.15, seed);
    const p = new Poly();
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + r() * 0.4;
      const up = i % 3 === 0 ? 0.4 : 0.22;
      splitFrond(p, [top[0], top[1] + 0.08, top[2]], yaw, up, 2.6 + r() * 0.8, 1.3 + r() * 0.7, 0.62, i % 2 ? leafA : leafB, i % 2 ? leafB : leafA, 8);
    }
    // one or two dead fronds hang down against the trunk
    for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
      const yaw = r() * Math.PI * 2;
      splitFrond(p, [top[0], top[1] - 0.05, top[2]], yaw, -0.25, 1.5, 1.6, 0.32, 0xb08a4a, 0x8a6a3a, 5);
    }
    b.raw(p.build());
    // a cluster of coconuts under the crown, one green
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const rr = 0.2 + (i % 2) * 0.06;
      b.ico(i === 3 ? 0x7a8a2a : 0x5a3a1c, 0.15, [top[0] + Math.cos(a) * rr, top[1] - 0.2 - (i % 2) * 0.1, top[2] + Math.sin(a) * rr], [1, 1.12, 1], 0, 0.08, seed + i);
    }
  }
  // sway grows up the trunk; fronds hang off the top so they swing furthest
  return addWind(b.build(), (x, y) => Math.pow(Math.max(0, y) / h, 2) * 0.2);
}

function canopy(colA: number, colB: number, r: number, h: number, panels = 8): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const a = new THREE.Color(colA);
  const bcol = new THREE.Color(colB);
  for (let i = 0; i < panels; i++) {
    const t0 = (i / panels) * Math.PI * 2;
    const t1 = ((i + 1) / panels) * Math.PI * 2;
    const c = i % 2 === 0 ? a : bcol;
    const p0 = [0, h, 0];
    const p1 = [Math.cos(t0) * r, 0, Math.sin(t0) * r];
    const p2 = [Math.cos(t1) * r, 0, Math.sin(t1) * r];
    // scalloped edge midpoint dips a little
    const mid = (t0 + t1) / 2;
    const p3 = [Math.cos(mid) * r * 0.97, -0.08, Math.sin(mid) * r * 0.97];
    for (const v of [p0, p2, p3, p0, p3, p1]) {
      pos.push(...(v as [number, number, number]));
      col.push(c.r, c.g, c.b);
    }
    for (const v of [p0, p3, p2, p0, p1, p3]) {
      pos.push(...(v as [number, number, number]));
      col.push(c.r * 0.75, c.g * 0.75, c.b * 0.75);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function umbrella(colA: number, colB: number, tilt = 0.15, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const top: V3 = [Math.sin(tilt) * 2.4, Math.cos(tilt) * 2.4, 0];
  b.seg(0xf2efe6, [0, 0, 0], top, 0.04, 0.04, 6);
  const c = canopy(colA, colB, 1.5, 0.55);
  c.rotateZ(-tilt);
  c.translate(top[0], top[1] - 0.25, top[2]);
  b.raw(c);
  b.sphere(colA, 0.08, [top[0] + Math.sin(tilt) * 0.35, top[1] + 0.32, 0], [1, 1, 1], 6);
  // Update 8: a scalloped valance hanging off the rim and a collar on the pole
  if (lo) return addWind(b.build(), (x, y, z) => (y > 1.9 && Math.hypot(x - top[0], z) > 0.9 ? -0.025 : 0));
  const p = new Poly();
  const rim = new THREE.Vector3();
  const pt = (a: number, rr: number, dy: number): V3 => {
    rim.set(Math.cos(a) * rr, dy, Math.sin(a) * rr).applyAxisAngle(new THREE.Vector3(0, 0, 1), -tilt);
    return [rim.x + top[0], rim.y + top[1] - 0.25, rim.z + top[2]];
  };
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    p.quad(pt(a0, 1.5, 0), pt(a1, 1.5, 0), pt(a1, 1.47, -0.14), pt(a0, 1.47, -0.14), i % 2 ? colB : colA, 0.7);
    p.tri(pt(a0, 1.47, -0.14), pt(a1, 1.47, -0.14), pt(am, 1.46, -0.24), i % 2 ? colB : colA, 0.7);
  }
  b.raw(p.build());
  b.cyl(0xd8d0c0, 0.07, 0.07, 0.1, [top[0] * 0.55, top[1] * 0.55, 0], [0, 0, -tilt], 6);
  b.cone(0xe9c37e, 0.22, 0.12, [0, 0.03, 0], [0, 0, 0], 6);
  // the canopy rim ripples in the breeze
  return addWind(b.build(), (x, y, z) => (y > 1.9 && Math.hypot(x - top[0], z) > 0.9 ? -0.025 : 0));
}

export function towel(colA: number, colB: number): THREE.BufferGeometry {
  // Update 8: stripes that follow a soft drape over the sand, a fringe and a rolled pillow
  const b = new GeoBuilder();
  const p = new Poly();
  const y = (x: number, z: number): number => 0.02 + Math.sin(x * 2.4 + z * 1.3) * 0.015 + Math.max(0, z - 0.6) * 0.05;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const z0 = -0.9 + (i / n) * 1.8;
    const z1 = -0.9 + ((i + 1) / n) * 1.8;
    p.quad([-0.5, y(-0.5, z0), z0], [-0.5, y(-0.5, z1), z1], [0.5, y(0.5, z1), z1], [0.5, y(0.5, z0), z0], i % 2 ? colA : colB, 0);
  }
  for (let i = 0; i < 6; i++) {
    const x = -0.42 + i * 0.17;
    p.quad([x, 0.02, -0.9], [x + 0.05, 0.02, -0.9], [x + 0.05, 0.015, -1.0], [x, 0.015, -1.0], 0xfff4dc, 0);
  }
  b.raw(p.build());
  b.cyl(colB, 0.1, 0.1, 0.8, [0, 0.11, 0.72], [0, 0, Math.PI / 2], 6);
  return b.build();
}

/** Strata bands, a wet dark foot and (optionally) moss on the top: paint only, no extra triangles. */
function rockPaint(top: number, moss: boolean, seed: number): (x: number, y: number, z: number, c: THREE.Color) => void {
  const mossC = new THREE.Color(0x5a9a46);
  const wet = new THREE.Color(0x5a4e46);
  return (x, y, z, c) => {
    const band = Math.sin(y * 9 / Math.max(0.3, top) + Math.sin(x * 2.1 + z * 1.7 + seed) * 0.8);
    c.multiplyScalar(0.9 + band * 0.09 + hash(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9)) * 0.06);
    if (y < top * 0.18) c.lerp(wet, 0.35);
    if (moss && y > top * 0.72) c.lerp(mossC, sstep(top * 0.72, top * 0.95, y) * (0.55 + 0.35 * Math.sin(x * 5 + z * 4 + seed)));
  };
}

export function rock(seed: number, size = 1, col = 0x9a948a, moss = false): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  b.ico(col, 0.6 * size, [0, 0.25 * size, 0], [1.2, 0.7, 1.0], 1, 0.22, seed).paint(rockPaint(0.67 * size, moss, seed));
  if (r() > 0.4) b.ico(new THREE.Color(col).multiplyScalar(1.12).getHex(), 0.35 * size, [0.5 * size, 0.15 * size, 0.3 * size], [1, 0.7, 1], 0, 0.2, seed + 3).paint(rockPaint(0.67 * size, moss, seed));
  return b.build();
}

export function starfish(col = 0xff7a3a): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? 0.32 : 0.13;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  const b = new GeoBuilder();
  b.geo(g, col, [0, 0.03, 0]);
  return b.build();
}

export function bush(seed: number, col: number = PALETTE.palmLeaf): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Color(col).multiplyScalar(0.85 + r() * 0.3).getHex();
    b.sphere(c, 0.5 + r() * 0.4, [(r() - 0.5) * 1.6, 0.35 + r() * 0.3, (r() - 0.5) * 1.2], [1, 0.75, 1], 8);
  }
  return b.build();
}

export function hut(): THREE.BufferGeometry {
  // Hut v2: bamboo walls, a layered thatch roof with a fringe, door, shuttered window and a step
  const b = new GeoBuilder();
  b.box(0xc9955a, 2.2, 0.18, 2.0, [0, 0.09, 0]);
  // bamboo walls: panels painted with pole stripes and knuckle bands (cheap), round corner posts
  const bamboo = (x: number, y: number, z: number, c: THREE.Color): void => {
    const u = Math.abs(x) > 1.0 ? z : x;
    const pole = Math.abs(Math.sin(u * Math.PI * 4));
    c.multiplyScalar(0.78 + pole * 0.26);
    if (Math.abs(Math.sin((y + (Math.floor(u * 4) % 3) * 0.2) * 5.2)) > 0.96) c.multiplyScalar(0.72);
  };
  b.box(0xc9955a, 0.18, 1.5, 1.9, [-1.02, 0.9, 0]).paint(bamboo);
  b.box(0xc9955a, 0.18, 1.5, 1.9, [1.02, 0.9, 0]).paint(bamboo);
  b.box(0xc9955a, 2.0, 1.5, 0.18, [0, 0.9, -0.94]).paint(bamboo);
  b.box(0xc9955a, 1.0, 1.5, 0.18, [-0.5, 0.9, 0.94]).paint(bamboo);
  b.box(0xc9955a, 0.4, 1.5, 0.18, [0.82, 0.9, 0.94]).paint(bamboo);
  for (const x of [-1.05, 1.05]) for (const z of [-0.97, 0.97]) b.cyl(0x9a6a34, 0.1, 0.1, 1.6, [x, 0.85, z], [0, 0, 0], 5);
  b.box(0x5a3418, 0.56, 1.1, 0.06, [0.34, 0.73, 0.98]);
  b.box(0x3a200c, 0.62, 0.08, 0.1, [0.34, 1.32, 0.98]);
  // window with shutters on the side
  b.box(0x2a1a10, 0.06, 0.45, 0.55, [1.11, 1.05, -0.2]);
  for (const s of [-1, 1]) b.box(0x3dae8a, 0.04, 0.48, 0.28, [1.15, 1.05, -0.2 + s * 0.42], [0, s * 0.5, 0]);
  // thatch: three stacked layers, each with a ragged fringe
  for (let k = 0; k < 3; k++) {
    const r = 1.95 - k * 0.5;
    const y = 1.62 + k * 0.42;
    b.cone(k % 2 ? 0xd9b15e : 0xe2bd6a, r, 0.9 - k * 0.12, [0, y + 0.42, 0], [0, Math.PI / 4, 0], 4).paint((x, yy, z, c) => c.multiplyScalar(0.88 + 0.12 * Math.sin(Math.atan2(z, x) * 40 + yy * 6)));
    if (k === 0) {
      // a ragged fringe on the bottom layer
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        b.cone(0xc49c48, 0.1, 0.34, [Math.cos(a) * r * 0.74, y + 0.02, Math.sin(a) * r * 0.74], [Math.PI, 0, 0], 3);
      }
    }
  }
  b.sphere(0xb08040, 0.12, [0, 3.1, 0], [1, 1.3, 1], 6);
  // step and a potted plant
  b.box(0xa8743f, 0.8, 0.12, 0.35, [0.34, 0.06, 1.25]);
  b.cyl(0xc8604a, 0.16, 0.12, 0.26, [-0.6, 0.13, 1.25], [0, 0, 0], 8);
  b.sphere(0x3dae4f, 0.22, [-0.6, 0.38, 1.25], [1, 0.8, 1], 6);
  return b.build();
}
export function miniCastle(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0xe2b974, 0.5, 0.6, 0.6, [0, 0.3, 0], [0, 0, 0], 10);
  b.cyl(0xedcd8f, 0.3, 0.35, 0.6, [0, 0.85, 0], [0, 0, 0], 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(0xedcd8f, 0.14, 0.14, 0.12, [Math.cos(a) * 0.5, 0.66, Math.sin(a) * 0.5], [0, -a, 0]);
  }
  b.cyl(0x7a5530, 0.015, 0.015, 0.5, [0, 1.35, 0], [0, 0, 0], 4);
  b.box(0xe53935, 0.24, 0.14, 0.02, [0.13, 1.5, 0]);
  return addWind(b.build(), (x, y) => (y > 1.42 && x > 0.02 ? -0.02 * x * 6 : 0));
}

export function pinkShell(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xf7a6b8, 0.16, [0, 0.06, 0], [1, 0.45, 1.2], 8);
  b.sphere(0xfde0e6, 0.08, [0, 0.12, -0.05], [1, 0.4, 1], 6);
  return b.build();
}

export function tinyCrab(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xe5452b, 0.2, [0, 0.14, 0], [1.3, 0.7, 1], 8);
  b.sphere(0xb3261e, 0.08, [-0.28, 0.18, 0.08], [1, 0.8, 1], 6);
  b.sphere(0xb3261e, 0.08, [0.28, 0.18, 0.08], [1, 0.8, 1], 6);
  b.sphere(0xffffff, 0.045, [-0.07, 0.3, 0.12], [1, 1, 1], 5);
  b.sphere(0xffffff, 0.045, [0.07, 0.3, 0.12], [1, 1, 1], 5);
  return b.build();
}

export function seaweed(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < 4; i++) b.cone(0x3f8f4a, 0.06, 0.5 + i * 0.12, [(i - 1.5) * 0.12, 0.25, (i % 2) * 0.08], [0.1 * (i - 1.5), 0, 0.15 * (i - 1.5)], 4);
  return addWind(b.build(), (x, y) => Math.max(0, y) * 0.12);
}

// --------------------------------------------------------------- zone 1: boardwalk
export function lampPost(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x2c3e66, 0.07, 0.1, 3.6, [0, 1.8, 0], [0, 0, 0], 8);
  b.cyl(0x2c3e66, 0.18, 0.22, 0.2, [0, 0.1, 0], [0, 0, 0], 8);
  b.sphere(0xfff3c4, 0.24, [0, 3.85, 0], [1, 1.1, 1], 10);
  b.cone(0x2c3e66, 0.26, 0.2, [0, 4.15, 0], [0, 0, 0], 8);
  return b.build();
}

export function ropePost(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x8a5a2b, 0.12, 0.13, 1.1, [0, 0.55, 0], [0, 0, 0], 7);
  b.sphere(0x7a4a22, 0.13, [0, 1.12, 0], [1, 0.6, 1], 7);
  return b.build();
}

export function kiosk(colA: number, colB: number): THREE.BufferGeometry {
  // Kiosk v2: a counter with panelling, a scalloped striped awning, a sign board and an ice-cream cone
  const b = new GeoBuilder();
  b.box(0xfff4dc, 2.4, 1.1, 1.8, [0, 0.55, 0]);
  for (let i = 0; i < 6; i++) b.box(i % 2 ? colA : 0xfff4dc, 0.4, 0.9, 0.04, [-1.0 + i * 0.4, 0.55, 0.91]);
  b.box(0xd9b15e, 2.6, 0.12, 2.0, [0, 1.16, 0.05]);
  // back wall and posts
  b.box(0xfff4dc, 2.4, 1.25, 0.1, [0, 1.8, -0.85]);
  for (const x of [-1.15, 1.15]) b.cyl(0xffffff, 0.05, 0.05, 1.35, [x, 1.85, 0.75], [0, 0, 0], 6);
  // awning: stripes plus a scalloped valance
  for (let i = 0; i < 8; i++) {
    const x = -1.225 + i * 0.35;
    b.box(i % 2 ? colA : colB, 0.35, 0.05, 1.3, [x, 2.42, 0.25], [0.32, 0, 0]);
    b.cyl(i % 2 ? colA : colB, 0.175, 0.175, 0.05, [x, 2.2, 0.88], [Math.PI / 2, 0, 0], 6, [1, 1, 1]);
  }
  // sign with a fish on it
  b.box(colA, 2.0, 0.42, 0.08, [0, 2.75, -0.8]);
  b.box(0xfff4dc, 1.8, 0.3, 0.02, [0, 2.75, -0.75]);
  b.sphere(0x2f6fd6, 0.12, [-0.45, 2.75, -0.73], [1.6, 0.8, 0.3], 6);
  b.cone(0x2f6fd6, 0.1, 0.16, [-0.24, 2.75, -0.73], [0, 0, -Math.PI / 2], 3, [1, 1, 0.3]);
  // a giant cone on the roof
  b.cone(0xd9a05a, 0.22, 0.6, [0.8, 3.15, -0.8], [Math.PI, 0, 0], 6);
  b.sphere(0xffb0c8, 0.24, [0.8, 3.5, -0.8], [1, 0.9, 1], 6);
  b.sphere(0xff5a8a, 0.06, [0.8, 3.75, -0.8], [1, 1, 1], 5);
  // stools in front
  for (const x of [-0.6, 0.6]) {
    b.cyl(0xb0b8c0, 0.04, 0.04, 0.6, [x, 0.3, 1.35], [0, 0, 0], 4);
    b.cyl(colA, 0.2, 0.2, 0.08, [x, 0.62, 1.35], [0, 0, 0], 7);
  }
  return b.build();
}

export function boat(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(col, 1.0, [0, 0.15, 0], [0.75, 0.38, 1.9], 12);
  b.box(0xfff4dc, 1.0, 0.1, 2.6, [0, 0.42, 0]);
  b.cyl(0x8a5a2b, 0.05, 0.05, 2.6, [0, 1.6, 0.2], [0, 0, 0], 5);
  b.cone(0xffffff, 0.8, 2.2, [0.05, 1.7, -0.2], [0, Math.PI / 2, 0], 3, [0.08, 1, 1]);
  return addWind(b.build(), (x, y) => (y > 0.7 ? -0.03 * (y - 0.7) : 0));
}

export function buoy(): THREE.BufferGeometry {
  // Update 8: a channel marker: a banded float, a lattice cage and a lamp on top
  const b = new GeoBuilder();
  b.lathe(0xe53935, [[0.05, -0.2], [0.42, -0.05], [0.46, 0.12], [0.36, 0.3], [0.12, 0.34], [0, 0.34]], 8).paint((x, y, z, c) => {
    if (y > 0.05 && y < 0.2) c.set(0xffffff);
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.segOpen(0xd8dce0, [Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3], [Math.cos(a) * 0.08, 1.15, Math.sin(a) * 0.08], 0.025, 0.025, 3);
  }
  b.cone(0xe53935, 0.16, 0.3, [0, 1.25, 0], [0, 0, 0], 6);
  b.sphere(0xfff3c4, 0.07, [0, 1.42, 0], [1, 1, 1], 5);
  return b.build();
}

// --------------------------------------------------------------- zone 2: cove
export function cliff(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const cols = [0x9b8577, 0x8a7466, 0xa89382, 0x7d6a5c];
  for (let i = 0; i < 6; i++) {
    const s = 1.6 + r() * 1.8;
    b.ico(cols[i % 4] as number, s, [(r() - 0.5) * 5, s * 0.8 + i * 0.6, (r() - 0.5) * 7], [1.1, 1.3 + r() * 0.6, 1.1], 1, 0.25, seed + i * 7).paint(rockPaint(6.5, true, seed));
  }
  b.sphere(0x3f8f4a, 1.0, [0, 6.5, 0], [2.2, 0.4, 2.2], 8);
  return b.build();
}

export function tidePool(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const rx = 0.8 + r() * 0.8;
  const rz = 0.7 + r() * 0.6;
  b.cyl(0x8a7466, rx + 0.15, rx + 0.25, 0.14, [0, 0.03, 0], [0, 0, 0], 14, [1, 1, rz / rx]);
  b.cyl(0x3fc6d8, rx, rx, 0.05, [0, 0.08, 0], [0, 0, 0], 14, [1, 1, rz / rx]);
  b.sphere(0xff7a3a, 0.12, [rx * 0.4, 0.1, 0], [1, 0.3, 1], 6);
  return b.build();
}

export function coral(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const cols = [0xff7aa2, 0xff9a4a, 0xb57aff];
  const c = cols[Math.floor(r() * 3)] as number;
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    const len = 0.4 + r() * 0.5;
    b.seg(c, [0, 0, 0], [Math.cos(a) * 0.3, len, Math.sin(a) * 0.3], 0.07, 0.1, 5);
    b.sphere(c, 0.1, [Math.cos(a) * 0.3, len, Math.sin(a) * 0.3], [1, 1, 1], 5);
  }
  return addWind(b.build(), (x, y) => Math.max(0, y) * 0.05);
}

/** A wooden crate with plank grooves, corner trims and a stencil band. */
function crate(b: GeoBuilder, col: number, w: number, h: number, d: number, pos: V3, yaw: number): void {
  const dark = new THREE.Color(col).multiplyScalar(0.72).getHex();
  const trim = new THREE.Color(col).multiplyScalar(0.85).getHex();
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (x: number, y: number, z: number): V3 => [pos[0] + x * c + z * s, pos[1] + y, pos[2] - x * s + z * c];
  b.box(col, w, h, d, at(0, 0, 0), [0, yaw, 0]);
  b.paint((x, y, z, cc) => cc.multiplyScalar(0.92 + Math.abs(Math.sin((y - pos[1]) * 22)) * 0.1));
  // plank grooves on the front/back and sides
  for (const k of [-1, 1]) {
    for (let i = 1; i < 3; i++) {
      const y = -h / 2 + (i / 3) * h;
      b.box(dark, w * 0.98, 0.025, 0.02, at(0, y, k * (d / 2 + 0.006)), [0, yaw, 0]);
      b.box(dark, 0.02, 0.025, d * 0.98, at(k * (w / 2 + 0.006), y, 0), [0, yaw, 0]);
    }
    // corner trims
    for (const k2 of [-1, 1]) b.box(trim, 0.08, h + 0.02, 0.08, at(k * (w / 2 - 0.02), 0, k2 * (d / 2 - 0.02)), [0, yaw, 0]);
  }
  // stencilled band on the front
  b.box(0x2f6fd6, w * 0.5, 0.1, 0.02, at(0, h * 0.12, d / 2 + 0.012), [0, yaw, 0]);
}

export function crateStack(variant = 0, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  crate(b, 0xb98550, 1.2, 1.0, 1.0, [-0.35, 0.5, 0], 0);
  crate(b, 0xc9955a, 1.0, 0.9, 0.9, [0.45, 0.45, 0.1], 0.2);
  crate(b, 0xa8743f, 0.9, 0.85, 0.9, [variant ? 0.3 : 0.0, 1.42, 0], -0.15);
  // coiled rope on top and a life ring leaning on the side
  if (!lo) {
    for (let i = 0; i < 3; i++) b.torus(0xe9dfc8, 0.22 - i * 0.05, 0.035, [variant ? 0.3 : 0.0, 1.88 + i * 0.05, 0], [Math.PI / 2, 0, 0], 12);
  }
  b.torus(0xe53935, 0.3, 0.08, [-0.98, 0.42, 0.25], [0.2, Math.PI / 2 - 0.2, 0], lo ? 8 : 14);
  b.paint((x, y, z, c) => {
    const a = Math.atan2(y - 0.42, z - 0.25);
    if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0) c.set(0xffffff);
  });
  return b.build();
}

/** Deck chair v2: a striped fabric sling sagging between a wooden frame. Spans ~2 m across. */
export function deckChair(variant = 0, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wood = 0x8a5a2b;
  const stripes = variant ? [0xe53935, 0xffffff] : [0x2f6fd6, 0xffffff];
  // the sling: back rest rising at -x, seat sagging, foot end at +x
  const sling = (t: number): [number, number] => {
    const x = -0.95 + t * 1.9;
    const back = Math.max(0, (0.25 - t) / 0.25);
    const y = 0.42 - Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.1 + back * back * 0.45;
    return [x, y];
  };
  const n = lo ? 6 : 12;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = sling(i / n);
    const [x1, y1] = sling((i + 1) / n);
    const len = Math.hypot(x1 - x0, y1 - y0);
    b.box(stripes[i % 2] as number, len + 0.01, 0.035, 0.56, [(x0 + x1) / 2, (y0 + y1) / 2, 0], [0, 0, Math.atan2(y1 - y0, x1 - x0)]);
  }
  // frame rails follow the sling, plus legs and a cross bar
  for (const z of [-0.3, 0.3]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 4; i++) {
      const [x, y] = sling(i / 4);
      pts.push([x, y + 0.03, z]);
    }
    b.tube(wood, pts, 0.035, lo ? 4 : 6, lo ? 4 : 8, true);
    b.tube(wood, [[-0.85, 0.85, z], [-0.55, 0.0, z]], 0.03, 4, 2, false);
    b.tube(wood, [[0.85, 0.42, z], [0.95, 0.0, z]], 0.03, 4, 2, false);
    b.tube(wood, [[-0.2, 0.38, z], [0.2, 0.0, z]], 0.028, 4, 2, false);
  }
  b.tube(wood, [[0.9, 0.42, -0.3], [0.9, 0.42, 0.3]], 0.03, 4, 2, false);
  return b.build();
}

/** Boulder v2: strata bands, barnacles, a moss cap and a starfish. */
export function boulder(seed = 11, lo = false): THREE.BufferGeometry {
  // Boulder v3 (UPDATE4_PLAN.md §4.2): a smooth, noise-sculpted rock with banded strata, a mossy cap,
  // a wet dark foot, barnacles and a small rock beside it
  const b = new GeoBuilder();
  const n3 = (x: number, y: number, z: number): number =>
    Math.sin(x * 2.1 + seed) * Math.sin(y * 2.7 + seed * 0.7) * Math.sin(z * 2.3 + seed * 1.3) * 0.5 +
    Math.sin(x * 5.3 + y * 3.1 + seed) * 0.18 + Math.sin(z * 6.1 - y * 4.2 + seed * 2) * 0.12;
  // ridged noise: sharp creases between rounded lobes read as rock, not a blob
  const ridge = (x: number, y: number, z: number): number => 1 - Math.abs(Math.sin(x * 3.3 + z * 2.1 + seed) * Math.cos(y * 2.9 - x * 1.7 + seed * 0.3));
  const sculpt = (p: THREE.Vector3): void => {
    const r = Math.hypot(p.x, p.y - 0.95, p.z) || 1;
    const k = 1 + n3(p.x, p.y, p.z) * 0.24 - ridge(p.x, p.y, p.z) * 0.1 + Math.round(Math.sin(p.x * 4 + p.y * 3 + seed) * 2) * 0.02;
    p.set(p.x * k, 0.95 + (p.y - 0.95) * k, p.z * k);
    // flat-ish base so it sits on the sand
    if (p.y < 0.08) p.y = 0.08 * (1 - Math.exp((p.y - 0.08) * 6));
    void r;
  };
  const strata = (x: number, y: number, z: number, c: THREE.Color): void => {
    const band = Math.sin(y * 7 + Math.sin(x * 1.7 + z * 1.3) * 0.9);
    c.multiplyScalar(0.86 + band * 0.07 + hash(Math.round(x * 14), Math.round(y * 14), Math.round(z * 14)) * 0.07);
    // dark creases
    c.multiplyScalar(1 - Math.max(0, ridge(x, y, z) - 0.8) * 1.2);
    // wet foot
    if (y < 0.4) c.lerp(new THREE.Color(0x5a4a40), sstep(0.4, 0.05, y) * 0.55);
    // moss on the upward-facing top
    if (y > 1.7) c.lerp(new THREE.Color(0x4f9a46), sstep(1.7, 2.0, y) * Math.max(0, 0.5 + 0.5 * Math.sin(x * 6 + z * 5)));
  };
  // faceted to match the cliffs, but finely: many small planes over big sculpted lobes
  b.ico(0x9b8577, 1.0, [0, 0.95, 0], [1.0, 1.08, 0.8], lo ? 1 : 2, 0.08, seed).warp(sculpt).paint(strata);
  b.ico(0x8a7466, 0.48, [0.72, 0.36, 0.3], [1.1, 0.8, 1], lo ? 1 : 2, 0.1, seed + 3).warp((p) => {
    const k = 1 + n3(p.x * 2, p.y * 2, p.z * 2) * 0.18;
    p.set(0.72 + (p.x - 0.72) * k, Math.max(0.02, 0.36 + (p.y - 0.36) * k), 0.3 + (p.z - 0.3) * k);
  }).paint(strata);
  // moss tufts and a starfish clinging on
  if (!lo) for (let i = 0; i < 5; i++) {
    const a = hash(seed, i, 7) * Math.PI * 2;
    b.sphere(i % 2 ? 0x5fb04f : 0x3f8a3c, 0.13 + hash(seed, i, 8) * 0.08, [Math.cos(a) * 0.38, 1.98 - hash(seed, i, 9) * 0.1, Math.sin(a) * 0.3], [1.4, 0.45, 1.2], 6);
  }
  b.sphere(0xff7a3a, 0.16, [-0.25, 1.2, 0.76], [1, 1, 0.3], 5);
  // barnacles round the foot
  for (let i = 0; i < (lo ? 0 : 10); i++) {
    const a = -0.9 + hash(seed, i, 1) * 1.8;
    const y = 0.2 + hash(seed, i, 2) * 0.55;
    b.cone(0xf2ece0, 0.05 + hash(seed, i, 3) * 0.025, 0.07, [Math.sin(a) * 0.98, y, Math.cos(a) * 0.78], [Math.PI / 2 - 0.3, a, 0], 5);
  }
  return b.build();
}

/** Urchins v2: purple spheres with long spines that wobble (wind attribute). */
export function urchins(variant = 0, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const spots: V3[] = variant ? [[-0.6, 0, -0.05], [0.0, 0, 0.15], [0.6, 0, -0.1]] : [[-0.55, 0, 0.05], [0.1, 0, -0.1], [0.65, 0, 0.12], [-0.1, 0, 0.25]];
  const spines = lo ? 8 : 16;
  for (const [x, , z] of spots) {
    b.sphere(0x6a3a8a, 0.24, [x, 0.22, z], [1, 0.85, 1], lo ? 6 : 10).paint((px, py, pz, c) => c.lerp(new THREE.Color(0x2a1640), sstep(0.35, 0.05, py)));
    for (let i = 0; i < spines; i++) {
      const a = (i / spines) * Math.PI * 2 + hash(x * 10, i, 1) * 0.3;
      const up = 0.15 + hash(x * 10, i, 2) * 0.75;
      const len = 0.42 + hash(x * 10, i, 3) * 0.2;
      b.seg(0x2a1640, [x, 0.25, z], [x + Math.cos(a) * len * (1 - up * 0.4), 0.25 + up * len, z + Math.sin(a) * len * (1 - up * 0.4)], 0.03, 0.004, 3);
    }
  }
  // spines wobble more toward their tips
  return addWind(b.build(), (x, y) => Math.max(0, y - 0.3) * 0.08);
}

// --------------------------------------------------------------- zone 3: sunset
export function tikiTorch(lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x6b4423, 0.06, 0.08, 2.2, [0, 1.1, 0], [0, 0, 0], 6);
  b.cyl(0x3a2414, 0.16, 0.1, 0.3, [0, 2.3, 0], [0, 0, 0], lo ? 6 : 8);
  if (!lo) for (let i = 0; i < 3; i++) b.torus(0xd9b15e, 0.085, 0.02, [0, 0.8 + i * 0.4, 0], [Math.PI / 2, 0, 0], 6, [1, 1, 1], 3);
  return b.build();
}

/** unlit flame + lantern glows (rendered with an unlit vertex-colour material) */
export function flame(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cone(0xff7a1a, 0.15, 0.45, [0, 2.65, 0], [0, 0, 0], 6);
  b.cone(0xffe14a, 0.08, 0.28, [0, 2.6, 0.02], [0, 0, 0], 6);
  // flames lick upward: flutter weighted toward the tip
  return addWind(b.build(), (x, y) => -Math.max(0, y - 2.45) * 0.12);
}

export function lantern(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(col, 0.16, [0, 0, 0], [1, 1.2, 1], 8);
  return addWind(b.build(), () => 0.05);
}

// --------------------------------------------------------------- Update 2 prop expansion (§2.3)
export function bucketSpade(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.lathe(col, [[0.16, 0], [0.22, 0.3], [0.2, 0.3], [0.14, 0.02], [0, 0.02]], 12);
  b.torus(new THREE.Color(col).multiplyScalar(0.8).getHex(), 0.2, 0.02, [0, 0.28, 0], [Math.PI / 2, 0, 0], 12, [1, 1, 1], 3);
  b.torus(0xf2f2f2, 0.19, 0.012, [0, 0.33, 0], [0, 0, 0], 10, [1, 1, 1], 3);
  // spade stuck in the sand beside it
  b.cyl(0xffc933, 0.025, 0.025, 0.55, [0.38, 0.32, 0.05], [0, 0, -0.25], 5);
  b.box(0xffc933, 0.2, 0.22, 0.03, [0.32, 0.06, 0.05], [0, 0, -0.25]);
  return b.build();
}

export function surfboards(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const cols = [0xff7a1a, 0x3fd6d0, 0xffd23a];
  for (let i = 0; i < 3; i++) {
    const c = cols[i] as number;
    b.sphere(c, 0.32, [i * 0.42 - 0.42, 0.95, i * 0.08], [0.6, 3.2, 0.12], 10, [0.15 - i * 0.05, 0, (i - 1) * 0.12]).paint((x, y, z, cc) => {
      if (Math.abs(x - (i * 0.42 - 0.42)) < 0.03) cc.set(0xffffff);
    });
  }
  return b.build();
}

export function lifeguardTower(lo = false): THREE.BufferGeometry {
  // Update 8: splayed stilts with cross braces, a cabin with framed windows and a striped band,
  // a deck with a rail, a cleated ramp, a rescue tube on the rail and a flag
  const b = new GeoBuilder();
  const wood = 0xf4f0e6;
  const dark = 0xc8c0b0;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const foot: V3 = [x * 0.82, 0, z * 0.72];
    const head: V3 = [x * 0.66, 2.42, z * 0.58];
    b.segOpen(wood, foot, head, 0.08, 0.07, 6);
  }
  // X braces on the sides and back
  if (!lo) for (const x of [-1, 1]) {
    b.segOpen(dark, [x * 0.8, 0.3, -0.7], [x * 0.69, 2.1, 0.6], 0.035, 0.035, 3);
    b.segOpen(dark, [x * 0.8, 0.3, 0.7], [x * 0.69, 2.1, -0.6], 0.035, 0.035, 3);
  }
  if (!lo) {
    b.segOpen(dark, [-0.8, 0.3, -0.7], [0.69, 2.1, -0.6], 0.035, 0.035, 3);
    b.segOpen(dark, [0.8, 0.3, -0.7], [-0.69, 2.1, -0.6], 0.035, 0.035, 3);
  }
  // deck and cabin
  b.box(0xe53935, 2.1, 0.12, 2.1, [0, 2.46, 0.15]);
  b.box(0xfff4dc, 1.6, 1.05, 1.3, [0, 3.04, -0.15]);
  b.box(0x2f6fd6, 1.62, 0.16, 1.32, [0, 2.62, -0.15]);
  // windows: dark glass with white frames, front and both sides
  b.box(0x5aa8d8, 1.2, 0.42, 0.03, [0, 3.18, 0.51]).paint((x, y, z, c) => c.lerp(new THREE.Color(0xe8f6ff), sstep(3.0, 3.4, y) * 0.6));
  b.box(wood, 0.05, 0.46, 0.05, [0, 3.18, 0.53]);
  for (const x of [-1, 1]) b.box(0x5aa8d8, 0.03, 0.36, 0.7, [x * 0.81, 3.18, -0.15]);
  // pitched striped roof with an overhang
  const roof = new Poly();
  const ridge = 4.05;
  for (let i = 0; i < 6; i++) {
    const x0 = -1.0 + (i / 6) * 2.0;
    const x1 = -1.0 + ((i + 1) / 6) * 2.0;
    const c = i % 2 ? 0xe53935 : 0xffffff;
    roof.quad([x0, 3.56, 0.75], [x1, 3.56, 0.75], [x1, ridge, -0.15], [x0, ridge, -0.15], c, 0.7);
    roof.quad([x0, ridge, -0.15], [x1, ridge, -0.15], [x1, 3.56, -1.05], [x0, 3.56, -1.05], c, 0.7);
  }
  for (const x of [-1.0, 1.0]) roof.tri([x, 3.56, 0.75], [x, ridge, -0.15], [x, 3.56, -1.05], 0xfff4dc, 0.8);
  b.raw(roof.build());
  if (lo) return b.build();
  // front deck rail
  for (const x of [-0.95, -0.3, 0.3, 0.95]) b.tubeOpen(wood, 0.03, 0.03, 0.6, [x, 2.82, 1.15], [0, 0, 0], 4);
  b.box(wood, 2.0, 0.06, 0.06, [0, 3.12, 1.15]);
  b.box(wood, 2.0, 0.04, 0.04, [0, 2.86, 1.15]);
  // rescue tube on the rail
  b.sphere(0xff7a1a, 0.12, [0.55, 2.86, 1.24], [3.2, 1, 1], 6);
  // ramp with cleats
  const r0: V3 = [0.55, 2.4, 1.2];
  const r1: V3 = [0.55, 0.02, 3.0];
  b.box(dark, 0.62, 0.06, Math.hypot(r1[1] - r0[1], r1[2] - r0[2]), lerp3(r0, r1, 0.5), [Math.atan2(r0[1] - r1[1], r1[2] - r0[2]), 0, 0]);
  for (let i = 1; i < 6; i++) {
    const q = lerp3(r0, r1, i / 6);
    b.box(wood, 0.6, 0.04, 0.06, [q[0], q[1] + 0.05, q[2]]);
  }
  // flag pole with a red-and-yellow flag
  b.tubeOpen(0x8a8a90, 0.025, 0.025, 1.3, [0.95, 4.35, -0.95], [0, 0, 0], 4);
  b.box(0xe53935, 0.55, 0.16, 0.02, [1.24, 4.88, -0.95]);
  b.box(0xffd23a, 0.55, 0.16, 0.02, [1.24, 4.72, -0.95]);
  return addWind(b.build(), (x, y) => (y > 4.6 && x > 0.98 ? -0.04 : 0));
}

export function fishingNet(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // a net draped over a post rail with a few floats
  for (let i = 0; i <= 6; i++) {
    const x = -1 + i / 3;
    b.tube(0x6f8a7a, [[x, 1.1, 0], [x + 0.05, 0.6, 0.06], [x, 0.1, 0.02]], 0.012, 3, 4, false);
  }
  for (let j = 0; j < 4; j++) {
    const y = 1.05 - j * 0.28;
    b.tube(0x6f8a7a, [[-1, y, 0.02], [0, y - 0.08, 0.07], [1, y, 0.02]], 0.012, 3, 6, false);
  }
  for (const x of [-0.7, 0.1, 0.8]) b.sphere(0xffc933, 0.07, [x, 1.12, 0.03], [1, 1, 1], 6);
  return addWind(b.build(), (x, y) => (y < 0.9 ? -0.015 * (1 - y) : 0));
}

export function bench(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < 3; i++) b.box(0xb98550, 1.8, 0.06, 0.14, [0, 0.48, -0.15 + i * 0.16]);
  for (let i = 0; i < 2; i++) b.box(0xb98550, 1.8, 0.14, 0.05, [0, 0.75 + i * 0.18, -0.3]);
  for (const x of [-0.75, 0.75]) {
    b.box(0x2c3e66, 0.06, 0.48, 0.42, [x, 0.24, 0]);
    b.box(0x2c3e66, 0.06, 0.5, 0.05, [x, 0.75, -0.3]);
  }
  return b.build();
}

export function postGull(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x8a5a2b, 0.13, 0.14, 1.4, [0, 0.7, 0], [0, 0, 0], 7);
  b.sphere(0xfafafa, 0.22, [0, 1.62, 0], [0.9, 0.85, 1.3], 8).paint((x, y, z, c) => {
    if (y > 1.7 && z < 0.05) c.set(0xb4bec8);
  });
  b.sphere(0xfafafa, 0.13, [0, 1.86, 0.16], [1, 1, 1], 8);
  b.cone(0xffb21f, 0.04, 0.16, [0, 1.85, 0.32], [Math.PI / 2, 0, 0], 5);
  b.sphere(0x111111, 0.02, [0.06, 1.9, 0.26], [1, 1, 1], 4);
  b.sphere(0x111111, 0.02, [-0.06, 1.9, 0.26], [1, 1, 1], 4);
  b.box(0x2a2f38, 0.14, 0.04, 0.2, [0, 1.62, -0.32], [0.4, 0, 0]);
  return b.build();
}

export function crabBurrow(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  b.lathe(0xd8b98a, [[0.32, 0], [0.24, 0.08], [0.14, 0.06], [0.1, -0.02]], 10);
  b.cyl(0x3a2a18, 0.11, 0.11, 0.02, [0, 0.0, 0], [0, 0, 0], 10);
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.4 + r() * 0.5;
    b.sphere(0xd8b98a, 0.04 + r() * 0.03, [Math.cos(a) * d, 0.02, Math.sin(a) * d], [1, 0.6, 1], 5);
  }
  return b.build();
}

export function starfishCluster(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const cols = [0xff7a3a, 0xb06ad6, 0xff5a7a, 0xffc933];
  for (let i = 0; i < 4; i++) {
    const g = starfish(cols[i % 4] as number);
    const s = 0.6 + r() * 0.6;
    g.scale(s, s, s);
    g.rotateY(r() * 6);
    g.translate((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2);
    b.raw(g);
  }
  return b.build();
}

export function hammock(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // two posts and a sagging striped hammock between them
  for (const x of [-1.6, 1.6]) b.cyl(0x6b4423, 0.09, 0.11, 2.0, [x, 1.0, 0], [0, 0, x * 0.03], 6);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const y = (t: number): number => 1.45 - Math.sin(t * Math.PI) * 0.6;
    const x0 = -1.5 + t0 * 3;
    const x1 = -1.5 + t1 * 3;
    b.box(i % 2 ? 0xff7a1a : 0xfff4dc, Math.hypot(x1 - x0, y(t1) - y(t0)) + 0.02, 0.04, 0.8, [(x0 + x1) / 2, (y(t0) + y(t1)) / 2, 0], [0, 0, Math.atan2(y(t1) - y(t0), x1 - x0)]);
  }
  return addWind(b.build(), (x, y) => (y < 1.4 && Math.abs(x) < 1.4 ? 0.04 * (1 - Math.abs(x) / 1.4) : 0));
}

export function bonfireLogs(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.tube(0x6b4423, [[Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [Math.cos(a) * 0.08, 0.45, Math.sin(a) * 0.08]], 0.07, 5, 2, true);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.ico(0x8a8278, 0.13, [Math.cos(a) * 0.7, 0.06, Math.sin(a) * 0.7], [1, 0.6, 1], 0, 0.2, 40 + i);
  }
  return b.build();
}

/** unlit bonfire flames (glow material) */
export function bonfireFlame(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cone(0xff5a1a, 0.4, 0.9, [0, 0.6, 0], [0, 0, 0], 7);
  b.cone(0xffa020, 0.28, 0.7, [0.06, 0.55, 0.05], [0, 0.5, 0], 6);
  b.cone(0xffe14a, 0.15, 0.45, [-0.02, 0.45, 0.04], [0, 1.0, 0], 5);
  return addWind(b.build(), (x, y) => -Math.max(0, y - 0.3) * 0.22);
}

// --------------------------------------------------------------- Update 5 map detail (UPDATE5_PLAN.md §1)
/** a clump of dune grass (Update 8): curved, tapering blades in two greens, a few seed heads, a sand mound */
export function duneGrass(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const p = new Poly();
  const n = 11;
  const base = new THREE.Color(0x6f8f3e);
  const tipA = new THREE.Color(0xc8cf7a);
  const tipB = new THREE.Color(0x9fbf58);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6;
    const h = 0.5 + r() * 0.55;
    const lean = 0.25 + r() * 0.45;
    const w = 0.035 + r() * 0.02;
    const o: V3 = [Math.cos(a) * 0.12 * r(), 0.02, Math.sin(a) * 0.12 * r()];
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const pt = (t: number, s: number): V3 => {
      const out = lean * t * t * h;
      const ww = w * (1 - t) * s;
      return [o[0] + dx * out - dz * ww, o[1] + h * t * (1 - t * lean * 0.25), o[2] + dz * out + dx * ww];
    };
    const tip = r() < 0.5 ? tipA : tipB;
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3;
      const t1 = (k + 1) / 3;
      c.copy(base).lerp(tip, t1);
      if (k < 2) p.quad(pt(t0, -1), pt(t0, 1), pt(t1, 1), pt(t1, -1), c, 0.8);
      else p.tri(pt(t0, -1), pt(t0, 1), pt(1, 0), c, 0.8);
    }
  }
  b.raw(p.build());
  b.lathe(0xe9c37e, [[0.34, 0], [0.22, 0.06], [0, 0.08]], 6);
  return addWind(b.build(), (x, y) => Math.max(0, y) * 0.16);
}

/** a beach volleyball net between two posts, with a ball in the sand */
export function volleyNet(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (const z of [-2.2, 2.2]) {
    b.cyl(0xf2f2ee, 0.06, 0.07, 2.4, [0, 1.2, z], [0, 0, 0], 6);
    b.sphere(0xe53935, 0.08, [0, 2.42, z], [1, 1, 1], 6);
  }
  b.box(0xf8f8f2, 0.03, 0.06, 4.4, [0, 2.3, 0]);
  b.box(0x3a4a5a, 0.015, 0.6, 4.3, [0, 1.95, 0]).paint((x, y, z, c) => {
    if ((Math.floor((y - 1.65) * 14) + Math.floor((z + 2.2) * 10)) % 2 === 0) c.multiplyScalar(1.6);
  });
  b.box(0xf8f8f2, 0.03, 0.05, 4.4, [0, 1.65, 0]);
  b.sphere(0xffd23a, 0.2, [0.8, 0.2, 1.1], [1, 1, 1], 10).paint((x, y, z, c) => {
    if (Math.abs(Math.atan2(z - 1.1, x - 0.8)) % 1.05 < 0.35) c.set(0x2f6fd6);
  });
  return b.build();
}

/** a kayak pulled up on the shore, paddle across it */
export function kayak(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(col, 0.5, [0, 0.2, 0], [0.62, 0.42, 3.4], 12);
  b.sphere(0x2a2a30, 0.22, [0, 0.36, 0.1], [0.9, 0.3, 1.6], 8);
  b.box(new THREE.Color(col).multiplyScalar(0.75).getHex(), 0.66, 0.04, 0.1, [0, 0.33, 1.1]);
  b.cyl(0xe8e8e0, 0.025, 0.025, 2.2, [0, 0.45, 0.2], [0, 0, Math.PI / 2 - 0.2], 5);
  for (const s of [-1, 1]) b.sphere(0xffd23a, 0.12, [s * 1.05, 0.45 + s * 0.2, 0.2], [1, 0.25, 1.6], 6, [0, 0, -0.2]);
  return b.build();
}

/** a striped windsock on a pole */
export function windsock(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0xe8e8e0, 0.05, 0.06, 3.2, [0, 1.6, 0], [0, 0, 0], 6);
  for (let i = 0; i < 4; i++) b.cyl(i % 2 ? 0xffffff : 0xff5a3a, 0.2 - i * 0.03, 0.17 - i * 0.03, 0.3, [0.32 + i * 0.3, 3.0 - i * 0.04, 0], [0, 0, Math.PI / 2 + 0.1], 8);
  return addWind(b.build(), (x) => Math.max(0, x) * 0.2);
}

/** a stack of barrels for the pier */
export function barrels(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const at: V3[] = [[0, 0.45, 0], [0.75, 0.45, 0.1], [0.38, 1.33, 0.05]];
  for (const p of at) {
    b.lathe(0x8a5a2b, [[0.3, -0.42], [0.36, -0.2], [0.38, 0], [0.36, 0.2], [0.3, 0.42], [0, 0.42]], 10, p);
    for (const dy of [-0.26, 0.26]) b.torus(0x4a4a50, 0.355, 0.02, [p[0], p[1] + dy, p[2]], [Math.PI / 2, 0, 0], 10, [1, 1, 1], 3);
  }
  return b.build();
}

/** a life ring hung on a post */
export function lifeRing(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x8a5a2b, 0.08, 0.09, 1.6, [0, 0.8, 0], [0, 0, 0], 6);
  b.torus(0xff4a3a, 0.3, 0.08, [0, 1.15, 0.12], [0, 0, 0], 12, [1, 1, 1], 5).paint((x, y, z, c) => {
    const a = Math.atan2(y - 1.15, x);
    if (Math.floor((a + Math.PI) / (Math.PI / 4)) % 2 === 0) c.set(0xffffff);
  });
  return b.build();
}

/** a flower planter for the boardwalk */
export function planter(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  b.box(0x9a6a3a, 1.2, 0.5, 0.5, [0, 0.25, 0]);
  b.box(0x5a8a3a, 1.1, 0.12, 0.4, [0, 0.52, 0]);
  const cols = [0xff5a8a, 0xffd23a, 0xff8a2a, 0xffffff, 0xb06ad6];
  for (let i = 0; i < 7; i++) b.sphere(cols[Math.floor(r() * cols.length)] as number, 0.09, [-0.45 + i * 0.15, 0.62 + r() * 0.12, (r() - 0.5) * 0.25], [1, 0.8, 1], 6);
  return b.build();
}

/** a cluster of sea anemones for the tide pools */
export function anemones(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  for (let k = 0; k < 3; k++) {
    const x = (r() - 0.5) * 0.7;
    const z = (r() - 0.5) * 0.7;
    const col = [0xff6ab0, 0x9a6aff, 0x3fd6c0][k] as number;
    b.cyl(new THREE.Color(col).multiplyScalar(0.7).getHex(), 0.1, 0.12, 0.18, [x, 0.09, z], [0, 0, 0], 7);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.cone(col, 0.025, 0.22, [x + Math.cos(a) * 0.07, 0.27, z + Math.sin(a) * 0.07], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], 3);
    }
  }
  return addWind(b.build(), (x, y) => Math.max(0, y - 0.18) * 0.25);
}

/** a hibiscus bush with flowers (sunset beach) */
export function flowerBush(seed: number, col: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  for (let i = 0; i < 3; i++) b.sphere(i % 2 ? 0x2f8a42 : 0x3fa34e, 0.44 - i * 0.04, [(r() - 0.5) * 0.8, 0.35 + r() * 0.3, (r() - 0.5) * 0.6], [1, 0.85, 1], 6);
  for (let i = 0; i < 5; i++) b.sphere(i % 3 ? col : 0xffffff, 0.1, [(r() - 0.5) * 0.9, 0.55 + r() * 0.45, 0.25 + r() * 0.15], [1, 0.6, 1], 4);
  return addWind(b.build(), (x, y) => Math.max(0, y - 0.4) * 0.04);
}

/** a sailing boat far offshore */
export function sailboat(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xf8f8f2, 0.6, [0, 0, 0], [0.5, 0.3, 2.2], 7);
  b.cyl(0x8a5a2b, 0.04, 0.04, 3.2, [0, 1.6, 0], [0, 0, 0], 5);
  b.cone(col, 1.0, 2.6, [0, 1.6, -0.45], [0, 0, 0], 3, [0.05, 1, 1]);
  b.cone(0xffffff, 0.7, 1.9, [0, 1.3, 0.55], [0, 0, 0], 3, [0.05, 1, 1]);
  return b.build();
}

// --------------------------------------------------------------- Update 8 hero scenery (UPDATE8_PLAN.md, map track)
/** Striped canvas stripes across a sloped plane from edge (a0,a1) up to edge (b0,b1). */
function stripes(p: Poly, a0: V3, a1: V3, b0: V3, b1: V3, n: number, colA: number, colB: number): void {
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    p.quad(lerp3(a0, a1, t0), lerp3(a0, a1, t1), lerp3(b0, b1, t1), lerp3(b0, b1, t0), i % 2 ? colA : colB, 0.72);
  }
}

/** A scalloped valance along an edge, flaps alternating colour. */
function valance(p: Poly, a: V3, b: V3, n: number, drop: number, colA: number, colB: number): void {
  for (let i = 0; i < n; i++) {
    const p0 = lerp3(a, b, i / n);
    const p1 = lerp3(a, b, (i + 1) / n);
    const m = lerp3(p0, p1, 0.5);
    p.quad(p0, p1, [p1[0], p1[1] - drop * 0.6, p1[2]], [p0[0], p0[1] - drop * 0.6, p0[2]], i % 2 ? colA : colB, 0.72);
    p.tri([p0[0], p0[1] - drop * 0.6, p0[2]], [p1[0], p1[1] - drop * 0.6, p1[2]], [m[0], m[1] - drop, m[2]], i % 2 ? colA : colB, 0.72);
  }
}

/** A beach cabana: a wooden frame, a striped pitched awning with a scalloped valance, tied-back
 * curtains, a lounger with a pillow and a little side table. Opens toward +z. ~2.4 x 2.2 m. */
export function cabana(colA: number, colB = 0xfff4dc): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wood = 0xe8dcc4;
  b.box(0xc9955a, 2.5, 0.1, 2.3, [0, 0.05, 0]).paint((x, y, z, c) => c.multiplyScalar(0.9 + Math.abs(Math.sin(x * 9)) * 0.12));
  for (const x of [-1.15, 1.15]) for (const z of [-1.05, 1.05]) b.tubeOpen(wood, 0.06, 0.06, 2.2, [x, 1.15, z], [0, 0, 0], 5);
  const p = new Poly();
  const eave = 2.2;
  const ridge = 2.85;
  stripes(p, [-1.3, eave, 1.2], [1.3, eave, 1.2], [-1.3, ridge, 0], [1.3, ridge, 0], 7, colA, colB);
  stripes(p, [-1.3, ridge, 0], [1.3, ridge, 0], [-1.3, eave, -1.2], [1.3, eave, -1.2], 7, colA, colB);
  for (const x of [-1.3, 1.3]) p.tri([x, eave, 1.2], [x, ridge, 0], [x, eave, -1.2], colA, 0.75);
  valance(p, [-1.3, eave, 1.2], [1.3, eave, 1.2], 7, 0.22, colA, colB);
  valance(p, [1.3, eave, -1.2], [-1.3, eave, -1.2], 7, 0.22, colA, colB);
  // back wall curtain in one panel, side curtains gathered and tied to the front posts
  p.quad([-1.15, 0.12, -1.05], [1.15, 0.12, -1.05], [1.15, eave, -1.05], [-1.15, eave, -1.05], shade(colB, 0.96), 0.85);
  for (const s of [-1, 1]) {
    const x = s * 1.15;
    p.quad([x, eave, 1.05], [x, eave, 0.55], [x, 1.2, 0.95], [x, 1.2, 1.0], colA, 0.8);
    p.quad([x, 1.2, 1.0], [x, 1.2, 0.95], [x, 0.12, 0.7], [x, 0.12, 1.05], colA, 0.8);
  }
  b.raw(p.build());
  for (const s of [-1, 1]) b.torus(0xffd23a, 0.06, 0.02, [s * 1.15, 1.2, 0.98], [Math.PI / 2, 0, 0], 6, [1, 1, 1], 3);
  // lounger: frame, cushion and pillow, angled back rest
  b.box(0xb98550, 0.75, 0.12, 1.6, [-0.35, 0.35, 0.05]);
  b.box(colA, 0.7, 0.1, 1.1, [-0.35, 0.46, 0.3]);
  b.box(colA, 0.7, 0.1, 0.6, [-0.35, 0.68, -0.55], [0.7, 0, 0]);
  b.sphere(0xfff4dc, 0.18, [-0.35, 0.86, -0.42], [1.6, 0.6, 0.9], 6);
  for (const x of [-0.65, -0.05]) for (const z of [-0.6, 0.75]) b.tubeOpen(0x8a5a2b, 0.03, 0.03, 0.3, [x, 0.2, z], [0, 0, 0], 4);
  // side table with a drink
  b.cyl(0xfff4dc, 0.22, 0.22, 0.05, [0.65, 0.55, 0.1], [0, 0, 0], 8);
  b.tubeOpen(0xb0b8c0, 0.03, 0.03, 0.5, [0.65, 0.3, 0.1], [0, 0, 0], 4);
  b.cyl(0xff8a3a, 0.05, 0.04, 0.14, [0.6, 0.65, 0.1], [0, 0, 0], 6);
  return addWind(b.build(), (x, y, z) => (y > 1.8 && y < 2.25 && Math.abs(z) > 1.1 ? -0.02 : 0));
}

/** A wooden jetty reaching into the sea along +x: plank deck, pilings with braces, a rope rail,
 * a bollard, a ladder down at the end and a lantern post. Starts at x = 0 on the sand. */
export function jetty(len = 12, lo = false): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const deckY = 0.62;
  const hw = 0.95;
  const p = new Poly();
  const n = Math.round(len / 0.38);
  const plankA = new THREE.Color(0xc9955a);
  const plankB = new THREE.Color(0xb3804a);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * len + 0.03;
    const x1 = ((i + 1) / n) * len - 0.03;
    c.copy(i % 3 === 0 ? plankB : plankA).multiplyScalar(0.94 + hash(i, 3, 7) * 0.12);
    // planks are a little uneven
    const dy = (hash(i, 1, 2) - 0.5) * 0.02;
    p.quad([x0, deckY + dy, hw], [x1, deckY + dy, hw], [x1, deckY + dy, -hw], [x0, deckY + dy, -hw], c, 0);
  }
  b.raw(p.build());
  // stringers under the deck
  for (const z of [-hw + 0.08, hw - 0.08]) b.box(0x7a5530, len, 0.2, 0.12, [len / 2, deckY - 0.12, z]);
  // pilings with cross braces
  const step = 2.4;
  for (let x = 0.4; x < len; x += step) {
    for (const z of [-hw - 0.05, hw + 0.05]) b.tubeOpen(0x6b4423, 0.12, 0.14, 2.6, [x, deckY - 1.15, z], [0, 0, 0], lo ? 5 : 7).paint((px, py, pz, cc) => {
      if (py < 0.0) cc.lerp(new THREE.Color(0x3a4a3a), sstep(0.0, -0.4, py) * 0.6);
    });
    if (!lo && x > 2) b.segOpen(0x7a5530, [x, deckY - 0.25, -hw], [x, -0.6, hw], 0.035, 0.035, 3);
  }
  if (!lo) {
    // rope rail along one side
    for (let x = 0.4; x < len; x += step) b.tubeOpen(0x8a5a2b, 0.05, 0.05, 1.0, [x, deckY + 0.5, -hw - 0.05], [0, 0, 0], 5);
    for (let x = 0.4; x + step < len; x += step) {
      b.segOpen(0xe9dfc8, [x, deckY + 0.95, -hw - 0.05], [x + step / 2, deckY + 0.8, -hw - 0.05], 0.02, 0.02, 3);
      b.segOpen(0xe9dfc8, [x + step / 2, deckY + 0.8, -hw - 0.05], [x + step, deckY + 0.95, -hw - 0.05], 0.02, 0.02, 3);
    }
    // bollard with a rope coil, a ladder at the end, a lantern post and a life ring
    b.cyl(0x2c3e66, 0.12, 0.14, 0.3, [len - 0.4, deckY + 0.15, hw - 0.25], [0, 0, 0], 7);
    b.sphere(0x2c3e66, 0.14, [len - 0.4, deckY + 0.32, hw - 0.25], [1, 0.6, 1], 6);
    b.torus(0xe9dfc8, 0.2, 0.035, [len - 1.0, deckY + 0.04, hw - 0.35], [Math.PI / 2, 0, 0], 9, [1, 1, 1], 3);
    for (const z of [-0.3, 0.3]) b.tubeOpen(0xb0b8c0, 0.025, 0.025, 1.6, [len + 0.05, deckY - 0.3, z], [0, 0, 0], 4);
    for (let i = 0; i < 4; i++) b.tubeOpen(0xb0b8c0, 0.02, 0.02, 0.6, [len + 0.05, deckY + 0.3 - i * 0.35, 0], [Math.PI / 2, 0, 0], 3);
    b.tubeOpen(0x2c3e66, 0.05, 0.06, 2.2, [len - 0.3, deckY + 1.1, -hw + 0.1], [0, 0, 0], 5);
    b.sphere(0xfff3c4, 0.14, [len - 0.3, deckY + 2.3, -hw + 0.1], [1, 1.2, 1], 6);
    b.cone(0x2c3e66, 0.17, 0.14, [len - 0.3, deckY + 2.5, -hw + 0.1], [0, 0, 0], 6);
    b.torus(0xff4a3a, 0.22, 0.06, [len * 0.55, deckY + 0.65, -hw - 0.12], [0, 0, 0], 10, [1, 1, 1], 4).paint((x, y, z, cc) => {
      if (Math.floor((Math.atan2(y - deckY - 0.65, x - len * 0.55) + Math.PI) / (Math.PI / 4)) % 2 === 0) cc.set(0xffffff);
    });
  }
  return b.build();
}

/** A sea stack: stratified rock layers stepping in as they rise, moss and grass on top, a wet
 * dark foot with barnacles. */
export function seaStack(seed: number, lo = false): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const cols = [0xa89382, 0x93806f, 0xb8a28e, 0x8a7466];
  let y = 0;
  let w = 2.0 + r() * 0.6;
  let ox = 0;
  let oz = 0;
  const layers = 4 + Math.floor(r() * 2);
  for (let i = 0; i < layers; i++) {
    const h = 0.7 + r() * 0.6;
    ox += (r() - 0.5) * 0.5;
    oz += (r() - 0.5) * 0.4;
    // each stratum: a flattened, jittered slab with its own tone and a lighter band at its top
    const col = cols[i % 4] as number;
    const yy = y + h / 2;
    b.ico(col, 1, [ox, yy, oz], [w, h * 0.62, w * 0.82], 1, 0.16, seed + i * 11).paint((x, py, z, cc) => {
      const k = (py - y) / h;
      cc.multiplyScalar(0.84 + k * 0.22 + hash(Math.round(x * 6), Math.round(py * 6), Math.round(z * 6)) * 0.06);
      if (py < 0.35) cc.lerp(new THREE.Color(0x4a4038), 0.45);
    });
    y += h * 0.95;
    w *= 0.8 + r() * 0.08;
  }
  // moss cap and grass on the top
  b.sphere(0x4f8f3e, 1, [ox, y + 0.05, oz], [w * 0.9, 0.22, w * 0.75], 7).paint((x, py, z, cc) => cc.multiplyScalar(0.85 + Math.sin(x * 5 + z * 4) * 0.12));
  if (!lo) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r();
      b.cone(i % 2 ? 0x8fb04e : 0x6f9a3e, 0.12, 0.5, [ox + Math.cos(a) * w * 0.4, y + 0.3, oz + Math.sin(a) * w * 0.3], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], 3);
    }
    // moss dripping over the edge of the top stratum and barnacles at the foot
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      b.sphere(0x5a9a46, 0.3, [ox + Math.cos(a) * w * 0.75, y - 0.2, oz + Math.sin(a) * w * 0.62], [1.2, 0.5, 1], 5);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      b.cone(0xf2ece0, 0.07, 0.08, [Math.cos(a) * 1.7, 0.18 + r() * 0.3, Math.sin(a) * 1.45], [Math.PI / 2 - 0.3, -a + Math.PI / 2, 0], 4);
    }
  }
  return b.build();
}

/** Sun-bleached driftwood: a bent log with branch stubs and pale end grain. */
export function driftwood(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const L = 1.8 + r() * 1.2;
  const bend = (r() - 0.5) * 0.6;
  const pts: V3[] = [[-L / 2, 0.12, 0], [-L / 6, 0.16, bend * 0.6], [L / 6, 0.14, bend], [L / 2, 0.1, bend * 0.4]];
  b.tube(0xb8a890, pts, (t) => 0.13 * (1 - t * 0.45), 6, 6, 'start').paint((x, y, z, c) => c.multiplyScalar(0.86 + Math.abs(Math.sin(x * 14 + z * 3)) * 0.18));
  b.cyl(0xe2d6bc, 0.12, 0.12, 0.02, [-L / 2 - 0.01, 0.12, 0], [0, 0, Math.PI / 2], 6);
  for (let i = 0; i < 2; i++) {
    const t = 0.35 + i * 0.3;
    const q = lerp3(pts[1] as V3, pts[2] as V3, t);
    const s = i % 2 ? 1 : -1;
    b.tube(0xa89880, [q, [q[0] + 0.2, q[1] + 0.22, q[2] + s * 0.25], [q[0] + 0.35, q[1] + 0.28, q[2] + s * 0.45]], (u) => 0.05 * (1 - u * 0.6), 4, 3, 'end');
  }
  return b.build();
}

/** A sandcastle with four towers, a keep, walls, a gate, a moat, shells and a flag. */
export function sandcastle(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const sandA = 0xe9c37e;
  const sandB = 0xf2d699;
  const ridges = (x: number, y: number, z: number, c: THREE.Color): void => {
    c.multiplyScalar(0.9 + Math.abs(Math.sin(y * 18)) * 0.12);
  };
  // moat: wet sand ring with a sliver of water
  b.lathe(0xc8a060, [[1.45, 0], [1.3, 0.03], [0, 0.03]], 10);
  b.tubeOpen(0x7ad0e8, 1.22, 1.22, 0.04, [0, 0.03, 0], [0, 0, 0], 10);
  b.lathe(sandA, [[1.08, 0], [1.0, 0.22], [0, 0.22]], 8);
  const tower: [number, number][] = [[0.24, 0], [0.2, 0.22], [0.18, 0.44], [0.17, 0.62], [0, 0.62]];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as [number, number][]) {
    b.lathe(sandB, tower, 6, [x, 0.2, z]).paint(ridges);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      b.box(sandB, 0.08, 0.1, 0.08, [x + Math.cos(a) * 0.12, 0.86, z + Math.sin(a) * 0.12]);
    }
  }
  // walls between the towers, a dark gate at the front
  for (const [x, z, ry] of [[0, -0.6, 0], [0, 0.6, 0], [-0.6, 0, Math.PI / 2], [0.6, 0, Math.PI / 2]] as [number, number, number][]) {
    b.box(sandA, 1.0, 0.36, 0.14, [x, 0.38, z], [0, ry, 0]).paint(ridges);
  }
  b.box(0x8a6a40, 0.22, 0.22, 0.04, [0, 0.33, 0.68]);
  // keep
  b.lathe(sandB, [[0.34, 0], [0.28, 0.32], [0.25, 0.72], [0.22, 0.95], [0, 0.95]], 6, [0, 0.2, 0]).paint(ridges);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.box(sandB, 0.09, 0.12, 0.09, [Math.cos(a) * 0.18, 1.2, Math.sin(a) * 0.18], [0, -a, 0]);
  }
  b.tubeOpen(0x7a5530, 0.012, 0.012, 0.55, [0, 1.45, 0], [0, 0, 0], 3);
  b.box(0xe53935, 0.26, 0.15, 0.02, [0.14, 1.63, 0]);
  // shells pressed into the wall
  b.ico(0xf7a6b8, 0.05, [0.3, 0.42, 0.68], [1, 1, 0.5], 0);
  b.ico(0xfff4dc, 0.05, [-0.3, 0.42, 0.68], [1, 1, 0.5], 0);
  return addWind(b.build(), (x, y) => (y > 1.55 && x > 0.02 ? -0.02 * x * 6 : 0));
}

/** A line of floats on a rope, marking the swimming area (lies along z, centred on 0). */
export function floatLine(n = 9, gap = 1.4): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const L = (n - 1) * gap;
  b.segOpen(0xe9dfc8, [0, 0.06, -L / 2], [0, 0.06, L / 2], 0.02, 0.02, 3);
  for (let i = 0; i < n; i++) b.ico(i % 2 ? 0xffffff : 0xff5a3a, 0.14, [0, 0.07, -L / 2 + i * gap], [1, 0.8, 1.3], 0);
  return addWind(b.build(), () => 0.02);
}

/** Stacked wire crab pots with a buoy and rope, for the pier. */
export function crabPots(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const pot = (x: number, y: number, z: number, ry: number, col: number): void => {
    const w = 0.7;
    const h = 0.42;
    // dark mesh panels with a coloured frame
    b.box(0x34474a, w - 0.04, h - 0.04, w - 0.04, [x, y + h / 2, z], [0, ry, 0]).paint((px, py, pz, c) => c.multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(py * 30))));
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    const at = (lx: number, lz: number): [number, number] => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    for (const lx of [-w / 2, w / 2]) for (const lz of [-w / 2, w / 2]) {
      const [px, pz] = at(lx, lz);
      b.tubeOpen(col, 0.025, 0.025, h, [px, y + h / 2, pz], [0, 0, 0], 3);
    }
    for (const yy of [y + 0.01, y + h]) for (const lz of [-w / 2, w / 2]) {
      const [px, pz] = at(0, lz);
      b.box(col, w, 0.04, 0.04, [px, yy, pz], [0, ry, 0]);
    }
  };
  pot(0, 0, 0, 0.1, 0xffc933);
  pot(0.78, 0, 0.1, -0.15, 0x22c8f0);
  pot(0.35, 0.44, 0.05, 0.3, 0xff5a3a);
  b.lathe(0xff7a1a, [[0, -0.18], [0.12, -0.12], [0.14, 0.05], [0.1, 0.18], [0, 0.2]], 6, [-0.55, 0.16, 0.45], [Math.PI / 2, 0, 0.4]);
  b.torus(0xe9dfc8, 0.18, 0.03, [-0.55, 0.03, -0.1], [Math.PI / 2, 0, 0], 8, [1, 1, 1], 3);
  return b.build();
}

/** A post hung with colourful fishing buoys. */
export function hangingBuoys(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.tubeOpen(0x8a5a2b, 0.09, 0.1, 2.0, [0, 1.0, 0], [0, 0, 0], 6);
  b.sphere(0x7a4a22, 0.1, [0, 2.0, 0], [1, 0.6, 1], 5);
  const cols = [0xff5a3a, 0xffd23a, 0x22c8f0, 0xffffff];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 0.2;
    const z = Math.sin(a) * 0.2;
    const y = 1.2 - (i % 2) * 0.35;
    b.segOpen(0xe9dfc8, [x * 0.5, 1.85, z * 0.5], [x, y + 0.2, z], 0.012, 0.012, 3);
    b.lathe(cols[i] as number, [[0, -0.2], [0.11, -0.14], [0.13, 0.02], [0.1, 0.16], [0, 0.2]], 6, [x, y, z]).paint((px, py, pz, c) => {
      if (Math.abs(py - y) < 0.04) c.set(0x2a2f38);
    });
  }
  return addWind(b.build(), (x, y) => (y < 1.8 ? 0.015 : 0));
}

/** A sunset tiki bar: thatch roof, striped awning, a bamboo counter with stools and a tiki mask. */
export function tikiBar(colA: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const bamboo = (x: number, y: number, z: number, c: THREE.Color): void => {
    c.multiplyScalar(0.8 + Math.abs(Math.sin(x * 12.5)) * 0.25);
    if (Math.abs(Math.sin(y * 6)) > 0.95) c.multiplyScalar(0.75);
  };
  b.box(0xc9955a, 2.6, 1.0, 0.7, [0, 0.5, 0.5]).paint(bamboo);
  b.box(0x8a5a2b, 2.8, 0.1, 0.9, [0, 1.05, 0.55]);
  for (const x of [-1.25, 1.25]) for (const z of [-0.9, 0.85]) b.tubeOpen(0x9a6a34, 0.08, 0.09, 2.4, [x, 1.2, z], [0, 0, 0], 5);
  b.box(0xb98550, 2.5, 1.0, 0.1, [0, 1.6, -0.9]).paint(bamboo);
  // thatch: two layers with a ragged fringe
  b.cone(0xd9b15e, 2.2, 1.1, [0, 3.0, 0], [0, Math.PI / 4, 0], 4, [1, 1, 0.8]).paint((x, y, z, c) => c.multiplyScalar(0.88 + 0.12 * Math.sin(Math.atan2(z, x) * 30 + y * 6)));
  b.cone(0xe2bd6a, 1.3, 0.8, [0, 3.55, 0], [0, Math.PI / 4, 0], 4, [1, 1, 0.8]);
  const p = new Poly();
  // striped awning over the counter
  stripes(p, [-1.4, 2.35, 0.95], [1.4, 2.35, 0.95], [-1.4, 2.0, 1.6], [1.4, 2.0, 1.6], 8, colA, 0xfff4dc);
  valance(p, [-1.4, 2.0, 1.6], [1.4, 2.0, 1.6], 8, 0.2, colA, 0xfff4dc);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = 1.5;
    const q: V3 = [Math.cos(a) * rr, 2.42, Math.sin(a) * rr * 0.8];
    p.tri([q[0] - 0.18, q[1], q[2]], [q[0] + 0.18, q[1], q[2]], [q[0], q[1] - 0.3, q[2]], 0xc49c48, 0.8);
  }
  b.raw(p.build());
  // stools, a tiki mask post and a pineapple on the bar
  for (const x of [-0.8, 0, 0.8]) {
    b.tubeOpen(0x6b4423, 0.05, 0.06, 0.6, [x, 0.3, 1.25], [0, 0, 0], 4);
    b.cyl(colA, 0.2, 0.2, 0.08, [x, 0.62, 1.25], [0, 0, 0], 7);
  }
  b.cyl(0x7a4a22, 0.22, 0.24, 1.6, [1.7, 0.8, 0.7], [0, 0, 0], 7);
  b.box(0x2a1a10, 0.3, 0.1, 0.05, [1.7, 1.15, 0.92]);
  b.box(0xffd23a, 0.08, 0.08, 0.05, [1.62, 1.3, 0.93]);
  b.box(0xffd23a, 0.08, 0.08, 0.05, [1.78, 1.3, 0.93]);
  b.sphere(0xffb020, 0.13, [-0.6, 1.24, 0.55], [1, 1.3, 1], 6);
  b.cone(0x3dae4f, 0.08, 0.2, [-0.6, 1.47, 0.55], [0, 0, 0], 4);
  return addWind(b.build(), (x, y, z) => (y < 2.2 && y > 1.7 && z > 1.4 ? -0.02 : 0));
}

/** An outrigger canoe pulled up on the sand. */
export function outrigger(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(col, 0.5, [0, 0.22, 0], [0.55, 0.42, 3.6], 9).paint((x, y, z, c) => {
    if (y > 0.33) c.set(0xfff4dc);
  });
  b.sphere(0x3a2414, 0.24, [0, 0.38, 0], [0.75, 0.25, 5.4], 6);
  b.sphere(0xd8c8a8, 0.18, [1.3, 0.1, 0], [0.7, 0.6, 9], 6);
  for (const z of [-0.6, 0.6]) b.segOpen(0x8a5a2b, [0, 0.42, z], [1.3, 0.22, z], 0.03, 0.03, 4);
  b.tubeOpen(0xb98550, 0.025, 0.025, 2.0, [-0.1, 0.45, -0.3], [Math.PI / 2, 0.2, 0], 4);
  b.sphere(0xb98550, 0.1, [-0.3, 0.45, 0.65], [1, 0.25, 1.8], 5, [0, 0.2, 0]);
  return b.build();
}

/** Cross-bracing for a pier piling pair (sunk into the water). */
export function pilingBraces(span: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.segOpen(0x5a3a1c, [0, -0.05, -span / 2], [0, -1.6, span / 2], 0.05, 0.05, 4);
  b.segOpen(0x5a3a1c, [0, -0.05, span / 2], [0, -1.6, -span / 2], 0.05, 0.05, 4);
  b.box(0x5a3a1c, 0.12, 0.14, span, [0, -0.12, 0]);
  return b.build();
}
