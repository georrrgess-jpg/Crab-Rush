import * as THREE from 'three';
import type { Shell } from '../sim/types';
import type { Materials } from './materials';
import { scallopGeometry } from './models/shell';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** All shells in two instanced draw calls: the scallops and their additive glows. */
export class ShellRenderer {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  constructor(mats: Materials, max = 256) {
    this.mesh = new THREE.InstancedMesh(scallopGeometry(), mats.gold, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const gm = new THREE.MeshBasicMaterial({ map: mats.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, max);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.glow.renderOrder = 4;
  }

  update(shells: readonly Shell[], dist: number, time: number, camQ: THREE.Quaternion, far: number): void {
    let n = 0;
    const max = this.mesh.instanceMatrix.count;
    for (const s of shells) {
      if (s.dead) continue;
      const rel = s.wz - dist;
      if (rel < -6 || rel > far) continue;
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
      n++;
    }
    this.mesh.count = n;
    this.glow.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }
}
