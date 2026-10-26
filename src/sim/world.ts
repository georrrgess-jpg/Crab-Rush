import { CFG, speedAt, tierAt, zoneAt } from '../config';
import type { Modifier } from '../meta/daily';
import { Rng } from '../core/rng';
import type { Entity, EntityKind, PlayerState, Shell } from './types';
import type { GameEvent, PowerKind } from './events';
import { Spawner } from './spawner';
import { levelSpeed, type CompiledLevel } from './levels';
import { emptyLevelStats, type LevelRunStats } from './objectives';

export type WorldMode = 'idle' | 'running' | 'crashing' | 'finished';
export type RunKind = 'endless' | 'level' | 'daily';
export type SimAction = 'left' | 'right' | 'hop' | 'slam';

export interface RunOptions {
  seed: number;
  startDist: number;
  /** null = no tutorial; otherwise which lessons are already learned */
  tutorial: { move: boolean; hop: boolean } | null;
  god: boolean;
  /** best distance before this run (0 = none) */
  best: number;
  upgrades: Record<PowerKind, number>;
  zonesSeen: number[];
  /** Island Hop: a compiled level (finite course, scripted spawns, no upgrades) */
  level?: CompiledLevel | null;
  /** Daily Tide: the day's modifier (an endless run with a twist) */
  modifier?: Modifier | null;
}

export interface RunStats {
  shells: number; // value of shells picked up (big = 10)
  bonus: number; // close shaves + zone discovery bonuses
  closeShaves: number;
  hops: number;
  laneChanges: number;
  powerups: number;
  powerKinds: Record<PowerKind, number>;
  wavesHopped: number;
  obstaclesHopped: number;
  maxStreak: number;
  maxDistNoShell: number;
  maxDistNoHop: number;
  zonesReached: number;
  bumps: number;
}

export interface TutorialStep {
  id: string;
  step: string;
  need: 'move' | 'hop' | 'none';
  slow: boolean;
  wz: number;
  done: boolean;
}

const HOP_G = (8 * CFG.hop.apex) / (CFG.hop.airtime * CFG.hop.airtime);
const HOP_V0 = (4 * CFG.hop.apex) / CFG.hop.airtime;
const LANE_TAU = CFG.laneChangeTime / 3;
/** bounce pad launch speed (apex CFG.island.padApex) and time to apex */
export const PAD_V0 = Math.sqrt(2 * HOP_G * CFG.island.padApex);
export const PAD_APEX_T = PAD_V0 / HOP_G;

export function defaultRunOptions(): RunOptions {
  return {
    seed: (Math.random() * 1e9) | 0,
    startDist: 0,
    tutorial: null,
    god: false,
    best: 0,
    upgrades: { magnet: 0, shield: 0, rider: 0 },
    zonesSeen: [0],
  };
}

function freshStats(): RunStats {
  return {
    shells: 0,
    bonus: 0,
    closeShaves: 0,
    hops: 0,
    laneChanges: 0,
    powerups: 0,
    powerKinds: { magnet: 0, shield: 0, rider: 0 },
    wavesHopped: 0,
    obstaclesHopped: 0,
    maxStreak: 0,
    maxDistNoShell: 0,
    maxDistNoHop: 0,
    zonesReached: 0,
    bumps: 0,
  };
}

function freshPlayer(): PlayerState {
  return {
    lane: 1,
    x: 0,
    prevX: 0,
    y: 0,
    prevY: 0,
    vy: 0,
    grounded: true,
    hopBuffer: 0,
    bumpT: 0,
    prevLane: 1,
    laneChangeAt: -10,
    vx: 0,
    invuln: 0,
    airTime: 0,
  };
}

/** Pure simulation: no rendering, no DOM, no three.js. */
export class World {
  mode: WorldMode = 'idle';
  opts: RunOptions = defaultRunOptions();
  rng = new Rng(1);
  player: PlayerState = freshPlayer();
  entities: Entity[] = [];
  shells: Shell[] = [];
  events: GameEvent[] = [];
  stats: RunStats = freshStats();
  tutorialSteps: TutorialStep[] = [];
  spawner!: Spawner;

  time = 0;
  dist = 0;
  prevDist = 0;
  startDist = 0;
  bestAtStart = 0;
  speed: number = CFG.speed.start;
  zone = 0;
  tier = 0;
  crashT = 0;
  crashKind = '';
  slamming = false;
  /** wall-clock multiplier requested by the sim (tutorial slow-mo); the game applies it */
  timeScale = 1;
  tutorialActive = false;
  /** which tutorial lessons the player has completed during this run */
  learned = { move: false, hop: false };
  /** Island Hop */
  kind: RunKind = 'endless';
  level: CompiledLevel | null = null;
  modifier: Modifier | null = null;
  /** track position where the level's distances start */
  levelStart = 0;
  levelStats: LevelRunStats = emptyLevelStats();
  /** Great Wave chase: metres between the wave and the crab (null = no chase) */
  chaseGap: number | null = null;
  /** tide pool slowdown time left */
  slowT = 0;
  finishT = 0;

  power: { kind: PowerKind | null; t: number; dur: number } = { kind: null, t: 0, dur: 0 };
  streak = 0;
  private lastShellTime = -10;
  private nextId = 1;
  private pool: Entity[] = [];
  private shellPool: Shell[] = [];
  private zonesSeen = new Set<number>();
  private milestone = 0;
  private newBestFired = false;
  private distSinceShell = 0;
  private distSinceHop = 0;
  private waitingStep: TutorialStep | null = null;
  private pendingGone = 0;

  start(opts: RunOptions): void {
    this.opts = opts;
    this.rng = new Rng(opts.seed);
    this.mode = 'running';
    this.player = freshPlayer();
    this.stats = freshStats();
    for (const e of this.entities) this.pool.push(e);
    for (const s of this.shells) this.shellPool.push(s);
    this.entities.length = 0;
    this.shells.length = 0;
    this.events.length = 0;
    this.tutorialSteps.length = 0;
    this.time = 0;
    this.dist = opts.startDist;
    this.prevDist = opts.startDist;
    this.startDist = opts.startDist;
    this.bestAtStart = opts.best;
    this.zone = zoneAt(opts.startDist);
    this.tier = tierAt(opts.startDist);
    this.stats.zonesReached = this.zone;
    this.zonesSeen = new Set(opts.zonesSeen);
    for (let z = 0; z <= this.zone; z++) this.zonesSeen.add(z);
    this.milestone = Math.floor(opts.startDist / CFG.milestoneEvery);
    this.newBestFired = false;
    this.crashT = 0;
    this.crashKind = '';
    this.slamming = false;
    this.timeScale = 1;
    this.power = { kind: null, t: 0, dur: 0 };
    this.streak = 0;
    this.lastShellTime = -10;
    this.distSinceShell = 0;
    this.distSinceHop = 0;
    this.waitingStep = null;
    this.learned = { move: false, hop: false };
    this.tutorialActive = !!opts.tutorial && !(opts.tutorial.move && opts.tutorial.hop);
    this.level = opts.level ?? null;
    this.modifier = this.level ? null : (opts.modifier ?? null);
    this.kind = this.level ? 'level' : this.modifier ? 'daily' : 'endless';
    this.levelStart = opts.startDist;
    this.levelStats = emptyLevelStats();
    if (this.level) this.levelStats.dollarsTotal = this.level.dollars;
    this.chaseGap = this.level?.def.chase ? CFG.island.chase.startGap : null;
    this.slowT = 0;
    this.finishT = 0;
    this.speed = this.speedForDist(this.dist);
    this.spawner = new Spawner(this, this.rng, opts.startDist, this.tutorialActive ? opts.tutorial : null);
    this.spawner.update();
  }

  /** Speed of the player at a given track position (used by spawner and sim). */
  speedForDist(d: number): number {
    if (this.level) return levelSpeed(this.level.speed, d - this.levelStart, this.level.length);
    let v = speedAt(d);
    if (this.modifier === 'lowTide') v *= CFG.daily.lowTideSpeed;
    else if (this.modifier === 'magnetMadness') {
      const S = CFG.speed;
      v = S.start + S.gain * (1 - Math.exp(-Math.max(0, d) / (S.tau / CFG.daily.madnessRamp)));
    }
    return this.tutorialActive ? Math.min(v, CFG.speed.tutorialCap) : v;
  }

  // ---------------------------------------------------------------- entity management
  addEntity(kind: EntityKind, lane: number, wz: number, extra: Partial<Entity>): Entity {
    const O = CFG.obstacle;
    const dims =
      kind === 'block' ? O.block : kind === 'low' ? O.low : kind === 'sweep' ? O.sweep : kind === 'roller' ? O.roller : kind === 'gull' ? O.gull : { w: 1, d: 1, h: 1 };
    const e: Entity =
      this.pool.pop() ??
      ({ id: 0, kind, lane, x: 0, wz: 0, prevWz: 0, vz: 0, y: 0, w: 1, d: 1, h: 1, skin: 0, state: 0, passed: false, dead: false, knocked: 0, spin: 0 } as Entity);
    e.id = this.nextId++;
    e.kind = kind;
    e.lane = lane;
    e.x = kind === 'sweep' || kind === 'arch' || kind === 'banner' ? 0 : (CFG.laneX[lane] as number);
    e.wz = wz;
    e.prevWz = wz;
    e.vz = 0;
    e.y = kind === 'powerup' ? 0.8 : 0;
    e.w = dims.w;
    e.d = dims.d;
    e.h = dims.h;
    e.skin = 0;
    e.state = 0;
    e.passed = false;
    e.dead = false;
    e.knocked = 0;
    e.spin = 0;
    e.power = undefined;
    e.meetWz = undefined;
    Object.assign(e, extra);
    if (kind === 'roller' && e.meetWz !== undefined) e.wz = e.prevWz = this.rollerWz(e.meetWz);
    if (kind === 'gull') e.y = CFG.gull.height;
    if (kind === 'dollar' && extra.y === undefined) e.y = CFG.island.dollarY;
    if (kind === 'hourglass') e.y = CFG.shell.y;
    if (kind === 'tidepool') {
      e.w = CFG.island.tidepool.w;
      e.d = CFG.island.tidepool.d;
    }
    this.entities.push(e);
    return e;
  }

  addShell(x: number, y: number, wz: number, big: boolean): void {
    const s = this.shellPool.pop() ?? ({ id: 0, x: 0, y: 0, wz: 0, big: false, dead: false, magnet: false } as Shell);
    s.id = this.nextId++;
    s.x = x;
    s.y = y;
    s.wz = wz;
    s.big = big;
    s.dead = false;
    s.magnet = false;
    this.shells.push(s);
    if (this.level) this.levelStats.shellsTotal++;
  }

  // ---------------------------------------------------------------- input
  act(a: SimAction): void {
    if (this.mode !== 'running') return;
    const p = this.player;
    switch (a) {
      case 'left':
      case 'right': {
        const dir = a === 'left' ? -1 : 1;
        const lane = p.lane + dir;
        if (lane < 0 || lane >= CFG.laneCount) return;
        p.prevLane = p.lane;
        p.lane = lane;
        p.laneChangeAt = this.time;
        this.stats.laneChanges++;
        this.events.push({ t: 'laneChange', dir: dir as -1 | 1 });
        this.tutorialAction('move');
        break;
      }
      case 'hop':
        if (this.power.kind === 'rider') return;
        if (p.grounded) this.startHop();
        else p.hopBuffer = CFG.hop.buffer;
        break;
      case 'slam':
        if (!p.grounded && !this.slamming && this.power.kind !== 'rider') {
          this.slamming = true;
          p.vy = Math.min(p.vy, -CFG.hop.slamKick);
          this.events.push({ t: 'slam' });
        }
        break;
    }
  }

  private startHop(v0 = HOP_V0): void {
    const p = this.player;
    p.grounded = false;
    p.vy = v0;
    p.hopBuffer = 0;
    p.airTime = 0;
    this.slamming = false;
    this.stats.hops++;
    this.distSinceHop = 0;
    this.events.push({ t: 'hop' });
    this.tutorialAction('hop');
  }

  private tutorialAction(kind: 'move' | 'hop'): void {
    if (this.waitingStep && this.waitingStep.need === kind) {
      this.waitingStep.done = true;
      this.events.push({ t: 'tutorial', step: this.waitingStep.step, need: kind, show: false });
      this.learned[kind] = true;
      this.waitingStep = null;
      this.timeScale = 1;
    } else if (this.tutorialActive) {
      // doing the action unprompted also counts as learning it
      if (kind === 'move' && this.stats.laneChanges >= 2) this.learned.move = true;
      if (kind === 'hop' && this.stats.hops >= 1) this.learned.hop = true;
    }
  }

  // ---------------------------------------------------------------- stepping
  step(dt: number): void {
    if (this.mode === 'idle') return;
    if (this.mode === 'finished') {
      // coast past the flag
      this.finishT += dt;
      this.speed = Math.max(0, this.speed - 14 * dt);
      this.prevDist = this.dist;
      this.dist += this.speed * dt;
      this.updatePlayer(dt);
      return;
    }
    this.time += dt;
    if (this.mode === 'crashing') {
      this.crashT += dt;
      this.speed = Math.max(0, this.speed - 50 * dt);
      this.prevDist = this.dist;
      this.dist += this.speed * dt;
      this.updatePlayerCrash(dt);
      return;
    }

    // speed
    let target = this.speedForDist(this.dist);
    if (this.power.kind === 'rider') target *= CFG.riderSpeedMul;
    if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - dt);
      target *= CFG.island.tidepool.slow;
    }
    const dv = target - this.speed;
    const maxDv = 40 * dt;
    this.speed += Math.abs(dv) <= maxDv ? dv : Math.sign(dv) * maxDv;

    this.prevDist = this.dist;
    const ds = this.speed * dt;
    this.dist += ds;
    this.distSinceShell += ds;
    this.distSinceHop += ds;
    if (this.distSinceShell > this.stats.maxDistNoShell) this.stats.maxDistNoShell = this.distSinceShell;
    if (this.distSinceHop > this.stats.maxDistNoHop) this.stats.maxDistNoHop = this.distSinceHop;
    this.tier = tierAt(this.dist);

    this.updatePlayer(dt);
    this.updateEntities(dt);
    this.spawner.update();
    this.updatePower(dt);
    this.updateTutorial();
    this.collide();
    if (this.mode !== 'running') return;
    this.collectPickups(dt);
    this.detectPasses();
    if (this.level) this.updateLevel(dt);
    else this.zoneAndMilestones();
    this.cleanup();
  }

  /** Island Hop: chase wave, finish line. */
  private updateLevel(dt: number): void {
    const L = this.level as CompiledLevel;
    const st = this.levelStats;
    st.time = this.time;
    st.bumps = this.stats.bumps;
    st.hops = this.stats.hops;
    st.powerups = this.stats.powerups;
    st.maxStreak = this.stats.maxStreak;
    if (this.chaseGap !== null) {
      // the wave keeps a steady pace slightly faster than the level's, so slowdowns let it close in
      const C = CFG.island.chase;
      const waveSpeed = this.speedForDist(this.dist) + C.creep;
      this.chaseGap = Math.min(C.maxGap, this.chaseGap + (this.speed - waveSpeed) * dt);
      if (this.chaseGap <= 0 && !this.opts.god) {
        this.chaseGap = 0;
        this.crash('wave');
        return;
      }
    }
    if (this.dist - this.levelStart >= L.length - CFG.island.flagAfter * 0.4) {
      st.finished = true;
      this.mode = 'finished';
      this.finishT = 0;
      this.timeScale = 1;
      this.events.push({ t: 'finish' });
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    // lane glide: exponential smoothing, ~95% in laneChangeTime
    const tx = CFG.laneX[p.lane] as number;
    const k = 1 - Math.exp(-dt / LANE_TAU);
    p.x += (tx - p.x) * k;
    if (Math.abs(tx - p.x) < 0.004) p.x = tx;
    p.vx = (p.x - p.prevX) / dt;
    if (p.bumpT > 0) p.bumpT = Math.max(0, p.bumpT - dt);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

    if (this.power.kind === 'rider') {
      const ty = CFG.riderHeight;
      p.y += (ty - p.y) * Math.min(1, 9 * dt);
      p.vy = 0;
      p.grounded = true;
      return;
    }

    if (!p.grounded) {
      p.airTime += dt;
      const g = this.slamming ? HOP_G * CFG.hop.slamGravityMul : HOP_G;
      p.vy -= g * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        const hard = this.slamming;
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
        this.slamming = false;
        this.events.push({ t: 'land', hard });
        if (p.hopBuffer > 0) this.startHop();
      }
    }
    if (p.hopBuffer > 0) p.hopBuffer = Math.max(0, p.hopBuffer - dt);
  }

  /**
   * A beach ball is always exactly where it must be to reach the player on its pattern row at the
   * player's *current* speed, so speed changes (Wave Rider, ramps) never shift it into another row.
   */
  private rollerWz(meetWz: number): number {
    return meetWz + (CFG.rollerSpeed * (meetWz - this.dist)) / Math.max(1, this.speed);
  }

  private updateEntities(dt: number): void {
    for (const e of this.entities) {
      e.prevWz = e.wz;
      if (e.kind === 'roller' && e.meetWz !== undefined) e.wz = this.rollerWz(e.meetWz);
      else if (e.vz !== 0) e.wz += e.vz * dt;
      if (e.kind === 'roller') e.spin += dt * (this.speed + CFG.rollerSpeed) * 1.2;
      if (e.kind === 'gull') {
        const rel = e.wz - this.dist;
        const ttp = rel / Math.max(this.speed, 1);
        if (e.state === 0 && ttp <= CFG.gull.warnTime) e.state = 1;
        if (e.state === 1) {
          const f = Math.min(1, Math.max(0, (CFG.gull.warnTime - ttp) / (CFG.gull.warnTime - CFG.gull.landTime)));
          e.y = CFG.gull.height * (1 - f * f);
          if (f >= 1) {
            e.state = 2;
            e.y = 0;
          }
        }
      }
      if (e.knocked > 0) e.knocked += dt;
    }
    for (const s of this.shells) {
      if (s.magnet) {
        const p = this.player;
        const k = Math.min(1, 12 * dt);
        s.x += (p.x - s.x) * k;
        s.y += (p.y + 0.5 - s.y) * k;
        s.wz -= 32 * dt;
      }
    }
  }

  private updatePower(dt: number): void {
    const pw = this.power;
    const madness = this.modifier === 'magnetMadness';
    if (!pw.kind && !madness) return;
    pw.t -= dt;
    if (pw.kind === 'magnet' || pw.kind === 'rider' || madness) {
      const all = pw.kind === 'rider';
      for (const s of this.shells) {
        if (s.magnet || s.dead) continue;
        const rel = s.wz - this.dist;
        if (rel < -1 || rel > CFG.magnetRange.ahead) continue;
        if (!all && Math.abs(s.x - this.player.x) > CFG.magnetRange.lanes * 2.3) continue;
        s.magnet = true;
      }
    }
    if (pw.kind && pw.t <= 0) this.endPower(false);
  }

  private endPower(popped: boolean): void {
    const k = this.power.kind;
    if (!k) return;
    this.power = { kind: null, t: 0, dur: 0 };
    this.events.push({ t: 'powerupEnd', kind: k, popped });
    if (k === 'rider') {
      this.player.invuln = 1.0;
      this.player.grounded = false;
      this.player.vy = 0;
      this.slamming = false;
      // clear the track just ahead so the landing is safe
      for (const e of this.entities) {
        const rel = e.wz - this.dist;
        if ((e.kind === 'block' || e.kind === 'low' || e.kind === 'sweep' || e.kind === 'roller' || e.kind === 'gull') && rel > -2 && rel < 25) {
          e.dead = true;
          this.events.push({ t: 'knock', id: e.id });
        }
      }
    }
  }

  activate(kind: PowerKind): void {
    if (this.power.kind) this.endPower(false);
    const lvl = this.opts.upgrades[kind] ?? 0;
    const dur = (CFG.powerupDurations[kind] as readonly number[])[lvl] as number;
    this.power = { kind, t: dur, dur };
    this.stats.powerups++;
    this.stats.powerKinds[kind]++;
    this.events.push({ t: 'powerup', kind });
  }

  // ---------------------------------------------------------------- tutorial
  private updateTutorial(): void {
    if (!this.tutorialActive) return;
    if (this.waitingStep) {
      this.timeScale = 0.25;
      return;
    }
    const idx = this.tutorialSteps.findIndex((s) => !s.done && !(s as TutorialStep & { shown?: boolean }).shown);
    const s = this.tutorialSteps[idx] as (TutorialStep & { shown?: boolean }) | undefined;
    if (!s) {
      // everything shown & done → finish tutorial once the last script pattern is behind us
      const last = this.tutorialSteps[this.tutorialSteps.length - 1];
      if (last && this.tutorialSteps.length >= this.spawner.scriptLen && this.dist > last.wz + 8) this.finishTutorial();
      return;
    }
    const ttp = (s.wz - this.dist) / Math.max(this.speed, 1);
    if (ttp <= (s.slow ? 2.2 : 3.2)) {
      s.shown = true;
      this.events.push({ t: 'tutorial', step: s.step, need: s.need, show: true });
      if (s.slow && s.need !== 'none') this.waitingStep = s;
      else s.done = true;
    }
  }

  finishTutorial(): void {
    if (!this.tutorialActive) return;
    this.tutorialActive = false;
    this.timeScale = 1;
    this.events.push({ t: 'tutorial', step: 'complete', need: 'none', show: false });
  }

  // ---------------------------------------------------------------- collisions
  private collide(): void {
    const p = this.player;
    const P = CFG.player;
    const rider = this.power.kind === 'rider';
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.kind === 'arch' || e.kind === 'banner' || e.kind === 'powerup') continue;
      if (e.kind === 'dollar' || e.kind === 'hourglass' || e.kind === 'pad' || e.kind === 'tidepool' || e.kind === 'flag') continue;
      const rel = e.wz - this.dist;
      const halfZ = (e.d + P.d) / 2;
      if (Math.abs(rel) >= halfZ) continue;
      if (e.kind === 'gull' && e.state < 2) continue;
      if (p.y >= e.h) continue;
      const halfX = (e.w + P.w) / 2;
      const dx = p.x - e.x;
      if (Math.abs(dx) >= halfX) continue;
      if (rider || p.invuln > 0 || this.opts.god) continue;

      const prevRel = e.prevWz - this.prevDist;
      const prevOx = Math.abs(p.prevX - e.x) < halfX;
      const prevOz = Math.abs(prevRel) < halfZ;
      const prevOy = p.prevY < e.h;
      let lateral: boolean;
      if (e.kind === 'sweep') lateral = false;
      else if (!prevOx && prevOz && prevOy) lateral = true;
      else if (!prevOx && !prevOz) lateral = halfX - Math.abs(dx) < halfZ - Math.abs(rel);
      else lateral = false;

      if (lateral) {
        this.bump(e, halfX);
        continue;
      }
      if (this.power.kind === 'shield') {
        e.dead = true;
        e.knocked = 0.001;
        this.events.push({ t: 'knock', id: e.id });
        this.endPower(true);
        p.invuln = 1.0;
        continue;
      }
      this.crash(e.kind);
      return;
    }
  }

  private bump(e: Entity, halfX: number): void {
    const p = this.player;
    const side = p.prevX - e.x >= 0 ? 1 : -1;
    p.x = e.x + side * (halfX + 0.02);
    let lane = e.lane + side;
    if (lane < 0) lane = e.lane + 1;
    if (lane >= CFG.laneCount) lane = e.lane - 1;
    p.prevLane = p.lane;
    p.lane = lane;
    p.bumpT = CFG.bumpWobble;
    p.laneChangeAt = this.time;
    this.streak = 0;
    this.lastShellTime = -10;
    this.stats.bumps++;
    this.events.push({ t: 'bump', x: p.x });
    if (this.chaseGap !== null) this.chaseGap -= CFG.island.chase.bump;
  }

  private crash(kind: string): void {
    this.mode = 'crashing';
    this.crashT = 0;
    this.crashKind = kind;
    this.timeScale = 1;
    this.waitingStep = null;
    this.events.push({ t: 'crash', kind });
  }

  private updatePlayerCrash(dt: number): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    if (!p.grounded) {
      p.vy -= HOP_G * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.grounded = true;
    }
  }

  // ---------------------------------------------------------------- pickups
  private collectPickups(dt: number): void {
    void dt;
    const p = this.player;
    const R = CFG.shell.radius;
    const rider = this.power.kind === 'rider';
    for (const s of this.shells) {
      if (s.dead) continue;
      const rel = s.wz - this.dist;
      if (rel > 3 || rel < -2) continue;
      const dx = p.x - s.x;
      const dy = p.y + 0.45 - s.y;
      let hit: boolean;
      if (rider) hit = Math.abs(rel) < 1.4;
      else hit = dx * dx + dy * dy + rel * rel < R * R;
      if (!hit) continue;
      s.dead = true;
      this.pickShell(s);
    }
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.kind === 'dollar' || e.kind === 'hourglass') {
        const rel = e.wz - this.dist;
        if (Math.abs(rel) > 2) continue;
        const dx = p.x - e.x;
        const dy = p.y + 0.45 - e.y;
        const R = CFG.island.pickupRadius;
        if (!rider && dx * dx + dy * dy + rel * rel > R * R) continue;
        if (rider && Math.abs(rel) > 1.4) continue;
        e.dead = true;
        if (e.kind === 'dollar') {
          this.levelStats.dollars++;
          this.events.push({ t: 'dollar', n: this.levelStats.dollars, x: e.x, y: e.y });
        } else {
          this.levelStats.hourglasses++;
          if (this.chaseGap !== null) this.chaseGap = Math.min(CFG.island.chase.maxGap, this.chaseGap + CFG.island.chase.hourglass);
          this.events.push({ t: 'hourglass', gap: this.chaseGap ?? 0 });
        }
        continue;
      }
      if (e.kind !== 'powerup') continue;
      const rel = e.wz - this.dist;
      if (Math.abs(rel) > 1.2) continue;
      if (Math.abs(p.x - e.x) > 1.3) continue;
      if (p.y > e.y + 1.3) continue;
      e.dead = true;
      this.activate(e.power as PowerKind);
    }
  }

  private pickShell(s: Shell): void {
    const stats = this.stats;
    stats.shells += s.big ? CFG.shell.big : 1;
    if (this.level) this.levelStats.shellsPicked++;
    this.distSinceShell = 0;
    if (this.time - this.lastShellTime <= CFG.shell.streakWindow) this.streak++;
    else this.streak = 1;
    this.lastShellTime = this.time;
    if (this.streak > stats.maxStreak) stats.maxStreak = this.streak;
    this.events.push({ t: 'shell', big: s.big, streak: this.streak, x: s.x, y: s.y, wz: s.wz });
    if (this.streak > 0 && this.streak % 10 === 0) this.events.push({ t: 'streak', n: this.streak });
  }

  // ---------------------------------------------------------------- passes, zones
  private detectPasses(): void {
    const p = this.player;
    for (const e of this.entities) {
      if (e.passed || e.dead) continue;
      const rel = e.wz - this.dist;
      if (rel > 0) continue;
      e.passed = true;
      switch (e.kind) {
        case 'block':
        case 'roller':
        case 'gull':
          if (e.lane === p.prevLane && p.lane !== e.lane && this.time - p.laneChangeAt <= CFG.closeShave.window && p.y < e.h) {
            this.stats.closeShaves++;
            this.stats.bonus += CFG.closeShave.reward;
            this.events.push({ t: 'closeShave', reward: CFG.closeShave.reward });
          } else if (e.kind === 'roller' && p.y > 0.05 && Math.abs(p.x - e.x) < 1.2) {
            this.stats.obstaclesHopped++;
          }
          break;
        case 'low':
          if (p.y > 0.05 && Math.abs(p.x - e.x) < 1.4) this.stats.obstaclesHopped++;
          break;
        case 'pad':
          // bounce pads launch you high (to reach floating sand dollars)
          if (p.grounded && Math.abs(p.x - e.x) < 1.1 && this.power.kind !== 'rider') {
            this.startHop(PAD_V0);
            this.events.push({ t: 'pad' });
          }
          break;
        case 'tidepool':
          if (p.grounded && Math.abs(p.x - e.x) < 1.2 && this.power.kind !== 'rider') {
            this.slowT = CFG.island.tidepool.time;
            this.events.push({ t: 'tidepool' });
          }
          break;
        case 'sweep':
          if (p.y > 0.05 && this.power.kind !== 'rider') {
            this.stats.wavesHopped++;
            this.stats.obstaclesHopped++;
            this.events.push({ t: 'waveHopped' });
          }
          break;
        default:
          break;
      }
    }
  }

  private zoneAndMilestones(): void {
    const z = zoneAt(this.dist);
    if (z > this.zone) {
      this.zone = z;
      const first = !this.zonesSeen.has(z);
      if (first) {
        this.zonesSeen.add(z);
        this.stats.bonus += CFG.zoneBonus;
      }
      this.stats.zonesReached = Math.max(this.stats.zonesReached, z);
      this.events.push({ t: 'zoneEnter', zone: z, first });
    }
    const m = Math.floor(this.dist / CFG.milestoneEvery);
    if (m > this.milestone) {
      this.milestone = m;
      this.events.push({ t: 'milestone', dist: m * CFG.milestoneEvery });
    }
    if (!this.newBestFired && this.bestAtStart > 0 && this.dist > this.bestAtStart) {
      this.newBestFired = true;
      this.events.push({ t: 'newBest', dist: this.bestAtStart });
    }
  }

  private cleanup(): void {
    const behind = this.dist - CFG.despawnBehind;
    let w = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i] as Entity;
      if (e.dead || e.wz < behind) this.pool.push(e);
      else this.entities[w++] = e;
    }
    this.entities.length = w;
    w = 0;
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i] as Shell;
      if (s.dead || s.wz < behind) this.shellPool.push(s);
      else this.shells[w++] = s;
    }
    this.shells.length = w;
    void this.pendingGone;
  }

  /** Total shells earned this run (pickups + bonuses). Goal rewards are added by the economy. */
  get runShells(): number {
    return this.stats.shells + this.stats.bonus;
  }
  get distance(): number {
    return Math.max(0, this.dist - this.startDist);
  }
}
