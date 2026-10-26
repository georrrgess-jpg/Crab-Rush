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
  /** shadows lean away from the sun: horizontal offset per metre of caster height */
  private ox = 0;
  private oz = 0;
  begin(): void {
    this.n = 0;
  }
  /** Sun direction (world, normalised x/z components) for elongated, offset shadows. */
  setSun(dx: number, dz: number): void {
    this.ox = -dx * 0.35;
    this.oz = -dz * 0.35;
  }
  /** `h` is the caster's height above the ground: the shadow slides away from the sun and shrinks. */
  add(x: number, y: number, z: number, sx: number, sz: number, h = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    const k = 0.5 + h;
    const stretch = 1 + Math.abs(this.ox) * 0.6;
    _m.compose(_p.set(x + this.ox * k, y + 0.025, z + this.oz * k), FLAT, _s.set(sx * stretch, sz, 1));
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
  /** normal-blend sprites with opaque art shrink away instead of fading to black */
  shrinkFade = false;
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
      const fade = Math.min(1, t * 2.5);
      const s = p.size * (1 + (1 - t) * p.grow) * (this.shrinkFade ? fade : 1);
      const z = p.local ? p.wz : -(p.wz - dist);
      _q.copy(camQ);
      _m.compose(_p.set(p.x, p.y, z), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
      const k = this.shrinkFade ? 1 : fade;
      this.mesh.instanceColor!.setXYZ(i, p.r * k, p.gC * k, p.b * k);
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

const footVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aFade;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  vFade = aFade;
  vec3 transformed = position;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const footFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
varying vec2 vUv;
varying float vFade;
void main() {
  // three little leg pokes on each side, staggered
  vec2 p = vUv * vec2(5.0, 3.0);
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  f.y += mod(cell.x, 2.0) * 0.25 - 0.12;
  float side = step(1.5, cell.x) * step(cell.x, 2.5);
  float d = length(f * vec2(1.6, 1.0));
  float a = (1.0 - smoothstep(0.18, 0.3, d)) * (1.0 - side) * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * 0.4);
  #include <fog_fragment>
}`;

/** Little leg-poke footprints left in the sand behind the crab: one instanced draw call. */
export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private wz: Float32Array;
  private xs: Float32Array;
  private life: Float32Array;
  private fade: THREE.InstancedBufferAttribute;
  private head = 0;
  readonly mat: THREE.ShaderMaterial;
  constructor(private max = 36) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: footVert,
      fragmentShader: footFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: { ...THREE.UniformsLib.fog, uColor: { value: new THREE.Color(0x8a6a48) } },
    });
    const g = new THREE.PlaneGeometry(1.4, 0.55);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute('aFade', this.fade);
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.wz = new Float32Array(max);
    this.xs = new Float32Array(max);
    this.life = new Float32Array(max);
    this.mesh.count = max;
    for (let i = 0; i < max; i++) this.fade.setX(i, 0);
  }
  clear(): void {
    this.life.fill(0);
  }
  /** Stamp a footprint at lateral x and track distance wz. */
  stamp(x: number, wz: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.xs[i] = x;
    this.wz[i] = wz;
    this.life[i] = 1;
  }
  update(dt: number, dist: number): void {
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i] as number;
      if (l > 0) l = Math.max(0, l - dt * 0.55);
      this.life[i] = l;
      const z = -((this.wz[i] as number) - dist);
      if (l <= 0 || z > 14) {
        this.fade.setX(i, 0);
        _m.compose(_p.set(0, -10, 0), FLAT, _s.set(0.001, 0.001, 1));
      } else {
        this.fade.setX(i, Math.min(1, l * 1.5));
        _m.compose(_p.set(this.xs[i] as number, 0.03, z), FLAT, _s.set(1, 1, 1));
      }
      this.mesh.setMatrixAt(i, _m);
    }
    this.fade.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
