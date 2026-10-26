import { QUALITY, type QualityName, type QualityPreset } from '../config';

const ORDER: QualityName[] = ['low', 'medium', 'high'];

/**
 * Auto quality (PLAN.md §8.3). While running, frame times are averaged over 2 s windows:
 * two slow windows (>19 ms) lower the resolution scale by 0.25 (down to 0.75), then request a lower
 * tier; ten seconds of fast frames (<12 ms) raise the scale again. A steady ~33 ms with low jitter is
 * a 30 fps-capped device (e.g. iOS Low Power Mode) and is not treated as slow. Tier changes rebuild
 * scenery, so they are only *requested* here and applied by the game between runs.
 */
export class QualityManager {
  dprScale = 1;
  tier: QualityName;
  /** tier the game should switch to when convenient (null = no change) */
  pendingTier: QualityName | null = null;
  private samples: number[] = [];
  private windowT = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private readonly ceiling: QualityName;

  constructor(start: QualityPreset, private enabled: boolean) {
    this.tier = start.name;
    this.ceiling = start.name;
  }

  setEnabled(on: boolean, preset: QualityPreset): void {
    this.enabled = on;
    this.tier = preset.name;
    this.dprScale = 1;
    this.pendingTier = null;
    this.reset();
  }

  reset(): void {
    this.samples.length = 0;
    this.windowT = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  /** Feed one rendered frame. Returns true when the resolution scale changed. */
  sample(frameMs: number, running: boolean): boolean {
    if (!this.enabled || !running) return false;
    if (frameMs > 100 || frameMs <= 0) return false; // tab switches, hitches
    this.samples.push(frameMs);
    this.windowT += frameMs / 1000;
    if (this.windowT < 2) return false;
    const n = this.samples.length;
    const avg = this.samples.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(this.samples.reduce((a, b) => a + (b - avg) * (b - avg), 0) / n);
    this.samples.length = 0;
    this.windowT = 0;
    const capped30 = Math.abs(avg - 33.3) < 2.5 && sd < 2.5;
    let changed = false;
    if (avg > 19 && !capped30) {
      this.fastWindows = 0;
      if (++this.slowWindows >= 2) {
        this.slowWindows = 0;
        if (this.dprScale > 0.75) {
          this.dprScale = Math.max(0.75, this.dprScale - 0.25);
          changed = true;
        } else {
          const i = ORDER.indexOf(this.tier);
          if (i > 0) this.pendingTier = ORDER[i - 1] as QualityName;
        }
      }
    } else if (avg < 12) {
      this.slowWindows = 0;
      if (++this.fastWindows >= 5) {
        this.fastWindows = 0;
        if (this.dprScale < 1) {
          this.dprScale = Math.min(1, this.dprScale + 0.25);
          changed = true;
        } else {
          const i = ORDER.indexOf(this.tier);
          if (i < ORDER.indexOf(this.ceiling)) this.pendingTier = ORDER[i + 1] as QualityName;
        }
      }
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
    return changed;
  }

  /** Apply a pending tier; returns the new preset or null. */
  takePending(): QualityPreset | null {
    const t = this.pendingTier;
    if (!t || t === this.tier) {
      this.pendingTier = null;
      return null;
    }
    this.tier = t;
    this.pendingTier = null;
    this.dprScale = 1;
    this.reset();
    return QUALITY[t];
  }
}
