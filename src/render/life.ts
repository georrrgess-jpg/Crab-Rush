import * as THREE from 'three';
import { CFG } from '../config';
import { GeoBuilder, addWind } from './geo';
import type { Materials } from './materials';
import { WIND_FLAP } from './props';

/*
 * Update 9 ambient life tunables (to move into CFG.life).
 */
/** gulls that fly in over the camera and away down the beach: how many, height (m), speed (m/s,
 *  relative to the crab), and the wait between them (s) */
const OVERHEAD_GULLS = CFG.life.overheadGulls;
const OVERHEAD_Y = CFG.life.overheadY;
const OVERHEAD_SPEED = CFG.life.overheadSpeed;
const OVERHEAD_WAIT = CFG.life.overheadWait;
/** fish leaping in the shallows (all water zones now), seconds between leaps */
const FISH_WAIT = CFG.life.fishWait;
/** hermit crabs by the track edge: walking speed (m/s) and how close (m) the crab gets before they hide */
const HERMITS = CFG.life.hermits;
const HERMIT_SPEED = CFG.life.hermitSpeed;
const HERMIT_SHY = CFG.life.hermitShy;

/**
 * Living world (UPDATE2_PLAN.md §1.7): background beach crabs, gulls circling in the sky, dolphins
 * leaping, fish jumping by the pier, a turtle in the cove and fireflies at dusk. Everything is pooled
 * and instanced (one draw call per creature type) and only shows in its zone. Low tier keeps the
 * sky gulls only.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

type V3 = [number, number, number];

/** A little beach crab (Update 9: trimmed to ~400 triangles; it is a background critter). */
function miniCrab(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xe5452b, 0.2, [0, 0.16, 0], [1.3, 0.65, 1], 7);
  b.sphere(0xf7b08a, 0.16, [0, 0.12, 0.06], [1.2, 0.5, 0.9], 5);
  for (const s of [-1, 1]) {
    b.sphere(0xb3261e, 0.08, [s * 0.3, 0.2, 0.12], [1, 0.75, 1.2], 5);
    b.sphere(0xffffff, 0.045, [s * 0.07, 0.31, 0.12], [1, 1, 1], 4);
    b.sphere(0x111111, 0.022, [s * 0.07, 0.315, 0.16], [1, 1, 1], 3);
    for (let i = 0; i < 3; i++) b.seg(0xb3261e, [s * 0.18, 0.12, 0.08 - i * 0.1], [s * 0.36, 0.0, 0.1 - i * 0.12], 0.025, 0.018, 4);
  }
  return b.build();
}

/** A gull facing +z: head, beak and tail, wings that beat on the GPU (Update 9 flap wind mode). */
function skyGull(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xffffff, 0.3, [0, 0, 0], [0.7, 0.6, 1.4], 6);
  b.sphere(0xffffff, 0.16, [0, 0.12, 0.42], [1, 0.95, 1.1], 6);
  b.cone(0xffb21f, 0.045, 0.2, [0, 0.1, 0.62], [Math.PI / 2, 0, 0], 4);
  b.cone(0xe2e6ea, 0.16, 0.34, [0, 0.03, -0.52], [-Math.PI / 2, 0, 0], 4, [1, 1, 0.3]);
  for (const s of [-1, 1]) {
    b.box(0xf4f6f8, 1.1, 0.06, 0.38, [s * 0.6, 0.18, 0], [0, 0, s * 0.35]);
    b.box(0x2a2f38, 0.4, 0.05, 0.3, [s * 1.25, 0.42, -0.03], [0, 0, s * 0.5]);
  }
  // the wing beats about the shoulder: the further out, the further it swings
  return addWind(b.build(), (x) => (Math.abs(x) > 0.2 ? WIND_FLAP + Math.abs(x) - 0.12 : 0));
}

/** A hermit crab in a banded spiral shell, peeking out toward +z. ~470 triangles. */
function hermitCrab(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const bands = [0xf7dcc4, 0xec8a6a];
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    const a = t * Math.PI * 1.5;
    b.sphere(bands[i % 2] as number, 0.25 * (1 - t * 0.55), [Math.cos(a) * 0.07 * (1 - t), 0.23 + t * 0.26, -0.05 - t * 0.13 + Math.sin(a) * 0.05], [1, 0.9, 1.1], 7);
  }
  b.sphere(0x5a2e22, 0.16, [0, 0.19, 0.12], [1, 0.9, 0.35], 6);
  b.sphere(0xe5602b, 0.1, [0, 0.13, 0.19], [1.2, 0.8, 1], 5);
  for (const s of [-1, 1]) {
    b.seg(0xe5602b, [s * 0.04, 0.17, 0.23], [s * 0.07, 0.31, 0.26], 0.014, 0.014, 3);
    b.sphere(0x111111, 0.028, [s * 0.07, 0.32, 0.26], [1, 1, 1], 3);
    for (let k = 0; k < 2; k++) b.seg(0xd04a22, [s * 0.07, 0.1, 0.2 - k * 0.07], [s * 0.21, 0.0, 0.25 - k * 0.11], 0.02, 0.014, 3);
  }
  b.sphere(0xd8452a, 0.075, [0.09, 0.09, 0.3], [1, 0.75, 1.25], 5);
  return b.build();
}

function dolphin(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // body lathed along y, then laid along z (nose toward +z)
  const prof: [number, number][] = [[0, -1.2], [0.12, -1.05], [0.3, -0.6], [0.42, -0.1], [0.4, 0.35], [0.3, 0.75], [0.18, 1.0], [0.08, 1.25], [0, 1.32]];
  b.lathe(0x5c87b0, prof, 12, [0, 0, 0], [Math.PI / 2, 0, 0]).paint((x, y, z, c) => {
    if (y < -0.08) c.lerp(new THREE.Color(0xe6eef4), Math.min(1, (-0.08 - y) * 6));
  });
  b.cone(0x4a7398, 0.18, 0.45, [0, 0.5, -0.1], [-0.5, 0, 0], 5, [0.35, 1, 1]);
  b.sphere(0x4a7398, 0.3, [0, 0, -1.3], [1.4, 0.12, 0.5], 6);
  for (const s of [-1, 1]) {
    b.sphere(0x4a7398, 0.2, [s * 0.38, -0.2, 0.35], [1, 0.15, 0.6], 5, [0, s * 0.5, s * 0.4]);
    b.sphere(0x111111, 0.035, [s * 0.2, 0.06, 0.95], [1, 1, 1], 4);
  }
  return b.build();
}

function fish(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0xffa63a, 0.18, [0, 0, 0], [0.45, 0.8, 1.2], 8).paint((x, y, z, c) => {
    if (y < -0.05) c.set(0xfff1d6);
  });
  b.cone(0xff7a1a, 0.14, 0.2, [0, 0, -0.27], [-Math.PI / 2, 0, 0], 4, [0.25, 1, 1]);
  b.sphere(0x111111, 0.025, [0.06, 0.04, 0.14], [1, 1, 1], 4);
  b.sphere(0x111111, 0.025, [-0.06, 0.04, 0.14], [1, 1, 1], 4);
  return b.build();
}

function turtle(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0x4f8a3a, 0.7, [0, 0.1, 0], [1, 0.35, 1.25], 12).paint((x, y, z, c) => {
    // hexagon-ish scutes: darker seams on a cell grid
    const u = x * 3.2 + (Math.floor(z * 2.6) % 2) * 0.5;
    const seam = Math.min(Math.abs(u - Math.round(u)), Math.abs(z * 2.6 - Math.round(z * 2.6)));
    if (seam < 0.08) c.multiplyScalar(0.7);
    c.lerp(new THREE.Color(0x8ab048), Math.max(0, y - 0.25) * 2);
  });
  b.sphere(0x9ab878, 0.22, [0, 0.12, 0.95], [1, 0.8, 1.1], 8);
  b.sphere(0x111111, 0.035, [0.1, 0.2, 1.12], [1, 1, 1], 4);
  b.sphere(0x111111, 0.035, [-0.1, 0.2, 1.12], [1, 1, 1], 4);
  for (const [x, z, l] of [[0.75, 0.45, 0.6], [-0.75, 0.45, 0.6], [0.55, -0.7, 0.35], [-0.55, -0.7, 0.35]] as V3[]) {
    b.sphere(0x9ab878, l, [x, 0.0, z], [1, 0.12, 0.45], 6, [0, x > 0 ? -0.5 : 0.5, 0]);
  }
  return b.build();
}

interface Crab {
  wz: number;
  x: number;
  dir: number;
  speed: number;
  phase: number;
  pause: number;
}

interface Leap {
  t: number;
  dur: number;
  x: number;
  wz: number;
  h: number;
  len: number;
  wait: number;
  yaw: number;
}

/** a gull flying in over the camera (crab-relative x/y/z) */
interface Flyer {
  on: boolean;
  wait: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
}

interface Hermit {
  wz: number;
  x: number;
  yaw: number;
  /** seconds left hiding in the shell, and how far tucked in (0..1, eased) */
  hide: number;
  tuck: number;
  pause: number;
  phase: number;
}

const SKY_GULLS = CFG.life.skyGulls;
/** background beach crabs (Update 9: 5, was 6) */
const MINI_CRABS = CFG.life.miniCrabs;

export class LivingWorld {
  readonly group = new THREE.Group();
  private crabs: THREE.InstancedMesh;
  private gulls: THREE.InstancedMesh;
  private dolphin: THREE.Mesh;
  private fish: THREE.InstancedMesh;
  private hermits: THREE.InstancedMesh;
  private hermitState: Hermit[] = [];
  private flyers: Flyer[] = [];
  private turtle: THREE.Mesh;
  private fireflies: THREE.Points;
  private ffMat: THREE.ShaderMaterial;
  private crabState: Crab[] = [];
  private dLeap: Leap = { t: 0, dur: 1.3, x: 18, wz: 0, h: 2.6, len: 7, wait: 3, yaw: 0 };
  private fishLeaps: Leap[] = [];
  private turtleWz = 0;
  private rnd = 0x2468ace;
  /** Low tier: only the sky gulls */
  lite = false;
  /** Update 9: a fish broke the surface at (x, track wz): the view throws up a splash */
  onSplash: ((x: number, wz: number) => void) | null = null;

  constructor(mats: Materials) {
    this.crabs = new THREE.InstancedMesh(miniCrab(), mats.clay, MINI_CRABS);
    // Update 9: wings beat on the GPU (clayWind flap mode); a few more gulls fly in overhead
    this.gulls = new THREE.InstancedMesh(skyGull(), mats.clayWind, SKY_GULLS + OVERHEAD_GULLS);
    this.dolphin = new THREE.Mesh(dolphin(), mats.gloss);
    this.fish = new THREE.InstancedMesh(fish(), mats.gloss, 3);
    this.hermits = new THREE.InstancedMesh(hermitCrab(), mats.clay, HERMITS);
    this.turtle = new THREE.Mesh(turtle(), mats.clay);
    for (let i = 0; i < OVERHEAD_GULLS; i++) this.flyers.push({ on: false, wait: 2 + i * OVERHEAD_WAIT * 0.7, x: 0, y: 0, z: 0, vx: 0, vz: 0, t: 0 });
    for (let i = 0; i < HERMITS; i++) this.hermitState.push({ wz: 0, x: 0, yaw: 0, hide: 0, tuck: 0, pause: 0, phase: i * 1.7 });
    for (const o of [this.crabs, this.gulls, this.dolphin, this.fish, this.hermits, this.turtle]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    for (let i = 0; i < MINI_CRABS; i++) this.crabState.push({ wz: 0, x: 0, dir: 1, speed: 1, phase: i, pause: 0 });
    for (let i = 0; i < 3; i++) this.fishLeaps.push({ t: 0, dur: 0.8, x: 0, wz: 0, h: 1.4, len: 2.2, wait: i * 1.3, yaw: 0 });

    // fireflies: additive points that blink, wrapped around the player in track space
    const n = 48;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -4.5 - this.rand() * 14;
      pos[i * 3 + 1] = 0.6 + this.rand() * 2.6;
      pos[i * 3 + 2] = -this.rand() * 90;
      seed[i] = this.rand() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.ffMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: mats.lighting.uniforms.uTime, uOffset: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime; uniform float uOffset; uniform float uAmount; uniform float uScale;
        varying float vA;
        void main() {
          vec3 p = position;
          p.z = mod(p.z + uOffset, 90.0) - 80.0;
          p.x += sin(uTime * 0.7 + seed) * 0.6;
          p.y += sin(uTime * 1.1 + seed * 1.7) * 0.35;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = uAmount * smoothstep(0.2, 1.0, sin(uTime * 2.3 + seed * 3.0) * 0.5 + 0.5);
          gl_PointSize = uScale * 70.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * a, a);
        }`,
    });
    this.fireflies = new THREE.Points(g, this.ffMat);
    this.fireflies.frustumCulled = false;
    this.group.add(this.fireflies);
  }

  private rand(): number {
    this.rnd = (this.rnd * 16807) % 2147483647;
    return this.rnd / 2147483647;
  }

  /** pixel scale for the firefly points */
  setPixelRatio(dpr: number): void {
    (this.ffMat.uniforms.uScale as { value: number }).value = dpr;
  }

  reset(dist: number): void {
    for (const c of this.crabState) this.respawnCrab(c, dist, true);
    for (const h of this.hermitState) this.respawnHermit(h, dist, true);
    this.dLeap.wait = 2 + this.rand() * 3;
    this.dLeap.t = this.dLeap.dur;
    this.turtleWz = dist + 40;
  }

  private respawnCrab(c: Crab, dist: number, anywhere: boolean): void {
    const side = this.rand() < 0.65 ? -1 : 1;
    c.x = side < 0 ? -4.8 - this.rand() * 4 : 4.6 + this.rand() * 1.8;
    c.wz = dist + (anywhere ? 5 + this.rand() * 60 : 60 + this.rand() * 30);
    c.dir = this.rand() < 0.5 ? -1 : 1;
    c.speed = 0.6 + this.rand() * 0.9;
    c.pause = 0;
  }

  private respawnHermit(h: Hermit, dist: number, anywhere: boolean): void {
    const side = this.rand() < 0.6 ? -1 : 1;
    // on the flat sand just past the berm, where the run camera sees them
    h.x = side * (CFG.trackHalfWidth + 1.15 + this.rand() * 1.1);
    h.wz = dist + (anywhere ? 12 + this.rand() * 50 : 45 + this.rand() * 40);
    h.yaw = this.rand() * Math.PI * 2;
    h.hide = 0;
    h.tuck = 0;
    h.pause = this.rand() * 2;
  }

  /** `px`: the crab's x (hermit crabs hide in their shells as it runs past) */
  update(dt: number, time: number, dist: number, zone: number, night: number, px = 0): void {
    const sand = zone !== 1;
    // ---- beach crabs: scuttle sideways in short bursts, pause, change direction
    this.crabs.visible = !this.lite && sand;
    if (this.crabs.visible) {
      for (let i = 0; i < this.crabState.length; i++) {
        const c = this.crabState[i] as Crab;
        if (c.wz - dist < -6) this.respawnCrab(c, dist, false);
        c.phase += dt;
        if (c.pause > 0) c.pause -= dt;
        else {
          c.x += c.dir * c.speed * dt;
          if (this.rand() < dt * 0.6) {
            c.pause = 0.4 + this.rand() * 1.2;
            if (this.rand() < 0.5) c.dir = -c.dir;
          }
        }
        const moving = c.pause <= 0;
        const bob = moving ? Math.abs(Math.sin(c.phase * 18)) * 0.04 : 0;
        _e.set(0, moving ? Math.sin(c.phase * 18) * 0.12 : Math.sin(c.phase * 2) * 0.2, 0);
        _q.setFromEuler(_e);
        _m.compose(_p.set(c.x, bob, -(c.wz - dist)), _q, _s.setScalar(1.2));
        this.crabs.setMatrixAt(i, _m);
      }
      this.crabs.instanceMatrix.needsUpdate = true;
    }

    // ---- gulls circling high in the sky (the wings beat and glide on the GPU)
    for (let i = 0; i < SKY_GULLS; i++) {
      const a = time * (0.12 + i * 0.03) + i * 1.7;
      const r = 9 + i * 3;
      const cx = (i % 2 ? 14 : -18) + Math.sin(time * 0.05 + i) * 6;
      const cz = -45 - i * 9;
      // heading along the circle (the model faces +z), banking into the turn
      _e.set(0, -a, 0.28 + Math.sin(a * 2) * 0.06, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(cx + Math.cos(a) * r, 16 + i * 2.2 + Math.sin(time * 0.6 + i) * 0.8, cz + Math.sin(a) * r), _q, _s.setScalar(1.4));
      this.gulls.setMatrixAt(i, _m);
    }
    // ---- Update 9: now and then a gull sweeps in over the camera and away down the beach (only the
    // ones in flight are drawn: they are packed after the sky gulls)
    let flying = 0;
    for (let i = 0; i < OVERHEAD_GULLS; i++) {
      const f = this.flyers[i] as Flyer;
      if (!f.on) {
        f.wait -= dt;
        if (f.wait <= 0) {
          f.on = true;
          f.t = 0;
          f.x = -5 + this.rand() * 11;
          f.y = OVERHEAD_Y + this.rand() * 2.5;
          f.z = 10;
          f.vz = -OVERHEAD_SPEED * (0.8 + this.rand() * 0.5);
          f.vx = (this.rand() - 0.5) * 1.6;
        }
      } else {
        f.t += dt;
        f.x += f.vx * dt;
        f.z += f.vz * dt;
        f.y += Math.sin(f.t * 0.9 + i) * 0.25 * dt;
        if (f.z < -85) {
          f.on = false;
          f.wait = OVERHEAD_WAIT * (0.6 + this.rand() * 1.2);
        }
      }
      if (f.on) {
        _e.set(0.08, Math.atan2(f.vx, f.vz), -f.vx * 0.18 + Math.sin(f.t * 0.7) * 0.08, 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(_p.set(f.x, f.y, f.z), _q, _s.setScalar(1.15));
        this.gulls.setMatrixAt(SKY_GULLS + flying++, _m);
      }
    }
    this.gulls.count = SKY_GULLS + flying;
    this.gulls.instanceMatrix.needsUpdate = true;

    // ---- dolphins leap out at sea (Shore and Sunset)
    const L = this.dLeap;
    this.dolphin.visible = false;
    if (!this.lite && (zone === 0 || zone === 3)) {
      if (L.t >= L.dur) {
        L.wait -= dt;
        if (L.wait <= 0) {
          L.t = 0;
          L.x = 14 + this.rand() * 12;
          L.wz = dist + 35 + this.rand() * 25;
          L.dur = 1.2 + this.rand() * 0.3;
          L.h = 2.2 + this.rand() * 1.2;
          L.len = 6 + this.rand() * 3;
          L.yaw = (this.rand() - 0.5) * 1.2;
          L.wait = 4 + this.rand() * 6;
        }
      } else {
        L.t += dt;
        const u = L.t / L.dur;
        const y = -0.8 + Math.sin(u * Math.PI) * L.h;
        const vy = Math.cos(u * Math.PI);
        _e.set(-Math.atan2(vy * L.h * Math.PI, L.len) , L.yaw, 0, 'YXZ');
        this.dolphin.rotation.copy(_e);
        this.dolphin.position.set(L.x + Math.sin(L.yaw) * (u - 0.5) * L.len, y, -(L.wz - dist) + Math.cos(L.yaw) * (u - 0.5) * L.len);
        this.dolphin.visible = true;
      }
    }

    // ---- fish hop out of the water: beside the pier, and (Update 9) in the shallows off every beach,
    // with a splash where they leave the water and where they dive back in
    let leaping = false;
    if (!this.lite) {
      for (let i = 0; i < this.fishLeaps.length; i++) {
        const f = this.fishLeaps[i] as Leap;
        if (f.t >= f.dur) {
          f.wait -= dt;
          if (f.wait <= 0) {
            f.t = 0;
            if (zone === 1) f.x = (this.rand() < 0.5 ? -1 : 1) * (5 + this.rand() * 6);
            else f.x = (zone === 2 ? 9 : 10) + this.rand() * 7;
            f.wz = dist + 15 + this.rand() * 35;
            f.dur = 0.6 + this.rand() * 0.3;
            f.h = 0.9 + this.rand() * 0.8;
            f.yaw = this.rand() * Math.PI * 2;
            f.wait = (zone === 1 ? 1 : FISH_WAIT) * (0.5 + this.rand() * 1.5);
            this.onSplash?.(f.x - Math.sin(f.yaw) * 0.5 * f.len, f.wz - Math.cos(f.yaw) * 0.5 * f.len);
          }
          _m.compose(_p.set(0, -50, 0), _q.identity(), _s.setScalar(0.001));
        } else {
          f.t += dt;
          if (f.t >= f.dur) this.onSplash?.(f.x + Math.sin(f.yaw) * 0.5 * f.len, f.wz + Math.cos(f.yaw) * 0.5 * f.len);
          const u = Math.min(1, f.t / f.dur);
          const y = -0.4 + Math.sin(u * Math.PI) * f.h;
          _e.set(-(0.5 - u) * 2.2, f.yaw, Math.sin(f.t * 30) * 0.15, 'YXZ');
          _q.setFromEuler(_e);
          _m.compose(_p.set(f.x + Math.sin(f.yaw) * (u - 0.5) * f.len, y, -(f.wz - dist) + Math.cos(f.yaw) * (u - 0.5) * f.len), _q, _s.setScalar(1.6));
          leaping = true;
        }
        this.fish.setMatrixAt(i, _m);
      }
      if (leaping) this.fish.instanceMatrix.needsUpdate = true;
    }
    this.fish.visible = leaping;

    // ---- Update 9: hermit crabs plod about on the sand by the track and duck into their shells as
    // the crab runs past (High/Medium, beaches only)
    this.hermits.visible = !this.lite && sand;
    if (this.hermits.visible) {
      for (let i = 0; i < this.hermitState.length; i++) {
        const h = this.hermitState[i] as Hermit;
        const rel = h.wz - dist;
        if (rel < -6) this.respawnHermit(h, dist, false);
        if (h.hide <= 0 && rel < HERMIT_SHY && rel > -1 && Math.abs(h.x - px) < HERMIT_SHY) h.hide = 1.6 + this.rand();
        h.tuck += ((h.hide > 0 ? 1 : 0) - h.tuck) * Math.min(1, dt * (h.hide > 0 ? 14 : 4));
        const tuck = h.tuck;
        if (h.hide > 0) h.hide -= dt;
        else if (h.pause > 0) h.pause -= dt;
        else {
          h.phase += dt;
          h.x += Math.sin(h.yaw) * HERMIT_SPEED * dt;
          h.wz += Math.cos(h.yaw) * HERMIT_SPEED * dt;
          // stay on the flat sand: turn back from the berm and the far beach
          const ax = Math.abs(h.x);
          if (ax < CFG.trackHalfWidth + 1.0 || ax > CFG.trackHalfWidth + 2.6) h.yaw = Math.atan2(Math.sign(h.x) * (ax < CFG.trackHalfWidth + 1.8 ? 1 : -1), (this.rand() - 0.5) * 2);
          if (this.rand() < dt * 0.4) h.pause = 0.6 + this.rand() * 1.5;
          if (this.rand() < dt * 0.3) h.yaw += (this.rand() - 0.5) * 1.6;
        }
        const walk = h.hide <= 0 && h.pause <= 0;
        const wob = walk ? Math.sin(h.phase * 16) : 0;
        _e.set(tuck * 0.45, h.yaw + wob * 0.06, wob * 0.1, 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(_p.set(h.x, walk ? Math.abs(wob) * 0.025 : 0, -rel), _q, _s.set(1.25, 1.25 * (1 - tuck * 0.18), 1.25));
        this.hermits.setMatrixAt(i, _m);
      }
      this.hermits.instanceMatrix.needsUpdate = true;
    }

    // ---- a sea turtle paddles along the cove shallows
    this.turtle.visible = !this.lite && zone === 2;
    if (this.turtle.visible) {
      if (this.turtleWz - dist < -10) this.turtleWz = dist + 70 + this.rand() * 30;
      this.turtleWz += dt * 1.2;
      this.turtle.position.set(11 + Math.sin(time * 0.2) * 2, -0.18 + Math.sin(time * 1.3) * 0.05, -(this.turtleWz - dist));
      this.turtle.rotation.set(Math.sin(time * 1.3) * 0.05, Math.PI + Math.sin(time * 0.2) * 0.3, Math.sin(time * 2.6) * 0.06);
    }

    // ---- fireflies over the Sunset beach, brighter as it gets dark
    const ff = zone === 3 ? 0.25 + night * 0.75 : 0;
    this.fireflies.visible = !this.lite && ff > 0;
    (this.ffMat.uniforms.uAmount as { value: number }).value = ff;
    (this.ffMat.uniforms.uOffset as { value: number }).value = dist % 90;
  }
}
