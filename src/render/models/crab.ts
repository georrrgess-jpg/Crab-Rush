import * as THREE from 'three';
import { PALETTE } from '../../config';
import { GeoBuilder, mergeAll } from '../geo';
import type { Materials } from '../materials';

export type HatKind = 'straw' | 'shades' | 'flower' | 'pirate' | 'captain' | 'tophat';

export interface CrabSkin {
  id: string;
  name: string;
  body: number;
  dark: number;
  belly: number;
  hat: HatKind;
  rainbow?: boolean;
  /** sand-puff tint while running */
  dust: number;
  blurb: string;
}

export const CRAB_SKINS: CrabSkin[] = [
  { id: 'sandy', name: 'Sandy', body: PALETTE.crabRed, dark: PALETTE.crabDark, belly: PALETTE.crabBelly, hat: 'straw', dust: 0xf6dda6, blurb: 'Your trusty beach buddy.' },
  { id: 'chill', name: 'Chill', body: 0x3f86e8, dark: 0x2358b8, belly: 0x9cc8ff, hat: 'shades', dust: 0xcfe8ff, blurb: 'Too cool for crashes.' },
  { id: 'blossom', name: 'Blossom', body: 0xf27ab8, dark: 0xc84f93, belly: 0xffc3e0, hat: 'flower', dust: 0xffd9ec, blurb: 'Smells like hibiscus.' },
  { id: 'skipper', name: 'Skipper', body: 0xf6c12e, dark: 0xd18a10, belly: 0xffe58a, hat: 'captain', dust: 0xffecb0, blurb: 'Steers a steady course.' },
  { id: 'pinch', name: "Cap'n Pinch", body: 0x4cbc5c, dark: 0x2b8a3e, belly: 0xa6e6a0, hat: 'pirate', dust: 0xd6f2c9, blurb: 'Arrr, mind the shells!' },
  { id: 'dazzle', name: 'Dazzle', body: 0xff4fa0, dark: 0x7a3fd0, belly: 0xffd35a, hat: 'tophat', rainbow: true, dust: 0xffffff, blurb: 'Magnificently sparkly.' },
];

const rainbow = (t: number): number => {
  const c = new THREE.Color().setHSL(((t % 1) + 1) % 1, 0.85, 0.58);
  return c.getHex();
};

type V3 = [number, number, number];

function buildHat(kind: HatKind, body: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'straw':
      // wide brim, domed crown, navy band, little bow
      b.cyl(PALETTE.strawHat, 0.74, 0.76, 0.06, [0, 0.0, 0], [0, 0, 0], 20);
      b.cyl(0xe8bf62, 0.76, 0.74, 0.03, [0, -0.02, 0], [0, 0, 0], 20);
      b.cyl(PALETTE.strawHat, 0.4, 0.47, 0.3, [0, 0.17, 0], [0, 0, 0], 16);
      b.sphere(PALETTE.strawHat, 0.4, [0, 0.3, 0], [1, 0.45, 1], 14);
      b.cyl(PALETTE.hatBand, 0.485, 0.49, 0.1, [0, 0.07, 0], [0, 0, 0], 16);
      b.box(PALETTE.hatBand, 0.12, 0.1, 0.06, [0.34, 0.07, 0.34]);
      break;
    case 'shades':
      b.box(0x1a1a24, 0.34, 0.2, 0.06, [-0.28, 0, 0]);
      b.box(0x1a1a24, 0.34, 0.2, 0.06, [0.28, 0, 0]);
      b.box(0x1a1a24, 0.24, 0.05, 0.05, [0, 0.04, 0]);
      b.box(0x6fb4ff, 0.1, 0.06, 0.07, [-0.36, 0.05, 0.01]);
      b.box(0x6fb4ff, 0.1, 0.06, 0.07, [0.2, 0.05, 0.01]);
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.sphere(0xff4f7a, 0.17, [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [1, 0.45, 1], 8);
      }
      b.sphere(0xffd23a, 0.1, [0, 0.05, 0], [1, 0.8, 1], 8);
      b.cone(0xffe9a0, 0.03, 0.22, [0.02, 0.2, 0], [0, 0, 0.2], 6);
      break;
    case 'pirate':
      b.cyl(0x15151c, 0.62, 0.7, 0.07, [0, 0, 0], [0, 0, 0], 3, [1.1, 1, 0.9]);
      b.sphere(0x15151c, 0.45, [0, 0.12, 0], [1.2, 0.55, 0.95], 12);
      b.box(0xf2f2ee, 0.2, 0.2, 0.05, [0, 0.12, 0.42], [0, 0, 0]);
      b.box(0x15151c, 0.05, 0.05, 0.06, [-0.045, 0.14, 0.45]);
      b.box(0x15151c, 0.05, 0.05, 0.06, [0.045, 0.14, 0.45]);
      b.box(0xf2f2ee, 0.5, 0.05, 0.04, [0, 0.05, 0.43], [0, 0, 0.5]);
      b.box(0xf2f2ee, 0.5, 0.05, 0.04, [0, 0.05, 0.43], [0, 0, -0.5]);
      b.box(0xe9b53a, 0.9, 0.04, 0.05, [0, 0.0, 0.44]);
      break;
    case 'captain':
      b.cyl(0x1f3f87, 0.5, 0.56, 0.22, [0, 0.12, 0], [0, 0, 0], 18);
      b.cyl(0xf6f2ea, 0.54, 0.54, 0.08, [0, 0.27, 0], [0, 0, 0], 18);
      b.cyl(0x15151c, 0.36, 0.5, 0.05, [0, 0.0, 0.3], [0.3, 0, 0], 14, [1.2, 1, 0.9]);
      b.cyl(0xe9b53a, 0.1, 0.1, 0.05, [0, 0.14, 0.52], [Math.PI / 2, 0, 0], 10);
      b.torus(0xe9b53a, 0.5, 0.025, [0, 0.2, 0], [Math.PI / 2, 0, 0], 20);
      break;
    case 'tophat':
      b.cyl(0x17171f, 0.6, 0.62, 0.05, [0, 0, 0], [0, 0, 0], 20);
      b.cyl(0x17171f, 0.36, 0.38, 0.5, [0, 0.27, 0], [0, 0, 0], 18);
      b.cyl(0x17171f, 0.37, 0.37, 0.03, [0, 0.52, 0], [0, 0, 0], 18);
      b.cyl(0xe03a8e, 0.385, 0.385, 0.1, [0, 0.1, 0], [0, 0, 0], 18);
      b.sphere(0xffd23a, 0.06, [0.37, 0.1, 0.05], [1, 1, 0.5], 6);
      break;
  }
  void body;
  return b.build();
}

/** The player's crab. Faces the camera (+z) and scuttles; legs, claws and eyes animate. */
export class CrabModel {
  readonly root = new THREE.Group();
  /** squash/stretch + lean live on this group, so `root` can be positioned freely */
  private readonly rig = new THREE.Group();
  private readonly bodyMesh: THREE.Mesh;
  private readonly head = new THREE.Group();
  private hatMesh: THREE.Mesh | null = null;
  private legs: { pivot: THREE.Group; side: number; idx: number }[] = [];
  private claws: { pivot: THREE.Group; up: THREE.Mesh; low: THREE.Mesh; side: number }[] = [];
  private eyes: THREE.Group[] = [];
  private readonly mats: Materials;
  skin: CrabSkin = CRAB_SKINS[0] as CrabSkin;
  private blinkT = 2;
  private blinkPhase = 0;
  private dizzy: THREE.Group;
  private stars: THREE.Mesh[] = [];
  private hatBasePos = new THREE.Vector3(0, 1.0, -0.06);

  constructor(mats: Materials) {
    this.mats = mats;
    this.root.add(this.rig);

    this.bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
    this.rig.add(this.bodyMesh);
    this.rig.add(this.head);

    // legs (3 per side)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.55, 0.42, 0.28 - i * 0.28);
        const m = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
        pivot.add(m);
        if (side < 0) pivot.scale.x = -1;
        this.rig.add(pivot);
        this.legs.push({ pivot, side, idx: i });
      }
    }
    // claws
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.66, 0.62, 0.3);
      const up = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
      const low = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
      const arm = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
      pivot.add(arm, up, low);
      (arm.userData as { arm: boolean }).arm = true;
      if (side < 0) pivot.scale.x = -1;
      this.rig.add(pivot);
      this.claws.push({ pivot, up, low, side });
    }
    // eyes
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(side * 0.27, 0.82, 0.3);
      this.rig.add(g);
      this.eyes.push(g);
    }
    this.dizzy = new THREE.Group();
    this.dizzy.visible = false;
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
      this.stars.push(star);
      this.dizzy.add(star);
    }
    this.root.add(this.dizzy);
    this.setSkin(CRAB_SKINS[0] as CrabSkin);
  }

  setSkin(skin: CrabSkin): void {
    this.skin = skin;
    const dispose = (m: THREE.Mesh): void => m.geometry.dispose();
    // body
    dispose(this.bodyMesh);
    const bb = new GeoBuilder();
    if (skin.rainbow) {
      // painted bands across the shell
      bb.sphere(skin.body, 0.5, [0, 0.52, 0], [1.3, 0.8, 1.0], 24);
      const g = bb.build();
      const pa = g.attributes.position as THREE.BufferAttribute;
      const ca = g.attributes.color as THREE.BufferAttribute;
      const c = new THREE.Color();
      for (let i = 0; i < pa.count; i++) {
        c.set(rainbow(pa.getX(i) * 0.45 + pa.getY(i) * 0.35 + 0.1));
        ca.setXYZ(i, c.r, c.g, c.b);
      }
      this.bodyMesh.geometry = g;
    } else {
      bb.sphere(skin.body, 0.5, [0, 0.52, 0], [1.3, 0.8, 1.0], 24);
      // subtle shell bumps
      bb.sphere(skin.dark, 0.1, [-0.3, 0.86, -0.1], [1, 0.5, 1], 8);
      bb.sphere(skin.dark, 0.1, [0.3, 0.86, -0.1], [1, 0.5, 1], 8);
      bb.sphere(skin.dark, 0.08, [0, 0.9, -0.28], [1, 0.5, 1], 8);
      this.bodyMesh.geometry = bb.build();
    }
    // belly merged into the body mesh (one draw call)
    const belly = new GeoBuilder().sphere(skin.belly, 0.44, [0, 0.43, 0.14], [1.2, 0.66, 0.95], 20).build();
    const merged = mergeAll([this.bodyMesh.geometry, belly]);
    this.bodyMesh.geometry.dispose();
    belly.dispose();
    this.bodyMesh.geometry = merged;

    // legs: thigh up/out then shin down
    const legColor = skin.rainbow ? 0xff7a3a : skin.dark;
    for (const leg of this.legs) {
      const m = leg.pivot.children[0] as THREE.Mesh;
      m.geometry.dispose();
      const lb = new GeoBuilder();
      lb.cyl(legColor, 0.05, 0.065, 0.34, [0.18, 0.06, 0], [0, 0, -1.05], 6);
      lb.cyl(legColor, 0.03, 0.05, 0.34, [0.4, -0.08, 0], [0, 0, 0.35], 6);
      lb.sphere(legColor, 0.05, [0.47, -0.26, 0], [1, 1, 1], 6);
      m.geometry = lb.build();
    }
    // claws
    for (const c of this.claws) {
      const arm = c.pivot.children[0] as THREE.Mesh;
      arm.geometry.dispose();
      arm.geometry = new GeoBuilder().cyl(skin.dark, 0.07, 0.09, 0.3, [0.1, 0.08, 0.08], [0.5, 0, -1.0], 8).build();
      for (const [m, flip] of [[c.up, 1], [c.low, -1]] as [THREE.Mesh, number][]) {
        m.geometry.dispose();
        m.position.set(0.22, 0.16, 0.2);
        const pb = new GeoBuilder();
        pb.sphere(skin.body, 0.19, [0.1, flip * 0.04, 0.1], [1.0, 0.55, 1.35], 10);
        pb.cone(skin.dark, 0.075, 0.26, [0.1, flip * 0.02, 0.34], [Math.PI / 2, 0, 0], 6, [1, 1, 0.7]);
        m.geometry = pb.build();
      }
    }
    // eyes
    for (const g of this.eyes) {
      while (g.children.length) {
        const ch = g.children.pop() as THREE.Mesh;
        ch.geometry.dispose();
      }
      const stalk = new THREE.Mesh(new GeoBuilder().cyl(skin.dark, 0.045, 0.06, 0.24, [0, -0.1, -0.02], [0.2, 0, 0], 6).build(), this.mats.clay);
      const ball = new THREE.Mesh(
        new GeoBuilder()
          .sphere(0xfafafa, 0.17, [0, 0.03, 0.03], [1, 1.05, 1], 14)
          .sphere(0x14141c, 0.095, [0, 0.03, 0.17], [1, 1.15, 0.7], 10)
          .sphere(0xffffff, 0.04, [-0.035, 0.08, 0.215], [1, 1, 0.6], 6)
          .build(),
        this.mats.gloss,
      );
      g.add(stalk, ball);
    }
    // hat
    if (this.hatMesh) {
      this.head.remove(this.hatMesh);
      this.hatMesh.geometry.dispose();
    }
    this.hatMesh = new THREE.Mesh(buildHat(skin.hat, skin.body), this.mats.clay);
    const pos = this.hatPos(skin.hat);
    this.hatBasePos.copy(pos.p);
    this.hatMesh.position.copy(pos.p);
    this.hatMesh.rotation.set(pos.rx, 0, 0);
    this.head.add(this.hatMesh);
  }

  private hatPos(k: HatKind): { p: THREE.Vector3; rx: number } {
    switch (k) {
      case 'straw':
        return { p: new THREE.Vector3(0, 0.99, -0.07), rx: -0.22 };
      case 'shades':
        return { p: new THREE.Vector3(0, 0.9, 0.46), rx: 0 };
      case 'flower':
        return { p: new THREE.Vector3(-0.44, 0.98, 0.0), rx: -0.4 };
      case 'pirate':
        return { p: new THREE.Vector3(0, 1.0, -0.08), rx: -0.2 };
      case 'captain':
        return { p: new THREE.Vector3(0, 0.99, -0.05), rx: -0.2 };
      case 'tophat':
        return { p: new THREE.Vector3(0, 0.98, -0.08), rx: -0.18 };
    }
  }

  /**
   * phase: leg cycle in radians; lean: -1..1 lateral lean; squash: 1 = neutral (<1 squashed);
   * crashT: seconds since crash (<0 = running)
   */
  pose(dt: number, phase: number, lean: number, squash: number, airborne: boolean, crashT: number, wobble: number, idle = false): void {
    const rig = this.rig;
    // squash & stretch (volume preserving)
    const sy = squash;
    const sxz = 1 / Math.sqrt(Math.max(0.5, squash));
    rig.scale.set(sxz, sy, sxz);

    if (crashT >= 0) {
      this.dizzy.visible = crashT > 0.25;
      const t = crashT;
      rig.rotation.x = -Math.min(1, t * 3) * 0.9;
      rig.rotation.z = Math.sin(t * 9) * 0.12 * Math.min(1, t * 2);
      rig.position.y = Math.sin(Math.min(t, 0.5) * Math.PI * 2) * 0.35;
      if (this.hatMesh) {
        // the hat pops off
        const ht = Math.max(0, t);
        this.hatMesh.position.set(this.hatBasePos.x + ht * 1.2, this.hatBasePos.y + ht * 3.2 - ht * ht * 7, this.hatBasePos.z - ht * 1.5);
        this.hatMesh.rotation.z = ht * 6;
      }
      for (let i = 0; i < this.stars.length; i++) {
        const a = t * 5 + (i / 3) * Math.PI * 2;
        (this.stars[i] as THREE.Mesh).position.set(Math.cos(a) * 0.55, 1.5 + Math.sin(t * 6 + i) * 0.08, Math.sin(a) * 0.55);
        (this.stars[i] as THREE.Mesh).rotation.y = a * 2;
      }
      for (const leg of this.legs) leg.pivot.rotation.z = leg.side * (0.6 + Math.sin(t * 14 + leg.idx) * 0.3);
      for (const c of this.claws) {
        c.up.rotation.z = 0.5;
        c.low.rotation.z = -0.5;
      }
      return;
    }
    this.dizzy.visible = false;
    rig.rotation.x = 0;
    rig.position.y = 0;
    if (this.hatMesh) {
      this.hatMesh.position.copy(this.hatBasePos);
      this.hatMesh.rotation.z = 0;
    }
    rig.rotation.z = -lean * 0.22 + Math.sin(wobble * 40) * wobble * 1.6;
    rig.rotation.y = lean * 0.12;

    // legs scuttle: alternating pairs
    for (const leg of this.legs) {
      const p = phase + (leg.idx % 2 === 0 ? 0 : Math.PI) + (leg.side > 0 ? 0 : Math.PI * 0.5);
      const swing = airborne ? 0.5 : Math.sin(p) * 0.42;
      const lift = airborne ? 0.35 : Math.max(0, Math.cos(p)) * 0.16;
      leg.pivot.rotation.z = swing * (idle ? 0.1 : 1) + lift * 0.4;
      leg.pivot.rotation.y = Math.sin(p + leg.idx) * (idle ? 0.02 : 0.16);
    }
    // claws pump
    const pump = idle ? Math.sin(phase * 0.5) * 0.15 : Math.sin(phase * 1.0 + 1) * 0.12;
    for (const c of this.claws) {
      c.pivot.rotation.z = -0.15 + pump * (c.side > 0 ? 1 : -1) * -1;
      const open = airborne ? 0.45 : 0.12 + Math.max(0, Math.sin(phase * 0.5 + (c.side > 0 ? 0 : 2))) * 0.18;
      c.up.rotation.z = open;
      c.low.rotation.z = -open;
    }
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkPhase = 0.14;
      this.blinkT = 2 + Math.random() * 2.5;
    }
    if (this.blinkPhase > 0) this.blinkPhase = Math.max(0, this.blinkPhase - dt);
    const eyeScaleY = this.blinkPhase > 0 ? 0.1 : 1;
    for (const e of this.eyes) {
      e.scale.y = eyeScaleY;
      e.rotation.z = Math.sin(phase * 0.25) * 0.04;
    }
  }
}
