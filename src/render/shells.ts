import * as THREE from 'three';
import type { Shell } from '../sim/types';
import type { Materials } from './materials';
import { scallopGeometry } from './models/shell';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** A four-point twinkle star for shell glints. */
function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,250,220,0.8)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 32 : 5;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}

/** A soft gold ring for pickup pops. */
function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(32, 32, 14, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,240,170,0)');
  grd.addColorStop(0.55, 'rgba(255,230,140,1)');
  grd.addColorStop(0.75, 'rgba(255,200,80,0.6)');
  grd.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const POPS = 24;
const POP_LIFE = 0.32;
const _col = new THREE.Color();

/** All shells in instanced draw calls: the scallops, their additive glows and twinkle glints. */
export class ShellRenderer {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  readonly sparkle: THREE.InstancedMesh;
  /** pickup pops: an expanding gold ring where a shell was collected (one draw call, pooled) */
  readonly pops: THREE.InstancedMesh;
  private pop = Array.from({ length: POPS }, () => ({ t0: -9, x: 0, y: 0, big: false }));
  private popNext = 0;
  constructor(mats: Materials, max = 256) {
    this.mesh = new THREE.InstancedMesh(scallopGeometry(), mats.gold, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const gm = new THREE.MeshBasicMaterial({ map: mats.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, max);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.glow.renderOrder = 4;
    const sm = new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparkle = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sm, max);
    this.sparkle.frustumCulled = false;
    this.sparkle.count = 0;
    this.sparkle.renderOrder = 6;
    const pm = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pops = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), pm, POPS);
    this.pops.frustumCulled = false;
    this.pops.count = 0;
    this.pops.visible = false;
    this.pops.renderOrder = 6;
    this.pops.setColorAt(0, _col.set(0xffffff));
  }

  /** a shell was collected at (x, y) next to the player */
  addPop(x: number, y: number, big: boolean, time: number): void {
    const p = this.pop[this.popNext] as (typeof this.pop)[number];
    this.popNext = (this.popNext + 1) % POPS;
    p.t0 = time;
    p.x = x;
    p.y = y;
    p.big = big;
  }

  update(shells: readonly Shell[], dist: number, time: number, camQ: THREE.Quaternion, far: number): void {
    let n = 0;
    const max = this.mesh.instanceMatrix.count;
    for (const s of shells) {
      if (s.dead) continue;
      const rel = s.wz - dist;
      if (rel < -1.2 || rel > far) continue;
      if (n >= max) break;
      const big = s.big ? 1.7 + Math.sin(time * 6) * 0.12 : 1;
      // pulled shells whirl faster and shrink as they arrive
      const pu = s.magnet ? Math.min(1, s.pullT / s.pullDur) : 0;
      const spin = time * (2.4 + pu * 14) + s.id * 0.7;
      const bob = Math.sin(time * 3 + s.id) * 0.06;
      _e.set(0, Math.sin(spin) * 0.9, 0);
      _q.setFromEuler(_e);
      const sc = 0.95 * big * (1 - pu * 0.45);
      _m.compose(_p.set(s.x, s.y + bob, -rel), _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, _m);
      _m.compose(_p.set(s.x, s.y + bob, -rel + 0.05), camQ, _s.setScalar(1.25 * big));
      this.glow.setMatrixAt(n, _m);
      // an occasional glint on each shell
      const tw = Math.max(0, Math.sin(time * 2.7 + s.id * 1.9));
      const k = tw * tw * tw * tw * tw * tw * tw * tw * 0.75 * big + 0.001;
      _e.set(0, 0, time * 1.5 + s.id);
      _q.setFromEuler(_e).premultiply(camQ);
      _m.compose(_p.set(s.x + 0.12, s.y + bob + 0.16, -rel + 0.2), _q, _s.setScalar(k));
      this.sparkle.setMatrixAt(n, _m);
      n++;
    }
    // pickup pops
    let k = 0;
    for (const p of this.pop) {
      const u = (time - p.t0) / POP_LIFE;
      if (u < 0 || u >= 1) continue;
      const e = 1 - (1 - u) * (1 - u);
      _m.compose(_p.set(p.x, p.y, 0.1), camQ, _s.setScalar((p.big ? 1.1 : 0.7) + e * (p.big ? 2.4 : 1.5)));
      this.pops.setMatrixAt(k, _m);
      this.pops.setColorAt(k, _col.setScalar((1 - u) * (1 - u)));
      k++;
    }
    this.pops.count = k;
    this.pops.visible = k > 0;
    if (k > 0) {
      this.pops.instanceMatrix.needsUpdate = true;
      if (this.pops.instanceColor) this.pops.instanceColor.needsUpdate = true;
    }
    this.mesh.count = n;
    this.glow.count = n;
    this.sparkle.count = n;
    this.sparkle.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }
}
