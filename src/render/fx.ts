import * as THREE from 'three';
import type { Materials } from './materials';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/** Soft blob shadows: one instanced draw call for everything. */
export class BlobShadows {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(mats: Materials, max = 96) {
    const mat = new THREE.MeshBasicMaterial({ map: mats.shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
  }
  begin(): void {
    this.n = 0;
  }
  add(x: number, y: number, z: number, sx: number, sz: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    _m.compose(_p.set(x, y + 0.025, z), FLAT, _s.set(sx, sz, 1));
    this.mesh.setMatrixAt(this.n++, _m);
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Particle {
  x: number;
  y: number;
  wz: number; // track coordinate (scrolls with the world) or player-relative z when `local`
  vx: number;
  vy: number;
  vz: number;
  g: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  r: number;
  gC: number;
  b: number;
  local: boolean;
}

/** Pooled billboard particles (one instanced mesh per blend mode). */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private ps: Particle[] = [];
  private free: Particle[] = [];
  limit: number;
  constructor(tex: THREE.Texture, additive: boolean, private max = 200) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    this.limit = max;
  }

  spawn(x: number, y: number, wz: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, g = 0, grow = 0, local = false): void {
    if (this.ps.length >= Math.min(this.limit, this.max)) return;
    const p = this.free.pop() ?? ({} as Particle);
    _c.set(color);
    Object.assign(p, { x, y, wz, vx, vy, vz, g, life, max: life, size, grow, r: _c.r, gC: _c.g, b: _c.b, local });
    this.ps.push(p);
  }

  clear(): void {
    for (const p of this.ps) this.free.push(p);
    this.ps.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number, dist: number, camQ: THREE.Quaternion): void {
    let w = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        this.free.push(p);
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.wz += p.vz * dt;
      this.ps[w++] = p;
    }
    this.ps.length = w;
    for (let i = 0; i < w; i++) {
      const p = this.ps[i] as Particle;
      const t = p.life / p.max;
      const s = p.size * (1 + (1 - t) * p.grow);
      const z = p.local ? p.wz : -(p.wz - dist);
      _q.copy(camQ);
      _m.compose(_p.set(p.x, p.y, z), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
      const fade = Math.min(1, t * 2.5);
      this.mesh.instanceColor!.setXYZ(i, p.r * fade, p.gC * fade, p.b * fade);
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
