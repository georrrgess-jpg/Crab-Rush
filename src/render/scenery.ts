import * as THREE from 'three';
import { CFG, PALETTE, zoneAt } from '../config';
import { GeoBuilder, addWind, mergeAll, translated } from './geo';
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
  /** the same ground with sand ripples and tracks near the track edges (near tiles, High/Medium) */
  groundNear: THREE.BufferGeometry;
  props: THREE.BufferGeometry;
  /** the same layout with low-detail palms and no small props, for tiles far ahead (budget, UPDATE4_PLAN.md §4.1) */
  propsFar: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
}

/** tiles starting further ahead than this use the far props */
const FAR_FROM = 30;

interface Tile {
  k: number;
  v: Variant | null;
  far: boolean;
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
function beachGround(seed: number, opts: { shore: number; base: number; track: number; wet: number; shoreDetail: boolean }, marks = 0): THREE.BufferGeometry {
  const r = P.prng(seed);
  const hw = CFG.trackHalfWidth;
  // Update 8: extra columns by the water carry a dried-foam tide line and a dark wet-sand band
  const sh = opts.shore;
  // (High/Medium; Low keeps the plain gradient)
  const shoreCols = opts.shoreDetail ? [sh - CFG.scenery.tideLine - 0.3, sh - CFG.scenery.tideLine, sh - CFG.scenery.tideLine + 0.25, sh - 1.5] : [sh - 2.4];
  const xs = [-70, -30, -16, -9, -5.6, -hw - 0.75, -hw - 0.35, -hw, -2.6, -1.5, -1.35, -1.22, -1.1, -0.98, -0.85, -0.7, 0, 0.7, 0.85, 0.98, 1.1, 1.22, 1.35, 1.5, 2.6, hw, hw + 0.35, hw + 0.75, 5.6, ...shoreCols, sh - 0.6, sh + 0.8, sh + 3].filter((x, i, a) => i === 0 || x > (a[i - 1] as number) + 0.05);
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
  const cTide = new THREE.Color(0xfff2d6);
  const cSoak = new THREE.Color(opts.wet).lerp(new THREE.Color(0x8a7a6a), 0.35);
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
      const tide = sh - CFG.scenery.tideLine;
      if (!opts.shoreDetail) {
        if (x > sh - 2.6) c.copy(cBase).lerp(cWet, Math.min(1, (x - (sh - 2.6)) / 2.2));
        else if (ax < CFG.trackHalfWidth) c.copy(cTrack);
        else if (ax < CFG.trackHalfWidth + 0.8) c.copy(cBerm);
        else c.copy(cBase);
      } else if (Math.abs(x - tide) < 0.01) c.copy(cTide).lerp(cBase, edge ? 0.3 : (r() * 0.4));
      else if (x > tide) {
        // damp sand darkening to a soaked band where the wash runs, then wet under the water
        const k = Math.min(1, (x - tide) / (CFG.scenery.tideLine - 0.6));
        c.copy(cBase).lerp(cWet, k);
        if (x >= sh - 0.61) c.copy(cSoak);
      } else if (ax < CFG.trackHalfWidth) c.copy(cTrack);
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
  if (marks > 0) groundMarks(pos, col, uv, idx, seed, marks, opts.shore, cBase);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  bakeShade(g, 0.9, 0.12);
  return g;
}

/**
 * Update 8: flat decals laid into the near ground: groups of wind ripples beside the berms (a
 * light crest and a shaded lee per ripple) and trails of gull tracks. `marks` is 1 on High, 0.5 on
 * Medium. All on flat sand (between the berm foot and the dunes / the damp sand).
 */
function groundMarks(pos: number[], col: number[], uv: number[], idx: number[], seed: number, marks: number, shore: number, base: THREE.Color): void {
  const r = P.prng(seed + 77);
  const hw = CFG.trackHalfWidth;
  const crest = base.clone().lerp(new THREE.Color(0xfff8e8), 0.6);
  const lee = base.clone().multiplyScalar(0.76);
  const track = base.clone().multiplyScalar(0.62);
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color): void => {
    const s = pos.length / 3;
    for (const v of [a, b, c, d]) {
      pos.push(v[0] as number, 0.012, v[1] as number);
      uv.push((v[0] as number) / TEX_REPEAT, (v[1] as number) / TEX_REPEAT);
      col.push(color.r, color.g, color.b);
    }
    idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  };
  const groups = Math.round(CFG.scenery.rippleGroups * marks);
  for (let gI = 0; gI < groups * 2; gI++) {
    const side = gI % 2 ? 1 : -1;
    // flat sand: left from the berm foot to the dunes, right from the berm foot to the damp sand
    const x0 = side < 0 ? -(hw + 0.95 + r() * 1.0) : hw + 0.95 + r() * Math.max(0.2, shore - CFG.scenery.tideLine - hw - 2.4);
    const z0 = -(1.5 + r() * (TILE_LEN - 4));
    const len = 1.3 + r() * 1.4;
    const ang = (r() - 0.5) * 0.5;
    const count = 3 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      // ripples are wavy lines across the beach, ~0.22 m apart
      const zc = z0 - k * 0.3;
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs - 0.5;
        const t1 = (i + 1) / segs - 0.5;
        const xa = x0 + t0 * len;
        const xb = x0 + t1 * len;
        const za = zc + Math.sin(t0 * 5 + k) * 0.05 + t0 * len * ang;
        const zb = zc + Math.sin(t1 * 5 + k) * 0.05 + t1 * len * ang;
        const w0 = 0.075 * Math.sin((t0 + 0.5) * Math.PI) + 0.01;
        const w1 = 0.075 * Math.sin((t1 + 0.5) * Math.PI) + 0.01;
        quad([xa, za + w0], [xb, zb + w1], [xb, zb], [xa, za], crest);
        quad([xa, za], [xb, zb], [xb, zb - w1 * 1.4], [xa, za - w0 * 1.4], lee);
      }
    }
  }
  // gull tracks: a wandering line of little three-toed prints
  const trails = Math.max(1, Math.round(CFG.scenery.trackTrails * marks));
  for (let tI = 0; tI < trails; tI++) {
    const side = r() < 0.5 ? -1 : 1;
    let x = side * (hw + 1.1 + r() * 1.2);
    let z = -(2 + r() * 8);
    let h = (r() - 0.5) * 1.2 + (side < 0 ? Math.PI : 0);
    for (let i = 0; i < 12; i++) {
      h += (r() - 0.5) * 0.5;
      const dx = Math.cos(h) * 0.16;
      const dz = Math.sin(h) * 0.16 - 0.3;
      x += dx;
      z += dz;
      if (Math.abs(x) < hw + 0.85 || x > shore - CFG.scenery.tideLine - 0.4 || z < -TILE_LEN + 0.6) break;
      const a = Math.atan2(dz, dx);
      const o = (i % 2 ? 1 : -1) * 0.08;
      const px = x - Math.sin(a) * o;
      const pz = z + Math.cos(a) * o;
      for (const spread of [-0.5, 0, 0.5]) {
        const ta = a + spread;
        const tx = px + Math.cos(ta) * 0.15;
        const tz = pz + Math.sin(ta) * 0.15;
        const nx = -Math.sin(ta) * 0.022;
        const nz = Math.cos(ta) * 0.022;
        quad([px + nx, pz + nz], [tx + nx, tz + nz], [tx - nx, tz - nz], [px - nx, pz - nz], track);
      }
    }
  }
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
  /** the far copy: same positions (same random draws), swapped or dropped geometry */
  far: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  constructor(private r: () => number, private density: number, private farMap: Map<THREE.BufferGeometry, THREE.BufferGeometry | null>) {}
  add(g: THREE.BufferGeometry, x: number, z: number, rotY = 0, scale = 1, y = 0, essential = false): void {
    if (!essential && this.r() > this.density) return;
    this.list.push(translated(g, x, y, z, rotY, scale));
    const f = this.farMap.has(g) ? this.farMap.get(g) : g;
    if (f) this.far.push(translated(f, x, y, z, rotY, scale));
  }
  addGlow(g: THREE.BufferGeometry, x: number, z: number, y = 0): void {
    this.glow.push(translated(g, x, y, z));
  }
}

/** Prop geometry cache (built once, cloned into tiles). */
class PropKit {
  palms = [0, 1, 2, 3].map((i) => P.palm(100 + i, 5.5 + i * 0.7, 0.8 + i * 0.35));
  palmsDusk = [0, 1].map((i) => P.palm(200 + i, 6 + i, 1.1, 0x7d5129, 0x2f7a43, 0x1f5a32));
  /** background rows: low-detail palms */
  palmsFar = [0, 1, 2, 3].map((i) => P.palm(100 + i, 5.5 + i * 0.7, 0.8 + i * 0.35, PALETTE.palmTrunk, PALETTE.palmLeaf, PALETTE.palmLeafDark, true));
  palmsDuskFar = [0, 1].map((i) => P.palm(200 + i, 6 + i, 1.1, 0x7d5129, 0x2f7a43, 0x1f5a32, true));
  umbrellaRed = P.umbrella(PALETTE.umbrellaRed, PALETTE.umbrellaCream, 0.12);
  umbrellaBlue = P.umbrella(PALETTE.umbrellaBlue, PALETTE.umbrellaCream, -0.1);
  towelA = P.towel(0xff7a1a, 0xfff4dc);
  towelB = P.towel(0x2f6fd6, 0xffc933);
  rocks = [0, 1, 2].map((i) => P.rock(30 + i, 0.7 + i * 0.35));
  starfish = P.starfish();
  starfishPurple = P.starfish(0xb06ad6);
  // Update 5 map detail
  grass = [0, 1, 2].map((i) => P.duneGrass(400 + i));
  volleyNet = P.volleyNet();
  kayaks = [0xff5a3a, 0x22c8f0].map((c) => P.kayak(c));
  windsock = P.windsock();
  barrels = P.barrels();
  lifeRing = P.lifeRing();
  planters = [0, 1].map((i) => P.planter(410 + i));
  anemones = [0, 1].map((i) => P.anemones(420 + i));
  flowerBushes = [0xff4a6a, 0xffb020, 0xff6ad0].map((c, i) => P.flowerBush(430 + i, c));
  sailboats = [0xff5a3a, 0xffd23a, 0x22c8f0].map((c) => P.sailboat(c));
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
  crates = P.crateStack(0, true);
  cliffs = [0, 1, 2].map((i) => P.cliff(70 + i));
  pools = [0, 1, 2].map((i) => P.tidePool(80 + i));
  corals = [0, 1, 2].map((i) => P.coral(90 + i));
  urchins = P.urchins(0, true);
  torch = P.tikiTorch();
  flame = P.flame();
  lanterns = [0xffd23a, 0xff7aa2, 0x7ad0ff].map((c) => P.lantern(c));
  buckets = [0xe53935, 0x2f6fd6, 0x3dae4f].map((c) => P.bucketSpade(c));
  surfboards = P.surfboards();
  lifeguard = P.lifeguardTower();
  net = P.fishingNet();
  bench = P.bench();
  postGull = P.postGull();
  burrows = [0, 1].map((i) => P.crabBurrow(60 + i));
  starClusters = [0, 1].map((i) => P.starfishCluster(65 + i));
  hammock = P.hammock();
  bonfire = P.bonfireLogs();
  bonfireFlame = P.bonfireFlame();
  // Update 8 hero scenery: each zone gets its own set (High/Medium; far tiles get the lo copies)
  cabanas = [0xff5a3a, 0x22a8e0, 0xffb020].map((c) => P.cabana(c));
  jetty = P.jetty(12);
  jettyLo = P.jetty(12, true);
  seaStacks = [0, 1, 2].map((i) => P.seaStack(500 + i * 13));
  seaStacksLo = [0, 1, 2].map((i) => P.seaStack(500 + i * 13, true));
  mossRocks = [0, 1, 2].map((i) => P.rock(30 + i, 0.7 + i * 0.35, 0x9a948a, true));
  driftwood = [0, 1, 2].map((i) => P.driftwood(510 + i));
  sandcastle = P.sandcastle();
  floatLine = P.floatLine();
  crabPots = P.crabPots();
  hangingBuoys = P.hangingBuoys();
  tikiBars = [0xff7a1a, 0xff4a8a].map((c) => P.tikiBar(c));
  outriggers = [0xe53935, 0x22a8e0].map((c) => P.outrigger(c));
  braces = P.pilingBraces((CFG.trackHalfWidth + 0.8) * 2);
  torchLo = P.tikiTorch(true);
  lifeguardLo = P.lifeguardTower(true);
  umbrellaRedLo = P.umbrella(PALETTE.umbrellaRed, PALETTE.umbrellaCream, 0.12, true);
  umbrellaBlueLo = P.umbrella(PALETTE.umbrellaBlue, PALETTE.umbrellaCream, -0.1, true);
  /** far tiles: palms swap to their low-detail versions, small ground props are dropped */
  farMap = new Map<THREE.BufferGeometry, THREE.BufferGeometry | null>();
  constructor() {
    const b = new GeoBuilder();
    b.cyl(0xa8743f, 0.18, 0.22, 1.6, [0, 0.18, 0], [0, 0, Math.PI / 2], 8);
    b.cyl(0xe2bd8a, 0.17, 0.17, 0.03, [0.8, 0.18, 0], [0, 0, Math.PI / 2], 8);
    this.log = b.build();
    this.palms.forEach((g, i) => this.farMap.set(g, this.palmsFar[i] as THREE.BufferGeometry));
    this.palmsDusk.forEach((g, i) => this.farMap.set(g, this.palmsDuskFar[i] as THREE.BufferGeometry));
    this.seaStacks.forEach((g, i) => this.farMap.set(g, this.seaStacksLo[i] as THREE.BufferGeometry));
    this.farMap.set(this.jetty, this.jettyLo);
    this.farMap.set(this.torch, this.torchLo);
    this.farMap.set(this.lifeguard, this.lifeguardLo);
    this.farMap.set(this.umbrellaRed, this.umbrellaRedLo);
    this.farMap.set(this.umbrellaBlue, this.umbrellaBlueLo);
    for (const g of [...this.driftwood, this.sandcastle, this.floatLine, this.crabPots, this.hangingBuoys, ...this.outriggers, this.braces]) this.farMap.set(g, null);
    for (const g of [this.starfish, this.starfishPurple, this.pinkShell, this.tinyCrab, this.seaweed, this.towelA, this.towelB, this.miniCastle, ...this.buckets, ...this.burrows, ...this.starClusters, ...this.corals, this.urchins, this.postGull, this.net, this.bench, this.buoy, ...this.grass, this.lifeRing, ...this.planters, ...this.anemones, this.barrels, this.windsock, ...this.flowerBushes, ...this.kayaks, ...this.sailboats]) this.farMap.set(g, null);
  }
}

export class Scenery {
  readonly group = new THREE.Group();
  private tiles: Tile[] = [];
  private variants: Variant[][] = [];
  private kit: PropKit;
  readonly groundMats: THREE.ShaderMaterial[];
  private glowMat: THREE.ShaderMaterial;

  constructor(mats: Materials, density: number) {
    this.kit = new PropKit();
    const sand = sandTexture(false);
    const wet = sandTexture(true);
    const planks = plankTexture();
    // ground is lit by the zone lighting too (UPDATE2_PLAN.md §1.2), so berms and ridges model
    this.groundMats = [sand, planks, wet, sand].map((map) => makeToy(mats.lighting, { map, color: 0xf0f0f0 }));
    // flames and lanterns: unlit, flickering with the wind attribute
    this.glowMat = makeToy(mats.lighting, { emissive: 1, wind: true });
    this.glowMat.fog = false;
    this.buildVariants(density);
    for (let i = 0; i < TILE_COUNT; i++) {
      const group = new THREE.Group();
      const ground = new THREE.Mesh(EMPTY, this.groundMats[0]);
      const props = new THREE.Mesh(EMPTY, mats.clayWind);
      const glow = new THREE.Mesh(EMPTY, this.glowMat);
      group.add(ground, props, glow);
      this.group.add(group);
      this.tiles.push({ k: -999, v: null, far: false, group, ground, props, glow });
    }
  }

  /** flames / lanterns (an extra draw call per tile); off on the Low tier */
  glowOn = true;

  setDensity(d: number): void {
    for (const zone of this.variants) for (const v of zone) {
      v.ground.dispose();
      if (v.groundNear !== v.ground) v.groundNear.dispose();
      v.props.dispose();
      v.propsFar.dispose();
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
    const pl = new Placer(r, density, this.kit.farMap);
    const K = this.kit;
    const L = TILE_LEN;
    const rz = (a = 0, b = L): number => -(a + r() * (b - a));
    let ground: THREE.BufferGeometry;
    let groundNear: THREE.BufferGeometry | null = null;
    /** Update 5 detail props: High and Medium tiers (Low keeps its triangle headroom) */
    const extras = density >= 0.7;
    /** Update 8: the costliest extras (float lines, extra clumps) are High only */
    const rich = density >= 0.95;
    const marks = rich ? 1 : extras ? 0.5 : 0;

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
      const rope = ropeB.build();
      pl.list.push(rope);
      pl.far.push(rope);
      // painted lane guides
      const lines = new GeoBuilder();
      for (const x of [-1.1, 1.1]) lines.box(0xe8d2a6, 0.16, 0.02, L, [x, 0.012, -L / 2]);
      const ln = lines.build();
      pl.list.push(ln);
      pl.far.push(ln);
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
      // nets draped on the rails, benches and gulls perched on pilings
      if (v % 2 === 0) pl.add(K.net, hw + 0.05, -14 - r() * 6, Math.PI / 2, 1, 0, true);
      if (v !== 2) pl.add(K.bench, -(hw + 0.6), -20, Math.PI / 2, 1, 0, true);
      pl.add(K.postGull, (r() < 0.5 ? -1 : 1) * (hw + 1.4), rz(), r() * 6, 1, -0.3);
      pl.add(K.buoy, -7 - r() * 4, rz(), 0, 1, -0.05);
      // Update 5: barrels, life rings on the rails, planters on the side platform, sails offshore
      if (extras) {
        if (v % 2 === 1) pl.add(K.barrels, -hw - 1.3, -8 - r() * 8, r() * 6);
        pl.add(K.lifeRing, (v % 2 === 0 ? 1 : -1) * (hw + 0.2), -11, v % 2 === 0 ? -Math.PI / 2 : Math.PI / 2);
        if (v % 2 === 0) pl.add(K.planters[v % 2] as THREE.BufferGeometry, -hw - 1.2, -16, Math.PI / 2);
        pl.add(K.sailboats[v % 3] as THREE.BufferGeometry, 26 + r() * 14, rz(), r() * 6, 1.4);
        // Update 8: cross-braced pilings under the deck, crab pots on the platform, a post of
        // fishing buoys by the rail
        for (let i = 0; i < 4; i++) pl.add(K.braces, 0, -(i / 4) * L - 2, Math.PI / 2, 1, 0, true);
        if (v % 2 === 0) pl.add(K.crabPots, -hw - 5.2, -16.5, 0.4, 1, 0, true);
        else pl.add(K.crabPots, -hw - 1.5, -3.5, 1.2, 0.9, 0, true);
        pl.add(K.hangingBuoys, (v % 2 === 0 ? 1 : -1) * (hw + 0.45), -22.5, r() * 6, 1, 0, true);
      }
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
        pl.list.push(addWind(bb.build(), (x, y) => (y < 3.5 ? -0.05 : -0.01)));
        // bunting is a near-only detail
      }
    } else {
      const shore = zone === 2 ? 7.4 : 8.4;
      const base = zone === 2 ? 0xd8b98a : PALETTE.sandMid;
      const track = zone === 2 ? 0xe3c798 : 0xf3d7a0;
      const gOpts = { shore, base, track, wet: zone === 2 ? 0xa9855a : PALETTE.sandWet, shoreDetail: extras };
      ground = beachGround(seed, gOpts);
      if (marks > 0) groundNear = beachGround(seed, gOpts, marks);

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
        const far = dusk ? K.palmsDuskFar : K.palmsFar;
        for (let i = 0; i < 2; i++) pl.add(far[Math.floor(r() * far.length)] as THREE.BufferGeometry, -20 - r() * 12, rz(), r() * 6, 1.2 + r() * 0.4);
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
        // Update 2 props: sand toys, surfboards, a lifeguard tower; hammocks and a bonfire at dusk
        if (r() < 0.55) pl.add(K.buckets[Math.floor(r() * 3)] as THREE.BufferGeometry, -4.9 - r() * 2.5, rz(), r() * 6);
        if (r() < 0.5) pl.add(K.surfboards, -6.5 - r() * 3, rz(), 0.3 + r() * 0.6);
        if (!dusk && v === 2) pl.add(K.lifeguard, -9.5, -14, 0.3, 1, 0, true);
        // Update 5: dune grass on the back of the beach, kayaks and a volleyball court by day,
        // flowering bushes at dusk, sails on the horizon
        if (extras) {
          for (let i = 0; i < 3; i++) pl.add(K.grass[Math.floor(r() * 3)] as THREE.BufferGeometry, -7.5 - r() * 7, rz(), r() * 6, 0.9 + r() * 0.5);
          if (!dusk && v === 0) pl.add(K.volleyNet, -11.5, -9, Math.PI / 2, 1, 0, true);
          if (!dusk && r() < 0.5) pl.add(K.kayaks[Math.floor(r() * 2)] as THREE.BufferGeometry, 6.4 + r(), rz(), 0.3 + r() * 0.5);
          if (!dusk && v === 3) pl.add(K.windsock, -8.5, -6, 0, 1, 0, true);
          if (dusk) for (let i = 0; i < 2; i++) pl.add(K.flowerBushes[Math.floor(r() * 3)] as THREE.BufferGeometry, -6.2 - r() * 4, rz(), r() * 6, 0.9 + r() * 0.4);
          if (r() < 0.45) pl.add(K.sailboats[Math.floor(r() * 3)] as THREE.BufferGeometry, 28 + r() * 16, rz(), r() * 6, 1.4);
        }
        // Update 8 hero sets. Sunny Shore: cabanas, a jetty, a sandcastle, driftwood and a swim line;
        // Sunset Lagoon: a tiki bar, outrigger canoes and driftwood seats round the bonfire
        if (extras) {
          if (!dusk) {
            if (v === 0) pl.add(K.cabanas[0] as THREE.BufferGeometry, -9.2, -19.5, Math.PI / 2 + 0.15, 1, 0, true);
            if (v === 2) {
              pl.add(K.cabanas[1] as THREE.BufferGeometry, -8.6, -4.5, Math.PI / 2 - 0.1, 1, 0, true);
              if (rich) pl.add(K.cabanas[2] as THREE.BufferGeometry, -9.4, -21, Math.PI / 2 + 0.2, 1, 0, true);
            }
            if (v === 1 || v === 3) pl.add(K.jetty, shore - 1.6, v === 1 ? -17 : -6, 0, 1, 0, true);
            pl.add(K.buoy, 15 + r() * 6, rz(), r() * 6, 1, -0.1);
            if (rich) pl.add(K.floatLine, 13.5 + r() * 2, -12.5, (r() - 0.5) * 0.3, 1, -0.05, true);
          } else {
            if (v === 2) pl.add(K.tikiBars[v % 2] as THREE.BufferGeometry, -11.2, -6, Math.PI / 2, 1, 0, true);
            if (v === 0 || v === 3) pl.add(K.outriggers[v % 2] as THREE.BufferGeometry, shore - 1.4, rz(5, 20), 0.15 + r() * 0.3, 1, 0, true);
            if (v === 1) {
              pl.add(K.driftwood[0] as THREE.BufferGeometry, -7.4, -11.6, 0.1, 0.8, 0, true);
              pl.add(K.driftwood[1] as THREE.BufferGeometry, -8.9, -9.6, Math.PI / 2 + 0.3, 0.75, 0, true);
            }
          }
          if (r() < 0.55) pl.add(K.sandcastle, -5.3 - r() * 1.6, rz(2, 22), r() * 6, 0.9 + r() * 0.3);
          if (r() < 0.55) pl.add(K.driftwood[Math.floor(r() * 3)] as THREE.BufferGeometry, -6.5 - r() * 4, rz(), r() * 6, 0.9 + r() * 0.3);
          if (rich) for (let i = 0; i < 3; i++) pl.add(K.grass[Math.floor(r() * 3)] as THREE.BufferGeometry, -8 - r() * 9, rz(), r() * 6, 1 + r() * 0.5);
        }
        if (dusk && (v === 0 || v === 3)) pl.add(K.hammock, -10.5, rz(4, 20), 0.2 + r() * 0.4, 1, 0, true);
        if (dusk && v === 1) {
          pl.add(K.bonfire, -7.4, -10, r() * 6, 1, 0, true);
          pl.addGlow(K.bonfireFlame, -7.4, -10);
        }
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
        for (let i = 0; i < 2; i++) pl.add(K.burrows[Math.floor(r() * 2)] as THREE.BufferGeometry, (r() < 0.6 ? -1 : 1) * (4.7 + r() * 2.2), rz(), r() * 6);
        if (r() < 0.6) pl.add(K.starClusters[Math.floor(r() * 2)] as THREE.BufferGeometry, -5.5 - r() * 3, rz(), r() * 6);
        // Update 8: sea stacks with strata and moss offshore and among the cliffs, driftwood, mossy
        // rocks, dune grass at the foot of the cliffs
        if (extras) {
          pl.add(K.seaStacks[v % 3] as THREE.BufferGeometry, 15 + r() * 7, rz(), r() * 6, 1 + r() * 0.4, -0.35, true);
          if (rich && v % 2 === 0) pl.add(K.seaStacks[(v + 1) % 3] as THREE.BufferGeometry, -10.5 - r() * 2, rz(4, 21), r() * 6, 0.8, 0, true);
          for (let i = 0; i < 2; i++) pl.add(K.mossRocks[Math.floor(r() * 3)] as THREE.BufferGeometry, -6.5 - r() * 5, rz(), r() * 6, 1 + r() * 0.4);
          if (r() < 0.6) pl.add(K.driftwood[Math.floor(r() * 3)] as THREE.BufferGeometry, -6 - r() * 4, rz(), r() * 6);
          for (let i = 0; i < (rich ? 3 : 1); i++) pl.add(K.grass[Math.floor(r() * 3)] as THREE.BufferGeometry, -9 - r() * 4, rz(), r() * 6, 1 + r() * 0.4);
        }
        // Update 5: anemones in the shallows
        if (extras) for (let i = 0; i < 2; i++) pl.add(K.anemones[Math.floor(r() * 2)] as THREE.BufferGeometry, (r() < 0.6 ? -1 : 1) * (4.9 + r() * 2), rz(), r() * 6);
      }
    }

    return {
      ground,
      groundNear: groundNear ?? ground,
      props: pl.list.length ? mergeAll(pl.list) : EMPTY,
      propsFar: pl.far.length ? mergeAll(pl.far) : EMPTY,
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
        t.ground.material = this.groundMats[zone] as THREE.ShaderMaterial;
        t.v = v;
        t.far = t.k * TILE_LEN - dist > FAR_FROM;
        t.props.geometry = t.far ? v.propsFar : v.props;
        t.ground.geometry = t.far ? v.ground : v.groundNear;
        t.glow.geometry = v.glow ?? EMPTY;
        t.glow.visible = !!v.glow && this.glowOn;
      }
      t.group.position.z = -(t.k * TILE_LEN - dist);
      // swap to the detailed props as the tile comes within range
      const far = t.k * TILE_LEN - dist > FAR_FROM;
      if (far !== t.far && t.v) {
        t.far = far;
        t.props.geometry = far ? t.v.propsFar : t.v.props;
        t.ground.geometry = far ? t.v.ground : t.v.groundNear;
      }
      // tiles that start beyond the fog are invisible anyway: skip their draw calls
      t.group.visible = t.k * TILE_LEN - dist < viewDist;
    }
    for (const m of this.groundMats) (m.uniforms.diffuse as { value: THREE.Color }).value.copy(groundTint).multiplyScalar(0.94);
  }

  glowFlicker(time: number): void {
    const f = 0.85 + Math.sin(time * 13) * 0.08 + Math.sin(time * 7.3) * 0.07;
    (this.glowMat.uniforms.uEmissive as { value: number }).value = f;
  }
}
