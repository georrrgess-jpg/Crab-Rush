/** "What's new" sheet (UPDATE3_PLAN.md §2): shown once to returning players after Update 3 lands. */
import { btn, el } from './dom';
import { ICON } from './icons';

export interface WhatsNewItem {
  icon: string;
  title: string;
  text: string;
}

export class WhatsNewSheet {
  readonly el: HTMLElement;
  private card: HTMLElement;
  private open = false;
  private onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    // keep Home's shortcuts quiet while the sheet is up; Escape / Enter close it
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Enter' || e.key === ' ') {
      const t = document.activeElement;
      if (!(t instanceof HTMLButtonElement) || !this.el.contains(t)) {
        e.preventDefault();
        this.close();
      }
    }
  };

  constructor(private h: { visit(): void; closed?(): void }) {
    this.el = el('div', 'whatsnew hidden');
    this.el.id = 'whatsnew';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', "What's new in Crab Dash");
    const dim = el('div', 'wn-dim');
    this.card = el('div', 'wn-card');
    this.el.append(dim, this.card);
    // nothing behind the sheet reacts while it is up
    for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart']) this.el.addEventListener(ev, (e) => e.stopPropagation());
    dim.addEventListener('click', () => this.close());
  }

  get visible(): boolean {
    return this.open;
  }

  show(items: WhatsNewItem[], coveIcon: string): void {
    this.card.innerHTML = `<div class="wn-burst" aria-hidden="true"></div>
      <div class="wn-head"><span class="wn-tag">Update 3</span><h2>What's new</h2><p>Shell Shock is here!</p></div>`;
    const list = el('div', 'wn-list');
    items.forEach((it, i) => {
      const row = el('div', 'wn-row', `<span class="wn-ico">${it.icon}</span><span class="wn-txt"><b>${it.title}</b><small>${it.text}</small></span>`);
      row.style.setProperty('--i', String(i));
      list.appendChild(row);
    });
    const acts = el('div', 'wn-acts');
    const visit = btn(`<span class="wn-bi">${coveIcon}</span><span>Visit the Cove</span>`, 'small blue', () => {
      this.close(true);
      this.h.visit();
    });
    const go = btn(`${ICON.check}<span>Let's go!</span>`, 'small green', () => this.close());
    acts.append(visit, go);
    const scroller = el('div', 'wn-scroll');
    scroller.appendChild(list);
    this.card.append(scroller, acts);
    this.el.classList.remove('hidden', 'out');
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    this.open = true;
    window.addEventListener('keydown', this.onKey, true);
    setTimeout(() => go.focus({ preventScroll: true }), 60);
  }

  close(instant = false): void {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener('keydown', this.onKey, true);
    if (instant) this.el.classList.add('hidden');
    else {
      this.el.classList.add('out');
      setTimeout(() => {
        if (!this.open) this.el.classList.add('hidden');
      }, 260);
    }
    this.h.closed?.();
  }
}
