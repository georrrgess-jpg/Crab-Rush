/**
 * The 24 Island Hop levels (UPDATE2_PLAN.md §5.2). Each island adds one twist: Sunny Shore introduces
 * sand dollars, Boardwalk Pier gulls and boardwalk gaps, Tide Pool Cove slowing tide pools (T), Sunset
 * Lagoon bounce pads (^, and D = pad with a floating sand dollar). Level 6 of each island is a Great
 * Wave chase with hourglass shells (H). Every level is checked by the fairness solver and cleared by
 * the autopilot with all three sand dollars in tests/levels.test.ts.
 */
import type { LevelDef } from './levels';

/** Island pattern pools used to pad each course out to 35–75 s between its handcrafted sections. */
const POOLS: string[][] = [
  ['castle-left', 'log-hop', 'castle-pair', 'wave-1', 'ball-solo', 'gate', 'log-line', 'slalom-3'],
  ['gull-solo', 'wave-1', 'slalom-3', 'castle-log', 'gate', 'ball-pair', 'gull-pair', 'wave-wave'],
  ['castle-left', 'slalom-4', 'castle-log', 'ball-castle', 'gate', 'double-log', 'hop-then-dodge', 'gull-solo'],
  ['gauntlet-a', 'chicane', 'wave-ball-castle', 'double-roller', 'tight-slalom', 'gauntlet-b', 'wall-hop', 'ball-wave'],
];
/** dodge-only patterns (levels whose star needs "no hops") */
const DODGE_POOL = ['castle-left', 'slalom-3', 'gate', 'castle-pair', 'gull-solo', 'slalom-4'];

/**
 * Interleave `n` pool patterns between the handcrafted sections (after every other one), picked by
 * level so each course gets a different mix. Mirrors alternate.
 */
function filled(def: LevelDef, n: number, pool = POOLS[def.island] as string[]): LevelDef {
  const out = [...def.sections];
  let k = 0;
  for (let i = 2; i <= out.length && k < n; i += 3) {
    const id = pool[(def.index * 3 + k * 5) % pool.length] as string;
    out.splice(i, 0, { pattern: id, mirror: (def.index + k) % 2 === 1 });
    k++;
  }
  while (k < n) {
    const id = pool[(def.index * 3 + k * 5) % pool.length] as string;
    out.splice(out.length - 1, 0, { pattern: id, mirror: k % 2 === 0 });
    k++;
  }
  return { ...def, sections: out };
}

const L = (def: LevelDef): LevelDef => filled(def, def.chase ? 3 : def.island === 3 ? 4 : 5, def.star3.kind === 'noHops' ? DODGE_POOL : undefined);

export const LEVELS: LevelDef[] = [
  // ======================================================================= Sunny Shore
  L({
    id: 'shore-1', island: 0, index: 1, name: 'First Steps',
    star3: { kind: 'shells', pct: 0.8 },
    sections: [
      { pattern: 'castle-left' },
      { grid: `
        .s.
        .d.
        .s.` },
      { pattern: 'log-hop' },
      { grid: `
        s.B
        d..
        s.B` },
      { pattern: 'wave-1' },
      { grid: `
        ..d
        .s.
        B.s` },
      { pattern: 'castle-pair' },
    ],
  }),
  L({
    id: 'shore-2', island: 0, index: 2, name: 'Shell Seeker',
    star3: { kind: 'noBumps' },
    sections: [
      { pattern: 'castle-pair', mirror: true },
      { grid: `
        .B.
        d.s
        .B.`, spacing: 9 },
      { pattern: 'log-hop' },
      { grid: `
        s..
        sB.
        d..` },
      { pattern: 'wave-1' },
      { grid: `
        B.d
        .s.
        .s.` },
      { pattern: 'castle-left', mirror: true },
    ],
  }),
  L({
    id: 'shore-3', island: 0, index: 3, name: 'Hop Along',
    star3: { kind: 'noPower' },
    sections: [
      { pattern: 'log-hop' },
      { grid: `
        .s.
        .P.
        .s.`, powerup: 'magnet' },
      { pattern: 'log-line' },
      { grid: `
        .d.
        .s.
        .l.
        .s.`, spacing: 11 },
      { pattern: 'wave-1' },
      { grid: `
        d.s
        ...
        www
        .s.`, spacing: 11 },
      { pattern: 'castle-log' },
      { grid: `
        ..d
        B..` },
    ],
  }),
  L({
    id: 'shore-4', island: 0, index: 4, name: 'Ball Bay',
    star3: { kind: 'streak', n: 25 },
    sections: [
      { pattern: 'ball-solo' },
      { grid: `
        .s.
        d..
        ..r
        .s.`, spacing: 11 },
      { pattern: 'ball-pair' },
      { grid: `
        .d.
        ...
        r.r`, spacing: 11 },
      { pattern: 'wave-castle' },
      { grid: `
        s.d
        ...
        .r.`, spacing: 11 },
      { pattern: 'castle-pair' },
    ],
  }),
  L({
    id: 'shore-5', island: 0, index: 5, name: 'Castle Maze',
    star3: { kind: 'noBumps' },
    sections: [
      { pattern: 'slalom-3' },
      { grid: `
        B.B
        .d.
        B.B`, spacing: 9 },
      { pattern: 'gate' },
      { grid: `
        dB.
        .B.
        .Bs`, spacing: 9 },
      { pattern: 'wall-2' },
      { grid: `
        .s.
        d.B` },
      { pattern: 'castle-left' },
    ],
  }),
  L({
    id: 'shore-6', island: 0, index: 6, name: 'The Great Wave', chase: true,
    star3: { kind: 'hourglasses', n: 5 },
    sections: [
      { grid: `
        .s.
        .H.
        .s.` },
      { pattern: 'castle-left' },
      { grid: `
        H.s
        .B.` },
      { pattern: 'log-hop' },
      { grid: `
        .d.
        B.H` },
      { pattern: 'wave-1' },
      { grid: `
        s.H
        .s.
        d..` },
      { pattern: 'castle-pair' },
      { grid: `
        .H.
        B.B` },
      { pattern: 'log-line' },
      { grid: `
        H.d
        .s.` },
    ],
  }),

  // ======================================================================= Boardwalk Pier
  L({
    id: 'pier-1', island: 1, index: 1, name: 'Gull Watch',
    star3: { kind: 'noBumps' },
    sections: [
      { pattern: 'gull-solo' },
      { grid: `
        .d.
        .s.
        G..` },
      { pattern: 'castle-left' },
      { grid: `
        ..d
        ...
        www
        .s.`, spacing: 11 },
      { pattern: 'gull-pair' },
      { grid: `
        d..
        .s.` },
      { pattern: 'log-hop' },
    ],
  }),
  L({
    id: 'pier-2', island: 1, index: 2, name: 'Plank Run',
    star3: { kind: 'shells', pct: 0.85 },
    sections: [
      { pattern: 'wave-1' },
      { grid: `
        .s.
        sBs
        .d.` },
      { pattern: 'wave-wave' },
      { grid: `
        d.s
        .G.` },
      { pattern: 'slalom-3' },
      { grid: `
        .s.
        ..d
        B.B` },
      { pattern: 'gate' },
    ],
  }),
  L({
    id: 'pier-3', island: 1, index: 3, name: 'Shield Up',
    star3: { kind: 'streak', n: 30 },
    sections: [
      { grid: `
        .s.
        .P.
        .s.`, powerup: 'shield' },
      { pattern: 'ball-pair' },
      { grid: `
        .d.
        ...
        G.G`, spacing: 11 },
      { pattern: 'wave-castle' },
      { grid: `
        s.d
        .s.
        .s.` },
      { pattern: 'hop-chain' },
      { grid: `
        d..
        ...
        .l.`, spacing: 11 },
      { pattern: 'ball-castle' },
    ],
  }),
  L({
    id: 'pier-4', island: 1, index: 4, name: 'Rush Hour',
    star3: { kind: 'noBumps' },
    sections: [
      { pattern: 'slalom-3' },
      { grid: `
        .d.
        B.B` },
      { pattern: 'double-log' },
      { grid: `
        B.d
        .s.` },
      { pattern: 'wave-gull' },
      { grid: `
        d.B
        .s.` },
      { pattern: 'gull-gate' },
    ],
  }),
  L({
    id: 'pier-5', island: 1, index: 5, name: 'Boardwalk Maze',
    star3: { kind: 'shells', pct: 0.8 },
    sections: [
      { pattern: 'slalom-4' },
      { grid: `
        .d.
        B.B
        .s.` },
      { pattern: 'wall-hop' },
      { grid: `
        d.s
        .B.` },
      { pattern: 'gauntlet-b' },
      { grid: `
        ..d
        .s.` },
      { pattern: 'ball-wave' },
    ],
  }),
  L({
    id: 'pier-6', island: 1, index: 6, name: 'The Great Wave II', chase: true,
    star3: { kind: 'hourglasses', n: 5 },
    sections: [
      { grid: `
        .H.
        .s.` },
      { pattern: 'gull-solo' },
      { grid: `
        H.d
        .s.` },
      { pattern: 'wave-1' },
      { grid: `
        .H.
        G.G` },
      { pattern: 'slalom-3' },
      { grid: `
        d.H
        .s.` },
      { pattern: 'wave-castle' },
      { grid: `
        H..
        .B.
        ..H` },
      { pattern: 'gull-pair' },
      { grid: `
        .d.
        .s.` },
    ],
  }),

  // ======================================================================= Tide Pool Cove
  L({
    id: 'cove-1', island: 2, index: 1, name: 'Splash Zone',
    star3: { kind: 'noBumps' },
    sections: [
      { grid: `
        .s.
        T.T
        .s.` },
      { pattern: 'castle-left' },
      { grid: `
        .d.
        .T.
        .s.` },
      { pattern: 'log-hop' },
      { grid: `
        d.T
        .s.` },
      { pattern: 'wave-1' },
      { grid: `
        T.d
        .s.` },
      { pattern: 'castle-pair' },
    ],
  }),
  L({
    id: 'cove-2', island: 2, index: 2, name: 'Rock Garden',
    star3: { kind: 'shells', pct: 0.8 },
    sections: [
      { pattern: 'slalom-3' },
      { grid: `
        sT.
        .d.
        B.B` },
      { pattern: 'castle-log' },
      { grid: `
        .Td
        .s.` },
      { pattern: 'ball-castle' },
      { grid: `
        d.T
        ...
        .r.`, spacing: 11 },
      { pattern: 'gate' },
    ],
  }),
  L({
    id: 'cove-3', island: 2, index: 3, name: 'Tiptoe',
    star3: { kind: 'noHops' },
    sections: [
      { pattern: 'castle-left' },
      { grid: `
        .d.
        T.T` },
      { pattern: 'slalom-3' },
      { grid: `
        d.B
        .T.` },
      { pattern: 'gate' },
      { pattern: 'slalom-4' },
      { grid: `
        B.d
        .s.` },
      { pattern: 'castle-pair' },
    ],
  }),
  L({
    id: 'cove-4', island: 2, index: 4, name: 'Tide Rush',
    star3: { kind: 'time', s: 37 },
    sections: [
      { grid: `
        TsT
        .s.` },
      { pattern: 'log-line' },
      { grid: `
        .d.
        T.T
        .s.` },
      { pattern: 'wave-castle' },
      { grid: `
        d.T
        .T.` },
      { pattern: 'double-log' },
      { grid: `
        T.d
        .s.
        T.T` },
      { pattern: 'ball-wave' },
    ],
  }),
  L({
    id: 'cove-5', island: 2, index: 5, name: 'Gull Cove',
    star3: { kind: 'noBumps' },
    sections: [
      { pattern: 'gull-pair' },
      { grid: `
        .d.
        .T.` },
      { pattern: 'wave-gull' },
      { grid: `
        d.T
        .s.` },
      { pattern: 'tight-slalom' },
      { grid: `
        T.d
        .s.` },
      { pattern: 'gull-gate' },
      { pattern: 'hop-then-dodge' },
    ],
  }),
  L({
    id: 'cove-6', island: 2, index: 6, name: 'The Great Wave III', chase: true,
    star3: { kind: 'hourglasses', n: 5 },
    sections: [
      { grid: `
        .H.
        T.T` },
      { pattern: 'castle-log' },
      { grid: `
        H.d
        .T.` },
      { pattern: 'ball-castle' },
      { grid: `
        .H.
        ...
        T.T`, spacing: 11 },
      { pattern: 'slalom-3' },
      { grid: `
        d.H
        .s.` },
      { pattern: 'wave-gull' },
      { grid: `
        H.T
        .s.
        ..H` },
      { pattern: 'gate' },
      { grid: `
        .d.
        .s.` },
    ],
  }),

  // ======================================================================= Sunset Lagoon
  L({
    id: 'sunset-1', island: 3, index: 1, name: 'Bounce Beach',
    star3: { kind: 'noBumps' },
    sections: [
      { grid: `
        .s.
        ...
        .^.` },
      { pattern: 'castle-left' },
      { grid: `
        ...
        ...
        .D.`, spacing: 11 },
      { pattern: 'log-hop' },
      { grid: `
        ...
        ...
        D..`, spacing: 11 },
      { pattern: 'wave-1' },
      { grid: `
        ...
        ...
        ..D`, spacing: 11 },
      { pattern: 'castle-pair' },
    ],
  }),
  L({
    id: 'sunset-2', island: 3, index: 2, name: 'Sky Shells',
    star3: { kind: 'shells', pct: 0.75 },
    sections: [
      { pattern: 'slalom-3' },
      { grid: `
        ...
        ...
        ^.D`, spacing: 11 },
      { pattern: 'ball-pair' },
      { grid: `
        .s.
        ...
        .D.`, spacing: 11 },
      { pattern: 'wave-castle' },
      { grid: `
        ...
        ...
        D.^`, spacing: 11 },
      { pattern: 'gauntlet-b' },
    ],
  }),
  L({
    id: 'sunset-3', island: 3, index: 3, name: 'Torch Run',
    star3: { kind: 'noBumps' },
    sections: [
      { pattern: 'tight-slalom' },
      { grid: `
        .d.
        B.B` },
      { pattern: 'wave-ball-castle' },
      { grid: `
        ...
        ...
        D..`, spacing: 11 },
      { pattern: 'chicane' },
      { grid: `
        ..d
        .s.` },
      { pattern: 'wall-hop' },
    ],
  }),
  L({
    id: 'sunset-4', island: 3, index: 4, name: 'Lagoon Leap',
    star3: { kind: 'noPower' },
    sections: [
      { grid: `
        .s.
        .P.
        .s.`, powerup: 'rider' },
      { pattern: 'double-roller' },
      { grid: `
        ...
        ...
        .D.`, spacing: 11 },
      { pattern: 'gauntlet-a' },
      { grid: `
        d.s
        .s.` },
      { pattern: 'wave-gull' },
      { grid: `
        ...
        ...
        ..D`, spacing: 11 },
      { pattern: 'hop-then-dodge' },
    ],
  }),
  L({
    id: 'sunset-5', island: 3, index: 5, name: 'Night Gauntlet',
    star3: { kind: 'streak', n: 40 },
    sections: [
      { pattern: 'chicane' },
      { grid: `
        .d.
        .s.` },
      { pattern: 'gauntlet-a' },
      { grid: `
        ...
        ...
        D..`, spacing: 11 },
      { pattern: 'wave-ball-castle' },
      { grid: `
        ..d
        .s.` },
      { pattern: 'gauntlet-b' },
      { pattern: 'tight-slalom' },
    ],
  }),
  L({
    id: 'sunset-6', island: 3, index: 6, name: 'The Great Wave IV', chase: true,
    star3: { kind: 'hourglasses', n: 5 },
    sections: [
      { grid: `
        .H.
        .s.` },
      { pattern: 'chicane' },
      { grid: `
        H.^
        .s.` },
      { pattern: 'wave-gull' },
      { grid: `
        ...
        .H.
        D..`, spacing: 11 },
      { pattern: 'gauntlet-a' },
      { grid: `
        H.d
        .s.` },
      { pattern: 'double-roller' },
      { grid: `
        ...
        H..
        ..D`, spacing: 11 },
      { pattern: 'gauntlet-b' },
      { grid: `
        .H.
        .s.` },
    ],
  }),
];

export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));
