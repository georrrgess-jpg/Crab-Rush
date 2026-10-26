/** Every tunable lives here (see PLAN.md §9). Distances in metres, times in seconds. */

export const PALETTE = {
  sandLight: 0xf6dda6,
  sandMid: 0xe9c37e,
  sandShadow: 0xc99a5b,
  sandWet: 0xcfa46a,
  oceanShallow: 0x3fd6d0,
  oceanMid: 0x1fa6d6,
  oceanDeep: 0x1570b8,
  foam: 0xffffff,
  skyTop: 0x3fa2f2,
  skyHorizon: 0xcdefff,
  crabRed: 0xe5452b,
  crabDark: 0xb3261e,
  crabBelly: 0xf7a76c,
  strawHat: 0xf2cf7a,
  hatBand: 0x2c4fa3,
  shellGold: 0xffc23a,
  shellHighlight: 0xffefa0,
  shellEdge: 0xe08a12,
  palmTrunk: 0xa8743f,
  palmLeaf: 0x3dae4f,
  palmLeafDark: 0x2a8a3e,
  umbrellaRed: 0xe53935,
  umbrellaCream: 0xfff7ec,
  umbrellaBlue: 0x2f6fd6,
  uiNavy: 0x173f66,
  uiTeal: 0x1e5e8c,
  uiRim: 0x7cc8f2,
  uiCream: 0xfff4dc,
  uiOrange: 0xff7a1a,
  uiYellow: 0xffc933,
  logoOutline: 0x5a2a10,
} as const;

export const CFG = {
  // ---- lanes & player ----
  laneX: [-2.2, 0, 2.2] as readonly number[],
  laneCount: 3,
  /** Exponential smoothing time-constant: ~95% of a lane change done in `laneChangeTime`. */
  laneChangeTime: 0.13,
  player: { w: 0.9, d: 0.8, h: 0.9 },
  hop: {
    airtime: 0.55,
    apex: 1.5,
    slamGravityMul: 3,
    slamKick: 11, // downward speed (m/s) given on slam
    buffer: 0.12,
  },
  bumpWobble: 0.25,
  trackHalfWidth: 3.4,

  // ---- speed ----
  speed: { start: 10, gain: 14, tau: 1800, tutorialCap: 9, wiggle: 0 },

  // ---- tiers & zones ----
  tierStarts: [0, 150, 700, 1600, 2800] as readonly number[],
  zoneStarts: [0, 700, 1600, 2800] as readonly number[],
  zoneNames: ['Sunny Shore', 'Boardwalk Pier', 'Tide Pool Cove', 'Sunset Lagoon'] as readonly string[],
  zoneBonus: 100,
  /** Sunset Lagoon fades to dusk between these distances (render only) */
  nightStart: 4000,
  nightFull: 5200,

  // ---- obstacles: hitbox w, d, h ----
  obstacle: {
    block: { w: 1.8, d: 1.2, h: 2.2 },
    low: { w: 2.0, d: 0.6, h: 0.6 },
    sweep: { w: 6.8, d: 1.4, h: 0.5 },
    roller: { w: 1.0, d: 1.0, h: 0.9 },
    gull: { w: 1.6, d: 1.0, h: 1.6 },
  },
  rollerSpeed: 5, // extra closing speed of beach balls
  gull: { warnTime: 1.2, landTime: 0.8, height: 7 },

  // ---- spawning ----
  spawnAhead: 115,
  despawnBehind: 8,
  gapMin: 8,
  gapMax: 14,
  breatherLength: 25,
  breatherEvery: [3, 4] as readonly number[],
  patternNoRepeat: 4,
  rowSpacingRefSpeed: 12,

  // ---- shells ----
  shell: { spacing: 2.5, radius: 0.9, big: 10, streakWindow: 0.5, y: 0.65 },
  closeShave: { window: 0.25, reward: 3 },

  // ---- power-ups ----
  powerupInterval: [300, 450] as readonly number[],
  powerupFirst: 150,
  powerupDurations: {
    // per upgrade level 0..4
    magnet: [8, 9.5, 11, 12.5, 14],
    shield: [12, 15, 18, 21, 24],
    rider: [4, 5, 6, 7, 8],
  },
  upgradeCosts: [200, 500, 1100, 2200] as readonly number[],
  magnetRange: { lanes: 2, ahead: 30 },
  riderSpeedMul: 1.35,
  riderHeight: 1.2,

  // ---- Island Hop (UPDATE2_PLAN.md §5) ----
  island: {
    /** each level is played inside its island's zone so it gets that zone's look */
    startOffset: 40,
    firstRowAt: 30,
    /** gap between sections at the 12 m/s reference speed */
    sectionGap: 13,
    flagAfter: 28,
    dollarY: 0.75,
    pickupRadius: 1.15,
    /** bounce pad: hop apex (m); high sand dollars float at the apex */
    padApex: 3.0,
    tidepool: { slow: 0.85, time: 1.0, w: 2.0, d: 2.6 },
    chase: { startGap: 15, creep: 0.42, bump: 4, hourglass: 4.5, maxGap: 22 },
    /** stars needed to open each island */
    gates: [0, 10, 24, 40] as readonly number[],
    speeds: [[10, 12.5], [11.5, 14], [13, 16], [14.5, 18]] as readonly (readonly [number, number])[],
    firstClearShells: [60, 90, 120, 160] as readonly number[],
  },

  // ---- economy ----
  crabPrices: { sandy: 0, chill: 450, blossom: 1200, skipper: 2200, pinch: 3500, dazzle: 0 } as Record<string, number>,
  goalRewards: [60, 120, 220, 400] as readonly number[],
  milestoneEvery: 500,

  // ---- input ----
  input: { swipeThreshold: 22, tapMaxMs: 300 },

  // ---- crash sequence ----
  crash: { hitStop: 0.07, slowMo: 0.4, slowMoTime: 0.6, resultsDelay: 1.0 },

  // ---- camera ----
  camera: { fov: 55, fovMaxSpeed: 62, height: 4.6, back: 7.0, lookAhead: 10, lookY: 0.6, portraitFovMax: 75 },

  // ---- fixed step ----
  simHz: 120,
} as const;

export type QualityName = 'low' | 'medium' | 'high';

export interface QualityPreset {
  name: QualityName;
  maxDpr: number;
  fogFar: number;
  sceneryDensity: number;
  maxParticles: number;
  oceanWaves: boolean;
  antialias: boolean;
  /** draw call / triangle budgets, checked in the ?debug overlay */
  drawCalls: number;
  triangles: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  high: { name: 'high', maxDpr: 2, fogFar: 110, sceneryDensity: 1, maxParticles: 200, oceanWaves: true, antialias: true, drawCalls: 100, triangles: 150_000 },
  medium: { name: 'medium', maxDpr: 1.5, fogFar: 100, sceneryDensity: 0.75, maxParticles: 140, oceanWaves: true, antialias: false, drawCalls: 80, triangles: 100_000 },
  low: { name: 'low', maxDpr: 1, fogFar: 85, sceneryDensity: 0.5, maxParticles: 80, oceanWaves: false, antialias: false, drawCalls: 60, triangles: 60_000 },
};

/** Speed in m/s at distance d (metres). */
export function speedAt(d: number): number {
  return CFG.speed.start + CFG.speed.gain * (1 - Math.exp(-Math.max(0, d) / CFG.speed.tau));
}

export function tierAt(d: number): number {
  let t = 0;
  for (let i = 0; i < CFG.tierStarts.length; i++) if (d >= (CFG.tierStarts[i] as number)) t = i;
  return t;
}

export function zoneAt(d: number): number {
  let z = 0;
  for (let i = 0; i < CFG.zoneStarts.length; i++) if (d >= (CFG.zoneStarts[i] as number)) z = i;
  return z;
}
