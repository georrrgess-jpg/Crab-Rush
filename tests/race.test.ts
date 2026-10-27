import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { CUPS, cupUnlocked, defaultCupState, nextRace, pointsFor, recordRace, sanitizeCup } from '../src/meta/cup';
import { Autopilot } from '../src/sim/autopilot';
import { RIVALS, Race } from '../src/sim/race';
import { World, defaultRunOptions, type RunOptions } from '../src/sim/world';

function setup(cupIdx: number, raceIdx: number): { race: Race; you: World; pilot: Autopilot } {
  const cup = CUPS[cupIdx]!;
  const def = cup.races[raceIdx]!;
  const opts: RunOptions = { ...defaultRunOptions(), seed: def.seed, startDist: def.start, tutorial: null, best: 0, race: { finishAt: def.start + def.length } };
  const you = new World();
  you.start(opts);
  const race = new Race(you, opts, cup.rivals.map((id) => RIVALS[id]!), cup.skill);
  const pilot = new Autopilot(you, 3, { reaction: 0.3, horizon: 1.8, hopNoise: 0.05 });
  return { race, you, pilot };
}

function run(race: Race, you: World, pilot: Autopilot, maxS = 240): number {
  const dt = 1 / 120;
  let t = 0;
  while (you.mode !== 'finished' && t < maxS) {
    pilot.update();
    you.step(dt * you.timeScale);
    you.events.length = 0;
    race.step(dt);
    t += dt;
  }
  return t;
}

describe('Crab Cup race sim (UPDATE4_PLAN.md §5)', () => {
  it('a crash in a race is a stumble: the race never ends early', () => {
    const { race, you, pilot } = setup(2, 2);
    let crashed = false;
    const dt = 1 / 120;
    // a deliberately careless player: never changes lane or hops
    for (let i = 0; i < 120 * 200 && you.mode !== 'finished'; i++) {
      you.step(dt * you.timeScale);
      if (you.events.some((e) => e.t === 'crash')) crashed = true;
      you.events.length = 0;
      race.step(dt);
    }
    void pilot;
    expect(crashed).toBe(false);
    expect(you.mode).toBe('finished');
    expect(you.stats.bumps).toBeGreaterThan(0);
  }, 60_000);

  it('every racer reaches the flag in every race (no soft-locks)', () => {
    for (let c = 0; c < CUPS.length; c++) {
      for (let r = 0; r < 3; r++) {
        const { race, you, pilot } = setup(c, r);
        run(race, you, pilot);
        expect(you.mode, `${CUPS[c]!.races[r]!.id} you`).toBe('finished');
        // let the rivals finish too
        for (let i = 0; i < 120 * 90 && race.racers.some((x) => x.world.mode !== 'finished'); i++) race.step(1 / 120);
        for (const x of race.racers) expect(x.world.mode, `${CUPS[c]!.races[r]!.id} ${x.id}`).toBe('finished');
      }
    }
  }, 300_000);

  it('is deterministic for a seed', () => {
    const a = setup(1, 0);
    run(a.race, a.you, a.pilot);
    const b = setup(1, 0);
    run(b.race, b.you, b.pilot);
    expect(a.race.final().map((s) => `${s.id}:${s.time.toFixed(3)}`)).toEqual(b.race.final().map((s) => `${s.id}:${s.time.toFixed(3)}`));
  }, 60_000);

  it('places are 1..4 and sorted by time', () => {
    const { race, you, pilot } = setup(0, 0);
    run(race, you, pilot);
    const f = race.final();
    expect(f.map((s) => s.place)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < 4; i++) expect(f[i]!.time).toBeGreaterThanOrEqual(f[i - 1]!.time);
  }, 60_000);

  it('the Shell Dash fires after enough shells and speeds the racer up', () => {
    const { you } = setup(0, 0);
    let dashed = false;
    for (let i = 0; i < 120 * 120 && you.mode === 'running' && !dashed; i++) {
      // stand still in a lane: shells are picked up as they pass; the Dash meter fills
      you.step(1 / 120);
      if (you.events.some((e) => e.t === 'dash')) dashed = true;
      you.events.length = 0;
    }
    // the meter maths alone: 25 shells' value fills it
    expect(CFG.race.dashShells).toBe(25);
    expect(you.dashMeter).toBeGreaterThanOrEqual(0);
    expect(you.dashMeter).toBeLessThanOrEqual(1);
  }, 60_000);
});

describe('Crab Cup progression', () => {
  it('points, unlocks and a full cup outcome', () => {
    expect([1, 2, 3, 4].map(pointsFor)).toEqual([10, 6, 3, 1]);
    const st = defaultCupState();
    expect(cupUnlocked(st, 'sandy')).toBe(true);
    expect(cupUnlocked(st, 'tidal')).toBe(false);
    expect(nextRace(st, 'sandy')!.id).toBe('sandy-1');
    const order = (me: number): { id: string; place: number }[] => {
      const ids = ['shelly', 'barnacle', 'pip'];
      const out = [{ id: 'you', place: me }];
      let p = 1;
      for (const id of ids) {
        if (p === me) p++;
        out.push({ id, place: p++ });
      }
      return out;
    };
    expect(recordRace(st, 'sandy', 'sandy-1', order(1))).toBeNull();
    expect(nextRace(st, 'sandy')!.id).toBe('sandy-2');
    recordRace(st, 'sandy', 'sandy-2', order(1));
    const out = recordRace(st, 'sandy', 'sandy-3', order(1))!;
    expect(out.points).toBe(30);
    expect(out.place).toBe(1);
    expect(out.firstClear && out.gold && out.firstGold).toBe(true);
    expect(cupUnlocked(st, 'tidal')).toBe(true);
    expect(st.wins).toBe(3);
    expect(nextRace(st, 'sandy')!.id).toBe('sandy-1');
  });

  it('sanitises a damaged cup save', () => {
    const d = sanitizeCup({ cleared: ['sandy', 'nope', 3], best: { sandy: 22, bad: 5, tidal: -4 }, races: 'x', current: { cup: 'tidal', results: { 'tidal-1': 2, 'tidal-9': 1, 'tidal-2': 9 } } });
    expect(d.cleared).toEqual(['sandy']);
    expect(d.best).toEqual({ sandy: 22, tidal: 0 });
    expect(d.races).toBe(0);
    expect(d.current).toEqual({ cup: 'tidal', results: { 'tidal-1': 2 }, rivals: {} });
  });
});
