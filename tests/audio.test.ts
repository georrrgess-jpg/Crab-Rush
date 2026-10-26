import { describe, expect, it } from 'vitest';
import { SFX, synthSfx, type Sfx } from '../src/core/audio';

describe('synthesised sound effects', () => {
  for (const name of Object.keys(SFX) as Sfx[]) {
    it(`${name} renders finite, audible, non-clipping samples`, () => {
      const x = synthSfx(name, 44100);
      expect(x.length).toBeGreaterThan(441);
      expect(x.length).toBeLessThan(44100 * 1.5);
      let peak = 0;
      for (const v of x) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThanOrEqual(1);
    });
  }
});
