/**
 * Screen router (UPDATE2_PLAN.md §4.2): a stack of screens with enter/exit transitions, focus
 * management and back handling (Esc, on-screen back buttons, browser/Android back via popstate).
 * Screens are small objects; the router owns their DOM lifecycle. Pure DOM, no framework.
 */
export type Transition = 'fade' | 'slide' | 'scale' | 'none';

export interface Screen {
  /** unique id, also used as the element id */
  readonly id: string;
  /** build DOM once (called lazily on first show) */
  mount(): HTMLElement;
  /** called after the element is attached and visible */
  enter?(params?: unknown): void;
  /** called before the element is hidden */
  exit?(): void;
  /** return false to veto a back action (e.g. a confirm dialog handles it) */
  onBack?(): boolean;
  /** element to focus when shown (defaults to the first button) */
  focusTarget?(): HTMLElement | null;
}

interface Entry {
  screen: Screen;
  el: HTMLElement;
}

export class Router {
  private stack: Entry[] = [];
  private mounted = new Map<string, HTMLElement>();
  private historyDepth = 0;
  reduceMotion = false;
  /** fired when the top screen changes (for camera presets, music, etc.) */
  onChange: (top: string | null) => void = () => {};

  constructor(private root: HTMLElement, private useHistory = true) {
    if (useHistory && typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        if (this.historyDepth > 0) {
          this.historyDepth--;
          this.back(true);
        }
      });
    }
  }

  get top(): Screen | null {
    return this.stack[this.stack.length - 1]?.screen ?? null;
  }

  get depth(): number {
    return this.stack.length;
  }

  private el(screen: Screen): HTMLElement {
    let el = this.mounted.get(screen.id);
    if (!el) {
      el = screen.mount();
      el.id = el.id || screen.id;
      el.classList.add('rt-screen');
      this.mounted.set(screen.id, el);
    }
    return el;
  }

  private animate(el: HTMLElement, kind: 'enter' | 'exit', t: Transition, done?: () => void): void {
    el.classList.remove('rt-enter', 'rt-exit', 'rt-slide', 'rt-scale');
    if (t === 'none' || this.reduceMotion) {
      done?.();
      return;
    }
    void el.offsetWidth; // restart the animation
    el.classList.add(kind === 'enter' ? 'rt-enter' : 'rt-exit');
    if (t === 'slide') el.classList.add('rt-slide');
    if (t === 'scale') el.classList.add('rt-scale');
    if (done) {
      let finished = false;
      const fin = (): void => {
        if (finished) return;
        finished = true;
        el.removeEventListener('animationend', fin);
        done();
      };
      el.addEventListener('animationend', fin);
      setTimeout(fin, 400); // safety if animationend never fires (hidden tab)
    }
  }

  private show(e: Entry, t: Transition, params?: unknown): void {
    if (!e.el.isConnected) this.root.appendChild(e.el);
    e.el.hidden = false;
    this.animate(e.el, 'enter', t);
    e.screen.enter?.(params);
    const f = e.screen.focusTarget?.() ?? (e.el.querySelector('button:not([disabled])') as HTMLElement | null);
    f?.focus({ preventScroll: true });
  }

  private hide(e: Entry, t: Transition): void {
    e.screen.exit?.();
    this.animate(e.el, 'exit', t, () => {
      if (!this.stack.includes(e)) e.el.hidden = true;
    });
    if (t === 'none' || this.reduceMotion) e.el.hidden = true;
  }

  /** Push a screen on top (the one below stays mounted but hidden unless `overlay`). */
  push(screen: Screen, opts: { transition?: Transition; overlay?: boolean; params?: unknown } = {}): void {
    const t = opts.transition ?? 'fade';
    const below = this.stack[this.stack.length - 1];
    if (below && !opts.overlay) this.hide(below, t);
    const e = { screen, el: this.el(screen) };
    this.stack.push(e);
    this.show(e, t, opts.params);
    if (this.useHistory && typeof history !== 'undefined' && this.stack.length > 1) {
      history.pushState({ crab: this.stack.length }, '');
      this.historyDepth++;
    }
    this.onChange(screen.id);
  }

  /** Replace the whole stack with one screen (e.g. going home). */
  reset(screen: Screen, opts: { transition?: Transition; params?: unknown } = {}): void {
    const t = opts.transition ?? 'fade';
    while (this.stack.length) this.hide(this.stack.pop() as Entry, t);
    if (this.useHistory && this.historyDepth > 0 && typeof history !== 'undefined') {
      const n = this.historyDepth;
      this.historyDepth = 0;
      history.go(-n);
    }
    const e = { screen, el: this.el(screen) };
    this.stack.push(e);
    this.show(e, t, opts.params);
    this.onChange(screen.id);
  }

  /** Pop the top screen. Returns false when there is nothing to go back to or the screen vetoed. */
  back(fromHistory = false): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top || this.stack.length < 2) return false;
    if (top.screen.onBack && top.screen.onBack() === false) return false;
    this.stack.pop();
    this.hide(top, 'fade');
    const below = this.stack[this.stack.length - 1] as Entry;
    this.show(below, 'fade');
    if (!fromHistory && this.useHistory && this.historyDepth > 0 && typeof history !== 'undefined') {
      this.historyDepth--;
      history.back();
    }
    this.onChange(below.screen.id);
    return true;
  }

  /** Remove everything (e.g. while a run is in progress the HUD is managed separately). */
  clear(): void {
    while (this.stack.length) this.hide(this.stack.pop() as Entry, 'none');
    this.onChange(null);
  }
}
