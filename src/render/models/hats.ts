import * as THREE from 'three';
import { PALETTE } from '../../config';
import { GeoBuilder } from '../geo';

/** Every hat in the wardrobe (src/meta/wardrobe.ts ids). */
export type HatKind =
  | 'none' | 'straw' | 'shades' | 'flower' | 'pirate' | 'captain' | 'tophat'
  | 'parrot' | 'sunflower' | 'beanie' | 'snorkel' | 'crown' | 'chef' | 'propeller'
  | 'flowercrown' | 'headphones' | 'bucket' | 'viking' | 'halo';

export const HAT_KINDS: readonly HatKind[] = [
  'none', 'straw', 'shades', 'flower', 'pirate', 'captain', 'tophat', 'parrot', 'sunflower', 'beanie',
  'snorkel', 'crown', 'chef', 'propeller', 'flowercrown', 'headphones', 'bucket', 'viking', 'halo',
];

export interface HatModel {
  geo: THREE.BufferGeometry | null;
  /** material family: matte clay, glossy, or gold */
  mat: 'clay' | 'gloss' | 'gold';
  /** placement in crab model space (the crab's hat bone adds wobble around this) */
  pos: [number, number, number];
  rx: number;
  /** optional spinning part (propeller), placed relative to the hat */
  spinner?: { geo: THREE.BufferGeometry; pos: [number, number, number] };
}

type V3 = [number, number, number];

/** Smooth a coarse [r, y] profile into a lathe-ready curve. */
function smooth(pts: [number, number][], n = 18): [number, number][] {
  const c = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getPoints(n).map((p) => [Math.max(0, p.x), p.y] as [number, number]);
}

const hash = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Build a hat. `detail` false = Low tier (fewer segments). */
export function buildHat(kind: HatKind, detail = true): HatModel {
  const S = detail ? 1 : 0.6;
  const seg = (n: number): number => Math.max(6, Math.round(n * S));
  const b = new GeoBuilder();
  const out = (mat: HatModel['mat'], pos: V3, rx: number): HatModel => ({ geo: b.build(), mat, pos, rx });
  switch (kind) {
    case 'none':
      return { geo: null, mat: 'clay', pos: [0, 0, 0], rx: 0 };
    case 'straw': {
      // woven brim with a slight droop, domed crown, navy band and bow
      const straw = PALETTE.strawHat;
      // traced bottom-out then top-in so both faces point outward
      b.lathe(straw, smooth([[0.0, -0.01], [0.45, -0.005], [0.74, -0.05], [0.8, -0.075], [0.78, -0.05], [0.66, 0.0], [0.45, 0.03], [0.0, 0.02]], 16), seg(28));
      b.paint((x, y, z, c) => {
        const a = Math.atan2(z, x);
        const r = Math.hypot(x, z);
        const weave = (Math.sin(a * 36) * Math.sin(r * 60)) * 0.5 + 0.5;
        c.multiplyScalar(0.9 + weave * 0.14);
      });
      b.lathe(straw, smooth([[0.47, 0.0], [0.47, 0.12], [0.44, 0.26], [0.34, 0.36], [0.18, 0.4], [0.0, 0.41]], 12), seg(22));
      b.paint((x, y, z, c) => {
        const ring = Math.sin(y * 90) * 0.5 + 0.5;
        c.multiplyScalar(0.92 + ring * 0.1);
      });
      b.cyl(PALETTE.hatBand, 0.485, 0.49, 0.1, [0, 0.07, 0], [0, 0, 0], seg(20));
      b.sphere(PALETTE.hatBand, 0.06, [0.33, 0.08, 0.35], [1.3, 1, 0.6], 8);
      b.sphere(PALETTE.hatBand, 0.06, [0.4, 0.08, 0.28], [1.3, 1, 0.6], 8);
      b.box(PALETTE.hatBand, 0.05, 0.14, 0.03, [0.37, 0.0, 0.34], [0, 0.8, 0.3]);
      return out('clay', [0, 1.01, -0.08], -0.22);
    }
    case 'shades':
      // rounded frames with gradient lenses
      for (const s of [-1, 1]) {
        b.sphere(0x1a1a24, 0.18, [s * 0.27, 0, 0], [1.05, 0.72, 0.25], seg(14));
        b.sphere(0x2a5a9a, 0.155, [s * 0.27, 0, 0.025], [1.0, 0.68, 0.2], seg(14));
        b.paint((x, y, z, c) => c.lerp(new THREE.Color(0x8fe0ff), Math.max(0, Math.min(1, (y + 0.1) * 3.5)) * 0.6));
        b.sphere(0xffffff, 0.03, [s * 0.27 - 0.06, 0.04, 0.06], [1.6, 1, 0.5], 6);
      }
      b.tube(0x1a1a24, [[-0.12, 0.03, 0.01], [0, 0.07, 0.02], [0.12, 0.03, 0.01]], 0.022, 6, 6, false);
      return out('gloss', [0, 0.9, 0.57], 0);
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.sphere(0xff4f7a, 0.17, [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [1, 0.32, 0.62], seg(10), [0, -a, 0]);
        b.paint((x, y, z, c) => c.lerp(new THREE.Color(0xffd0dc), Math.max(0, Math.hypot(x, z) - 0.22) * 3));
      }
      b.sphere(0xffd23a, 0.1, [0, 0.05, 0], [1, 0.8, 1], 8);
      b.tube(0xffe9a0, [[0.02, 0.06, 0], [0.04, 0.18, 0.02], [0.06, 0.26, 0.0]], 0.012, 4, 4, true);
      b.sphere(0x3fae5a, 0.12, [-0.2, -0.04, -0.14], [1.4, 0.25, 0.6], 8, [0, 0.6, 0]);
      return out('clay', [-0.44, 0.98, 0.0], -0.4);
    case 'pirate':
      // tricorn: three upturned brim lobes around a dome
      b.lathe(0x15151c, smooth([[0.0, 0.02], [0.5, 0.03], [0.68, 0.08], [0.72, 0.14], [0.66, 0.1], [0.45, 0.04], [0.0, 0.04]], 14), seg(3 * 6));
      b.paint((x, y, z, c) => {
        const a = Math.atan2(z, x);
        const lobe = Math.cos(a * 3) * 0.5 + 0.5;
        void lobe;
        if (Math.hypot(x, z) > 0.62) c.lerp(new THREE.Color(0xe9b53a), 0.85);
      });
      b.sphere(0x15151c, 0.45, [0, 0.12, 0], [1.15, 0.55, 0.95], seg(14));
      b.sphere(0xf2f2ee, 0.09, [0, 0.16, 0.42], [1, 1, 0.4], 8);
      b.box(0x15151c, 0.035, 0.035, 0.04, [-0.035, 0.18, 0.455]);
      b.box(0x15151c, 0.035, 0.035, 0.04, [0.035, 0.18, 0.455]);
      b.box(0xf2f2ee, 0.3, 0.04, 0.03, [0, 0.08, 0.43], [0, 0, 0.5]);
      b.box(0xf2f2ee, 0.3, 0.04, 0.03, [0, 0.08, 0.43], [0, 0, -0.5]);
      return out('clay', [0, 1.0, -0.08], -0.2);
    case 'captain':
      b.lathe(0x1f3f87, smooth([[0.5, 0.0], [0.52, 0.1], [0.56, 0.2], [0.6, 0.27], [0.58, 0.31], [0.3, 0.33], [0.0, 0.33]], 12), seg(22));
      b.paint((x, y, z, c) => {
        if (y > 0.25) c.set(0xf6f2ea);
      });
      b.lathe(0x15151c, [[0.0, -0.02], [0.45, -0.02], [0.42, 0.0], [0.0, 0.0]], seg(18), [0, 0.02, 0.22], [0.35, 0, 0], [1.1, 1, 0.75]);
      b.torus(0xe9b53a, 0.51, 0.02, [0, 0.12, 0], [Math.PI / 2, 0, 0], seg(24));
      b.cyl(0xe9b53a, 0.1, 0.1, 0.04, [0, 0.18, 0.52], [Math.PI / 2 - 0.15, 0, 0], 12);
      b.sphere(0x1f3f87, 0.05, [0, 0.18, 0.545], [1, 1, 0.4], 8);
      return out('clay', [0, 1.05, -0.05], -0.2);
    case 'tophat':
      b.lathe(0x17171f, smooth([[0.0, 0.0], [0.55, 0.0], [0.62, 0.04], [0.58, 0.05], [0.38, 0.05], [0.36, 0.3], [0.38, 0.55], [0.3, 0.56], [0.0, 0.56]], 20), seg(24));
      b.cyl(0xe03a8e, 0.385, 0.375, 0.1, [0, 0.11, 0], [0, 0, 0], seg(20));
      b.sphere(0xffd23a, 0.06, [0.37, 0.11, 0.05], [1, 1, 0.5], 8);
      b.sphere(0xffffff, 0.04, [0.33, 0.2, 0.18], [1, 1, 1], 6);
      return out('gloss', [0, 1, -0.08], -0.18);
    case 'parrot': {
      // a little parrot perched on top, looking at the camera
      b.sphere(0x2fbf4a, 0.2, [0, 0.2, 0], [0.85, 1.1, 0.8], seg(14));
      b.paint((x, y, z, c) => {
        if (z > 0.1 && y < 0.25) c.set(0xffd23a);
      });
      b.sphere(0xe8302f, 0.15, [0, 0.45, 0.05], [1, 1, 1], seg(12));
      b.cone(0xffc93a, 0.05, 0.12, [0, 0.42, 0.21], [Math.PI / 2 + 0.5, 0, 0], 8);
      for (const s of [-1, 1]) {
        b.sphere(0x1a1a24, 0.03, [s * 0.07, 0.49, 0.17], [1, 1, 0.6], 6);
        b.sphere(0x2a7ad8, 0.13, [s * 0.15, 0.17, -0.04], [0.35, 1, 0.8], 10, [0.3, 0, s * 0.2]);
        b.cyl(0x8a6a30, 0.015, 0.015, 0.1, [s * 0.06, 0.02, 0.03], [0, 0, 0], 4);
      }
      b.box(0xe8302f, 0.1, 0.32, 0.04, [0, 0.0, -0.2], [0.9, 0, 0]);
      b.box(0x2a7ad8, 0.08, 0.26, 0.03, [0, -0.02, -0.24], [1.0, 0, 0]);
      return out('clay', [0.08, 0.92, -0.12], 0);
    }
    case 'sunflower':
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        b.sphere(0xffcf2a, 0.13, [Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0], [0.45, 1, 0.18], 8, [0, 0, a - Math.PI / 2]);
        b.paint((x, y, z, c) => c.lerp(new THREE.Color(0xffa020), Math.max(0, 0.3 - Math.hypot(x, y)) * 2));
      }
      b.sphere(0x6a3a14, 0.16, [0, 0, 0.03], [1, 1, 0.35], seg(14));
      b.paint((x, y, z, c) => c.multiplyScalar(0.8 + hash(Math.round(x * 40), Math.round(y * 40), 1) * 0.4));
      b.tube(0x3fae5a, [[0, -0.15, -0.03], [0.04, -0.4, -0.06], [0.0, -0.55, -0.1]], 0.025, 5, 6, false);
      return out('clay', [-0.42, 1.05, 0.0], -0.3);
    case 'beanie': {
      b.lathe(0xe8423a, smooth([[0.5, 0.0], [0.52, 0.1], [0.5, 0.25], [0.4, 0.4], [0.22, 0.5], [0.0, 0.52]], 16), seg(22));
      b.paint((x, y, z, c) => {
        if (Math.floor(y * 14) % 3 === 0) c.set(0xffffff);
        const a = Math.atan2(z, x);
        c.multiplyScalar(0.9 + (Math.sin(a * 40) * 0.5 + 0.5) * 0.12);
      });
      b.lathe(0xd4342c, [[0.53, -0.02], [0.55, 0.06], [0.53, 0.14], [0.5, 0.14], [0.5, -0.02]], seg(22));
      b.sphere(0xffffff, 0.13, [0, 0.56, 0], [1, 1, 1], 10);
      b.paint((x, y, z, c) => c.multiplyScalar(0.88 + hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) * 0.12));
      return out('clay', [0, 1.01, -0.07], -0.2);
    }
    case 'snorkel':
      b.torus(0xff7a2a, 0.24, 0.045, [0, 0, 0], [0, 0, 0], seg(24), [1.5, 0.8, 1]);
      b.sphere(0xbfe8ff, 0.24, [0, 0, -0.01], [1.5, 0.8, 0.22], seg(16));
      b.paint((x, y, z, c) => c.lerp(new THREE.Color(0xffffff), Math.max(0, y + 0.05) * 1.6));
      b.torus(0x1a1a24, 0.52, 0.025, [0, 0.0, -0.32], [Math.PI / 2, 0, 0], seg(24), [1, 0.75, 1]);
      b.tube(0x2a8ae8, [[0.36, 0.0, -0.05], [0.44, 0.2, -0.1], [0.45, 0.5, -0.12], [0.42, 0.62, -0.08]], 0.035, 6, 10, false);
      b.cyl(0xff7a2a, 0.045, 0.045, 0.08, [0.42, 0.64, -0.08], [0, 0, 0], 8);
      return out('gloss', [0, 0.9, 0.58], 0);
    case 'crown':
      b.cyl(0xffd23a, 0.4, 0.37, 0.18, [0, 0.09, 0], [0, 0, 0], seg(20));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.cone(0xffd23a, 0.08, 0.2, [Math.cos(a) * 0.38, 0.27, Math.sin(a) * 0.38], [0, 0, 0], 6);
        b.sphere(0xfff4c0, 0.035, [Math.cos(a) * 0.38, 0.39, Math.sin(a) * 0.38], [1, 1, 1], 6);
        b.sphere(i % 2 ? 0xe8302f : 0x2a7ad8, 0.05, [Math.cos(a + 0.45) * 0.4, 0.09, Math.sin(a + 0.45) * 0.4], [1, 1, 0.5], 6, [0, -(a + 0.45) + Math.PI / 2, 0]);
      }
      return out('gold', [0, 0.99, -0.06], -0.12);
    case 'chef':
      b.cyl(0xffffff, 0.42, 0.42, 0.22, [0, 0.11, 0], [0, 0, 0], seg(20));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.sphere(0xffffff, 0.22, [Math.cos(a) * 0.22, 0.38, Math.sin(a) * 0.22], [1, 0.9, 1], seg(12));
      }
      b.sphere(0xffffff, 0.27, [0, 0.46, 0], [1, 0.9, 1], seg(12));
      b.paint((x, y, z, c) => c.multiplyScalar(0.94 + Math.min(1, y) * 0.06));
      return out('clay', [0, 0.98, -0.1], -0.15);
    case 'propeller': {
      b.lathe(0xe8302f, smooth([[0.47, 0.0], [0.46, 0.12], [0.36, 0.26], [0.18, 0.33], [0.0, 0.34]], 12), seg(16));
      b.paint((x, y, z, c) => {
        const a = Math.atan2(z, x);
        const q = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4);
        c.set([0xe8302f, 0xffd23a, 0x2a7ad8, 0x3fae5a][q % 4] as number);
      });
      b.lathe(0x2a7ad8, [[0.0, -0.02], [0.42, -0.02], [0.4, 0.0], [0.0, 0.0]], seg(14), [0, 0.03, 0.3], [0.2, 0, 0], [0.7, 1, 0.6]);
      b.cyl(0x8a8a90, 0.025, 0.025, 0.12, [0, 0.39, 0], [0, 0, 0], 6);
      const p = new GeoBuilder();
      p.sphere(0xffd23a, 0.22, [0.2, 0, 0], [1, 0.08, 0.3], 8, [0.3, 0, 0]);
      p.sphere(0x2a7ad8, 0.22, [-0.2, 0, 0], [1, 0.08, 0.3], 8, [-0.3, 0, 0]);
      p.sphere(0xe8302f, 0.04, [0, 0.01, 0], [1, 1, 1], 6);
      const m = out('clay', [0, 1.02, -0.07], -0.15);
      m.spinner = { geo: p.build(), pos: [0, 0.45, 0] };
      return m;
    }
    case 'flowercrown':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 0.44;
        b.sphere(0x3fae5a, 0.08, [Math.cos(a) * r, 0.02, Math.sin(a) * r], [1.4, 0.4, 0.7], 6, [0, -a, 0.3]);
        if (i % 2 === 0) {
          const col = [0xff6a9a, 0xffd23a, 0xffffff, 0xb07aff][(i / 2) % 4] as number;
          b.sphere(col, 0.075, [Math.cos(a + 0.2) * r, 0.07, Math.sin(a + 0.2) * r], [1, 0.6, 1], 8);
          b.sphere(0xffb020, 0.03, [Math.cos(a + 0.2) * r, 0.11, Math.sin(a + 0.2) * r], [1, 1, 1], 6);
        }
      }
      return out('clay', [0, 0.99, -0.07], -0.18);
    case 'headphones':
      b.tube(0x2a2a34, [[-0.56, 0.0, 0], [-0.46, 0.34, 0], [0, 0.5, 0], [0.46, 0.34, 0], [0.56, 0.0, 0]], 0.04, 6, 16, false);
      for (const s of [-1, 1]) {
        b.cyl(0x2a2a34, 0.17, 0.17, 0.12, [s * 0.6, -0.04, 0], [0, 0, Math.PI / 2], seg(16));
        b.cyl(0x3fd6d0, 0.13, 0.13, 0.03, [s * 0.67, -0.04, 0], [0, 0, Math.PI / 2], seg(16));
        b.sphere(0x1a1a24, 0.15, [s * 0.53, -0.04, 0], [0.4, 1, 1], 10);
      }
      return out('gloss', [0, 0.8, -0.06], -0.12);
    case 'bucket':
      b.lathe(0xc8b07a, smooth([[0.7, -0.14], [0.6, -0.06], [0.46, 0.0], [0.42, 0.2], [0.38, 0.3], [0.0, 0.31]], 14), seg(24));
      b.paint((x, y, z, c) => {
        const r = Math.hypot(x, z);
        if (r > 0.5) c.multiplyScalar(0.92 + Math.sin(r * 90) * 0.05);
      });
      b.cyl(0x6a8a4a, 0.445, 0.46, 0.07, [0, 0.04, 0], [0, 0, 0], seg(22));
      return out('clay', [0, 1.01, -0.06], -0.2);
    case 'viking':
      b.lathe(0x9aa4ae, smooth([[0.5, 0.0], [0.5, 0.1], [0.44, 0.28], [0.28, 0.4], [0.0, 0.44]], 14), seg(22));
      b.cyl(0xb88a3a, 0.52, 0.52, 0.09, [0, 0.04, 0], [0, 0, 0], seg(22));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.sphere(0xe9d27a, 0.03, [Math.cos(a) * 0.52, 0.04, Math.sin(a) * 0.52], [1, 1, 1], 6);
      }
      for (const s of [-1, 1]) {
        b.tube(0xf4ead2, [[s * 0.4, 0.2, 0], [s * 0.66, 0.34, 0], [s * 0.74, 0.62, 0.02]], (t) => 0.1 * (1 - t) + 0.015, 8, 10, false);
        b.paint((x, y, z, c) => c.lerp(new THREE.Color(0xb8a888), Math.max(0, y - 0.45) * 2.5));
      }
      return out('gloss', [0, 1.01, -0.06], -0.15);
    case 'halo':
      b.torus(0xffe27a, 0.34, 0.05, [0, 0, 0], [Math.PI / 2, 0, 0], seg(28));
      return out('gold', [0, 1.38, -0.04], -0.15);
  }
}

/** Hat dyes (UPDATE3_PLAN.md §5.2): 0 = original, 1..3 rotate the hue of every coloured part. */
export const DYE_SHIFTS = [0, 0.33, 0.58, 0.8] as const;
export function dyeHat(geo: THREE.BufferGeometry, dye: number): THREE.BufferGeometry {
  const shift = DYE_SHIFTS[dye] ?? 0;
  if (!shift) return geo;
  const col = geo.attributes.color as THREE.BufferAttribute | undefined;
  if (!col) return geo;
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    c.getHSL(hsl);
    // greys, whites and blacks stay as they are; only coloured parts change
    if (hsl.s < 0.18) continue;
    c.setHSL((hsl.h + shift) % 1, hsl.s, hsl.l);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return geo;
}
