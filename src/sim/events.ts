export type PowerKind = 'magnet' | 'shield' | 'rider';
export const POWER_KINDS: readonly PowerKind[] = ['magnet', 'shield', 'rider'];
/**
 * Update 9: what a shell line is made of. trail: a straight run; zig: it changes lane; arc: it hops
 * an obstacle; hopTurn: a hop and a lane change in sequence; river: a breather's long river.
 */
export type LineKind = 'trail' | 'zig' | 'arc' | 'hopTurn' | 'river';
export const LINE_KINDS: readonly LineKind[] = ['trail', 'zig', 'arc', 'hopTurn', 'river'];

/** Events emitted by the simulation; render, audio and UI drain them once per frame. */
export type GameEvent =
  /** combo: Update 9 line combo after this pickup (see 'combo'); streak: the time-based chime streak */
  | { t: 'shell'; big: boolean; streak: number; combo: number; x: number; y: number; wz: number }
  /** Update 9: the combo reached a multiple of CFG.combo.every */
  | { t: 'combo'; n: number }
  /** Update 9: a combo of n (≥ CFG.combo.breakMin) broke; x: where the missed shell was (or the crab, on a bump) */
  | { t: 'comboBreak'; n: number; x: number }
  /** Update 9: every shell of a line collected; bonus is added to the run's bonus shells */
  | { t: 'perfectLine'; kind: LineKind; n: number; bonus: number; x: number; y: number }
  /** Update 9: a hop that cleared a hop obstacle by a hair (margin: m between feet and its top) */
  | { t: 'perfectHop'; kind: string; margin: number; reward: number; x: number }
  /** Update 9: a last-moment lane change past an obstacle (side: which side of the crab it passed on, -1 left / 1 right; gap: m) */
  | { t: 'laneDodge'; kind: string; side: -1 | 1; gap: number; reward: number; x: number }
  | { t: 'laneChange'; dir: -1 | 1 }
  /** Update 8: a lane input that reverses a glide in progress (the crab turns back mid-move) */
  | { t: 'turn'; dir: -1 | 1 }
  /** buffered: fired on landing from an early press; coyote: fired just after dropping off something */
  | { t: 'hop'; buffered: boolean; coyote: boolean }
  /** Update 8: the top of a hop (the arc hangs here) */
  | { t: 'apex' }
  /** vy: impact speed (m/s, ≤ 0); onTop: landed on an obstacle's top rather than the sand */
  | { t: 'land'; hard: boolean; vy: number; onTop: boolean }
  | { t: 'slam' }
  | { t: 'bump'; x: number }
  /** Update 8: a corner graze during a lane change (always followed by its 'bump') */
  | { t: 'graze'; x: number; side: -1 | 1 }
  | { t: 'crash'; kind: string }
  /** kind/side/x (Update 9): the obstacle, the side of the crab it passed on (-1 left, 1 right) and its x */
  | { t: 'closeShave'; reward: number; kind: string; side: -1 | 1; x: number }
  | { t: 'powerup'; kind: PowerKind }
  | { t: 'powerupEnd'; kind: PowerKind; popped: boolean }
  | { t: 'zoneEnter'; zone: number; first: boolean }
  | { t: 'goalComplete'; id: string; reward: number }
  | { t: 'newBest'; dist: number }
  | { t: 'milestone'; dist: number }
  | { t: 'streak'; n: number }
  | { t: 'waveHopped' }
  | { t: 'knock'; id: number }
  | { t: 'gullDive'; x: number; coconut: boolean }
  | { t: 'tutorial'; step: string; need: 'move' | 'hop' | 'none'; show: boolean }
  // Island Hop
  | { t: 'dollar'; n: number; x: number; y: number }
  | { t: 'hourglass'; gap: number }
  | { t: 'pad' }
  | { t: 'tidepool' }
  | { t: 'finish' }
  | { t: 'ring'; x: number; y: number; bonus: number }
  // Crab Cup (UPDATE4_PLAN.md §5)
  | { t: 'stumble'; kind: string }
  | { t: 'dash' }
  | { t: 'dashEnd' }
  // Update 5: Shell Fever, Second Chance
  | { t: 'fever' }
  | { t: 'feverEnd' }
  | { t: 'revive' };
