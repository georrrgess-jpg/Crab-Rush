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

/** All shells in instanced draw calls: the scallops, their additive glows and twinkle glints. */
export class ShellRenderer {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  readonly sparkle: THREE.InstancedMesh;
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
      const spin = time * 2.4 + s.id * 0.7;
      const bob = Math.sin(time * 3 + s.id) * 0.06;
      _e.set(0, Math.sin(spin) * 0.9, 0);
      _q.setFromEuler(_e);
      const sc = 0.95 * big;
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
    this.mesh.count = n;
    this.glow.count = n;
    this.sparkle.count = n;
    this.sparkle.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }
}
