/**
 * Screen kit (UPDATE4_PLAN.md §2): size classes, the wallet chip, the pinned action bar, bottom sheets,
 * number roll and the toast lane. Every overlay screen builds its chrome from these so headers, wallets
 * and primary buttons sit in the same place everywhere.
 */
import { btn, el, fmt } from './dom';
import { ICON } from './icons';
import { staggerIn } from './motion';

export type SizeClass = 'compact' | 'short' | 'regular';

/** compact: portrait phones (narrow or short); short: landscape phones; regular: tablets and desktops */
export function sizeClassFor(w: number, h: number): SizeClass {
  if (w > h && h < 480) return 'short';
  if (w <= h && (w < 400 || h < 700)) return 'compact';
  return 'regular';
}

const sizeCb: ((s: SizeClass) => void)[] = [];
/** Keep `<html data-size>` in step with the viewport. */
export function installSizeClass(): void {
  const apply = (): void => {
    const s = sizeClassFor(window.innerWidth, window.innerHeight);
    if (document.documentElement.dataset.size !== s) {
      document.documentElement.dataset.size = s;
      for (const f of sizeCb) f(s);
    }
    document.documentElement.dataset.orient = window.innerWidth > window.innerHeight ? 'land' : 'port';
  };
  apply();
  window.addEventListener('resize', apply);
}
export function onSizeClass(f: (s: SizeClass) => void): void {
  sizeCb.push(f);
}
export function sizeClass(): SizeClass {
  return (document.documentElement.dataset.size as SizeClass | undefined) ?? 'regular';
}

export const PEARL_ICO = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="21" r="14" fill="#e4d6fb" stroke="#8a72c0" stroke-width="2"/><circle cx="22.5" cy="23.5" r="9.5" fill="#cfbcf2"/><ellipse cx="15" cy="15" rx="4.5" ry="3.4" fill="#fff"/></svg>`;

/** Animated count from the shown value to `to` (respects Reduce Motion via the caller's flag). */
export function rollNumber(node: HTMLElement, to: number, instant = false): void {
  const from = Number(node.dataset.v ?? to);
  node.dataset.v = String(to);
  if (instant || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches || document.getElementById('app')?.classList.contains('reduce-motion')) {
    node.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const dur = Math.min(900, 250 + Math.abs(to - from) * 6);
  const step = (now: number): void => {
    if (node.dataset.v !== String(to)) return; // superseded
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
    else {
      node.parentElement?.classList.remove('bump');
      void node.parentElement?.offsetWidth;
      node.parentElement?.classList.add('bump');
    }
  };
  requestAnimationFrame(step);
}

/** One pill with shells and (optionally) pearls: the only currency display in headers. */
export class Wallet {
  readonly el: HTMLElement;
  private shells: HTMLElement;
  private pearls: HTMLElement;
  private pearlRow: HTMLElement;
  constructor(cls = '') {
    this.el = el('div', `kit-wallet ${cls}`);
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Wallet');
    this.el.innerHTML = `<span class="kw-row kw-s"><span class="kw-ico">${ICON.shell}</span><b>0</b></span><span class="kw-row kw-p"><span class="kw-ico">${PEARL_ICO}</span><b>0</b></span>`;
    this.shells = this.el.querySelector('.kw-s b') as HTMLElement;
    this.pearls = this.el.querySelector('.kw-p b') as HTMLElement;
    this.pearlRow = this.el.querySelector('.kw-p') as HTMLElement;
  }
  set(shells: number, pearls?: number, instant = false): void {
    rollNumber(this.shells, shells, instant || this.shells.dataset.v === undefined);
    this.pearlRow.classList.toggle('hidden', pearls === undefined);
    if (pearls !== undefined) rollNumber(this.pearls, pearls, instant || this.pearls.dataset.v === undefined);
    this.el.setAttribute('aria-label', `${fmt(shells)} shells${pearls !== undefined ? `, ${fmt(pearls)} pearls` : ''}`);
  }
  /** where a reward should fly to */
  target(kind: 'shells' | 'pearls'): DOMRect {
    return ((kind === 'shells' ? this.el.querySelector('.kw-s .kw-ico') : this.el.querySelector('.kw-p .kw-ico')) ?? this.el).getBoundingClientRect();
  }
}

/** The standard page header: back, title, optional extra and wallet. Marked as a toast obstacle. */
export function pageHead(title: string, onBack: (() => void) | null, extra: HTMLElement[] = []): { head: HTMLElement; title: HTMLElement } {
  const head = el('div', 'page-head kit-head');
  head.dataset.toastAvoid = '';
  if (onBack) head.appendChild(btn(ICON.back, 'icon ghost back', onBack, 'Back'));
  const h = el('h2', 'kit-title', title);
  head.appendChild(h);
  const sp = el('span', 'kit-spacer');
  head.appendChild(sp);
  for (const x of extra) head.appendChild(x);
  return { head, title: h };
}

/** The pinned action bar at the bottom of a page card: one primary button and up to two more. */
export function actionBar(...buttons: HTMLElement[]): HTMLElement {
  const bar = el('div', 'page-actions');
  bar.dataset.toastAvoid = '';
  for (const b of buttons) bar.appendChild(b);
  return bar;
}

/** Bottom sheet for secondary content on compact screens: tap the dim or drag down to close. */
export class Sheet {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  private panel: HTMLElement;
  private titleEl: HTMLElement;
  private onClose: (() => void) | null = null;
  private hideTimer = 0;
  constructor(id: string) {
    this.el = el('div', 'kit-sheet hidden');
    this.el.id = id;
    const dim = el('div', 'ks-dim');
    dim.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.panel = el('div', 'ks-panel');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    const grab = el('div', 'ks-grab');
    this.titleEl = el('h3', 'ks-title');
    const close = btn(ICON.back, 'icon ghost ks-close', () => this.close(), 'Close');
    const top = el('div', 'ks-top');
    top.append(this.titleEl, close);
    this.body = el('div', 'ks-body');
    this.panel.append(grab, top, this.body);
    this.el.append(dim, this.panel);
    for (const ev of ['pointerdown', 'click', 'touchstart']) this.panel.addEventListener(ev, (e) => e.stopPropagation());
    // drag the grab bar down to dismiss
    let y0 = -1;
    grab.addEventListener('pointerdown', (e) => {
      y0 = e.clientY;
      grab.setPointerCapture(e.pointerId);
    });
    grab.addEventListener('pointermove', (e) => {
      if (y0 < 0) return;
      const dy = Math.max(0, e.clientY - y0);
      this.panel.style.transform = `translateY(${dy}px)`;
    });
    grab.addEventListener('pointerup', (e) => {
      const dy = e.clientY - y0;
      y0 = -1;
      this.panel.style.transform = '';
      if (dy > 80) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        e.stopPropagation();
        this.close();
      }
    });
  }
  get open(): boolean {
    return !this.el.classList.contains('hidden') && !this.el.classList.contains('out');
  }
  show(title: string, onClose?: () => void): void {
    this.titleEl.textContent = title;
    this.panel.setAttribute('aria-label', title);
    this.onClose = onClose ?? null;
    clearTimeout(this.hideTimer);
    this.el.classList.remove('hidden', 'out');
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    (this.panel.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
    const list = this.body.firstElementChild as HTMLElement | null;
    if (list) staggerIn(list.children.length > 1 ? list : this.body, ':scope > *', 10);
  }
  close(): void {
    if (!this.open) return;
    this.el.classList.add('out');
    // focus must not stay inside a hidden sheet (it would swallow keys meant for the game)
    if (document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) document.activeElement.blur();
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.el.classList.add('hidden'), 200);
    const f = this.onClose;
    this.onClose = null;
    f?.();
  }
}

/**
 * Toast lane: toasts sit just below the lowest header-like element in the top 45% of the screen
 * (anything marked `data-toast-avoid`), so they never cover a header, wallet or status bar.
 */
const TOAST_AVOID = '[data-toast-avoid], .page-head, .res-head, .home-top, #hud > .left, #hud > .right, .lv-progress, .rh-pos, .rh-track, .spade-chip';
/** On landscape phones a card fills the height, so toasts go to the bottom-left corner instead. */
export function toastCorner(): boolean {
  return sizeClass() === 'short' && !!document.querySelector('.res-card, .chest-card');
}
export function toastTop(): number {
  let top = 12;
  const limit = window.innerHeight * 0.45;
  for (const n of document.querySelectorAll<HTMLElement>(TOAST_AVOID)) {
    if (!n.offsetParent && getComputedStyle(n).position !== 'fixed') continue;
    const r = n.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.top > limit) continue;
    let hidden = false;
    for (let p: HTMLElement | null = n; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        hidden = true;
        break;
      }
    }
    if (!hidden) top = Math.max(top, r.bottom + 8);
  }
  return Math.min(top, limit);
}
