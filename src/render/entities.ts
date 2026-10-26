import * as THREE from 'three';
import { CFG } from '../config';
import type { Entity } from '../sim/types';
import type { BlobShadows } from './fx';
import { GeoBuilder } from './geo';
import type { Materials } from './materials';
import * as O from './models/obstacles';
import * as P from './props';

interface View {
  obj: THREE.Object3D;
  key: string;
  stamp: number;
  shadow: [number, number];
  anim?: (v: View, e: Entity, t: number) => void;
  parts?: THREE.Object3D[];
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

  constructor(private mats: Materials) {
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
        const geo =
          e.skin === 1 ? g.get('crates', () => P.crateStack()) : e.skin === 2 ? g.get('boulder', () => P.boulder(17)) : g.get('castle', () => O.sandcastle());
        v = { obj: mesh(geo), key, stamp: 0, shadow: [2.3, 1.9] };
        break;
      }
      case 'low': {
        const geo = e.skin === 1 ? g.get('chair', () => P.deckChair()) : e.skin === 2 ? g.get('urchins', () => P.urchins()) : g.get('log', () => O.driftwoodLog());
        v = { obj: mesh(geo), key, stamp: 0, shadow: [2.4, 1.0] };
        break;
      }
      case 'sweep': {
        if (e.skin === 1) {
          // a gap in the boardwalk: dark water hole + chevrons painted on the planks
          const geo = g.get('gap', gapGeometry);
          v = { obj: mesh(geo), key, stamp: 0, shadow: [0, 0] };
        } else {
          v = { obj: mesh(g.get('wave', () => O.waveSweep()), M.gloss), key, stamp: 0, shadow: [0, 0] };
          v.anim = (vv, _e, t) => {
            vv.obj.scale.y = 1 + Math.sin(t * 6) * 0.06;
          };
        }
        break;
      }
      case 'roller': {
        const ball = mesh(g.get('ball', () => O.beachBall()), M.gloss);
        ball.position.y = 0.58;
        const grp = new THREE.Group();
        grp.add(ball);
        v = { obj: grp, key, stamp: 0, shadow: [1.3, 1.0], parts: [ball] };
        v.anim = (vv, ee) => {
          const b = (vv.parts as THREE.Object3D[])[0] as THREE.Object3D;
          b.rotation.x = ee.spin;
          b.position.y = 0.58 + Math.abs(Math.sin(ee.spin * 0.5)) * 0.06;
        };
        break;
      }
      case 'gull': {
        const grp = new THREE.Group();
        const body = mesh(g.get('gull', () => O.gullBody()));
        const wingGeo = g.get('gullWing', () => O.gullWing());
        const wl = new THREE.Group();
        const wr = new THREE.Group();
        wl.position.set(-0.35, 1.0, -0.05);
        wr.position.set(0.35, 1.0, -0.05);
        const ml = mesh(wingGeo);
        ml.scale.x = -1;
        wl.add(ml);
        wr.add(mesh(wingGeo));
        const inner = new THREE.Group();
        inner.add(body, wl, wr);
        grp.add(inner);
        v = { obj: grp, key, stamp: 0, shadow: [1.6, 1.4], parts: [inner, wl, wr] };
        v.anim = (vv, ee, t) => {
          const [innerG, l, r] = vv.parts as THREE.Object3D[];
          innerG!.position.y = ee.y;
          const flap = ee.state === 2 ? Math.sin(t * 9) * 0.35 + 0.4 : Math.sin(t * 18) * 0.9;
          l!.rotation.z = flap;
          r!.rotation.z = -flap;
          innerG!.rotation.x = ee.state === 1 ? 0.35 : 0;
          innerG!.visible = ee.state > 0;
        };
        break;
      }
      case 'powerup': {
        const grp = new THREE.Group();
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.32, depthWrite: false }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        const kind = e.power ?? 'magnet';
        const icon = mesh(g.get(`pu-${kind}`, () => O.powerupIcon(kind)));
        icon.scale.setScalar(1.25);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: M.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
        grp.add(glow, icon, bubble, ring);
        v = { obj: grp, key, stamp: 0, shadow: [1.0, 1.0], parts: [icon, ring, glow] };
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
      case 'arch':
      case 'banner': {
        const grp = new THREE.Group();
        const frame = mesh(g.get('arch', () => O.archFrame()));
        const tex = e.kind === 'banner' ? (this.bestTex ?? O.signTexture('BEST', '')) : (this.signs[e.skin] as THREE.Texture);
        const sign = O.makeSignMesh(M, tex);
        grp.add(frame, sign);
        v = { obj: grp, key, stamp: 0, shadow: [0, 0], parts: [sign] };
        break;
      }
      default:
        v = { obj: new THREE.Object3D(), key, stamp: 0, shadow: [0, 0] };
    }
    v.obj.traverse((o) => (o.frustumCulled = false));
    return v;
  }

  private keyOf(e: Entity): string {
    if (e.kind === 'powerup') return `powerup:${e.power}`;
    if (e.kind === 'roller' || e.kind === 'gull' || e.kind === 'banner') return e.kind;
    if (e.kind === 'arch') return `arch:${e.skin}`;
    const skin = e.skin === 3 ? 0 : e.skin; // sunset reuses shore skins
    return `${e.kind}:${skin}`;
  }

  /** Detach a knocked entity's view and let it tumble away. */
  knock(id: number, dist: number): void {
    const v = this.active.get(id);
    if (!v) return;
    this.active.delete(id);
    const wz = dist - v.obj.position.z;
    this.flying.push({ v, t: 0, vx: (Math.random() - 0.5) * 8, vy: 7 + Math.random() * 3, spin: (Math.random() - 0.5) * 12, z: v.obj.position.z, wz });
  }

  sync(entities: readonly Entity[], dist: number, time: number, dt: number, shadows: BlobShadows): void {
    const stamp = ++this.stamp;
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
      if (v.shadow[0] > 0 && rel < 100) {
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
  for (const x of [-2.2, 0, 2.2]) {
    for (let k = 0; k < 2; k++) {
      const z = 1.2 + k * 0.5;
      b.box(0xffd23a, 0.62, 0.04, 0.14, [x - 0.28, 0.02, z], [0, -0.7, 0]);
      b.box(0xffd23a, 0.62, 0.04, 0.14, [x + 0.28, 0.02, z], [0, 0.7, 0]);
    }
  }
  return b.build();
}
