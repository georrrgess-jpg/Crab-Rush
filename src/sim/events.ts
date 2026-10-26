export type PowerKind = 'magnet' | 'shield' | 'rider';
export const POWER_KINDS: readonly PowerKind[] = ['magnet', 'shield', 'rider'];

/** Events emitted by the simulation; render, audio and UI drain them once per frame. */
export type GameEvent =
  | { t: 'shell'; big: boolean; streak: number; x: number; y: number; wz: number }
  | { t: 'laneChange'; dir: -1 | 1 }
  | { t: 'hop' }
  | { t: 'land'; hard: boolean }
  | { t: 'slam' }
  | { t: 'bump'; x: number }
  | { t: 'crash'; kind: string }
  | { t: 'closeShave'; reward: number }
  | { t: 'powerup'; kind: PowerKind }
  | { t: 'powerupEnd'; kind: PowerKind; popped: boolean }
  | { t: 'zoneEnter'; zone: number; first: boolean }
  | { t: 'goalComplete'; id: string; reward: number }
  | { t: 'newBest'; dist: number }
  | { t: 'milestone'; dist: number }
  | { t: 'streak'; n: number }
  | { t: 'waveHopped' }
  | { t: 'knock'; id: number }
  | { t: 'gullDive'; x: number }
  | { t: 'tutorial'; step: string; need: 'move' | 'hop' | 'none'; show: boolean }
  // Island Hop
  | { t: 'dollar'; n: number; x: number; y: number }
  | { t: 'hourglass'; gap: number }
  | { t: 'pad' }
  | { t: 'tidepool' }
  | { t: 'finish' };
