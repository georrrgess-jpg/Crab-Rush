import { CFG } from '../config';

export type Action = 'left' | 'right' | 'hop' | 'slam' | 'pause' | 'back' | 'confirm';

export type ActionSink = (a: Action, alsoConfirm?: boolean) => void;

interface Track {
  sx: number;
  sy: number;
  t0: number;
  swiped: boolean;
  lastDir: number; // 0 none, 1 left, 2 right, 3 up, 4 down
}

/**
 * Pure gesture resolver (no DOM). Swipes resolve *during the move* once the finger has travelled
 * `threshold` px; a tap (released fast, with little movement) moves toward the tapped half of the
 * screen. One continuous drag yields one action per direction change, so a long swipe never
 * overshoots several lanes.
 */
export class SwipeTracker {
  private tracks = new Map<number, Track>();
  constructor(
    private emit: ActionSink,
    private screenWidth: () => number,
    private threshold: number = CFG.input.swipeThreshold,
    private tapMaxMs = CFG.input.tapMaxMs,
  ) {}

  /** swipe distance in px (Settings → swipe sensitivity) */
  setThreshold(px: number): void {
    this.threshold = px;
  }

  down(id: number, x: number, y: number, t: number): void {
    this.tracks.set(id, { sx: x, sy: y, t0: t, swiped: false, lastDir: 0 });
  }

  move(id: number, x: number, y: number): void {
    const tr = this.tracks.get(id);
    if (!tr) return;
    const dx = x - tr.sx;
    const dy = y - tr.sy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < this.threshold) return;
    const dir = ax >= ay ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 4;
    // Re-origin so the next swipe is measured from here, but only fire again on a *different* direction.
    tr.sx = x;
    tr.sy = y;
    if (dir === tr.lastDir) return;
    tr.lastDir = dir;
    tr.swiped = true;
    this.emit(dir === 1 ? 'left' : dir === 2 ? 'right' : dir === 3 ? 'hop' : 'slam');
  }

  up(id: number, x: number, y: number, t: number): void {
    const tr = this.tracks.get(id);
    this.tracks.delete(id);
    if (!tr || tr.swiped) return;
    const moved = Math.hypot(x - tr.sx, y - tr.sy);
    if (moved >= this.threshold || t - tr.t0 > this.tapMaxMs) return;
    this.emit(x < this.screenWidth() / 2 ? 'left' : 'right');
  }

  cancel(id: number): void {
    this.tracks.delete(id);
  }

  clear(): void {
    this.tracks.clear();
  }
}

const KEY_MAP: Record<string, [Action, boolean?]> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['hop'],
  KeyW: ['hop'],
  Space: ['hop', true],
  ArrowDown: ['slam'],
  KeyS: ['slam'],
  Escape: ['back'],
  KeyP: ['pause'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
};

/**
 * Gamepad (standard mapping), polled once per frame. Each pad keeps a few virtual inputs (a d-pad
 * direction merges with the left stick) so presses fire on the edge, like keys. Local constants:
 * the controls live here rather than in CFG so the mapping reads in one place.
 */
const PAD_SLOTS = 4;
const P_LEFT = 0;
const P_RIGHT = 1;
const P_UP = 2;
const P_DOWN = 3;
const P_A = 4;
const P_B = 5;
const P_X = 6;
const P_Y = 7;
const P_START = 8;
const P_SELECT = 9;
const PAD_N = 10;
/** stick deflection that presses a direction, and the lower one that releases it (hysteresis) */
const STICK_ON = 0.55;
const STICK_OFF = 0.3;
/** a held direction repeats in menus (s): first after the delay, then every `rate` */
const PAD_REPEAT_DELAY = 0.42;
const PAD_REPEAT_RATE = 0.14;

const padButton = (b: readonly GamepadButton[], i: number): boolean => i < b.length && !!b[i] && (b[i]!.pressed || b[i]!.value > 0.5);

/** Fields that keep their own arrow keys (sliders, text, dropdowns). */
const ownsArrows = (t: HTMLElement | null): boolean => {
  if (!t) return false;
  if (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
  if (t.tagName !== 'INPUT') return false;
  const ty = (t as HTMLInputElement).type;
  return ty !== 'button' && ty !== 'checkbox' && ty !== 'radio' && ty !== 'submit';
};

/** DOM wiring: Pointer Events on a gesture surface + keyboard on window. */
export class Input {
  private tracker: SwipeTracker;
  /** Set by Game; actions reach the game through this callback synchronously. */
  onAction: ActionSink = () => {};
  /** True when the player has used a touch pointer (drives touch-button visibility + prompts). */
  usedTouch = false;
  lastDevice: 'touch' | 'keyboard' | 'mouse' | 'gamepad' = 'mouse';
  /** Index of the pad that pressed last (for rumble), or -1. */
  padIndex = -1;
  /** Gamepad source; the `pad` test hook swaps in a fake one. */
  getPads: () => ArrayLike<Gamepad | null> | null = () => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    try {
      return navigator.getGamepads();
    } catch {
      // blocked by a permissions policy (cross-origin iframe without allow="gamepad")
      this.padsLive = false;
      return null;
    }
  };
  /** Pads are polled only after the browser reports one (no per-frame getGamepads() list otherwise). */
  padsLive = false;
  private surface: HTMLElement | null = null;
  private pointerEnabled = false;
  private padHeld = new Uint8Array(PAD_SLOTS * PAD_N);
  private padRepeat = new Float32Array(PAD_SLOTS * PAD_N);

  constructor() {
    this.tracker = new SwipeTracker(
      (a, c) => this.fire(a, !!c),
      () => (this.surface ? this.surface.clientWidth : window.innerWidth),
    );
    window.addEventListener('keydown', this.onKey, { passive: false });
    window.addEventListener('gamepadconnected', () => {
      this.padsLive = true;
    });
    // Block iOS pinch-zoom / gesture zoom and context menus on the game.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, (e) => e.preventDefault());
    }
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  attachSurface(el: HTMLElement): void {
    this.surface = el;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('lostpointercapture', this.onCancel);
  }

  /** Swipe sensitivity: a shorter swipe distance is more sensitive. */
  setSensitivity(s: 'low' | 'normal' | 'high'): void {
    const base = CFG.input.swipeThreshold;
    this.tracker.setThreshold(s === 'high' ? base * 0.7 : s === 'low' ? base * 1.45 : base);
  }

  /** Gesture surface only accepts input while a run is active. */
  setPointerEnabled(on: boolean): void {
    this.pointerEnabled = on;
    if (!on) this.tracker.clear();
  }

  private fire(a: Action, alsoConfirm: boolean): void {
    this.onAction(a, alsoConfirm);
  }

  /** Programmatic input (test hooks, on-screen buttons). */
  inject(a: Action): void {
    this.onAction(a, false);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.usedTouch = true;
    this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (!this.pointerEnabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.tracker.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.pointerEnabled) return;
    this.tracker.move(e.pointerId, e.clientX, e.clientY);
  };
  private onUp = (e: PointerEvent): void => {
    if (!this.pointerEnabled) return;
    this.tracker.up(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  };
  private onCancel = (e: PointerEvent): void => {
    this.tracker.cancel(e.pointerId);
  };

  /** The pad that pressed last (fresh snapshot), for rumble. */
  activePad(): Gamepad | null {
    if (this.padIndex < 0 || this.lastDevice !== 'gamepad') return null;
    const pads = this.getPads();
    return (pads && this.padIndex < pads.length ? pads[this.padIndex] : null) ?? null;
  }

  /**
   * Read every connected pad once per frame (no allocation here beyond the browser's own list).
   * d-pad / left stick = left, right, hop (up), slam (down); A = hop and confirm (presses the
   * focused button in menus); B = slam on the run, back in menus; X = slam, Y = hop on the run;
   * Start = pause on the run, confirm in menus; Select = back.
   */
  pollPads(dt: number): void {
    if (!this.padsLive) return;
    const pads = this.getPads();
    if (!pads) return;
    const n = Math.min(pads.length, PAD_SLOTS);
    for (let p = 0; p < PAD_SLOTS; p++) {
      const gp = p < n ? pads[p] : null;
      const base = p * PAD_N;
      if (!gp || !gp.connected) {
        this.padHeld.fill(0, base, base + PAD_N);
        continue;
      }
      const b = gp.buttons;
      const lx = gp.axes.length > 0 ? (gp.axes[0] as number) : 0;
      const ly = gp.axes.length > 1 ? (gp.axes[1] as number) : 0;
      const h = this.padHeld;
      this.padInput(p, P_LEFT, padButton(b, 14) || -lx > (h[base + P_LEFT] ? STICK_OFF : STICK_ON), dt);
      this.padInput(p, P_RIGHT, padButton(b, 15) || lx > (h[base + P_RIGHT] ? STICK_OFF : STICK_ON), dt);
      this.padInput(p, P_UP, padButton(b, 12) || -ly > (h[base + P_UP] ? STICK_OFF : STICK_ON), dt);
      this.padInput(p, P_DOWN, padButton(b, 13) || ly > (h[base + P_DOWN] ? STICK_OFF : STICK_ON), dt);
      this.padInput(p, P_A, padButton(b, 0), dt);
      this.padInput(p, P_B, padButton(b, 1), dt);
      this.padInput(p, P_X, padButton(b, 2), dt);
      this.padInput(p, P_Y, padButton(b, 3), dt);
      this.padInput(p, P_START, padButton(b, 9), dt);
      this.padInput(p, P_SELECT, padButton(b, 8), dt);
    }
  }

  private padInput(p: number, i: number, down: boolean, dt: number): void {
    const k = p * PAD_N + i;
    if (!down) {
      this.padHeld[k] = 0;
      return;
    }
    if (!this.padHeld[k]) {
      this.padHeld[k] = 1;
      this.padRepeat[k] = PAD_REPEAT_DELAY;
      this.padPress(p, i);
      return;
    }
    // held: directions auto-repeat in menus only (one lane per press on the run)
    if (i > P_DOWN || this.pointerEnabled) return;
    this.padRepeat[k] = (this.padRepeat[k] as number) - dt;
    if ((this.padRepeat[k] as number) <= 0) {
      this.padRepeat[k] = PAD_REPEAT_RATE;
      this.padPress(p, i);
    }
  }

  private padPress(p: number, i: number): void {
    this.lastDevice = 'gamepad';
    this.padIndex = p;
    const run = this.pointerEnabled;
    switch (i) {
      case P_LEFT:
        return this.fire('left', false);
      case P_RIGHT:
        return this.fire('right', false);
      case P_UP:
        return this.fire('hop', false);
      case P_DOWN:
        return this.fire('slam', false);
      case P_A:
        // like Enter on a focused button: menus press what the d-pad has focused
        if (!run && this.pressFocused()) return;
        return this.fire('hop', true);
      case P_B:
        return this.fire(run ? 'slam' : 'back', false);
      case P_X:
        if (run) this.fire('slam', false);
        return;
      case P_Y:
        if (run) this.fire('hop', false);
        return;
      case P_START:
        return run ? this.fire('pause', false) : this.fire('confirm', true);
      case P_SELECT:
        return this.fire('back', false);
    }
  }

  /** Click the focused, visible control (gamepad A in menus). Sliders are moved with left/right instead. */
  private pressFocused(): boolean {
    const el = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (!el || el === document.body || !el.isConnected || el.getClientRects().length === 0) return false;
    if (ownsArrows(el) || !el.matches('button, a[href], input, [role="button"], [tabindex]')) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    el.click();
    return true;
  }

  private onKey = (e: KeyboardEvent): void => {
    const m = KEY_MAP[e.code];
    if (!m || e.defaultPrevented) return;
    // Let focused buttons handle Enter/Space natively so keyboard menu navigation works.
    const t = e.target as HTMLElement | null;
    // in menus, sliders and text fields keep their own keys (only Escape still backs out)
    if (!this.pointerEnabled && e.code !== 'Escape' && ownsArrows(t)) return;
    const onButton = !!t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'A');
    if (onButton && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) return;
    e.preventDefault();
    if (e.repeat) return;
    this.lastDevice = 'keyboard';
    this.fire(m[0], !!m[1] || m[0] === 'confirm');
  };

}
