/**
 * Second Chance (UPDATE5_PLAN.md §4): after a crash in a Beach Run or Daily Tide, a "Keep going?"
 * card with a countdown ring. Continue (free once a day, then pearls) or let the run end.
 */
import { btn, el, fmt } from './dom';
import { ICON } from './icons';
import { PEARL_ICO } from './kit';

export interface ReviveOffer {
  cost: number;
  pearls: number;
  distance: number;
  best: number;
  window: number;
}

export class ReviveCard {
  readonly el: HTMLElement;
  private card: HTMLElement;
  private num!: HTMLElement;
  private ring!: SVGCircleElement;
  private go!: HTMLButtonElement;
  private window = 5;
  private last = -1;

  constructor(private h: { go(): void; no(): void }) {
    this.el = el('div', 'screen revive hidden');
    this.el.id = 'revive';
    this.card = el('div', 'rv-card');
    this.el.append(el('div', 'rv-dim'), this.card);
  }

  show(o: ReviveOffer): void {
    this.window = o.window;
    this.last = -1;
    const C = 2 * Math.PI * 44;
    const toBest = o.best > o.distance ? `<small>${fmt(Math.ceil(o.best - o.distance))} m to your best!</small>` : '<small>A new best is on the line!</small>';
    this.card.innerHTML = `<div class="rv-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="rv-track" cx="50" cy="50" r="44"/><circle class="rv-prog" cx="50" cy="50" r="44" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/></svg><b class="rv-num">${Math.ceil(o.window)}</b></div>
      <h2 class="rv-title">Keep going?</h2>
      <p class="rv-sub"><b>${fmt(Math.floor(o.distance))} m</b>${toBest}</p>`;
    this.num = this.card.querySelector('.rv-num') as HTMLElement;
    this.ring = this.card.querySelector('.rv-prog') as SVGCircleElement;
    const free = o.cost === 0;
    const label = free ? `${ICON.play}<span>Continue</span><span class="rv-cost free">FREE</span>` : `${ICON.play}<span>Continue</span><span class="rv-cost">${PEARL_ICO}${o.cost}</span>`;
    this.go = btn(label, 'big green rv-go', () => this.h.go(), free ? 'Continue for free' : `Continue for ${o.cost} pearls`);
    this.go.disabled = !free && o.pearls < o.cost;
    const no = btn('No thanks', 'small ghost rv-no', () => this.h.no());
    const foot = el('div', 'rv-foot', free ? 'One free Second Chance a day' : `You have ${PEARL_ICO}<b>${o.pearls}</b> pearls`);
    this.card.append(this.go, no, foot);
    this.el.classList.remove('hidden');
    setTimeout(() => this.go.focus({ preventScroll: true }), 30);
  }

  /** seconds left on the offer */
  tick(left: number): void {
    const n = Math.max(0, Math.ceil(left));
    if (n !== this.last) {
      this.last = n;
      this.num.textContent = String(n);
      this.num.classList.remove('tick');
      void this.num.offsetWidth;
      this.num.classList.add('tick');
    }
    const C = 2 * Math.PI * 44;
    this.ring.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, left) / this.window)).toFixed(1));
  }

  get canContinue(): boolean {
    return !this.go.disabled;
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
