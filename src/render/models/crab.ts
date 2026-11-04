import * as THREE from 'three';
import { CFG, PALETTE } from '../../config';
import { Spring } from '../anim/spring';
import { GeoBuilder } from '../geo';
import type { Materials } from '../materials';
import { makeOutline } from '../shaders/toy';
import { CLAW_R, clawSamples, hatSpheres } from './clawGuard';
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
/** vertical speed range (m/s) the air pose blends over: twice the hop's take-off speed (4·apex/airtime), so 0.5 - vy/AIR_V runs 0 → 1 from take-off to touchdown */
const AIR_V = (8 * CFG.hop.apex) / CFG.hop.airtime;

// ---- gait (Update 8) ---------------------------------------------------------------------------
// An alternating tetrapod: legs move in three contralateral pairs (L3+R1, L2+R3, L1+R2) a third of a
// cycle apart, each foot on the ground for GAIT_DUTY of the cycle. In stance the hip sweeps the foot
// backwards in a straight line, so the cadence follows ground speed: stance travel (2·LEG_R·sin A)
// over stance time (GAIT_DUTY / f) matches the speed until the cadence cap, past which a faster
// stride would only strobe at 60 fps.
const GAIT_DUTY = 0.6;
/** horizontal reach of a foot tip from its hip pivot (m), see buildCrab */
const LEG_R = 0.64;
/** foot-tip offset in the foot bone's frame (x mirrored per side, z scaled by the leg's LEG_Z) */
const TIP_DY = -0.23;
/** foot tips rest this high in root space (the tip tube's radius) */
const TIP_Y = 0.012;
/** stride amplitude (rad of hip swing) at the start / top speed */
const GAIT_A0 = 0.46;
const GAIT_A1 = 0.56;
/** cadence cap (Hz) = GAIT_CAP0 + GAIT_CAP1 · speed */
const GAIT_CAP0 = 2.1;
const GAIT_CAP1 = 0.1;
/** leg phase offsets (fraction of a cycle) for legs 0..5 (left front, mid, rear, right front, mid, rear) */
const GAIT_OFF = [2 / 3, 1 / 3, 0, 0, 2 / 3, 1 / 3];
const frac = (x: number): number => x - Math.floor(x);
/** idle beat lengths (s), by beat id (see CrabModel.poseBeat) */
const BEAT_DUR = [0, 2.6, 1.3, 0.55, 1.45];
/** Update 9: on the run the shell's yaw stays under this (rad), so a lane change reads as a lean */
const YAW_CAP = 0.2;

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
  private armPhase = 0;
  private time = 0;
  private wasGrounded = true;
  private readonly squash = new Spring(1, { freq: 20, damping: 0.42 });
  // Update 9: a stiffer, better damped lean, so a lane change reads as a quick lean that settles at once
  private readonly lean = new Spring(0, { freq: 18, damping: 0.8 });
  private readonly hatX = new Spring(0, { freq: 11, damping: 0.25 });
  private readonly hatZ = new Spring(0, { freq: 11, damping: 0.25 });
  private readonly antX = [new Spring(0, { freq: 14, damping: 0.18 }), new Spring(0, { freq: 14, damping: 0.18 })];
  private readonly antZ = [new Spring(0, { freq: 14, damping: 0.18 }), new Spring(0, { freq: 14, damping: 0.18 })];
  // Update 8: eye stalks (pitch, roll) and claws (raise, swing) lag behind the body and follow through
  private readonly eyeP = [new Spring(0, { freq: 15, damping: 0.3 }), new Spring(0, { freq: 16.5, damping: 0.3 })];
  private readonly eyeR = [new Spring(0, { freq: 15, damping: 0.3 }), new Spring(0, { freq: 16.5, damping: 0.3 })];
  private readonly clawLagR = [new Spring(0, { freq: 13, damping: 0.35 }), new Spring(0, { freq: 12, damping: 0.35 })];
  private readonly clawLagS = [new Spring(0, { freq: 13, damping: 0.35 }), new Spring(0, { freq: 12, damping: 0.35 })];
  /** Update 9: the shell pitches forward on a stop and rocks back on a start (follow-through) */
  private readonly bodyP = new Spring(0, { freq: 14, damping: 0.35 });
  /** how far the run's yaw cap applies (eases in and out with the run states) */
  private capK = 0;
  /** ground speed as a 0..1 share of the speed range, for the run pose */
  private runK = 0;
  /** seconds since touchdown for the landing bounce, and how big it is */
  private bounceT = 9;
  private bounceA = 0;
  /** Update 9 idle beats between emotes: 0 none, 1 look around, 2 claw snap, 3 double blink, 4 shuffle */
  private beat = 0;
  private beatT = 0;
  private beatCd = 2.5;
  private beatSide = 1;
  /** drive and body values last frame, for the accelerations that kick the springs */
  private prevVx = 0;
  private prevVy = 0;
  private prevSpeed = 0;
  private prevBodyVy = 0;
  private prevRz = 0;
  private prevRzV = 0;
  private prevRx = 0;
  private prevRxV = 0;
  /** false for the frame after a reset: the pose may have jumped, so it only records */
  private kickArmed = false;
  /** seconds since the hop event (take-off squash), and since a lane reversal (skid) */
  private hopT = 9;
  private reverseT = 9;
  /** gait: stride amplitude this frame, and how much of each leg's hip raise is a step lift (not planted) */
  private gaitA = GAIT_A0;
  private gaitIn = 0;
  private readonly liftRaise = new Float32Array(6);
  /** lane-change overlay this frame, and what an interrupted one still holds as it fades */
  private readonly laneOff: Pose = new Float32Array(P_N);
  private readonly laneLift = new Float32Array(6);
  private readonly laneCarry: Pose = new Float32Array(P_N);
  private readonly laneCarryLift = new Float32Array(6);
  private carryT = 9;
  /** foot planting weight (0..1): run state on the ground */
  private plantK = 0;
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
  // claw guard (clawGuard.ts): claw samples per side [elbow, jaw], hat spheres, obstacles this frame
  private clawPts: Float32Array[][] = [[], []];
  private hatSph: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private obst = new Float32Array(0);
  private obstN = 0;
  /** per side and bone [elbow, jaw]: bounding sphere of the samples in the bone frame (x, y, z, r) */
  private clawBound: Float32Array[] = [new Float32Array(8), new Float32Array(8)];
  /** obstacle indices near the claw this evaluation (broad phase) */
  private near = new Int32Array(0);
  private readonly guardC = [new Float32Array(3), new Float32Array(3)];
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
    for (let s = 0; s < 2; s++) {
      const pts = clawSamples([this.clayMesh.geometry, this.glossMesh.geometry], [B_EL[s] as number, B_JAW[s] as number], absRest, 16);
      this.clawPts[s] = pts;
      const bd = this.clawBound[s] as Float32Array;
      pts.forEach((p, b) => {
        let cx = 0;
        let cy = 0;
        let cz = 0;
        const n = Math.max(1, p.length / 3);
        for (let i = 0; i < p.length; i += 3) {
          cx += p[i]!;
          cy += p[i + 1]!;
          cz += p[i + 2]!;
        }
        cx /= n;
        cy /= n;
        cz /= n;
        let r = 0;
        for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i]! - cx, p[i + 1]! - cy, p[i + 2]! - cz));
        bd.set([cx, cy, cz, r + CLAW_R], b * 4);
      });
    }
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
    this.hatSph = hatSpheres(h.geo, h.spinner);
    this.obst = new Float32Array(this.hatSph.length + 16);
    this.near = new Int32Array(this.obst.length / 4);
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
    // a quick crouch-and-spring (impulses, not snaps, so feet never teleport); the air pose takes the
    // squash from here through the stretch, the tuck and the reach (see poseAir)
    this.hopT = 0;
    // Update 9: a harder crouch (the spring then pops it into the stretch); the heavy claws drop a beat
    // behind the push and swing up into the tuck
    this.squash.velocity = Math.min(this.squash.velocity, 0) - 8;
    this.hatX.impulse(-3);
    for (const s of this.antX) s.impulse(-7);
    for (const s of this.clawLagR) s.impulse(-2.2);
  }
  land(hard: boolean): void {
    this.landT = 0;
    this.landHard = hard;
    // the squash spring is underdamped: the landing squash rebounds into a little bounce; a soft
    // landing squashes as hard as the fall was fast (prevVy: the drive's vy before touchdown)
    const fall = clamp(-this.prevVy / (AIR_V * 0.5), 0, 1.2);
    this.squash.velocity = Math.min(0, this.squash.velocity) * 0.5 + (hard ? -16 : -2 - 4 * fall);
    this.hatX.impulse(hard ? 5 : 3);
    for (const s of this.antX) s.impulse(hard ? 9 : 5);
    // Update 9: after the squash, a little bounce off the sand (bigger for a bigger fall)
    this.bounceT = 0;
    this.bounceA = hard ? 0.02 : 0.025 + 0.025 * Math.min(1, fall);
    if (this.state === 'slam') this.setState('run');
  }
  lane(dir: number): void {
    // reversing mid-glide: a quick counter-lean and a skid on the legs that were leading
    const reverse = this.laneT < 0.24 && dir !== 0 && dir === -this.laneDir;
    if (reverse) {
      this.reverseT = 0;
      this.lean.velocity += dir * 4;
      this.squash.velocity -= 3;
      this.hatZ.impulse(dir * 5);
      for (const s of this.antZ) s.impulse(dir * 9);
    } else {
      // Update 8: lean into the turn at once (the drive's lateral speed then carries the lean)
      this.lean.velocity += dir * 2.5;
      this.hatZ.impulse(dir * 3);
      for (const s of this.antZ) s.impulse(dir * 7);
    }
    // whatever the last lane change still holds fades out from here
    const cf = this.carryT < 0.14 ? 1 - smooth01(this.carryT / 0.14) : 0;
    for (let i = 0; i < P_N; i++) this.laneCarry[i] = (this.laneOff[i] as number) + (this.laneCarry[i] as number) * cf;
    for (let l = 0; l < 6; l++) this.laneCarryLift[l] = (this.laneLift[l] as number) + (this.laneCarryLift[l] as number) * cf;
    this.carryT = 0;
    this.laneT = 0;
    this.laneSettled = false;
    this.laneDir = dir;
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
      // forward (away from the chase camera) and up, never at the lens; the hat flies in the root's
      // frame, so its world -z is local +z while the crab faces down the beach
      const away = Math.cos(this.root.rotation.y) < 0 ? -1 : 1;
      this.hatVel.set((Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4), 4.6, -2.4 * away);
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
    this.hopT = 9;
    this.reverseT = 9;
    this.bounceT = 9;
    this.plantK = 0;
    this.capK = 0;
    this.beat = 0;
    this.beatCd = 1.2 + Math.random() * 2;
    this.bodyP.snap(0);
    this.laneT = 9;
    this.carryT = 9;
    this.laneOff.fill(0);
    this.laneLift.fill(0);
    for (let s = 0; s < 2; s++) {
      (this.eyeP[s] as Spring).snap(0);
      (this.eyeR[s] as Spring).snap(0);
      (this.clawLagR[s] as Spring).snap(0);
      (this.clawLagS[s] as Spring).snap(0);
    }
    this.prevVx = 0;
    this.prevVy = 0;
    this.prevSpeed = 0;
    this.prevBodyVy = 0;
    this.prevRzV = 0;
    this.prevRxV = 0;
    this.kickArmed = false;
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
    this.hopT += dt;
    this.reverseT += dt;
    this.bounceT += dt;

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
        // touching down eases back into the gait (the landing overlay carries the impact)
        const fromAir = this.state === 'hopRise' || this.state === 'hopFall';
        if (want !== this.state) this.setState(want, want === 'hopFall' ? 0.18 : want === 'run' && fromAir ? 0.17 : 0.1);
      } else {
        if (this.state === 'run' || this.state === 'hopRise' || this.state === 'hopFall' || this.state === 'ride' || this.state === 'slam') this.setState('idle', 0.25);
        if ((this.state === 'emote' && this.stateT > 2.2) || (this.state === 'celebrate' && this.stateT > 2.6)) this.setState('idle', 0.3);
        if (this.state === 'idle') {
          this.emoteCd -= dt;
          if (this.emoteCd <= 0) {
            this.emoteCd = 7 + Math.random() * 5;
            this.beat = 0;
            this.emote();
          } else this.tickBeat(dt);
        }
      }
    }
    if (this.state !== 'idle') this.beat = 0;
    if (!d.grounded && this.wasGrounded && this.state !== 'crash') {
      // left the ground without a hop event (thumbnails, ride): no-op
    }
    this.wasGrounded = d.grounded;

    // gait phase (radians): the cadence follows ground speed (see GAIT_DUTY), a little quicker
    // through a lane change while the legs scramble sideways
    const v = d.running ? Math.max(0, d.speed) : 0;
    const vk = clamp((v - 11) / 17, 0, 1);
    this.runK = vk;
    // the stride opens up over the first steps of a run (a standing start, not a snap to full stride)
    this.gaitIn = d.running ? Math.min(1, this.gaitIn + dt / 0.3) : 0;
    this.gaitA = (GAIT_A0 + (GAIT_A1 - GAIT_A0) * vk) * (0.55 + 0.45 * smooth01(this.gaitIn));
    const stride = 2 * LEG_R * Math.sin(this.gaitA);
    const hz = Math.min((GAIT_DUTY * v) / stride, GAIT_CAP0 + GAIT_CAP1 * v);
    const laneBoost = this.laneT < 0.25 ? 1 - this.laneT / 0.25 : 0;
    const rate = d.running ? Math.PI * 2 * hz * (1 + 0.15 * laneBoost) : 3.2;
    this.phase += dt * rate;
    // the claws sway at half the step rate (a sway at the full cadence reads as jitter)
    this.armPhase += dt * (d.running ? Math.PI * hz : 3.2);

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

  /**
   * Update 9 idle beats: every few seconds between the emotes the idle crab does something small (a
   * look around, a claw snap, a double blink or a foot shuffle). Never right before an emote, and no
   * look around while the eyes follow the cursor.
   */
  private tickBeat(dt: number): void {
    if (this.beat) {
      this.beatT += dt;
      if (this.beatT >= (BEAT_DUR[this.beat] as number)) {
        this.beat = 0;
        this.beatCd = 1.6 + Math.random() * 2.6;
      }
      return;
    }
    this.beatCd -= dt;
    if (this.beatCd > 0 || this.emoteCd < 2.8) return;
    const r = Math.random();
    this.beat = r < 0.38 && this.lookHold <= 0 ? 1 : r < 0.66 ? 2 : r < 0.82 ? 3 : 4;
    this.beatT = 0;
    this.beatSide = Math.random() < 0.5 ? -1 : 1;
  }

  /** the current idle beat on top of the idle pose */
  private poseBeat(p: Pose): void {
    const t = this.beatT;
    const sd = this.beatSide;
    switch (this.beat) {
      case 1: {
        // look around: the eyes dart to one side and the shell turns after them, then the other side,
        // then home; the feet hold their ground and the head tilts, curious
        const eyes = smooth01(t / 0.08) - 2 * smooth01((t - 0.95) / 0.09) + smooth01((t - 1.95) / 0.09);
        const yaw = 0.3 * (smooth01((t - 0.1) / 0.42) - 2 * smooth01((t - 1.02) / 0.5) + smooth01((t - 2.02) / 0.5));
        p[P_BODY_RY] = (p[P_BODY_RY] as number) + sd * yaw;
        p[P_BODY_RZ] = (p[P_BODY_RZ] as number) - sd * yaw * 0.18;
        for (let l = 0; l < 6; l++) p[P_LEG + l * 4] = (p[P_LEG + l * 4] as number) - sd * yaw * (l < 3 ? -1 : 1) * 0.6;
        if (this.lookHold <= 0) {
          p[P_LOOK_X] = sd * eyes * 0.8;
          p[P_LOOK_Y] = 0.08 * Math.abs(eyes);
        }
        break;
      }
      case 2: {
        // claw snap: one claw comes up in front of the chest and clacks shut twice, eyes on it
        const i = P_CLAW + (sd < 0 ? 0 : 4);
        const up = smooth01(t / 0.24) * (1 - smooth01((t - 0.95) / 0.3));
        const shut = Math.max(arc((t - 0.34) / 0.13), arc((t - 0.56) / 0.13));
        p[i] = (p[i] as number) + 0.42 * up;
        p[i + 1] = (p[i + 1] as number) + sd * 0.12 * up;
        p[i + 2] = (p[i + 2] as number) + 0.3 * up;
        p[i + 3] = 0.1 + 0.75 * up * (1 - shut);
        p[P_BODY_RZ] = (p[P_BODY_RZ] as number) + sd * 0.04 * up;
        p[P_BODY_Y] = (p[P_BODY_Y] as number) - 0.012 * shut;
        if (this.lookHold <= 0) {
          p[P_LOOK_X] = sd * 0.55 * up;
          p[P_LOOK_Y] = -0.2 * up;
        }
        break;
      }
      case 3:
        // a happy double blink with a little bob
        p[P_LID] = Math.max(p[P_LID] as number, arc(t / 0.14), arc((t - 0.22) / 0.14));
        p[P_BODY_Y] = (p[P_BODY_Y] as number) + 0.018 * arc(t / 0.45);
        break;
      case 4: {
        // shuffle: a weight shift while the feet tap in a ripple down each side, twice
        const k = smooth01(t / 0.2) * (1 - smooth01((t - 1.1) / 0.3));
        p[P_BODY_RZ] = (p[P_BODY_RZ] as number) + Math.sin(t * 8) * 0.05 * k;
        p[P_BODY_Y] = (p[P_BODY_Y] as number) - 0.012 * k;
        for (let l = 0; l < 6; l++) {
          const o = 0.12 + (l % 3) * 0.08 + (l < 3 ? 0 : 0.26);
          const tap = (arc((t - o) / 0.2) + arc((t - o - 0.55) / 0.2)) * k;
          p[P_LEG + l * 4 + 1] = (p[P_LEG + l * 4 + 1] as number) + 0.24 * tap;
          p[P_LEG + l * 4 + 2] = (p[P_LEG + l * 4 + 2] as number) - 0.16 * tap;
        }
        break;
      }
    }
  }

  /** Fill `p` with the pose of state `s`. */
  private poseFor(s: CrabState, p: Pose, d: CrabDrive): void {
    p.fill(0);
    this.liftRaise.fill(0);
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
        // Update 7: a slow weight shift from side to side, the legs on the loaded side bending a
        // little, and a breath that lifts the claws with the body
        const shift = Math.sin(this.time * 0.9);
        const breath = Math.sin(this.time * 2.1);
        for (let l = 0; l < 6; l++) {
          const load = (l < 3 ? -1 : 1) * shift;
          p[P_LEG + l * 4 + 1] = 0.12 - load * 0.06;
          p[P_LEG + l * 4 + 2] = 0.05 + load * 0.05;
        }
        for (let s2 = 0; s2 < 2; s2++) p[P_CLAW + s2 * 4 + 2] = 0.06 + breath * 0.04;
        this.idleLook(p);
        if (this.beat) this.poseBeat(p);
        break;
      }
      case 'run': {
        // Update 8: an alternating tetrapod (GAIT_OFF). In stance the foot sweeps straight back
        // (asin keeps the foot's travel linear in time, so it moves with the sand); in swing it lifts
        // (sin^1.5: no snap off or onto the ground) and swings forward, the foot flicking a beat
        // after the knee. The lift is kept apart (liftRaise) so foot planting leaves it alone.
        const A = this.gaitA;
        const sinA = Math.sin(A);
        const cyc = ph / (Math.PI * 2);
        for (let l = 0; l < 6; l++) {
          const c = frac(cyc + (GAIT_OFF[l] as number));
          let swing: number;
          let lift = 0;
          let flick = 0;
          let load = 0;
          let press = 0;
          if (c < GAIT_DUTY) {
            const q = 1 - (2 * c) / GAIT_DUTY;
            swing = -Math.asin(q * sinA);
            // Update 9 planting: the knee gives as the foot takes the weight, and the toe presses
            // into the push-off at the end of the stance (plantFeet keeps the tip on the sand)
            const st = c / GAIT_DUTY;
            load = arc(st / 0.5);
            press = smooth01((st - 0.55) / 0.45);
          } else {
            const s2 = (c - GAIT_DUTY) / (1 - GAIT_DUTY);
            // a near-even swing forward (eased only a little): the return is twice the stance speed
            swing = A * (1 - 2 * (0.8 * s2 + 0.2 * smooth01(s2)));
            const sn = Math.sin(Math.PI * s2);
            lift = sn * Math.sqrt(sn);
            const fl = Math.max(0, Math.sin(Math.PI * clamp((s2 - 0.15) / 0.85, 0, 1)));
            flick = fl * fl;
            // the push-off lets go as the foot leaves the sand
            press = 1 - smooth01(s2 / 0.3);
          }
          p[P_LEG + l * 4] = swing;
          p[P_LEG + l * 4 + 1] = 0.06 + lift * 0.28;
          p[P_LEG + l * 4 + 2] = 0.05 - lift * 0.36 + load * 0.1;
          p[P_LEG + l * 4 + 3] = flick * 0.3 - press * 0.14;
          this.liftRaise[l] = lift * 0.28;
        }
        // a small bob as each pair lifts (three a cycle), lowest just after each pair plants; a
        // slower waddle and yaw once a cycle; the planted feet stay put (plantFeet), so only the shell
        // rides it. Update 9: a little more bob, and the shell leans into the run as it speeds up
        const vk = this.runK;
        const bob = 0.5 - 0.5 * Math.cos(ph * 3 - 0.5);
        p[P_BODY_Y] = bob * 0.02;
        p[P_BODY_RZ] = Math.sin(ph - 0.4) * 0.035;
        p[P_BODY_RY] = Math.sin(ph) * 0.03;
        p[P_BODY_RX] = 0.06 + vk * 0.035 + Math.sin(ph * 3 - 1.1) * 0.012;
        // Update 9 claws: each sways in a small loop (raise and swing a quarter cycle apart), the
        // forearm a beat behind the shoulder, carried a little higher and tighter at speed
        const ap = this.armPhase;
        for (let s2 = 0; s2 < 2; s2++) {
          const sg = s2 === 0 ? 1 : -1;
          const sw = ap + s2 * Math.PI;
          p[P_CLAW + s2 * 4] = 0.22 + vk * 0.08 + Math.sin(sw) * 0.085;
          p[P_CLAW + s2 * 4 + 1] = (Math.cos(sw) * 0.12 + 0.04 * vk) * sg;
          p[P_CLAW + s2 * 4 + 2] = 0.12 + vk * 0.06 + Math.sin(sw - 0.8) * 0.06;
          p[P_CLAW + s2 * 4 + 3] = 0.1 + Math.max(0, Math.sin(ap * 0.5 + s2 * 2)) * 0.22;
        }
        p[P_LOOK_Y] = -0.1;
        break;
      }
      case 'hopRise':
      case 'hopFall':
        this.poseAir(p, d);
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

  /**
   * Update 8: the air pose, one continuous pass driven by vertical speed (u: 0 at take-off, 0.5 at
   * the apex, 1 at touchdown speed) through three keys: push-off and stretch (legs extended down and
   * back, nose up), the tuck at the apex (legs drawn in, claws up) and the reach for the ground (legs
   * extended a little forward, claws out for balance, eyes on the sand).
   */
  private poseAir(p: Pose, d: CrabDrive): void {
    const u = clamp(0.5 - d.vy / AIR_V, 0, 1);
    this.airA1 = smooth01((u - 0.06) / 0.36);
    this.airA2 = smooth01((u - 0.6) / 0.3);
    const key = this.airKey;
    for (let l = 0; l < 6; l++) {
      const k = l % 3;
      const i = P_LEG + l * 4;
      p[i] = key(0.22, k === 0 ? 0.25 : k === 2 ? -0.25 : 0, k === 0 ? -0.22 : k === 2 ? 0.12 : -0.05);
      p[i + 1] = key(-0.04, 0.85, 0.02);
      p[i + 2] = key(0.25, -1.0, 0.18);
      p[i + 3] = key(0.4, 0.55, -0.05);
    }
    for (let s2 = 0; s2 < 2; s2++) {
      const out = s2 === 0 ? -1 : 1;
      const i = P_CLAW + s2 * 4;
      p[i] = key(0.05, 1.0, 0.42);
      p[i + 1] = out * key(0, 0.12, 0.4);
      p[i + 2] = key(0.05, 0.55, 0.15);
      p[i + 3] = key(0.15, 0.55, 0.35);
    }
    // Update 9: nose up on the push, a little forward roll into the tuck, nose down for the reach;
    // a happy squint at the top
    p[P_BODY_RX] = key(-0.14, 0.05, 0.12);
    p[P_LOOK_Y] = key(0.25, 0.12, -0.45);
    p[P_LID] = 0.28 * this.airA1 * (1 - this.airA2);
    this.mouth = 1;
  }

  private airA1 = 0;
  private airA2 = 0;
  /** blend the three air keys at this frame's weights (a bound method: no closure per frame) */
  private readonly airKey = (k0: number, k1: number, k2: number): number => {
    const m = k0 + (k1 - k0) * this.airA1;
    return m + (k2 - m) * this.airA2;
  };

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
    // Update 9: the lean is a roll into the move with only a hint of yaw (a big yaw turned the face
    // and the hat brim side-on to the run camera); YAW_CAP below bounds whatever else adds up
    o[P_BODY_RZ] = (o[P_BODY_RZ] as number) - lean * 0.36;
    o[P_BODY_RY] = (o[P_BODY_RY] as number) + lean * 0.07;
    // lane change, written as offsets (laneOff, laneLift) so a new lane change mid-move can fade the
    // old one out (laneCarry) instead of cutting it
    const lo = this.laneOff;
    const ll = this.laneLift;
    lo.fill(0);
    ll.fill(0);
    if (this.laneT < 0.32) {
      // lane change: the lead claw reaches into the move, the other tucks, the eyes lead
      const k = smooth01(this.laneT / 0.1) * (1 - smooth01((this.laneT - 0.13) / 0.2));
      const lead = this.laneDir < 0 ? 0 : 1;
      const trail = 1 - lead;
      lo[P_CLAW + lead * 4] = 0.55 * k;
      lo[P_CLAW + lead * 4 + 1] = (lead === 0 ? -1 : 1) * 0.45 * k;
      lo[P_CLAW + lead * 4 + 3] = 0.4 * k;
      lo[P_CLAW + trail * 4] = -0.15 * k;
      lo[P_BODY_Y] = 0.04 * k;
      lo[P_BODY_RX] = -0.08 * k;
      lo[P_LOOK_X] = this.laneDir * 0.3 * k;
      // Update 8 legs: the leading legs lift and reach into the move, then plant; the trailing legs
      // stay planted and straighten (the push-off), flick their toes, then lift and gather in
      const t = this.laneT;
      const reach = smooth01(t / 0.05) * (1 - smooth01((t - 0.1) / 0.09));
      const push = smooth01(t / 0.06) * (1 - smooth01((t - 0.09) / 0.07));
      const gather = arc((t - 0.12) / 0.18);
      for (let l = 0; l < 6; l++) {
        const i = P_LEG + l * 4;
        if ((l < 3 ? -1 : 1) === this.laneDir) {
          lo[i] = (l % 3 === 0 ? -0.15 : l % 3 === 2 ? 0.15 : 0) * reach;
          lo[i + 1] = 0.34 * reach;
          lo[i + 2] = -0.2 * reach;
          ll[l] = 0.34 * reach;
        } else {
          lo[i + 2] = 0.35 * push - 0.3 * gather;
          lo[i + 3] = 0.45 * push;
          lo[i + 1] = 0.28 * gather;
          ll[l] = 0.28 * gather;
        }
      }
    }
    this.carryT += dt;
    const cf = this.carryT < 0.14 ? 1 - smooth01(this.carryT / 0.14) : 0;
    for (let i = 0; i < P_N; i++) o[i] = (o[i] as number) + (lo[i] as number) + (this.laneCarry[i] as number) * cf;
    for (let l = 0; l < 6; l++) this.liftRaise[l] = (this.liftRaise[l] as number) + (ll[l] as number) + (this.laneCarryLift[l] as number) * cf;
    if (!this.laneSettled && this.laneT > 0.18) {
      // arrival: a little squash as the leading legs take the weight, and the hat sways on
      this.laneSettled = true;
      this.squash.velocity -= 3.5;
      this.hatZ.impulse(-this.laneDir * 2);
    }
    if (this.reverseT < 0.24) {
      // reversal: the legs that were leading (now trailing) brace and dig in, the shell yaws into the
      // new direction and dips (the lean spring does the counter-lean)
      const k = smooth01(this.reverseT / 0.07) * (1 - smooth01((this.reverseT - 0.08) / 0.16));
      for (let l = 0; l < 6; l++) {
        if ((l < 3 ? -1 : 1) !== -this.laneDir) continue;
        const i = P_LEG + l * 4;
        o[i + 2] = (o[i + 2] as number) + 0.25 * k;
        o[i + 3] = (o[i + 3] as number) - 0.35 * k;
      }
      o[P_BODY_RY] = (o[P_BODY_RY] as number) + this.laneDir * 0.06 * k;
      o[P_BODY_Y] = (o[P_BODY_Y] as number) - 0.03 * k;
      if (k > 0.3) this.mouth = 2;
    }
    // landing: the shell gives at the knees (the feet stay planted, see plantFeet)
    if (this.landT < (this.landHard ? 0.4 : 0.3)) {
      // Update 7: eased in and out (no linear ramp), and even a soft landing gives with the knees:
      // the body dips a little and rises with the legs
      const dur = this.landHard ? 0.4 : 0.3;
      const k = smooth01(this.landT / 0.06) * (1 - smooth01(this.landT / dur)) * (this.landHard ? 1.4 : 1);
      for (let l = 0; l < 6; l++) {
        o[P_LEG + l * 4 + 1] = (o[P_LEG + l * 4 + 1] as number) - 0.35 * k * (1 - this.plantK);
        o[P_LEG + l * 4 + 2] = (o[P_LEG + l * 4 + 2] as number) + 0.3 * k;
      }
      if (!this.landHard) o[P_BODY_Y] = (o[P_BODY_Y] as number) - 0.05 * k;
      this.mouth = this.landHard ? 2 : this.mouth;
      // Sand Slam: a superhero landing, body punched low and claws flung wide
      if (this.landHard) {
        o[P_BODY_Y] = (o[P_BODY_Y] as number) - 0.14 * k;
        for (let s2 = 0; s2 < 2; s2++) o[P_CLAW + s2 * 4 + 1] = (o[P_CLAW + s2 * 4 + 1] as number) + (s2 === 0 ? 1 : -1) * 0.5 * k;
      }
    }
    // Update 9: the landing bounce: once the squash has given, the shell pops up a touch off the sand
    // (feet and all) and settles, the stalks and claws following through
    if (this.bounceT < 0.36 && this.state !== 'crash') {
      const b = arc((this.bounceT - 0.07) / 0.26);
      o[P_LIFT] = (o[P_LIFT] as number) + this.bounceA * b;
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
      // Update 9: now and then a quick double blink
      this.blinkT = Math.random() < 0.2 ? 0.24 : 2 + Math.random() * 3;
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
      // Update 9: on the run the flinch is mostly a roll away (a yaw shows the face to the camera)
      const run = d.running ? 1 : 0;
      o[P_BODY_RY] = (o[P_BODY_RY] as number) - this.flinchDir * (0.3 - 0.2 * run) * k;
      o[P_BODY_RZ] = (o[P_BODY_RZ] as number) + this.flinchDir * (0.12 + 0.04 * run) * k;
      o[P_LOOK_X] = (o[P_LOOK_X] as number) + this.flinchDir * (0.7 - 0.3 * run) * k;
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
    // squash spring (Update 8): a squash on the take-off, a stretch on the rise, a slight
    // compression in the apex tuck and a lengthening reach on the fall; landing kicks it (land())
    if (this.airborne && this.state !== 'slam') {
      const u = clamp(0.5 - d.vy / AIR_V, 0, 1);
      const takeoff = this.hopT < 0.06 ? 1 - smooth01(this.hopT / 0.06) : 0;
      this.squash.target = 1 - 0.18 * takeoff + 0.17 * (1 - smooth01(u / 0.42)) * (1 - takeoff) - 0.045 * arc((u - 0.3) / 0.4) + 0.04 * smooth01((u - 0.65) / 0.3);
    } else this.squash.target = 1;
    this.squash.update(dt);
    // foot planting follows the gait on the ground, and lets go in the air
    const plantTo = this.state === 'run' && d.grounded && d.running ? 1 : 0;
    this.plantK += (plantTo - this.plantK) * (1 - Math.exp(-dt * (plantTo > this.plantK ? 12 : 40)));
    // lift amounts only count as far as the run pose has faded in
    if (this.state === 'run') {
      const w = this.blendDur > 0 ? smooth01(this.blendT / this.blendDur) : 1;
      if (w < 1) for (let l = 0; l < 6; l++) this.liftRaise[l] = (this.liftRaise[l] as number) * w;
    }
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
    // Update 9 yaw cap: while running, the shell's yaw (lean, waddle, skid, flinch) is softly bounded
    // and so is the eyes' turn, so from the run camera a lane change reads as a lean, never a turn
    const runLike = d.running && (this.state === 'run' || this.state === 'hopRise' || this.state === 'hopFall' || this.state === 'slam' || this.state === 'ride');
    this.capK += ((runLike ? 1 : 0) - this.capK) * Math.min(1, dt * 8);
    if (this.capK > 1e-3) {
      const ry = o[P_BODY_RY] as number;
      o[P_BODY_RY] = ry + (YAW_CAP * Math.tanh(ry / YAW_CAP) - ry) * this.capK;
      const lx = o[P_LOOK_X] as number;
      o[P_LOOK_X] = lx + (0.4 * Math.tanh(lx / 0.4) - lx) * this.capK;
    }
    this.followThrough(dt, d, vy);
  }

  /**
   * Update 8: eye stalks and claws spring-lag behind the body. They are kicked by changes in the
   * drive (take-off and touchdown in vy, lane glides in vx, stops in speed) and by the shell's own
   * bob, roll and pitch, so they follow through on hops, lane changes and stops with no wiring.
   */
  private followThrough(dt: number, d: CrabDrive, bodyVy: number): void {
    const o = this.out;
    const inv = 1 / Math.max(dt, 1e-4);
    const sp = d.running ? d.speed : 0;
    const dvx = clamp(d.vx - this.prevVx, -30, 30);
    const dvy = clamp(d.vy - this.prevVy, -25, 25);
    const dsp = clamp(sp - this.prevSpeed, -30, 30);
    this.prevVx = d.vx;
    this.prevVy = d.vy;
    this.prevSpeed = sp;
    // the shell's angular speeds; their changes swing the stalks the other way
    const rz = o[P_BODY_RZ] as number;
    const rx = o[P_BODY_RX] as number;
    const rzV = (rz - this.prevRz) * inv;
    const rxV = (rx - this.prevRx) * inv;
    const dRzV = clamp(rzV - this.prevRzV, -20, 20);
    const dRxV = clamp(rxV - this.prevRxV, -20, 20);
    const dBy = clamp(bodyVy - this.prevBodyVy, -8, 8);
    this.prevRz = rz;
    this.prevRx = rx;
    this.prevRzV = rzV;
    this.prevRxV = rxV;
    this.prevBodyVy = bodyVy;
    const crashed = this.state === 'crash';
    const kick = this.kickArmed ? 1 : 0;
    this.kickArmed = true;
    for (let s = 0; s < 2; s++) {
      const ep = this.eyeP[s] as Spring;
      const er = this.eyeR[s] as Spring;
      // pushed up (take-off, touchdown, the bob) the stalks nod; a stop throws them forward; a
      // glide sideways leaves them behind; a rolling shell whips them
      ep.impulse((0.22 * dvy + 0.9 * dBy - 0.18 * dsp - 0.5 * dRxV) * kick);
      er.impulse((0.16 * dvx - 0.55 * dRzV) * kick);
      ep.update(dt);
      er.update(dt);
      if (crashed) {
        ep.snap(0);
        er.snap(0);
      }
      ep.value = clamp(ep.value, -0.3, 0.45);
      er.value = clamp(er.value, -0.35, 0.35);
      // claws: heavy pincers sag on a push up and swing out behind a glide
      const cr = this.clawLagR[s] as Spring;
      const cs = this.clawLagS[s] as Spring;
      cr.impulse((-0.22 * dvy - 2.4 * dBy) * kick);
      cs.impulse((-0.08 * dvx - 0.5 * dRzV) * kick);
      cr.update(dt);
      cs.update(dt);
      cr.value = clamp(cr.value, -0.35, 0.35);
      cs.value = clamp(cs.value, -0.3, 0.3);
      if (d.running && !crashed) {
        o[P_CLAW + s * 4] = (o[P_CLAW + s * 4] as number) + cr.value;
        o[P_CLAW + s * 4 + 1] = (o[P_CLAW + s * 4 + 1] as number) + cs.value;
      }
    }
    // Update 9: a stop tips the shell forward on its legs and it rocks back; a start rocks it back
    const bp = this.bodyP;
    bp.impulse(-0.06 * dsp * kick);
    bp.update(dt);
    if (crashed) bp.snap(0);
    bp.value = clamp(bp.value, -0.16, 0.16);
    o[P_BODY_RX] = (o[P_BODY_RX] as number) + bp.value;
  }

  /**
   * Update 8 foot planting: on the ground, each leg's hip raise is corrected so its foot tip (less
   * any step lift) sits on the sand whatever the shell does above it: the bob, the lean into a lane
   * change (the trailing legs extend to push off), the landing dip. One secant step on the raise.
   */
  private plantFeet(): void {
    const o = this.out;
    const body = this.bones[B_BODY] as THREE.Bone;
    body.updateMatrix();
    for (let l = 0; l < 6; l++) {
      const sg = l < 3 ? -1 : 1;
      const z = LEG_Z[l % 3] as number;
      const hip = this.bones[B_HIP(l)] as THREE.Bone;
      const knee = this.bones[B_KNEE(l)] as THREE.Bone;
      const foot = this.bones[B_FOOT(l)] as THREE.Bone;
      knee.updateMatrix();
      foot.updateMatrix();
      // the tip in the hip's frame (independent of the hip's rotation)
      _pv.set(sg * 0.05, TIP_DY, z * 0.1).applyMatrix4(foot.matrix).applyMatrix4(knee.matrix);
      _ph.copy(_pv);
      const swing = (o[P_LEG + l * 4] as number) * sg;
      const raise = o[P_LEG + l * 4 + 1] as number;
      const base = raise - (this.liftRaise[l] as number);
      const y0 = this.tipY(hip, swing, sg, base);
      const y1 = this.tipY(hip, swing, sg, base + 0.08);
      const slope = (y1 - y0) / 0.08;
      let c = 0;
      if (slope > 0.05) c = clamp((TIP_Y - y0) / slope, -0.75, 0.9);
      hip.rotation.set(0, swing, sg * (raise + c * this.plantK) * 0.9);
    }
  }

  /** root-space height of a foot tip (in _ph, hip frame) with the hip at raise r */
  private tipY(hip: THREE.Bone, swing: number, sg: number, r: number): number {
    hip.rotation.set(0, swing, sg * r * 0.9);
    hip.updateMatrix();
    _pv.copy(_ph).applyMatrix4(hip.matrix).applyMatrix4((this.bones[B_BODY] as THREE.Bone).matrix);
    return _pv.y;
  }

  /** write the final pose into the bones */
  private setClaw(s: number, raise: number, swing: number, elbow: number, jaw: number): void {
    const sg = s === 0 ? -1 : 1;
    (this.bones[B_SH[s] as number] as THREE.Bone).rotation.set(-raise * 0.55, swing, sg * raise * 0.6);
    (this.bones[B_EL[s] as number] as THREE.Bone).rotation.set(-elbow * 0.6, -sg * elbow * 0.5, 0);
    (this.bones[B_JAW[s] as number] as THREE.Bone).rotation.set(clamp(jaw, 0, 1) * 0.75, 0, 0);
  }

  /** eyeballs, eye stalks and hat spheres in the body frame for this frame (x, y, z, r) */
  private gatherObstacles(): void {
    const ob = this.obst;
    let n = 0;
    for (let s = 0; s < 2; s++) {
      const sg = s === 0 ? -1 : 1;
      const e = this.bones[B_EYE[s] as number] as THREE.Bone;
      e.updateMatrix();
      for (const [x, y, z, r] of EYE_SPHERES) {
        _gv.set(x * sg, y, z).applyMatrix4(e.matrix);
        ob[n++] = _gv.x;
        ob[n++] = _gv.y;
        ob[n++] = _gv.z;
        ob[n++] = r;
      }
    }
    if (this.hatMesh.visible && !this.hatFlying && this.hatSph.length) {
      const hb = this.bones[B_HAT] as THREE.Bone;
      hb.updateMatrix();
      this.hatMesh.updateMatrix();
      _gm.multiplyMatrices(hb.matrix, this.hatMesh.matrix);
      const hs = this.hatSph;
      for (let i = 0; i < hs.length; i += 4) {
        _gv.set(hs[i] as number, hs[i + 1] as number, hs[i + 2] as number).applyMatrix4(_gm);
        ob[n++] = _gv.x;
        ob[n++] = _gv.y;
        ob[n++] = _gv.z;
        ob[n++] = hs[i + 3] as number;
      }
    }
    this.obstN = n;
  }

  /** how far side s's claw samples sit inside the obstacles (root of summed squared depths), 0 = clear */
  private clawPen(s: number, raise: number, swing: number, elbow: number, jaw: number): number {
    this.setClaw(s, raise, swing, elbow, jaw);
    const sh = this.bones[B_SH[s] as number] as THREE.Bone;
    const el = this.bones[B_EL[s] as number] as THREE.Bone;
    const jw = this.bones[B_JAW[s] as number] as THREE.Bone;
    sh.updateMatrix();
    el.updateMatrix();
    jw.updateMatrix();
    _gEl.multiplyMatrices(sh.matrix, el.matrix);
    _gJaw.multiplyMatrices(_gEl, jw.matrix);
    const ob = this.obst;
    const n = this.obstN;
    const near = this.near;
    const bd = this.clawBound[s] as Float32Array;
    let sum = 0;
    const pts = this.clawPts[s] as Float32Array[];
    for (let b = 0; b < 2; b++) {
      const m = (b === 0 ? _gEl : _gJaw).elements;
      const p = pts[b];
      if (!p) continue;
      // broad phase: obstacles touching this bone's bounding sphere
      const bx = bd[b * 4]!;
      const by = bd[b * 4 + 1]!;
      const bz = bd[b * 4 + 2]!;
      const cx = m[0]! * bx + m[4]! * by + m[8]! * bz + m[12]!;
      const cy = m[1]! * bx + m[5]! * by + m[9]! * bz + m[13]!;
      const cz = m[2]! * bx + m[6]! * by + m[10]! * bz + m[14]!;
      let nn = 0;
      for (let k = 0; k < n; k += 4) {
        const dx = cx - ob[k]!;
        const dy = cy - ob[k + 1]!;
        const dz = cz - ob[k + 2]!;
        const rr = ob[k + 3]! + bd[b * 4 + 3]!;
        if (dx * dx + dy * dy + dz * dz < rr * rr) near[nn++] = k;
      }
      if (nn === 0) continue;
      for (let i = 0; i < p.length; i += 3) {
        const lx = p[i] as number;
        const ly = p[i + 1] as number;
        const lz = p[i + 2] as number;
        const x = m[0]! * lx + m[4]! * ly + m[8]! * lz + m[12]!;
        const y = m[1]! * lx + m[5]! * ly + m[9]! * lz + m[13]!;
        const z = m[2]! * lx + m[6]! * ly + m[10]! * lz + m[14]!;
        for (let j = 0; j < nn; j++) {
          const k = near[j]!;
          const dx = x - ob[k]!;
          const dy = y - ob[k + 1]!;
          const dz = z - ob[k + 2]!;
          const rr = ob[k + 3]! + CLAW_R;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr) continue;
          const pen = rr - Math.sqrt(d2);
          sum += pen * pen;
        }
      }
    }
    return Math.sqrt(sum);
  }

  /** Nudge the claw's raise / swing / elbow correction `c` until it clears the eyes and hat. */
  private solveClaw(s: number, raise: number, swing: number, elbow: number, jaw: number, c: Float32Array): void {
    let f = this.clawPen(s, raise + c[0]!, swing + c[1]!, elbow + c[2]!, jaw);
    for (let it = 0; it < 6 && f > 1e-4; it++) {
      const h = 0.04;
      const g0 = (this.clawPen(s, raise + c[0]! + h, swing + c[1]!, elbow + c[2]!, jaw) - f) / h;
      const g1 = (this.clawPen(s, raise + c[0]!, swing + c[1]! + h, elbow + c[2]!, jaw) - f) / h;
      const g2 = (this.clawPen(s, raise + c[0]!, swing + c[1]!, elbow + c[2]! + h, jaw) - f) / h;
      const gg = g0 * g0 + g1 * g1 + g2 * g2;
      if (gg < 1e-6) {
        // flat spot (deep inside): swing outward
        c[1] = c[1]! + (s === 0 ? -1 : 1) * 0.15;
      } else {
        const k = Math.min(1.2, f / gg);
        c[0] = clamp(c[0]! - clamp(g0 * k, -0.3, 0.3), -1.4, 1.4);
        c[1] = clamp(c[1]! - clamp(g1 * k, -0.3, 0.3), -1.4, 1.4);
        c[2] = clamp(c[2]! - clamp(g2 * k, -0.3, 0.3), -1.4, 1.4);
      }
      f = this.clawPen(s, raise + c[0]!, swing + c[1]!, elbow + c[2]!, jaw);
    }
  }

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
      // looking up tips the eyeballs back toward the hat brim: allow only a little of it
      // Update 8: plus the stalk's follow-through (never tipped further back than the look allows)
      const pitch = -clamp(o[P_LOOK_Y] as number, -1, 0.3) * 0.45 + (this.eyeP[s] as Spring).value;
      e.rotation.set(Math.max(-0.135, pitch), (o[P_LOOK_X] as number) * 0.55, (this.eyeR[s] as Spring).value);
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
    // hat: wobble springs plus pose offsets (tips, tosses, slides)
    const hb = bone(B_HAT);
    hb.position.set(0, 0.93 - 0.45 + (o[P_HAT_Y] as number), -0.04);
    hb.rotation.set(this.hatX.value * 0.12 + (o[P_HAT_RX] as number), 0, this.hatZ.value * 0.1 + (o[P_HAT_RZ] as number));
    // claws, kept out of the eyes and the hat by the claw guard
    this.gatherObstacles();
    const decay = Math.exp(-dt * 5);
    for (let s = 0; s < 2; s++) {
      const raise = o[P_CLAW + s * 4] as number;
      const swing = o[P_CLAW + s * 4 + 1] as number;
      const elbow = o[P_CLAW + s * 4 + 2] as number;
      const jaw = o[P_CLAW + s * 4 + 3] as number;
      const c = this.guardC[s] as Float32Array;
      c[0] = (c[0] as number) * decay;
      c[1] = (c[1] as number) * decay;
      c[2] = (c[2] as number) * decay;
      this.solveClaw(s, raise, swing, elbow, jaw, c);
      this.setClaw(s, raise + (c[0] as number), swing + (c[1] as number), elbow + (c[2] as number), jaw);
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
    if (this.plantK > 1e-3) this.plantFeet();
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

/** eyeball and stalk spheres in the eye bone's frame (x mirrored per side), see buildCrab */
const EYE_SPHERES: [number, number, number, number][] = [[0.06, 0.28, 0.07, 0.17], [0.03, 0.13, 0.035, 0.07]];
const _gv = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _ph = new THREE.Vector3();
const _gm = new THREE.Matrix4();
const _gEl = new THREE.Matrix4();
const _gJaw = new THREE.Matrix4();

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

/** carapace profile [radius, y] from the belly centre to the crown (tests/clip.test.ts keeps a copy) */
const SHELL_PTS: [number, number][] = [[0.0, 0.12], [0.3, 0.13], [0.48, 0.2], [0.59, 0.31], [0.645, 0.43], [0.655, 0.5], [0.635, 0.57], [0.58, 0.67], [0.48, 0.78], [0.33, 0.87], [0.16, 0.915], [0.0, 0.93]];

/**
 * Update 9: the High carapace is sampled by arc length, densely through the rim band (y 0.4 to 0.64)
 * where the bevelled lip, the groove above it and the mouth sit, and coarsely over the belly and crown.
 */
function rimProfile(): [number, number][] {
  const c = new THREE.SplineCurve(SHELL_PTS.map(([r, y]) => new THREE.Vector2(r, y)));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i <= 400; i++) {
    const y = c.getPointAt(i / 400).y;
    if (y < 0.4) lo = i / 400;
    if (y < 0.64) hi = i / 400;
  }
  const us: number[] = [];
  const span = (a: number, b: number, n: number): void => {
    for (let i = 0; i < n; i++) us.push(a + ((b - a) * i) / n);
  };
  span(0, lo, 5);
  span(lo, hi, 13);
  span(hi, 1, 9);
  us.push(1);
  return us.map((u) => {
    const p = c.getPointAt(u);
    return [Math.max(0, p.x), p.y] as [number, number];
  });
}

/** smooth 3D value noise (0..1) for the shell's mottling */
function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1;
    const dy = (k >> 1) & 1;
    const dz = (k >> 2) & 1;
    v += hash3(ix + dx, iy + dy, iz + dz) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return v;
}

/** the face (front) of the shell stays smooth: rim details fade in from ~30° round to ~55° */
const faceFade = (a: number): number => smooth01((Math.abs(a) - 0.55) / 0.42);
const bump = (v: number, c: number, w: number): number => Math.exp(-(((v - c) / w) ** 2));
/**
 * Update 9 carapace relief (lathe units, pushed out along the radius) at lathe angle a (0 = front) and
 * lathe height y: a rounded lip at the rim with a tuck under it and a groove above it (the bevel), crab
 * "teeth" scalloped along the lip, and two soft branchial lobes over the back.
 */
function shellRelief(a: number, y: number): number {
  const ff = faceFade(a);
  const side = Math.abs(Math.sin(a));
  const sc = Math.max(0, Math.cos(a * 9)) ** 3 * (0.4 + side);
  const lip = bump(y, 0.5, 0.034) * (0.024 + 0.016 * sc) - bump(y, 0.435, 0.03) * 0.012 - bump(y, 0.588, 0.022) * 0.013;
  const lobes = bump(Math.abs(a), 2.15, 0.42) * bump(y, 0.71, 0.08) * 0.012;
  return ff * lip + lobes;
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();

/**
 * Crab v2 geometry (UPDATE2_PLAN.md §2.2), built in the rest pose and tagged per bone. `clay` gets
 * the matte parts, `gloss` the shell, claws and eyes, `line` the silhouette for the outline hull.
 */
const _bn = new THREE.Vector3();
const _bf = new THREE.Vector3(0.15, 0.35, 1).normalize();
const _tv = new THREE.Vector3();
/** unit offset from the polyline to the last point given to nearestOn */
const _no = new THREE.Vector3();
/** Parameter (0..1, per segment) of the point of polyline `pts` nearest to (x, y, z); the unit offset from it goes to _no. */
function nearestOn(pts: V3[], x: number, y: number, z: number): number {
  let best = Infinity;
  let bt = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k] as V3;
    const b = pts[k + 1] as V3;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const ez = b[2] - a[2];
    const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / Math.max(1e-9, ex * ex + ey * ey + ez * ez), 0, 1);
    const ox = x - a[0] - ex * t;
    const oy = y - a[1] - ey * t;
    const oz = z - a[2] - ez * t;
    const d = ox * ox + oy * oy + oz * oz;
    if (d < best) {
      best = d;
      bt = (k + t) / (pts.length - 1);
      _no.set(ox, oy, oz);
    }
  }
  if (_no.lengthSq() > 1e-12) _no.normalize();
  return bt;
}

export function buildCrab(skin: CrabSkin, hi: boolean, clay: GeoBuilder, gloss: GeoBuilder, line: GeoBuilder): void {
  const outlineOnly = clay === line;
  const seg = (n: number): number => Math.max(4, Math.round(hi ? n : n * 0.55));
  const body = skin.body;
  const dark = skin.dark;
  const belly = skin.belly;
  // a lighter tint of the body colour for the raised back plates
  const light = new THREE.Color(skin.body).offsetHSL(0, 0.04, 0.05).getHex();
  // Update 9 accents: cream (claw insides), ivory (claw teeth), near-black tips, and the eyelid line
  const cream = new THREE.Color(belly).lerp(_cb.set(0xffffff), 0.2).getHex();
  const ivory = new THREE.Color(belly).lerp(_cb.set(0xfff6e2), 0.6).getHex();
  const tipCol = new THREE.Color(dark).lerp(_cb.set(0x1a0806), 0.6).getHex();
  const lidLine = new THREE.Color(dark).lerp(_cb.set(0x2a0c06), 0.55).getHex();
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
  /** a capless tube painted by `paint`, then its end cap (as GeoBuilder.tube makes it) painted the same way */
  const tubeP = (g: GeoBuilder, color: number, pts: V3[], r: (t: number) => number, radial: number, tubular: number, cap: 'start' | 'end', paint: ((x: number, y: number, z: number, c: THREE.Color) => void) | null): void => {
    g.tube(color, pts, r, radial, tubular, false);
    if (paint) g.paint(paint);
    const at = cap === 'start' ? 0 : 1;
    g.geo(new THREE.SphereGeometry(r(at), radial, Math.max(3, Math.ceil(radial / 2))), color, pts[cap === 'start' ? 0 : pts.length - 1] as V3);
    if (paint) g.paint(paint);
  };

  // carapace: a lathe with a flatter belly, a rim ridge and a domed top, painted (Update 9: High is
  // sampled densely through the rim band and sculpted with a bevelled lip, see shellRelief)
  const profile = hi ? rimProfile() : smoothProfile(SHELL_PTS, 10);
  const shellPaint = (x: number, y: number, z: number, c: THREE.Color): void => {
    _ca.set(body);
    // belly on the lower front (High adds a raised, segmented belly plate; Low paints the seams)
    // the underside is belly-coloured too (seen when the crab ends up on its back)
    const bellyW = Math.max(smooth01((0.53 - y) / 0.06) * smooth01((z + 0.05) / 0.25), smooth01((0.3 - y) / 0.1));
    if (bellyW > 0) {
      _cb.set(belly);
      const seam = !hi && Math.abs(((y - 0.2) / 0.085) % 1 - 0.5) < 0.08 && y < 0.45 ? 0.86 : 1;
      _cb.multiplyScalar(seam);
      _ca.lerp(_cb, bellyW);
    }
    // darker top and a soft rim highlight (Low: High paints the bevel instead)
    const top = smooth01((y - 0.62) / 0.3);
    _cb.set(dark);
    _ca.lerp(_cb, top * 0.38);
    if (!hi && Math.abs(y - 0.5) < 0.03) _ca.multiplyScalar(1.06);
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
    // fine speckles on the top of the shell (every body; subtle; High mottles and speckles the lathe)
    if (!hi && y > 0.6 && skin.pattern !== 'rainbow' && hash3(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30)) > 0.9) _ca.multiplyScalar(1.12);
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
  const onShell = (y: number, a: number, out = 0): V3 => {
    const r = shellR(y) + (hi ? shellRelief(a, y) : 0);
    return [Math.sin(a) * (r * 1.05 + out), y * 0.96, Math.cos(a) * (r * 0.82 + out)];
  };
  /** is a model-space point inside the (scaled) carapace? */
  const inShell = (p: V3): boolean => {
    const r = shellR(p[1] / 0.96);
    return r > 0 && (p[0] / (r * 1.05)) ** 2 + (p[2] / (r * 0.82)) ** 2 < 1;
  };
  /** where a limb leaves the shell: the first point along a→b that is outside the carapace */
  const exitPoint = (a: V3, b: V3): V3 => {
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      if (!inShell(p)) return p;
    }
    return b;
  };
  /** Euler rotation that turns +y onto the shell normal at p (sockets sit flush on the surface) */
  const shellTilt = (p: V3): V3 => {
    const y0 = p[1] / 0.96;
    const r = shellR(y0);
    const dr = (shellR(y0 + 0.01) - shellR(y0 - 0.01)) / 0.02;
    _bn.set(p[0] / 1.1025, (-r * dr) / 0.96, p[2] / 0.6724).normalize();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), _bn));
    return [e.x, e.y, e.z];
  };
  /**
   * Update 7 cohesion: a low mound of shell where a limb or stalk comes out, painted with the shell
   * itself so the joint reads as part of the carapace instead of a stick pushed into it
   */
  const socket = (bone: number, p: V3, r: number, flat: number, dome = false): void => {
    const rot = shellTilt(p);
    if (dome) {
      // a static mound only needs its outer half, sunk a little so its rim hides in the shell
      const pp: V3 = [p[0] - _bn.x * 0.012, p[1] - _bn.y * 0.012, p[2] - _bn.z * 0.012];
      gloss.bone(bone).geo(new THREE.SphereGeometry(r, hi ? 8 : 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), body, pp, rot, [1, flat, 1]);
    } else gloss.bone(bone).geo(new THREE.SphereGeometry(r, hi ? 8 : 6, hi ? 4 : 2), body, p, rot, [1, flat, 1]);
    gloss.paint((x, y, z, c) => {
      shellPaint(x, y, z, c);
      // a darker ring at the base of the mound, like the seam of a socket
      const d = Math.hypot(x - p[0], y - p[1], z - p[2]) / r;
      c.multiplyScalar(1 - 0.2 * smooth01((d - 0.75) / 0.25));
    });
  };
  /**
   * Carapace sculpt (High): the Update 9 relief (a bevelled, scalloped rim lip with a groove above it,
   * two lobes over the back) and the Crab v3 notch between the eyes.
   */
  const sculpt = (p: THREE.Vector3): void => {
    const a = Math.atan2(p.x / 1.05, p.z / 0.82);
    const d = shellRelief(a, p.y / 0.96);
    p.x += Math.sin(a) * d * 1.05;
    p.z += Math.cos(a) * d * 0.82;
    // front notch between the eye stalks
    const front = smooth01((p.z - 0.25) / 0.2) * Math.max(0, 1 - Math.abs(p.x) / 0.14) * smooth01((p.y - 0.62) / 0.1);
    p.y -= front * 0.04;
    p.z -= front * 0.02;
  };
  const mottle = skin.pattern !== 'rainbow' && skin.pattern !== 'pearl' && skin.pattern !== 'lava';
  both(gloss, (g) => {
    g.bone(B_BODY).lathe(body, profile, seg(hi ? 40 : 26), [0, 0, 0], [0, 0, 0], [1.05, 0.96, 0.82]);
    if (hi && g === gloss) g.warp(sculpt);
    if (g === gloss) g.paint(shellPaint);
    if (hi && g === gloss) {
      g.paint((x, y, z, c) => {
        const a = Math.atan2(x / 1.05, z / 0.82);
        const y0 = y / 0.96;
        const ff = faceFade(a);
        // the bevel: a lit edge along the top of the lip, a shadowed tuck under it, a dark groove above
        c.multiplyScalar(1 + ff * (0.13 * bump(y0, 0.522, 0.018) - 0.22 * bump(y0, 0.448, 0.024) - 0.26 * bump(y0, 0.59, 0.015)));
        // soft mottling over the dome (the speckles are real dots, below)
        if (mottle) c.multiplyScalar(1 + (vnoise(x * 6 + 3.1, y * 6, z * 6) - 0.5) * 0.32 * smooth01((y0 - 0.56) / 0.1));
      });
    } else if (g === gloss) {
      // Low: the rim reads as a darker line in the paint
      g.paint((x, y, z, c) => c.multiplyScalar(1 - 0.16 * bump(y, 0.47, 0.035)));
    }
  });
  if (deco) {
  // top bumps (Update 9: the rim ridge is sculpted into the High shell and painted on Low)
  for (const [x, z, r] of [[-0.3, -0.12, 0.1], [0.3, -0.12, 0.1], [0, -0.28, 0.085], [-0.16, 0.12, 0.06], [0.16, 0.12, 0.06]] as V3[]) {
    ball(gloss.bone(B_BODY), dark, r, [x, 0.86 - Math.abs(x) * 0.15 + (z < 0 ? 0 : -0.02), z], [1, 0.45, 1], 8);
  }
  // shell ridges: two arcs over the crown, darker
  for (const sx of SIDES) {
    gloss.bone(B_BODY).tube(dark, [[sx * 0.12, 0.88, 0.22], [sx * 0.2, 0.92, 0.0], [sx * 0.16, 0.88, -0.22], [sx * 0.05, 0.82, -0.38]], 0.022, seg(5), tub(8), true);
    // side spines along the rim
    for (let k = 0; k < (hi ? 3 : 2); k++) {
      const a = 0.55 + k * 0.38;
      // High: seated on the sculpted lip
      const at: V3 = hi ? onShell(0.53, sx * a, 0.018) : [sx * Math.sin(a) * 0.69, 0.51, Math.cos(a) * 0.57];
      gloss.bone(B_BODY).cone(dark, 0.03, 0.09, at, [Math.PI / 2, 0, -sx * (Math.PI / 2 - 0.15) + 0], seg(6));
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
  // Update 9 speckles (High): small flat freckles over the sides and back of the dome, darker than
  // the shell (lighter flecks on gold); the face and the busy painted patterns stay clean
  if (hi && mottle && skin.pattern !== 'stars') {
    const fleck = new THREE.Color(body).lerp(_cb.set(skin.pattern === 'gold' ? 0xffffff : dark), skin.pattern === 'gold' ? 0.55 : 0.75).getHex();
    const want = skin.pattern === 'spots' ? 16 : 30;
    for (let i = 0, n = 0; n < want && i < 400; i++) {
      const a = (hash3(i, 11, 5) * 2 - 1) * Math.PI;
      const y = 0.62 + hash3(i, 2, 9) * 0.22;
      // not on the face, the eye-stalk roots or under the hat's front
      if (Math.abs(a) < 0.85) continue;
      n++;
      const p = onShell(y, a, 0.004);
      const disc = new THREE.CircleGeometry(0.013 + hash3(i, 7, 3) * 0.016, 6).rotateX(-Math.PI / 2);
      gloss.bone(B_BODY).geo(disc, fleck, p, shellTilt(p), [1, 1, 0.8 + hash3(i, 4, 4) * 0.4]);
    }
  }
  // Update 9 belly plate (High): a raised plate on the lower front in three pillowed segments with
  // grooves between them, its edges tucked into the shell
  if (hi) {
    const ys = [0.16, 0.175, 0.198, 0.217, 0.23, 0.243, 0.265, 0.287, 0.3, 0.313, 0.335, 0.354, 0.37];
    const A = 0.8;
    const gy = ys.length - 1;
    const plate = new THREE.PlaneGeometry(1, 1, 10, gy);
    const pa = plate.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const a = (pa.getX(i) * 2) * A;
      const y = ys[gy - Math.round((0.5 - pa.getY(i)) * gy)] as number;
      const edge = smooth01((A - Math.abs(a)) / 0.2) * smooth01((y - 0.16) / 0.03) * smooth01((0.37 - y) / 0.03);
      const f = ((y - 0.16) / 0.07) % 1;
      const p = onShell(y, a, 0.003 + edge * (0.004 + 0.009 * Math.sin(Math.PI * f)));
      pa.setXYZ(i, p[0], p[1], p[2]);
    }
    plate.computeVertexNormals();
    gloss.bone(B_BODY).geo(plate, belly);
    gloss.paint((x, y, z, c) => {
      const a = Math.atan2(x / 1.05, z / 0.82);
      const y0 = y / 0.96;
      const groove = Math.max(bump(y0, 0.23, 0.009), bump(y0, 0.3, 0.009));
      const edge = 1 - smooth01((A - Math.abs(a)) / 0.2) * smooth01((y0 - 0.16) / 0.03) * smooth01((0.37 - y0) / 0.03);
      c.multiplyScalar((1 - 0.26 * groove) * (1 - 0.22 * edge) * (0.9 + 0.1 * smooth01((y0 - 0.16) / 0.2)));
    });
  }
  // back plates: grooves following the shell over the back, and a little tail flap underneath
  // (Update 4: the run camera now sees the back, so the plates are bolder: deeper grooves, raised
  // lighter plates between them, a keel ridge down the middle and the plates read from the run camera)
  for (let k = 0; k < (hi ? 3 : 2); k++) {
    const y = 0.82 - k * 0.11;
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) pts.push(onShell(y - Math.abs(i - 4) * 0.01, Math.PI + (i - 4) * 0.25, 0.008));
    gloss.bone(B_BODY).tube(dark, pts, 0.022, 4, tub(10), true);
    if (hi && k < 3) {
      // a raised plate between this groove and the next
      const yp = y - 0.05;
      for (let i = -1; i <= 1; i++) ball(gloss.bone(B_BODY), light, 0.13 - Math.abs(i) * 0.015, onShell(yp - Math.abs(i) * 0.01, Math.PI + i * 0.42, -0.03), [1.35, 0.22, 0.6], 5, [0, Math.PI + i * 0.3, 0]);
    }
  }
  {
    const keel: V3[] = [];
    for (let i = 0; i <= 5; i++) keel.push(onShell(0.9 - i * 0.07, Math.PI, 0.012));
    gloss.bone(B_BODY).tube(dark, keel, 0.018, 4, tub(8), true);
  }
  // tail flap: a low plate tucked into the rear underside, painted like the shell around it so it
  // reads as relief rather than a loose light blob (Update 7)
  ball(gloss.bone(B_BODY), body, 0.13, onShell(0.21, Math.PI, -0.012), [1.25, 0.28, 0.6], 10, [0.5, 0, 0]);
  gloss.paint((x, y, z, c) => {
    shellPaint(x, y, z, c);
    c.multiplyScalar(0.88);
  });
  // mouth expressions, each on its own bone (scale 0 hides it). v3: bigger, filled shapes that read at game distance
  const mz = onShell(0.46, 0)[2] + 0.008;
  const grin = new THREE.Shape();
  grin.moveTo(-0.11, 0.0);
  grin.quadraticCurveTo(0, -0.012, 0.11, 0.0);
  grin.quadraticCurveTo(0.09, -0.1, 0, -0.105);
  grin.quadraticCurveTo(-0.09, -0.1, -0.11, 0.0);
  clay.bone(B_MOUTH[0] as number).geo(new THREE.ShapeGeometry(grin, hi ? 6 : 3), 0x4a0f18, [0, 0.49, mz], [-0.12, 0, 0]);
  // Update 9: the inside of the mouth is darker at the top, warmer down by the tongue
  clay.paint((x, y, z, c) => c.lerp(_cb.set(0x24060c), smooth01((y - 0.43) / 0.06) * 0.6));
  ball(clay.bone(B_MOUTH[0] as number), 0xff6f8a, 0.05, [0, 0.415, mz + 0.004], [1, 0.45, 0.25], 6);
  if (hi) {
    // two little buck teeth under the lip
    const tooth = new THREE.Shape();
    tooth.moveTo(-0.014, 0);
    tooth.lineTo(0.014, 0);
    tooth.lineTo(0.014, -0.02);
    tooth.quadraticCurveTo(0.014, -0.03, 0.005, -0.03);
    tooth.lineTo(-0.005, -0.03);
    tooth.quadraticCurveTo(-0.014, -0.03, -0.014, -0.02);
    tooth.lineTo(-0.014, 0);
    for (const tx of [-0.0155, 0.0155]) clay.bone(B_MOUTH[0] as number).geo(new THREE.ShapeGeometry(tooth, 2), 0xfffaf0, [tx, 0.488, mz + 0.0035], [-0.12, 0, 0]);
  }
  clay.bone(B_MOUTH[0] as number).tube(0x3a1010, [[-0.115, 0.495, mz + 0.004], [0, 0.483, mz + 0.012], [0.115, 0.495, mz + 0.004]], 0.01, 4, tub(6), true);
  clay.bone(B_MOUTH[1] as number).geo(new THREE.TorusGeometry(0.06, 0.022, 4, seg(12)), 0x3a1010, [0, 0.44, mz], [0.15, 0, 0]);
  ball(clay.bone(B_MOUTH[1] as number), 0x5a0f1c, 0.06, [0, 0.44, mz - 0.01], [1, 1.1, 0.3], 8);
  clay.bone(B_MOUTH[2] as number).box(0xffffff, 0.2, 0.06, 0.03, [0, 0.44, mz]);
  clay.bone(B_MOUTH[2] as number).box(0x3a1010, 0.22, 0.014, 0.035, [0, 0.44, mz]);
  for (const tx of [-0.05, 0, 0.05]) clay.bone(B_MOUTH[2] as number).box(0x9a8a8a, 0.006, 0.06, 0.036, [tx, 0.44, mz]);
  clay.bone(B_MOUTH[3] as number).tube(0x3a1010, [[-0.11, 0.44, mz], [-0.055, 0.47, mz + 0.01], [0, 0.44, mz + 0.01], [0.055, 0.41, mz + 0.01], [0.11, 0.44, mz]], 0.018, 4, tub(10), true);
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
      // the stalk roots in a socket mound on the carapace (Update 7: no stick pushed into the shell)
      socket(B_BODY, exitPoint([s * 0.18, 0.6, 0.27], [s * 0.26, 0.84, 0.33]), hi ? 0.085 : 0.08, 0.5, true);
      // segmented stalk: two collars
      clay.bone(B_EYE[si] as number).geo(new THREE.TorusGeometry(0.058, 0.014, hi ? 4 : 3, seg(10)), dark, [s * 0.2, 0.66, 0.28], [Math.PI / 2 - 0.25, 0, 0]);
      clay.bone(B_EYE[si] as number).geo(new THREE.TorusGeometry(0.05, 0.013, hi ? 4 : 3, seg(10)), dark, [s * 0.24, 0.79, 0.315], [Math.PI / 2 - 0.25, 0, 0]);
    }
    both(gloss, (g) => {
      if (g === line) return void ball(g, 0xfafafa, 0.13, [ex, 0.9, 0.35], [1, 1.05, 1], 10); // hull tucked inside: no grey rim on the whites
      // the white is shaded as if it faced forward (bent normals), so its edge never drops into the
      // toon shadow band: a clean white eye instead of a grey goggle rim
      const ws = Math.max(5, Math.round(hi ? 14 : 14 * 0.6));
      const eg = new THREE.SphereGeometry(0.17, ws, Math.max(3, Math.round(ws * 0.6)));
      const nrm = eg.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < nrm.count; i++) {
        _bn.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).lerp(_bf, 0.55).normalize();
        nrm.setXYZ(i, _bn.x, _bn.y, _bn.z);
      }
      g.bone(B_EYE[si] as number).geo(eg, 0xfafafa, [ex, 0.9, 0.35], [0, 0, 0], [1, 1.05, 1]);
    });
    if (deco) {
    // iris, pupil and highlights are caps on the eyeball's own sphere, so they wrap it from every
    // angle instead of floating in front of it like flat discs
    const EYE_C: V3 = [ex, 0.9, 0.35];
    const cap = (r: number, theta: number, w: number): THREE.SphereGeometry => new THREE.SphereGeometry(r, seg(w), Math.max(3, Math.round(seg(w) / 3)), 0, Math.PI * 2, 0, theta);
    // Update 9: a bigger iris, lighter at the bottom and shaded under the lid, with a dark rim
    const IRIS = 0.72;
    const irisR = 0.1725 * Math.sin(IRIS);
    gloss.bone(B_EYE[si] as number).geo(cap(0.1725, IRIS, hi ? 18 : 14), skin.iris, EYE_C, [Math.PI / 2, 0, 0], [1, 1.05, 1]);
    gloss.paint((x, y, z, c) => {
      const dy = (y - 0.9) / 1.05;
      const r = Math.hypot(x - ex, dy) / irisR;
      c.lerp(_cb.set(0xffffff), smooth01((-dy / irisR + 0.15) / 0.85) * 0.3);
      c.multiplyScalar(1 - 0.28 * smooth01((dy / irisR - 0.05) / 0.7));
      c.multiplyScalar(1 - 0.42 * smooth01((r - 0.74) / 0.22));
    });
    gloss.bone(B_EYE[si] as number).geo(cap(0.175, 0.36, hi ? 12 : 10), 0x0e0e16, EYE_C, [Math.PI / 2, 0, 0], [1, 1.05, 1]);
    // two catch-lights sitting on the surface, upper-outer and lower-inner
    const hl = (dx: number, dy: number, rr: number, w: number): void => {
      const n = new THREE.Vector3(dx, dy, 1).normalize().multiplyScalar(0.177);
      ball(gloss.bone(B_EYE[si] as number), 0xffffff, rr, [ex + n.x, 0.9 + n.y * 1.05, 0.35 + n.z], [1, 1, 0.45], w, [Math.atan2(-n.y, n.z), Math.atan2(n.x, n.z), 0]);
    };
    hl(-0.24, 0.3, 0.042, 7);
    hl(0.2, -0.22, 0.02, 5);
    // eyelid: a hemispherical cap tilted back (open); the lid bone rotates it down over the eye
    const lid = new THREE.SphereGeometry(0.182, seg(12), seg(5), 0, Math.PI * 2, 0, Math.PI / 2);
    gloss.bone(B_LID[si] as number).geo(lid, dark, [ex, 0.9, 0.35], [-0.95, 0, 0], [1, 1.05, 1]);
    gloss.paint((x, y, z, c) => c.lerp(_cb.set(body), 0.5));
    // Update 9: a dark lid line along the front of the lid's edge (it rides the lid bone, so it
    // sweeps down with every blink)
    gloss.bone(B_LID[si] as number).geo(new THREE.TorusGeometry(0.184, hi ? 0.011 : 0.013, 3, hi ? 12 : 6, Math.PI), lidLine, [ex, 0.9, 0.35], [Math.PI / 2 - 0.95, 0, 0]);
    // Update 7: a shell-coloured cup holds the back of the eyeball and runs down into the stalk, so
    // from the side and the back the eye sits in its stalk instead of reading as a loose white ball
    const cupG = new THREE.SphereGeometry(0.176, seg(10), hi ? 3 : 2, 0, Math.PI * 2, 0, Math.PI / 2);
    gloss.bone(B_EYE[si] as number).geo(cupG, dark, EYE_C, [-Math.PI / 2 - 0.3, 0, 0], [1, 1.05, 1]);
    gloss.paint((x, y, z, c) => c.lerp(_cb.set(body), 0.5 + 0.2 * smooth01((y - 0.8) / 0.15)));
    // antenna with a spring at the base
    clay.bone(B_ANT[si] as number).tube(dark, [[s * 0.04, 0.7, 0.47], [s * 0.05, 0.8, 0.54], [s * 0.08, 0.86, 0.57]], (t) => 0.016 - t * 0.006, 4, tub(6), false);
    ball(clay.bone(B_ANT[si] as number), body, 0.024, [s * 0.08, 0.86, 0.57], [1, 1, 1], 5);
    }

    // claws: upper arm, forearm, a rounded palm with a serrated fixed finger and a moving jaw
    both(clay, (g) => g.bone(B_SH[si] as number).tube(dark, [[s * 0.52, 0.55, 0.28], [s * 0.7, 0.6, 0.42], [s * 0.82, 0.62, 0.52]], (t) => 0.075 - t * 0.01, seg(8), tub(5), 'start'));
    both(clay, (g) => g.bone(B_EL[si] as number).tube(dark, [[s * 0.82, 0.62, 0.52], [s * 0.87, 0.65, 0.63], [s * 0.89, 0.67, 0.72]], (t) => 0.068 + t * 0.01, seg(8), tub(4), 'start'));
    const px = s * 0.9;
    // shoulder: a ball joint of shell centred on the pivot, so the arm swivels inside it at any raise
    if (deco) socket(B_SH[si] as number, [s * 0.55, 0.55, 0.3], hi ? 0.1 : 0.095, 0.8);
    // fixed finger (on the forearm bone) and the moving jaw
    const FIX: V3[] = [[px, 0.77, 0.9], [px + s * 0.01, 0.8, 1.02], [px - s * 0.04, 0.75, 1.12]];
    const JAW: V3[] = [[px, 0.64, 0.9], [px, 0.62, 1.0], [px - s * 0.03, 0.65, 1.08]];
    const fixR = (t: number): number => 0.075 * (1 - t) + 0.016;
    const jawR = (t: number): number => 0.06 * (1 - t) + 0.014;
    /** Update 9 fingers: the edge facing the other finger is cream, the tip near-black */
    const fingerPaint = (pts: V3[], toward: number) => (x: number, y: number, z: number, c: THREE.Color): void => {
      const t = nearestOn(pts, x, y, z);
      c.lerp(_cb.set(cream), smooth01((toward * _no.y + 0.05) / 0.55) * 0.75);
      c.lerp(_cb.set(tipCol), smooth01((t - 0.55) / 0.4) * 0.9);
    };
    both(gloss, (g) => {
      ball(g.bone(B_EL[si] as number), body, 0.17, [px, 0.71, 0.8], [0.92, 0.82, 1.15], 12);
      if (g === gloss) {
        // two-tone claws (Update 9: a cleaner split): the outer top in the body colour, the inner face
        // and the underside cream, darker toward the fingers
        g.paint((x, y, z, c) => {
          const inner = smooth01((s * (px - x) - 0.015) / 0.08);
          const under = smooth01((0.69 - y) / 0.07);
          c.lerp(_cb.set(cream), Math.max(inner, under * 0.85) * 0.72);
          c.lerp(_cb.set(dark), smooth01((z - 0.84) / 0.14) * 0.35);
        });
      }
      g.bone(B_EL[si] as number);
      tubeP(g, body, FIX, fixR, seg(8), tub(6), 'end', g === gloss ? fingerPaint(FIX, -1) : null);
      g.bone(B_JAW[si] as number);
      tubeP(g, body, JAW, jawR, seg(8), tub(6), 'end', g === gloss ? fingerPaint(JAW, 1) : null);
    });
    if (deco && hi) {
      // knuckle bumps in a row along the top of the palm, and a ring at the wrist
      const knob = new THREE.Color(body).lerp(_cb.set(dark), 0.45).getHex();
      for (let k = 0; k < 3; k++) {
        _tv.set(s * 0.5, 0.86, (k - 1) * 0.62).normalize();
        ball(gloss.bone(B_EL[si] as number), knob, 0.031 - Math.abs(k - 1) * 0.005, [px + _tv.x * 0.151, 0.71 + _tv.y * 0.135, 0.8 + _tv.z * 0.19], [1, 0.7, 1], 6);
      }
      gloss.bone(B_EL[si] as number).geo(new THREE.TorusGeometry(0.085, 0.016, 4, seg(12)), dark, [px - s * 0.005, 0.68, 0.66], [0.25, 0, 0]);
    }
    // serrations: ivory teeth along the inner edges of both fingers, smaller toward the tips
    if (deco) {
      const nT = hi ? 5 : 2;
      const fc = new THREE.CatmullRomCurve3(FIX.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
      const jc = new THREE.CatmullRomCurve3(JAW.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
      for (let k = 0; k < nT; k++) {
        const t = 0.2 + (k / (nT - 1)) * 0.56;
        const hF = 0.036 - t * 0.014;
        fc.getPointAt(t, _tv);
        gloss.bone(B_EL[si] as number).cone(ivory, hF * 0.42, hF, [_tv.x, _tv.y - fixR(t) * 0.8, _tv.z], [Math.PI, 0, 0], 5);
        const hJ = 0.031 - t * 0.012;
        jc.getPointAt(t, _tv);
        gloss.bone(B_JAW[si] as number).cone(ivory, hJ * 0.42, hJ, [_tv.x, _tv.y + jawR(t) * 0.8, _tv.z], [0, 0, 0], 5);
      }
    }
  }

  // legs: three segments each (hip, knee, foot). Update 9: each segment swells a little in the middle
  // and is shaded toward its joints, the undersides are pale, and (High) the foot is a curved,
  // tapered dactyl with a dark point
  const legPaint = (pts: V3[], s: number, foot: boolean) => (x: number, y: number, z: number, c: THREE.Color): void => {
    const t = nearestOn(pts, x, y, z);
    // facing down and in, toward the body
    const under = (-_no.y * 0.9 - s * _no.x * 0.45) / 1.007;
    c.lerp(_cb.set(belly), smooth01((under + 0.05) / 0.6) * 0.6);
    c.multiplyScalar(1 - (foot ? 0.1 : 0.17) * Math.max(bump(t, 0, 0.14), bump(t, 1, 0.14)));
    if (foot) c.lerp(_cb.set(tipCol), smooth01((t - 0.45) / 0.45) * 0.85);
  };
  for (let l = 0; l < 6; l++) {
    const s = l < 3 ? -1 : 1;
    const z = LEG_Z[l % 3] as number;
    const hip: V3 = [s * 0.5, 0.4, z];
    const knee: V3 = [s * 0.86, 0.6, z * 1.25];
    const ankle: V3 = [s * 1.08, 0.24, z * 1.45];
    const tip: V3 = [s * 1.13, 0.01, z * 1.55];
    const upper: V3[] = [hip, [s * 0.68, 0.57, z * 1.12], knee];
    const lower: V3[] = [knee, [s * 1.0, 0.46, z * 1.36], ankle];
    const footPts: V3[] = hi ? [ankle, [s * 1.125, 0.12, z * 1.5], tip] : [ankle, tip];
    const footR = hi ? (t: number): number => 0.047 * (1 - t) ** 0.9 + 0.004 : (t: number): number => 0.045 - t * 0.033;
    both(clay, (g) => {
      const pp = deco && g === clay;
      g.bone(B_HIP(l)).tube(dark, upper, (t) => 0.075 - t * 0.014 + (hi ? 0.009 * Math.sin(Math.PI * t) : 0), seg(6), hi ? 6 : 3, false);
      if (pp) g.paint(legPaint(upper, s, false));
      g.bone(B_KNEE(l)).tube(dark, lower, (t) => 0.06 - t * 0.016 + (hi ? 0.007 * Math.sin(Math.PI * t) : 0), seg(6), hi ? 6 : 3, false);
      if (pp) g.paint(legPaint(lower, s, false));
      g.bone(B_FOOT(l)).tube(dark, footPts, footR, seg(6), hi ? 5 : 2, false);
      if (pp) g.paint(legPaint(footPts, s, true));
      // Low and the outline close the ankle with a cap; High has a joint knob there
      if (!hi) g.geo(new THREE.SphereGeometry(0.045, seg(6), Math.max(3, Math.ceil(seg(6) / 2))), dark, ankle);
    });
    if (deco) {
      // coxa: a shell socket where the leg leaves the rim; it rides the hip bone, whose pivot is inside
      // the shell, so it slides along the rim as the leg swings and never opens a gap (Update 7)
      socket(B_HIP(l), exitPoint(hip, [s * 0.68, 0.57, z * 1.12]), hi ? 0.085 : 0.08, 0.75);
      // a few bristles on the middle segment (High only)
      if (hi) for (let k = 0; k < 2; k++) clay.bone(B_KNEE(l)).cone(dark, 0.008, 0.05, [s * (0.9 + k * 0.07), 0.58 - k * 0.12, z * (1.28 + k * 0.06)], [0, 0, s * 0.9], 3);
    }
    // joints: a shell-coloured knee and a dark ankle knob
    ball(clay.bone(B_KNEE(l)), body, 0.068, knee, [1, 1, 1], 6);
    if (deco) ball(clay.bone(B_FOOT(l)), dark, hi ? 0.054 : 0.037, ankle, [1, 1, 1], hi ? 6 : 5);
  }
}
