/**
 * The Crab Cove scene (UPDATE3_PLAN.md §6.3): a small island out in the bay, drawn only while the
 * Cove is open. Twelve plots in two rings around the gift pile, decorations (one draw call each),
 * and the friends who have moved in, wandering about. Plot screen positions drive the DOM editor.
 */
import * as THREE from 'three';
import { GeoBuilder, mergeAll, translated } from './geo';
import type { Materials } from './materials';
import * as P from './props';
import { decorGeometry } from './models/decor';
import { CRAB_SKINS, type CrabSkin, buildCrab } from './models/crab';
import { FRIENDS } from '../meta/friends';

/** where the Cove island sits in the scene (out in the bay, to the right of the beach) */
export const COVE_AT = new THREE.Vector3(34, -0.15, -30);
const PLOT_POS: [number, number][] = [
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return [Math.cos(a) * 5.9, Math.sin(a) * 4.9] as [number, number];
  }),
  ...Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    return [Math.cos(a) * 2.2, Math.sin(a) * 1.9] as [number, number];
  }),
];

interface Friend {
  id: string;
  mesh: THREE.Mesh;
  x: number;
  z: number;
  tx: number;
  tz: number;
  wait: number;
  hop: number;
}

export class CoveScene {
  readonly group = new THREE.Group();
  private decor: (THREE.Mesh | null)[] = [];
  private decorIds: (string | null)[] = [];
  private geos = new Map<string, THREE.BufferGeometry>();
  private friends: Friend[] = [];
  private gift: THREE.Mesh;
  private giftGlow: THREE.Mesh;
  private plotMarks: THREE.Mesh[] = [];
  private v = new THREE.Vector3();
  private t = 0;
  private pop = new Map<number, number>();
  editing = false;

  constructor(private mats: Materials) {
    this.group.position.copy(COVE_AT);
    this.group.visible = false;
    // the island: a sand mound with a wet rim, two palms, rocks and a little dock
    const b = new GeoBuilder();
    b.lathe(0xf2d49a, [[8.2, -0.3], [7.6, 0.12], [6.6, 0.42], [3.5, 0.6], [0, 0.62]], 40, [0, 0, 0], [0, 0, 0], [1, 1, 0.84]).paint((x, y, z, c) => {
      if (y < 0.2) c.lerp(new THREE.Color(0xc9a46a), 0.6);
    });
    const deco = [
      b.build(),
      translated(P.palm(21, 4.6, 0.8), -6.4, 0.3, -2.4, 0.5, 0.7),
      translated(P.palm(22, 4.0, -0.7), 6.6, 0.3, -1.6, 2.4, 0.65),
      translated(P.rock(5, 1.1), -5.8, 0.2, 3.4),
      translated(P.rock(7, 0.8), 6.0, 0.2, 3.0),
      translated(P.boat(0xff7a5a), 8.6, -0.1, 3.6, 0.6, 0.8),
    ];
    const island = new THREE.Mesh(mergeAll(deco), mats.clayWind);
    island.receiveShadow = true;
    this.group.add(island);
    // plot markers: soft sand rings (visible while editing, or when the plot is empty)
    const ring = new THREE.RingGeometry(0.85, 1.05, 24).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for (const [x, z] of PLOT_POS) {
      const m = new THREE.Mesh(ring, ringMat);
      m.position.set(x, 0.64, z);
      this.plotMarks.push(m);
      this.group.add(m);
      this.decor.push(null);
      this.decorIds.push(null);
    }
    // the gift pile: a mound of shells that grows with the waiting gifts
    const gp = new GeoBuilder();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const r = (i % 4) * 0.18;
      gp.sphere(i % 3 ? 0xffc93a : 0xfff0c0, 0.22, [Math.cos(a) * r, 0.18 + Math.floor(i / 5) * 0.18, Math.sin(a) * r], [1, 0.55, 1], 7);
    }
    this.gift = new THREE.Mesh(gp.build(), mats.gold);
    this.gift.position.set(0, 0.62, 0);
    this.giftGlow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: mats.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    this.giftGlow.position.set(0, 1.2, 0);
    this.group.add(this.gift, this.giftGlow);
  }

  /** world-space position of plot i (for screen projection) */
  plotWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    const p = PLOT_POS[i] as [number, number];
    return out.set(p[0], 0.7, p[1]).add(COVE_AT);
  }

  get center(): THREE.Vector3 {
    return COVE_AT;
  }

  /** show the placed decorations (new ones pop in) */
  setPlots(plots: readonly (string | null)[]): void {
    plots.forEach((id, i) => {
      if (this.decorIds[i] === id) return;
      const old = this.decor[i];
      if (old) this.group.remove(old);
      this.decor[i] = null;
      this.decorIds[i] = id;
      if (!id) return;
      let geo = this.geos.get(id);
      if (!geo) {
        geo = decorGeometry(id);
        this.geos.set(id, geo);
      }
      const m = new THREE.Mesh(geo, this.mats.clayWind);
      const [x, z] = PLOT_POS[i] as [number, number];
      m.position.set(x, 0.62, z);
      // face the middle of the island
      m.rotation.y = Math.atan2(-x, -z) + Math.PI;
      m.castShadow = true;
      this.group.add(m);
      this.decor[i] = m;
      this.pop.set(i, 0);
    });
  }

  /** friends who live here (built once each, low detail, one mesh) */
  setFriends(ids: readonly string[]): void {
    for (const id of ids) {
      if (this.friends.some((f) => f.id === id)) continue;
      const def = FRIENDS.find((f) => f.id === id);
      if (!def) continue;
      const skin: CrabSkin = { ...(CRAB_SKINS[0] as CrabSkin), id, name: def.name, body: def.body, dark: def.dark, belly: def.belly, pattern: undefined };
      const g = new GeoBuilder();
      buildCrab(skin, false, g, g, g);
      const mesh = new THREE.Mesh(g.build(), this.mats.clay);
      mesh.scale.setScalar(0.55);
      mesh.castShadow = true;
      const a = this.friends.length * 1.9;
      const f: Friend = { id, mesh, x: Math.cos(a) * 3.8, z: Math.sin(a) * 3, tx: 0, tz: 0, wait: Math.random() * 2, hop: 0 };
      f.tx = f.x;
      f.tz = f.z;
      this.group.add(mesh);
      this.friends.push(f);
    }
  }

  /** where friend `id` stands (screen bubbles) */
  friendWorld(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const f = this.friends.find((k) => k.id === id);
    if (!f) return null;
    return out.set(f.x, 1.6, f.z).add(COVE_AT);
  }

  update(dt: number, gifts: number, camQ: THREE.Quaternion): void {
    this.t += dt;
    const t = this.t;
    // gift pile grows with what's waiting and glows when there's something to collect
    const k = Math.min(1, gifts / 600);
    this.gift.visible = gifts > 0;
    this.gift.scale.setScalar(0.6 + k * 0.8 + Math.sin(t * 3) * 0.03);
    this.giftGlow.visible = gifts > 0;
    (this.giftGlow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.5));
    this.giftGlow.quaternion.copy(camQ);
    for (let i = 0; i < this.plotMarks.length; i++) {
      const mark = this.plotMarks[i] as THREE.Mesh;
      mark.visible = this.editing || !this.decor[i];
      mark.scale.setScalar(this.editing ? 1 + Math.sin(t * 4 + i) * 0.05 : 0.8);
    }
    // pop-in for newly placed decorations
    for (const [i, s] of this.pop) {
      const m = this.decor[i];
      const n = s + dt;
      if (!m || n > 0.5) {
        if (m) m.scale.setScalar(1);
        this.pop.delete(i);
        continue;
      }
      const e = n / 0.5;
      m.scale.setScalar(1 + Math.sin(e * Math.PI) * 0.25 - (1 - e) * (1 - e) * 0.6);
      this.pop.set(i, n);
    }
    // friends wander between spots, hopping as they go
    for (const f of this.friends) {
      const dx = f.tx - f.x;
      const dz = f.tz - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) {
        f.wait -= dt;
        if (f.wait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 3.6;
          f.tx = Math.cos(a) * r;
          f.tz = Math.sin(a) * r * 0.8;
          f.wait = 1.5 + Math.random() * 3;
        }
        f.hop = Math.max(0, f.hop - dt * 3);
      } else {
        const sp = Math.min(d, dt * 1.4);
        f.x += (dx / d) * sp;
        f.z += (dz / d) * sp;
        f.hop += dt * 9;
        f.mesh.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
      }
      f.mesh.position.set(f.x, 0.62 + Math.abs(Math.sin(f.hop)) * 0.12, f.z);
    }
  }

  projected(i: number, cam: THREE.Camera, w: number, h: number): { x: number; y: number; visible: boolean } {
    const v = this.plotWorld(i, this.v).project(cam);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 };
  }
}
