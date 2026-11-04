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

/** Update 8: an obstacle hitbox (see CFG.obstacle.shapes) */
export interface HitShape {
  shape: 'box' | 'drum' | 'ball';
  w: number;
  d: number;
  h: number;
  /** box only: x/z corner radius */
  r?: number;
}

export const CFG = {
  // ---- lanes & player ----
  laneX: [-2.2, 0, 2.2] as readonly number[],
  laneCount: 3,
  /** Lane glide (a critically damped spring): ~95% of a lane change done in `laneChangeTime`. */
  laneChangeTime: 0.17,
  /** Update 8 lane polish */
  lane: {
    /** a second same-way lane input made before the glide is this far along (0..1) waits, then chains on */
    chainAt: 0.35,
    /** a queued lane input (during a glide or a bump wobble) is dropped after this long (s) */
    buffer: 0.25,
    /** a reversal mid-glide keeps this share of the glide's speed (the spring turns it back from there) */
    turnKeep: 0.5,
  },
  /** Update 8: the crab's shell (not its legs or claws); tests/hitbox.test.ts checks it against the model */
  player: { w: 1.22, d: 0.96, h: 0.85 },
  hop: {
    /** total airtime (s) and apex (m) of a hop; the arc below keeps both exact */
    airtime: 0.55,
    apex: 1.5,
    /** Update 8 arc: gravity × fallMul on the way down (a snappier fall), and × hangMul while
     * |vy| < hangSpeed (m/s) so the crab hangs at the top; the take-off speed is solved so the
     * airtime and apex stay as above */
    fallMul: 1.3,
    hangSpeed: 1.8,
    hangMul: 0.5,
    slamGravityMul: 3,
    slamKick: 11, // downward speed (m/s) given on slam
    /** Sand Slam shockwave: shells this far ahead (m) in the lane and its neighbours fly in */
    slamReach: 6,
    /** a hop pressed this long (s) before landing fires on landing */
    buffer: 0.12,
    /** a hop pressed this long (s) after dropping off something (an obstacle top, the Wave Rider) still fires */
    coyote: 0.1,
  },
  bumpWobble: 0.25,
  trackHalfWidth: 3.4,

  // ---- speed ----
  // Update 4: a steeper climb to a higher top speed (28 m/s)
  // Update 7: `warm` eases the climb in over the first few hundred metres (the curve starts flat, then
  // joins the Update 4 ramp shifted back by `warm` m), so the first ~45 s build confidence
  speed: { start: 11, gain: 17, tau: 1000, warm: 260, tutorialCap: 9, wiggle: 0 },

  // ---- Daily Tide modifiers (UPDATE2_PLAN.md §6.2) ----
  daily: {
    lowTideSpeed: 1.15,
    /** shell strand spacing multiplier on Low Tide (smaller = denser) */
    lowTideShells: 0.6,
    /** Magnet Madness: the speed ramp's time constant is divided by this */
    madnessRamp: 2,
    /** pattern weight multipliers for the themed days */
    themeWeight: 5,
    shellScore: 2,
    firstFinishShells: 100,
  },

  // ---- tiers & zones ----
  // tier 5 (4 km+) is the Riptide: mixed hazards, short breathers
  tierStarts: [0, 150, 600, 1400, 2400, 4000] as readonly number[],
  zoneStarts: [0, 700, 1600, 2800] as readonly number[],
  zoneNames: ['Sunny Shore', 'Boardwalk Pier', 'Tide Pool Cove', 'Sunset Lagoon'] as readonly string[],
  zoneBonus: 100,
  /** Sunset Lagoon fades to dusk between these distances (render only) */
  nightStart: 4000,
  nightFull: 5200,

  // ---- obstacles: hitbox w, d, h ----
  // Update 8: each kind's w/d/h is the *solver box* the fairness solver, autopilot and spawner plan
  // with; tests/hitbox.test.ts proves a hop timed anywhere in its window clears every real shape.
  // The real hitboxes are `shapes` (per zone skin, per model variant), fitted to the models.
  obstacle: {
    block: { w: 1.85, d: 1.18, h: 1.85 },
    low: { w: 1.95, d: 0.62, h: 0.63 },
    sweep: { w: 6.8, d: 1.45, h: 0.6 },
    roller: { w: 1.02, d: 1.02, h: 1.0 },
    gull: { w: 0.84, d: 1.42, h: 1.45 },
    /** Update 4: a rock crab that scuttles one lane sideways as it approaches (hop it or dodge) */
    scuttle: { w: 1.25, d: 0.9, h: 0.68 },
    /**
     * Update 8 hitboxes, measured against the models (tests/hitbox.test.ts: 75–100% of each model's
     * bounds, ~93% here). shape 'box': a box whose x/z corners are rounded by r; 'drum': a cylinder
     * lying along x (round in y/z: logs, the wave); 'ball': a sphere. h is the top (drum/ball: top of
     * the circle, so the centre is h − d/2). Indexed [skin][variant]: skin 0 shore (and sunset), 1
     * boardwalk, 2 tide pools; variant = entity id % 2, the same pick the renderer makes.
     */
    shapes: {
      block: [
        [{ shape: 'box', w: 1.65, d: 1.15, h: 1.85, r: 0.2 }, { shape: 'box', w: 1.65, d: 1.15, h: 1.85, r: 0.2 }],
        [{ shape: 'box', w: 1.85, d: 1.12, h: 2.0, r: 0.08 }, { shape: 'box', w: 1.85, d: 1.12, h: 2.0, r: 0.08 }],
        [{ shape: 'box', w: 1.65, d: 1.18, h: 2.0, r: 0.2 }, { shape: 'box', w: 1.65, d: 1.18, h: 2.0, r: 0.2 }],
      ],
      low: [
        [{ shape: 'drum', w: 1.95, d: 0.58, h: 0.6 }, { shape: 'drum', w: 1.95, d: 0.62, h: 0.63 }],
        [{ shape: 'box', w: 1.9, d: 0.55, h: 0.57, r: 0.05 }, { shape: 'box', w: 1.9, d: 0.55, h: 0.57, r: 0.05 }],
        [{ shape: 'box', w: 1.8, d: 0.6, h: 0.48, r: 0.12 }, { shape: 'box', w: 1.8, d: 0.6, h: 0.48, r: 0.12 }],
      ],
      /** the wave (skin 0/2) and the boardwalk gap (skin 1: fall in once you are over the hole) */
      sweep: [
        [{ shape: 'drum', w: 6.8, d: 1.45, h: 0.6 }, { shape: 'drum', w: 6.8, d: 1.45, h: 0.6 }],
        [{ shape: 'box', w: 6.8, d: 0.75, h: 0.45, r: 0 }, { shape: 'box', w: 6.8, d: 0.75, h: 0.45, r: 0 }],
        [{ shape: 'drum', w: 6.8, d: 1.45, h: 0.6 }, { shape: 'drum', w: 6.8, d: 1.45, h: 0.6 }],
      ],
      roller: [[{ shape: 'ball', w: 1.02, d: 1.02, h: 1.06 }, { shape: 'ball', w: 1.02, d: 1.02, h: 1.06 }]],
      /** a landed gull, wings folded */
      gull: [[{ shape: 'box', w: 0.84, d: 1.42, h: 1.45, r: 0.2 }, { shape: 'box', w: 0.84, d: 1.42, h: 1.45, r: 0.2 }]],
      /** a landed coconut (gull alt 1) */
      coconut: [[{ shape: 'ball', w: 0.76, d: 0.76, h: 0.8 }, { shape: 'ball', w: 0.76, d: 0.76, h: 0.8 }]],
      scuttle: [[{ shape: 'box', w: 1.25, d: 0.88, h: 0.68, r: 0.15 }, { shape: 'box', w: 1.25, d: 0.88, h: 0.68, r: 0.15 }]],
    } as Record<string, readonly (readonly HitShape[])[]>,
    /** coming down onto an obstacle's top from at most this far below it lands on it (no lip snag) */
    lip: 0.06,
    /** a side contact that overlaps this little (m) while the crab heads for another lane is a bump, not a crash */
    graze: 0.1,
  },
  /** Crab Cup races (UPDATE4_PLAN.md §5.2) */
  race: {
    /** a crash is a stumble: this long at `stumbleSpeed`, then invulnerable for `recover` */
    stumble: 0.9,
    stumbleSpeed: 0.4,
    recover: 1.0,
    /** shells (value) to fill the Shell Dash meter; the dash lasts `dashTime` at `dashSpeed`, smashing through */
    dashShells: 25,
    dashTime: 2.5,
    dashSpeed: 1.35,
    /** rivals' gentle catch-up: up to this speed change, reached at `bandGap` metres behind or ahead */
    band: 0.03,
    bandGap: 60,
    points: [10, 6, 3, 1] as readonly number[],
  },
  /** scuttler timing, in seconds before it reaches the player: claws up at `warn`, crossing between `from` and `to` */
  scuttle: { warn: 1.9, from: 1.35, to: 0.75 },
  rollerSpeed: 5, // extra closing speed of beach balls
  gull: { warnTime: 1.2, landTime: 0.8, height: 7 },

  // ---- spawning ----
  spawnAhead: 115,
  despawnBehind: 8,
  gapMin: 8,
  gapMax: 14,
  /** gap range between patterns per tier (Update 4: tighter as the run goes on). Update 7: the value
   *  glides from one tier's entry to the next across the tier (no step at the boundary). */
  gapByTier: [[9, 15], [8, 13.5], [7, 11.5], [6.5, 10.5], [6, 9.5], [5.5, 8.5]] as readonly (readonly [number, number])[],
  /** patterns between breathers per tier (blended across the tier like the gaps) */
  breatherByTier: [[3, 3], [3, 4], [4, 5], [5, 6], [5, 7], [6, 7]] as readonly (readonly [number, number])[],
  /** Update 7: patterns new in this tier fade in, weight × lerp(a, b) over the first `newPatternRamp` of the tier */
  newPatternWeight: [0.45, 1.5] as readonly number[],
  newPatternRamp: 0.5,
  /** Update 7: each hazard (block, log, wave, ball, gull, scuttler) first appears alone in its intro
   *  pattern (`INTRO_PATTERNS`), at most one new hazard per `introGap` patterns */
  introGap: 2,
  breatherLength: 25,
  breatherEvery: [3, 4] as readonly number[],
  patternNoRepeat: 4,
  rowSpacingRefSpeed: 12,

  // ---- shells ----
  // Update 9: spacing 2.5 → 3.2 (shell lines run continuously through arcs and turns now, and the
  // spacing grows with speed; see `lines`)
  shell: { spacing: 3.2, radius: 0.9, big: 10, streakWindow: 0.5, y: 0.65 },
  closeShave: { window: 0.25, reward: 3 },
  /**
   * Update 9 shell lines (spawner): every strand of shells is a "line" the player can follow.
   * - lane changes: two lean shells `lean` m off their lane centres (one reachable from each lane),
   *   at least `leanGapT` s apart, kept `clearAfter` m (+ `clearAfterT` s of travel) past the row
   *   being left and `clearBefore` m (+ `clearBeforeT` s) short of the next one. The turn sits at
   *   `turnAt` of that free stretch, or `turnEarly` when a block waits in the lane being left.
   * - arcs over hop obstacles follow the real hop arc at the row's speed, taking off half an
   *   airtime before the obstacle (the middle of its hop window).
   * - `bigChance`: per pattern, one Big Shell on the riskiest point of its lines (a hop's apex, or
   *   right beside a block). Breathers lay a `riverRows`-row river with a Big Shell at its end
   *   (`riverBig` chance).
   * - a line of `perfectMin`+ shells collected whole pays `bonus[kind]` and `fever` of the Fever meter.
   */
  lines: {
    /** line spacing grows with speed like row spacing: shell.spacing × max(1, v/12)^spacingExp */
    spacingExp: 0.75,
    lean: 0.8,
    leanGapT: 0.16,
    clearAfter: 1.1,
    clearAfterT: 0.06,
    clearBefore: 1.1,
    clearBeforeT: 0.05,
    /** a turn always ends at least this long (s of travel) before the line point it leads to */
    leadT: 0.1,
    turnAt: 0.5,
    turnEarly: 0.3,
    bigChance: 0.06,
    riverRows: 5,
    riverBig: 0.1,
    /** a 'perfectLine' needs at least this many shells (and a turn, an arc or a river: not a plain trail) */
    perfectMin: 8,
    bonus: { trail: 0, zig: 1, arc: 0, hopTurn: 2, river: 1 } as Record<string, number>,
    fever: 0.04,
  },
  /**
   * Update 9 combo: shells collected in a row without letting one slip by. A shell slips by once it
   * is `behind` m behind the crab uncollected; that breaks the combo when it belongs to the line of
   * the last pickup, or when it passed within `reach` m sideways (right through the crab's lane).
   * A 'combo' event fires every `every`; a 'comboBreak' only for combos of `breakMin` or more.
   */
  combo: { behind: 1.5, reach: 0.75, every: 10, breakMin: 5 },
  /** Update 9: a hop that clears a hop obstacle with less than `tight` of the hop's spare height
   *  (apex − obstacle top) left over is a perfect hop (+`reward`, and `fever` of the meter) */
  perfectHop: { tight: 0.35, reward: 2, fever: 0.06 },
  /** Update 9: a lane change that gets the crab out of an obstacle's way at the last moment: it
   *  passed less than `gap` m from the crab's side, `window` s or less after the move (+`reward`) */
  laneDodge: { gap: 0.45, window: 0.3, reward: 2, fever: 0.06 },

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
  /** Update 5: the magnet reaches the neighbouring lanes and 16 m ahead (was 2 lanes, 30 m) */
  magnetRange: { lanes: 1, ahead: 16 },
  /** pulled shells: flight time = base + perMetre × distance; arc = how high the curve bows (m) */
  /** Shell Fever (Beach Run, Daily Tide): `shells` of shell value fill the meter (close shaves add
   * `shave`); a Fever lasts `time` s with 2× shells and a short pull (`reach` m); the meter drains at
   * `decay`/s after `idle` s without a pickup */
  // (Update 9: shells 45 → 62, as shell lines are easier to follow: about as many Fevers per km as before)
  fever: { shells: 62, shave: 0.12, time: 6, reach: 7, idle: 3, decay: 0.05 },
  /** Second Chance: clear obstacles this far ahead (m), blink for `invuln` s, restart at `speed` × pace;
   * pearl cost per use today after the daily free one */
  revive: { clear: 32, invuln: 2.2, speed: 0.6, costs: [5, 10, 20, 30], window: 5 },
  /** Treasure Dig (UPDATE5_PLAN.md §3): spades held, site prizes, chests, spades earned */
  dig: {
    startSpades: 6,
    /** spades given to players whose Crab Cove was retired (save v4 → v5) */
    legacySpades: 10,
    maxSpades: 50,
    shellPiles: 6,
    pileBase: 25,
    pileGrow: 6,
    pearlTiles: 2,
    spadeTiles: 3,
    chestShells: 300,
    chestGrow: 120,
    chestPearls: 10,
    /** a Beach Run pays 1 spade + 1 per `perMetres`, up to `runCap`; Daily Tide adds `daily` */
    runCap: 6,
    perMetres: 400,
    daily: 3,
  },
  /** Update 5: no power-up within powerupGap m of another; no shell within powerupClear m of one */
  powerupGap: 12,
  powerupClear: 1.4,
  pull: { base: 0.16, perMetre: 0.022, arc: 0.9 },
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
    /** Tide Rush (UPDATE3_PLAN.md §5.1): speed multiplier, no power-ups */
    rushSpeed: 1.18,
    ringBonus: 5,
    chests: [6, 12, 18],
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

  // ---- Update 8 map detail and run FX ----
  /** ripple groups per track side on near tiles (High; Medium half), gull-track trails per near tile,
   *  and how far up the beach the dried-foam line sits from the water's edge (m) */
  scenery: { rippleGroups: 5, trackTrails: 3, tideLine: 2.75 },
  /** contact shadow: height where the blob is widest/faintest, height below which the dark core shows,
   *  core opacity. Landing puff scales with fall speed / landPuffRef, clamped; grains per lane change;
   *  mean seconds between shoreline foam splashes */
  fx: { contactFadeH: 2.2, contactCoreH: 0.6, contactCoreAlpha: 0.9, landPuffRef: 9, landPuffMin: 0.35, landPuffMax: 1.6, sprayGrains: 8, foamEvery: 0.22 },

  /** the opening animation (src/ui/splash.ts): the intro holds at least `minMs` from page start (so
   *  the logo, burst and crab all land; a tap skips the wait), the wave wipe lasts `wipeMs`
   *  (match `sp-wipe` in splash.css), and the sun has `rays` rays */
  splash: { minMs: 2700, wipeMs: 1100, rays: 18 },

  // ---- Update 9 render knobs: shell (coin) animation and pickup FX, ambient life, ocean rollers,
  //      cloud drift, obstacle LOD/shadow distances and the scuttler rig, wind sway ----
  shellFx: { shellRowPhase: 0.55, shellBob: 0.075, shellBobRate: 3.4, shellFlipEvery: 2.6, shellFlipTime: 0.5, shellFlipWave: 0.045, shellGlintEvery: 1.9, shellGlintTime: 0.42, bigScale: 1.75, bigPingEvery: 1.3, bigOrbiters: 3, magnetStretch: 0.8, magnetSpin: 16, magnetTrail: 3, ghostLife: 0.24, popLife: 0.32, bigPopLife: 0.45, burstStars: 7, popLift: 0.35, bigBurstStars: 12, powerTwinkles: 5, powerShimmerEvery: 1.6 },
  life: { overheadGulls: 3, overheadY: 6.5, overheadSpeed: 5, overheadWait: 5, fishWait: 2.6, hermits: 2, hermitSpeed: 0.35, hermitShy: 4.5, skyGulls: 5, miniCrabs: 5 },
  ocean: { rollEvery: 5.6, rollFrom: 14, rollSkew: 0.006 },
  clouds: { cloudSpan: 340, cloudSpeedMin: 1.6, cloudSpeedMax: 3.2, cloudEdge: 50 },
  obstacleView: { richDist: 24, shadowDist: 26, scuttleAnim: { stride: 0.7, legLift: 0.6, legSwing: 0.22, roll: 0.14, yaw: 0.2, bob: 0.035, clawRaise: 1.05, clawSpread: 0.55, snapHz: 2.4, snapOpen: 0.6, blend: 9 } },
  wind: { palmSway: 0.26, frondSway: 0.09 },

  /** UI (Update 9): the controls coach strip shows at the start of the player's first `coachRuns` runs */
  ui: { coachRuns: 3 },

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
  const S = CFG.speed;
  const x = Math.max(0, d);
  // warm-up: the effective distance grows from 0 at slope 0 to (d − warm)
  const e = x - S.warm * (1 - Math.exp(-x / S.warm));
  return S.start + S.gain * (1 - Math.exp(-e / S.tau));
}

/** Update 7: how far through its tier d is (0 at the tier start, 1 at the next; 0 in the top tier). */
export function tierProgress(d: number): number {
  const t = tierAt(d);
  const a = CFG.tierStarts[t] as number;
  const b = CFG.tierStarts[t + 1];
  return b === undefined ? 0 : Math.min(1, Math.max(0, (d - a) / (b - a)));
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
