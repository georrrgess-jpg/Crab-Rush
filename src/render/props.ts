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

/** `lo`: background palms (fewer trunk rings, coarser fronds, no coconuts). */
export function palm(seed: number, h = 6, lean = 1.2, trunkCol: number = PALETTE.palmTrunk, leafA: number = PALETTE.palmLeaf, leafB: number = PALETTE.palmLeafDark, lo = false): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const segs = lo ? 4 : 7;
  let prev: V3 = [0, 0, 0];
  const curve = (t: number): V3 => [lean * t * t, h * t, lean * 0.3 * t * t];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = curve(t);
    const light = new THREE.Color(trunkCol).multiplyScalar(i % 2 === 0 ? 1.12 : 0.92).getHex();
    b.seg(light, prev, p, 0.24 - t * 0.08, 0.26 - (t - 1 / segs) * 0.08, lo ? 5 : 6);
    prev = p;
  }
  const top = curve(1);
  if (!lo) b.sphere(0x8a5a2b, 0.22, top, [1, 0.7, 1], 7);
  const n = 7 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + r() * 0.4;
    b.raw(frond([top[0], top[1] + 0.05, top[2]], yaw, 2.2 + r() * 0.8, 1.4 + r() * 0.6, 0.42, i % 2 ? leafA : leafB, i % 2 ? leafB : leafA, lo ? 3 : 6));
  }
  for (let i = 0; i < (lo ? 0 : 3); i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.sphere(0x6b4423, 0.16, [top[0] + Math.cos(a) * 0.22, top[1] - 0.18, top[2] + Math.sin(a) * 0.22], [1, 1, 1], 6);
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

export function umbrella(colA: number, colB: number, tilt = 0.15): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const top: V3 = [Math.sin(tilt) * 2.4, Math.cos(tilt) * 2.4, 0];
  b.seg(0xf2efe6, [0, 0, 0], top, 0.04, 0.04, 6);
  const c = canopy(colA, colB, 1.5, 0.55);
  c.rotateZ(-tilt);
  c.translate(top[0], top[1] - 0.25, top[2]);
  b.raw(c);
  b.sphere(colA, 0.08, [top[0] + Math.sin(tilt) * 0.35, top[1] + 0.32, 0], [1, 1, 1], 6);
  // the canopy rim ripples in the breeze
  return addWind(b.build(), (x, y, z) => (y > 1.9 && Math.hypot(x - top[0], z) > 0.9 ? -0.025 : 0));
}

export function towel(colA: number, colB: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < 5; i++) b.box(i % 2 ? colA : colB, 1.0, 0.03, 0.36, [0, 0.02, -0.72 + i * 0.36]);
  return b.build();
}

export function rock(seed: number, size = 1, col = 0x9a948a): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  b.ico(col, 0.6 * size, [0, 0.25 * size, 0], [1.2, 0.7, 1.0], 1, 0.22, seed);
  if (r() > 0.4) b.ico(new THREE.Color(col).multiplyScalar(1.12).getHex(), 0.35 * size, [0.5 * size, 0.15 * size, 0.3 * size], [1, 0.7, 1], 0, 0.2, seed + 3);
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
  const b = new GeoBuilder();
  b.torus(0xe53935, 0.32, 0.12, [0, 0.12, 0], [Math.PI / 2, 0, 0], 12);
  b.torus(0xffffff, 0.32, 0.125, [0, 0.12, 0], [Math.PI / 2, 0, Math.PI / 4], 4);
  return b.build();
}

// --------------------------------------------------------------- zone 2: cove
export function cliff(seed: number): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const cols = [0x9b8577, 0x8a7466, 0xa89382, 0x7d6a5c];
  for (let i = 0; i < 6; i++) {
    const s = 1.6 + r() * 1.8;
    b.ico(cols[i % 4] as number, s, [(r() - 0.5) * 5, s * 0.8 + i * 0.6, (r() - 0.5) * 7], [1.1, 1.3 + r() * 0.6, 1.1], 1, 0.25, seed + i * 7);
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
export function tikiTorch(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x6b4423, 0.06, 0.08, 2.2, [0, 1.1, 0], [0, 0, 0], 6);
  b.cyl(0x3a2414, 0.16, 0.1, 0.3, [0, 2.3, 0], [0, 0, 0], 8);
  for (let i = 0; i < 3; i++) b.torus(0xd9b15e, 0.085, 0.02, [0, 0.8 + i * 0.4, 0], [Math.PI / 2, 0, 0], 8);
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
  b.torus(new THREE.Color(col).multiplyScalar(0.8).getHex(), 0.2, 0.02, [0, 0.28, 0], [Math.PI / 2, 0, 0], 12);
  b.torus(0xf2f2f2, 0.19, 0.012, [0, 0.33, 0], [0, 0, 0], 10, [1, 1, 1]);
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

export function lifeguardTower(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wood = 0xf4f0e6;
  for (const x of [-0.8, 0.8]) for (const z of [-0.7, 0.7]) b.cyl(wood, 0.07, 0.08, 2.4, [x * 0.8, 1.2, z * 0.8], [z * 0.08, 0, -x * 0.08], 6);
  b.box(0xe53935, 2.0, 0.12, 1.8, [0, 2.45, 0]);
  b.box(0xfff4dc, 1.7, 1.0, 1.5, [0, 3.0, 0]);
  b.box(0x8fd0f7, 1.2, 0.45, 0.04, [0, 3.15, 0.76]);
  b.cone(0xe53935, 1.4, 0.6, [0, 3.8, 0], [0, Math.PI / 4, 0], 4);
  // ladder + red cross flag
  for (let i = 0; i < 6; i++) b.box(wood, 0.6, 0.05, 0.08, [0, 0.3 + i * 0.36, 1.25 - i * 0.07]);
  b.cyl(0x8a8a90, 0.02, 0.02, 1.0, [0.8, 4.3, -0.6], [0, 0, 0], 4);
  b.box(0xe53935, 0.5, 0.3, 0.02, [1.06, 4.65, -0.6]);
  return addWind(b.build(), (x, y) => (y > 4.45 && x > 0.82 ? -0.04 : 0));
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
