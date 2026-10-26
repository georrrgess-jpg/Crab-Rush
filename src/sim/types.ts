import type { PowerKind } from './events';

export type EntityKind = 'block' | 'low' | 'sweep' | 'roller' | 'gull' | 'powerup' | 'arch' | 'banner';

/** Obstacles, pickups and landmark props that live on the track. Shells are separate (see Shell). */
export interface Entity {
  id: number;
  kind: EntityKind;
  lane: number; // 0..2 (sweep/arch/banner: 1)
  x: number;
  /** position along the track in metres; relative distance to the player is wz - world.dist */
  wz: number;
  prevWz: number;
  /** world velocity along the track (rollers roll back toward the player) */
  vz: number;
  /** vertical offset (gulls fall, power-ups float) */
  y: number;
  w: number;
  d: number;
  h: number;
  /** variant: zone skin for obstacles, power-up kind index, zone index for arches */
  skin: number;
  power?: PowerKind;
  /** rollers: the track position where the ball meets the player (its pattern row) */
  meetWz?: number;
  /** gull: 0 hovering, 1 falling, 2 landed */
  state: number;
  passed: boolean;
  dead: boolean;
  /** hit by a shield / knocked away: lets the renderer play a tumble */
  knocked: number;
  spin: number;
}

export interface Shell {
  id: number;
  x: number;
  y: number;
  wz: number;
  big: boolean;
  dead: boolean;
  /** pull-in animation toward the player (magnet) */
  magnet: boolean;
}

export interface PlayerState {
  lane: number;
  x: number;
  prevX: number;
  y: number;
  prevY: number;
  vy: number;
  grounded: boolean;
  hopBuffer: number;
  bumpT: number;
  /** last lane the player left, and when (for close-shave detection) */
  prevLane: number;
  laneChangeAt: number;
  /** lateral velocity (m/s), for leaning visuals */
  vx: number;
  invuln: number;
  airTime: number;
}
