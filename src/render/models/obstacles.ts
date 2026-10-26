import * as THREE from 'three';
import { CFG, PALETTE } from '../../config';
import { GeoBuilder } from '../geo';
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

// ------------------------------------------------------------------ zone 0 (Sunny Shore)
export function sandcastle(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // base wall
  b.cyl(SAND[0] as number, 0.82, 0.92, 0.9, [0, 0.45, 0], [0, 0, 0], 14);
  b.cyl(SAND[1] as number, 0.95, 0.98, 0.12, [0, 0.06, 0], [0, 0, 0], 14);
  // crenellations around the base wall
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(SAND[2] as number, 0.26, 0.2, 0.2, [Math.cos(a) * 0.8, 1.0, Math.sin(a) * 0.8], [0, -a, 0]);
  }
  // keep (central tower)
  b.cyl(SAND[2] as number, 0.46, 0.55, 0.9, [0, 1.3, 0], [0, 0, 0], 12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(SAND[0] as number, 0.2, 0.2, 0.16, [Math.cos(a) * 0.44, 1.85, Math.sin(a) * 0.44], [0, -a, 0]);
  }
  // corner turrets
  for (const [x, z] of [[-0.72, -0.35], [0.72, -0.35], [-0.6, 0.55], [0.6, 0.55]] as const) {
    b.cyl(SAND[3] as number, 0.2, 0.25, 1.2, [x, 0.6, z], [0, 0, 0], 8);
    b.cone(0xd9573a, 0.28, 0.35, [x, 1.35, z], [0, 0, 0], 8);
  }
  // door + windows
  b.box(0x8a5a2b, 0.3, 0.42, 0.1, [0, 0.25, 0.9]);
  b.cyl(0x8a5a2b, 0.15, 0.15, 0.1, [0, 0.46, 0.9], [Math.PI / 2, 0, 0], 8);
  b.box(0x6d4724, 0.12, 0.18, 0.08, [0, 1.3, 0.5]);
  // flag
  b.cyl(0x7a5530, 0.025, 0.025, 0.8, [0, 2.3, 0], [0, 0, 0], 6);
  b.box(0xe53935, 0.42, 0.24, 0.03, [0.23, 2.5, 0]);
  return b.build();
}

export function driftwoodLog(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const bark = 0xa8743f;
  b.cyl(bark, 0.3, 0.34, 2.0, [0, 0.3, 0], [0, 0, Math.PI / 2], 12);
  b.cyl(0xc9955a, 0.2, 0.2, 2.02, [0, 0.3, 0], [0, 0, Math.PI / 2], 8);
  // end rings
  b.cyl(0xe2bd8a, 0.28, 0.28, 0.04, [1.0, 0.3, 0], [0, 0, Math.PI / 2], 12);
  b.cyl(0xe2bd8a, 0.32, 0.32, 0.04, [-1.0, 0.3, 0], [0, 0, Math.PI / 2], 12);
  b.cyl(0xb98550, 0.16, 0.16, 0.05, [1.0, 0.3, 0], [0, 0, Math.PI / 2], 10);
  // stubs & knot
  b.cyl(bark, 0.07, 0.1, 0.28, [-0.4, 0.58, 0.05], [0.2, 0, 0.3], 6);
  b.cyl(bark, 0.06, 0.09, 0.22, [0.5, 0.55, -0.08], [-0.3, 0, -0.2], 6);
  b.sphere(0x7d5129, 0.1, [0.1, 0.4, 0.28], [1, 1, 0.6], 6);
  return b.build();
}

/** Wave sweep: curved crest swept across all lanes, painted chevrons cue the hop. */
export function waveSweep(): THREE.BufferGeometry {
  const W = 6.8;
  // cross-section profile in (z, y): front lip rising to a curled crest and falling at the back
  const prof: [number, number, number][] = [
    // z, y, foam(0..1)
    [0.75, 0.0, 0.2],
    [0.6, 0.18, 0.1],
    [0.4, 0.45, 0.0],
    [0.2, 0.72, 0.0],
    [0.0, 0.9, 0.35],
    [-0.22, 0.88, 1.0],
    [-0.45, 0.62, 0.8],
    [-0.7, 0.28, 0.5],
    [-0.8, 0.0, 0.8],
  ];
  const segs = 28;
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
      pos.push(x, y * (1 + ripple) + (y > 0.05 ? Math.sin(u * 17 + z * 4) * 0.025 : 0), z);
      c.copy(deep).lerp(mid, Math.min(1, y / 0.5)).lerp(shallow, Math.max(0, (y - 0.4) / 0.5) * 0.7).lerp(foam, f * (0.75 + 0.25 * Math.sin(u * 40)));
      col.push(c.r, c.g, c.b);
    }
  }
  const n = prof.length;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + 1;
      const c2 = a + n;
      const d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // end caps are skipped: the wave spans wider than the track edges, and the fog hides the ends.

  // chevron markers laid on the water in front of the crest
  const cb = new GeoBuilder();
  for (const x of [-1.8, 0, 1.8]) {
    for (let k = 0; k < 2; k++) {
      const z = 0.95 + k * 0.5;
      cb.box(0xfff1a8, 0.62, 0.05, 0.14, [x - 0.28, 0.06, z], [0, -0.7, 0]);
      cb.box(0xfff1a8, 0.62, 0.05, 0.14, [x + 0.28, 0.06, z], [0, 0.7, 0]);
    }
  }
  const chev = cb.build();
  const merged = new GeoBuilder();
  merged.geo(g, 0xffffff);
  merged.geo(chev, 0xffffff);
  void merged;
  return mergeVC(g, chev);
}

function mergeVC(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const A = a.index ? a.toNonIndexed() : a;
  const B = b.index ? b.toNonIndexed() : b;
  const n = A.attributes.position!.count + B.attributes.position!.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const aa = A.attributes[name] as THREE.BufferAttribute;
    const bb = B.attributes[name] as THREE.BufferAttribute;
    const arr = new Float32Array(n * 3);
    arr.set(aa.array as Float32Array, 0);
    arr.set(bb.array as Float32Array, aa.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}

export function beachBall(): THREE.BufferGeometry {
  const r = 0.58;
  const g = new THREE.SphereGeometry(r, 20, 14);
  const pa = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pa.count * 3);
  const palette = [0xe53935, 0xffffff, 0x2f6fd6, 0xffffff, 0xffc933, 0xffffff].map((h) => new THREE.Color(h));
  const cap = new THREE.Color(0xffffff);
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    const z = pa.getZ(i);
    const ang = Math.atan2(z, x) + Math.PI;
    const sector = Math.floor((ang / (Math.PI * 2)) * 6) % 6;
    const c = Math.abs(y) > r * 0.9 ? cap : (palette[sector] as THREE.Color);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 0, 0);
  // rolling axis is x, so rotate the poles onto the x axis
  g.rotateZ(Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

export function gullBody(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xfafafa, 0.48, [0, 0.8, 0], [1.0, 0.85, 1.25], 14);
  b.sphere(0xe9eef2, 0.4, [0, 0.62, 0.1], [1.0, 0.7, 1.1], 10);
  b.sphere(0xfafafa, 0.27, [0, 1.38, 0.28], [1, 1.05, 1], 12);
  b.cone(0xff9a1f, 0.09, 0.34, [0, 1.34, 0.62], [Math.PI / 2, 0, 0], 8);
  b.sphere(0x14141c, 0.045, [-0.14, 1.44, 0.46], [1, 1, 1], 6);
  b.sphere(0x14141c, 0.045, [0.14, 1.44, 0.46], [1, 1, 1], 6);
  b.box(0x8a93a0, 0.5, 0.08, 0.5, [0, 0.82, -0.52], [0.3, 0, 0]);
  b.cyl(0xff9a1f, 0.035, 0.04, 0.35, [-0.15, 0.17, 0.05], [0, 0, 0], 6);
  b.cyl(0xff9a1f, 0.035, 0.04, 0.35, [0.15, 0.17, 0.05], [0, 0, 0], 6);
  b.box(0xff9a1f, 0.22, 0.04, 0.2, [-0.15, 0.02, 0.1]);
  b.box(0xff9a1f, 0.22, 0.04, 0.2, [0.15, 0.02, 0.1]);
  return b.build();
}

export function gullWing(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xdfe6ec, 0.3, [0.38, 0, 0], [1.6, 0.18, 0.7], 10);
  b.sphere(0x8a93a0, 0.2, [0.78, 0, -0.03], [1.5, 0.15, 0.6], 8);
  b.sphere(0x2a2f38, 0.1, [1.05, 0, -0.05], [1.2, 0.15, 0.5], 6);
  return b.build();
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
