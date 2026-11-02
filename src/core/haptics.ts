/**
 * Haptics (UPDATE2_PLAN.md §4.4) via navigator.vibrate where supported (Android, Chromebooks);
 * iOS Safari ignores it. Light on lane changes and buttons, medium on bumps, heavy on crashes.
 * While a gamepad is in use, the same cues rumble the pad instead (dual-rumble, where supported).
 */
export type Haptic = 'light' | 'medium' | 'heavy' | 'success';

const PATTERNS: Record<Haptic, number | number[]> = {
  light: 8,
  medium: 22,
  heavy: [40, 30, 60],
  success: [12, 40, 18],
};

/** Pad rumble per cue: [duration ms, strong motor, weak motor]. */
const RUMBLE: Record<Haptic, [number, number, number]> = {
  light: [40, 0, 0.35],
  medium: [90, 0.35, 0.5],
  heavy: [260, 0.85, 0.6],
  success: [160, 0.25, 0.55],
};

interface Rumbler {
  vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } | null;
}

export class Haptics {
  enabled = true;
  /** Set by Game: the gamepad in use, if any (rumbles instead of the phone motor). */
  pad: () => Gamepad | null = () => null;
  private readonly supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  play(kind: Haptic): void {
    if (!this.enabled) return;
    const act = (this.pad() as Rumbler | null)?.vibrationActuator;
    if (act && typeof act.playEffect === 'function') {
      const r = RUMBLE[kind];
      try {
        act.playEffect('dual-rumble', { startDelay: 0, duration: r[0], strongMagnitude: r[1], weakMagnitude: r[2] }).catch(() => {});
      } catch {
        // pads without dual-rumble throw; ignore
      }
      return;
    }
    if (!this.supported) return;
    try {
      navigator.vibrate(PATTERNS[kind]);
    } catch {
      // some browsers throw before a user gesture; ignore
    }
  }
}
