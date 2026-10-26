/**
 * Haptics (UPDATE2_PLAN.md §4.4) via navigator.vibrate where supported (Android, Chromebooks);
 * iOS Safari ignores it. Light on lane changes and buttons, medium on bumps, heavy on crashes.
 */
export type Haptic = 'light' | 'medium' | 'heavy' | 'success';

const PATTERNS: Record<Haptic, number | number[]> = {
  light: 8,
  medium: 22,
  heavy: [40, 30, 60],
  success: [12, 40, 18],
};

export class Haptics {
  enabled = true;
  private readonly supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  play(kind: Haptic): void {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(PATTERNS[kind]);
    } catch {
      // some browsers throw before a user gesture; ignore
    }
  }
}
