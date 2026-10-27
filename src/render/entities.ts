import * as THREE from 'three';
import { CFG } from '../config';
import type { Entity } from '../sim/types';
import type { BlobShadows } from './fx';
import { GeoBuilder } from './geo';
import type { Materials } from './materials';
import * as O from './models/obstacles';
import * as P from './props';
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
  lod?: { mesh: THREE.Mesh; hi: THREE.BufferGeometry; lo: THREE.BufferGeometry; outline?: THREE.Mesh; olHi?: THREE.BufferGeometry; olLo?: THREE.BufferGeometry };
  /** inverted-hull outlines (High/Medium) */
  outlines?: THREE.Object3D[];
  /** seconds since the entity came within the entrance distance (<0: not yet) */
  enter: number;
  /** per-view animation memory (gull landing time, squawks) */
  memo: { landed: number; squawk: number };
}

const LOD_DIST = 50;
const ENTER_DIST = 60;
const easeOutBack = (t: number): number => {
  const c = 1.9;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

const _olCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/**
 * Outline hull geometry: positions with normals averaged across coincident vertices so the pushed-out
 * hull stays closed at hard edges. Wind-animated triangles (flags) are dropped; the hull doesn't move.
 */
function outlineGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let o = _olCache.get(g);
  if (o) return o;
  const src = g.index ? g.toNonIndexed() : g;
  const pa = src.attributes.position as THREE.BufferAttribute;
  const na = src.attributes.normal as THREE.BufferAttribute;
  const ca = src.attributes.color as THREE.BufferAttribute;
  const wa = src.attributes.wind as THREE.BufferAttribute | undefined;
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
  keep.forEach((i, j) => {
    const v = sum.get(key(i)) as [number, number, number];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], j * 3);
    nor.set([v[0] / l, v[1] / l, v[2] / l], j * 3);
    col.set([ca.getX(i), ca.getY(i), ca.getZ(i)], j * 3);
  });
  o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  o.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
      case 'block': {
        const vr = e.id % 2;
        const [hi, lo] =
          e.skin === 1
            ? [g.get(`crates${vr}`, () => P.crateStack(vr)), g.get(`crates${vr}lo`, () => P.crateStack(vr, true))]
            : e.skin === 2
              ? [g.get(`boulder${vr}`, () => P.boulder(17 + vr * 6)), g.get(`boulder${vr}lo`, () => P.boulder(17 + vr * 6, true))]
              : [g.get(`castle${vr}`, () => O.sandcastle(vr)), g.get(`castle${vr}lo`, () => O.sandcastle(vr, true))];
        v = this.lodView(key, hi, lo, e.skin === 1 || e.skin === 2 ? M.clay : M.clayWind, [2.3, 1.9]);
        break;
      }
      case 'low': {
        const vr = e.id % 2;
        const [hi, lo] =
          e.skin === 1
            ? [g.get(`chair${vr}`, () => P.deckChair(vr)), g.get(`chair${vr}lo`, () => P.deckChair(vr, true))]
            : e.skin === 2
              ? [g.get(`urchins${vr}`, () => P.urchins(vr)), g.get(`urchins${vr}lo`, () => P.urchins(vr, true))]
              : [g.get(`log${vr}`, () => O.driftwoodLog(vr)), g.get(`log${vr}lo`, () => O.driftwoodLog(vr, true))];
        v = this.lodView(key, hi, lo, e.skin === 2 ? M.clayWind : M.clay, [2.4, 1.0]);
        // it rocks for a moment after the crab scuttles over (a function of distance: no state to reset)
        v.anim = (vv, ee) => {
          const rel = ee.wz - this.dist;
          vv.obj.rotation.x = rel < 0 && rel > -6 ? Math.sin(-rel * 5) * 0.09 * Math.exp(rel * 0.8) : 0;
        };
        break;
      }
      case 'sweep': {
        if (e.skin === 1) {
          // a gap in the boardwalk: dark water hole, broken plank ends and chevrons
          const geo = g.get('gap', gapGeometry);
          v = { obj: mesh(geo), key, stamp: 0, shadow: [0, 0], enter: -1, memo: { landed: -1, squawk: 0 } };
        } else {
          v = this.lodView(key, g.get('wave', () => O.waveSweep()), g.get('wavelo', () => O.waveSweep(true)), M.gloss, [0, 0], false);
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
        const ball = mesh(g.get('ball', () => O.beachBall()), M.gloss);
        ball.position.y = 0.58;
        const grp = new THREE.Group();
        grp.add(ball);
        v = { obj: grp, key, stamp: 0, shadow: [1.3, 1.0], parts: [ball], enter: -1, memo: { landed: -1, squawk: 0 } };
        v.lod = { mesh: ball, hi: ball.geometry, lo: g.get('balllo', () => O.beachBall(true)) };
        this.addOutline(v, ball);
        v.anim = (vv, ee) => {
          const b = (vv.parts as THREE.Object3D[])[0] as THREE.Object3D;
          b.rotation.x = ee.spin;
          // bounce with a squash at each contact
          const ph = Math.abs(Math.sin(ee.spin * 0.5));
          b.position.y = 0.58 + ph * 0.22;
          const sq = 1 - Math.pow(1 - ph, 6) * 0.16;
          const sx = 1 / Math.sqrt(sq);
          b.scale.set(sx, sq, sx);
          b.position.y -= (1 - sq) * 0.58;
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
        icon.scale.setScalar(1.25);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: M.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
        if (this.lite) grp.add(icon, bubble);
        else grp.add(glow, icon, bubble, ring);
        v = { obj: grp, key, stamp: 0, shadow: [1.0, 1.0], parts: [icon, ring, glow], enter: -1, memo: { landed: -1, squawk: 0 } };
        this.addOutline(v, icon);
        v.anim = (vv, ee, t) => {
          const [ic, rg, gl] = vv.parts as THREE.Object3D[];
          vv.obj.position.y = ee.y + Math.sin(t * 3) * 0.12;
          ic!.rotation.y = t * 2;
          rg!.rotation.x = Math.PI / 2 + Math.sin(t * 2) * 0.3;
          rg!.rotation.y = t;
          gl!.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
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
    const cast = v.shadow[0] > 0 && e.kind !== 'gull' && e.kind !== 'powerup' && e.kind !== 'dollar' && e.kind !== 'hourglass';
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
  private lodView(key: string, hi: THREE.BufferGeometry, lo: THREE.BufferGeometry, mat: THREE.Material, shadow: [number, number], outline = true): View {
    const m = new THREE.Mesh(hi, mat);
    const v: View = { obj: m, key, stamp: 0, shadow, enter: -1, memo: { landed: -1, squawk: 0 } };
    v.lod = { mesh: m, hi, lo };
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
        const far = this.lite || rel > LOD_DIST;
        const want = far ? v.lod.lo : v.lod.hi;
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
      // the shadow map covers the first ~40 m; blobs take over beyond it
      const inMap = this.castShadows && rel < 40 && rel > -10 && v.casters !== undefined;
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
