import { CFG } from '../config';
import * as THREE from 'three';
import type { Entity, Shell } from '../sim/types';
import type { Materials } from './materials';
import { scallopGeometry } from './models/shell';
import { makeToy } from './shaders/toy';

/*
 * Update 9 shell tunables (to move into CFG.shells). Distances in metres, times in seconds.
 */
/** radians per metre along the track: bob and wobble run down a row of shells like a wave */
const SHELL_ROW_PHASE = CFG.shellFx.shellRowPhase;
/** bob height and rate (rad/s) */
const SHELL_BOB = CFG.shellFx.shellBob;
const SHELL_BOB_RATE = CFG.shellFx.shellBobRate;
/** every shell flips one full turn every SHELL_FLIP_EVERY s, taking SHELL_FLIP_TIME; the flips
 *  ripple down a row (cycles per metre) */
const SHELL_FLIP_EVERY = CFG.shellFx.shellFlipEvery;
const SHELL_FLIP_TIME = CFG.shellFx.shellFlipTime;
const SHELL_FLIP_WAVE = CFG.shellFx.shellFlipWave;
/** a glint sweeps across each shell every SHELL_GLINT_EVERY s and takes SHELL_GLINT_TIME */
const SHELL_GLINT_EVERY = CFG.shellFx.shellGlintEvery;
const SHELL_GLINT_TIME = CFG.shellFx.shellGlintTime;
/** big (pearl) shells: scale, halo ping period, orbiting twinkles */
const BIG_SCALE = CFG.shellFx.bigScale;
const BIG_PING_EVERY = CFG.shellFx.bigPingEvery;
const BIG_ORBITERS = CFG.shellFx.bigOrbiters;
/** magnet pull: extra length mid-flight (×), spin rate (rad/s), trail dots */
const MAGNET_STRETCH = CFG.shellFx.magnetStretch;
const MAGNET_SPIN = CFG.shellFx.magnetSpin;
const MAGNET_TRAIL = CFG.shellFx.magnetTrail;
/** collect pop: the punch-up ghost, the ring, and the star burst (count; big shells get more) */
const GHOST_LIFE = CFG.shellFx.ghostLife;
const POP_LIFE = CFG.shellFx.popLife;
const BIG_POP_LIFE = CFG.shellFx.bigPopLife;
const BURST_STARS = CFG.shellFx.burstStars;
/** the pop rises this far above where the shell was taken, clear of the crab's hat */
const POP_LIFT = CFG.shellFx.popLift;
const BIG_BURST_STARS = CFG.shellFx.bigBurstStars;
/** power-up bubbles: orbiting twinkles and the shimmer glint period */
const POWER_TWINKLES = CFG.shellFx.powerTwinkles;
const POWER_SHIMMER_EVERY = CFG.shellFx.powerShimmerEvery;

const TAU = Math.PI * 2;
const MAX_SHELLS = 256;
const GHOSTS = 16;
const POPS = 24;
const STARS = 140;
const MAX_SPRITES = 720;

/** sprite atlas tiles */
const T_GLOW = 0;
const T_STAR = 1;
const T_RING = 2;
const T_RAYS = 3;

const _m = new THREE.Matrix4();
const _ms = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

const frac = (x: number): number => x - Math.floor(x);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number): number => {
  const c = 2.2;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** power-up sparkle tints (warm white toward the power's colour) */
const POWER_TINT: Record<string, number> = { magnet: 0xffb0a0, shield: 0xc0f0ff, rider: 0xa8fff4 };

/**
 * White sprite atlas, 2 × 2 tiles: a soft glow, a four-point twinkle, a soft ring and an eight-ray
 * burst. Instance colours tint them (one additive draw call for every shell and pickup sprite).
 */
function atlasTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, S * 2, S * 2);
  // tile t sits at column t % 2, row floor(t / 2) counted from the bottom (the texture is flipped)
  const cell = (t: number, draw: (cx: number, cy: number, r: number) => void): void => {
    const ox = (t % 2) * S;
    const oy = (1 - Math.floor(t / 2)) * S;
    g.save();
    g.beginPath();
    g.rect(ox, oy, S, S);
    g.clip();
    draw(ox + S / 2, oy + S / 2, S / 2 - 4);
    g.restore();
  };
  const radial = (cx: number, cy: number, r0: number, r1: number, stops: [number, number][]): CanvasGradient => {
    const gr = g.createRadialGradient(cx, cy, r0, cx, cy, r1);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    return gr;
  };
  cell(T_GLOW, (cx, cy, r) => {
    g.fillStyle = radial(cx, cy, 0, r, [[0, 1], [0.22, 0.75], [0.5, 0.3], [1, 0]]);
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
  cell(T_STAR, (cx, cy, r) => {
    g.fillStyle = radial(cx, cy, 0, r * 0.4, [[0, 1], [1, 0]]);
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = radial(cx, cy, 0, r, [[0, 1], [0.3, 0.85], [1, 0]]);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.12;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  });
  cell(T_RING, (cx, cy, r) => {
    g.fillStyle = radial(cx, cy, r * 0.5, r, [[0, 0], [0.55, 1], [0.75, 0.55], [1, 0]]);
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
  cell(T_RAYS, (cx, cy, r) => {
    g.fillStyle = radial(cx, cy, 0, r, [[0, 0.9], [0.35, 0.35], [1, 0]]);
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr = i % 2 === 0 ? r : r * 0.3;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  });
  return new THREE.CanvasTexture(c);
}

const spriteVert = /* glsl */ `
attribute vec4 aPos;   // xyz, size
attribute vec4 aTint;  // rgb (premultiplied intensity), atlas tile
attribute float aRot;
uniform float uFar;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float tile = aTint.w;
  vec2 cell = vec2(mod(tile, 2.0), floor(tile * 0.5 + 0.01));
  vUv = (uv * 0.97 + 0.015 + cell) * 0.5;
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  float c = cos(aRot);
  float s = sin(aRot);
  vec2 q = position.xy * aPos.w;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vCol = aTint.rgb * (1.0 - smoothstep(uFar * 0.6, uFar, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const spriteFrag = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float a = texture2D(map, vUv).a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

/** upload only the first `count` floats of a per-frame attribute */
function flush(a: THREE.BufferAttribute, count: number): void {
  a.clearUpdateRanges();
  a.addUpdateRange(0, count);
  a.needsUpdate = true;
}

/** Camera-facing additive sprites, billboarded on the GPU: one draw call per frame. */
class SpriteBatch {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private pos: THREE.InstancedBufferAttribute;
  private tint: THREE.InstancedBufferAttribute;
  private rot: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private n = 0;
  constructor(private max: number) {
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geo.setIndex(plane.index);
    this.geo.setAttribute('position', plane.attributes.position as THREE.BufferAttribute);
    this.geo.setAttribute('uv', plane.attributes.uv as THREE.BufferAttribute);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.rot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.pos, this.tint, this.rot]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.pos);
    this.geo.setAttribute('aTint', this.tint);
    this.geo.setAttribute('aRot', this.rot);
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      uniforms: { map: { value: atlasTexture() }, uFar: { value: 100 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }
  begin(far: number): void {
    this.n = 0;
    (this.mat.uniforms.uFar as { value: number }).value = far;
  }
  /** colour is a hex tint scaled by `k` (additive: k is the brightness) */
  add(x: number, y: number, z: number, size: number, color: number, k: number, tile: number, rot = 0): void {
    if (this.n >= this.max || size <= 0.001 || k <= 0.002) return;
    const i = this.n++;
    // hex tints are display colours: written straight out (the sprite shader skips colour-space conversion)
    _c.setHex(color, THREE.LinearSRGBColorSpace);
    this.pos.setXYZW(i, x, y, z, size);
    this.tint.setXYZW(i, _c.r * k, _c.g * k, _c.b * k, tile);
    this.rot.setX(i, rot);
  }
  end(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    flush(this.pos, n * 4);
    flush(this.tint, n * 4);
    flush(this.rot, n);
  }
}

interface Ghost {
  t0: number;
  x: number;
  y: number;
  big: boolean;
}
interface Pop {
  t0: number;
  life: number;
  x: number;
  y: number;
  z: number;
  s0: number;
  s1: number;
  color: number;
  k: number;
}
interface Star {
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rot: number;
  spin: number;
  color: number;
}

const GOLD_GLOW = 0xffc65a;
const PEARL_GLOW = 0xff9ad8;
const PEARL_HALO = 0xffd6f2;
const WARM_WHITE = 0xfff4d8;

/**
 * Every shell in one instanced draw call (gold scallops; big shells are pink pearl scallops), plus
 * one additive sprite batch for their glows, glints, halos, magnet trails, pickup pops and bursts and
 * the power-up bubble sparkles (Update 9). Pools only: nothing is allocated per frame.
 */
export class ShellRenderer {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  private shine: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private fx = new SpriteBatch(MAX_SPRITES);
  private ghosts: Ghost[] = Array.from({ length: GHOSTS }, () => ({ t0: -9, x: 0, y: 0, big: false }));
  private ghostNext = 0;
  private pops: Pop[] = Array.from({ length: POPS }, () => ({ t0: -9, life: 1, x: 0, y: 0, z: 0, s0: 0, s1: 0, color: 0, k: 0 }));
  private popNext = 0;
  private stars: Star[] = Array.from({ length: STARS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, rot: 0, spin: 0, color: 0 }));
  private starNext = 0;
  private lastTime = 0;
  /** Low tier: no orbiting twinkles, smaller bursts, no rim/spec on the shells */
  private lite = false;

  constructor(mats: Materials) {
    const geo = scallopGeometry();
    this.shine = new THREE.InstancedBufferAttribute(new Float32Array((MAX_SHELLS + GHOSTS) * 3), 3);
    this.shine.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShine', this.shine);
    this.mat = shellMaterial(mats);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_SHELLS + GHOSTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh, this.fx.mesh);
  }

  setLite(on: boolean): void {
    if (on === this.lite) return;
    this.lite = on;
    if (on) this.mat.defines.TOY_LITE = '';
    else delete this.mat.defines.TOY_LITE;
    this.mat.needsUpdate = true;
  }

  /** A shell was collected at (x, y) by the player: a punch-up ghost, a ring and a star burst. */
  addPop(x: number, y: number, big: boolean, time: number): void {
    const g = this.ghosts[this.ghostNext] as Ghost;
    this.ghostNext = (this.ghostNext + 1) % GHOSTS;
    g.t0 = time;
    g.x = x;
    g.y = y + POP_LIFT;
    g.big = big;
    this.ring(x, y + POP_LIFT + 0.2, 0.3, big ? PEARL_HALO : GOLD_GLOW, big ? 1.0 : 0.6, big ? 3.4 : 2.2, big ? BIG_POP_LIFE : POP_LIFE, big ? 1.0 : 0.7, time);
    const n = big ? BIG_BURST_STARS : BURST_STARS;
    this.burst(x, y + POP_LIFT + 0.2, 0.35, this.lite ? n >> 1 : n, big ? 0xffc8ec : 0xffe27a, big ? 3.8 : 2.9, big ? 0.46 : 0.36);
  }

  /** a bigger pop in a colour (power-ups, sand dollars) */
  bigPop(x: number, y: number, z: number, color: number, time: number): void {
    this.ring(x, y, z, color, 1.0, 3.8, 0.5, 1.2, time);
    this.ring(x, y, z, WARM_WHITE, 0.6, 2.2, 0.3, 0.8, time);
    this.burst(x, y, z + 0.1, this.lite ? 7 : 14, color, 4.2, 0.4);
  }

  /** an expanding ring sprite (colour, start/end size, life, brightness) */
  ring(x: number, y: number, z: number, color: number, s0: number, s1: number, life: number, k: number, time: number): void {
    const p = this.pops[this.popNext] as Pop;
    this.popNext = (this.popNext + 1) % POPS;
    p.t0 = time;
    p.life = life;
    p.x = x;
    p.y = y;
    p.z = z;
    p.s0 = s0;
    p.s1 = s1;
    p.color = color;
    p.k = k;
  }

  /** stars flying out from (x, y, z) in the camera's plane, slowing, spinning and shrinking */
  burst(x: number, y: number, z: number, n: number, color: number, speed: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const s = this.stars[this.starNext] as Star;
      this.starNext = (this.starNext + 1) % STARS;
      const a = (i / n) * TAU + Math.random() * 0.5;
      const sp = speed * (0.6 + Math.random() * 0.5);
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp + 0.8;
      s.vz = (Math.random() - 0.5) * 0.8;
      s.max = s.life = 0.38 + Math.random() * 0.18;
      s.size = size * (0.7 + Math.random() * 0.6);
      s.rot = Math.random() * TAU;
      s.spin = (Math.random() - 0.5) * 9;
      s.color = i % 3 === 0 ? 0xffffff : color;
    }
  }

  clear(): void {
    for (const g of this.ghosts) g.t0 = -9;
    for (const p of this.pops) p.t0 = -9;
    for (const s of this.stars) s.life = 0;
  }

  /**
   * Lay out every live shell (`dist`: the run distance, `far`: draw distance), the collect pops, and
   * the power-up sparkles in `ents`. (px, py) is the crab, for the magnet stretch.
   */
  update(shells: readonly Shell[], dist: number, time: number, far: number, px: number, py: number, ents: readonly Entity[]): void {
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const fx = this.fx;
    fx.begin(far);
    const lite = this.lite;
    const sh = this.shine;
    let n = 0;
    for (const s of shells) {
      if (s.dead) continue;
      const rel = s.wz - dist;
      if (rel < -1.2 || rel > far) continue;
      if (n >= MAX_SHELLS) break;
      const z = -rel;
      const ph = s.wz * SHELL_ROW_PHASE;
      const big = s.big;
      const pu = s.magnet ? clamp01(s.pullT / Math.max(1e-3, s.pullDur)) : 0;
      const sc = (big ? BIG_SCALE * (1 + Math.sin(time * 5 + ph) * 0.05) : 1) * 0.95 * (1 - pu * 0.4);
      const x = s.x;
      const y = s.y + Math.sin(time * SHELL_BOB_RATE + ph) * SHELL_BOB * (big ? 1.3 : 1) * (1 - pu);
      // a full flip now and then (rippling down the row), a lazy wobble in between; pulled shells whirl
      let yaw: number;
      if (pu > 0) yaw = time * MAGNET_SPIN + ph;
      else {
        const c = frac(time / (big ? SHELL_FLIP_EVERY * 1.4 : SHELL_FLIP_EVERY) - s.wz * SHELL_FLIP_WAVE);
        const ft = SHELL_FLIP_TIME / SHELL_FLIP_EVERY;
        yaw = c < ft ? easeInOut(c / ft) * TAU : Math.sin(time * 2.1 + ph) * 0.3;
      }
      _e.set(-0.18 + Math.sin(time * 1.7 + ph) * 0.06, yaw, Math.sin(time * 1.3 + ph * 0.7) * 0.1);
      _q.setFromEuler(_e);
      const squash = 1 + Math.cos(time * SHELL_BOB_RATE * 2 + ph * 2) * 0.035;
      _m.compose(_p.set(0, 0, 0), _q, _s.set(sc, sc * squash, sc));
      // magnet: stretch along the flight toward the crab (volume kept), peaking mid-flight
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (pu > 0) {
        dx = px - x;
        dy = py + 0.45 - y;
        dz = -z;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        const k = 1 + MAGNET_STRETCH * Math.sin(pu * Math.PI);
        const inv = 1 / Math.sqrt(k);
        const a = k - inv;
        _ms.set(inv + a * dx * dx, a * dx * dy, a * dx * dz, 0, a * dy * dx, inv + a * dy * dy, a * dy * dz, 0, a * dz * dx, a * dz * dy, inv + a * dz * dz, 0, 0, 0, 0, 1);
        _m.premultiply(_ms);
      }
      _m.setPosition(x, y, z);
      this.mesh.setMatrixAt(n, _m);
      // the glint: a bright band sweeping across the shell, rippling down the row
      const gc = pu > 0 ? frac(time * 2.6 + ph) : frac(time / SHELL_GLINT_EVERY - s.wz * 0.03);
      const gu = gc / (pu > 0 ? 0.5 : SHELL_GLINT_TIME / SHELL_GLINT_EVERY);
      const sweep = gu < 1 ? -1.4 + gu * 2.9 : -9;
      sh.setXYZ(n, sweep, big ? 1 : 0, pu * 0.7);
      n++;

      // ---- sprites
      const peak = gu < 1 ? Math.sin(gu * Math.PI) : 0;
      if (big) {
        const pulse = 0.85 + Math.sin(time * 4 + ph) * 0.15;
        fx.add(x, y, z + 0.04, 2.1 * sc * pulse, PEARL_GLOW, 0.45 + peak * 0.2, T_GLOW);
        fx.add(x, y, z - 0.05, 2.3 * sc, PEARL_HALO, 0.26 * pulse, T_RAYS, time * 0.5 + ph);
        const pg = frac(time / BIG_PING_EVERY + ph * 0.1);
        fx.add(x, y, z + 0.05, (0.9 + pg * 1.5) * sc, PEARL_HALO, (1 - pg) * (1 - pg) * 0.75, T_RING);
        if (!lite) {
          for (let i = 0; i < BIG_ORBITERS; i++) {
            const a = time * 2.2 + (i / BIG_ORBITERS) * TAU + ph;
            const tw = Math.max(0, Math.sin(time * 5.5 + i * 2.3));
            fx.add(x + Math.cos(a) * 0.62 * sc, y + Math.sin(a) * 0.48 * sc, z + 0.3, (0.16 + tw * 0.26) * sc, i % 2 ? 0xffffff : 0xffc8ec, 0.9, T_STAR, a);
          }
        }
      } else {
        fx.add(x, y, z + 0.04, 1.3 * sc * (1 + peak * 0.15), GOLD_GLOW, 0.5 + peak * 0.25 + pu * 0.3, T_GLOW);
      }
      // a twinkle where the glint crosses the crown of the shell
      if (peak > 0.35 && (!lite || big)) fx.add(x + 0.13 * sc, y + 0.15 * sc, z + 0.22, 0.62 * sc * peak, WARM_WHITE, 0.95, T_STAR, time * 1.5 + ph);
      // magnet streak: fading dots back along the flight
      if (pu > 0) {
        const len = 0.24 * (1 + MAGNET_STRETCH * Math.sin(pu * Math.PI));
        for (let i = 1; i <= MAGNET_TRAIL; i++) fx.add(x - dx * len * i, y - dy * len * i, z - dz * len * i, 0.85 * sc * (1 - i * 0.18), big ? PEARL_GLOW : GOLD_GLOW, 0.45 * (1 - i / (MAGNET_TRAIL + 1)), T_GLOW);
      }
    }

    // ---- collect ghosts: the shell punches up, spins and vanishes as the HUD flyer takes over
    for (const g of this.ghosts) {
      const u = (time - g.t0) / GHOST_LIFE;
      if (u < 0 || u >= 1 || n >= MAX_SHELLS + GHOSTS) continue;
      const punch = easeOutBack(clamp01(u / 0.35));
      const fade = 1 - clamp01((u - 0.45) / 0.55);
      const sc = (g.big ? BIG_SCALE : 1) * 0.95 * (1 + 0.55 * punch) * fade * fade;
      const y = g.y + u * 0.75;
      _e.set(-0.25, u * 10, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(g.x, y, 0.3), _q, _s.setScalar(sc));
      this.mesh.setMatrixAt(n, _m);
      sh.setXYZ(n, -1.4 + u * 3.4, g.big ? 1 : 0, 1.2 * (1 - u));
      n++;
      fx.add(g.x, y, 0.35, (g.big ? 2.4 : 1.3) * (0.7 + u * 0.5), g.big ? PEARL_GLOW : GOLD_GLOW, (g.big ? 0.6 : 0.42) * fade, T_GLOW);
    }
    this.mesh.count = n;
    if (n > 0) {
      flush(this.mesh.instanceMatrix, n * 16);
      flush(sh, n * 3);
    }

    // ---- rings
    for (const p of this.pops) {
      const u = (time - p.t0) / p.life;
      if (u < 0 || u >= 1) continue;
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      fx.add(p.x, p.y, p.z, p.s0 + (p.s1 - p.s0) * e, p.color, p.k * (1 - u) * (1 - u), T_RING);
    }
    // ---- burst stars
    const drag = Math.exp(-dt * 5);
    for (const s of this.stars) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vx *= drag;
      s.vy = s.vy * drag - 3 * dt;
      s.vz *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.rot += s.spin * dt;
      const t = s.life / s.max;
      fx.add(s.x, s.y, s.z, s.size * Math.min(1, t * 2.2), s.color, 1, T_STAR, s.rot);
    }

    // ---- power-up bubbles: twinkles orbit the bubble and a glint flashes across it
    for (const e of ents) {
      if (e.kind !== 'powerup' || e.dead) continue;
      const rel = e.wz - dist;
      if (rel < -2 || rel > far) continue;
      const z = -rel;
      const cy = e.y + Math.sin(time * 3) * 0.12;
      const tint = POWER_TINT[e.power ?? 'magnet'] ?? WARM_WHITE;
      if (!lite) {
        for (let i = 0; i < POWER_TWINKLES; i++) {
          const a = time * 1.6 + (i / POWER_TWINKLES) * TAU + e.id;
          const tw = Math.pow(Math.max(0, Math.sin(time * 4 + i * 2.1 + e.id)), 3);
          fx.add(e.x + Math.cos(a) * 0.74, cy + Math.sin(a) * 0.66, z + 0.35, 0.1 + tw * 0.38, i % 2 ? 0xffffff : tint, 1, T_STAR, a);
        }
      }
      const u = frac(time / POWER_SHIMMER_EVERY + e.id * 0.37);
      const pk = u < 0.28 ? Math.sin((u / 0.28) * Math.PI) : 0;
      fx.add(e.x - 0.3 + u * 0.4, cy + 0.32 - u * 0.2, z + 0.62, 0.95 * pk, 0xffffff, 0.9, T_STAR, 0.3 + u);
      fx.add(e.x, cy, z + 0.1, 1.9 + Math.sin(time * 2.4 + e.id) * 0.15, tint, 0.16 + pk * 0.12, T_GLOW);
    }
    fx.end();
  }
}

/**
 * The shells' toy material with two Update 9 extras driven by a per-instance `aShine`:
 * x = where a bright glint band sweeps across the shell (-1.4..1.5, off beyond), y = 1 for the pink
 * pearl colouring of big shells (a rainbow sheen shifts with the view angle), z = extra brightness.
 */
function shellMaterial(mats: Materials): THREE.ShaderMaterial {
  const m = makeToy(mats.lighting, { gloss: 1.1, color: 0xfff2c8 });
  const once = (src: string, a: string, b: string): string => {
    if (!src.includes(a)) throw new Error(`shellMaterial: missing ${a}`);
    return src.replace(a, b);
  };
  m.vertexShader = once(m.vertexShader, 'void main() {', 'attribute vec3 aShine;\nvarying vec3 vShine;\nvarying vec3 vObj;\nvoid main() {\n  vShine = aShine;\n  vObj = position;');
  let f = m.fragmentShader;
  f = once(f, 'void main() {', 'varying vec3 vShine;\nvarying vec3 vObj;\nvoid main() {');
  f = once(
    f,
    '  vec3 col;\n',
    `  if (vShine.y > 0.5) {
    float fr = 1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float lum = dot(base, vec3(0.3, 0.55, 0.15));
    vec3 irid = 0.5 + 0.5 * cos(6.2832 * (fr * 0.85 + vObj.y * 1.4 + vec3(0.0, 0.33, 0.67)));
    base = mix(vec3(1.0, 0.74, 0.86), irid, 0.26 + fr * 0.3) * (0.62 + lum * 0.5);
  }
  vec3 col;
`,
  );
  f = once(
    f,
    '  col = grade(col);',
    `  float band = (vObj.x * 0.75 + vObj.y * 0.66) * 2.6;
  col += vec3(1.0, 0.95, 0.8) * (1.0 - smoothstep(0.0, 0.22, abs(band - vShine.x))) * 0.85;
  col *= 1.0 + vShine.z * 0.5;
  col = grade(col);`,
  );
  m.fragmentShader = f;
  return m;
}
