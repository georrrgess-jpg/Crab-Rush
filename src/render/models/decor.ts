/**
 * Crab Cove decorations (UPDATE3_PLAN.md §6.1): one merged geometry per decoration (one draw call
 * each), mostly composed from the beach props, plus a few Cove-only pieces. Each fits a ~2.4 m plot.
 */
import * as THREE from 'three';
import { GeoBuilder, mergeAll, translated } from '../geo';
import * as P from '../props';
import * as O from './obstacles';

const T = translated;

function flowerBed(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x8a5a34, 0.9, 1.0, 0.25, [0, 0.12, 0], [0, 0, 0], 14);
  b.cyl(0x5a3a1e, 0.82, 0.82, 0.05, [0, 0.26, 0], [0, 0, 0], 14);
  const cols = [0xff5a8a, 0xffd23a, 0xff8a3a, 0xb07ae0, 0xffffff];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39;
    const r = 0.25 + (i % 3) * 0.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    b.cyl(0x3dae5a, 0.025, 0.025, 0.4, [x, 0.45, z], [0, 0, 0], 4);
    b.sphere(cols[i % cols.length] as number, 0.13, [x, 0.68, z], [1, 0.6, 1], 6);
    b.sphere(0xffe27a, 0.05, [x, 0.74, z], [1, 1, 1], 4);
  }
  return b.build();
}

function flamingo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x333333, 0.02, 0.02, 1.1, [0, 0.55, 0], [0, 0, 0], 4);
  b.cyl(0x333333, 0.02, 0.02, 0.6, [0.08, 0.9, 0], [0, 0, 0.9], 4);
  b.sphere(0xff7aa8, 0.38, [0, 1.35, 0], [1.3, 0.85, 0.85], 12);
  b.tube(0xff7aa8, [[0.4, 1.4, 0], [0.55, 1.85, 0], [0.42, 2.2, 0], [0.3, 2.15, 0]], (t) => 0.08 - t * 0.02, 6, 10, true);
  b.sphere(0xff7aa8, 0.12, [0.3, 2.2, 0], [1, 1, 1], 8);
  b.cone(0x222222, 0.05, 0.16, [0.18, 2.14, 0], [0, 0, Math.PI / 2 + 0.6], 6);
  b.sphere(0xffffff, 0.035, [0.34, 2.26, 0.08], [1, 1, 1], 5);
  return b.build();
}

function rockPool(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.ico(i % 2 ? 0x9a948a : 0x8a847a, 0.32, [Math.cos(a) * 0.9, 0.18, Math.sin(a) * 0.7], [1.2, 0.8, 1], 1, 0.12, i + 3);
  }
  b.cyl(0x3fc6d8, 0.85, 0.85, 0.05, [0, 0.12, 0], [0, 0, 0], 18, [1, 1, 0.8]);
  return mergeAll([b.build(), T(P.starfish(0xff7a3a), 0.3, 0.16, 0.1, 0.5, 0.6), T(P.coral(5), -0.35, 0.1, -0.15, 0, 0.35)]);
}

function treasureChest(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0xe09440, 1.1, 0.6, 0.7, [0, 0.3, 0]);
  b.cyl(0xc9782e, 0.35, 0.35, 1.1, [0, 0.62, -0.05], [0, 0, Math.PI / 2], 10, [1, 1, 1]);
  for (const x of [-0.35, 0.35]) b.box(0xffd23a, 0.08, 0.98, 0.74, [x, 0.48, 0]);
  b.box(0xffd23a, 0.18, 0.2, 0.04, [0, 0.52, 0.36]);
  // spilling gold
  for (let i = 0; i < 7; i++) b.cyl(0xffc93a, 0.08, 0.08, 0.025, [Math.cos(i * 1.7) * 0.6, 0.02 + (i % 3) * 0.03, 0.55 + Math.sin(i * 1.3) * 0.2], [0.3, 0, 0], 8);
  b.sphere(0xffd23a, 0.22, [0, 0.88, 0.05], [1.4, 0.5, 0.9], 8);
  return b.build();
}

function crabStatue(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0xd8c8a8, 0.65, 0.75, 0.5, [0, 0.25, 0], [0, 0, 0], 12);
  b.sphere(0xf0e2c0, 0.55, [0, 0.95, 0], [1.2, 0.75, 0.9], 14);
  for (const s of [-1, 1]) {
    b.tube(0xf0e2c0, [[s * 0.5, 1.0, 0.1], [s * 0.85, 1.35, 0.25], [s * 0.85, 1.7, 0.2]], 0.09, 6, 8, true);
    b.sphere(0xf0e2c0, 0.2, [s * 0.85, 1.85, 0.2], [1, 1.2, 0.8], 8);
    b.cyl(0xf0e2c0, 0.04, 0.05, 0.35, [s * 0.18, 1.35, 0.25], [0, 0, 0], 5);
    b.sphere(0xf0e2c0, 0.1, [s * 0.18, 1.55, 0.27], [1, 1, 1], 6);
  }
  return b.build();
}

function lighthouse(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const h = 2.6;
  b.cyl(0xffffff, 0.35, 0.6, h, [0, h / 2, 0], [0, 0, 0], 14).paint((x, y, z, c) => {
    if (Math.floor(y / 0.45) % 2 === 1) c.setHex(0xe8402f);
  });
  b.cyl(0x2a3a5a, 0.42, 0.42, 0.1, [0, h + 0.05, 0], [0, 0, 0], 14);
  b.cyl(0xfff3b0, 0.28, 0.28, 0.35, [0, h + 0.27, 0], [0, 0, 0], 12);
  b.cone(0xe8402f, 0.42, 0.4, [0, h + 0.65, 0], [0, 0, 0], 14);
  return b.build();
}

function shellArch(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.tube(0xf2e6d0, [[-1.0, 0, 0], [-1.0, 1.4, 0], [0, 2.2, 0], [1.0, 1.4, 0], [1.0, 0, 0]], 0.14, 8, 20, true);
  const cols = [0xff9ab0, 0xffd23a, 0x9ad8ff, 0xffffff];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const a = Math.PI * t;
    b.sphere(cols[i % 4] as number, 0.14, [-Math.cos(a) * 1.0, Math.sin(a) * 0.9 + 1.25 * (1 - Math.abs(Math.cos(a)) * 0.2), 0.12], [1, 0.8, 0.6], 6);
  }
  return b.build();
}

function fountain(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0xe8e0f0, 0.95, 1.05, 0.35, [0, 0.17, 0], [0, 0, 0], 18);
  b.cyl(0x7ad0f0, 0.85, 0.85, 0.05, [0, 0.33, 0], [0, 0, 0], 18);
  b.cyl(0xe8e0f0, 0.15, 0.2, 0.9, [0, 0.75, 0], [0, 0, 0], 10);
  b.lathe(0xf4eefa, [[0, 0], [0.45, 0.05], [0.55, 0.2], [0.5, 0.25]], 16, [0, 1.15, 0]);
  b.sphere(0xf8f2ff, 0.22, [0, 1.55, 0], [1, 1, 1], 12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.sphere(0xb8e8ff, 0.06, [Math.cos(a) * 0.5, 1.25, Math.sin(a) * 0.5], [1, 1.6, 1], 5);
  }
  return b.build();
}

function rainbowKite(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0x8a5a34, 0.04, 0.05, 1.2, [0, 0.6, 0], [0, 0, 0], 5);
  const cols = [0xff5a4a, 0xffb02a, 0xffe14a, 0x3fbf55, 0x4aa8ff, 0x9a6ad8];
  cols.forEach((c, i) => b.box(c, 0.9, 0.13, 0.04, [0.2, 2.5 - i * 0.13, 0], [0, 0, 0.25]));
  b.tube(0xffffff, [[0, 1.2, 0], [0.1, 1.7, 0.05], [0.15, 2.0, 0]], 0.01, 3, 6, false);
  for (let i = 0; i < 4; i++) b.box(cols[i] as number, 0.12, 0.08, 0.02, [-0.1 - i * 0.12, 1.75 - i * 0.18, 0], [0, 0, 0.6]);
  return b.build();
}

function lanternString(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (const x of [-1, 1]) b.cyl(0x8a5a34, 0.05, 0.06, 2.0, [x, 1.0, 0], [0, 0, 0], 6);
  b.tube(0x333333, [[-1, 1.95, 0], [-0.5, 1.7, 0], [0, 1.62, 0], [0.5, 1.7, 0], [1, 1.95, 0]], 0.012, 3, 12, false);
  const geos = [b.build()];
  [0xffd23a, 0xff7aa2, 0x7ad0ff, 0xb0ff8a].forEach((c, i) => geos.push(T(P.lantern(c), -0.6 + i * 0.4, 1.45 - Math.sin((i + 0.5) / 4 * Math.PI) * 0.08, 0, 0, 0.6)));
  return mergeAll(geos);
}

function palmPair(): THREE.BufferGeometry {
  return mergeAll([T(P.palm(3, 3.2, 0.6), -0.4, 0, 0, 0, 0.6), T(P.palm(9, 2.6, -0.5), 0.5, 0, 0.2, 2.2, 0.55)]);
}

function tikiHut(): THREE.BufferGeometry {
  return T(P.hut(), 0, 0, 0, 0, 0.75);
}

/** Geometry for a decoration id (cached by the caller). */
export function decorGeometry(id: string): THREE.BufferGeometry {
  switch (id) {
    case 'starfish': return P.starfishCluster(4);
    case 'bucket': return T(P.bucketSpade(0xff5a4a), 0, 0, 0, 0.4, 1.1);
    case 'flowers': return flowerBed();
    case 'chair': return T(P.deckChair(0), 0, 0, 0, 0.5, 0.9);
    case 'ball': return T(O.beachBall(), 0, 0.55, 0, 0, 0.85);
    case 'bench': return T(P.bench(), 0, 0, 0, 0, 0.9);
    case 'torches': return mergeAll([T(P.tikiTorch(), -0.6, 0, 0), T(P.tikiTorch(), 0.6, 0, 0), T(P.flame(), -0.6, 0, 0), T(P.flame(), 0.6, 0, 0)]);
    case 'surfboards': return T(P.surfboards(), 0, 0, 0, 0.3, 0.8);
    case 'castle': return T(O.sandcastle(1), 0, 0, 0, 0, 0.75);
    case 'net': return T(P.fishingNet(), 0, 0, 0, 0, 0.7);
    case 'hammock': return T(P.hammock(), 0, 0, 0, 0.4, 0.55);
    case 'bonfire': return mergeAll([T(P.bonfireLogs(), 0, 0, 0, 0, 0.9), T(P.bonfireFlame(), 0, 0, 0, 0, 0.9)]);
    case 'rockpool': return rockPool();
    case 'lifeguard': return T(P.lifeguardTower(), 0, 0, 0, 0.4, 0.5);
    case 'flamingo': return flamingo();
    case 'palms': return palmPair();
    case 'chest': return treasureChest();
    case 'statue': return crabStatue();
    case 'lighthouse': return lighthouse();
    case 'tiki': return tikiHut();
    case 'arch': return shellArch();
    case 'lanterns': return lanternString();
    case 'fountain': return fountain();
    case 'rainbow': return rainbowKite();
    default: return new THREE.BoxGeometry(0.5, 0.5, 0.5);
  }
}
