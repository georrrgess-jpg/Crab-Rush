/**
 * Update 9 shell lines and juice events (UPDATE9_PLAN.md, Gameplay track).
 * - Every shell line the spawner lays is a fair path (the fairness solver, held to the line).
 * - A player who follows a line collects all of it, at every tier speed (line-following autopilot).
 * - Combo, perfect line, perfect hop, lane dodge, and the close-shave-after-bump fix.
 */
import { describe, expect, it } from 'vitest';
import { CFG, speedAt } from '../src/config';
import { Autopilot } from '../src/sim/autopilot';
import type { GameEvent } from '../src/sim/events';
import { PATTERNS, PATTERN_BY_ID, patternRows, rowSpacing, toSolverRows, type Pattern } from '../src/sim/patterns';
import { Spawner, buildStrands, fairStrands, followable, solverChars } from '../src/sim/spawner';
import type { Shell } from '../src/sim/types';
import { World, defaultRunOptions, hopHeight, hopRiseTime } from '../src/sim/world';

const DT = 1 / 120;

/** a running world with an empty track (no more patterns spawn) */
function bare(startDist = 300, god = false): World {
  const w = new World();
  w.start({ ...defaultRunOptions(), seed: 9, startDist, tutorial: null, god });
  w.entities.length = 0;
  w.shells.length = 0;
  const sp = w.spawner as unknown as { lastRowWz: number; archDone: boolean[]; bannerDone: boolean };
  sp.lastRowWz = 1e9;
  sp.archDone = [true, true, true, true];
  sp.bannerDone = true;
  return w;
}

/** place one pattern 40 m ahead of a bare world */
function placeAlone(pt: Pattern, mirror: boolean, startDist: number, lane: number): World {
  const w = bare(startDist);
  w.player.lane = w.player.prevLane = lane;
  w.player.x = w.player.prevX = CFG.laneX[lane] as number;
  const sp = w.spawner as unknown as { lastRowWz: number; place: (...a: unknown[]) => void };
  const wz0 = w.dist + 40;
  sp.place(pt, mirror, wz0, w.speedForDist(wz0), false);
  sp.lastRowWz = 1e9;
  return w;
}

function stepUntil(w: World, done: () => boolean, max = 1200): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let i = 0; i < max && !done(); i++) {
    w.step(DT);
    evs.push(...w.events);
    w.events.length = 0;
  }
  return evs;
}

/** record which shells get picked up */
const picked = new Set<number>();
const proto = World.prototype as unknown as { pickShell: (s: Shell) => void };
const pickShell = proto.pickShell;

/** the track positions a pattern is tested at: its debut, a little into every later tier it plays in, and 6 km */
function startsFor(pt: Pattern): number[] {
  const t0 = CFG.tierStarts[pt.def.minTier] as number;
  const end = CFG.tierStarts[(pt.def.maxTier ?? 99) + 1] ?? Infinity;
  return [t0 + 5, ...CFG.tierStarts.filter((d) => d > t0 && d < end).map((d) => d + 300), ...(end === Infinity ? [6000] : [])];
}

describe('Update 9 shell lines', () => {
  it('the hop arc helpers match the hop: apex, airtime, rise', () => {
    const T = CFG.hop.airtime;
    let top = 0;
    for (let t = 0; t <= T; t += 0.001) top = Math.max(top, hopHeight(t));
    expect(top).toBeCloseTo(CFG.hop.apex, 2);
    expect(hopHeight(T + 0.01)).toBe(0);
    expect(hopHeight(hopRiseTime(1) as number)).toBeCloseTo(1, 3);
    expect(hopRiseTime(CFG.hop.apex + 0.1)).toBeNull();
  });

  it('marks link into lines: an arc carries the line over a log, a www row arcs over the lane the line arrives in', () => {
    const log = buildStrands(PATTERN_BY_ID.get('log-hop')!.rows, (i) => i * 10);
    expect(log.length).toBe(1);
    expect(log[0]!.pts.map((q) => `${q.lane}${q.arc ? 'a' : ''}`)).toEqual(['1', '1a', '1']);
    const wave = buildStrands(PATTERN_BY_ID.get('wave-castle')!.rows, (i) => i * 10);
    expect(wave.length).toBe(1);
    expect(wave[0]!.pts.map((q) => `${q.lane}${q.arc ? 'a' : ''}`)).toEqual(['1', '1a', '0']);
    expect(Spawner.lineKind(wave[0]!, false)).toBe('hopTurn');
  });

  it('every line the spawner lays is a fair path, and lines are designed fair at the speed their pattern debuts', () => {
    const cut: string[] = [];
    for (const pt of PATTERNS) {
      for (const start of startsFor(pt)) {
        const v = speedAt(start);
        for (const mirror of [false, true]) {
          const rows = patternRows(pt, mirror);
          const sp = rowSpacing(pt.def.spacing, v);
          const sr = toSolverRows(rows.map(solverChars), v);
          const dts = rows.map((_, i) => (i === 0 ? 1.0 : sp / v));
          const raw = buildStrands(rows, (i) => i * sp);
          const fair = fairStrands(raw, rows, sp, v);
          for (const st of fair) expect(followable(sr, dts, st.pts), `${pt.def.id} v=${v.toFixed(1)}`).toBe(true);
          if (start === startsFor(pt)[0] && raw.some((st) => !followable(sr, dts, st.pts))) cut.push(`${pt.def.id} m=${mirror}`);
        }
      }
    }
    expect(cut).toEqual([]);
  });

  it('every shell is reachable from a lane centre (turns are lean shells, not shells between lanes)', () => {
    for (const pt of PATTERNS) {
      const w = placeAlone(pt, false, startsFor(pt)[0] as number, 1);
      for (const s of w.shells) {
        const off = Math.min(...CFG.laneX.map((x) => Math.abs(s.x - x)));
        expect(off, pt.def.id).toBeLessThanOrEqual(CFG.lines.lean + 1e-6);
      }
    }
  });

  it('a player who follows a line collects all of it, at every tier speed, in both mirror states', () => {
    proto.pickShell = function (s: Shell) {
      picked.add(s.id);
      pickShell.call(this, s);
    };
    const fails: string[] = [];
    let lines = 0;
    try {
      for (const pt of PATTERNS) {
        for (const start of startsFor(pt)) {
          for (const mirror of [false, true]) {
            const ids = new Set(placeAlone(pt, mirror, start, 1).shells.map((s) => s.line));
            for (const line of ids) {
              const probe = placeAlone(pt, mirror, start, 1);
              if (probe.shells.filter((s) => s.line === line).length < 2) continue;
              lines++;
              // the best of the three lanes the player could line up in before the pattern
              let best = -1;
              let why = '';
              for (const lane of [0, 1, 2]) {
                const w = placeAlone(pt, mirror, start, lane);
                const mine = w.shells.filter((s) => s.line === line);
                const last = Math.max(...mine.map((s) => s.wz));
                picked.clear();
                const ap = new Autopilot(w);
                ap.followLines = true;
                ap.preferLine = line;
                for (let n = 0; w.mode === 'running' && w.dist < last + 30 && n < 120 * 20; n++) {
                  ap.update();
                  w.step(DT);
                  w.events.length = 0;
                }
                const got = mine.filter((s) => picked.has(s.id)).length;
                const ok = w.mode === 'running' && w.stats.bumps === 0;
                if (ok && got > best) best = got;
                if (!ok) why = w.mode === 'running' ? 'bump' : `crash ${w.crashKind}`;
                if (ok && got === mine.length) break;
              }
              const total = probe.shells.filter((s) => s.line === line).length;
              if (best !== total) fails.push(`${pt.def.id} v=${speedAt(start).toFixed(1)} mirror=${mirror}: ${best}/${total} ${why}`);
            }
          }
        }
      }
    } finally {
      proto.pickShell = pickShell;
    }
    expect(lines).toBeGreaterThan(400);
    expect(fails).toEqual([]);
  }, 120_000);

  it('the line-following autopilot collects most shells and arc shells over whole runs', () => {
    proto.pickShell = function (s: Shell) {
      picked.add(s.id);
      pickShell.call(this, s);
    };
    let passed = 0;
    let got = 0;
    let arcs = 0;
    let arcGot = 0;
    try {
      for (const seed of [2, 5, 11, 17]) {
        const w = new World();
        w.start({ ...defaultRunOptions(), seed, tutorial: null });
        const ap = new Autopilot(w);
        ap.followLines = true;
        picked.clear();
        const seen = new Map<number, boolean>();
        for (let n = 0; w.mode === 'running' && w.dist < 3000 && n < 120 * 400; n++) {
          ap.update();
          w.step(DT);
          w.events.length = 0;
          for (const s of w.shells) if (!seen.has(s.id) && !s.magnet && s.wz < w.dist + 1) seen.set(s.id, s.y > CFG.shell.y + 0.05);
        }
        expect(w.mode, `seed ${seed}`).toBe('running');
        for (const [id, arc] of seen) {
          passed++;
          if (picked.has(id)) got++;
          if (arc) {
            arcs++;
            if (picked.has(id)) arcGot++;
          }
        }
      }
    } finally {
      proto.pickShell = pickShell;
    }
    // (two shells side by side can't both be had, so 100% is out of reach)
    expect(got / passed).toBeGreaterThan(0.78);
    expect(arcGot / arcs).toBeGreaterThan(0.75);
  }, 120_000);

  it('breathers are shell rivers, and Big Shells sit only on risky points (a hop apex, beside a block) or a river end', () => {
    const w = new World();
    w.start({ ...defaultRunOptions(), seed: 21, tutorial: null, god: true });
    const proto2 = Spawner.prototype as unknown as { place: (pt: Pattern, ...rest: unknown[]) => void };
    const place = proto2.place;
    const rivers: string[][] = [];
    const riverEnds: number[] = [];
    const bad: string[] = [];
    let bigs = 0;
    proto2.place = function (pt: Pattern, ...rest: unknown[]) {
      const before = new Set(w.shells.map((s) => s.id));
      place.call(this, pt, ...rest);
      if (pt.def.id === 'breather') {
        rivers.push(pt.rows.slice());
        riverEnds.push((rest[1] as number) + (pt.rows.length - 1) * pt.def.spacing);
      }
      // each new Big Shell: high on a hop's arc, beside a block or gull of its row, or a river's end
      for (const s of w.shells) {
        if (!s.big || before.has(s.id)) continue;
        bigs++;
        const apex = s.y > CFG.shell.y + 0.5;
        const beside = w.entities.some((e) => (e.kind === 'block' || e.kind === 'gull') && Math.abs(e.wz - s.wz) < 0.5 && Math.abs(Math.abs(e.x - s.x) - 2.2) < 0.1);
        const end = riverEnds.some((z) => Math.abs(z - s.wz) < 0.5);
        if (!apex && !beside && !end) bad.push(`${pt.def.id} at ${s.wz.toFixed(0)}`);
      }
    };
    try {
      while (w.dist < 5000) {
        w.step(DT);
        w.events.length = 0;
      }
    } finally {
      proto2.place = place;
    }
    expect(rivers.length).toBeGreaterThan(5);
    for (const r of rivers) {
      expect(r.length).toBe(CFG.lines.riverRows);
      let turns = 0;
      for (let i = 1; i < r.length; i++) if (r[i]!.search(/[sSP]/) !== r[i - 1]!.search(/[sSP]/)) turns++;
      expect(turns).toBeLessThanOrEqual(2);
    }
    expect(bigs).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  }, 60_000);
});

describe('Update 9 combo and near misses', () => {
  it('the combo counts shells in a row; a shell of the followed line slipping by breaks it', () => {
    const w = bare(300, true);
    const line = w.beginLine('zig');
    for (let i = 0; i < 6; i++) w.addShell(0, CFG.shell.y, w.dist + 5 + i * 3, false, line);
    for (let i = 6; i < 9; i++) w.addShell(2.2, CFG.shell.y, w.dist + 5 + i * 3, false, line);
    const evs = stepUntil(w, () => w.combo >= 6);
    expect(w.combo).toBe(6);
    expect(w.followingLine).toBe(line);
    expect(evs.filter((e) => e.t === 'shell').every((e) => e.t === 'shell' && e.combo > 0)).toBe(true);
    // stay in the middle lane: the line's shells in the right lane slip by
    const after = stepUntil(w, () => w.shells.every((s) => s.wz < w.dist - 2));
    const br = after.find((e) => e.t === 'comboBreak');
    expect(br && br.t === 'comboBreak' && br.n).toBe(6);
    expect(w.combo).toBe(0);
    expect(w.stats.maxCombo).toBe(6);
  });

  it('a shell that slips by in the crab’s own lane breaks the combo; shells far off in other lanes do not', () => {
    const w = bare(300, true);
    const a = w.beginLine('trail');
    for (let i = 0; i < 5; i++) w.addShell(0, CFG.shell.y, w.dist + 5 + i * 3, false, a);
    const other = w.beginLine('trail');
    w.addShell(-2.2, CFG.shell.y, w.dist + 25, false, other);
    stepUntil(w, () => w.dist > w.shells[w.shells.length - 1]!.wz + 3);
    expect(w.combo).toBe(5);
    // a shell high over the crab's lane: it passes overhead uncollected
    w.addShell(0, 3.5, w.dist + 6, false, w.beginLine('trail'));
    const evs = stepUntil(w, () => w.combo === 0, 240);
    expect(evs.some((e) => e.t === 'comboBreak')).toBe(true);
  });

  it('a whole line collected is a perfect line (with its bonus); short or plain lines are not', () => {
    const w = bare(300, true);
    const zig = w.beginLine('zig');
    const n = CFG.lines.perfectMin;
    for (let i = 0; i < n; i++) w.addShell(0, CFG.shell.y, w.dist + 5 + i * 3, false, zig);
    const bonus0 = w.stats.bonus;
    const evs = stepUntil(w, () => w.shells.length === 0 || w.shells.every((s) => s.dead || s.wz < w.dist - 2));
    const pl = evs.find((e) => e.t === 'perfectLine');
    expect(pl).toMatchObject({ t: 'perfectLine', kind: 'zig', n, bonus: CFG.lines.bonus.zig });
    expect(w.stats.bonus - bonus0).toBe(CFG.lines.bonus.zig);
    expect(w.stats.perfectLines).toBe(1);
    const trail = w.beginLine('trail');
    for (let i = 0; i < n; i++) w.addShell(0, CFG.shell.y, w.dist + 5 + i * 3, false, trail);
    const short = w.beginLine('arc');
    for (let i = 0; i < 3; i++) w.addShell(0, CFG.shell.y, w.dist + 40 + i * 3, false, short);
    const evs2 = stepUntil(w, () => w.shells.every((s) => s.dead || s.wz < w.dist - 2));
    expect(evs2.some((e) => e.t === 'perfectLine')).toBe(false);
  });

  /** hop over an obstacle `off` seconds before it reaches the crab; returns the events and whether the run survived */
  function hopAt(kind: 'low' | 'roller' | 'sweep', off: number): { evs: GameEvent[]; alive: boolean } {
    const w = bare(300);
    const ahead = w.dist + 40;
    const e = w.addEntity(kind, 1, ahead, kind === 'roller' ? { vz: -CFG.rollerSpeed, meetWz: ahead } : {});
    const meet = e.meetWz ?? e.wz;
    stepUntil(w, () => (meet - w.dist) / w.speed <= off);
    w.act('hop');
    const evs = stepUntil(w, () => w.dist > meet + 4 || w.mode !== 'running');
    return { evs, alive: w.mode === 'running' };
  }

  it('a hop that clears a hop obstacle by a hair is a perfect hop; a well-centred hop is not', () => {
    const T = CFG.hop.airtime;
    for (const kind of ['low', 'roller', 'sweep'] as const) {
      const centred = hopAt(kind, T / 2);
      expect(centred.alive, kind).toBe(true);
      expect(centred.evs.some((e) => e.t === 'perfectHop'), kind).toBe(false);
      // later and later take-offs: the last ones that still clear it are perfect hops
      const perfect: GameEvent[] = [];
      for (let off = T / 2; off > 0.05; off -= 0.01) {
        const r = hopAt(kind, off);
        if (!r.alive) break;
        perfect.push(...r.evs.filter((e) => e.t === 'perfectHop'));
      }
      expect(perfect.length, kind).toBeGreaterThan(0);
      for (const ph of perfect) {
        if (ph.t !== 'perfectHop') continue;
        // the solver box's top is close to (not exactly) each skin's real top
        expect(ph.margin).toBeLessThan(CFG.perfectHop.tight * (CFG.hop.apex - CFG.obstacle[kind].h) + 0.1);
        expect(ph.kind).toBe(kind);
        expect(ph.reward).toBe(CFG.perfectHop.reward);
      }
    }
  });

  /** in the obstacle's lane, move right `off` seconds before it reaches the crab */
  function dodgeAt(kind: 'block' | 'low', off: number): { evs: GameEvent[]; alive: boolean; bumps: number } {
    const w = bare(300);
    const e = w.addEntity(kind, 1, w.dist + 40, {});
    stepUntil(w, () => (e.wz - w.dist) / w.speed <= off);
    w.act('right');
    const evs = stepUntil(w, () => w.dist > e.wz + 4 || w.mode !== 'running');
    return { evs, alive: w.mode === 'running', bumps: w.stats.bumps };
  }

  it('a last-moment lane change past a block is a lane dodge (and a close shave); an early one is neither', () => {
    let last: ReturnType<typeof dodgeAt> | null = null;
    for (let off = 0.3; off > 0.05; off -= 0.01) {
      const r = dodgeAt('block', off);
      if (!r.alive || r.bumps > 0) break;
      last = r;
    }
    const ld = last?.evs.find((e) => e.t === 'laneDodge');
    expect(ld).toMatchObject({ t: 'laneDodge', kind: 'block', side: -1, reward: CFG.laneDodge.reward });
    expect(last?.evs.some((e) => e.t === 'closeShave')).toBe(true);
    const early = dodgeAt('block', 0.6);
    expect(early.evs.some((e) => e.t === 'laneDodge' || e.t === 'closeShave')).toBe(false);
    // a log dodged at the last moment: a lane dodge (logs never paid a close shave)
    let log: ReturnType<typeof dodgeAt> | null = null;
    for (let off = 0.3; off > 0.05; off -= 0.01) {
      const r = dodgeAt('low', off);
      if (!r.alive || r.bumps > 0) break;
      log = r;
    }
    expect(log?.evs.some((e) => e.t === 'laneDodge')).toBe(true);
  });

  it('bouncing off the side of a block is not a close shave, and it breaks the combo', () => {
    const w = bare(300);
    w.player.lane = w.player.prevLane = 0;
    w.player.x = w.player.prevX = CFG.laneX[0] as number;
    const line = w.beginLine('trail');
    for (let i = 0; i < 6; i++) w.addShell(CFG.laneX[0] as number, CFG.shell.y, w.dist + 2 + i * 2, false, line);
    stepUntil(w, () => w.combo >= 6);
    const b = w.addEntity('block', 1, w.dist + 0.4, {});
    w.act('right');
    const evs = stepUntil(w, () => w.dist > b.wz + 3 || w.mode !== 'running');
    expect(w.mode).toBe('running');
    expect(evs.some((e) => e.t === 'bump')).toBe(true);
    expect(evs.some((e) => e.t === 'closeShave')).toBe(false);
    expect(evs.find((e) => e.t === 'comboBreak')).toMatchObject({ n: 6 });
  });

  it('landing from the Wave Rider clears scuttlers just ahead too', () => {
    const w = bare(800);
    w.activate('rider');
    const s = w.addEntity('scuttle', 1, w.dist + 12, { toLane: 2 });
    w.power.t = 0.001;
    w.step(DT);
    expect(w.power.kind).toBeNull();
    expect(s.dead).toBe(true);
  });
});
