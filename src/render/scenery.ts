import * as THREE from 'three';
import { CFG, PALETTE, zoneAt } from '../config';
import { GeoBuilder, mergeAll, translated } from './geo';
import type { Materials } from './materials';
import * as P from './props';
import { plankTexture, sandTexture } from './textures';
import { makeToy } from './shaders/toy';

export const TILE_LEN = 25;
const TILE_COUNT = 7;
const VARIANTS = 4;
const TEX_REPEAT = TILE_LEN / 8; // metres per texture repeat (keeps tiles seamless)
const SUN = new THREE.Vector3(-0.4, 0.8, 0.45).normalize();

interface Variant {
  ground: THREE.BufferGeometry;
  props: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
}

interface Tile {
  k: number;
  group: THREE.Group;
  ground: THREE.Mesh;
  props: THREE.Mesh;
  glow: THREE.Mesh;
}

const EMPTY = new THREE.BufferGeometry();

/** Bake simple sun shading into vertex colours (ground uses an unlit material). */
function bakeShade(g: THREE.BufferGeometry, amb = 0.78, diff = 0.3): void {
  g.computeVertexNormals();
  const n = g.attributes.normal as THREE.BufferAttribute;
  const c = g.attributes.color as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.set(n.getX(i), n.getY(i), n.getZ(i));
    const k = amb + diff * Math.max(0, v.dot(SUN));
    c.setXYZ(i, Math.min(1, c.getX(i) * k), Math.min(1, c.getY(i) * k), Math.min(1, c.getZ(i) * k));
  }
}

/** Beach cross-section: dunes, berms at the track edges, lane ridges, wet slope into the sea. */
function beachGround(seed: number, opts: { shore: number; base: number; track: number; wet: number }): THREE.BufferGeometry {
  const r = P.prng(seed);
  const hw = CFG.trackHalfWidth;
  const xs = [-70, -30, -16, -9, -5.6, -hw - 0.75, -hw - 0.35, -hw, -2.6, -1.5, -1.35, -1.22, -1.1, -0.98, -0.85, -0.7, 0, 0.7, 0.85, 0.98, 1.1, 1.22, 1.35, 1.5, 2.6, hw, hw + 0.35, hw + 0.75, 5.6, opts.shore - 2.4, opts.shore - 0.6, opts.shore + 0.8, opts.shore + 3];
  const height = (x: number): number => {
    const ax = Math.abs(x);
    if (ax <= hw + 0.75 && ax >= hw - 0.2) {
      const t = 1 - Math.abs(ax - (hw + 0.3)) / 0.5;
      return Math.max(0, t) * 0.42;
    }
    if (ax >= 0.85 && ax <= 1.35) return Math.max(0, 1 - Math.abs(ax - 1.1) / 0.25) * 0.24;
    if (x > opts.shore - 2.4) return -Math.min(1, (x - (opts.shore - 2.4)) / 3.4) * 0.55;
    return 0;
  };
  const zs: number[] = [];
  for (let z = 0; z <= TILE_LEN + 0.01; z += TILE_LEN / 10) zs.push(-z);
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const cBase = new THREE.Color(opts.base);
  const cTrack = new THREE.Color(opts.track);
  const cWet = new THREE.Color(opts.wet);
  const cBerm = new THREE.Color(PALETTE.sandLight);
  const c = new THREE.Color();
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j] as number;
    const edge = j === 0 || j === zs.length - 1; // keep tile seams identical
    for (const x of xs) {
      let y = height(x);
      if (x < -6 && !edge) y += (r() - 0.3) * 0.35 * Math.min(1, (-6 - x) / 8);
      pos.push(x, y, z);
      uv.push(x / TEX_REPEAT, z / TEX_REPEAT);
      const ax = Math.abs(x);
      if (x > opts.shore - 2.6) c.copy(cBase).lerp(cWet, Math.min(1, (x - (opts.shore - 2.6)) / 2.2));
      else if (ax < CFG.trackHalfWidth) c.copy(cTrack);
      else if (ax < CFG.trackHalfWidth + 0.8) c.copy(cBerm);
      else c.copy(cBase);
      col.push(c.r, c.g, c.b);
    }
  }
  const n = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const cc = a + n;
      const d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  bakeShade(g, 0.9, 0.12);
  return g;
}

/** Boardwalk deck: plank top surface + darker sides. */
function deckGround(): THREE.BufferGeometry {
  const hw = CFG.trackHalfWidth + 1.0;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const top = new THREE.Color(0xc9955a);
  const side = new THREE.Color(0x7a5530);
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color, uvs: number[][]): void => {
    for (const [v, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]] as [number[], number[]][]) {
      pos.push(...v);
      col.push(color.r, color.g, color.b);
      uv.push(...t);
    }
  };
  const L = TILE_LEN;
  const r = L / TEX_REPEAT;
  quad([-hw, 0, 0], [hw, 0, 0], [hw, 0, -L], [-hw, 0, -L], top, [[0, 0], [1.6, 0], [1.6, -r], [0, -r]]);
  quad([hw, 0, 0], [hw, -0.4, 0], [hw, -0.4, -L], [hw, 0, -L], side, [[0, 0], [0.05, 0], [0.05, -r], [0, -r]]);
  quad([-hw, -0.4, 0], [-hw, 0, 0], [-hw, 0, -L], [-hw, -0.4, -L], side, [[0, 0], [0.05, 0], [0.05, -r], [0, -r]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bakeShade(g, 0.85, 0.2);
  return g;
}

class Placer {
  list: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  constructor(private r: () => number, private density: number) {}
  add(g: THREE.BufferGeometry, x: number, z: number, rotY = 0, scale = 1, y = 0, essential = false): void {
    if (!essential && this.r() > this.density) return;
    this.list.push(translated(g, x, y, z, rotY, scale));
  }
  addGlow(g: THREE.BufferGeometry, x: number, z: number, y = 0): void {
    this.glow.push(translated(g, x, y, z));
  }
}

/** Prop geometry cache (built once, cloned into tiles). */
class PropKit {
  palms = [0, 1, 2, 3].map((i) => P.palm(100 + i, 5.5 + i * 0.7, 0.8 + i * 0.35));
  palmsDusk = [0, 1].map((i) => P.palm(200 + i, 6 + i, 1.1, 0x7d5129, 0x2f7a43, 0x1f5a32));
  umbrellaRed = P.umbrella(PALETTE.umbrellaRed, PALETTE.umbrellaCream, 0.12);
  umbrellaBlue = P.umbrella(PALETTE.umbrellaBlue, PALETTE.umbrellaCream, -0.1);
  towelA = P.towel(0xff7a1a, 0xfff4dc);
  towelB = P.towel(0x2f6fd6, 0xffc933);
  rocks = [0, 1, 2].map((i) => P.rock(30 + i, 0.7 + i * 0.35));
  starfish = P.starfish();
  starfishPurple = P.starfish(0xb06ad6);
  bush = [0, 1].map((i) => P.bush(50 + i));
  hut = P.hut();
  log = P.rock(1, 0.1); // placeholder replaced below
  miniCastle = P.miniCastle();
  pinkShell = P.pinkShell();
  tinyCrab = P.tinyCrab();
  seaweed = P.seaweed();
  lamp = P.lampPost();
  ropePost = P.ropePost();
  kiosks = [P.kiosk(0xe53935, 0xffffff), P.kiosk(0x2f6fd6, 0xffffff), P.kiosk(0x3dae4f, 0xfff4dc)];
  boats = [P.boat(0xe53935), P.boat(0x2f6fd6), P.boat(0xffc933)];
  buoy = P.buoy();
  crates = P.crateStack();
  cliffs = [0, 1, 2].map((i) => P.cliff(70 + i));
  pools = [0, 1, 2].map((i) => P.tidePool(80 + i));
  corals = [0, 1, 2].map((i) => P.coral(90 + i));
  urchins = P.urchins();
  torch = P.tikiTorch();
  flame = P.flame();
  lanterns = [0xffd23a, 0xff7aa2, 0x7ad0ff].map((c) => P.lantern(c));
  constructor() {
    const b = new GeoBuilder();
    b.cyl(0xa8743f, 0.18, 0.22, 1.6, [0, 0.18, 0], [0, 0, Math.PI / 2], 8);
    b.cyl(0xe2bd8a, 0.17, 0.17, 0.03, [0.8, 0.18, 0], [0, 0, Math.PI / 2], 8);
    this.log = b.build();
  }
}

export class Scenery {
  readonly group = new THREE.Group();
  private tiles: Tile[] = [];
  private variants: Variant[][] = [];
  private kit: PropKit;
  readonly groundMats: THREE.ShaderMaterial[];
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });

  constructor(private mats: Materials, density: number) {
    this.kit = new PropKit();
    const sand = sandTexture(false);
    const wet = sandTexture(true);
    const planks = plankTexture();
    // ground is lit by the zone lighting too (UPDATE2_PLAN.md §1.2), so berms and ridges model
    this.groundMats = [sand, planks, wet, sand].map((map) => makeToy(mats.lighting, { map, color: 0xf0f0f0 }));
    this.buildVariants(density);
    for (let i = 0; i < TILE_COUNT; i++) {
      const group = new THREE.Group();
      const ground = new THREE.Mesh(EMPTY, this.groundMats[0]);
      const props = new THREE.Mesh(EMPTY, mats.clay);
      const glow = new THREE.Mesh(EMPTY, this.glowMat);
      group.add(ground, props, glow);
      this.group.add(group);
      this.tiles.push({ k: -999, group, ground, props, glow });
    }
  }

  /** flames / lanterns (an extra draw call per tile); off on the Low tier */
  glowOn = true;

  setDensity(d: number): void {
    for (const zone of this.variants) for (const v of zone) {
      v.ground.dispose();
      v.props.dispose();
      v.glow?.dispose();
    }
    this.buildVariants(d);
    for (const t of this.tiles) t.k = -999;
  }

  private buildVariants(density: number): void {
    this.variants = [];
    for (let z = 0; z < 4; z++) {
      const arr: Variant[] = [];
      for (let v = 0; v < VARIANTS; v++) arr.push(this.buildVariant(z, v, density));
      this.variants.push(arr);
    }
  }

  private buildVariant(zone: number, v: number, density: number): Variant {
    const seed = 1000 + zone * 37 + v * 7;
    const r = P.prng(seed);
    const pl = new Placer(r, density);
    const K = this.kit;
    const L = TILE_LEN;
    const rz = (a = 0, b = L): number => -(a + r() * (b - a));
    let ground: THREE.BufferGeometry;

    if (zone === 1) {
      ground = deckGround();
      const hw = CFG.trackHalfWidth + 0.9;
      // rope posts + ropes along both edges
      const posts = 5;
      const ropeB = new GeoBuilder();
      for (const s of [-1, 1]) {
        for (let i = 0; i < posts; i++) {
          const z = -(i / posts) * L;
          pl.add(K.ropePost, s * hw, z, 0, 1, 0, true);
          const z2 = -((i + 1) / posts) * L;
          const zm = (z + z2) / 2;
          ropeB.seg(0xe9dfc8, [s * hw, 1.0, z], [s * hw, 0.82, zm], 0.03, 0.03, 4);
          ropeB.seg(0xe9dfc8, [s * hw, 0.82, zm], [s * hw, 1.0, z2], 0.03, 0.03, 4);
        }
        // pilings in the water
        for (let i = 0; i < 4; i++) {
          const pb = new GeoBuilder().cyl(0x6b4423, 0.22, 0.25, 2.2, [0, -1.0, 0], [0, 0, 0], 8).build();
          pl.add(pb, s * (hw - 0.1), -(i / 4) * L - 2, 0, 1, 0, true);
        }
      }
      pl.list.push(ropeB.build());
      // painted lane guides
      const lines = new GeoBuilder();
      for (const x of [-1.1, 1.1]) lines.box(0xe8d2a6, 0.16, 0.02, L, [x, 0.012, -L / 2]);
      pl.list.push(lines.build());
      // lamps
      for (const s of [-1, 1]) {
        pl.add(K.lamp, s * (hw + 0.3), -6, 0, 1, 0, true);
        if (v % 2 === 1) pl.add(K.lamp, s * (hw + 0.3), -18, 0, 1, 0, true);
      }
      // side platform with a kiosk
      if (v % 2 === 0) {
        const plat = new GeoBuilder().box(0xb98550, 6.5, 0.4, 9, [0, -0.2, 0]).build();
        pl.add(plat, -hw - 3.2, -12, 0, 1, 0, true);
        pl.add(K.kiosks[v % 3] as THREE.BufferGeometry, -hw - 3.4, -12, Math.PI / 2, 1, 0, true);
        pl.add(K.crates, -hw - 1.4, -8, 0.3, 0.7);
      } else {
        pl.add(K.boats[v % 3] as THREE.BufferGeometry, -10 - r() * 6, rz(), r() * 3, 1, -0.2);
      }
      pl.add(K.boats[(v + 1) % 3] as THREE.BufferGeometry, 12 + r() * 10, rz(), r() * 3, 1.2, -0.2);
      pl.add(K.buoy, 7 + r() * 4, rz(), 0, 1, -0.05);
      pl.add(K.buoy, -7 - r() * 4, rz(), 0, 1, -0.05);
      // bunting between lamps
      if (v % 2 === 1) {
        const bb = new GeoBuilder();
        const cols = [0xe53935, 0xffc933, 0x2f6fd6, 0x3dae4f];
        for (const s of [-1, 1]) {
          // string sagging between the two lamps (z -6 → -18), flags hanging from it
          const sag = (t: number): number => 3.75 - Math.sin(t * Math.PI) * 0.7;
          const n = 8;
          for (let i = 0; i < n; i++) {
            const t0 = i / n;
            const t1 = (i + 1) / n;
            bb.seg(0xf2efe6, [s * (hw + 0.3), sag(t0), -6 - t0 * 12], [s * (hw + 0.3), sag(t1), -6 - t1 * 12], 0.02, 0.02, 3);
          }
          for (let i = 0; i < 7; i++) {
            const t = (i + 0.5) / 7;
            bb.cone(cols[i % 4] as number, 0.16, 0.32, [s * (hw + 0.3), sag(t) - 0.18, -6 - t * 12], [Math.PI, Math.PI / 2, 0], 3, [1, 1, 0.3]);
          }
        }
        pl.list.push(bb.build());
      }
    } else {
      const shore = zone === 2 ? 7.4 : 8.4;
      const base = zone === 2 ? 0xd8b98a : PALETTE.sandMid;
      const track = zone === 2 ? 0xe3c798 : 0xf3d7a0;
      ground = beachGround(seed, { shore, base, track, wet: zone === 2 ? 0xa9855a : PALETTE.sandWet });

      if (zone === 0 || zone === 3) {
        const dusk = zone === 3;
        const palms = dusk ? K.palmsDusk : K.palms;
        // near-left: umbrella + towel, shells, starfish
        if (r() < 0.7) {
          const uz = rz(3, 22);
          const ux = -5.4 - r() * 3;
          pl.add(r() < 0.5 ? K.umbrellaRed : K.umbrellaBlue, ux, uz, r() * 6);
          pl.add(r() < 0.5 ? K.towelA : K.towelB, ux + 0.9, uz + 0.5, 0.2 + r() * 0.5);
        }
        for (let i = 0; i < 3; i++) pl.add(r() < 0.5 ? K.starfish : K.pinkShell, -4.6 - r() * 3, rz(), r() * 6);
        if (r() < 0.35) pl.add(K.tinyCrab, -4.8 - r() * 2, rz(), r() * 6);
        // palms mid + far
        const nPalm = 2 + Math.floor(r() * 2);
        for (let i = 0; i < nPalm; i++) pl.add(palms[Math.floor(r() * palms.length)] as THREE.BufferGeometry, -9 - r() * 9, -(i / nPalm) * L - r() * 6, r() * 6, 0.9 + r() * 0.35, 0, true);
        for (let i = 0; i < 2; i++) pl.add(palms[Math.floor(r() * palms.length)] as THREE.BufferGeometry, -20 - r() * 12, rz(), r() * 6, 1.2 + r() * 0.4);
        pl.add(K.bush[0] as THREE.BufferGeometry, -15 - r() * 10, rz(), r() * 6, 1.4);
        pl.add(K.bush[1] as THREE.BufferGeometry, -24 - r() * 10, rz(), r() * 6, 1.8);
        if (r() < 0.6) pl.add(K.rocks[Math.floor(r() * 3)] as THREE.BufferGeometry, -7 - r() * 6, rz(), r() * 6);
        if (r() < 0.5) pl.add(K.log, -6 - r() * 4, rz(), r() * 3);
        if (v === 1 || (dusk && v === 2)) pl.add(K.hut, -13.5, -12, 0.4, 1, 0, true);
        // right: beach strip by the water
        if (r() < 0.6) pl.add(K.rocks[Math.floor(r() * 3)] as THREE.BufferGeometry, 5 + r() * 2, rz(), r() * 6, 0.8);
        if (r() < 0.45) pl.add(K.miniCastle, 5.2 + r() * 1.5, rz(), r() * 6);
        for (let i = 0; i < 2; i++) pl.add(r() < 0.5 ? K.starfish : K.pinkShell, 4.5 + r() * 2.5, rz(), r() * 6);
        if (r() < 0.4) pl.add(K.seaweed, 7.0 + r(), rz(), r() * 6);
        if (dusk) {
          for (const s of [-1, 1]) {
            for (const z of [-4, -16.5]) {
              pl.add(K.torch, s * 4.7, z, 0, 1, 0, true);
              pl.addGlow(K.flame, s * 4.7, z);
            }
          }
          // a string of lanterns over the left beach
          for (let i = 0; i < 7; i++) pl.addGlow(K.lanterns[i % 3] as THREE.BufferGeometry, -7.5 - Math.sin((i / 6) * Math.PI) * 0.3, -4 - i * 2.4, 3.2 - Math.sin((i / 6) * Math.PI) * 0.7);
        }
      } else {
        // zone 2: cove
        pl.add(K.cliffs[v % 3] as THREE.BufferGeometry, -15 - r() * 4, -8, r() * 6, 1.1, 0, true);
        pl.add(K.cliffs[(v + 1) % 3] as THREE.BufferGeometry, -18 - r() * 4, -21, r() * 6, 1.3, 0, true);
        for (let i = 0; i < 2; i++) pl.add(K.pools[Math.floor(r() * 3)] as THREE.BufferGeometry, -5.6 - r() * 3, rz(), r() * 6);
        pl.add(K.pools[Math.floor(r() * 3)] as THREE.BufferGeometry, 5.0 + r() * 0.8, rz(), r() * 6, 0.8);
        for (let i = 0; i < 2; i++) pl.add(K.corals[Math.floor(r() * 3)] as THREE.BufferGeometry, -4.8 - r() * 4, rz(), r() * 6);
        pl.add(K.corals[Math.floor(r() * 3)] as THREE.BufferGeometry, 4.7 + r() * 1.5, rz(), r() * 6);
        for (let i = 0; i < 2; i++) pl.add(K.rocks[Math.floor(r() * 3)] as THREE.BufferGeometry, -6 - r() * 5, rz(), r() * 6, 1 + r() * 0.5);
        pl.add(K.rocks[Math.floor(r() * 3)] as THREE.BufferGeometry, 5.5 + r() * 1.5, rz(), r() * 6, 0.8);
        for (let i = 0; i < 3; i++) pl.add(r() < 0.5 ? K.starfish : K.starfishPurple, (r() < 0.5 ? -1 : 1) * (4.6 + r() * 2.5), rz(), r() * 6);
        if (r() < 0.6) pl.add(K.urchins, -5 - r() * 2, rz(), r() * 6, 0.6);
        pl.add(K.seaweed, 6.4, rz(), r() * 6);
      }
    }

    return {
      ground,
      props: pl.list.length ? mergeAll(pl.list) : EMPTY,
      glow: pl.glow.length ? mergeAll(pl.glow) : null,
    };
  }

  /** Position tiles around the player; swap geometry when a tile is recycled. */
  update(dist: number, groundTint: THREE.Color, viewDist = 200): void {
    const kMin = Math.floor((dist - 12) / TILE_LEN);
    for (const t of this.tiles) {
      if (t.k < kMin || t.k >= kMin + TILE_COUNT) {
        // find the free slot index this tile should take
        let k = kMin;
        const used = new Set(this.tiles.map((x) => x.k));
        while (used.has(k)) k++;
        t.k = k;
        const zone = zoneAt(k * TILE_LEN + 0.5);
        const vi = ((k * 2654435761) >>> 0) % VARIANTS;
        const v = (this.variants[zone] as Variant[])[vi] as Variant;
        t.ground.geometry = v.ground;
        t.ground.material = this.groundMats[zone] as THREE.ShaderMaterial;
        t.props.geometry = v.props;
        t.glow.geometry = v.glow ?? EMPTY;
        t.glow.visible = !!v.glow && this.glowOn;
      }
      t.group.position.z = -(t.k * TILE_LEN - dist);
      // tiles that start beyond the fog are invisible anyway: skip their draw calls
      t.group.visible = t.k * TILE_LEN - dist < viewDist;
    }
    for (const m of this.groundMats) (m.uniforms.diffuse as { value: THREE.Color }).value.copy(groundTint).multiplyScalar(0.94);
  }

  glowFlicker(time: number): void {
    const f = 0.85 + Math.sin(time * 13) * 0.08 + Math.sin(time * 7.3) * 0.07;
    this.glowMat.color.setScalar(f);
  }
}
