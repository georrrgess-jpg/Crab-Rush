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

/**
 * Sand Slam impact (UPDATE5_PLAN.md §2): a shockwave ring racing out across the sand and a crater
 * scorch that fades. Two reused meshes; hidden when idle (no draw calls).
 */
export class SlamFx {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private ring2: THREE.Mesh;
  private crater: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private ring2Mat: THREE.MeshBasicMaterial;
  private craterMat: THREE.MeshBasicMaterial;
  private t = 99;
  private x = 0;
  private wz = 0;

  constructor() {
    // a soft-edged band: alpha ramps in from the inside, peaks near the rim and falls off outside
    const ringGeo = new THREE.RingGeometry(0.62, 1, 48, 3);
    const rp = ringGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(rp.count * 3);
    for (let i = 0; i < rp.count; i++) {
      const r = Math.hypot(rp.getX(i), rp.getY(i));
      const a = r < 0.86 ? Math.pow((r - 0.62) / 0.24, 2) : 1 - (r - 0.86) / 0.14;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0, Math.min(1, a));
    }
    ringGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, vertexColors: true, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
    this.ring2Mat = new THREE.MeshBasicMaterial({ color: 0xffc860, vertexColors: true, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring2 = new THREE.Mesh(ringGeo, this.ring2Mat);
    // crater: a radial gradient (dark pressed sand, a bright rim, cracks) drawn once
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(120,80,30,0.75)');
    grad.addColorStop(0.55, 'rgba(150,105,50,0.55)');
    grad.addColorStop(0.78, 'rgba(255,240,200,0.7)');
    grad.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(100,60,20,0.6)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10);
      g.lineTo(64 + Math.cos(a + 0.15) * 30, 64 + Math.sin(a + 0.15) * 30);
      g.lineTo(64 + Math.cos(a - 0.05) * 46, 64 + Math.sin(a - 0.05) * 46);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const craterGeo = new THREE.PlaneGeometry(2, 2);
    craterGeo.rotateX(-Math.PI / 2);
    this.craterMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.crater = new THREE.Mesh(craterGeo, this.craterMat);
    for (const m of [this.ring, this.ring2, this.crater]) {
      m.renderOrder = 2;
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  spawn(x: number, wz: number): void {
    this.t = 0;
    this.x = x;
    this.wz = wz;
  }

  reset(): void {
    this.t = 99;
    for (const m of [this.ring, this.ring2, this.crater]) m.visible = false;
  }

  update(dt: number, dist: number): void {
    if (this.t > 2) return;
    this.t += dt;
    const z = -(this.wz - dist);
    const t = this.t;
    const u1 = Math.min(1, t / 0.5);
    const u2 = Math.min(1, Math.max(0, (t - 0.08) / 0.6));
    const out = (u: number): number => 1 - (1 - u) * (1 - u) * (1 - u);
    this.ring.visible = u1 < 1;
    this.ring.position.set(this.x, 0.04, z);
    this.ring.scale.setScalar(0.4 + out(u1) * 4.4);
    this.ringMat.opacity = (1 - u1) * 0.9;
    this.ring2.visible = u2 > 0 && u2 < 1;
    this.ring2.position.set(this.x, 0.035, z);
    this.ring2.scale.setScalar(0.3 + out(u2) * 2.8);
    this.ring2Mat.opacity = (1 - u2) * 0.7;
    const uc = Math.min(1, t / 1.8);
    this.crater.visible = uc < 1;
    this.crater.position.set(this.x, 0.02, z);
    this.crater.scale.setScalar(0.7 + Math.min(1, t / 0.12) * 0.55);
    this.craterMat.opacity = (1 - uc * uc) * 0.9;
    if (this.t > 2) this.reset();
  }
}
