/**
 * Handcrafted obstacle patterns (PLAN.md §2.7). Templates are written top-down: the first line is the
 * FARTHEST row, the last line is the row that reaches the player first. Columns are lanes left→right.
 *
 *   . empty   B block   L low (hop or dodge)   W sweep (always the whole row)   R roller   G gull
 *   s shell path   S big shell   P power-up slot   l / r / w = low / roller / sweep with a shell arc over it
 *
 * Update 9: shell marks in consecutive rows (same or next lane) join into one shell line, and a line
 * runs on through an arc (l, r, the lanes of a www row next to it, a scuttler's landing lane next to
 * it). Lines are laid by the spawner (lean shells for lane changes, arcs shaped like the real hop);
 * tests/lines.test.ts checks every line is a fair path at its tier's speeds and is collected whole by
 * a player who follows it.
 */
import { CFG } from '../config';
import { Cell, emptyRow, hopWindow, type SolverRow } from './solver';

export interface PatternDef {
  id: string;
  minTier: number;
  /** highest tier it is used in (default: all later tiers) */
  maxTier?: number;
  weight: number;
  /** row spacing in metres at the 12 m/s reference speed */
  spacing: number;
  template: string;
}

export interface Pattern {
  def: PatternDef;
  /** rows in arrival order (nearest first), each exactly 3 chars */
  rows: string[];
  hasPower: boolean;
  /** Update 7: bit mask of the hazards it uses (see `HAZARDS`) */
  hazards?: number;
}

/** Update 7: hazard kinds a run introduces one at a time; bit i of `Pattern.hazards` is HAZARDS[i]. */
export const HAZARDS = ['block', 'low', 'sweep', 'roller', 'gull', 'scuttle'] as const;
const HAZARD_CHARS = ['B', 'Ll', 'Ww', 'Rr', 'G', '<>'];

/** The easy, isolated pattern each hazard debuts in, before any combo that uses it. */
export const INTRO_PATTERNS: Record<(typeof HAZARDS)[number], string> = {
  block: 'castle-left',
  low: 'log-hop',
  sweep: 'wave-1',
  roller: 'ball-solo',
  gull: 'gull-solo',
  scuttle: 'scuttle-intro',
};

export function hazardMask(rows: readonly string[]): number {
  let m = 0;
  for (const r of rows) for (let i = 0; i < HAZARD_CHARS.length; i++) for (const c of HAZARD_CHARS[i] as string) if (r.includes(c)) m |= 1 << i;
  return m;
}

function p(id: string, minTier: number, weight: number, spacing: number, template: string, maxTier?: number): PatternDef {
  const def: PatternDef = { id, minTier, weight, spacing, template };
  if (maxTier !== undefined) def.maxTier = maxTier;
  return def;
}

export const PATTERN_DEFS: PatternDef[] = [
  // ---------------- tier 0: learning patterns ----------------
  p('castle-left', 0, 3, 10, `
    s..
    sB.
    s..`),
  p('castle-pair', 0, 3, 9, `
    s.B
    .s.
    B.s`),
  p('log-hop', 0, 3, 10, `
    .s.
    .l.
    .s.`),
  p('wave-1', 0, 2, 12, `
    .s.
    www
    .s.`),
  p('ball-solo', 1, 3, 12, `
    .s.
    .r.
    .s.`),
  p('power-arc', 0, 0, 10, `
    .s.
    .P.
    .l.
    .s.`),

  // ---------------- tier 1 ----------------
  p('slalom-3', 1, 3, 9, `
    Bs.
    sB.
    s.B`),
  p('wall-2', 1, 2, 8, `
    BBs
    BBs`),
  p('gate', 1, 3, 9, `
    BsB
    .s.`),
  p('log-line', 1, 2, 12, `
    .l.
    .s.
    .l.`),
  p('ball-pair', 1, 3, 12, `
    .s.
    r.r
    .s.`),
  p('castle-log', 1, 2, 10, `
    .s.
    lBl
    .s.`),
  p('wave-castle', 1, 3, 12, `
    sB.
    www
    .s.`),
  p('wide-log', 1, 2, 10, `
    .s.
    lls
    .s.`, 2),

  // ---------------- tier 2: gulls & tighter lines ----------------
  p('gull-solo', 2, 3, 12, `
    s..
    sG.
    s..`),
  p('gull-pair', 2, 3, 10, `
    G.s
    .s.
    s.G`),
  p('wave-wave', 2, 2, 11, `
    .s.
    www
    .s.
    www
    .s.`),
  p('ball-castle', 2, 3, 10, `
    sBB
    .r.
    .s.`),
  p('double-log', 2, 2, 10, `
    .s.
    .ll
    .s.`),
  p('slalom-4', 2, 3, 9, `
    BsB
    sBB
    BsB
    BBs`),
  p('hop-chain', 2, 2, 12, `
    .l.
    .l.
    .l.`),
  p('power-line', 2, 0, 10, `
    .s.
    .P.
    .s.`),

  // ---------------- tier 3 ----------------
  p('wave-gull', 3, 3, 12, `
    G..
    .s.
    www
    .s.`),
  p('ball-wave', 3, 3, 12, `
    .s.
    www
    .r.
    .s.`),
  p('tight-slalom', 3, 3, 8.5, `
    BsB
    sBB
    BsB
    BBs`),
  p('hop-then-dodge', 3, 3, 10, `
    sB.
    .s.
    .l.
    .s.`),
  p('gull-gate', 3, 2, 10, `
    G.G
    .s.
    .s.`),
  p('double-roller', 3, 3, 12, `
    r..
    ..r
    .s.`),
  p('wall-hop', 3, 2, 11, `
    .s.
    BBl
    .s.`),

  // ---------------- tier 4 ----------------
  p('chicane', 4, 3, 9, `
    BBs
    BsB
    sBB
    BsB
    BBs`),
  p('wave-ball-castle', 4, 3, 12, `
    .s.
    sBB
    sR.
    www
    .s.`),
  p('gauntlet-a', 4, 3, 11, `
    sB.
    l.l
    sR.
    www
    .s.`),
  p('gauntlet-b', 4, 3, 10, `
    G.s
    .l.
    BsB
    .s.`),

  // ---------------- Update 4: scuttlers (< > cross one lane) and double waves ----------------
  p('scuttle-intro', 2, 3, 12, `
    .s.
    s>.
    s..
    s..`),
  p('scuttle-cross', 2, 2, 11, `
    ..s
    >.s
    ..s`),
  p('scuttle-castle', 3, 3, 11, `
    .s.
    B>.
    ..s`),
  p('double-wave', 3, 3, 9, `
    .s.
    www
    .s.
    www
    .s.`),
  p('wave-scuttle', 3, 2, 12, `
    .s.
    www
    .<.
    s..`),
  p('scuttle-pair', 4, 3, 11, `
    s..
    .<.
    ...
    .>.
    ..s`),
  p('triple-threat', 4, 2, 11, `
    .s.
    BsB
    s>.
    www
    .s.`),
  // ---------------- Update 9: hop and lane change in sequence (the shell line shows the way) ----------------
  p('hop-step', 1, 1, 10, `
    sB.
    s..
    .l.
    .s.`),
  p('step-hop', 1, 1, 10, `
    .s.
    .l.
    s..
    sB.`),
  p('slide-wave', 2, 1, 12, `
    s..
    www
    s..
    .sB`),
  p('ball-weave', 2, 1, 12, `
    ..s
    B.s
    .r.
    .s.`),
  // ---------------- tier 5: Riptide (4 km+) ----------------
  p('riptide-a', 5, 3, 10, `
    .s.
    GsB
    .<s
    www
    LsL
    .s.`),
  p('riptide-b', 5, 3, 10, `
    s..
    sBB
    >s.
    .s.
    BBs
    ..s`),
  p('riptide-c', 5, 3, 9, `
    .s.
    www
    .s.
    www
    BsB
    .s.`),
  p('riptide-d', 5, 2, 10, `
    ..s
    .Rs
    B>.
    .s.
    .lB
    s..`),
];

export function parseTemplate(def: PatternDef): Pattern {
  const lines = def.template
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rows = lines.reverse(); // arrival order: nearest first
  for (const r of rows) {
    if (r.length !== CFG.laneCount) throw new Error(`pattern ${def.id}: row "${r}" must have ${CFG.laneCount} cells`);
    if (/[^.BLWRGsSPlrw<>]/.test(r)) throw new Error(`pattern ${def.id}: bad char in "${r}"`);
    if ((r[0] === '<') || (r[r.length - 1] === '>')) throw new Error(`pattern ${def.id}: a scuttler can't leave the track (${r})`);
    if (/[Ww]/.test(r) && r !== 'WWW' && r !== 'www') throw new Error(`pattern ${def.id}: sweep rows must be whole (${r})`);
  }
  return { def, rows, hasPower: rows.some((r) => r.includes('P')), hazards: hazardMask(rows) };
}

export const PATTERNS: Pattern[] = PATTERN_DEFS.map(parseTemplate);
export const PATTERN_BY_ID = new Map(PATTERNS.map((pt) => [pt.def.id, pt]));

export function mirrorRow(r: string): string {
  // scuttlers flip direction with the row
  return r.split('').reverse().map((c) => (c === '<' ? '>' : c === '>' ? '<' : c)).join('');
}

export function patternRows(pt: Pattern, mirror: boolean): string[] {
  return mirror ? pt.rows.map(mirrorRow) : pt.rows;
}

/** Row spacing in metres at speed v (grows gently with speed so the time between rows shrinks slowly). */
export function rowSpacing(base: number, v: number): number {
  return base * Math.sqrt(Math.max(1, v / CFG.rowSpacingRefSpeed));
}

/** Convert pattern rows to solver rows for speed v. */
export function toSolverRows(rows: readonly string[], v: number): SolverRow[] {
  const O = CFG.obstacle;
  const lowW = hopWindow(O.low.h, O.low.d, v);
  const sweepW = hopWindow(O.sweep.h, O.sweep.d, v);
  const rollW = hopWindow(O.roller.h, O.roller.d, v + CFG.rollerSpeed);
  const scutW = hopWindow(O.scuttle.h, O.scuttle.d, v);
  return rows.map((r) => {
    const row = emptyRow();
    if (r === 'WWW' || r === 'www') {
      row.sweep = true;
      for (let l = 0; l < 3; l++) {
        row.cells[l] = Cell.Hop;
        row.lo[l] = sweepW.lo;
        row.hi[l] = sweepW.hi;
      }
      return row;
    }
    for (let l = 0; l < 3; l++) {
      const ch = r[l] as string;
      if (ch === 'B' || ch === 'G') row.cells[l] = Cell.Solid;
      else if (ch === 'L' || ch === 'l') {
        row.cells[l] = Cell.Hop;
        row.lo[l] = lowW.lo;
        row.hi[l] = lowW.hi;
      } else if (ch === 'R' || ch === 'r') {
        row.cells[l] = Cell.Hop;
        row.lo[l] = rollW.lo;
        row.hi[l] = rollW.hi;
      }
    }
    // scuttlers: both the lane they leave and the lane they enter count as occupied (hop to clear)
    for (let l = 0; l < 3; l++) {
      const ch = r[l] as string;
      if (ch !== '<' && ch !== '>') continue;
      for (const ll of [l, l + (ch === '>' ? 1 : -1)]) {
        if (row.cells[ll] === Cell.Solid) continue;
        if (row.cells[ll] === Cell.Hop) {
          row.lo[ll] = Math.max(row.lo[ll] as number, scutW.lo);
          row.hi[ll] = Math.min(row.hi[ll] as number, scutW.hi);
        } else {
          row.cells[ll] = Cell.Hop;
          row.lo[ll] = scutW.lo;
          row.hi[ll] = scutW.hi;
        }
      }
    }
    return row;
  });
}
