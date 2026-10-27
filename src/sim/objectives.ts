/**
 * Island Hop star objectives (UPDATE2_PLAN.md §5.2), pure. Star 1: reach the flag. Star 2: all three
 * golden sand dollars. Star 3: the level's own challenge. Evaluated live for the HUD and at the end.
 */
import type { StarRule } from './levels';

export interface LevelRunStats {
  finished: boolean;
  dollars: number;
  dollarsTotal: number;
  bumps: number;
  hops: number;
  powerups: number;
  shellsPicked: number;
  shellsTotal: number;
  hourglasses: number;
  maxStreak: number;
  time: number;
  rings: number;
}

export function emptyLevelStats(): LevelRunStats {
  return { finished: false, dollars: 0, dollarsTotal: 3, bumps: 0, hops: 0, powerups: 0, shellsPicked: 0, shellsTotal: 0, hourglasses: 0, maxStreak: 0, time: 0, rings: 0 };
}

export function ruleText(r: StarRule): string {
  switch (r.kind) {
    case 'noBumps':
      return 'Finish without a bump';
    case 'shells':
      return `Collect ${Math.round(r.pct * 100)}% of the shells`;
    case 'noHops':
      return 'Finish without hopping';
    case 'time':
      return `Finish in under ${r.s} s`;
    case 'noPower':
      return 'Finish without a power-up';
    case 'hourglasses':
      return `Grab ${r.n} hourglass shells`;
    case 'streak':
      return `Reach a ${r.n}-shell streak`;
    case 'rings':
      return `Go through ${r.n} shell rings`;
  }
}

/** Whether the star-3 rule is met (at the finish) and whether it is already lost (live). */
export function ruleState(r: StarRule, s: LevelRunStats): { met: boolean; lost: boolean } {
  switch (r.kind) {
    case 'noBumps':
      return { met: s.finished && s.bumps === 0, lost: s.bumps > 0 };
    case 'shells':
      return { met: s.finished && s.shellsTotal > 0 && s.shellsPicked >= Math.ceil(s.shellsTotal * r.pct), lost: false };
    case 'noHops':
      return { met: s.finished && s.hops === 0, lost: s.hops > 0 };
    case 'time':
      return { met: s.finished && s.time <= r.s, lost: s.time > r.s };
    case 'noPower':
      return { met: s.finished && s.powerups === 0, lost: s.powerups > 0 };
    case 'hourglasses':
      return { met: s.finished && s.hourglasses >= r.n, lost: false };
    case 'streak':
      return { met: s.maxStreak >= r.n && s.finished, lost: false };
    case 'rings':
      return { met: s.finished && s.rings >= r.n, lost: false };
  }
}

export function evalStars(r: StarRule, s: LevelRunStats): [boolean, boolean, boolean] {
  return [s.finished, s.finished && s.dollars >= s.dollarsTotal, ruleState(r, s).met];
}

/** Merge a new result into the best-ever record (stars are kept per objective). */
export function mergeStars(prev: readonly boolean[] | undefined, now: readonly boolean[]): [boolean, boolean, boolean] {
  return [!!prev?.[0] || !!now[0], !!prev?.[1] || !!now[1], !!prev?.[2] || !!now[2]];
}

export function starCount(s: readonly boolean[] | undefined): number {
  return s ? s.filter(Boolean).length : 0;
}

/** Short live text for the HUD chip, with progress where it helps. */
export function ruleHud(r: StarRule, s: LevelRunStats): string {
  switch (r.kind) {
    case 'noBumps':
      return 'No bumps';
    case 'noHops':
      return 'No hopping';
    case 'noPower':
      return 'No power-ups';
    case 'shells':
      return `Grab ${Math.round(r.pct * 100)}% of shells`;
    case 'time':
      return `Time ${Math.floor(s.time)}/${r.s} s`;
    case 'hourglasses':
      return `Hourglasses ${Math.min(s.hourglasses, r.n)}/${r.n}`;
    case 'streak':
      return `Streak ${Math.min(s.maxStreak, r.n)}/${r.n}`;
    case 'rings':
      return `Rings ${Math.min(s.rings, r.n)}/${r.n}`;
  }
}
