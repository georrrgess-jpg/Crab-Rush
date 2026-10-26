import { describe, expect, it } from 'vitest';
import { Spring, Spring3 } from '../src/render/anim/spring';
import { Tweens, ease } from '../src/render/anim/tween';

describe('springs', () => {
  it('a critically damped spring reaches its target without overshoot', () => {
    const s = new Spring(0, { freq: 20, damping: 1 });
    s.target = 1;
    let max = 0;
    for (let i = 0; i < 120; i++) max = Math.max(max, s.update(1 / 60));
    expect(s.value).toBeCloseTo(1, 3);
    expect(max).toBeLessThanOrEqual(1.0001);
    expect(s.settled).toBe(true);
  });
  it('an underdamped spring overshoots (wobble) and still settles', () => {
    const s = new Spring(0, { freq: 20, damping: 0.3 });
    s.target = 1;
    let max = 0;
    for (let i = 0; i < 400; i++) max = Math.max(max, s.update(1 / 60));
    expect(max).toBeGreaterThan(1.2);
    expect(s.value).toBeCloseTo(1, 2);
  });
  it('gives the same result at 30, 60 and 144 fps', () => {
    const run = (fps: number): number => {
      const s = new Spring(0, { freq: 15, damping: 0.6 });
      s.target = 1;
      for (let t = 0; t < 0.5; t += 1 / fps) s.update(1 / fps);
      return s.value;
    };
    expect(run(30)).toBeCloseTo(run(144), 1);
    expect(run(60)).toBeCloseTo(run(144), 2);
  });
  it('Spring3 writes into an object and responds to impulses', () => {
    const s = new Spring3();
    const out = { x: 0, y: 0, z: 0 };
    s.impulse(5, 0, 0);
    s.update(0.05, out);
    expect(out.x).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) s.update(1 / 60, out);
    expect(out.x).toBeCloseTo(0, 2);
  });
});

describe('tweens', () => {
  it('easings start at 0 and end at 1', () => {
    for (const [name, f] of Object.entries(ease)) {
      expect(f(0), name).toBeCloseTo(0, 5);
      expect(f(1), name).toBeCloseTo(1, 5);
    }
    expect(ease.outBack(0.6)).toBeGreaterThan(1);
  });
  it('runs, delays, completes and recycles tweens', () => {
    const tw = new Tweens();
    let v = -1;
    let done = 0;
    tw.to((x) => (v = x), 0, 10, 0.5, ease.linear, 0.25, () => done++);
    expect(v).toBe(0);
    tw.update(0.25);
    expect(v).toBe(0);
    tw.update(0.25);
    expect(v).toBeCloseTo(5);
    tw.update(1);
    expect(v).toBe(10);
    expect(done).toBe(1);
    expect(tw.count).toBe(0);
  });
});
