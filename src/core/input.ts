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
    private threshold = CFG.input.swipeThreshold,
    private tapMaxMs = CFG.input.tapMaxMs,
  ) {}

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

/** DOM wiring: Pointer Events on a gesture surface + keyboard on window. */
export class Input {
  private tracker: SwipeTracker;
  /** Set by Game; actions reach the game through this callback synchronously. */
  onAction: ActionSink = () => {};
  /** True when the player has used a touch pointer (drives touch-button visibility + prompts). */
  usedTouch = false;
  lastDevice: 'touch' | 'keyboard' | 'mouse' = 'mouse';
  private surface: HTMLElement | null = null;
  private pointerEnabled = false;

  constructor() {
    this.tracker = new SwipeTracker(
      (a, c) => this.fire(a, !!c),
      () => (this.surface ? this.surface.clientWidth : window.innerWidth),
    );
    window.addEventListener('keydown', this.onKey, { passive: false });
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

  private onKey = (e: KeyboardEvent): void => {
    const m = KEY_MAP[e.code];
    if (!m) return;
    // Let focused buttons handle Enter/Space natively so keyboard menu navigation works.
    const t = e.target as HTMLElement | null;
    const onButton = !!t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'A');
    if (onButton && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) return;
    e.preventDefault();
    if (e.repeat) return;
    this.lastDevice = 'keyboard';
    this.fire(m[0], !!m[1] || m[0] === 'confirm');
  };

}
