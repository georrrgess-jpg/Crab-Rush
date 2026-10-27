/**
 * Claw guard: keeps the claws out of the eyes and the hat whatever the animation or the hat.
 * Collision is done in the body bone's frame: the claws, eyes and hat bone are all its children.
 *
 * - Claw samples: a few dozen surface points of each forearm and pincer, picked once per build.
 * - Obstacles: eyeballs and eye stalks (spheres on the eye bones) and the hat, voxelised into spheres.
 * - Each frame a tiny solver nudges shoulder raise / swing / elbow until the samples clear the
 *   obstacles. The correction is warm-started and eased back out, so contact reads as a touch.
 */
import * as THREE from 'three';

/** sample point radius: vertices are spread a few centimetres apart over the claw */
export const CLAW_R = 0.035;
const CELL = 0.1;

/** Farthest-point sampling of up to `n` points (flat xyz arrays). */
function fps(pts: number[], n: number): number[] {
  const count = pts.length / 3;
  if (count <= n) return pts.slice();
  const out: number[] = [];
  const d = new Float32Array(count).fill(Infinity);
  let pick = 0;
  for (let k = 0; k < n; k++) {
    const px = pts[pick * 3] as number;
    const py = pts[pick * 3 + 1] as number;
    const pz = pts[pick * 3 + 2] as number;
    out.push(px, py, pz);
    let best = -1;
    let bi = 0;
    for (let i = 0; i < count; i++) {
      const dx = (pts[i * 3] as number) - px;
      const dy = (pts[i * 3 + 1] as number) - py;
      const dz = (pts[i * 3 + 2] as number) - pz;
      const v = Math.min(d[i] as number, dx * dx + dy * dy + dz * dz);
      d[i] = v;
      if (v > best) {
        best = v;
        bi = i;
      }
    }
    pick = bi;
  }
  return out;
}

/**
 * Claw sample points per bone, in that bone's local frame (rest positions minus the bone's rest origin).
 * `geos` are the skinned crab geometries (bound in the rest pose with an identity bind matrix).
 */
export function clawSamples(geos: THREE.BufferGeometry[], bones: number[], restOf: (b: number) => [number, number, number], perBone: number): Float32Array[] {
  const raw: number[][] = bones.map(() => []);
  for (const g of geos) {
    const pos = g.attributes.position;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    if (!pos || !si || !sw) continue;
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      const b = bones.indexOf(si.getComponent(i, best));
      if (b < 0) continue;
      const r = restOf(bones[b] as number);
      (raw[b] as number[]).push(pos.getX(i) - r[0], pos.getY(i) - r[1], pos.getZ(i) - r[2]);
    }
  }
  return raw.map((p) => new Float32Array(fps(p, perBone)));
}

/**
 * The hat as spheres (x, y, z, r in hat-mesh space): surface samples binned into 10 cm cells, one sphere
 * per cell covering its samples. A spinner (propeller) is swept round its axis.
 */
export function hatSpheres(geo: THREE.BufferGeometry | null, spinner?: { geo: THREE.BufferGeometry; pos: readonly [number, number, number] }): Float32Array {
  const cells = new Map<string, number[]>();
  const add = (x: number, y: number, z: number): void => {
    const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = []));
    c.push(x, y, z);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const walk = (g: THREE.BufferGeometry, xf: (v: THREE.Vector3) => void): void => {
    const pos = g.attributes.position;
    if (!pos) return;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const at = (k: number, v: THREE.Vector3): THREE.Vector3 => {
      v.fromBufferAttribute(pos, idx ? idx.getX(k) : k);
      xf(v);
      return v;
    };
    for (let k = 0; k + 2 < n; k += 3) {
      at(k, a);
      at(k + 1, b);
      at(k + 2, c);
      // corners, centroid and edge points: dense enough that big brim triangles leave no gaps
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1 / 3, 1 / 3], [0.5, 0], [0, 0.5], [0.5, 0.5], [0.25, 0], [0.75, 0], [0, 0.25], [0, 0.75], [0.25, 0.75], [0.75, 0.25]] as [number, number][]) {
        const w = 1 - u - v;
        add(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v);
      }
    }
  };
  if (geo) walk(geo, () => {});
  if (spinner) {
    for (let r = 0; r < 4; r++) {
      const ang = (r * Math.PI) / 4;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      walk(spinner.geo, (v) => v.set(v.x * cs + v.z * sn + spinner.pos[0], v.y + spinner.pos[1], -v.x * sn + v.z * cs + spinner.pos[2]));
    }
  }
  const out: number[] = [];
  for (const p of cells.values()) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const m = p.length / 3;
    for (let i = 0; i < p.length; i += 3) {
      cx += p[i] as number;
      cy += p[i + 1] as number;
      cz += p[i + 2] as number;
    }
    cx /= m;
    cy /= m;
    cz /= m;
    let r = 0;
    for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot((p[i] as number) - cx, (p[i + 1] as number) - cy, (p[i + 2] as number) - cz));
    out.push(cx, cy, cz, Math.max(0.03, r));
  }
  return new Float32Array(out);
}
