/**
 * Crab Cup race HUD (UPDATE4_PLAN.md §5.4): your place, a course strip with every racer, and the
 * Shell Dash meter. Lives inside #hud; only shown during races.
 */
import { el } from './dom';
import { ICON } from './icons';
import { ordinal } from './cup';

export interface RaceHudRacer {
  id: string;
  you: boolean;
  progress: number;
  place: number;
}

/** rival colours on the course strip (match their crab bodies) */
const DOT: Record<string, string> = { shelly: '#f27ab8', barnacle: '#f6c12e', pip: '#3f86e8', coco: '#4cbc5c' };

export class RaceHud {
  readonly el: HTMLElement;
  private pos: HTMLElement;
  private posNum: HTMLElement;
  private track: HTMLElement;
  private dots = new Map<string, HTMLElement>();
  private dash: HTMLElement;
  private dashFill: HTMLElement;
  private dashLabel: HTMLElement;
  private lastPlace = 0;
  private lastDash = '';

  constructor() {
    this.el = el('div', 'race-hud hidden');
    this.pos = el('div', 'rh-pos', '<b>1</b><sup>st</sup><small>/4</small>');
    this.posNum = this.pos.querySelector('b') as HTMLElement;
    this.track = el('div', 'rh-track', `<span class="rh-line"></span><span class="rh-flag">${ICON.flag}</span>`);
    this.dash = el('div', 'rh-dash', `<span class="rh-di">${ICON.shell}</span><span class="rh-bar"><i></i></span><span class="rh-dl">Shell Dash</span>`);
    this.dashFill = this.dash.querySelector('i') as HTMLElement;
    this.dashLabel = this.dash.querySelector('.rh-dl') as HTMLElement;
    this.el.append(this.pos, this.track, this.dash);
  }

  /** set up the racers' dots for a new race */
  start(racers: { id: string; you: boolean; name: string }[]): void {
    for (const d of this.dots.values()) d.remove();
    this.dots.clear();
    for (const r of racers) {
      const d = el('span', `rh-dot${r.you ? ' you' : ''}`, r.you ? ICON.crab : '');
      if (!r.you) d.style.background = DOT[r.id] ?? '#fff';
      d.title = r.name;
      this.track.appendChild(d);
      this.dots.set(r.id, d);
    }
    this.lastPlace = 0;
    this.lastDash = '';
    this.el.classList.remove('hidden');
  }

  stop(): void {
    this.el.classList.add('hidden');
  }

  update(racers: readonly RaceHudRacer[], dashMeter: number, dashing: boolean, dashFrac: number): void {
    for (const r of racers) {
      const d = this.dots.get(r.id);
      if (d) d.style.left = `${(r.progress * 100).toFixed(1)}%`;
      if (r.you && r.place !== this.lastPlace) {
        const up = this.lastPlace > 0 && r.place < this.lastPlace;
        this.lastPlace = r.place;
        this.posNum.textContent = String(r.place);
        (this.pos.querySelector('sup') as HTMLElement).textContent = ordinal(r.place).slice(-2);
        this.pos.className = `rh-pos p${r.place}`;
        void this.pos.offsetWidth;
        this.pos.classList.add(up ? 'up' : 'pop');
      }
    }
    const f = dashing ? dashFrac : dashMeter;
    this.dashFill.style.width = `${(Math.max(0, Math.min(1, f)) * 100).toFixed(1)}%`;
    const key = dashing ? 'on' : dashMeter >= 0.999 ? 'full' : '';
    if (key !== this.lastDash) {
      this.lastDash = key;
      this.dash.classList.toggle('on', dashing);
      this.dashLabel.textContent = dashing ? 'DASH!' : 'Shell Dash';
    }
  }
}
