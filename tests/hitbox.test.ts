/**
 * Update 8 hit detection (UPDATE8_PLAN.md, Mechanics & hit detection).
 * - every obstacle hitbox is a forgiving fit of the model it is drawn with (75–100% per axis)
 * - the player box is the crab's shell, not its legs or claws
 * - a hop timed anywhere in the solver's window clears every real hitbox (fairness stays exact)
 * - swept tests: no tunnelling at top speed or on a long step, corner grazes bump, lips don't snag
 * - hop arc, jump buffer, coyote time, lane queue and reversal
 * HITBOX=1 prints the measured table.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CFG, type HitShape } from '../src/config';
import { BODY_SKINS, buildCrab } from '../src/render/models/crab';
import { GeoBuilder } from '../src/render/geo';
import * as O from '../src/render/models/obstacles';
import { hopWindow } from '../src/sim/solver';
import type { GameEvent } from '../src/sim/events';
import type { Entity, EntityKind } from '../src/sim/types';
import { HOP_ARC, World, defaultRunOptions, hitShapeFor } from '../src/sim/world';

const DT = 1 / 120;
const LOG = !!process.env.HITBOX;

// ------------------------------------------------------------------ model measurement

interface Bounds {
  /** the full bounding box */
  full: THREE.Box3;
  /** the box holding the middle 96% of the surface area on each axis (drops flags, stubs, beads) */
  core: THREE.Box3;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _tri = new THREE.Triangle();

/** Bounds of a geometry (optionally only the vertices bound to bones `keep` accepts; `move` poses them). */
function measure(geo: THREE.BufferGeometry, opts: { keep?: (bone: number) => boolean; move?: (v: THREE.Vector3, bone: number) => void; lift?: number } = {}): Bounds {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const si = g.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const full = new THREE.Box3();
  const pts: number[][] = [[], [], []];
  const wts: number[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const bone = si ? si.getX(i) : 0;
    if (opts.keep && !opts.keep(bone)) continue;
    const vs = [_a.fromBufferAttribute(pos, i), _b.fromBufferAttribute(pos, i + 1), _c.fromBufferAttribute(pos, i + 2)];
    for (const v of vs) {
      opts.move?.(v, bone);
      v.y += opts.lift ?? 0;
      full.expandByPoint(v);
    }
    const area = _tri.set(_a, _b, _c).getArea();
    for (const v of vs) {
      pts[0]!.push(v.x);
      pts[1]!.push(v.y);
      pts[2]!.push(v.z);
      wts.push(area / 3);
    }
  }
  const total = wts.reduce((s, w) => s + w, 0);
  const trim = 0.02 * total;
  const lo: number[] = [];
  const hi: number[] = [];
  for (let ax = 0; ax < 3; ax++) {
    const order = wts.map((_, i) => i).sort((p, q) => pts[ax]![p]! - pts[ax]![q]!);
    let acc = 0;
    for (const i of order) if ((acc += wts[i]!) >= trim) { lo.push(pts[ax]![i]!); break; }
    acc = 0;
    for (let k = order.length - 1; k >= 0; k--) if ((acc += wts[order[k]!]!) >= trim) { hi.push(pts[ax]![order[k]!]!); break; }
  }
  return { full, core: new THREE.Box3(new THREE.Vector3(lo[0], lo[1], lo[2]), new THREE.Vector3(hi[0], hi[1], hi[2])) };
}

/** a landed gull with its wings folded back along the body (the renderer's landed pose) */
function foldedGull(): Bounds {
  const joints = O.GULL_JOINTS;
  const q = new THREE.Quaternion();
  return measure(O.gullGeometry(), {
    move: (v, bone) => {
      if (bone !== 4 && bone !== 5) return;
      const j = joints[bone]!.pos;
      q.setFromEuler(new THREE.Euler(0, bone === 4 ? -1.45 : 1.45, bone === 4 ? 0.2 : -0.2));
      v.set(v.x - j[0], v.y - j[1], v.z - j[2]).applyQuaternion(q).add(new THREE.Vector3(j[0], j[1], j[2]));
    },
  });
}

interface Case {
  name: string;
  kind: EntityKind;
  skin: number;
  variant: number;
  alt?: number;
  model: () => Bounds;
  /** check the height too (not for the boardwalk gap, which is a hole) */
  height: boolean;
}

const CASES: Case[] = [];
const add = (name: string, kind: EntityKind, skin: number, model: (v: number) => Bounds, height = true, alt?: number): void => {
  for (const variant of [0, 1]) CASES.push({ name: `${name}${variant}`, kind, skin, variant, alt, model: () => model(variant), height });
};
// every obstacle as entities.ts draws it at rest (obstacles.ts `obstacleModel`): the wave without its
// flat hop chevrons, the ball resting on the sand, the scuttler with its claws down
const names: Record<string, string[]> = { block: ['castle', 'crates', 'boulder'], low: ['log', 'barrier', 'urchins'], sweep: ['wave', 'gap', 'wave'] };
for (const kind of ['block', 'low', 'sweep'] as const) {
  for (const skin of [0, 1, 2]) {
    // the boardwalk gap is a hole in the planks (drawn by entities.ts), not a model to measure
    if (kind === 'sweep' && skin !== 0) continue;
    add(names[kind]![skin]!, kind, skin, (v) => measure(O.obstacleModel(kind, skin, v)));
  }
}
add('ball', 'roller', 0, () => measure(O.obstacleModel('roller', 0)));
add('scuttler', 'scuttle', 0, () => measure(O.obstacleModel('scuttle', 0)));
add('gull', 'gull', 0, () => foldedGull());
add('coconut', 'gull', 0, () => measure(O.coconut(), { lift: 0.42 }), true, 1);

const shapeOf = (c: Case): HitShape => hitShapeFor(c.kind, c.skin, c.variant, c.alt) as HitShape;

describe('Update 8 hitboxes match the models', () => {
  const rows: string[] = [];
  for (const c of CASES) {
    it(`${c.name}: ${c.kind} skin ${c.skin}`, () => {
      const s = shapeOf(c);
      const { full, core } = c.model();
      const size = (b: THREE.Box3): THREE.Vector3 => b.getSize(new THREE.Vector3());
      const fs = size(full);
      const cs = size(core);
      const axes: [string, number, number, number, number, number][] = [
        // axis, hitbox extent, core extent, full extent, hitbox min, hitbox max (model space)
        ['x', s.w, cs.x, fs.x, -s.w / 2, s.w / 2],
        ['z', s.d, cs.z, fs.z, -s.d / 2, s.d / 2],
      ];
      if (c.height) axes.push(['h', s.h, core.max.y, full.max.y, 0, s.h]);
      const line = axes.map(([ax, hit, cv, fv]) => `${ax} ${hit.toFixed(2)}/${cv.toFixed(2)} (${((hit / cv) * 100).toFixed(0)}%, drawn ${fv.toFixed(2)})`).join('  ');
      rows.push(`${c.name.padEnd(10)} ${s.shape.padEnd(4)} ${line}`);
      for (const [ax, hit, cv, fv, lo, hi] of axes) {
        // a forgiving fit: at least 75% of the model's body, never bigger than anything drawn
        expect(hit / cv, `${c.name} ${ax}: hitbox ${hit.toFixed(2)} vs model ${cv.toFixed(2)}`).toBeGreaterThanOrEqual(0.75);
        expect(hit / cv, `${c.name} ${ax}: hitbox ${hit.toFixed(2)} vs model ${cv.toFixed(2)}`).toBeLessThanOrEqual(ax === 'x' && c.kind === 'sweep' ? 1.1 : 1.0);
        expect(hit, `${c.name} ${ax}: hitbox ${hit.toFixed(2)} vs drawn ${fv.toFixed(2)}`).toBeLessThanOrEqual(fv + 1e-6);
        // and it sits inside the drawn model on both sides
        const [mn, mx] = ax === 'x' ? [full.min.x, full.max.x] : ax === 'z' ? [full.min.z, full.max.z] : [full.min.y, full.max.y];
        if (ax !== 'h') expect(lo, `${c.name} ${ax} min`).toBeGreaterThanOrEqual(mn - 0.02);
        expect(hi, `${c.name} ${ax} max`).toBeLessThanOrEqual(mx + 0.02);
      }
    });
  }

  it('the player box is the crab shell, not its legs and claws', () => {
    const clay = new GeoBuilder();
    const gloss = new GeoBuilder();
    const line = new GeoBuilder();
    buildCrab(BODY_SKINS[0]!, true, clay, gloss, line);
    // bones 0/1: root and body (the carapace); legs, claws, eyes and mouth ride other bones
    const shell = measure(gloss.build(), { keep: (b) => b <= 1 });
    const whole = measure(clay.build());
    const Pl = CFG.player;
    const cs = shell.core.getSize(new THREE.Vector3());
    rows.push(`player     box  x ${Pl.w.toFixed(2)}/${cs.x.toFixed(2)} (${((Pl.w / cs.x) * 100).toFixed(0)}%)  z ${Pl.d.toFixed(2)}/${cs.z.toFixed(2)} (${((Pl.d / cs.z) * 100).toFixed(0)}%)  h ${Pl.h.toFixed(2)}/${shell.core.max.y.toFixed(2)}  (legs+claws span ${whole.full.getSize(new THREE.Vector3()).x.toFixed(2)})`);
    for (const [hit, m] of [[Pl.w, cs.x], [Pl.d, cs.z], [Pl.h, shell.core.max.y]] as [number, number][]) {
      expect(hit / m).toBeGreaterThanOrEqual(0.75);
      expect(hit / m).toBeLessThanOrEqual(1.0);
    }
    expect(Pl.w).toBeLessThan(whole.full.getSize(new THREE.Vector3()).x * 0.6);
    if (LOG) console.log(`\nhitbox / model (core)\n${rows.join('\n')}\n`);
  });

  it('every skin of every hop obstacle has a hitbox (sunset reuses the shore)', () => {
    for (const k of ['block', 'low', 'sweep'] as EntityKind[]) for (const skin of [0, 1, 2, 3]) for (const id of [10, 11]) expect(hitShapeFor(k, skin, id)).not.toBeNull();
    expect(hitShapeFor('block', 3, 4)).toBe(hitShapeFor('block', 0, 4));
    expect(hitShapeFor('powerup', 0, 1)).toBeNull();
  });
});

// ------------------------------------------------------------------ sim helpers

/** an empty running world at a fixed speed: no spawns, no ramp */
function bare(speed: number, seed = 3): World {
  const w = new World();
  w.start({ ...defaultRunOptions(), seed, tutorial: null });
  w.spawner.update = () => {};
  w.speedForDist = () => speed;
  w.speed = speed;
  w.entities.length = 0;
  w.shells.length = 0;
  w.events.length = 0;
  return w;
}

/** put an obstacle in the world with an explicit hitbox */
function place(w: World, kind: EntityKind, lane: number, wz: number, s: HitShape, extra: Partial<Entity> = {}): Entity {
  const e = w.addEntity(kind, lane, wz, extra);
  e.hit = s;
  e.w = s.w;
  e.d = s.d;
  e.h = s.h;
  return e;
}

interface Outcome {
  crashed: boolean;
  bumped: boolean;
  grazed: boolean;
  shave: boolean;
  onTop: boolean;
  events: GameEvent[];
}

function run(w: World, steps: number, each?: (i: number) => void): Outcome {
  const out: Outcome = { crashed: false, bumped: false, grazed: false, shave: false, onTop: false, events: [] };
  for (let i = 0; i < steps && w.mode === 'running'; i++) {
    each?.(i);
    w.step(DT);
    for (const ev of w.events) {
      out.events.push(ev);
      if (ev.t === 'crash') out.crashed = true;
      if (ev.t === 'bump') out.bumped = true;
      if (ev.t === 'graze') out.grazed = true;
      if (ev.t === 'closeShave') out.shave = true;
      if (ev.t === 'land' && ev.onTop) out.onTop = true;
    }
    w.events.length = 0;
  }
  return out;
}

const HOP_KINDS: { kind: EntityKind; key: 'low' | 'sweep' | 'roller' | 'scuttle'; skins: number[] }[] = [
  { kind: 'low', key: 'low', skins: [0, 1, 2] },
  { kind: 'sweep', key: 'sweep', skins: [0, 1, 2] },
  { kind: 'roller', key: 'roller', skins: [0] },
  { kind: 'scuttle', key: 'scuttle', skins: [0] },
];

describe('the solver windows are safe on the real hitboxes', () => {
  // the solver and autopilot plan with CFG.obstacle.<kind>; a hop started anywhere in that window
  // must clear every real shape at every speed, so the fairness guarantees carry over exactly
  for (const hk of HOP_KINDS) {
    it(`${hk.kind}: every hop inside hopWindow clears every skin`, () => {
      const box = CFG.obstacle[hk.key];
      let tried = 0;
      for (const skin of hk.skins) {
        for (const variant of [0, 1]) {
          const s = hitShapeFor(hk.kind, skin, variant) as HitShape;
          for (const v of [9, 12, 16, 20, 24, 28]) {
            const closing = hk.kind === 'roller' ? v + CFG.rollerSpeed : v;
            const win = hopWindow(box.h, box.d, closing);
            expect(win.lo, `${hk.kind} window at ${closing} m/s`).toBeLessThanOrEqual(win.hi);
            for (let k = 0; k <= 8; k++) {
              const off = win.lo + ((win.hi - win.lo) * k) / 8;
              const w = bare(v);
              // the hop is pressed before step H; the obstacle crosses the crab `off` s after that
              const H = 40;
              const tCross = H * DT - off;
              const lane = 1;
              let e: Entity;
              if (hk.kind === 'roller') e = place(w, 'roller', lane, w.dist + v * tCross, s, { skin, vz: -CFG.rollerSpeed, meetWz: w.dist + v * tCross });
              else e = place(w, hk.kind, lane, w.dist + closing * tCross, s, { skin });
              void e;
              const o = run(w, H + 120, (i) => {
                if (i === H) w.act('hop');
              });
              tried++;
              expect(o.crashed || o.bumped, `${hk.kind} skin ${skin}/${variant} at ${closing} m/s, hop ${(off * 1000).toFixed(0)} ms (window ${(win.lo * 1000).toFixed(0)}..${(win.hi * 1000).toFixed(0)})`).toBe(false);
            }
          }
        }
      }
      expect(tried).toBeGreaterThan(50);
    });
  }
});

describe('swept collisions: no tunnelling, no corner snags', () => {
  const log = hitShapeFor('low', 0, 0) as HitShape;
  const castle = hitShapeFor('block', 0, 0) as HitShape;

  it('a long step at top speed cannot skip a thin log', () => {
    // one 1/15 s step at 33 m/s moves 2.2 m: further than the log and crab boxes together
    const w = bare(33);
    place(w, 'low', 1, w.dist + 1.0, log, { skin: 0 });
    expect(2.2).toBeGreaterThan(log.d + CFG.player.d);
    w.step(1 / 15);
    expect(w.mode).toBe('crashing');
  });

  it('a rolling ball at top speed is hit every time it is not hopped', () => {
    for (let k = 0; k < 12; k++) {
      const w = bare(28);
      const meet = w.dist + 20 + k * 0.037;
      place(w, 'roller', 1, meet, hitShapeFor('roller', 0, 0) as HitShape, { vz: -CFG.rollerSpeed, meetWz: meet });
      expect(run(w, 200).crashed).toBe(true);
    }
  });

  it('a slam straight down onto a log lands on it, never through it', () => {
    const w = bare(14);
    const e = place(w, 'low', 1, w.dist, log, { skin: 0 });
    const p = w.player;
    p.grounded = false;
    p.y = 1.0;
    p.prevY = 1.0;
    p.vy = 0;
    w.slamming = true;
    w.player.vy = -40;
    const o = run(w, 2);
    expect(o.crashed).toBe(false);
    expect(p.onTop).toBe(e.id);
    expect(o.events.some((ev) => ev.t === 'land' && ev.hard && ev.onTop)).toBe(true);
  });

  it('coming down onto the front lip of a log lands on it, then drops off the back', () => {
    for (const v of [12, 20, 28]) {
      for (const y0 of [log.h + 0.03, log.h + 0.08, log.h + 0.3]) {
        const w = bare(v);
        // the log's front reaches the crab's front during the next step, while the crab is coming
        // down just above the log's top
        place(w, 'low', 1, w.dist + log.d / 2 + CFG.player.d / 2 + v * DT * 0.5, log, { skin: 0 });
        const p = w.player;
        p.grounded = false;
        p.y = y0;
        p.vy = -2;
        const o = run(w, 90);
        expect(o.crashed, `v ${v} y ${y0}`).toBe(false);
        // close above the top it lands on it; it ends on the sand once the log has passed
        if (y0 < log.h + 0.05) expect(o.onTop, `v ${v} y ${y0}`).toBe(true);
        expect(p.onTop).toBe(0);
        expect(p.y).toBe(0);
      }
    }
  });

  it('clipping the lip from just below it while coming down still lands on top', () => {
    for (const v of [12, 28]) {
      const w = bare(v);
      place(w, 'low', 1, w.dist + log.d / 2 + CFG.player.d / 2 + v * DT * 0.5, log, { skin: 0 });
      const p = w.player;
      p.grounded = false;
      // the previous step was a hair below the top: within CFG.obstacle.lip
      p.y = log.h - CFG.obstacle.lip * 0.5;
      p.vy = -0.5;
      const o = run(w, 90);
      expect(o.crashed, `v ${v}`).toBe(false);
      expect(o.onTop, `v ${v}`).toBe(true);
    }
  });

  it('running into a log on the sand is still a hit', () => {
    const w = bare(20);
    place(w, 'low', 1, w.dist + 5, log, { skin: 0 });
    expect(run(w, 60).crashed).toBe(true);
  });

  /** press "right" at step 10 with a castle arriving `lead` s later (continuous, not step-quantised) */
  const dodge = (v: number, lead: number): Outcome & { lane: number } => {
    const w = bare(v);
    place(w, 'block', 1, w.dist + v * (10 * DT + lead), castle, { skin: 0 });
    const o = run(w, 10 + Math.ceil(lead / DT) + 60, (i) => {
      if (i === 10) w.act('right');
    });
    return { ...o, lane: w.player.lane };
  };

  it('a late dodge grazes and bumps before it crashes; a timely one is a close shave', () => {
    // the outcome may only go clean → bump → crash as the dodge gets later, and the graze band is not empty
    for (const v of [12, 16, 22, 28]) {
      const seq: string[] = [];
      let shave = false;
      for (let us = 260000; us >= 0; us -= 400) {
        const o = dodge(v, us / 1e6);
        const r = o.crashed ? 'crash' : o.bumped ? 'bump' : 'clean';
        if (r === 'clean' && o.shave) shave = true;
        if (r === 'bump') expect(o.grazed, `${v} m/s`).toBe(true);
        if (seq[seq.length - 1] !== r) seq.push(r);
      }
      expect(seq, `${v} m/s`).toEqual(['clean', 'bump', 'crash']);
      expect(shave, `${v} m/s close shave`).toBe(true);
    }
  }, 60_000);

  it('a graze while leaving a lane bumps the crab on toward where it was going', () => {
    let found = false;
    for (let us = 300000; us >= 0 && !found; us -= 250) {
      const o = dodge(28, us / 1e6);
      if (o.bumped && !o.crashed) {
        found = true;
        expect(o.grazed).toBe(true);
        expect(o.lane).toBe(2);
      }
    }
    expect(found).toBe(true);
  }, 30_000);

  it('a crab in the next lane is never touched by a passing obstacle (near miss)', () => {
    for (const [kind, skin] of [['block', 0], ['block', 1], ['block', 2], ['low', 2], ['gull', 0]] as [EntityKind, number][]) {
      const w = bare(28);
      const s = hitShapeFor(kind, skin, 0) as HitShape;
      const e = place(w, kind, 1, w.dist + 10, s, { skin });
      if (kind === 'gull') {
        e.state = 2;
        e.y = 0;
      }
      w.act('right');
      const o = run(w, 120);
      expect(o.crashed || o.bumped, `${kind} ${skin}`).toBe(false);
    }
  });
});

describe('hop polish', () => {
  it('the arc keeps its airtime and apex, hangs at the top and falls faster than it rises', () => {
    const w = bare(12);
    w.act('hop');
    let t = 0;
    let top = 0;
    let apexAt = -1;
    let apexEvents = 0;
    while (t < 2) {
      w.step(DT);
      t += DT;
      top = Math.max(top, w.player.y);
      for (const ev of w.events) if (ev.t === 'apex') {
        apexEvents++;
        apexAt = t;
      }
      w.events.length = 0;
      if (w.player.grounded) break;
    }
    expect(Math.abs(t - CFG.hop.airtime)).toBeLessThanOrEqual(DT * 1.01);
    expect(Math.abs(top - CFG.hop.apex)).toBeLessThan(0.03);
    expect(apexEvents).toBe(1);
    expect(HOP_ARC.fall).toBeLessThan(HOP_ARC.rise);
    expect(HOP_ARC.gFall).toBeGreaterThan(HOP_ARC.g);
    expect(apexAt).toBeGreaterThan(CFG.hop.airtime / 2 - DT);
  });

  it('the arc is above the symmetric parabola everywhere (its hop windows contain the solver’s)', () => {
    const A = CFG.hop.apex;
    const T = CFG.hop.airtime;
    let y = 0;
    let vy = HOP_ARC.v0;
    const dt = 1 / 4000;
    let worst = 0;
    for (let t = dt; t < T; t += dt) {
      const g = vy > HOP_ARC.hang ? HOP_ARC.g : vy > -HOP_ARC.hang ? HOP_ARC.gHang : HOP_ARC.gFall;
      y += vy * dt - 0.5 * g * dt * dt;
      vy -= g * dt;
      worst = Math.min(worst, y - 4 * A * (t / T) * (1 - t / T));
    }
    expect(worst).toBeGreaterThan(-0.01);
  });

  it(`a hop pressed up to ${CFG.hop.buffer} s before landing fires on landing`, () => {
    for (const [early, fires] of [[0.05, true], [CFG.hop.buffer - 0.01, true], [CFG.hop.buffer + 0.04, false]] as [number, boolean][]) {
      const w = bare(12);
      w.act('hop');
      const pressAt = Math.round((CFG.hop.airtime - early) / DT);
      const o = run(w, Math.round(CFG.hop.airtime / DT) + 4, (i) => {
        if (i === pressAt) w.act('hop');
      });
      const buffered = o.events.some((ev) => ev.t === 'hop' && ev.buffered);
      expect(buffered, `pressed ${early} s early`).toBe(fires);
      if (fires) expect(w.player.grounded).toBe(false);
    }
  });

  it('coyote time: a hop just after stepping off the Wave Rider still fires', () => {
    for (const [late, fires] of [[0.04, true], [CFG.hop.coyote + 0.05, false]] as [number, boolean][]) {
      const w = bare(12);
      w.activate('rider');
      run(w, 60);
      w.power.t = 0;
      w.step(DT);
      w.events.length = 0;
      expect(w.player.grounded).toBe(false);
      const o = run(w, 40, (i) => {
        if (i === Math.round(late / DT)) w.act('hop');
      });
      expect(o.events.some((ev) => ev.t === 'hop' && ev.coyote), `${late} s late`).toBe(fires);
    }
  });

  it('hops off the top of an obstacle, and coyote time after walking off it', () => {
    const w = bare(10);
    const log = hitShapeFor('low', 0, 0) as HitShape;
    place(w, 'low', 1, w.dist + 0.9, log, { skin: 0 });
    const p = w.player;
    p.grounded = false;
    p.y = 0.7;
    p.vy = -1;
    for (let i = 0; i < 30 && p.onTop === 0; i++) run(w, 1);
    expect(p.onTop).not.toBe(0);
    // stay until it passes, then hop a moment after dropping off
    let dropped = -1;
    const o = run(w, 60, (i) => {
      if (dropped < 0 && p.onTop === 0) dropped = i;
      if (dropped >= 0 && i === dropped + 3) w.act('hop');
    });
    expect(o.crashed).toBe(false);
    expect(o.events.some((ev) => ev.t === 'hop' && ev.coyote)).toBe(true);
  });
});

describe('lane polish', () => {
  const x = (w: World): number => w.player.x;

  it('a second press in the same direction early in a glide is queued, then chains on smoothly', () => {
    const w = bare(12);
    w.player.lane = 0;
    w.player.x = CFG.laneX[0] as number;
    w.step(DT);
    w.act('right');
    w.step(DT);
    w.events.length = 0;
    w.act('right');
    expect(w.player.lane).toBe(1);
    expect(w.player.laneQueue).toBe(1);
    let prev = x(w);
    let maxStep = 0;
    let changes = 0;
    const o = run(w, 60, () => {
      maxStep = Math.max(maxStep, Math.abs(x(w) - prev));
      prev = x(w);
    });
    for (const ev of o.events) if (ev.t === 'laneChange') changes++;
    expect(changes).toBe(1);
    expect(w.player.lane).toBe(2);
    expect(x(w)).toBeCloseTo(CFG.laneX[2] as number, 2);
    // a continuous glide, never faster than a straight two-lane spring move (~45 m/s, 0.37 m a step)
    expect(maxStep).toBeLessThan(0.37);
  });

  it('a queued move is dropped once stale, and an opposite press cancels it', () => {
    const w = bare(12);
    w.player.lane = 0;
    w.player.x = CFG.laneX[0] as number;
    w.act('right');
    w.act('right');
    w.act('left');
    expect(w.player.laneQueue).toBe(0);
    run(w, 60);
    expect(w.player.lane).toBe(1);
  });

  it('a reversal mid-glide turns back smoothly without overshooting', () => {
    const w = bare(12);
    w.act('right');
    for (let i = 0; i < 6; i++) w.step(DT);
    w.events.length = 0;
    const mid = x(w);
    expect(mid).toBeGreaterThan(0.3);
    w.act('left');
    expect(w.events.some((ev) => ev.t === 'turn' && ev.dir === -1)).toBe(true);
    let maxX = mid;
    let minX = mid;
    run(w, 60, () => {
      maxX = Math.max(maxX, x(w));
      minX = Math.min(minX, x(w));
    });
    expect(maxX - mid).toBeLessThan(0.15);
    expect(minX).toBeGreaterThanOrEqual(-1e-3);
    expect(x(w)).toBeCloseTo(0, 2);
  });

  it('lane moves still work in the air', () => {
    const w = bare(12);
    w.act('hop');
    w.step(DT);
    w.act('left');
    expect(w.player.lane).toBe(0);
    run(w, 30);
    expect(x(w)).toBeCloseTo(CFG.laneX[0] as number, 1);
  });
});
