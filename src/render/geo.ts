import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Vec3 = [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/**
 * Builds one merged, vertex-coloured geometry from primitives. Every model is a handful of these, so
 * each obstacle / prop costs a single draw call.
 */
export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];

  private push(g: THREE.BufferGeometry, color: number | THREE.Color, pos: Vec3, rot: Vec3, scale: Vec3, gradient?: { top: number; bottom: number }): this {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _q, new THREE.Vector3(scale[0], scale[1], scale[2]));
    g.applyMatrix4(_m);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    if (gradient) {
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const top = new THREE.Color(gradient.top);
      const bot = new THREE.Color(gradient.bottom);
      const pa = g.attributes.position!;
      for (let i = 0; i < n; i++) {
        const t = (pa.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
        _c.copy(bot).lerp(top, t);
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
    } else {
      _c.set(color as number);
      for (let i = 0; i < n; i++) {
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // keep attribute sets identical so merging never fails
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    this.parts.push(g);
    return this;
  }

  sphere(color: number, r: number, pos: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], seg = 12, rot: Vec3 = [0, 0, 0], gradient?: { top: number; bottom: number }): this {
    return this.push(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), color, pos, rot, scale, gradient);
  }
  box(color: number, w: number, h: number, d: number, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], gradient?: { top: number; bottom: number }): this {
    return this.push(new THREE.BoxGeometry(w, h, d), color, pos, rot, [1, 1, 1], gradient);
  }
  cyl(color: number, rTop: number, rBot: number, h: number, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], seg = 12, scale: Vec3 = [1, 1, 1], gradient?: { top: number; bottom: number }): this {
    return this.push(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, pos, rot, scale, gradient);
  }
  cone(color: number, r: number, h: number, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], seg = 10, scale: Vec3 = [1, 1, 1]): this {
    return this.push(new THREE.ConeGeometry(r, h, seg), color, pos, rot, scale);
  }
  torus(color: number, r: number, tube: number, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], seg = 16, scale: Vec3 = [1, 1, 1]): this {
    return this.push(new THREE.TorusGeometry(r, tube, 8, seg), color, pos, rot, scale);
  }
  ico(color: number, r: number, pos: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], detail = 1, jitter = 0, seed = 1): this {
    const g = new THREE.IcosahedronGeometry(r, detail);
    if (jitter > 0) {
      const pa = g.attributes.position!;
      // jitter per unique vertex position so the surface stays closed
      const map = new Map<string, number>();
      let s = seed;
      const rnd = (): number => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      for (let i = 0; i < pa.count; i++) {
        const k = `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
        let f = map.get(k);
        if (f === undefined) {
          f = 1 + (rnd() - 0.5) * 2 * jitter;
          map.set(k, f);
        }
        pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f, pa.getZ(i) * f);
      }
      g.computeVertexNormals();
    }
    return this.push(g, color, pos, [0, 0, 0], scale);
  }
  /** Cylinder spanning two points. */
  seg(color: number, a: Vec3, bp: Vec3, rA: number, rB: number, segs = 6): this {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...bp);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const mid = va.add(vb).multiplyScalar(0.5);
    return this.cyl(color, rB, rA, len, [mid.x, mid.y, mid.z], [e.x, e.y, e.z], segs);
  }
  /** Geometry that already carries a colour attribute. */
  raw(g: THREE.BufferGeometry): this {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    this.parts.push(g);
    return this;
  }
  /** Any ready geometry (e.g. extrusions) */
  geo(g: THREE.BufferGeometry, color: number, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): this {
    return this.push(g, color, pos, rot, scale);
  }

  build(): THREE.BufferGeometry {
    const norm = this.parts.map((p) => (p.index ? p.toNonIndexed() : p));
    for (const p of norm) {
      if (!p.attributes.normal) p.computeVertexNormals();
    }
    const merged = mergeGeometries(norm, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) throw new Error('GeoBuilder: merge failed');
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Merge several already-built geometries (all with position/normal/color). */
export function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!m) throw new Error('mergeAll failed');
  return m;
}

export function translated(g: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, scale = 1): THREE.BufferGeometry {
  const c = g.clone();
  _e.set(0, rotY, 0);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(scale, scale, scale));
  c.applyMatrix4(_m);
  return c;
}
