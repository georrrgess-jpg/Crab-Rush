import * as THREE from 'three';
import { CFG } from '../config';
import type { Entity } from '../sim/types';
import type { BlobShadows } from './fx';
import { GeoBuilder } from './geo';
import type { Materials } from './materials';
import * as O from './models/obstacles';
import { makeOutline } from './shaders/toy';

/** Iridescent soap-bubble shell for power-ups: hue shifts with the view angle and time. */
function makeBubble(time: THREE.IUniform<number>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 c = mix(vec3(1.0), hue(fract(f * 1.3 + uTime * 0.12 + vY * 0.6)), 0.55);
        float spec = pow(max(dot(normalize(vN), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 40.0);
        float a = 0.1 + pow(f, 2.2) * 0.7 + spec * 0.8;
        // a shimmer band sweeping up the bubble
        float band = smoothstep(0.9, 1.0, sin(vY * 6.0 - uTime * 3.0 + f * 4.0));
        c += band * 0.4;
        a += band * 0.25;
        gl_FragColor = vec4(c + spec, a);
      }`,
  });
}

interface View {
  obj: THREE.Object3D;
  key: string;
  stamp: number;
  shadow: [number, number];
  anim?: (v: View, e: Entity, t: number) => void;
  parts?: THREE.Object3D[];
  /** meshes that may cast into the High-tier shadow map */
  casters?: THREE.Object3D[];
  casting?: boolean;
  /** distance LOD: the mesh swaps to `lo` beyond CFG LOD distance (UPDATE2_PLAN.md §2.4) */
  lod?: { mesh: THREE.Mesh; hi: THREE.BufferGeometry; lo: THREE.BufferGeometry; rich?: THREE.BufferGeometry; outline?: THREE.Mesh; olHi?: THREE.BufferGeometry; olLo?: THREE.BufferGeometry };
  /** inverted-hull outlines (High/Medium) */
  outlines?: THREE.Object3D[];
  /** seconds since the entity came within the entrance distance (<0: not yet) */
  enter: number;
  /** per-view animation memory (gull landing time, squawks; the scuttler's claw raise and last frame time) */
  memo: { landed: number; squawk: number; raise?: number; t?: number };
}

const LOD_DIST = 50;
/** High tier: the extra-detail obstacle models are drawn this close (m) */
const RICH_DIST = CFG.obstacleView.richDist;
/** High tier: obstacles this close (m) cast into the shadow map; beyond it (and for small hazards) a blob is drawn.
 *  Update 9: was 40 (every obstacle drew twice); the shadow map only needs the near ones. */
const SHADOW_DIST = CFG.obstacleView.shadowDist;
const ENTER_DIST = 60;
const easeOutBack = (t: number): number => {
  const c = 1.9;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/**
 * Update 9 scuttler animation knobs (candidates for CFG.scuttle): sideways metres per gait cycle, leg
 * lift and fore-aft swing (rad), body roll / yaw into the move (rad) and bob (m), claw raise and spread
 * (rad; the arms turn in ZXY order, so the claws end up beside the eyes, pincers up), snaps per second and how far the finger opens (rad), and how fast the warning pose blends in (1/s).
 */
const SCUTTLE_ANIM = CFG.obstacleView.scuttleAnim;
const SR = O.SCUTTLE_RIG;
const SC_LEG_AXIS = SR.legAxis.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
const SC_FINGER_AXIS = SR.fingerAxis.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
/** tetrapod gait: left 0 and 2 step with right 1 and 3, then the other four */
const SC_GROUP = [0, 1, 0, 1, 1, 0, 1, 0];
const SC_BODY_Y = (O.SCUTTLE_JOINTS[SR.body] as { pos: [number, number, number] }).pos[1];
const SC_EYE_Y = (O.SCUTTLE_JOINTS[SR.eye[0] as number] as { pos: [number, number, number] }).pos[1];
const _scQ = new THREE.Quaternion();
const _scY = new THREE.Vector3(0, 1, 0);

/**
 * The scuttler rig (parts: [arrow, ...bones]). At rest it breathes, looks about and now and then shifts a
 * foot. From the warning (state 1) the claws rise, spread and snap and it crouches, tapping its feet;
 * while it crosses, the two leg sets step alternately (phase tied to the distance moved, so the feet
 * don't skate), the body rolls, turns and bobs into the move, and the planted feet stay on the sand.
 */
function scuttleAnim(v: View, e: Entity, t: number): void {
  const A = SCUTTLE_ANIM;
  const P = v.parts as THREE.Object3D[];
  const ar = P[0] as THREE.Object3D;
  // bones follow the arrow in parts: bone i is P[1 + i]
  const from = CFG.laneX[e.lane] as number;
  const to = e.toLane !== undefined ? (CFG.laneX[e.toLane] as number) : from;
  const dir = Math.sign(to - from) || 1;
  const off = Math.abs(e.x - from);
  const prog = Math.min(1, off / (Math.abs(to - from) || 1));
  const crossing = e.state === 1 && off > 0.004;
  const env = crossing ? Math.sin(prog * Math.PI) : 0;
  // the warning pose blends in over a few frames
  const m = v.memo;
  const dt = m.t === undefined ? 0 : Math.min(0.1, Math.max(0, t - m.t));
  m.t = t;
  const target = e.state >= 1 ? 1 : 0;
  const up = (m.raise = (m.raise ?? 0) + (target - (m.raise ?? 0)) * Math.min(1, dt * A.blend));
  const gait = (off / A.stride) * Math.PI * 2;
  const ph = e.id * 1.37;

  // body: breathing at rest, a crouch and a nervous rock when warned, roll / yaw / bob while crossing
  const breathe = Math.sin(t * 2.3 + ph) * (1 - up);
  const bob = Math.abs(Math.sin(gait)) * A.bob * env;
  const dy = bob - 0.025 * up * (1 - env) + breathe * 0.006;
  const rz = -dir * A.roll * env + Math.sin(gait) * 0.06 * env + (1 - env) * Math.sin(t * 9 + ph) * 0.035 * up;
  const rx = -0.08 * up + breathe * 0.012;
  const ry = dir * A.yaw * env + Math.sin(t * 0.5 + ph) * 0.06 * (1 - up);
  const body = P[1 + SR.body] as THREE.Object3D;
  body.position.y = SC_BODY_Y + dy;
  body.rotation.set(rx, ry, rz);
  body.scale.set(1 - breathe * 0.006, 1 + breathe * 0.018, 1 - breathe * 0.006);

  // legs: lift about each hip (in the body's frame), swing fore and aft, and cancel the body's roll,
  // pitch and bob so the planted tips stay on the sand
  for (let j = 0; j < 8; j++) {
    const grp = SC_GROUP[j] as number;
    let lift = 0;
    let swing = 0;
    if (crossing) {
      const phi = gait + grp * Math.PI;
      lift = Math.max(0, Math.sin(phi)) * A.legLift * Math.min(1, env * 2.5);
      swing = Math.cos(phi) * A.legSwing * env;
    } else if (up > 0.01) {
      lift = Math.max(0, Math.sin(t * 13 + grp * Math.PI + ph)) * 0.16 * up;
    } else {
      const f = Math.sin(t * 0.9 + j * 2.1 + ph);
      lift = f > 0.94 ? ((f - 0.94) / 0.06) * 0.25 : 0;
    }
    const tip = SR.legTip[j] as [number, number, number];
    lift += (-tip[0] * rz + tip[2] * rx - dy) / SR.legReach;
    const b = P[1 + SR.leg0 + j] as THREE.Object3D;
    b.quaternion.setFromAxisAngle(SC_LEG_AXIS[j] as THREE.Vector3, lift);
    _scQ.setFromAxisAngle(_scY, swing);
    b.quaternion.premultiply(_scQ);
  }

  for (let k = 0; k < 2; k++) {
    const s = k ? 1 : -1;
    // eyes: look about at rest; perk up and glare when warned; jiggle while running
    const eye = P[1 + (SR.eye[k] as number)] as THREE.Object3D;
    eye.position.y = SC_EYE_Y + 0.035 * up;
    eye.rotation.set(-0.1 * up + Math.sin(gait * 2 + k) * 0.08 * env, Math.sin(t * 0.7 + ph + k * 0.5) * 0.3 * (1 - up), s * 0.06 * up + Math.sin(gait * 2 + k) * 0.1 * env);
    // claws: a low guard at rest; raised, spread and pumping (alternately) when warned
    const arm = P[1 + (SR.arm[k] as number)] as THREE.Object3D;
    const pump = Math.sin(t * 7.5 + k * Math.PI) * 0.1 * up;
    const sway = Math.sin(t * 1.7 + ph + k) * 0.05 * (1 - up);
    arm.rotation.set(-A.clawRaise * up - pump + sway + Math.sin(gait) * 0.08 * env, s * A.clawSpread * up, s * 0.05 * up);
    // fingers: open slowly, snap shut fast
    const u = t * A.snapHz + k * 0.45 + ph;
    const fr = u - Math.floor(u);
    const snap = fr < 0.75 ? fr / 0.75 : 1 - (fr - 0.75) / 0.25;
    const open = up * (0.06 + A.snapOpen * snap) + (1 - up) * (0.08 + Math.sin(t * 1.3 + k + ph) * 0.06);
    (P[1 + (SR.finger[k] as number)] as THREE.Object3D).quaternion.setFromAxisAngle(SC_FINGER_AXIS[k] as THREE.Vector3, open);
  }

  ar.visible = e.state === 1;
  ar.rotation.y = dir > 0 ? 0 : Math.PI;
  ar.position.x = dir * (0.6 + (Math.sin(t * 8) * 0.5 + 0.5) * 0.25);
}

const _olCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/**
 * Outline hull geometry: positions with normals averaged across coincident vertices so the pushed-out
 * hull stays closed at hard edges. Wind-animated triangles (flags) are dropped; the hull doesn't move.
 * Skin weights are kept, so a rigged model's hull can ride the same skeleton (the scuttler).
 */
function outlineGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let o = _olCache.get(g);
  if (o) return o;
  const src = g.index ? g.toNonIndexed() : g;
  const pa = src.attributes.position as THREE.BufferAttribute;
  const na = src.attributes.normal as THREE.BufferAttribute;
  const ca = src.attributes.color as THREE.BufferAttribute;
  const wa = src.attributes.wind as THREE.BufferAttribute | undefined;
  const si = src.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const sw = src.attributes.skinWeight as THREE.BufferAttribute | undefined;
  const keep: number[] = [];
  for (let t = 0; t < pa.count; t += 3) {
    if (wa && (wa.getX(t) !== 0 || wa.getX(t + 1) !== 0 || wa.getX(t + 2) !== 0)) continue;
    keep.push(t, t + 1, t + 2);
  }
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number): string => `${Math.round(pa.getX(i) * 500)},${Math.round(pa.getY(i) * 500)},${Math.round(pa.getZ(i) * 500)}`;
  for (const i of keep) {
    const k = key(i);
    const v = sum.get(k) ?? [0, 0, 0];
    v[0] += na.getX(i);
    v[1] += na.getY(i);
    v[2] += na.getZ(i);
    sum.set(k, v);
  }
  const pos = new Float32Array(keep.length * 3);
  const nor = new Float32Array(keep.length * 3);
  const col = new Float32Array(keep.length * 3);
  const skI = si ? new Uint16Array(keep.length * 4) : null;
  const skW = sw ? new Float32Array(keep.length * 4) : null;
  keep.forEach((i, j) => {
    const v = sum.get(key(i)) as [number, number, number];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], j * 3);
    nor.set([v[0] / l, v[1] / l, v[2] / l], j * 3);
    col.set([ca.getX(i), ca.getY(i), ca.getZ(i)], j * 3);
    if (skI && si) skI.set([si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], j * 4);
    if (skW && sw) skW.set([sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], j * 4);
  });
  o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  o.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (skI) o.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4));
  if (skW) o.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skW, 4));
  _olCache.set(g, o);
  return o;
}

interface Flying {
  v: View;
  t: number;
  vx: number;
  vy: number;
  spin: number;
  z: number;
  wz: number;
}

/** Keeps a pooled 3D view for every live sim entity. */
export class EntityViews {
  readonly group = new THREE.Group();
  private active = new Map<number, View>();
  private pools = new Map<string, View[]>();
  private geos = new O.ObstacleGeos();
  private stamp = 0;
  private flying: Flying[] = [];
  private signs: THREE.Texture[] = [];
  private bestTex: THREE.CanvasTexture | null = null;
  private bestValue = -1;
  /** Low tier: fewer meshes per pickup */
  lite = false;
  /** High tier: near obstacles cast into the shadow map instead of drawing a blob */
  castShadows = false;
  /** current track distance (for animations that react to approach) */
  private dist = 0;
  private outlineMat = makeOutline(0.03, 0x3a2416, 0.6);
  private outlinesOn = true;
  private allOutlines: THREE.Object3D[] = [];
  private bubbleGeo = new THREE.SphereGeometry(0.62, 20, 14);
  private bubbleMat: THREE.ShaderMaterial;

  constructor(private mats: Materials) {
    this.bubbleMat = makeBubble(mats.lighting.uniforms.uTime);
    for (let z = 0; z < CFG.zoneNames.length; z++) {
      this.signs.push(O.signTexture(CFG.zoneNames[z] as string, z === 3 ? 'the endless lagoon' : `area ${z + 1} of 4`));
    }
  }

  /** Repaint the arch sign fonts once webfonts are loaded. */
  refreshSigns(): void {
    for (let z = 0; z < this.signs.length; z++) {
      const t = O.signTexture(CFG.zoneNames[z] as string, z === 3 ? 'the endless lagoon' : `area ${z + 1} of 4`);
      (this.signs[z] as THREE.CanvasTexture).image = t.image;
      (this.signs[z] as THREE.CanvasTexture).needsUpdate = true;
    }
    this.bestValue = -1;
  }

  setBest(m: number): void {
    if (Math.round(m) === this.bestValue) return;
    this.bestValue = Math.round(m);
    const t = O.signTexture(`BEST ${this.bestValue.toLocaleString()} m`, 'beat it!', '#ffc933');
    if (!this.bestTex) this.bestTex = t;
    else {
      this.bestTex.image = t.image;
      this.bestTex.needsUpdate = true;
    }
  }

  private make(e: Entity): View {
    const key = this.keyOf(e);
    const pool = this.pools.get(key);
    const pooled = pool?.pop();
    if (pooled) return pooled;
    const g = this.geos;
    const M = this.mats;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material = M.clay): THREE.Mesh => new THREE.Mesh(geo, mat);
    let v: View;
    switch (e.kind) {
      case 'block':
      case 'low': {
        // Update 8: one model per (kind, zone skin, variant) with three detail levels: `lo` (Low tier and
        // beyond LOD_DIST), `hi` (Medium) and `rich` (High: extra props, same silhouette)
        const vr = e.id % 2;
        const sk = e.skin === 3 ? 0 : e.skin;
        const k = `${e.kind}${sk}.${vr}`;
        const kind = e.kind;
        const hi = g.get(k, () => O.obstacleModel(kind, sk, vr));
        const lo = g.get(`${k}lo`, () => O.obstacleModel(kind, sk, vr, true));
        const rich = g.get(`${k}rich`, () => O.obstacleModel(kind, sk, vr, false, true));
        // castles fly a flag and zone 2 spines/coral sway: those take the wind material
        const windy = (kind === 'block' && sk === 0) || (kind === 'low' && sk === 2);
        v = this.lodView(key, hi, lo, windy ? M.clayWind : M.clay, kind === 'block' ? [2.3, 1.7] : [2.4, 0.9], true, rich);
        if (kind === 'block') break;
        // it rocks for a moment after the crab scuttles over (a function of distance: no state to reset)
        v.anim = (vv, ee) => {
          const rel = ee.wz - this.dist;
          vv.obj.rotation.x = rel < 0 && rel > -6 ? Math.sin(-rel * 5) * 0.09 * Math.exp(rel * 0.8) : 0;
        };
        break;
      }
      case 'scuttle': {
        // Update 9: one skinned crab (legs, claws, fingers and eyes on bones) and its outline hull on the
        // same skeleton: two draw calls plus the sand arrow. lo / hi / rich swap the mesh; the hull swaps
        // between its own low and high silhouette passes.
        const hi = g.get('scut', () => O.scuttlerGeometry('hi'));
        const lo = g.get('scutlo', () => O.scuttlerGeometry('lo'));
        const rich = g.get('scutrich', () => O.scuttlerGeometry('rich'));
        const olHi = outlineGeo(g.get('scutlinehi', () => O.scuttlerGeometry('lineHi')));
        const olLo = outlineGeo(g.get('scutlinelo', () => O.scuttlerGeometry('lineLo')));
        const rig = O.makeRig(hi, M.clay, O.SCUTTLE_JOINTS, this.outlineMat, olHi);
        // the threat pose turns each claw up and out from the shoulder: yaw, then pitch, then roll
        for (const i of O.SCUTTLE_RIG.arm) (rig.bones[i] as THREE.Bone).rotation.order = 'ZXY';
        const arrow = new THREE.Mesh(g.get('scutarrow', () => O.scuttleArrow()), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
        arrow.position.set(0, 0.02, 0.9);
        arrow.scale.setScalar(1.5);
        const grp = new THREE.Group();
        grp.add(rig.group, arrow);
        v = { obj: grp, key, stamp: 0, shadow: [1.5, 1.1], parts: [arrow, ...rig.bones], enter: -1, memo: { landed: -1, squawk: 0, raise: 0 } };
        v.lod = { mesh: rig.mesh, hi, lo, rich, olHi, olLo };
        if (rig.line) {
          rig.line.visible = this.outlinesOn || this.contrast;
          rig.line.castShadow = false;
          (v.outlines ??= []).push(rig.line);
          this.allOutlines.push(rig.line);
          v.lod.outline = rig.line;
        }
        v.anim = scuttleAnim;
        break;
      }
      case 'sweep': {
        if (e.skin === 1) {
          // a gap in the boardwalk: dark water hole, broken plank ends and chevrons
          const geo = g.get('gap', gapGeometry);
          v = { obj: mesh(geo), key, stamp: 0, shadow: [0, 0], enter: -1, memo: { landed: -1, squawk: 0 } };
        } else {
          v = this.lodView(key, g.get('wave', () => O.waveSweep()), g.get('wavelo', () => O.waveSweep(true)), M.gloss, [0, 0], false, g.get('waverich', () => O.waveSweep(false, true, true, true)));
          v.anim = (vv, ee, t) => {
            // the breaker leans forward as it closes in, with a surging bob
            const rel = ee.wz - this.dist;
            vv.obj.scale.y = 1 + Math.sin(t * 6) * 0.06;
            vv.obj.rotation.x = Math.max(0, Math.min(1, 1 - rel / 30)) * 0.16;
          };
        }
        break;
      }
      case 'roller': {
        const R = O.BALL_R;
        const ball = mesh(g.get('ball', () => O.beachBall()), M.gloss);
        ball.position.y = R;
        const grp = new THREE.Group();
        grp.add(ball);
        v = { obj: grp, key, stamp: 0, shadow: [1.3, 1.0], parts: [ball], enter: -1, memo: { landed: -1, squawk: 0 } };
        v.lod = { mesh: ball, hi: ball.geometry, lo: g.get('balllo', () => O.beachBall(true)), rich: g.get('ballrich', () => O.beachBall(false, true)) };
        this.addOutline(v, ball);
        v.anim = (vv, ee) => {
          const b = (vv.parts as THREE.Object3D[])[0] as THREE.Object3D;
          b.rotation.x = ee.spin;
          // bounce with a squash at each contact
          const ph = Math.abs(Math.sin(ee.spin * 0.5));
          b.position.y = R + ph * 0.22;
          const sq = 1 - Math.pow(1 - ph, 6) * 0.16;
          const sx = 1 / Math.sqrt(sq);
          b.scale.set(sx, sq, sx);
          b.position.y -= (1 - sq) * R;
        };
        break;
      }
      case 'gull': {
        if (e.alt === 1) {
          // coconut drop: a palm canopy high over the lane, the coconut falls when it's close
          const canopy = mesh(g.get('canopy', () => O.coconutCanopy()), M.clayWind);
          canopy.position.y = CFG.gull.height + 0.9;
          const nut = mesh(g.get('coconut', () => O.coconut()));
          const grp = new THREE.Group();
          grp.add(canopy, nut);
          v = { obj: grp, key, stamp: 0, shadow: [1.4, 1.2], parts: [nut, canopy], enter: -1, memo: { landed: -1, squawk: 0 } };
          this.addOutline(v, nut);
          v.anim = (vv, ee, t) => {
            const [n, cn] = vv.parts as THREE.Object3D[];
            const m = vv.memo;
            if (ee.state === 2 && m.landed < 0) m.landed = t;
            if (ee.state !== 2) m.landed = -1;
            // hanging: a nervous wobble; falling: spin; landed: a squash and a little roll
            n!.position.y = ee.state === 0 ? CFG.gull.height + 0.55 + Math.sin(t * 9 + ee.id) * 0.04 : ee.y + 0.42;
            n!.rotation.z = ee.state === 0 ? Math.sin(t * 7) * 0.15 : n!.rotation.z + (ee.state === 1 ? 0.3 : 0);
            const since = m.landed < 0 ? 9 : t - m.landed;
            const sq = since < 0.25 ? 1 - Math.sin((since / 0.25) * Math.PI) * 0.25 : 1;
            n!.scale.set(2 - sq, sq, 2 - sq);
            cn!.rotation.y = Math.sin(t * 0.7) * 0.2;
          };
          break;
        }
        const rig = O.makeRig(g.get('gull2', () => O.gullGeometry()), M.clay, O.GULL_JOINTS, this.outlineMat);
        if (rig.line) {
          rig.line.visible = this.outlinesOn || this.contrast;
          this.allOutlines.push(rig.line);
        }
        const inner = new THREE.Group();
        inner.add(rig.group);
        const grp = new THREE.Group();
        grp.add(inner);
        v = { obj: grp, key, stamp: 0, shadow: [1.6, 1.4], parts: [inner, ...rig.bones], enter: -1, memo: { landed: -1, squawk: 0 } };
        v.anim = (vv, ee, t) => {
          const pp = vv.parts as THREE.Object3D[];
          const innerG = pp[0] as THREE.Object3D;
          const [, body, head, jaw, wl, wr, tail] = pp.slice(1) as THREE.Object3D[];
          innerG.position.y = ee.y;
          innerG.visible = ee.state > 0;
          const m = vv.memo;
          if (ee.state === 2 && m.landed < 0) m.landed = t;
          if (ee.state !== 2) m.landed = -1;
          const since = m.landed < 0 ? 0 : t - m.landed;
          // wings: fast flaps while dropping, a few settling flaps after landing, then folded
          const fold = ee.state === 2 ? Math.min(1, Math.max(0, (since - 0.35) / 0.3)) : 0;
          const flapAmp = ee.state === 2 ? 0.6 * (1 - fold) : 0.9;
          const flap = Math.sin(t * (ee.state === 2 ? 11 : 18)) * flapAmp + (ee.state === 2 ? 0.25 : 0.1);
          wl!.rotation.set(0, -1.45 * fold, flap * (1 - fold) + 0.2 * fold);
          wr!.rotation.set(0, 1.45 * fold, -flap * (1 - fold) - 0.2 * fold);
          body!.rotation.x = ee.state === 1 ? 0.35 : Math.sin(t * 2.1) * 0.03;
          // idle: head tilts, tail wags, a squawk every couple of seconds (beak opens)
          head!.rotation.set(0, Math.sin(t * 0.9) * 0.4 * fold, Math.sin(t * 1.7) * 0.25 * fold);
          tail!.rotation.y = Math.sin(t * 5) * 0.15 * fold;
          if (fold >= 1 && t > m.squawk) m.squawk = t + 1.8 + Math.random() * 1.8;
          const sq = m.squawk - t;
          jaw!.rotation.x = fold >= 1 && sq > 1.55 ? 0.45 : 0;
        };
        break;
      }
      case 'powerup': {
        const grp = new THREE.Group();
        const bubble = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        const kind = e.power ?? 'magnet';
        const icon = mesh(g.get(`pu-${kind}`, () => O.powerupIcon(kind)));
        // the surfboard is slim: it gets a bigger scale to fill the bubble like the others
        icon.scale.setScalar(kind === 'rider' ? 1.6 : 1.25);
        if (kind === 'rider') icon.rotation.z = 0.5;
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: M.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
        if (this.lite) grp.add(icon, bubble);
        else grp.add(glow, icon, bubble, ring);
        v = { obj: grp, key, stamp: 0, shadow: [1.0, 1.0], parts: [icon, ring, glow, bubble], enter: -1, memo: { landed: -1, squawk: 0 } };
        this.addOutline(v, icon);
        const tilt = kind === 'rider' ? 0.5 : 0;
        v.anim = (vv, ee, t) => {
          const pp = vv.parts as THREE.Object3D[];
          const ic = pp[0] as THREE.Object3D;
          const rg = pp[1] as THREE.Object3D;
          const gl = pp[2] as THREE.Object3D;
          // the bubble centre bobs (shell twinkles orbit it); it breathes, and the icon bobs, spins with
          // an ease and tilts inside it
          vv.obj.position.y = ee.y + Math.sin(t * 3) * 0.12;
          const br = Math.sin(t * 3.6);
          (pp[3] as THREE.Object3D).scale.set(1 + br * 0.045, 1 - br * 0.05, 1 + br * 0.045);
          ic.position.y = Math.sin(t * 3 + 1.2) * 0.06;
          ic.rotation.y = t * 2 + Math.sin(t * 2) * 0.4;
          ic.rotation.z = tilt + Math.sin(t * 1.7) * 0.12;
          rg.rotation.x = Math.PI / 2 + Math.sin(t * 2) * 0.3;
          rg.rotation.y = t;
          gl.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
        };
        break;
      }
      // ---- Island Hop
      case 'ring': {
        const ring = mesh(g.get('ring', () => O.shellRing()), M.gold);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: M.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
        const grp = new THREE.Group();
        grp.add(glow, ring);
        v = { obj: grp, key, stamp: 0, shadow: [0.9, 0.4], parts: [ring, glow], enter: -1, memo: { landed: -1, squawk: 0 } };
        this.addOutline(v, ring);
        v.anim = (vv, ee, t) => {
          const [r, gl] = vv.parts as THREE.Object3D[];
          vv.obj.position.y = ee.y + Math.sin(t * 2.5 + ee.id) * 0.08;
          r!.rotation.y = Math.sin(t * 1.6 + ee.id) * 0.35;
          r!.rotation.z = t * 0.6;
          gl!.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
        };
        break;
      }
      case 'dollar':
      case 'hourglass': {
        const grp = new THREE.Group();
        const coin = mesh(e.kind === 'dollar' ? g.get('dollar', () => O.sandDollar()) : g.get('hourglass', () => O.hourglass()), e.kind === 'dollar' ? M.gold : M.gloss);
        coin.scale.setScalar(e.kind === 'dollar' ? 1.05 : 1.1);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: M.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: e.kind === 'dollar' ? 0.8 : 0.55, color: e.kind === 'dollar' ? 0xffffff : 0xbfeaff }));
        glow.position.z = -0.1;
        grp.add(glow, coin);
        v = { obj: grp, key, stamp: 0, shadow: [0.8, 0.5], parts: [coin, glow], enter: -1, memo: { landed: -1, squawk: 0 } };
        v.anim = (vv, ee, t) => {
          const [c, gl] = vv.parts as THREE.Object3D[];
          vv.obj.position.y = ee.y + Math.sin(t * 3 + ee.id) * 0.1;
          c!.rotation.y = t * 2.6 + ee.id;
          gl!.scale.setScalar(1 + Math.sin(t * 5 + ee.id) * 0.1);
        };
        break;
      }
      case 'pad': {
        const m = mesh(g.get('pad', () => O.bouncePad()));
        v = { obj: m, key, stamp: 0, shadow: [0, 0], enter: -1, memo: { landed: -1, squawk: 0 } };
        v.anim = (vv, _e, t) => {
          vv.obj.scale.y = 1 + Math.sin(t * 7) * 0.06;
        };
        this.addOutline(v, m);
        break;
      }
      case 'tidepool':
        v = { obj: mesh(g.get('tidepool', () => O.tidePoolPatch()), M.gloss), key, stamp: 0, shadow: [0, 0], enter: -1, memo: { landed: -1, squawk: 0 } };
        break;
      case 'flag':
        v = { obj: mesh(g.get(`flag${e.state}`, () => O.finishArch(e.state === 1)), M.clayWind), key, stamp: 0, shadow: [0, 0], enter: -1, memo: { landed: -1, squawk: 0 } };
        break;
      case 'arch':
      case 'banner': {
        const grp = new THREE.Group();
        const frame = mesh(g.get('arch', () => O.archFrame()));
        const tex = e.kind === 'banner' ? (this.bestTex ?? O.signTexture('BEST', '')) : (this.signs[e.skin] as THREE.Texture);
        const sign = O.makeSignMesh(M, tex);
        grp.add(frame, sign);
        v = { obj: grp, key, stamp: 0, shadow: [0, 0], parts: [sign], enter: -1, memo: { landed: -1, squawk: 0 } };
        break;
      }
      default:
        v = { obj: new THREE.Object3D(), key, stamp: 0, shadow: [0, 0], enter: -1, memo: { landed: -1, squawk: 0 } };
    }
    // Update 9: only the big blocks and logs cast into the map; the scuttler, ball and pickups keep a blob
    const cast = v.shadow[0] > 0 && (e.kind === 'block' || e.kind === 'low');
    const casters: THREE.Object3D[] = [];
    v.obj.traverse((o) => {
      o.frustumCulled = false;
      if (cast && (o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== this.outlineMat) casters.push(o);
    });
    if (casters.length) v.casters = casters;
    v.casting = false;
    return v;
  }

  /** single-mesh view with a low-detail geometry beyond LOD_DIST and an outline hull */
  private lodView(key: string, hi: THREE.BufferGeometry, lo: THREE.BufferGeometry, mat: THREE.Material, shadow: [number, number], outline = true, rich?: THREE.BufferGeometry): View {
    const m = new THREE.Mesh(hi, mat);
    const v: View = { obj: m, key, stamp: 0, shadow, enter: -1, memo: { landed: -1, squawk: 0 } };
    v.lod = { mesh: m, hi, lo, rich };
    if (outline) {
      // the hull always uses the low-detail silhouette: outlines are thick enough to hide the difference
      const ol = this.addOutline(v, m, lo);
      v.lod.outline = ol;
      v.lod.olHi = ol.geometry;
      v.lod.olLo = ol.geometry;
    }
    return v;
  }

  private addOutline(v: View, m: THREE.Mesh, src: THREE.BufferGeometry = m.geometry): THREE.Mesh {
    const ol = new THREE.Mesh(outlineGeo(src), this.outlineMat);
    ol.visible = this.outlinesOn || this.contrast;
    ol.castShadow = false;
    m.add(ol);
    (v.outlines ??= []).push(ol);
    this.allOutlines.push(ol);
    return ol;
  }

  /** High-contrast outlines (Settings): thick bright edges so obstacles read for colour-blind players. */
  setContrast(on: boolean): void {
    const u = this.outlineMat.uniforms;
    (u.uInk as { value: THREE.Color }).value.set(on ? 0xffffff : 0x3a2416);
    (u.uTint as { value: number }).value = on ? 0 : 0.6;
    (u.uThickness as { value: number }).value = on ? 0.06 : 0.03;
    this.contrast = on;
    // contrast outlines show on every tier
    for (const o of this.allOutlines) o.visible = this.outlinesOn || on;
  }
  private contrast = false;

  /** Outlines on the crab, obstacles and power-ups: High and Medium only (UPDATE2_PLAN.md §1.3). */
  setOutlines(on: boolean): void {
    this.outlinesOn = on;
    for (const o of this.allOutlines) o.visible = on || this.contrast;
  }

  private keyOf(e: Entity): string {
    if (e.kind === 'powerup') return `powerup:${e.power}`;
    if (e.kind === 'gull' && e.alt === 1) return 'coconut';
    if (e.kind === 'ring') return 'ring';
    if (e.kind === 'scuttle') return 'scuttle';
    if (e.kind === 'roller' || e.kind === 'gull' || e.kind === 'banner' || e.kind === 'dollar' || e.kind === 'hourglass' || e.kind === 'pad' || e.kind === 'tidepool') return e.kind;
    if (e.kind === 'flag') return `flag:${e.state}`;
    if (e.kind === 'arch') return `arch:${e.skin}`;
    const skin = e.skin === 3 ? 0 : e.skin; // sunset reuses shore skins
    // two model variants per obstacle, picked by entity id
    return e.kind === 'block' || e.kind === 'low' ? `${e.kind}:${skin}:${e.id % 2}` : `${e.kind}:${skin}`;
  }

  /** Detach a knocked entity's view and let it tumble away; returns where it was (for a crumble burst). */
  knock(id: number, dist: number): { x: number; wz: number; key: string } | null {
    const v = this.active.get(id);
    if (!v) return null;
    this.active.delete(id);
    const wz = dist - v.obj.position.z;
    this.flying.push({ v, t: 0, vx: (Math.random() - 0.5) * 8, vy: 7 + Math.random() * 3, spin: (Math.random() - 0.5) * 12, z: v.obj.position.z, wz });
    return { x: v.obj.position.x, wz, key: v.key };
  }

  sync(entities: readonly Entity[], dist: number, time: number, dt: number, shadows: BlobShadows): void {
    const stamp = ++this.stamp;
    this.dist = dist;
    for (const e of entities) {
      if (e.dead) continue;
      let v = this.active.get(e.id);
      if (!v) {
        v = this.make(e);
        if (e.kind === 'banner' && v.parts && this.bestTex) {
          ((v.parts[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).map = this.bestTex;
        }
        this.active.set(e.id, v);
        this.group.add(v.obj);
      }
      v.stamp = stamp;
      const rel = e.wz - dist;
      v.obj.position.set(e.x, 0, -rel);
      v.obj.visible = !((e.kind === 'arch' || e.kind === 'banner') && rel < -2.5);
      v.obj.rotation.set(0, 0, 0);
      v.obj.scale.setScalar(1);
      v.anim?.(v, e, time);
      // distance LOD
      if (v.lod) {
        // Low tier always uses the low-detail models
        // High tier (the one that casts shadows) shows the rich model within RICH_DIST
        const far = this.lite || rel > LOD_DIST;
        const want = far ? v.lod.lo : this.castShadows && v.lod.rich && rel < RICH_DIST ? v.lod.rich : v.lod.hi;
        if (v.lod.mesh.geometry !== want) {
          v.lod.mesh.geometry = want;
          if (v.lod.outline) v.lod.outline.geometry = (far ? v.lod.olLo : v.lod.olHi) as THREE.BufferGeometry;
        }
      }
      // entrance: a springy pop as it comes within ENTER_DIST (castles build up, others bounce)
      if (v.enter < 0 && rel < ENTER_DIST) v.enter = 0;
      if (v.enter >= 0 && v.enter < 0.6) {
        v.enter += dt;
        const k = easeOutBack(Math.min(1, v.enter / 0.45));
        if (e.kind === 'block') v.obj.scale.set(v.obj.scale.x * (0.85 + 0.15 * k), v.obj.scale.y * (0.6 + 0.4 * k), v.obj.scale.z * (0.85 + 0.15 * k));
        else if (e.kind === 'low') v.obj.scale.multiplyScalar(0.7 + 0.3 * k);
      }
      // near blocks and logs cast into the shadow map (SHADOW_DIST); everything else draws a blob
      const inMap = this.castShadows && rel < SHADOW_DIST && rel > -10 && v.casters !== undefined;
      if (v.casters && inMap !== v.casting) {
        v.casting = inMap;
        for (let i = 0; i < v.casters.length; i++) (v.casters[i] as THREE.Object3D).castShadow = inMap;
      }
      if (v.shadow[0] > 0 && rel < 100 && !inMap) {
        let sx = v.shadow[0];
        let sz = v.shadow[1];
        if (e.kind === 'gull') {
          // warning shadow grows as the gull drops in
          const f = e.state === 0 ? 0.55 : e.state === 1 ? 0.55 + (1 - e.y / CFG.gull.height) * 0.45 : 1;
          sx *= f;
          sz *= f;
        }
        shadows.add(e.x, 0, -rel, sx, sz);
      }
    }
    for (const [id, v] of this.active) {
      if (v.stamp !== stamp) {
        this.release(v);
        this.active.delete(id);
      }
    }
    // tumbling debris
    let w = 0;
    for (let i = 0; i < this.flying.length; i++) {
      const f = this.flying[i] as Flying;
      f.t += dt;
      if (f.t > 1.0) {
        this.release(f.v);
        continue;
      }
      f.vy -= 25 * dt;
      f.v.obj.position.x += f.vx * dt;
      f.v.obj.position.y += f.vy * dt;
      f.v.obj.position.z = -(f.wz - dist) - f.t * 6;
      f.v.obj.rotation.x += f.spin * dt;
      f.v.obj.rotation.z += f.spin * 0.7 * dt;
      f.v.obj.scale.setScalar(Math.max(0.01, 1 - f.t * 0.9));
      this.flying[w++] = f;
    }
    this.flying.length = w;
  }

  private release(v: View): void {
    this.group.remove(v.obj);
    let pool = this.pools.get(v.key);
    if (!pool) {
      pool = [];
      this.pools.set(v.key, pool);
    }
    v.obj.scale.setScalar(1);
    v.obj.rotation.set(0, 0, 0);
    v.enter = -1;
    v.memo.landed = -1;
    v.memo.raise = 0;
    v.memo.t = undefined;
    pool.push(v);
  }

  clear(): void {
    for (const v of this.active.values()) this.release(v);
    this.active.clear();
    for (const f of this.flying) this.release(f.v);
    this.flying.length = 0;
  }
}

/** Boardwalk gap: dark water opening with yellow chevrons on the planks before it. */
function gapGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const hw = CFG.trackHalfWidth + 0.9;
  b.box(0x0f4f7a, hw * 2 - 0.2, 0.05, 1.5, [0, 0.005, 0]);
  b.box(0x1b7fb0, hw * 2 - 0.6, 0.05, 1.1, [0, 0.01, 0]);
  b.box(0xffffff, hw * 2 - 0.6, 0.03, 0.1, [0, 0.03, 0.52]);
  b.box(0x6b4423, hw * 2, 0.12, 0.12, [0, 0.03, 0.78]);
  b.box(0x6b4423, hw * 2, 0.12, 0.12, [0, 0.03, -0.78]);
  // splintered plank ends jutting over the hole
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = -hw + 0.4 + i * ((hw * 2 - 0.8) / 8);
      const len = 0.08 + Math.abs(Math.sin(i * 12.9898 + side * 3.1)) * 0.3;
      b.box(i % 2 ? 0xb98550 : 0xa8743f, 0.38, 0.07, len, [x, 0.0, side * (0.75 - len / 2)], [0, Math.sin(i * 7.7) * 0.12, Math.sin(i * 3.3 + side) * 0.08]);
    }
  }
  // a ripple ring on the water below
  b.torus(0x8fd8ff, 0.5, 0.025, [0.6, 0.02, 0.0], [Math.PI / 2, 0, 0], 16, [1.6, 1, 1]);
  for (const x of [-2.2, 0, 2.2]) {
    for (let k = 0; k < 2; k++) {
      const z = 1.2 + k * 0.5;
      b.box(0xffd23a, 0.62, 0.04, 0.14, [x - 0.28, 0.02, z], [0, -0.7, 0]);
      b.box(0xffd23a, 0.62, 0.04, 0.14, [x + 0.28, 0.02, z], [0, 0.7, 0]);
    }
  }
  return b.build();
}
