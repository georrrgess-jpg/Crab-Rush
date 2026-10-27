/**
 * Crab Cup races (UPDATE4_PLAN.md §5): the player's World races three rival Worlds on the same
 * seeded course. Each rival is steered by an Autopilot with its own skill profile and a gentle
 * catch-up (speedMul ±3%). Pure and deterministic: no three, no DOM.
 */
import { CFG } from '../config';
import { Autopilot, type PilotProfile } from './autopilot';
import { World, type RunOptions } from './world';

export interface RivalDef {
  id: string;
  name: string;
  profile: PilotProfile;
  /** look: crab body skin id and hat */
  body: string;
  hat: string;
}

export interface Racer {
  id: string;
  name: string;
  world: World;
  pilot: Autopilot | null;
  you: boolean;
}

export interface Standing {
  id: string;
  name: string;
  you: boolean;
  /** 1-based place */
  place: number;
  dist: number;
  finished: boolean;
  /** finish time in seconds (projected for racers still on course when the race is scored) */
  time: number;
}

export const RIVALS: Record<string, RivalDef> = {
  shelly: { id: 'shelly', name: 'Shelly', body: 'blossom', hat: 'flower', profile: { reaction: 0.36, horizon: 1.6, hopNoise: 0.07 } },
  barnacle: { id: 'barnacle', name: 'Capt. Barnacle', body: 'skipper', hat: 'captain', profile: { reaction: 0.3, horizon: 1.9, hopNoise: 0.05 } },
  pip: { id: 'pip', name: 'Pip', body: 'chill', hat: 'propeller', profile: { reaction: 0.26, horizon: 2.2, hopNoise: 0.045 } },
  coco: { id: 'coco', name: 'Coco', body: 'pinch', hat: 'pirate', profile: { reaction: 0.22, horizon: 2.5, hopNoise: 0.035 } },
};

const START_LANES = [0, 2, 1];
const START_OFFSETS = [0.4, 0.4, -2.2];

export class Race {
  readonly racers: Racer[] = [];
  readonly finishAt: number;
  readonly startAt: number;

  /**
   * `player` is the game's World (already started with `opts`, which must carry `race`); the rivals get
   * their own Worlds with the same options, so the course is identical.
   */
  constructor(player: World, opts: RunOptions, rivals: RivalDef[], skill = 1) {
    if (!opts.race) throw new Error('Race needs opts.race');
    this.finishAt = opts.race.finishAt;
    this.startAt = opts.startDist;
    this.racers.push({ id: 'you', name: 'You', world: player, pilot: null, you: true });
    rivals.forEach((r, i) => {
      const w = new World();
      w.start({ ...opts, tutorial: null, god: false, best: 0 });
      // harder cups: quicker reactions and longer look-ahead
      const prof: PilotProfile = { reaction: r.profile.reaction / skill, horizon: r.profile.horizon * skill, hopNoise: r.profile.hopNoise / skill };
      const ap = new Autopilot(w, 3, prof);
      ap.seekShells = true;
      // a starting grid: two rivals beside the player, one just behind (never stacked on the player)
      const lane = START_LANES[i % START_LANES.length] as number;
      const p = w.player;
      p.lane = p.prevLane = lane;
      p.x = p.prevX = CFG.laneX[lane] as number;
      w.dist = w.prevDist = opts.startDist + (START_OFFSETS[i % START_OFFSETS.length] as number);
      this.racers.push({ id: r.id, name: r.name, world: w, pilot: ap, you: false });
    });
  }

  /** Step the rivals (the game steps the player's World itself). */
  step(dt: number): void {
    const you = this.racers[0] as Racer;
    for (const r of this.racers) {
      if (r.you) continue;
      const w = r.world;
      if (w.mode !== 'running' && w.mode !== 'finished') continue;
      // catch-up: slightly faster when behind the player, slightly slower when far ahead
      const gap = you.world.dist - w.dist;
      w.speedMul = 1 + Math.max(-1, Math.min(1, gap / CFG.race.bandGap)) * CFG.race.band;
      r.pilot?.update();
      w.step(dt * w.timeScale);
      w.events.length = 0;
    }
  }

  /** Current order: finished racers by time, then the rest by distance. */
  standings(): Standing[] {
    const out = this.racers.map((r) => {
      const w = r.world;
      const finished = w.mode === 'finished';
      // projected time for racers still running: time so far + remaining distance at current speed
      const remain = Math.max(0, this.finishAt - w.dist);
      const time = finished ? w.raceTime : w.time + remain / Math.max(4, w.speed);
      return { id: r.id, name: r.name, you: r.you, place: 0, dist: w.dist, finished, time };
    });
    out.sort((a, b) => (a.finished !== b.finished ? (a.finished ? -1 : 1) : a.finished ? a.time - b.time : b.dist - a.dist));
    out.forEach((s, i) => (s.place = i + 1));
    return out;
  }

  /** Final result once the player finishes: rivals still on course are placed by projected time. */
  final(): Standing[] {
    const out = this.standings();
    out.sort((a, b) => a.time - b.time);
    out.forEach((s, i) => (s.place = i + 1));
    return out;
  }

  /** 0..1 progress along the course for a racer */
  progress(r: Racer): number {
    return Math.max(0, Math.min(1, (r.world.dist - this.startAt) / (this.finishAt - this.startAt)));
  }
}
