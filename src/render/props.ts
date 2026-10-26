import * as THREE from 'three';
import { PALETTE } from '../config';
import { GeoBuilder } from './geo';

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

/** A palm frond: a drooping double-sided strip. */
function frond(base: V3, yaw: number, len: number, droop: number, width: number, colA: number, colB: number): THREE.BufferGeometry {
  const n = 6;
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

export function palm(seed: number, h = 6, lean = 1.2, trunkCol: number = PALETTE.palmTrunk, leafA: number = PALETTE.palmLeaf, leafB: number = PALETTE.palmLeafDark): THREE.BufferGeometry {
  const r = prng(seed);
  const b = new GeoBuilder();
  const segs = 7;
  let prev: V3 = [0, 0, 0];
  const curve = (t: number): V3 => [lean * t * t, h * t, lean * 0.3 * t * t];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = curve(t);
    const light = new THREE.Color(trunkCol).multiplyScalar(i % 2 === 0 ? 1.12 : 0.92).getHex();
    b.seg(light, prev, p, 0.24 - t * 0.08, 0.26 - (t - 1 / segs) * 0.08, 7);
    prev = p;
  }
  const top = curve(1);
  b.sphere(0x8a5a2b, 0.22, top, [1, 0.7, 1], 8);
  const n = 7 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + r() * 0.4;
    b.raw(frond([top[0], top[1] + 0.05, top[2]], yaw, 2.2 + r() * 0.8, 1.4 + r() * 0.6, 0.42, i % 2 ? leafA : leafB, i % 2 ? leafB : leafA));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.sphere(0x6b4423, 0.16, [top[0] + Math.cos(a) * 0.22, top[1] - 0.18, top[2] + Math.sin(a) * 0.22], [1, 1, 1], 8);
  }
  return b.build();
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
  return b.build();
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
  const b = new GeoBuilder();
  b.box(0xc9955a, 2.2, 1.6, 2.0, [0, 0.8, 0]);
  b.box(0x7a5530, 0.6, 1.0, 0.05, [0.3, 0.5, 1.01]);
  b.cone(0xd9b15e, 1.9, 1.5, [0, 2.3, 0], [0, Math.PI / 4, 0], 4, [1, 1, 1]);
  b.cone(0xc49c48, 1.95, 0.2, [0, 1.62, 0], [0, Math.PI / 4, 0], 4);
  for (const x of [-1.05, 1.05]) for (const z of [-0.95, 0.95]) b.cyl(0x8a5a2b, 0.08, 0.08, 1.7, [x, 0.85, z], [0, 0, 0], 5);
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
  return b.build();
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
  return b.build();
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
  const b = new GeoBuilder();
  b.box(0xfff4dc, 2.4, 1.3, 1.8, [0, 0.65, 0]);
  b.box(0xd9b15e, 2.5, 0.1, 1.9, [0, 1.35, 0]);
  for (let i = 0; i < 6; i++) b.box(i % 2 ? colA : colB, 0.42, 0.06, 1.2, [-1.05 + i * 0.42, 2.0, 0.8], [0.45, 0, 0]);
  for (const x of [-1.15, 1.15]) b.cyl(0xffffff, 0.05, 0.05, 1.0, [x, 1.85, 0.4], [0, 0, 0], 5);
  b.box(0xfff4dc, 2.4, 0.9, 0.1, [0, 1.9, -0.85]);
  b.box(colA, 2.0, 0.35, 0.06, [0, 2.15, -0.79]);
  return b.build();
}

export function boat(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(col, 1.0, [0, 0.15, 0], [0.75, 0.38, 1.9], 12);
  b.box(0xfff4dc, 1.0, 0.1, 2.6, [0, 0.42, 0]);
  b.cyl(0x8a5a2b, 0.05, 0.05, 2.6, [0, 1.6, 0.2], [0, 0, 0], 5);
  b.cone(0xffffff, 0.8, 2.2, [0.05, 1.7, -0.2], [0, Math.PI / 2, 0], 3, [0.08, 1, 1]);
  return b.build();
}

export function buoy(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.torus(0xe53935, 0.32, 0.12, [0, 0.12, 0], [Math.PI / 2, 0, 0], 12);
  b.torus(0xffffff, 0.32, 0.125, [0, 0.12, 0], [Math.PI / 2, 0, Math.PI / 4], 4);
  return b.build();
}

export function crateStack(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0xb98550, 1.2, 1.0, 1.0, [-0.35, 0.5, 0]);
  b.box(0xc9955a, 1.0, 0.9, 0.9, [0.45, 0.45, 0.1], [0, 0.2, 0]);
  b.box(0xa8743f, 0.9, 0.85, 0.9, [0.0, 1.42, 0], [0, -0.15, 0]);
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
  return b.build();
}

export function urchins(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const spots: V3[] = [[-0.55, 0, 0.05], [0.1, 0, -0.1], [0.65, 0, 0.12], [-0.1, 0, 0.25]];
  for (const [x, , z] of spots) {
    b.sphere(0x5a2f7a, 0.24, [x, 0.22, z], [1, 0.85, 1], 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const up = (i % 3) * 0.3 + 0.2;
      b.seg(0x2a1640, [x, 0.25, z], [x + Math.cos(a) * 0.45, 0.25 + up * 0.5, z + Math.sin(a) * 0.45], 0.035, 0.005, 3);
    }
  }
  return b.build();
}

export function boulder(seed = 11): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.ico(0x9b8577, 1.0, [0, 0.95, 0], [1.0, 1.15, 0.75], 1, 0.18, seed);
  b.ico(0x8a7466, 0.55, [0.5, 0.45, 0.25], [1, 0.9, 1], 1, 0.2, seed + 1);
  b.sphere(0xff7a3a, 0.2, [-0.2, 1.5, 0.58], [1, 1, 0.3], 5);
  b.sphere(0x4cbc5c, 0.5, [0, 2.0, 0], [1.4, 0.25, 1], 8);
  return b.build();
}

export function deckChair(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < 5; i++) b.box(i % 2 ? 0x2f6fd6 : 0xffffff, 0.4, 0.06, 0.55, [-0.8 + i * 0.4, 0.42, 0], [0, 0, 0]);
  b.box(0x8a5a2b, 2.0, 0.08, 0.08, [0, 0.38, 0.28]);
  b.box(0x8a5a2b, 2.0, 0.08, 0.08, [0, 0.38, -0.28]);
  for (const x of [-0.85, 0.85]) for (const z of [-0.26, 0.26]) b.cyl(0x8a5a2b, 0.04, 0.04, 0.4, [x, 0.2, z], [0, 0, 0], 4);
  b.box(0x2f6fd6, 0.08, 0.5, 0.55, [-0.95, 0.68, 0], [0, 0, 0.35]);
  return b.build();
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
  return b.build();
}

export function lantern(col: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(col, 0.16, [0, 0, 0], [1, 1.2, 1], 8);
  return b.build();
}
