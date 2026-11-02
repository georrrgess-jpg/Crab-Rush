/**
 * The opening animation (Update 8.1). The markup is in index.html and the motion is pure CSS on
 * composited properties (src/ui/splash.css), so it plays smoothly while the main thread builds the
 * game. This controller draws the sun rays once, reports loading progress, holds the intro until
 * its big moments have played (tap or key to skip the wait), and runs the wave-wipe exit.
 *
 * Tests, screenshots and Reduce Motion get the "quick" splash: no motion, no hold, a short fade.
 * `?splash` forces the full intro under automation; `?splash=hold` keeps it on screen (screenshots).
 */
import { CFG } from '../config';

export class Splash {
  private readonly el: HTMLElement | null;
  private readonly bar: HTMLElement | null;
  private readonly tip: Element | null;
  /** the full animated intro (false: tests, screenshots, Reduce Motion) */
  readonly full: boolean;
  private readonly hold: boolean;
  private skipped = false;
  private readonly t0: number;

  constructor() {
    this.el = document.getElementById('loader');
    this.bar = this.el?.querySelector<HTMLElement>('.sp-bar i') ?? null;
    this.tip = this.el?.querySelector('.loader-tip') ?? null;
    const q = location.search;
    const forced = /[?&]splash\b/.test(q);
    const automated = /[?&](shots|autopilot)\b/.test(q) || navigator.webdriver === true;
    let reduce = false;
    try {
      reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduce = false;
    }
    this.full = !!this.el && !reduce && (forced || !automated);
    this.hold = /[?&]splash=hold\b/.test(q);
    // the intro's clock starts with the page, not with this script
    this.t0 = 0;
    if (!this.el) return;
    if (!this.full) this.el.classList.add('quick');
    this.drawRays();
    if (this.full) {
      const skip = (): void => {
        this.skipped = true;
        window.removeEventListener('pointerdown', skip, true);
        window.removeEventListener('keydown', skip, true);
      };
      window.addEventListener('pointerdown', skip, true);
      window.addEventListener('keydown', skip, true);
    }
  }

  /** loading progress 0..100, with an optional tip line */
  progress(pct: number, text?: string): void {
    this.bar?.style.setProperty('--p', String(Math.max(0.06, Math.min(1, pct / 100))));
    if (text && this.tip) this.tip.textContent = text;
  }

  /** resolves once the intro has played its big moments (or the player tapped to skip the wait) */
  ready(): Promise<void> {
    if (!this.full) return Promise.resolve();
    const S = CFG.splash;
    return new Promise((res) => {
      const check = (): void => {
        if (this.hold) return;
        const left = this.t0 + S.minMs - performance.now();
        if (left <= 0 || this.skipped) res();
        else setTimeout(check, Math.min(left, 100));
      };
      check();
    });
  }

  /** play the exit (wave wipe, or a short fade for the quick splash) and remove the splash */
  exit(): void {
    const el = this.el;
    if (!el) return;
    if (!this.full) {
      el.classList.add('done');
      setTimeout(() => el.remove(), 500);
      return;
    }
    el.classList.add('out');
    setTimeout(() => el.remove(), CFG.splash.wipeMs + 80);
  }

  /** soft sun rays on a small canvas: drawn once, scaled and spun by CSS (cheap to composite) */
  private drawRays(): void {
    const c = this.el?.querySelector<HTMLCanvasElement>('.sp-rays');
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const n = 256;
    const h = n / 2;
    const rays = CFG.splash.rays;
    const g = ctx.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255, 250, 220, 0.75)');
    g.addColorStop(0.35, 'rgba(255, 236, 170, 0.4)');
    g.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = g;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const w = (Math.PI / rays) * (i % 2 ? 0.55 : 0.8);
      ctx.beginPath();
      ctx.moveTo(h, h);
      ctx.arc(h, h, h, a - w / 2, a + w / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}
