import * as THREE from 'three';
import { PALETTE } from '../../config';
import { Spring } from '../anim/spring';
import { GeoBuilder } from '../geo';
import type { Materials } from '../materials';
import { makeOutline } from '../shaders/toy';
import { type HatKind, buildHat, dyeHat } from './hats';

export type { HatKind } from './hats';

export interface CrabSkin {
  id: string;
  name: string;
  body: number;
  dark: number;
  belly: number;
  hat: HatKind;
  /** iris colour */
  iris: number;
  /** painted pattern on the shell */
  pattern?: 'rainbow' | 'gold' | 'stars' | 'spots' | 'lava' | 'pearl';
  /** sand-puff tint while running */
  dust: number;
  blurb: string;
}

/** The v1 crabs (shop + results unlocks). */
export const CRAB_SKINS: CrabSkin[] = [
  { id: 'sandy', name: 'Sandy', body: PALETTE.crabRed, dark: PALETTE.crabDark, belly: PALETTE.crabBelly, hat: 'straw', iris: 0x5a3a1a, dust: 0xf6dda6, blurb: 'Your trusty beach buddy.' },
  { id: 'chill', name: 'Chill', body: 0x3f86e8, dark: 0x2358b8, belly: 0x9cc8ff, hat: 'shades', iris: 0x1a4a8a, dust: 0xcfe8ff, blurb: 'Too cool for crashes.' },
  { id: 'blossom', name: 'Blossom', body: 0xf27ab8, dark: 0xc84f93, belly: 0xffc3e0, hat: 'flower', iris: 0x7a2a5a, pattern: 'spots', dust: 0xffd9ec, blurb: 'Smells like hibiscus.' },
  { id: 'skipper', name: 'Skipper', body: 0xf6c12e, dark: 0xd18a10, belly: 0xffe58a, hat: 'captain', iris: 0x2a5a2a, dust: 0xffecb0, blurb: 'Steers a steady course.' },
  { id: 'pinch', name: "Cap'n Pinch", body: 0x4cbc5c, dark: 0x2b8a3e, belly: 0xa6e6a0, hat: 'pirate', iris: 0x4a2a10, pattern: 'spots', dust: 0xd6f2c9, blurb: 'Arrr, mind the shells!' },
  { id: 'dazzle', name: 'Dazzle', body: 0xff4fa0, dark: 0x7a3fd0, belly: 0xffd35a, hat: 'tophat', iris: 0x5a2a9a, pattern: 'rainbow', dust: 0xffffff, blurb: 'Magnificently sparkly.' },
];

/** Every wardrobe body (v1 crabs plus Update 2 bodies). */
export const BODY_SKINS: CrabSkin[] = [
  ...CRAB_SKINS,
  { id: 'coral', name: 'Coral', body: 0xff8a6a, dark: 0xe0584a, belly: 0xffe0c8, hat: 'flowercrown', iris: 0x8a3a2a, pattern: 'spots', dust: 0xffe0d0, blurb: 'Fresh from the reef.' },
  { id: 'midnight', name: 'Midnight', body: 0x2a2f6a, dark: 0x161a40, belly: 0x8a9ae0, hat: 'headphones', iris: 0x3fd6ff, pattern: 'stars', dust: 0xc0c8ff, blurb: 'Glows after dark.' },
  { id: 'reef', name: 'Reef', body: 0x2fc4b2, dark: 0x168a86, belly: 0xc8fff0, hat: 'snorkel', iris: 0x0a5a6a, pattern: 'spots', dust: 0xd0fff4, blurb: 'Speckled like a coral garden.' },
  { id: 'lava', name: 'Lava', body: 0x3a2a2e, dark: 0x1e1418, belly: 0xff9a4a, hat: 'viking', iris: 0xff5a1a, pattern: 'lava', dust: 0xffb07a, blurb: 'Hot off the volcano. Glowing cracks!' },
  { id: 'pearl', name: 'Pearl', body: 0xf4eefa, dark: 0xc8bce0, belly: 0xffffff, hat: 'crown', iris: 0x7a5ab0, pattern: 'pearl', dust: 0xf8f0ff, blurb: 'A shimmering treasure of the Cove.' },
  { id: 'gold', name: 'Golden Crab', body: 0xffc93a, dark: 0xd8902a, belly: 0xfff0b0, hat: 'crown', iris: 0x8a5a10, pattern: 'gold', dust: 0xfff4c0, blurb: 'Legend of the islands.' },
];

// ---- rig ---------------------------------------------------------------------------------------
// Rigid "skinning": every vertex follows exactly one bone, so the whole crab is a couple of draw
// calls while every joint (UPDATE2_PLAN.md §3.1) still moves independently.
const B_ROOT = 0;
const B_BODY = 1;
const B_EYE = [2, 3];
const B_LID = [4, 5];
const B_ANT = [6, 7];
const B_MOUTH = [8, 9, 10, 11]; // smile, O, grimace, dizzy
const B_HAT = 12;
const B_SH = [13, 16];
const B_EL = [14, 17];
const B_JAW = [15, 18];
const B_HIP = (i: number): number => 19 + i * 3;
const B_KNEE = (i: number): number => 20 + i * 3;
const B_FOOT = (i: number): number => 21 + i * 3;
const BONES = 37;

type V3 = [number, number, number];
const SIDES = [-1, 1] as const;
const LEG_Z = [0.2, -0.02, -0.24];

/** rest positions (model space) */
function restPos(i: number): V3 {
  if (i === B_ROOT) return [0, 0, 0];
  if (i === B_BODY) return [0, 0.45, 0];
  if (i === B_HAT) return [0, 0.93, -0.04];
  for (let s = 0; s < 2; s++) {
    const x = SIDES[s] as number;
    if (i === B_EYE[s]) return [x * 0.2, 0.62, 0.28];
    if (i === B_LID[s]) return [x * 0.26, 0.9, 0.35];
    if (i === B_ANT[s]) return [x * 0.04, 0.7, 0.47];
    if (i === B_SH[s]) return [x * 0.55, 0.55, 0.3];
    if (i === B_EL[s]) return [x * 0.82, 0.62, 0.52];
    if (i === B_JAW[s]) return [x * 0.9, 0.66, 0.9];
  }
  if (B_MOUTH.includes(i)) return [0, 0.44, 0.5];
  for (let l = 0; l < 6; l++) {
    const x = l < 3 ? -1 : 1;
    const z = LEG_Z[l % 3] as number;
    if (i === B_HIP(l)) return [x * 0.5, 0.4, z];
    if (i === B_KNEE(l)) return [x * 0.86, 0.6, z * 1.25];
    if (i === B_FOOT(l)) return [x * 1.08, 0.24, z * 1.45];
  }
  return [0, 0, 0];
}
function parentOf(i: number): number {
  if (i === B_ROOT) return -1;
  if (i === B_BODY) return B_ROOT;
  for (let s = 0; s < 2; s++) {
    if (i === B_LID[s]) return B_EYE[s] as number;
    if (i === B_EL[s]) return B_SH[s] as number;
    if (i === B_JAW[s]) return B_EL[s] as number;
  }
  for (let l = 0; l < 6; l++) {
    if (i === B_KNEE(l)) return B_HIP(l);
    if (i === B_FOOT(l)) return B_KNEE(l);
  }
  return B_BODY;
}

// ---- pose --------------------------------------------------------------------------------------
// A pose is a flat array of joint parameters so states can be cross-faded with one loop.
const P_BODY_Y = 0;
const P_BODY_RX = 1;
const P_BODY_RY = 2;
const P_BODY_RZ = 3;
const P_ROOT_RY = 4;
const P_LOOK_X = 5;
const P_LOOK_Y = 6;
const P_LID = 7;
const P_HAT_Y = 8;
const P_HAT_RX = 9;
const P_HAT_RZ = 10;
const P_LIFT = 11; // root lift (jumps in emotes)
const P_CLAW = 12; // per side: shoulder raise, shoulder swing, elbow, jaw (8)
const P_LEG = 20; // per leg: hip swing, hip raise, knee, foot (24)
const P_N = 44;

type Pose = Float32Array;

export type CrabState = 'idle' | 'run' | 'hopRise' | 'hopFall' | 'slam' | 'crash' | 'celebrate' | 'emote' | 'ride';
type Mouth = 0 | 1 | 2 | 3;

/** Per-frame inputs from the game (render-only; the sim stays authoritative). */
export interface CrabDrive {
  running: boolean;
  grounded: boolean;
  vy: number;
  vx: number;
  speed: number;
  /** seconds since the crash, <0 when alive */
  crashT: number;
  rider: boolean;
  /** power-up stances (UPDATE3_PLAN.md §3): claws up for the magnet, a bob inside the shield */
  magnet?: boolean;
  shield?: boolean;
}

const _drive: CrabDrive = { running: false, grounded: true, vy: 0, vx: 0, speed: 0, crashT: -1, rider: false };
export const IDLE_DRIVE: Readonly<CrabDrive> = _drive;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const smooth01 = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const arc = (t: number): number => (t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI));

/** Hash noise for paint jobs. */
const hash3 = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The player's crab: a rigidly skinned rig, a pose state machine with cross-fades, and springs. */
export class CrabModel {
  readonly root = new THREE.Group();
  private readonly bones: THREE.Bone[] = [];
  private readonly skeleton: THREE.Skeleton;
  private readonly clayMesh: THREE.SkinnedMesh;
  private readonly glossMesh: THREE.SkinnedMesh;
  private readonly lineMesh: THREE.SkinnedMesh;
  private hatMesh: THREE.Mesh;
  private spinner: THREE.Mesh;
  private hatAnchor = new THREE.Vector3();
  private hatRx = 0;
  private hatKind: HatKind = 'straw';
  private readonly mats: Materials;
  private detail = true;
  skin: CrabSkin = CRAB_SKINS[0] as CrabSkin;

  // animation state
  private state: CrabState = 'idle';
  private stateT = 0;
  private blendT = 1;
  private blendDur = 0.12;
  private readonly from: Pose = new Float32Array(P_N);
  private readonly target: Pose = new Float32Array(P_N);
  private readonly out: Pose = new Float32Array(P_N);
  /** the blended pose before overlays: cross-fades start from here so overlays never apply twice */
  private readonly base: Pose = new Float32Array(P_N);
  private mouth: Mouth = 0;
  private phase = 0;
  private time = 0;
  private wasGrounded = true;
  private readonly squash = new Spring(1, { freq: 20, damping: 0.42 });
  private readonly lean = new Spring(0, { freq: 16, damping: 0.55 });
  private readonly hatX = new Spring(0, { freq: 11, damping: 0.25 });
  private readonly hatZ = new Spring(0, { freq: 11, damping: 0.25 });
  private readonly antX = [new Spring(0, { freq: 14, damping: 0.18 }), new Spring(0, { freq: 14, damping: 0.18 })];
  private readonly antZ = [new Spring(0, { freq: 14, damping: 0.18 }), new Spring(0, { freq: 14, damping: 0.18 })];
  private laneT = 9;
  private laneDir = 0;
  private laneSettled = true;
  private airborne = false;
  private twist = 0;
  /** near miss: flinch away from the side that was close (-1/1), and a sweat drop */
  private flinchT = 9;
  private flinchDir = 0;
  private happyT = 9;
  private readonly sweat: THREE.Mesh;
  private landT = 9;
  private landHard = false;
  private bumpT = 9;
  private blinkT = 2;
  private blinkPhase = 0;
  private emoteId = '';
  /** equipped victory dance (Wardrobe) */
  dance = 'clap';
  private sparkled = false;
  private emoteCd = 4;
  private lookX = 0;
  private lookY = 0;
  private lookHold = 0;
  private wanderT = 0;
  private prevBodyY = 0;
  private prevLean = 0;
  // crash tumble
  private tumbleY = 0;
  private tumbleVy = 0;
  private tumbleRx = 0;
  private tumbleW = 0;
  private bounces = 0;
  private hatFlying = false;
  private hatVel = new THREE.Vector3();
  private hatSpin = 0;
  private readonly dizzy: THREE.Mesh;
  private dizzyT = 0;
  /** fired when an emote wants particles (Dazzle's sparkle burst) */
  onSparkle: ((x: number, y: number) => void) | null = null;

  constructor(mats: Materials) {
    this.mats = mats;
    for (let i = 0; i < BONES; i++) {
      const b = new THREE.Bone();
      b.name = `b${i}`;
      this.bones.push(b);
    }
    for (let i = 0; i < BONES; i++) {
      const p = parentOf(i);
      const r = restPos(i);
      const b = this.bones[i] as THREE.Bone;
      if (p < 0) {
        b.position.set(r[0], r[1], r[2]);
        this.root.add(b);
      } else {
        const pr = absRest(p);
        b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]);
        (this.bones[p] as THREE.Bone).add(b);
      }
    }
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);

    const mk = (mat: THREE.Material): THREE.SkinnedMesh => {
      const m = new THREE.SkinnedMesh(new THREE.BufferGeometry(), mat);
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.clayMesh = mk(mats.clay);
    this.glossMesh = mk(mats.gloss);
    this.lineMesh = mk(makeOutline(0.028, 0x3a1a10, 0.55));
    this.clayMesh.castShadow = true;
    this.glossMesh.castShadow = true;
    this.lineMesh.renderOrder = -1;

    this.hatMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
    this.hatMesh.castShadow = true;
    this.hatMesh.frustumCulled = false;
    (this.bones[B_HAT] as THREE.Bone).add(this.hatMesh);
    this.spinner = new THREE.Mesh(new THREE.BufferGeometry(), mats.clay);
    this.spinner.visible = false;
    this.hatMesh.add(this.spinner);

    // dizzy stars: one mesh, three stars around a ring
    const sb = new GeoBuilder();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      sb.ico(0xffe14a, 0.11, [Math.cos(a) * 0.55, Math.sin(i * 2.1) * 0.06, Math.sin(a) * 0.55], [1, 1, 0.5], 0);
    }
    this.dizzy = new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.dizzy.position.y = 1.5;
    this.dizzy.visible = false;
    this.root.add(this.dizzy);
    // near-miss sweat drop: a little teardrop beside the head
    const sw = new GeoBuilder();
    sw.sphere(0x8fd8ff, 0.07, [0, 0, 0], [1, 1.25, 1], 8);
    sw.cone(0x8fd8ff, 0.05, 0.09, [0, 0.1, 0], [0, 0, 0], 8);
    this.sweat = new THREE.Mesh(sw.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.sweat.visible = false;
    this.root.add(this.sweat);

    this.setSkin(CRAB_SKINS[0] as CrabSkin);
  }

  /** Low tier: lower-poly rebuild and no outline. */
  setDetail(full: boolean): void {
    if (full === this.detail) return;
    this.detail = full;
    this.setSkin(this.skin, this.hatKind);
  }

  /** Rebuild the crab for a body skin; `hat` overrides the skin's own hat (wardrobe). */
  /** hat dye (Wardrobe): 0 = original colours */
  private hatDye = 0;

  setSkin(skin: CrabSkin, hat: HatKind = skin.hat, dye = this.hatDye): void {
    this.hatDye = dye;
    this.skin = skin;
    const clay = new GeoBuilder();
    const gloss = new GeoBuilder();
    const line = new GeoBuilder();
    buildCrab(skin, this.detail, clay, gloss, line);
    const swap = (m: THREE.SkinnedMesh, g: GeoBuilder): void => {
      m.geometry.dispose();
      m.geometry = g.build();
      m.bind(this.skeleton, new THREE.Matrix4());
    };
    // bind in the rest pose
    this.resetBones();
    this.root.updateMatrixWorld(true);
    swap(this.clayMesh, clay);
    swap(this.glossMesh, gloss);
    swap(this.lineMesh, line);
    this.lineMesh.visible = this.detail;
    this.setHat(hat);
  }

  setHat(kind: HatKind): void {
    this.hatKind = kind;
    const h = buildHat(kind, this.detail);
    this.hatMesh.geometry.dispose();
    this.hatMesh.geometry = h.geo ? dyeHat(h.geo, this.hatDye) : new THREE.BufferGeometry();
    this.hatMesh.visible = h.geo !== null;
    this.hatMesh.material = h.mat === 'gold' ? this.mats.gold : h.mat === 'gloss' ? this.mats.gloss : this.mats.clay;
    const r = restPos(B_HAT);
    this.hatAnchor.set(h.pos[0] - r[0], h.pos[1] - r[1], h.pos[2] - r[2]);
    this.hatRx = h.rx;
    this.spinner.geometry.dispose();
    if (h.spinner) {
      this.spinner.geometry = h.spinner.geo;
      this.spinner.position.set(...h.spinner.pos);
      this.spinner.visible = true;
    } else {
      this.spinner.geometry = new THREE.BufferGeometry();
      this.spinner.visible = false;
    }
    this.restoreHat();
  }

  get hat(): HatKind {
    return this.hatKind;
  }

  private restoreHat(): void {
    this.hatFlying = false;
    const hb = this.bones[B_HAT] as THREE.Bone;
    if (this.hatMesh.parent !== hb) hb.add(this.hatMesh);
    this.hatMesh.position.copy(this.hatAnchor);
    this.hatMesh.rotation.set(this.hatRx, 0, 0);
  }

  private resetBones(): void {
    for (let i = 0; i < BONES; i++) {
      const b = this.bones[i] as THREE.Bone;
      const r = restPos(i);
      const p = parentOf(i);
      if (p < 0) b.position.set(r[0], r[1], r[2]);
      else {
        const pr = absRest(p);
        b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]);
      }
      b.rotation.set(0, 0, 0);
      b.scale.set(1, 1, 1);
    }
  }

  // ---- triggers (from sim events) ----
  hop(): void {
    // a quick crouch-and-spring (impulses, not snaps, so feet never teleport)
    this.squash.velocity = Math.min(this.squash.velocity, 0) - 9;
    this.hatX.impulse(-2.5);
    for (const s of this.antX) s.impulse(-6);
  }
  land(hard: boolean): void {
    this.landT = 0;
    this.landHard = hard;
    this.squash.velocity = hard ? -11 : -6;
    this.hatX.impulse(hard ? 5 : 3);
    for (const s of this.antX) s.impulse(hard ? 9 : 5);
    if (this.state === 'slam') this.setState('run');
  }
  lane(dir: number): void {
    this.laneT = 0;
    this.laneSettled = false;
    this.laneDir = dir;
    // anticipation: lean away first, the spring then swings into the move
    this.lean.velocity -= dir * 4.5;
    this.hatZ.impulse(dir * 3);
    for (const s of this.antZ) s.impulse(dir * 7);
  }
  slam(): void {
    this.setState('slam', 0.06);
  }
  /** a close shave: flinch away from the obstacle side (dir -1 = it was on the left) */
  flinch(dir: number): void {
    this.flinchT = 0;
    this.flinchDir = dir || (Math.random() < 0.5 ? -1 : 1);
    this.hatZ.impulse(-this.flinchDir * 4);
  }
  /** a happy bounce (big shells, goals) */
  happy(): void {
    this.happyT = 0;
    this.squash.velocity += 3;
  }
  bump(): void {
    this.bumpT = 0;
    this.hatZ.impulse((Math.random() < 0.5 ? -1 : 1) * 7);
    this.hatX.impulse(-4);
    this.dizzyT = 0.35;
  }
  crash(): void {
    this.setState('crash', 0.05);
    this.tumbleY = 0;
    this.tumbleVy = 5.2;
    this.tumbleRx = 0;
    this.tumbleW = -4.2;
    this.bounces = 0;
    // the hat flies off and lands nearby
    if (this.hatMesh.visible) {
      this.root.updateMatrixWorld(true);
      this.root.attach(this.hatMesh);
      this.hatFlying = true;
      // forward (away from the chase camera) and up, never at the lens
      this.hatVel.set((Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4), 4.6, -2.4);
      this.hatSpin = 7;
    }
  }
  celebrate(): void {
    this.setState('celebrate', 0.1);
  }
  /** play the skin's signature emote */
  emote(id = this.skin.id): void {
    if (this.state === 'crash') return;
    this.emoteId = id;
    this.sparkled = false;
    this.setState('emote', 0.12);
  }
  /** eyes follow a screen point (-1..1, y up), e.g. the cursor on desktop */
  look(x: number, y: number): void {
    this.lookX = clamp(x, -1, 1);
    this.lookY = clamp(y, -1, 1);
    this.lookHold = 1.5;
  }
  /** back to a neutral living crab (new run, menus) */
  reset(): void {
    this.setState('idle', 0.0001);
    this.restoreHat();
    this.tumbleY = 0;
    this.tumbleRx = 0;
    this.dizzy.visible = false;
    this.dizzyT = 0;
    this.squash.snap(1);
    this.lean.snap(0);
    this.bumpT = 9;
    this.landT = 9;
  }
  get currentState(): CrabState {
    return this.state;
  }

  private setState(s: CrabState, fade = 0.12): void {
    if (s === this.state && s !== 'emote' && s !== 'celebrate') return;
    this.from.set(this.base);
    // spins end at whole turns: take the short way home instead of unwinding
    const ry = this.from[P_ROOT_RY] as number;
    this.from[P_ROOT_RY] = ry - Math.round(ry / (Math.PI * 2)) * Math.PI * 2;
    this.state = s;
    this.stateT = 0;
    this.blendT = 0;
    this.blendDur = fade;
  }

  /** Advance the animation and write the pose into the rig. */
  update(dt: number, d: CrabDrive): void {
    this.time += dt;
    this.stateT += dt;
    this.laneT += dt;
    this.landT += dt;
    this.bumpT += dt;

    // state selection from the drive (event-driven states end on their own)
    if (d.crashT >= 0) {
      if (this.state !== 'crash') this.crash();
    } else if (this.state === 'crash') {
      this.reset();
    }
    if (this.state !== 'crash') {
      if (d.running) {
        let want: CrabState = 'run';
        if (d.rider) want = 'ride';
        else if (!d.grounded) want = this.state === 'slam' ? 'slam' : d.vy > 0 ? 'hopRise' : 'hopFall';
        // a finish celebration plays out on the ground; idle emotes give way to the run at once
        if (this.state === 'celebrate' && this.stateT < 1.6 && d.grounded) want = this.state;
        if (want !== this.state) this.setState(want, want === 'hopFall' ? 0.18 : 0.1);
      } else {
        if (this.state === 'run' || this.state === 'hopRise' || this.state === 'hopFall' || this.state === 'ride' || this.state === 'slam') this.setState('idle', 0.25);
        if ((this.state === 'emote' && this.stateT > 2.2) || (this.state === 'celebrate' && this.stateT > 2.6)) this.setState('idle', 0.3);
        if (this.state === 'idle') {
          this.emoteCd -= dt;
          if (this.emoteCd <= 0) {
            this.emoteCd = 7 + Math.random() * 5;
            this.emote();
          }
        }
      }
    }
    if (!d.grounded && this.wasGrounded && this.state !== 'crash') {
      // left the ground without a hop event (thumbnails, ride): no-op
    }
    this.wasGrounded = d.grounded;

    // gait phase: faster with speed, doubled briefly during a lane change
    const laneBoost = this.laneT < 0.25 ? 1 - this.laneT / 0.25 : 0;
    const rate = d.running ? (6 + d.speed * 1.05) * (1 + laneBoost) : 3.2;
    this.phase += dt * rate;

    // pose for the current state, cross-faded from the previous one
    this.mouth = 0;
    this.poseFor(this.state, this.target, d);
    this.blendT += dt;
    const w = this.blendDur > 0 ? smooth01(this.blendT / this.blendDur) : 1;
    const o = this.out;
    for (let i = 0; i < P_N; i++) o[i] = (this.from[i] as number) + ((this.target[i] as number) - (this.from[i] as number)) * w;
    this.base.set(o);

    this.applyOverlays(dt, d);
    this.writeRig(dt, d);
  }

  /** Fill `p` with the pose of state `s`. */
  private poseFor(s: CrabState, p: Pose, d: CrabDrive): void {
    p.fill(0);
    const t = this.stateT;
    const ph = this.phase;
    // neutral stance shared by most states
    for (let l = 0; l < 6; l++) {
      p[P_LEG + l * 4 + 1] = 0.12;
      p[P_LEG + l * 4 + 2] = 0.05;
    }
    for (let s2 = 0; s2 < 2; s2++) {
      p[P_CLAW + s2 * 4] = 0.15;
      p[P_CLAW + s2 * 4 + 3] = 0.12;
    }
    switch (s) {
      case 'idle': {
        p[P_BODY_Y] = Math.sin(this.time * 2.1) * 0.012;
        p[P_BODY_RZ] = Math.sin(this.time * 0.9) * 0.025;
        for (let s2 = 0; s2 < 2; s2++) {
          const k = s2 === 0 ? 0 : 1.7;
          p[P_CLAW + s2 * 4] = 0.18 + Math.sin(this.time * 1.3 + k) * 0.06;
          p[P_CLAW + s2 * 4 + 3] = 0.1 + Math.max(0, Math.sin(this.time * 0.8 + k)) * 0.25;
        }
        for (let l = 0; l < 6; l++) p[P_LEG + l * 4] = Math.sin(this.time * 0.7 + l) * 0.04;
        this.idleLook(p);
        break;
      }
      case 'run': {
        // tripod gait: legs alternate in two triangles
        for (let l = 0; l < 6; l++) {
          const side = l < 3 ? 0 : 1;
          const g = ((l % 3) % 2) ^ side;
          const lp = ph + g * Math.PI;
          const lift = Math.max(0, Math.cos(lp));
          // a faster, wider stride with speed keeps the feet closer to the ground speed
          p[P_LEG + l * 4] = Math.sin(lp) * 0.5;
          p[P_LEG + l * 4 + 1] = 0.1 + lift * 0.46;
          p[P_LEG + l * 4 + 2] = -lift * 0.5;
          p[P_LEG + l * 4 + 3] = lift * 0.3;
        }
        p[P_BODY_Y] = Math.abs(Math.sin(ph)) * 0.05;
        p[P_BODY_RZ] = Math.sin(ph) * 0.045;
        p[P_BODY_RX] = 0.06;
        for (let s2 = 0; s2 < 2; s2++) {
          const sg = s2 === 0 ? 1 : -1;
          p[P_CLAW + s2 * 4] = 0.2 + Math.sin(ph + s2 * Math.PI) * 0.1;
          p[P_CLAW + s2 * 4 + 1] = Math.sin(ph + s2 * Math.PI) * 0.18 * sg;
          p[P_CLAW + s2 * 4 + 2] = 0.1;
          p[P_CLAW + s2 * 4 + 3] = 0.1 + Math.max(0, Math.sin(ph * 0.5 + s2 * 2)) * 0.22;
        }
        p[P_LOOK_Y] = -0.1;
        break;
      }
      case 'hopRise':
        for (let l = 0; l < 6; l++) {
          p[P_LEG + l * 4] = (l % 3 === 0 ? 0.2 : l % 3 === 2 ? -0.2 : 0) * (l < 3 ? 1 : -1);
          p[P_LEG + l * 4 + 1] = 0.75;
          p[P_LEG + l * 4 + 2] = -0.95;
          p[P_LEG + l * 4 + 3] = 0.6;
        }
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = 0.95;
          p[P_CLAW + s2 * 4 + 2] = 0.55;
          p[P_CLAW + s2 * 4 + 3] = 0.6;
        }
        p[P_LOOK_Y] = 0.3;
        p[P_BODY_RX] = -0.12;
        this.mouth = 1;
        break;
      case 'hopFall':
        for (let l = 0; l < 6; l++) {
          p[P_LEG + l * 4 + 1] = -0.12;
          p[P_LEG + l * 4 + 2] = 0.35;
          p[P_LEG + l * 4 + 3] = -0.1;
        }
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = 0.5;
          p[P_CLAW + s2 * 4 + 1] = (s2 === 0 ? -1 : 1) * 0.25;
          p[P_CLAW + s2 * 4 + 3] = 0.35;
        }
        p[P_LOOK_Y] = -0.45;
        p[P_BODY_RX] = 0.12;
        this.mouth = 1;
        break;
      case 'slam': {
        // half spin into a dive
        const k = smooth01(t / 0.22);
        p[P_ROOT_RY] = k * Math.PI * 2;
        p[P_BODY_RX] = 0.45 * k;
        for (let l = 0; l < 6; l++) {
          p[P_LEG + l * 4 + 1] = 0.9;
          p[P_LEG + l * 4 + 2] = -1.1;
        }
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = -0.2;
          p[P_CLAW + s2 * 4 + 1] = (s2 === 0 ? 1 : -1) * 0.5;
        }
        p[P_LID] = 0.5;
        this.mouth = 2;
        break;
      }
      case 'ride':
        // surf stance: legs bent, claws out for balance, swaying with the wave
        for (let l = 0; l < 6; l++) {
          p[P_LEG + l * 4 + 1] = 0.3;
          p[P_LEG + l * 4 + 2] = -0.5;
          p[P_LEG + l * 4 + 3] = 0.25;
        }
        for (let s2 = 0; s2 < 2; s2++) {
          const sg = s2 === 0 ? -1 : 1;
          p[P_CLAW + s2 * 4] = 0.65 + Math.sin(this.time * 3 + s2 * Math.PI) * 0.15;
          p[P_CLAW + s2 * 4 + 1] = sg * 0.45;
          p[P_CLAW + s2 * 4 + 3] = 0.5;
        }
        p[P_BODY_RZ] = Math.sin(this.time * 3) * 0.12;
        p[P_BODY_Y] = -0.06;
        p[P_LOOK_Y] = 0.1;
        this.mouth = 0;
        break;
      case 'crash': {
        // limbs flail then wiggle on its back; swirly eyes
        const wig = Math.min(1, t * 2);
        for (let l = 0; l < 6; l++) {
          p[P_LEG + l * 4] = Math.sin(this.time * 16 + l * 1.7) * 0.35 * wig;
          p[P_LEG + l * 4 + 1] = 0.5 + Math.sin(this.time * 13 + l) * 0.3;
          p[P_LEG + l * 4 + 2] = -0.4 + Math.sin(this.time * 11 + l * 2) * 0.35;
        }
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = 0.7 + Math.sin(this.time * 9 + s2) * 0.25;
          p[P_CLAW + s2 * 4 + 3] = 0.6;
        }
        p[P_LOOK_X] = Math.cos(this.time * 9) * 0.6;
        p[P_LOOK_Y] = Math.sin(this.time * 9) * 0.6;
        p[P_LID] = 0.35;
        this.mouth = 3;
        break;
      }
      case 'celebrate':
        this.poseDance(p, t);
        break;
      case 'emote':
        this.poseEmote(p, t);
        break;
    }
    void d;
  }

  /** Victory dances (Wardrobe, UPDATE2_PLAN.md §6.3); each lasts about 2.4 s. */
  private poseDance(p: Pose, t: number): void {
    const k = smooth01(t / 0.25) * (1 - smooth01((t - 2.2) / 0.35));
    switch (this.dance) {
      case 'spin': {
        // two hop spins, claws thrown up on the second
        for (let n = 0; n < 2; n++) {
          const j = (t - 0.15 - n * 0.85) / 0.7;
          if (j <= 0 || j >= 1) continue;
          p[P_LIFT] = arc(j) * (0.55 + n * 0.35);
          p[P_ROOT_RY] = smooth01(j) * Math.PI * 2 * (n === 0 ? 1 : -1);
          for (let l = 0; l < 6; l++) {
            p[P_LEG + l * 4 + 1] = 0.12 + arc(j) * 0.7;
            p[P_LEG + l * 4 + 2] = -arc(j) * 0.8;
          }
        }
        const up = smooth01((t - 1.0) / 0.3) * k;
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = 0.3 + up * 1.0;
          p[P_CLAW + s2 * 4 + 1] = (s2 === 0 ? -1 : 1) * 0.7 * up;
          p[P_CLAW + s2 * 4 + 3] = 0.6;
        }
        this.mouth = 1;
        break;
      }
      case 'wave':
        // both claws sweep overhead like a stadium wave, body swaying
        for (let s2 = 0; s2 < 2; s2++) {
          const ph = t * 7 + s2 * Math.PI;
          p[P_CLAW + s2 * 4] = (1.1 + Math.sin(ph) * 0.3) * k;
          p[P_CLAW + s2 * 4 + 1] = (s2 === 0 ? -1 : 1) * (0.55 + Math.sin(ph) * 0.3) * k;
          p[P_CLAW + s2 * 4 + 2] = (0.4 + Math.cos(ph) * 0.3) * k;
          p[P_CLAW + s2 * 4 + 3] = 0.45;
        }
        p[P_BODY_RZ] = Math.sin(t * 7) * 0.14 * k;
        p[P_BODY_Y] = Math.abs(Math.sin(t * 7)) * 0.05 * k;
        p[P_LOOK_Y] = 0.25 * k;
        this.mouth = 1;
        break;
      case 'shimmy':
        // hips (well, shell) shake while the claws pump in turn and the feet shuffle
        p[P_BODY_RZ] = Math.sin(t * 22) * 0.16 * k;
        p[P_BODY_RY] = Math.sin(t * 11) * 0.2 * k;
        p[P_BODY_Y] = -0.05 * k;
        for (let s2 = 0; s2 < 2; s2++) {
          const pump = Math.max(0, Math.sin(t * 9 + s2 * Math.PI));
          p[P_CLAW + s2 * 4] = (0.4 + pump * 0.8) * k;
          p[P_CLAW + s2 * 4 + 1] = (s2 === 0 ? -1 : 1) * 0.2;
          p[P_CLAW + s2 * 4 + 2] = 0.3 + pump * 0.4;
          p[P_CLAW + s2 * 4 + 3] = 0.2 + pump * 0.5;
        }
        for (let l = 0; l < 6; l++) {
          const lift = Math.max(0, Math.sin(t * 18 + l * 1.3));
          p[P_LEG + l * 4] = Math.sin(t * 9 + l) * 0.25 * k;
          p[P_LEG + l * 4 + 1] = 0.15 + lift * 0.3 * k;
        }
        p[P_LID] = 0.4 * k;
        this.mouth = 1;
        break;
      case 'hattoss': {
        // a big hat throw: several flips high overhead, watched all the way, caught with a bow
        const h = (t - 0.35) / 1.5;
        p[P_HAT_Y] = arc(h) * 3.2;
        p[P_HAT_RX] = h > 0 && h < 1 ? smooth01(h) * Math.PI * 6 : 0;
        p[P_HAT_RZ] = h > 0 && h < 1 ? Math.sin(h * Math.PI) * 0.6 : 0;
        const look = h > 0 && h < 1 ? arc(h) : 0;
        p[P_LOOK_Y] = look * 0.9;
        p[P_BODY_RX] = -look * 0.25 + (t > 1.9 ? 0.3 * arc((t - 1.9) / 0.5) : 0);
        const throwK = arc((t - 0.1) / 0.45);
        p[P_CLAW + 4] = 0.3 + throwK * 1.2 + look * 0.5;
        p[P_CLAW + 4 + 1] = -0.3 * throwK;
        p[P_CLAW + 4 + 2] = 0.5;
        p[P_CLAW] = 0.3 + look * 0.6;
        p[P_CLAW + 3] = 0.5 * look;
        // step under it
        p[P_BODY_RY] = Math.sin(h * Math.PI * 2) * 0.2 * look;
        this.mouth = look > 0.3 ? 1 : 0;
        break;
      }
      case 'moonwalk': {
        // the Moonscuttle: legs glide backwards, one claw points to the sky, a spin and a pose
        for (let l = 0; l < 6; l++) {
          const g = (l % 2) * Math.PI;
          const lp = -t * 9 + g;
          p[P_LEG + l * 4] = Math.sin(lp) * 0.4 * k;
          p[P_LEG + l * 4 + 1] = 0.12 + Math.max(0, Math.cos(lp)) * 0.18 * k;
        }
        p[P_BODY_RX] = -0.12 * k;
        p[P_BODY_RZ] = Math.sin(t * 9) * 0.04 * k;
        const spin = (t - 1.3) / 0.5;
        p[P_ROOT_RY] = smooth01(spin) * Math.PI * 2;
        const pose = smooth01((t - 1.8) / 0.15) * k;
        p[P_CLAW + 4] = 0.3 + pose * 1.25;
        p[P_CLAW + 4 + 1] = 0.75 * pose;
        p[P_CLAW + 4 + 2] = 0.1;
        p[P_CLAW + 4 + 3] = 0.05;
        p[P_CLAW] = 0.25;
        p[P_CLAW + 1] = 0.5 * pose;
        p[P_HAT_RZ] = 0.25 * pose;
        p[P_LID] = 0.35 * k;
        this.mouth = pose > 0.5 ? 1 : 0;
        break;
      }
      default: {
        // Claw Clap: claps at chest height (under the eyes), a jump spin, a hat toss caught on the head
        const clap = t < 0.9 ? Math.abs(Math.sin(t * 14)) : 0;
        const spinUp = smooth01((t - 0.9) / 0.25) * (1 - smooth01((t - 1.7) / 0.4));
        for (let s2 = 0; s2 < 2; s2++) {
          const sg = s2 === 0 ? 1 : -1;
          p[P_CLAW + s2 * 4] = -0.35 * (1 - spinUp) + 1.0 * spinUp;
          p[P_CLAW + s2 * 4 + 1] = sg * (0.05 + clap * 0.42) * (1 - spinUp) - sg * 0.6 * spinUp;
          p[P_CLAW + s2 * 4 + 2] = 0.15;
          p[P_CLAW + s2 * 4 + 3] = 0.5 * (1 - clap);
        }
        const j = (t - 0.9) / 0.7;
        p[P_LIFT] = arc(j) * 0.9;
        p[P_ROOT_RY] = smooth01(j) * Math.PI * 2;
        const h = (t - 0.85) / 0.9;
        p[P_HAT_Y] = arc(h) * 1.6;
        p[P_HAT_RX] = h > 0 && h < 1 ? h * Math.PI * 2 : 0;
        for (let l = 0; l < 6; l++) {
          p[P_LEG + l * 4 + 1] = 0.12 + arc(j) * 0.6;
          p[P_LEG + l * 4 + 2] = -arc(j) * 0.7;
        }
        this.mouth = j > 0 && j < 1 ? 1 : 0;
        break;
      }
    }
  }

  /** Signature emotes (UPDATE2_PLAN.md §3.2). */
  private poseEmote(p: Pose, t: number): void {
    const k = smooth01(t / 0.3) * (1 - smooth01((t - 1.7) / 0.4));
    switch (this.emoteId) {
      case 'chill':
        // shades slide down the nose, a cool look over them, then back up
        p[P_HAT_Y] = -0.12 * k;
        p[P_LOOK_Y] = 0.35 * k;
        p[P_LID] = 0.3 * k;
        p[P_BODY_RZ] = 0.08 * k;
        p[P_CLAW + 4] = 0.15;
        p[P_CLAW + 4 + 3] = 0.05;
        break;
      case 'blossom':
        p[P_ROOT_RY] = smooth01((t - 0.2) / 1.1) * Math.PI * 2;
        p[P_LIFT] = arc((t - 0.2) / 1.1) * 0.2;
        for (let s2 = 0; s2 < 2; s2++) p[P_CLAW + s2 * 4] = 0.2 + 0.7 * k;
        p[P_LID] = 0.55 * k;
        break;
      case 'skipper':
        // salute with the right claw
        p[P_CLAW + 4] = 1.35 * k;
        p[P_CLAW + 4 + 1] = -0.55 * k;
        p[P_CLAW + 4 + 2] = 1.0 * k;
        p[P_CLAW + 4 + 3] = 0;
        p[P_BODY_RX] = -0.06 * k;
        break;
      case 'pinch':
        // claw spyglass at one eye, scanning the horizon
        p[P_CLAW] = 1.1 * k;
        p[P_CLAW + 1] = 0.7 * k;
        p[P_CLAW + 2] = 0.9 * k;
        p[P_CLAW + 3] = 0.05;
        p[P_LOOK_X] = Math.sin(t * 2.5) * 0.6 * k;
        p[P_BODY_RY] = Math.sin(t * 2.5) * 0.25 * k;
        break;
      case 'dazzle':
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = 1.2 * k;
          p[P_CLAW + s2 * 4 + 1] = (s2 === 0 ? -1 : 1) * 0.4 * k;
          p[P_CLAW + s2 * 4 + 3] = 0.7 * k;
        }
        p[P_LIFT] = arc((t - 0.3) / 0.5) * 0.35;
        if (t > 0.55 && !this.sparkled) {
          this.sparkled = true;
          this.onSparkle?.(0, 1.2);
        }
        this.mouth = 1;
        break;
      case 'yawn':
        p[P_LID] = 0.8 * k;
        for (let s2 = 0; s2 < 2; s2++) {
          p[P_CLAW + s2 * 4] = 1.0 * k;
          p[P_CLAW + s2 * 4 + 2] = 0.6 * k;
        }
        p[P_BODY_RX] = -0.12 * k;
        this.mouth = k > 0.4 ? 1 : 0;
        break;
      case 'wave':
        p[P_CLAW + 4] = 1.3 * k;
        p[P_CLAW + 4 + 2] = 0.3 + Math.sin(t * 12) * 0.35 * k;
        p[P_CLAW + 4 + 3] = 0.5;
        p[P_BODY_RZ] = -0.06 * k;
        break;
      default:
        // Sandy (and anyone without a signature): a friendly hat tip
        p[P_CLAW + 4] = 1.25 * k;
        p[P_CLAW + 4 + 1] = -0.5 * k;
        p[P_CLAW + 4 + 2] = 0.9 * k;
        p[P_HAT_RX] = 0.35 * arc((t - 0.35) / 0.9);
        p[P_HAT_Y] = 0.1 * arc((t - 0.35) / 0.9);
        p[P_BODY_RX] = 0.12 * arc((t - 0.35) / 0.9);
        break;
    }
    if (this.emoteId !== 'pinch') this.idleLook(p);
  }

  /** wandering eyes when nobody is pointing */
  private idleLook(p: Pose): void {
    if (this.lookHold > 0) {
      p[P_LOOK_X] = this.lookX;
      p[P_LOOK_Y] = this.lookY;
      return;
    }
    const t = this.time;
    const step = Math.floor(t / 1.7);
    p[P_LOOK_X] = (hash3(step, 1, 2) - 0.5) * 0.9;
    p[P_LOOK_Y] = (hash3(step, 3, 4) - 0.5) * 0.5;
  }

  /** springs, squash, lean, blink, bump and land on top of the blended pose */
  private applyOverlays(dt: number, d: CrabDrive): void {
    const o = this.out;
    this.lookHold -= dt;
    this.wanderT += dt;
    // lean follows lateral speed
    this.lean.target = d.running ? clamp(d.vx / 16, -1, 1) : 0;
    const lean = this.lean.update(dt);
    o[P_BODY_RZ] = (o[P_BODY_RZ] as number) - lean * 0.38;
    o[P_BODY_RY] = (o[P_BODY_RY] as number) + lean * 0.2;
    if (this.laneT < 0.32) {
      // lane change: the lead claw reaches into the move, the other tucks, the body lifts a little
      const k = Math.min(1, this.laneT / 0.05) * (1 - smooth01((this.laneT - 0.12) / 0.2));
      const lead = this.laneDir < 0 ? 0 : 1;
      const trail = 1 - lead;
      o[P_CLAW + lead * 4] = (o[P_CLAW + lead * 4] as number) + 0.55 * k;
      o[P_CLAW + lead * 4 + 1] = (o[P_CLAW + lead * 4 + 1] as number) + (lead === 0 ? -1 : 1) * 0.45 * k;
      o[P_CLAW + lead * 4 + 3] = (o[P_CLAW + lead * 4 + 3] as number) + 0.4 * k;
      o[P_CLAW + trail * 4] = (o[P_CLAW + trail * 4] as number) - 0.15 * k;
      o[P_BODY_Y] = (o[P_BODY_Y] as number) + 0.05 * k;
      o[P_BODY_RX] = (o[P_BODY_RX] as number) - 0.08 * k;
      o[P_LOOK_X] = (o[P_LOOK_X] as number) + this.laneDir * 0.5 * k;
    }
    if (!this.laneSettled && this.laneT > 0.2) {
      // arrival: a little squash and the hat sways on
      this.laneSettled = true;
      this.squash.velocity -= 4;
      this.hatZ.impulse(-this.laneDir * 2);
    }
    if (this.laneT < 0.25) {
      // legs on the leading side splay out during the scuttle
      const k = Math.min(1, this.laneT / 0.04) * (1 - this.laneT / 0.25);
      for (let l = 0; l < 6; l++) {
        const leading = (l < 3 ? -1 : 1) === this.laneDir;
        o[P_LEG + l * 4 + 1] = (o[P_LEG + l * 4 + 1] as number) + (leading ? 0.25 : -0.1) * k;
      }
    }
    // landing: leg splay
    if (this.landT < 0.25) {
      const k = Math.min(1, this.landT / 0.05) * (1 - this.landT / 0.25) * (this.landHard ? 1.4 : 1);
      for (let l = 0; l < 6; l++) {
        o[P_LEG + l * 4 + 1] = (o[P_LEG + l * 4 + 1] as number) - 0.35 * k;
        o[P_LEG + l * 4 + 2] = (o[P_LEG + l * 4 + 2] as number) + 0.3 * k;
      }
      this.mouth = this.landHard ? 2 : this.mouth;
    }
    // bump: head snap, eyes squeezed shut
    if (this.bumpT < 0.35) {
      const k = Math.min(1, this.bumpT / 0.04) * (1 - this.bumpT / 0.35);
      o[P_BODY_RX] = (o[P_BODY_RX] as number) - 0.35 * k * k;
      o[P_LID] = Math.max(o[P_LID] as number, this.bumpT < 0.25 ? 1 : 0);
      this.mouth = 2;
    }
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkPhase = 0.15;
      this.blinkT = 2 + Math.random() * 3;
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase = Math.max(0, this.blinkPhase - dt);
      o[P_LID] = Math.max(o[P_LID] as number, arc(1 - this.blinkPhase / 0.15));
    }
    // in the air: stretch while rising, tuck at the apex, a barrel twist on mid-air lane changes
    this.airborne = !d.grounded && this.state !== 'crash';
    const twistTo = this.airborne && this.laneT < 0.4 ? -this.laneDir * arc(this.laneT / 0.4) * 0.6 : 0;
    this.twist += (twistTo - this.twist) * Math.min(1, dt * 7);
    o[P_BODY_RZ] = (o[P_BODY_RZ] as number) + this.twist;
    // near miss: head whips away, eyes squeeze, sweat flies
    if (this.flinchT < 0.5) {
      const k = Math.min(1, this.flinchT / 0.04) * (1 - smooth01((this.flinchT - 0.1) / 0.4));
      o[P_BODY_RY] = (o[P_BODY_RY] as number) - this.flinchDir * 0.3 * k;
      o[P_BODY_RZ] = (o[P_BODY_RZ] as number) + this.flinchDir * 0.12 * k;
      o[P_LOOK_X] = (o[P_LOOK_X] as number) + this.flinchDir * 0.7 * k;
      o[P_LID] = Math.max(o[P_LID] as number, 0.55 * k);
      this.mouth = 2;
    }
    this.flinchT += dt;
    this.sweat.visible = this.flinchT < 0.55;
    if (this.sweat.visible) {
      const t = this.flinchT;
      this.sweat.position.set(-this.flinchDir * (0.45 + t * 0.9), 1.05 + t * 1.2 - t * t * 3, 0.15);
      this.sweat.scale.setScalar(Math.max(0.01, 1 - t * 1.4));
    }
    // happy bounce
    if (this.happyT < 0.35) {
      o[P_LIFT] = (o[P_LIFT] as number) + arc(this.happyT / 0.35) * 0.12;
      if (this.state === 'run') this.mouth = 1;
    }
    this.happyT += dt;
    // power-up stances
    if (d.magnet && this.state === 'run') {
      for (let s2 = 0; s2 < 2; s2++) {
        o[P_CLAW + s2 * 4] = (o[P_CLAW + s2 * 4] as number) + 0.7;
        o[P_CLAW + s2 * 4 + 1] = (o[P_CLAW + s2 * 4 + 1] as number) + (s2 === 0 ? -1 : 1) * 0.35;
        o[P_CLAW + s2 * 4 + 3] = 0.65;
      }
    }
    if (d.shield && this.state === 'run') o[P_BODY_Y] = (o[P_BODY_Y] as number) + Math.sin(this.time * 5) * 0.03;
    // squash spring: stretch while rising, a slight squash as it falls
    this.squash.target = this.airborne && this.state !== 'slam' ? 1 + clamp(d.vy * 0.016, -0.06, 0.1) : 1;
    this.squash.update(dt);
    // secondary motion: hat and antennae react to body acceleration
    const by = o[P_BODY_Y] as number;
    const vy = (by - this.prevBodyY) / Math.max(dt, 1e-4);
    const dl = (lean - this.prevLean) / Math.max(dt, 1e-4);
    this.prevBodyY = by;
    this.prevLean = lean;
    this.hatX.impulse(-vy * 0.25 * dt * 60);
    this.hatZ.impulse(dl * 0.05);
    this.hatX.update(dt);
    this.hatZ.update(dt);
    const trail = d.running ? 0.35 + d.speed * 0.012 : 0.05;
    for (let s = 0; s < 2; s++) {
      const ax = this.antX[s] as Spring;
      const az = this.antZ[s] as Spring;
      ax.target = trail;
      az.target = 0;
      ax.impulse(-vy * 0.6 * dt * 60);
      az.impulse(dl * 0.12);
      ax.update(dt);
      az.update(dt);
    }
  }

  /** write the final pose into the bones */
  private writeRig(dt: number, d: CrabDrive): void {
    const o = this.out;
    const bone = (i: number): THREE.Bone => this.bones[i] as THREE.Bone;
    const root = bone(B_ROOT);
    const sq = this.squash.value;
    const sxz = 1 / Math.sqrt(Math.max(0.5, sq));
    root.scale.set(sxz, sq, sxz);
    root.rotation.set(0, o[P_ROOT_RY] as number, 0);
    root.position.set(0, o[P_LIFT] as number, 0);

    // crash: a physics tumble that bounces twice and ends on its back
    if (this.state === 'crash') {
      const g = 22;
      this.tumbleVy -= g * dt;
      this.tumbleY += this.tumbleVy * dt;
      this.tumbleRx += this.tumbleW * dt;
      const restRx = -1.95;
      if (this.tumbleY <= 0) {
        this.tumbleY = 0;
        if (this.bounces < 2 && this.tumbleVy < -1.5) {
          this.tumbleVy = -this.tumbleVy * 0.4;
          this.bounces++;
        } else this.tumbleVy = 0;
        this.tumbleW *= 0.5;
      }
      if (this.bounces >= 1 && this.tumbleY <= 0.01) {
        // settle onto the back
        this.tumbleRx += (restRx - this.tumbleRx) * Math.min(1, dt * 8);
        this.tumbleW = 0;
      } else if (this.tumbleRx < restRx - 0.3) this.tumbleW = Math.abs(this.tumbleW) * 0.3;
      const lift = Math.sin(clamp(-this.tumbleRx / 1.95, 0, 1) * Math.PI * 0.5) * 0.66;
      root.position.y = this.tumbleY + lift;
      root.rotation.x = this.tumbleRx;
      this.dizzy.visible = this.stateT > 0.5;
    } else {
      this.dizzy.visible = this.dizzyT > 0;
    }
    if (this.dizzyT > 0) this.dizzyT -= dt;
    if (this.dizzy.visible) {
      this.dizzy.rotation.y = this.time * 5;
      this.dizzy.scale.setScalar(1 + Math.sin(this.time * 14) * 0.12);
      if (this.state === 'crash') this.dizzy.position.set(0, 1.35, -0.7);
      else this.dizzy.position.set(0, 1.5, 0);
    }

    const body = bone(B_BODY);
    body.position.set(0, 0.45 + (o[P_BODY_Y] as number), 0);
    body.rotation.set(o[P_BODY_RX] as number, o[P_BODY_RY] as number, o[P_BODY_RZ] as number);

    // eyes look around; lids blink
    for (let s = 0; s < 2; s++) {
      const e = bone(B_EYE[s] as number);
      e.rotation.set(-(o[P_LOOK_Y] as number) * 0.45, (o[P_LOOK_X] as number) * 0.55, 0);
      const lid = bone(B_LID[s] as number);
      lid.rotation.x = clamp(o[P_LID] as number, 0, 1) * 2.2;
      const a = bone(B_ANT[s] as number);
      a.rotation.set((this.antX[s] as Spring).value, 0, (this.antZ[s] as Spring).value * (s === 0 ? 1 : 1));
    }
    // mouth: show one expression
    for (let m = 0; m < 4; m++) {
      const v = m === this.mouth ? 1 : 1e-4;
      bone(B_MOUTH[m] as number).scale.set(v, v, v);
    }
    // claws
    for (let s = 0; s < 2; s++) {
      const sg = s === 0 ? -1 : 1;
      const raise = o[P_CLAW + s * 4] as number;
      const swing = o[P_CLAW + s * 4 + 1] as number;
      const elbow = o[P_CLAW + s * 4 + 2] as number;
      const jaw = o[P_CLAW + s * 4 + 3] as number;
      bone(B_SH[s] as number).rotation.set(-raise * 0.55, swing, sg * raise * 0.6);
      bone(B_EL[s] as number).rotation.set(-elbow * 0.6, -sg * elbow * 0.5, 0);
      bone(B_JAW[s] as number).rotation.set(clamp(jaw, 0, 1) * 0.75, 0, 0);
    }
    // legs: hip swings forward/back and raises; knee and foot fold
    for (let l = 0; l < 6; l++) {
      const sg = l < 3 ? -1 : 1;
      const swing = o[P_LEG + l * 4] as number;
      const raise = o[P_LEG + l * 4 + 1] as number;
      const knee = o[P_LEG + l * 4 + 2] as number;
      const foot = o[P_LEG + l * 4 + 3] as number;
      bone(B_HIP(l)).rotation.set(0, swing * sg, sg * raise * 0.9);
      bone(B_KNEE(l)).rotation.set(0, 0, sg * knee);
      bone(B_FOOT(l)).rotation.set(0, 0, sg * foot);
    }
    // hat: wobble springs plus pose offsets (tips, tosses, slides)
    const hb = bone(B_HAT);
    hb.position.set(0, 0.93 - 0.45 + (o[P_HAT_Y] as number), -0.04);
    hb.rotation.set(this.hatX.value * 0.12 + (o[P_HAT_RX] as number), 0, this.hatZ.value * 0.1 + (o[P_HAT_RZ] as number));
    if (this.spinner.visible) this.spinner.rotation.y += dt * (d.running ? 10 + d.speed * 0.6 : 5);

    // flying hat after a crash
    if (this.hatFlying) {
      const h = this.hatMesh;
      if (h.position.y > 0.12 || this.hatVel.y > 0) {
        this.hatVel.y -= 16 * dt;
        h.position.addScaledVector(this.hatVel, dt);
        h.rotation.z += this.hatSpin * dt;
        h.rotation.x += this.hatSpin * 0.4 * dt;
        if (h.position.y < 0.12) {
          h.position.y = 0.12;
          this.hatVel.set(0, 0, 0);
          h.rotation.set(-0.1, h.rotation.y, 0.25);
        }
      }
    }
  }
}

const _abs = new Map<number, V3>();
function absRest(i: number): V3 {
  let r = _abs.get(i);
  if (!r) {
    r = restPos(i);
    _abs.set(i, r);
  }
  return r;
}

// ---- geometry ----------------------------------------------------------------------------------

function smoothProfile(pts: [number, number][], n: number): [number, number][] {
  const c = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getPoints(n).map((p) => [Math.max(0, p.x), p.y] as [number, number]);
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();

/**
 * Crab v2 geometry (UPDATE2_PLAN.md §2.2), built in the rest pose and tagged per bone. `clay` gets
 * the matte parts, `gloss` the shell, claws and eyes, `line` the silhouette for the outline hull.
 */
export function buildCrab(skin: CrabSkin, hi: boolean, clay: GeoBuilder, gloss: GeoBuilder, line: GeoBuilder): void {
  const outlineOnly = clay === line;
  const seg = (n: number): number => Math.max(4, Math.round(hi ? n : n * 0.55));
  const body = skin.body;
  const dark = skin.dark;
  const belly = skin.belly;
  // the outline hull only needs silhouettes: it is built from a low-detail pass of the same shapes
  let lineTo: GeoBuilder | null = line;
  if (hi) {
    buildCrab(skin, false, line, line, line);
    lineTo = null;
  }
  const both = (b: GeoBuilder, fn: (g: GeoBuilder) => void): void => {
    fn(b);
    if (lineTo && lineTo !== b) fn(lineTo);
  };
  const deco = !outlineOnly;
  // budget spheres: rows scale with the segment count instead of GeoBuilder's 6-row minimum
  const ball = (g: GeoBuilder, color: number, r: number, pos: V3, scale: V3, w: number, rot: V3 = [0, 0, 0]): GeoBuilder => {
    const ws = Math.max(5, Math.round(hi ? w : w * 0.6));
    return g.geo(new THREE.SphereGeometry(r, ws, Math.max(3, Math.round(ws * 0.6))), color, pos, rot, scale);
  };
  const tub = (n: number): number => (hi ? n : Math.max(2, Math.round(n * 0.6)));

  // carapace: a lathe with a flatter belly, a rim ridge and a domed top, painted
  const profile = smoothProfile(
    [[0.0, 0.12], [0.3, 0.13], [0.48, 0.2], [0.59, 0.31], [0.645, 0.43], [0.655, 0.5], [0.635, 0.57], [0.58, 0.67], [0.48, 0.78], [0.33, 0.87], [0.16, 0.915], [0.0, 0.93]],
    hi ? 18 : 10,
  );
  const shellPaint = (x: number, y: number, z: number, c: THREE.Color): void => {
    _ca.set(body);
    // belly plate on the lower front, with segment lines
    // the underside is belly-coloured too (seen when the crab ends up on its back)
    const bellyW = Math.max(smooth01((0.53 - y) / 0.06) * smooth01((z + 0.05) / 0.25), smooth01((0.3 - y) / 0.1));
    if (bellyW > 0) {
      _cb.set(belly);
      const seam = Math.abs(((y - 0.2) / 0.085) % 1 - 0.5) < 0.08 && y < 0.45 ? 0.86 : 1;
      _cb.multiplyScalar(seam);
      _ca.lerp(_cb, bellyW);
    }
    // darker top and a soft rim highlight
    const top = smooth01((y - 0.62) / 0.3);
    _cb.set(dark);
    _ca.lerp(_cb, top * 0.38);
    if (Math.abs(y - 0.5) < 0.03) _ca.multiplyScalar(1.06);
    // painted patterns
    if (skin.pattern === 'rainbow') {
      // clean concentric bands from the crown of the shell down to the rim
      const band = Math.floor(Math.hypot(x, z * 1.2) * 7 + (y > 0.8 ? 0 : 0.5));
      _cb.setHSL(((band * 0.14 + 0.92) % 1 + 1) % 1, 0.8, 0.6);
      _ca.lerp(_cb, 0.82 * (1 - bellyW) * smooth01((y - 0.36) / 0.1));
    } else if (skin.pattern === 'lava') {
      // glowing cracks: thin bright veins in a dark shell
      const v = Math.abs(Math.sin(x * 11 + Math.sin(z * 9) * 1.8) * Math.cos(z * 7 - x * 3));
      if (y > 0.35) _ca.lerp(_cb.set(0xff7a1a), smooth01((0.16 - v) / 0.1) * 0.95);
    } else if (skin.pattern === 'pearl') {
      // pearly sheen: pastel hues shift around the shell
      _cb.setHSL(((Math.atan2(z, x) / (Math.PI * 2) + y * 0.6) % 1 + 1) % 1, 0.75, 0.82);
      _ca.lerp(_cb, 0.7 * (1 - bellyW));
    } else if (skin.pattern === 'gold') {
      _ca.multiplyScalar(0.92 + hash3(Math.round(x * 14), Math.round(y * 14), Math.round(z * 14)) * 0.16);
    }
    // fine speckles on the top of the shell (every body; subtle)
    if (y > 0.6 && skin.pattern !== 'rainbow' && hash3(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30)) > 0.9) _ca.multiplyScalar(1.12);
    // warm sides: a slightly lighter band just above the rim
    _ca.multiplyScalar(1 + 0.07 * Math.max(0, 1 - Math.abs(y - 0.58) / 0.08));
    // baked occlusion under the rim
    _ca.multiplyScalar(0.82 + 0.18 * smooth01((y - 0.12) / 0.2));
    c.copy(_ca);
  };
  /** shell radius at height y (before scaling): details are placed on the real surface */
  const shellR = (y: number): number => {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1] as [number, number];
      const b = profile[i] as [number, number];
      if (y >= a[1] && y <= b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / Math.max(1e-6, b[1] - a[1]);
    }
    return 0;
  };
  /** a point on the shell surface at height y, angle a (0 = front, π = back), pushed out by `out` */
  const onShell = (y: number, a: number, out = 0): V3 => [Math.sin(a) * (shellR(y) * 1.05 + out), y * 0.96, Math.cos(a) * (shellR(y) * 0.82 + out)];
  /** Crab v3 carapace sculpt: a scalloped rim lip, a notch between the eyes and a raised crown. */
  const sculpt = (p: THREE.Vector3): void => {
    const a = Math.atan2(p.x, p.z / 0.82);
    const rimK = Math.max(0, 1 - Math.abs(p.y - 0.5) / 0.09);
    // scallops all round the rim, stronger at the sides (crab "teeth")
    const side = Math.abs(Math.sin(a));
    const sc = Math.max(0, Math.cos(a * 9)) ** 3 * 0.035 * (0.4 + side) * rimK;
    const r = Math.hypot(p.x, p.z);
    if (r > 1e-4) {
      p.x += (p.x / r) * sc;
      p.z += (p.z / r) * sc;
    }
    // front notch between the eye stalks
    const front = smooth01((p.z - 0.25) / 0.2) * Math.max(0, 1 - Math.abs(p.x) / 0.14) * smooth01((p.y - 0.62) / 0.1);
    p.y -= front * 0.04;
    p.z -= front * 0.02;
  };
  both(gloss, (g) => {
    g.bone(B_BODY).lathe(body, profile, seg(hi ? 40 : 26), [0, 0, 0], [0, 0, 0], [1.05, 0.96, 0.82]);
    if (hi && g === gloss) g.warp(sculpt);
    if (g === gloss) g.paint(shellPaint);
  });
  if (deco) {
  // rim ridge and top bumps
  gloss.bone(B_BODY).geo(new THREE.TorusGeometry(0.648, 0.022, 4, seg(32)), dark, [0, 0.5, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]);
  for (const [x, z, r] of [[-0.3, -0.12, 0.1], [0.3, -0.12, 0.1], [0, -0.28, 0.085], [-0.16, 0.12, 0.06], [0.16, 0.12, 0.06]] as V3[]) {
    ball(gloss.bone(B_BODY), dark, r, [x, 0.86 - Math.abs(x) * 0.15 + (z < 0 ? 0 : -0.02), z], [1, 0.45, 1], 8);
  }
  // shell ridges: two arcs over the crown, darker
  for (const sx of SIDES) {
    gloss.bone(B_BODY).tube(dark, [[sx * 0.12, 0.88, 0.22], [sx * 0.2, 0.92, 0.0], [sx * 0.16, 0.88, -0.22], [sx * 0.05, 0.82, -0.38]], 0.022, seg(5), tub(8), true);
    // side spines along the rim
    for (let k = 0; k < (hi ? 3 : 2); k++) {
      const a = 0.55 + k * 0.38;
      gloss.bone(B_BODY).cone(dark, 0.03, 0.09, [sx * Math.sin(a) * 0.69, 0.51, Math.cos(a) * 0.57], [Math.PI / 2, 0, -sx * (Math.PI / 2 - 0.15) + 0], seg(6));
    }
  }
  // spots and stars are real little shapes on the shell (vertex paint is too coarse for them)
  if (skin.pattern === 'spots' || skin.pattern === 'stars') {
    const n = hi ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash3(i, 3, 7) * 0.6;
      const y = 0.6 + hash3(i, 5, 1) * 0.28;
      const star = skin.pattern === 'stars';
      const r = star ? 0.022 + hash3(i, 9, 2) * 0.014 : 0.04 + hash3(i, 9, 2) * 0.03;
      const p = onShell(y, a, star ? 0.006 : 0.002);
      ball(gloss.bone(B_BODY), star ? 0xfff6c8 : dark, r, p, star ? [1, 1, 1] : [1, 0.35, 1], 6, [-(y - 0.6) * 2 * Math.cos(a), a, 0]);
    }
  }
  // back plates: grooves following the shell over the back, and a little tail flap underneath
  for (let k = 0; k < (hi ? 3 : 1); k++) {
    const y = 0.8 - k * 0.11;
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(onShell(y - Math.abs(i - 3) * 0.012, Math.PI + (i - 3) * 0.28, 0.006));
    gloss.bone(B_BODY).tube(dark, pts, 0.016, 4, tub(10), true);
  }
  ball(gloss.bone(B_BODY), belly, 0.14, onShell(0.2, Math.PI, 0.02), [1.3, 0.32, 0.7], 10);
  // mouthparts: two small plates under the mouth
  if (hi) for (const sx of SIDES) ball(clay.bone(B_BODY), belly, 0.05, [sx * 0.055, 0.37, onShell(0.38, 0)[2] + 0.004], [1, 0.75, 0.35], 6, [0.3, sx * 0.3, 0]);
  // mouth expressions, each on its own bone (scale 0 hides it). v3: bigger, filled shapes that read at game distance
  const mz = onShell(0.46, 0)[2] + 0.008;
  const grin = new THREE.Shape();
  grin.moveTo(-0.11, 0.0);
  grin.quadraticCurveTo(0, -0.012, 0.11, 0.0);
  grin.quadraticCurveTo(0.09, -0.1, 0, -0.105);
  grin.quadraticCurveTo(-0.09, -0.1, -0.11, 0.0);
  clay.bone(B_MOUTH[0] as number).geo(new THREE.ShapeGeometry(grin, hi ? 6 : 3), 0x4a0f18, [0, 0.49, mz], [-0.12, 0, 0]);
  ball(clay.bone(B_MOUTH[0] as number), 0xff6f8a, 0.05, [0, 0.415, mz + 0.004], [1, 0.45, 0.25], 6);
  clay.bone(B_MOUTH[0] as number).tube(0x3a1010, [[-0.115, 0.495, mz + 0.004], [0, 0.483, mz + 0.012], [0.115, 0.495, mz + 0.004]], 0.01, 4, 6, true);
  clay.bone(B_MOUTH[1] as number).geo(new THREE.TorusGeometry(0.06, 0.022, 4, 12), 0x3a1010, [0, 0.44, mz], [0.15, 0, 0]);
  ball(clay.bone(B_MOUTH[1] as number), 0x5a0f1c, 0.06, [0, 0.44, mz - 0.01], [1, 1.1, 0.3], 8);
  clay.bone(B_MOUTH[2] as number).box(0xffffff, 0.2, 0.06, 0.03, [0, 0.44, mz]);
  clay.bone(B_MOUTH[2] as number).box(0x3a1010, 0.22, 0.014, 0.035, [0, 0.44, mz]);
  for (const tx of [-0.05, 0, 0.05]) clay.bone(B_MOUTH[2] as number).box(0x9a8a8a, 0.006, 0.06, 0.036, [tx, 0.44, mz]);
  clay.bone(B_MOUTH[3] as number).tube(0x3a1010, [[-0.11, 0.44, mz], [-0.055, 0.47, mz + 0.01], [0, 0.44, mz + 0.01], [0.055, 0.41, mz + 0.01], [0.11, 0.44, mz]], 0.018, 4, 10, true);
  // little blush cheeks
  for (const s of SIDES) {
    const c = onShell(0.49, s * 0.42, 0.004);
    ball(clay.bone(B_BODY), 0xff8a8a, 0.06, [c[0], 0.47, c[2]], [1, 0.6, 0.25], 7, [0, s * 0.45, 0]);
  }
  }

  for (let si = 0; si < 2; si++) {
    const s = SIDES[si] as number;
    // eyes: stalk, glossy eyeball with iris ring, pupil and two highlights, eyelid
    both(clay, (g) => g.bone(B_EYE[si] as number).tube(dark, [[s * 0.18, 0.6, 0.27], [s * 0.22, 0.74, 0.3], [s * 0.26, 0.84, 0.33]], (t) => 0.06 - t * 0.015, seg(7), tub(5), 'end'));
    const ex = s * 0.26;
    if (deco) {
      // segmented stalk: two collars
      clay.bone(B_EYE[si] as number).geo(new THREE.TorusGeometry(0.058, 0.014, 4, seg(10)), dark, [s * 0.2, 0.66, 0.28], [Math.PI / 2 - 0.25, 0, 0]);
      clay.bone(B_EYE[si] as number).geo(new THREE.TorusGeometry(0.05, 0.013, 4, seg(10)), dark, [s * 0.24, 0.79, 0.315], [Math.PI / 2 - 0.25, 0, 0]);
    }
    both(gloss, (g) => ball(g.bone(B_EYE[si] as number), 0xfafafa, 0.17, [ex, 0.9, 0.35], [1, 1.05, 1], 14));
    if (deco) {
    ball(gloss.bone(B_EYE[si] as number), skin.iris, 0.105, [ex, 0.9, 0.475], [1, 1.1, 0.45], 10);
    gloss.paint((x, y, z, c) => {
      const r = Math.hypot(x - ex, y - 0.9);
      if (r > 0.08) c.multiplyScalar(0.7);
      else c.lerp(_cb.set(0xffffff), Math.max(0, 0.07 - r) * 2);
    });
    ball(gloss.bone(B_EYE[si] as number), 0x0e0e16, 0.062, [ex, 0.9, 0.508], [1, 1.12, 0.4], 8);
    ball(gloss.bone(B_EYE[si] as number), 0xffffff, 0.034, [ex - s * 0.03 - 0.02, 0.95, 0.53], [1, 1, 0.5], 6);
    ball(gloss.bone(B_EYE[si] as number), 0xffffff, 0.017, [ex + 0.035, 0.865, 0.535], [1, 1, 0.5], 5);
    // eyelid: a hemispherical cap tilted back (open); the lid bone rotates it down over the eye
    const lid = new THREE.SphereGeometry(0.182, seg(12), seg(5), 0, Math.PI * 2, 0, Math.PI / 2);
    gloss.bone(B_LID[si] as number).geo(lid, dark, [ex, 0.9, 0.35], [-0.95, 0, 0], [1, 1.05, 1]);
    gloss.paint((x, y, z, c) => c.lerp(_cb.set(body), 0.5));
    // antenna with a spring at the base
    clay.bone(B_ANT[si] as number).tube(dark, [[s * 0.04, 0.7, 0.47], [s * 0.05, 0.8, 0.54], [s * 0.08, 0.86, 0.57]], (t) => 0.016 - t * 0.006, 4, tub(6), false);
    ball(clay.bone(B_ANT[si] as number), body, 0.024, [s * 0.08, 0.86, 0.57], [1, 1, 1], 5);
    }

    // claws: upper arm, forearm, a rounded palm with a serrated fixed finger and a moving jaw
    both(clay, (g) => g.bone(B_SH[si] as number).tube(dark, [[s * 0.52, 0.55, 0.28], [s * 0.7, 0.6, 0.42], [s * 0.82, 0.62, 0.52]], (t) => 0.075 - t * 0.01, seg(8), tub(5), 'start'));
    both(clay, (g) => g.bone(B_EL[si] as number).tube(dark, [[s * 0.82, 0.62, 0.52], [s * 0.87, 0.65, 0.63], [s * 0.89, 0.67, 0.72]], (t) => 0.068 + t * 0.01, seg(8), tub(4), 'start'));
    const px = s * 0.9;
    both(gloss, (g) => {
      ball(g.bone(B_EL[si] as number), body, 0.17, [px, 0.71, 0.8], [0.92, 0.82, 1.15], 12);
      if (g === gloss) {
        g.paint((x, y, z, c) => c.lerp(_cb.set(dark), smooth01((z - 0.82) / 0.15) * 0.4 + smooth01((0.66 - y) / 0.1) * 0.2));
        // the inner face of the palm is lighter (two-tone claws)
        g.paint((x, y, z, c) => c.lerp(_cb.set(belly), smooth01((s * (px - x) - 0.03) / 0.1) * 0.55));
      }
      g.bone(B_EL[si] as number).tube(body, [[px, 0.77, 0.9], [px + s * 0.01, 0.8, 1.02], [px - s * 0.04, 0.75, 1.12]], (t) => 0.075 * (1 - t) + 0.016, seg(8), tub(6), 'end');
      if (g === gloss) g.paint((x, y, z, c) => c.lerp(_cb.set(dark), smooth01((z - 0.98) / 0.12)));
      g.bone(B_JAW[si] as number).tube(body, [[px, 0.64, 0.9], [px, 0.62, 1.0], [px - s * 0.03, 0.65, 1.08]], (t) => 0.06 * (1 - t) + 0.014, seg(8), tub(6), 'end');
      if (g === gloss) g.paint((x, y, z, c) => c.lerp(_cb.set(dark), smooth01((z - 0.95) / 0.12)));
    });
    if (deco && hi) {
      // knuckle bumps on the palm and a ring at the wrist
      for (const [dy, dz] of [[0.13, 0.78], [0.1, 0.88]] as [number, number][]) ball(gloss.bone(B_EL[si] as number), dark, 0.034, [px + s * 0.04, 0.71 + dy, dz], [1, 0.7, 1], 6);
      gloss.bone(B_EL[si] as number).geo(new THREE.TorusGeometry(0.085, 0.016, 4, seg(12)), dark, [px - s * 0.005, 0.68, 0.66], [0.25, 0, 0]);
    }
    // serrations on the inner edges
    for (let k = 0; k < (deco ? (hi ? 4 : 3) : 0); k++) {
      const z = 0.94 + k * 0.045;
      gloss.bone(B_EL[si] as number).cone(belly, 0.014, 0.035, [px - s * 0.005 * k, 0.74 - k * 0.004, z], [Math.PI, 0, 0], 5);
      gloss.bone(B_JAW[si] as number).cone(belly, 0.012, 0.03, [px - s * 0.005 * k, 0.665, z - 0.01], [0, 0, 0], 5);
    }
  }

  // legs: three segments each (hip, knee, foot), lighter tips
  for (let l = 0; l < 6; l++) {
    const s = l < 3 ? -1 : 1;
    const z = LEG_Z[l % 3] as number;
    const hip: V3 = [s * 0.5, 0.4, z];
    const knee: V3 = [s * 0.86, 0.6, z * 1.25];
    const ankle: V3 = [s * 1.08, 0.24, z * 1.45];
    const tip: V3 = [s * 1.13, 0.01, z * 1.55];
    both(clay, (g) => {
      g.bone(B_HIP(l)).tube(dark, [hip, [s * 0.68, 0.57, z * 1.12], knee], (t) => 0.075 - t * 0.014, seg(7), hi ? 4 : 3, false);
      g.bone(B_KNEE(l)).tube(dark, [knee, [s * 1.0, 0.46, z * 1.36], ankle], (t) => 0.06 - t * 0.016, seg(7), hi ? 4 : 3, false);
      g.bone(B_FOOT(l)).tube(dark, [ankle, tip], (t) => 0.045 - t * 0.033, seg(6), hi ? 3 : 2, 'start');
    });
    // dark glossy tips
    if (!outlineOnly) clay.paint((x, y, zz, c) => c.lerp(_cb.set(0x2a0e08), smooth01((0.14 - y) / 0.12) * 0.75));
    if (deco) {
      if (hi) ball(clay.bone(B_HIP(l)), body, 0.062, [s * 0.52, 0.41, z], [1, 1, 1], 6);
      // a few bristles on the middle segment (High only)
      if (hi) for (let k = 0; k < 2; k++) clay.bone(B_KNEE(l)).cone(dark, 0.008, 0.05, [s * (0.9 + k * 0.07), 0.58 - k * 0.12, z * (1.28 + k * 0.06)], [0, 0, s * 0.9], 3);
    }
    // joints
    ball(clay.bone(B_KNEE(l)), body, 0.068, knee, [1, 1, 1], 7);
    if (deco) ball(clay.bone(B_FOOT(l)), dark, 0.037, ankle, [1, 1, 1], 5);
  }
}
