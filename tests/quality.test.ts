import { describe, expect, it } from 'vitest';
import { QUALITY } from '../src/config';
import { QualityManager } from '../src/core/quality';

const feed = (q: QualityManager, ms: number, seconds: number, jitter = 0): void => {
  let t = 0;
  let i = 0;
  while (t < seconds) {
    const f = ms + (i++ % 2 ? jitter : -jitter);
    q.sample(f, true);
    t += f / 1000;
  }
};

describe('auto quality', () => {
  it('lowers resolution, then requests a lower tier when frames stay slow', () => {
    const q = new QualityManager(QUALITY.high, true);
    feed(q, 25, 4.2);
    expect(q.dprScale).toBe(0.75);
    feed(q, 25, 4.2);
    expect(q.pendingTier).toBe('medium');
    expect(q.takePending()?.name).toBe('medium');
    expect(q.dprScale).toBe(1);
  });
  it('treats a steady 30 fps cap as fine', () => {
    const q = new QualityManager(QUALITY.high, true);
    feed(q, 33.3, 12, 0.5);
    expect(q.dprScale).toBe(1);
    expect(q.pendingTier).toBeNull();
  });
  it('recovers resolution when frames are fast again', () => {
    const q = new QualityManager(QUALITY.medium, true);
    feed(q, 25, 4.2);
    expect(q.dprScale).toBe(0.75);
    feed(q, 8, 10.5);
    expect(q.dprScale).toBe(1);
  });
  it('never raises above the starting tier and does nothing when disabled', () => {
    const q = new QualityManager(QUALITY.medium, true);
    feed(q, 8, 40);
    expect(q.pendingTier).toBeNull();
    const off = new QualityManager(QUALITY.high, false);
    feed(off, 40, 10);
    expect(off.dprScale).toBe(1);
  });
});
