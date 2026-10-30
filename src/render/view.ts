import * as THREE from 'three';
import { CFG, type QualityPreset, zoneAt } from '../config';
import type { GameEvent, PowerKind } from '../sim/events';
import type { World } from '../sim/world';
import { zoneBlend } from '../sim/zones';
import { Backdrop } from './backdrop';
import { CAMERA_ELEVATION } from './camera';
import { EntityViews } from './entities';
import { LivingWorld } from './life';
import { BlobShadows, SlamFx, Footprints, Particles } from './fx';
import { Materials, type TrailKind, makeTrailTex } from './materials';
import { BODY_SKINS, CRAB_SKINS, type CrabDrive, CrabModel, type CrabSkin, type HatKind, IDLE_DRIVE } from './models/crab';
import { greatWave, powerupIcon, riderWave } from './models/obstacles';
import { Spring } from './anim/spring';
import { cues, sample, type Key } from './anim/timeline';
import { Ocean } from './ocean';
import * as P from './props';
import { GeoBuilder } from './geo';
import { NIGHT_PALETTE, ZONE_PALETTES, clonePalette, lerpPalette } from './palettes';
import { Renderer } from './renderer';
import { Scenery } from './scenery';
import { ShellRenderer } from './shells';
import { Sky } from './sky';
import { ToyLighting, toyVariants } from './shaders/toy';
import { sandTexture } from './textures';
import { Rivals } from './rivals';

export type CamMode = 'title' | 'intro' | 'run' | 'shop' | 'map';

const POWER_COLORS: Record<PowerKind, number> = { magnet: 0xff5a4a, shield: 0x6fd0ff, rider: 0x3fd6d0 };

/** Everything visual. Reads the sim; never writes to it. */
export class GameView {
  readonly renderer: Renderer;
  readonly mats = new Materials();
  private sky = new Sky();
  private night = 0;
  /** High tier: a small shadow map around the crab (UPDATE2_PLAN.md §1.4) */
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private catcher: THREE.Mesh;
  private catcherMat = new THREE.ShadowMaterial({ color: 0x2a2060, opacity: 0.5, depthWrite: false });
  private shadowMap = false;
  private ocean: Ocean;
  private scenery: Scenery;
  private backdrop = new Backdrop();
  readonly crab: CrabModel;
  private shells: ShellRenderer;
  private shadows: BlobShadows;
  private dust: Particles;
  private sparks: Particles;
  /** Sand Slam shockwave and crater */
  private slamFx = new SlamFx();
  /** Wardrobe trail sprites (one extra draw call, only while a non-sand trail is equipped) */
  private trail: Particles;
  private trailKind: TrailKind = 'sand';
  private trailTex = new Map<TrailKind, THREE.CanvasTexture>();
  private trailT = 0;
  private trailHue = 0;
  /** Daily Tide "Night Run": force the night palette (0..1) */
  nightForce = 0;
  /** boot cinematic time (s), <0 when not playing (UPDATE3_PLAN.md §2.1) */
  private cineT = -1;
  private cineCue: ((name: string) => void) | null = null;
  private readonly cineV = [0, 0, 0, 0, 0, 0];
  /** smoothed menu camera (screens glide instead of cutting) */
  private menuCamInit = false;
  /** Home sky follows the local clock: golden hour (0..1) and night (0..1) blends on menus */
  private homeGolden = 0;
  private homeNight = 0;
  private menuLook = false;
  private parX = 0;
  private parY = 0;
  /** screenshots and tests want the camera exactly where it ends up */
  smoothMenuCam = true;
  readonly entities: EntityViews;
  /** Crab Cup rivals (null outside races) */
  rivals: Rivals | null = null;
  private palette = clonePalette(ZONE_PALETTES[0]!);
  private world = new THREE.Group();

  // crab animation state
  private drive: CrabDrive = { running: false, grounded: true, vy: 0, vx: 0, speed: 0, crashT: -1, rider: false };
  private dustT = 0;
  private feet = new Footprints();
  private life: LivingWorld;
  /** Home diorama: a sand mound with an umbrella, towel and bucket around the crab (UPDATE2_PLAN.md §4.3) */
  private homeSet = new THREE.Group();
  /** Island Hop: the Great Wave chasing the crab (created on first use) */
  private chaseWave: THREE.Mesh | null = null;
  /** track distance of the last footprint */
  private footT = 0;
  private time = 0;
  /** camera shake is trauma-based: offset = trauma², trauma decays (UPDATE2_PLAN.md §3.3) */
  private trauma = 0;
  private camX = new Spring(0, { freq: 9, damping: 0.8 });
  private fovPunch = new Spring(0, { freq: 10, damping: 0.55 });
  private camDip = new Spring(0, { freq: 12, damping: 0.5 });
  private vOrbit = new THREE.Vector3();
  private vOrbitLook = new THREE.Vector3();
  private reduceMotion = false;
  private shieldMesh: THREE.Mesh;
  private boardGroup = new THREE.Group();
  private magnetRing: THREE.Mesh;
  private lastZone = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  // scratch vectors (no allocations in the frame loop)
  private vRunPos = new THREE.Vector3();
  private vRunLook = new THREE.Vector3();
  private vTitlePos = new THREE.Vector3();
  private vTitleLook = new THREE.Vector3();
  private titleSpin = 0;
  shopSpin = 0;
  /** test hook: close-up camera offset from the crab, or null */
  debugCam: THREE.Vector3 | null = null;

  constructor(canvas: HTMLCanvasElement, quality: QualityPreset) {
    this.renderer = new Renderer(canvas, quality);
    const scene = this.renderer.scene;
    scene.background = null;
    scene.add(this.sky.mesh);
    scene.add(this.sky.stars);
    this.ocean = new Ocean(quality.oceanWaves);
    scene.add(this.ocean.mesh);
    scene.add(this.backdrop.group);
    this.scenery = new Scenery(this.mats, quality.sceneryDensity);
    scene.add(this.scenery.group);
    scene.add(this.world);
    this.entities = new EntityViews(this.mats);
    this.world.add(this.entities.group);
    this.shadows = new BlobShadows(this.mats);
    this.world.add(this.shadows.mesh);
    this.world.add(this.feet.mesh);
    this.life = new LivingWorld(this.mats);
    this.world.add(this.life.group);
    {
      const mound = new GeoBuilder()
        .lathe(0xf6dda6, [[0, 0.22], [0.7, 0.2], [1.05, 0.12], [1.35, 0.02], [1.5, 0]], 22)
        .paint((x, y, z, c) => c.multiplyScalar(0.92 + y * 0.5))
        .build();
      const m = new THREE.Mesh(mound, this.mats.clay);
      const umb = new THREE.Mesh(P.umbrella(0xe53935, 0xfff4dc, 0.18), this.mats.clayWind);
      umb.position.set(-2.5, 0, -2.4);
      umb.scale.setScalar(0.95);
      const towel = new THREE.Mesh(P.towel(0x3fd6d0, 0xfff4dc), this.mats.clay);
      towel.position.set(1.9, 0.01, -1.0);
      towel.rotation.y = 0.5;
      const bucket = new THREE.Mesh(P.bucketSpade(0xffc933), this.mats.clay);
      bucket.position.set(1.7, 0, -0.3);
      bucket.scale.setScalar(0.85);
      bucket.rotation.y = -0.6;
      this.homeSet.add(m, umb, towel, bucket);
      for (const o of [m, umb, towel, bucket]) o.castShadow = true;
      this.world.add(this.homeSet);
    }
    this.shells = new ShellRenderer(this.mats);
    this.world.add(this.shells.mesh, this.shells.glow, this.shells.sparkle, this.shells.pops);
    this.dust = new Particles(this.mats.dustTex, false, 160);
    this.sparks = new Particles(this.mats.sparkTex, true, 160);
    this.dust.limit = Math.floor(quality.maxParticles * 0.6);
    this.sparks.limit = Math.floor(quality.maxParticles * 0.6);
    this.trail = new Particles(this.mats.sparkTex, false, 120);
    this.trail.limit = Math.floor(quality.maxParticles * 0.4);
    this.trail.mesh.visible = false;
    this.world.add(this.dust.mesh, this.sparks.mesh, this.trail.mesh, this.slamFx.group);

    this.crab = new CrabModel(this.mats);
    this.world.add(this.crab.root);
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), this.mats.bubble);
    this.shieldMesh.position.y = 0.65;
    this.shieldMesh.visible = false;
    this.crab.root.add(this.shieldMesh);
    this.magnetRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0xff7a6a, transparent: true, opacity: 0.6, depthWrite: false }));
    this.magnetRing.rotation.x = Math.PI / 2;
    this.magnetRing.position.y = 0.3;
    this.magnetRing.visible = false;
    this.crab.root.add(this.magnetRing);
    // Wave Rider: little wave + surfboard under the crab
    const wave = new THREE.Mesh(riderWave(), this.mats.gloss);
    wave.position.set(0, -0.5, 0.45);
    const board = new THREE.Mesh(powerupIcon('rider'), this.mats.clay);
    board.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    board.scale.set(2.6, 2.6, 2.6);
    board.position.y = -0.05;
    this.boardGroup.add(wave, board);
    this.boardGroup.visible = false;
    this.crab.root.add(this.boardGroup);

    // shadow map: an orthographic box over the near track; the crab stays at z=0 so it never moves
    const sm = this.renderer.gl.shadowMap;
    sm.enabled = true;
    sm.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    // 'up' along the track so top/bottom span its length
    sc.up.set(0, 0, -1);
    sc.left = -9; sc.right = 9; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(0, 0, -16);
    scene.add(this.sun, this.sun.target);
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(16, 50), this.catcherMat);
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.position.set(0, 0.02, -16);
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = 1;
    this.world.add(this.catcher);

    this.applyDetail(quality);
    this.renderer.camera.far = 260;
    this.renderer.camera.updateProjectionMatrix();
    this.applyPalette(0);
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
  }

  setSkin(skin: CrabSkin, hat?: HatKind, dye = 0): void {
    this.crab.setSkin(skin, hat ?? skin.hat, dye);
  }

  /** Wardrobe: running trail and victory dance */
  setTrail(kind: TrailKind): void {
    this.trailKind = kind;
    this.trail.clear();
    this.trail.mesh.visible = kind !== 'sand';
    if (kind === 'sand') return;
    let tex = this.trailTex.get(kind);
    if (!tex) {
      tex = makeTrailTex(kind);
      this.trailTex.set(kind, tex);
    }
    const m = this.trail.mesh.material as THREE.MeshBasicMaterial;
    m.map = tex;
    const additive = kind === 'sparkles';
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.trail.shrinkFade = !additive;
    m.needsUpdate = true;
  }

  /** Start the boot cinematic; `onCue` gets 'spray', 'logo', 'crab', 'wave', 'ui' and 'done'. */
  startCinematic(onCue: (name: string) => void): void {
    this.cineT = 0;
    this.cineCue = onCue;
  }

  /** Jump to the end of the cinematic (fires the cues it skips). */
  skipCinematic(): void {
    if (this.cineT < 0) return;
    const prev = this.cineT;
    this.cineT = CINE_LEN;
    for (const c of cues(CINE_CUES, prev, CINE_LEN + 1)) this.cineCue?.(c);
    this.cineT = -1;
  }

  /** jump to time `t` (screenshots), firing the cues on the way */
  seekCinematic(t: number): void {
    if (this.cineT < 0) return;
    const prev = this.cineT;
    this.cineT = Math.min(t, CINE_LEN - 0.01);
    for (const c of cues(CINE_CUES, prev, this.cineT)) if (c !== 'spray' && c !== 'crab') this.cineCue?.(c);
  }

  get cinematicPlaying(): boolean {
    return this.cineT >= 0;
  }

  /** local hour (0..24) → the Home sky: morning and noon as usual, golden hour, a starry night */
  setHomeHour(h: number): void {
    const ramp = (a: number, b: number, x: number): number => Math.max(0, Math.min(1, (x - a) / (b - a)));
    this.homeGolden = h >= 12 ? ramp(16.5, 18, h) * (1 - ramp(19.5, 20.5, h)) : 0;
    this.homeNight = Math.max(ramp(19.5, 21, h), 1 - ramp(5, 6.5, h)) * 0.85;
  }

  /** a gentle camera drift with the mouse on Home (-1..1) */
  setParallax(x: number, y: number): void {
    this.parX = x;
    this.parY = y;
  }


  setDance(id: string): void {
    this.crab.dance = id;
  }

  /** one trail particle behind the crab (x in lane space, wz on the track) */
  private spawnTrail(px: number, py: number, dist: number): void {
    const r = Math.random;
    switch (this.trailKind) {
      case 'bubbles':
        this.trail.spawn(px + (r() - 0.5) * 0.9, py + 0.25 + r() * 0.3, dist - 0.4, (r() - 0.5) * 0.4, 0.9 + r() * 0.6, 0, 1.1, 0.18 + r() * 0.16, 0xd8f4ff, -0.3, 0.3);
        break;
      case 'petals': {
        const col = r() < 0.5 ? 0xff9ccf : r() < 0.5 ? 0xffd1e6 : 0xffffff;
        this.trail.spawn(px + (r() - 0.5) * 1.0, py + 0.5 + r() * 0.4, dist - 0.3, (r() - 0.5) * 1.6, 0.6 + r() * 0.5, 0, 1.3, 0.2 + r() * 0.08, col, 1.1, 0);
        break;
      }
      case 'sparkles': {
        const col = r() < 0.6 ? 0xfff2a0 : 0xffffff;
        this.trail.spawn(px + (r() - 0.5) * 1.1, py + 0.2 + r() * 0.7, dist - 0.3, (r() - 0.5) * 0.6, 0.3 + r() * 0.6, 0, 0.7, 0.16 + r() * 0.16, col, 0, -0.6);
        break;
      }
      case 'notes': {
        const cols = [0x6a4cff, 0xff4f9a, 0x2fb7ff, 0x34c46a];
        this.trail.spawn(px + (r() - 0.5) * 0.8, py + 0.6 + r() * 0.3, dist - 0.3, (r() - 0.5) * 1.2, 1.1 + r() * 0.5, 0, 1.2, 0.26 + r() * 0.08, cols[(r() * 4) | 0] as number, 0.2, 0.2);
        break;
      }
      case 'rainbow': {
        // a ribbon of colour bands: each puff steps around the hue wheel
        this.trailHue = (this.trailHue + 0.06) % 1;
        this.trail.spawn(px + (r() - 0.5) * 0.2, py + 0.22, dist - 0.35, 0, 0.1, 0, 0.75, 0.34, hsl(this.trailHue), 0, -0.2);
        break;
      }
      default:
        break;
    }
  }

  /** Low tier trims optional meshes to stay inside its draw-call budget. */
  private applyDetail(q: QualityPreset): void {
    const full = q.name !== 'low';
    this.shadowMap = q.name === 'high';
    this.sun.castShadow = this.shadowMap;
    this.catcher.visible = this.shadowMap;
    this.entities.castShadows = this.shadowMap;
    this.mats.setLite(!full);
    this.scenery.glowOn = full;
    this.backdrop.setDetail(full);
    this.entities.lite = !full;
    this.entities.setOutlines(full);
    this.crab.setDetail(full);
    this.feet.mesh.visible = full;
    this.shells.sparkle.visible = full;
    this.life.lite = !full;
    this.life.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.maxDpr));
  }

  setQuality(q: QualityPreset): void {
    this.applyDetail(q);
    this.renderer.setQuality(q);
    this.ocean.setQualityWaves(q.oceanWaves);
    this.scenery.setDensity(q.sceneryDensity);
    this.dust.limit = Math.floor(q.maxParticles * 0.6);
    this.sparks.limit = Math.floor(q.maxParticles * 0.6);
    this.trail.limit = Math.floor(q.maxParticles * 0.4);
  }

  resize(w: number, h: number): void {
    this.renderer.resize(w, h);
  }

  /** Clear transient visuals for a new run. */
  resetRun(best: number): void {
    this.entities.clear();
    this.dust.clear();
    this.feet.clear();
    this.footT = 0;
    this.life.reset(0);
    this.sparks.clear();
    this.trail.clear();
    this.entities.setBest(best);
    this.crab.reset();
    this.celebrating = false;
    this.trauma = 0;
    this.fovPunch.snap(0);
    this.slamFx.reset();
    this.camDip.snap(0);
  }

  /**
   * Great Wave chase: the wave sits behind the crab at a distance mapped from the sim's gap, so it
   * looms into the bottom of the screen as it closes in, with spray off its lip.
   */
  private updateChase(w: World, dt: number): void {
    const gap = w.kind === 'level' && w.mode !== 'idle' ? w.chaseGap : null;
    if (gap === null) {
      if (this.chaseWave) this.chaseWave.visible = false;
      return;
    }
    if (!this.chaseWave) {
      this.chaseWave = new THREE.Mesh(greatWave(), this.mats.gloss);
      this.chaseWave.frustumCulled = false;
      this.world.add(this.chaseWave);
    }
    const cw = this.chaseWave;
    cw.visible = true;
    // close gap → the wave sits right behind the crab. Its crest height is solved each frame so the
    // lip projects just below the crab's feet on screen: it looms, but never hides the crab.
    const z = 2.6 + gap * 0.3;
    const lipZ = z - 1.36;
    const V = this.renderer.camera.matrixWorldInverse.elements;
    const px = this.crab.root.position.x;
    // view-space y/z of a world point (x, y, zz): rows 1 and 2 of the view matrix
    const vy = (x: number, y: number, zz: number): number => V[1]! * x + V[5]! * y + V[9]! * zz + V[13]!;
    const vz = (x: number, y: number, zz: number): number => V[2]! * x + V[6]! * y + V[10]! * zz + V[14]!;
    const feetT = vy(px, 0, 0) / -vz(px, 0, 0) - 0.04;
    const ay = vy(0, 0, lipZ);
    const az = vz(0, 0, lipZ);
    const by = V[5] as number;
    const bz = V[6] as number;
    const denom = by + feetT * bz;
    const crest = Math.min(5, Math.max(0.6, Math.abs(denom) > 1e-4 ? (-feetT * az - ay) / denom : 1));
    cw.position.set(0, -0.15 + Math.sin(this.time * 2.2) * 0.06, z);
    cw.scale.set(1, crest * (1 + Math.sin(this.time * 3.1) * 0.03), 1);
    if (!this.reduceMotion && Math.random() < dt * (14 - Math.min(12, gap * 0.6))) {
      this.dust.spawn((Math.random() - 0.5) * 12, crest * 0.95, w.dist - lipZ, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, -2.5, 0.6, 0.3, 0xf2fbff, 6, 0.8);
    }
  }

  /** Compile every shader program in the scene up front (loader step). */
  async precompile(): Promise<void> {
    const r = this.renderer;
    try {
      await r.gl.compileAsync(r.scene, r.camera);
    } catch {
      r.gl.compile(r.scene, r.camera);
    }
  }

  /** Results after a new best: the crab gets up and celebrates instead of lying dizzy. */
  celebrateResults(): void {
    this.celebrating = true;
    this.crab.reset();
    this.crab.celebrate();
  }
  private celebrating = false;
  /** crab yaw: 0 faces the camera (menus, celebrations), π faces down the beach on the run */
  private facing = 0;
  /** -1 while the crab faces away: the model's left/right are the screen's right/left */
  private faceSign = 1;

  shake(amp: number, t: number): void {
    if (this.reduceMotion) return;
    // old (amp, seconds) calls map onto trauma: bigger hits add more
    this.trauma = Math.min(1, this.trauma + amp * 2.4 + t * 0.4);
  }

  private applyPalette(dist: number): void {
    const z = zoneAt(dist);
    const t = zoneBlend(dist, z);
    if (z === 0) lerpPalette(this.palette, ZONE_PALETTES[0]!, ZONE_PALETTES[0]!, 0);
    else lerpPalette(this.palette, ZONE_PALETTES[z - 1]!, ZONE_PALETTES[z]!, t);
    if (this.menuLook && this.homeGolden > 0) lerpPalette(this.palette, this.palette, ZONE_PALETTES[3]!, this.homeGolden * 0.8);
    this.night = Math.max(this.nightForce, this.menuLook ? this.homeNight : 0, Math.min(1, (dist - CFG.nightStart) / (CFG.nightFull - CFG.nightStart)));
    if (this.night > 0) lerpPalette(this.palette, this.palette, NIGHT_PALETTE, this.night * this.night * (3 - 2 * this.night));
    this.sky.apply(this.palette);
    this.mats.lighting.fromPalette(this.palette);
    const sd = this.mats.lighting.sunDir;
    // shadows come from higher than the key light so they stay compact under objects
    this.sun.position.set(sd.x * 14, 26, -16 + 6);
    this.catcherMat.color.copy(this.palette.lightShadow).multiplyScalar(0.35);
    this.shadows.setSun(sd.x, sd.z);
    const fog = this.renderer.scene.fog as THREE.Fog;
    fog.color.copy(this.palette.fog);
  }

  /** Crab Cup: rival crabs and their name tags (created once, reused for every race). */
  ensureRivals(uiRoot: HTMLElement): Rivals {
    if (!this.rivals) {
      this.rivals = new Rivals(this.mats, uiRoot);
      this.world.add(this.rivals.group);
    }
    return this.rivals;
  }

  /** Feed sim events into effects. */
  onEvents(events: readonly GameEvent[], w: World): void {
    const p = w.player;
    for (const ev of events) {
      switch (ev.t) {
        case 'shell':
          if (ev.big) this.crab.happy();
          this.shells.addPop(ev.x, ev.y + 0.15, ev.big, this.time);
          for (let i = 0, n = (ev.big ? 12 : 5) >> (this.renderer.quality.name === 'low' ? 1 : 0); i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 1.2 + Math.random() * 1.8;
            // player-relative (local) so the burst stays with the crab instead of streaming at the camera
            this.sparks.spawn(ev.x + Math.cos(a) * 0.4, ev.y + 0.7, -0.2, Math.cos(a) * sp, 2.5 + Math.random() * 2, -0.5, 0.35 + Math.random() * 0.15, ev.big ? 0.3 : 0.18, ev.big ? 0xfff0a0 : 0xffd84a, 6, 0, true);
          }
          break;
        case 'laneChange':
          this.crab.lane(ev.dir * this.faceSign);
          this.puff(p.x - ev.dir * 0.5, w.dist, 4, 0.35);
          break;
        case 'hop':
          this.crab.hop();
          if (!this.reduceMotion) this.fovPunch.impulse(30);
          this.puff(p.x, w.dist, 6, 0.4);
          break;
        case 'land':
          this.crab.land(ev.hard);
          if (!this.reduceMotion) this.camDip.impulse(ev.hard ? -3.4 : -1.1);
          this.puff(p.x, w.dist, ev.hard ? 18 : 8, ev.hard ? 0.7 : 0.4);
          if (ev.hard) {
            // Sand Slam: shockwave, crater, a fountain of sand and a camera punch
            this.slamFx.spawn(p.x, w.dist);
            this.shake(0.2, 0.22);
            if (!this.reduceMotion) this.fovPunch.impulse(-38);
            const n = this.renderer.quality.name === 'low' ? 10 : 22;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
              const sp = 3 + Math.random() * 3;
              this.sparks.spawn(p.x + Math.cos(a) * 0.4, 0.15, w.dist + Math.sin(a) * 0.4, Math.cos(a) * sp, 3 + Math.random() * 3.5, Math.sin(a) * sp, 0.55 + Math.random() * 0.25, 0.16 + Math.random() * 0.1, i % 3 === 0 ? 0xfff2c8 : 0xe9c37e, 14);
            }
          }
          break;
        case 'slam':
          this.crab.slam();
          break;
        case 'bump':
          this.crab.bump();
          this.shake(0.14, 0.2);
          for (let i = 0; i < 6; i++) this.sparks.spawn(ev.x, 0.7, w.dist, (Math.random() - 0.5) * 4, Math.random() * 3, 0, 0.3, 0.22, 0xffffff, 6);
          break;
        case 'crash':
          this.shake(0.38, 0.35);
          this.puff(p.x, w.dist, 16, 0.7);
          for (let i = 0; i < 10; i++) this.sparks.spawn(p.x, 0.8, w.dist, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 3, 0.5, 0.3, 0xffe14a, 8);
          break;
        case 'stumble':
          // Crab Cup: a hit trips the crab instead of ending the run
          this.crab.bump();
          this.shake(0.26, 0.28);
          this.puff(p.x, w.dist, 10, 0.55);
          for (let i = 0; i < 8; i++) this.sparks.spawn(p.x, 0.8, w.dist, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.4, 0.26, 0xffe14a, 7);
          break;
        case 'dash':
          this.crab.happy();
          this.shake(0.1, 0.2);
          for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2;
            this.sparks.spawn(p.x + Math.cos(a) * 0.5, 0.6, w.dist + Math.sin(a) * 0.5, Math.cos(a) * 5, 1.2, Math.sin(a) * 5, 0.5, 0.32, 0xffd23a, 2);
          }
          break;
        case 'ring':
          this.crab.happy();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            this.sparks.spawn(ev.x + Math.cos(a) * 0.8, ev.y + Math.sin(a) * 0.8, w.dist, Math.cos(a) * 2, Math.sin(a) * 2 + 1, 0, 0.5, 0.25, i % 2 ? 0xfff0a0 : 0xffffff, 2);
          }
          break;
        case 'closeShave':
          // the obstacle was in the lane just left behind
          this.crab.flinch(Math.sign(p.prevLane - p.lane) * this.faceSign);
          for (let i = 0; i < 8; i++) this.sparks.spawn(p.x + (Math.random() - 0.5), 0.4 + Math.random() * 0.8, w.dist, 0, 0, 6 + Math.random() * 4, 0.25, 0.18, 0xffffff, 0, 2);
          break;
        case 'powerup':
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            this.sparks.spawn(p.x + Math.cos(a) * 0.4, 0.7, w.dist + Math.sin(a) * 0.4, Math.cos(a) * 4, 1.5, Math.sin(a) * 4, 0.45, 0.3, POWER_COLORS[ev.kind], 2);
          }
          break;
        case 'powerupEnd':
          if (ev.popped) {
            this.shake(0.12, 0.15);
            for (let i = 0; i < 16; i++) {
              const a = Math.random() * Math.PI * 2;
              this.sparks.spawn(p.x, 0.7, w.dist, Math.cos(a) * 5, Math.sin(a) * 4 + 1, (Math.random() - 0.5) * 4, 0.4, 0.25, 0xbff0ff, 4);
            }
          }
          break;
        case 'waveHopped':
          for (let i = 0; i < 10; i++) this.dust.spawn(p.x + (Math.random() - 0.5) * 1.6, 0.3, w.dist - 0.5, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, 0, 0.45, 0.35, 0xe8fbff, 9, 0.5);
          break;
        case 'newBest':
          if (this.reduceMotion) break;
          for (let i = 0; i < 40; i++) {
            const cols = [0xff5a4a, 0xffd23a, 0x3fd6d0, 0x6f8bff, 0xff7ad0];
            this.sparks.spawn((Math.random() - 0.5) * 6, 3 + Math.random() * 2, w.dist + 6 + Math.random() * 8, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, 0, 1.2, 0.25, cols[i % 5] as number, 4);
          }
          break;
        case 'knock': {
          const k = this.entities.knock(ev.id, w.dist);
          if (!k || this.reduceMotion) break;
          // a crumble burst: sand chunks for castles, splinters for crates and logs, spray for waves
          const col = k.key.startsWith('sweep') ? 0xeaffff : /block:1|low:1|crate|log/.test(k.key) ? 0xb07a42 : 0xf0cf8e;
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 2 + Math.random() * 3;
            this.dust.spawn(k.x + Math.cos(a) * 0.5, 0.4 + Math.random() * 1.2, k.wz, Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp * 0.5, 0.7 + Math.random() * 0.3, 0.22 + Math.random() * 0.18, col, 14, -0.3);
          }
          break;
        }
        // ---- Island Hop
        case 'dollar':
          this.shake(0.05, 0.08);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            this.sparks.spawn(ev.x, ev.y + 0.2, -0.2, Math.cos(a) * 3, Math.sin(a) * 3 + 2, -0.5, 0.5, 0.3, i % 2 ? 0xffd23a : 0xffffff, 3, 0, true);
          }
          break;
        case 'hourglass':
          for (let i = 0; i < 14; i++) this.sparks.spawn(p.x + (Math.random() - 0.5), 0.8 + Math.random(), -0.2, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, 2, 0.5, 0.25, 0xbfeaff, 4, 0, true);
          break;
        case 'pad':
          this.crab.hop();
          this.puff(p.x, w.dist, 10, 0.5);
          if (!this.reduceMotion) this.fovPunch.impulse(45);
          break;
        case 'tidepool':
          for (let i = 0; i < 12; i++) this.dust.spawn(p.x + (Math.random() - 0.5) * 1.2, 0.15, w.dist - 0.2, (Math.random() - 0.5) * 3, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.5, 0.3, 0xcff6ff, 9, 0.6);
          break;
        case 'finish':
          this.crab.celebrate();
          for (let i = 0; i < 50; i++) {
            const cols = [0xff5a4a, 0xffd23a, 0x3fd6d0, 0x6f8bff, 0xff7ad0];
            this.sparks.spawn((Math.random() - 0.5) * 7, 4 + Math.random() * 2, w.dist + 2 + Math.random() * 6, (Math.random() - 0.5) * 4, 1 + Math.random() * 3, 0, 1.4, 0.26, cols[i % 5] as number, 3);
          }
          break;
        default:
          break;
      }
    }
  }

  private puff(x: number, wz: number, n: number, size: number): void {
    const col = this.crab.skin.dust;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.spawn(x + Math.cos(a) * 0.3, 0.1, wz + Math.sin(a) * 0.3, Math.cos(a) * 1.5, 0.6 + Math.random() * 0.8, Math.sin(a) * 1.5, 0.45 + Math.random() * 0.2, size, col, 1.2, 1.4);
    }
  }

  /**
   * Draw a frame. `alpha` interpolates between sim steps; `introT` (0..1) blends title → run camera.
   */
  frame(w: World, alpha: number, dt: number, mode: CamMode, introT = 1): void {
    this.time += dt;
    this.menuLook = mode === 'title' || mode === 'shop' || mode === 'map';
    if (this.cineT >= 0) {
      const prev = this.cineT;
      this.cineT += dt;
      for (const c of cues(CINE_CUES, prev, this.cineT)) {
        if (c === 'spray') for (let i = 0; i < 40; i++) this.sparks.spawn(14 + (Math.random() - 0.5) * 8, 0.5 + Math.random() * 2, w.dist + 16 + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3, 0.9, 0.5, 0xeaffff, 6, 0.6);
        if (c === 'crab') {
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            this.dust.spawn(Math.cos(a) * 0.4, 0.2, w.dist + Math.sin(a) * 0.4, Math.cos(a) * (2 + Math.random() * 2), 3 + Math.random() * 3, Math.sin(a) * (2 + Math.random() * 2), 0.8, 0.5, 0xf2d8a0, 9, 1.2);
          }
          this.shake(0.12, 0.2);
        }
        this.cineCue?.(c);
      }
      if (this.cineT >= CINE_LEN) {
        this.cineT = -1;
        this.cineCue?.('done');
      }
    }
    const running = w.mode !== 'idle' && mode !== 'title' && mode !== 'shop' && mode !== 'map';
    const dist = running ? w.prevDist + (w.dist - w.prevDist) * alpha : w.dist;
    const p = w.player;
    const px = running ? p.prevX + (p.x - p.prevX) * alpha : 0;
    const py = running ? p.prevY + (p.y - p.prevY) * alpha : 0;

    // palette & environment
    this.applyPalette(dist);
    const zone = zoneAt(dist);
    if (zone !== this.lastZone) this.lastZone = zone;
    const q = this.renderer.quality;
    const fogNear = q.fogFar * 0.5;
    this.ocean.update(this.time, dist, this.palette, fogNear, q.fogFar);
    const fog = this.renderer.scene.fog as THREE.Fog;
    fog.near = fogNear;
    fog.far = q.fogFar;
    this.backdrop.update(this.time, zone, this.palette);
    this.scenery.update(dist, this.palette.groundTint, q.fogFar + 4);
    this.scenery.glowFlicker(this.time);

    // entities & shells
    this.shadows.begin();
    if (running || mode === 'title' || mode === 'map') {
      this.entities.group.visible = true;
      this.entities.sync(w.entities, dist, this.time, dt, this.shadows);
    }
    this.shells.update(running ? w.shells : [], dist, this.time, this.renderer.camera.quaternion, q.fogFar + 5);

    // crab
    const crashT = w.mode === 'crashing' ? w.crashT : -1;
    const speed = running ? w.speed : 0;
    const dv = this.drive;
    dv.running = running && mode === 'run' && w.mode !== 'idle' && w.mode !== 'finished';
    dv.grounded = !running || p.grounded;
    dv.vy = running ? p.vy : 0;
    // on the run the crab scuttles away from the camera; it turns back to face us for menus and dances
    const away = running && (mode === 'run' || mode === 'intro') && !this.celebrating;
    this.faceSign = away ? -1 : 1;
    this.facing += ((away ? Math.PI : 0) - this.facing) * (1 - Math.exp(-dt * 9));
    if (Math.abs(this.facing - (away ? Math.PI : 0)) < 1e-3) this.facing = away ? Math.PI : 0;
    dv.vx = running ? p.vx * this.faceSign : 0;
    dv.speed = speed;
    dv.crashT = this.celebrating ? -1 : crashT;
    if (this.celebrating) dv.running = false;
    dv.rider = running && w.power.kind === 'rider';
    dv.magnet = running && w.power.kind === 'magnet';
    dv.shield = running && w.power.kind === 'shield';
    // on Home the crab stands on the diorama mound; it scuttles off as the run starts
    this.homeSet.visible = dist < 30 && (mode === 'title' || mode === 'intro' || mode === 'shop' || mode === 'map' || (running && dist < 30));
    this.homeSet.position.set(0, 0, dist);
    const onMound = Math.max(0, 1 - dist / 1.4);
    this.crab.root.position.set(px, py + onMound * onMound * 0.22, 0);
    this.crab.root.rotation.y = mode === 'shop' ? this.shopSpin : this.facing;
    // a little hop while it turns round
    if (mode !== 'shop') this.crab.root.position.y += Math.sin(this.facing) * 0.18;
    if (this.cineT >= 0) {
      // the crab waits under the sand, then bursts out spinning and lands
      const b = Math.max(0, Math.min(1, (this.cineT - CINE_CRAB) / 0.55));
      const back = 1 + 2.70158 * Math.pow(b - 1, 3) + 1.70158 * Math.pow(b - 1, 2);
      this.crab.root.position.y += -1.45 + 1.45 * back + Math.sin(b * Math.PI) * 0.9;
      this.crab.root.rotation.y = (1 - b) * Math.PI * 2;
      this.crab.root.visible = b > 0;
    }
    const blink = running && p.invuln > 0 && w.mode === 'running' ? Math.floor(this.time * 16) % 2 === 0 : false;
    this.crab.root.visible = !blink;
    this.crab.update(dt, dv);
    this.rivals?.update(dt, dist, px, this.renderer.camera, running && this.rivals.active);
    this.slamFx.update(dt, dist);
    // Shell Dash and Shell Fever: a golden trail
    if (running && (w.dashT > 0 || w.feverT > 0) && dt > 0 && Math.random() < 0.8) this.sparks.spawn(px + (Math.random() - 0.5) * 0.9, 0.25 + Math.random() * 0.6, dist - 0.4, 0, 0.6, 0, 0.35, 0.2, 0xffd23a, 1);
    // shadow under the crab shrinks as it rises
    const sh = 1 / (1 + py * 0.5);
    if (!this.shadowMap) this.shadows.add(px, 0, 0, 1.7 * sh, 1.3 * sh, py);
    this.shadows.end();

    // power-up visuals
    const pk = running ? w.power.kind : null;
    this.shieldMesh.visible = pk === 'shield' && (w.power.t > 2 || Math.floor(this.time * 8) % 2 === 0);
    if (this.shieldMesh.visible) this.shieldMesh.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
    this.magnetRing.visible = pk === 'magnet';
    if (this.magnetRing.visible) {
      this.magnetRing.rotation.z = this.time * 3;
      this.magnetRing.scale.setScalar(1 + Math.sin(this.time * 8) * 0.08);
    }
    this.boardGroup.visible = pk === 'rider';
    if (pk === 'rider') {
      this.boardGroup.rotation.z = Math.sin(this.time * 3) * 0.06;
      if (Math.random() < 0.6) this.dust.spawn(px + (Math.random() - 0.5) * 1.5, 0.3, dist - 0.8, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, 4, 0.4, 0.4, 0xe8fbff, 8, 0.6);
    }

    // running dust
    if (running && w.mode === 'running' && p.grounded && pk !== 'rider') {
      if (dist - this.footT > 0.7 && zone !== 1 && this.feet.mesh.visible) {
        this.footT = dist;
        this.feet.stamp(px, dist);
      }
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.07;
        this.dust.spawn(px + (Math.random() - 0.5) * 0.8, 0.08, dist - 0.3, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.5, 0, 0.4, 0.28, this.crab.skin.dust, 0.5, 1.6);
      }
      // speed streaks along the berms at high speed
      if (speed > 16 && Math.random() < (speed - 16) * 0.08 && !this.reduceMotion) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.dust.spawn(side * (2.5 + Math.random() * 2), 0.2 + Math.random() * 0.4, dist + 25 + Math.random() * 20, 0, 0, 0, 0.6, 0.18, 0xffffff, 0, 0);
      }
    }
    // Wardrobe trail (also in the air, so hops leave an arc)
    const trailing = running && w.mode === 'running' && pk !== 'rider';
    if (this.trailKind !== 'sand' && (trailing || mode === 'shop')) {
      this.trailT -= dt;
      const every = this.trailKind === 'rainbow' ? 0.03 : 0.06;
      while (this.trailT <= 0) {
        this.trailT += every;
        // Wardrobe preview: the trail circles the turntable
        if (trailing) this.spawnTrail(px, py, dist);
        else this.spawnTrail(Math.sin(this.time * 2.4) * 1.2, 0, dist - Math.cos(this.time * 2.4) * 1.2 + 0.3);
      }
    }

    // camera
    const cam = this.renderer.camera;
    this.fovPunch.update(dt);
    this.camDip.update(dt);
    this.renderer.setFovBoost(running ? Math.min(1, Math.max(0, (speed - 10) / 14)) : 0, (pk === 'rider' ? 4 : 0) + this.fovPunch.value * 0.12);
    this.camX.target = running ? px : 0;
    if (this.reduceMotion) this.camX.snap(this.camX.target);
    const camX = this.camX.update(dt);
    const d = this.renderer.fitDist;
    const el = CAMERA_ELEVATION;
    const runPos = this.vRunPos.set(camX * 0.4, 0.5 + Math.sin(el) * d + this.camDip.value * 0.12, Math.cos(el) * d);
    const runLook = this.vRunLook.set(camX * 0.6, CFG.camera.lookY + this.camDip.value * 0.06, -CFG.camera.lookAhead);
    if (crashT >= 0 && mode === 'run' && !this.reduceMotion) {
      // after a crash the camera swings slowly around to the side, closer to the crab
      const k = Math.min(1, crashT / 1.4);
      const e = k * k * (3 - 2 * k);
      const a = 0.55 + crashT * 0.06;
      this.vOrbit.set(px + Math.sin(a) * 5.2, 2.6, Math.cos(a) * 5.2);
      this.vOrbitLook.set(px, 0.5, 0);
      runPos.lerp(this.vOrbit, e * 0.85);
      runLook.lerp(this.vOrbitLook, e * 0.85);
    }
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (mode === 'title' || mode === 'intro') {
      this.titleSpin += dt;
      const aspect = cam.aspect;
      const portrait = aspect < 1;
      const r = portrait ? 6.2 : 4.4;
      const a = Math.sin(this.titleSpin * 0.18) * 0.35 + 0.28;
      const titlePos = this.vTitlePos.set(Math.sin(a) * r + this.parX * 0.35, (portrait ? 2.1 : 1.7) + this.parY * 0.2, Math.cos(a) * r);
      // landscape phones: aim right of the crab so it sits in the left half, clear of the mode cards
      const lx = portrait || window.innerHeight >= 480 ? -0.3 : 0.9 + Math.min(0.9, Math.max(0, aspect - 1.4) * 0.8);
      // portrait: Home stacks the hero card and mode tiles in the lower half, so the crab is framed in
      // the upper-middle band (looking below it lifts it up the screen)
      const titleLook = this.vTitleLook.set(lx, portrait ? (aspect > 0.52 ? -2.1 : -1.25) : 1.3, -3);
      if (mode === 'title') {
        pos = titlePos;
        look = titleLook;
      } else {
        const e = introT * introT * (3 - 2 * introT);
        pos = titlePos.lerp(runPos, e);
        look = titleLook.lerp(runLook, e);
      }
    } else if (mode === 'map') {
      // Island Hop: the camera rises and looks out over the ocean toward the islands
      pos = this.vTitlePos.set(3.5, 6.5, 8);
      look = this.vTitleLook.set(16, 0.5, -26);
    } else if (mode === 'shop') {
      const portrait = cam.aspect < 1;
      // portrait: the Wardrobe panel fills the lower ~60%, so the crab is framed in the top band
      // (looking below it lifts it up the screen); landscape phones: the panel takes half the
      // screen, so the crab moves further left
      const phone = portrait && cam.aspect < 0.7;
      pos = this.vTitlePos.set(0, portrait ? (phone ? 2.3 : 2.0) : 1.9, portrait ? (phone ? 5.2 : 4.6) : 5.4);
      look = this.vTitleLook.set(portrait ? 0 : window.innerHeight < 480 ? 2.9 : 1.5, portrait ? (phone ? -1.35 : -0.25) : 0.75, 0);
    } else {
      pos = runPos;
      look = runLook;
    }
    if (this.cineT >= 0 && mode === 'title') {
      // fly in over the ocean, along the shore, down to the crab, then settle on the Home view
      const t = this.cineT;
      const v = sample(CINE_CAM, t, this.cineV);
      const k = Math.max(0, Math.min(1, (t - CINE_SETTLE) / (CINE_LEN - CINE_SETTLE)));
      const e = k * k * (3 - 2 * k);
      this.camPos.set(v[0] as number, v[1] as number, v[2] as number).lerp(pos, e);
      this.camLook.set(v[3] as number, v[4] as number, v[5] as number).lerp(look, e);
      this.menuCamInit = true;
    } else if ((mode === 'title' || mode === 'shop' || mode === 'map') && this.menuCamInit && !this.reduceMotion && this.smoothMenuCam) {
      // menu screens glide between their cameras instead of cutting
      const f = Math.min(1, dt * 5);
      this.camPos.lerp(pos, f);
      this.camLook.lerp(look, f);
    } else {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.menuCamInit = mode === 'title' || mode === 'shop' || mode === 'map';
    }
    if (this.trauma > 0) {
      // smooth noise-like shake (sums of sines) scaled by trauma²
      const sh = this.trauma * this.trauma * 0.45;
      const t = this.time * 31;
      this.camPos.x += (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.1) * 0.4) * sh;
      this.camPos.y += (Math.sin(t * 1.7 + 2.3) * 0.6 + Math.sin(t * 3.1) * 0.4) * sh;
      this.camLook.x += Math.sin(t * 0.9 + 4.0) * sh * 0.5;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }
    if (this.debugCam) {
      // test hook: a fixed close-up relative to the crab (animation strips)
      const r = this.crab.root.position;
      this.camPos.set(r.x + this.debugCam.x, this.debugCam.y, this.debugCam.z);
      this.camLook.set(r.x, 0.6, 0);
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.updateMatrixWorld();
    this.mats.lighting.update(cam);
    this.mats.lighting.uniforms.uTime.value = this.time;
    this.sky.mesh.position.copy(cam.position);
    this.sky.stars.position.copy(cam.position);
    this.sky.update(this.time, this.night, this.renderer.quality.name !== 'low');
    this.ocean.mesh.position.x = 0;

    if (this.feet.mesh.visible) this.feet.update(dt, dist);
    this.life.update(dt, this.time, dist, zone, this.night);
    this.updateChase(w, dt);
    this.dust.update(dt, dist, cam.quaternion);
    this.sparks.update(dt, dist, cam.quaternion);
    if (this.trail.mesh.visible) this.trail.update(dt, dist, cam.quaternion);
    this.renderer.render();
  }

  private vScreen = new THREE.Vector3();
  /** Project a crab-local point (x, y, z in the world group) to CSS pixels; returns a shared vector. */
  toScreen(x: number, y: number, z: number): THREE.Vector3 {
    const v = this.vScreen.set(x, y, z).project(this.renderer.camera);
    const c = this.renderer.gl.domElement.getBoundingClientRect();
    v.set(c.left + (v.x * 0.5 + 0.5) * c.width, c.top + (0.5 - v.y * 0.5) * c.height, 0);
    return v;
  }

  get toyLighting(): ToyLighting {
    return this.mats.lighting;
  }

  /** Compile and render every toy variant into a tiny target; reports shader compile/link problems. */
  shaderCheck(): { name: string; ok: boolean; log: string }[] {
    const gl = this.renderer.gl;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 10, 50);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    cam.position.set(0, 0, 4);
    cam.updateMatrixWorld();
    this.toyLighting.fromPalette(ZONE_PALETTES[3]!);
    this.toyLighting.update(cam);
    const geo = new THREE.SphereGeometry(1, 12, 8);
    const col = new Float32Array(geo.attributes.position!.count * 3).fill(0.8);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const variants = toyVariants(this.toyLighting, sandTexture(false));
    const rt = new THREE.WebGLRenderTarget(16, 16);
    const out: { name: string; ok: boolean; log: string }[] = [];
    for (const [name, mat] of Object.entries(variants)) {
      for (const instanced of [false, true]) {
        scene.clear();
        const mesh = instanced ? new THREE.InstancedMesh(geo, mat, 2) : new THREE.Mesh(geo, mat);
        if (mesh instanceof THREE.InstancedMesh) {
          mesh.setMatrixAt(0, new THREE.Matrix4());
          mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0));
        }
        scene.add(mesh);
        const before = gl.info.programs?.length ?? 0;
        gl.setRenderTarget(rt);
        gl.render(scene, cam);
        gl.setRenderTarget(null);
        const progs = (gl.info.programs ?? []) as { diagnostics?: { runnable: boolean; programLog: string; fragmentShader: { log: string }; vertexShader: { log: string } } }[];
        const bad = progs.find((p) => p.diagnostics && !p.diagnostics.runnable);
        out.push({ name: `${name}${instanced ? '+instanced' : ''}`, ok: !bad, log: bad?.diagnostics ? `${bad.diagnostics.programLog} ${bad.diagnostics.vertexShader.log} ${bad.diagnostics.fragmentShader.log}`.trim() : '' });
        void before;
      }
    }
    for (const m of Object.values(variants)) m.dispose();
    geo.dispose();
    rt.dispose();
    return out;
  }

  get skins(): CrabSkin[] {
    return CRAB_SKINS;
  }

  /** Portraits of every v1 crab skin (kept for the v1 shop flow and tests). */
  renderCrabThumbs(size = 192): Promise<string[]> {
    return this.renderThumbs(CRAB_SKINS.map((skin) => ({ skin, hat: skin.hat })), size);
  }

  /** Wardrobe portraits: every body with its own hat, then every hat on Sandy (framed on the head). */
  async renderWardrobeThumbs(hats: readonly HatKind[], size = 160): Promise<{ bodies: Record<string, string>; hats: Record<string, string> }> {
    const b = await this.renderThumbs(BODY_SKINS.map((skin) => ({ skin, hat: skin.hat })), size);
    const sandy = CRAB_SKINS[0] as CrabSkin;
    const h = await this.renderThumbs(hats.map((hat) => ({ skin: sandy, hat })), size, true);
    return {
      bodies: Object.fromEntries(BODY_SKINS.map((k, i) => [k.id, b[i] as string])),
      hats: Object.fromEntries(hats.map((k, i) => [k, h[i] as string])),
    };
  }


  /** Portraits of arbitrary geometries (model review: scripts/models.mjs), framed on their bounding box. */
  async renderGeoThumbs(items: { id: string; geo: () => THREE.BufferGeometry; mat?: THREE.Material; yaw?: number }[], size = 128): Promise<Record<string, string>> {
    const gl = this.renderer.gl;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const px = new Uint8Array(size * size * 4);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(size, size);
    const prevColor = new THREE.Color();
    gl.getClearColor(prevColor);
    const prevAlpha = gl.getClearAlpha();
    const out: Record<string, string> = {};
    const box = new THREE.Box3();
    const ctr = new THREE.Vector3();
    const sz = new THREE.Vector3();
    for (const it of items) {
      const id = it.id;
      const geo = it.geo();
      const m = new THREE.Mesh(geo, it.mat ?? this.mats.clayWind);
      m.rotation.y = it.yaw ?? -0.5;
      scene.add(m);
      box.setFromObject(m);
      box.getCenter(ctr);
      box.getSize(sz);
      const r = Math.max(sz.x, sz.y, sz.z) * 0.62 + 0.2;
      cam.position.set(ctr.x + r * 0.55, ctr.y + r * 1.05, ctr.z + r * 3.0);
      cam.lookAt(ctr);
      cam.updateMatrixWorld();
      this.mats.lighting.fromPalette(ZONE_PALETTES[0]!);
      this.mats.lighting.update(cam);
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(scene, cam);
      gl.setRenderTarget(null);
      gl.setClearColor(prevColor, prevAlpha);
      await gl.readRenderTargetPixelsAsync(rt, 0, 0, size, size, px);
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      out[id] = c.toDataURL('image/png');
      scene.remove(m);
      geo.dispose();
    }
    rt.dispose();
    return out;
  }

  /** Render portraits into PNG data URLs. One-off cost; async readback avoids GPU stalls. */
  private async renderThumbs(list: readonly { skin: CrabSkin; hat: HatKind }[], size: number, head = false): Promise<string[]> {
    const gl = this.renderer.gl;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    if (head) {
      cam.position.set(0, 1.9, 2.6);
      cam.lookAt(0, 0.95, 0);
    } else {
      cam.position.set(0, 1.75, 4.3);
      cam.lookAt(0, 0.68, 0);
    }
    const crab = new CrabModel(this.mats);
    scene.add(crab.root);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const px = new Uint8Array(size * size * 4);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(size, size);
    const prevColor = new THREE.Color();
    gl.getClearColor(prevColor);
    const prevAlpha = gl.getClearAlpha();
    const out: string[] = [];
    cam.updateMatrixWorld();
    for (const { skin, hat } of list) {
      this.mats.lighting.fromPalette(ZONE_PALETTES[0]!);
      this.mats.lighting.update(cam);
      crab.setSkin(skin, hat);
      crab.reset();
      crab.look(0.1, 0.05);
      crab.update(1 / 60, IDLE_DRIVE);
      crab.root.rotation.y = -0.25;
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(scene, cam);
      gl.setRenderTarget(null);
      gl.setClearColor(prevColor, prevAlpha);
      await gl.readRenderTargetPixelsAsync(rt, 0, 0, size, size, px);
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      out.push(c.toDataURL('image/png'));
    }
    rt.dispose();
    crab.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    return out;
  }
}

/** HSL (full saturation, light 0.62) to a hex colour, without allocating. */
function hsl(h: number): number {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = 0.38 * 0.95;
    return Math.round((0.62 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Boot cinematic (UPDATE3_PLAN.md §2.1): camera keys [t, x, y, z, lookX, lookY, lookZ]. */
const CINE_LEN = 4.4;
const CINE_SETTLE = 3.0;
const CINE_CRAB = 2.55;
const CINE_CAM: Key[] = [
  [0, 34, 2.4, -48, 8, 1.4, -70],
  [1.3, 20, 3.4, -20, 2, 1.0, -12],
  [2.3, 6, 2.6, 6, 0, 0.8, 0],
  [3.0, 3.2, 1.9, 5.2, 0, 0.9, 0],
];
const CINE_CUES: (readonly [number, string])[] = [
  [0.95, 'spray'],
  [1.55, 'logo'],
  [CINE_CRAB, 'crab'],
  [3.25, 'wave'],
  [3.7, 'ui'],
];
