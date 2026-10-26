import { MODIFIERS, type Modifier } from '../meta/daily';
import { btn, el, fmt } from './dom';
import { countdown } from './home';
import { ICON } from './icons';

/** Big art for each Daily Tide modifier. */
export const MODIFIER_SVG: Record<Modifier, string> = {
  lowTide: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 44c8-4 16-4 24 0s16 4 32 0v16H4z" fill="#4aa8ff"/><path d="M4 40c10-10 46-10 56 0" fill="#f6dda6"/><g fill="#ffc23a" stroke="#b5660a" stroke-width="1.6"><path d="M16 36c0-6 8-6 8 0z"/><path d="M30 33c0-7 9-7 9 0z"/><path d="M44 36c0-6 8-6 8 0z"/></g><path d="M8 18h20M14 24h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`,
  gullDay: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 26c8-8 16-8 24 2 8-10 16-10 24-2-8-2-14 0-24 10C20 26 14 24 6 26z" fill="#fff" stroke="#173f66" stroke-width="2.4" stroke-linejoin="round"/><path d="M28 30l2 4 2-4" fill="#ffb020"/><path d="M18 46c4-4 8-4 10 1 3-5 7-5 10-1-4-1-7 0-10 5-3-5-6-6-10-5z" fill="#fff" stroke="#173f66" stroke-width="1.8"/></svg>`,
  bigWaves: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 52c4-22 18-36 34-36 10 0 18 6 20 14-6-6-16-6-20 2 8-2 14 2 14 8-8-6-18-4-22 4-4 8-14 10-26 8z" fill="#2fa6d6"/><path d="M38 16c10 0 18 6 20 14-6-6-16-6-20 2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M4 56h56" stroke="#1d8fd0" stroke-width="5" stroke-linecap="round"/></svg>`,
  mirror: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="30" y="6" width="4" height="52" rx="2" fill="#fff"/><path d="M26 32 10 20v24z" fill="#ff7a6a"/><path d="M38 32l16-12v24z" fill="#ff7a6a" opacity=".55"/></svg>`,
  magnetMadness: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 10h12v22a6 6 0 0 0 12 0V10h12v22a18 18 0 0 1-36 0z" fill="#ff5a4a" stroke="#a83020" stroke-width="2"/><rect x="14" y="10" width="12" height="9" fill="#e8eef4"/><rect x="38" y="10" width="12" height="9" fill="#e8eef4"/><g stroke="#ffd23a" stroke-width="3" stroke-linecap="round"><path d="M8 56l4-6M32 60v-7M56 56l-4-6"/></g></svg>`,
  nightRun: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="38" cy="22" r="14" fill="#fff6c8"/><circle cx="45" cy="17" r="12" fill="#2a2f6a"/><g fill="#fff6c8"><circle cx="12" cy="14" r="2"/><circle cx="22" cy="30" r="1.5"/><circle cx="54" cy="40" r="2"/></g><path d="M14 58V42" stroke="#6b4423" stroke-width="3"/><path d="M10 42c0-6 4-8 4-12 0 4 4 6 4 12z" fill="#ffb020"/></svg>`,
  ballStorm: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="36" r="16" fill="#fff" stroke="#173f66" stroke-width="2"/><path d="M24 20a16 16 0 0 1 0 32M8 36h32" stroke="#ff5a4a" stroke-width="5" fill="none"/><path d="M12 26a16 16 0 0 1 24 0" stroke="#4aa8ff" stroke-width="5" fill="none"/><circle cx="48" cy="18" r="9" fill="#ffd23a" stroke="#b5660a" stroke-width="2"/></svg>`,
};

export interface DailyData {
  today: string;
  modifier: Modifier;
  /** streak as of today (0 if lapsed) */
  streak: number;
  savers: number;
  bestToday: number;
  playedToday: boolean;
  /** the last 7 dates (oldest first) and whether each had a finish */
  week: { key: string; label: string; done: boolean; today: boolean }[];
  msLeft: number;
  /** Flower Crown at 7, Moonscuttle at 30 */
  milestones: { days: number; name: string; art: string; got: boolean }[];
  firstXp: number;
}

/**
 * Daily Tide (UPDATE2_PLAN.md §6.2): one seeded course a day with a rotating modifier, a best score,
 * and a streak with savers.
 */
export class DailyScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private timer = 0;
  private msLeft = 0;

  constructor(private h: { back(): void; play(): void }) {
    this.el = el('div', 'screen page daily');
    this.el.id = 'daily';
    const card = el('div', 'page-card daily-card');
    const head = el('div', 'page-head');
    head.append(btn(ICON.back, 'icon ghost back', () => this.h.back(), 'Back'), el('h2', '', 'Daily Tide'));
    this.body = el('div', 'page-body daily-body');
    card.append(head, this.body);
    this.el.append(el('div', 'page-dim'), card);
  }

  render(d: DailyData): void {
    const mod = MODIFIERS.find((m) => m.id === d.modifier)!;
    this.msLeft = d.msLeft;
    this.body.innerHTML = '';
    const hero = el('div', `dt-hero mod-${d.modifier}`);
    hero.innerHTML = `<span class="dt-art">${MODIFIER_SVG[d.modifier]}</span><span class="dt-col"><span class="dt-today">Today's tide</span><span class="dt-name">${mod.name}</span><span class="dt-desc">${mod.desc}</span></span>`;
    const stats = el('div', 'dt-stats');
    stats.innerHTML = `<div class="dt-stat dt-streak${d.streak > 0 ? ' on' : ''}"><span class="ds-ico">${ICON.flame}</span><b>${d.streak}</b><span>day streak</span></div><div class="dt-stat"><span class="ds-ico">${ICON.trophy}</span><b>${fmt(d.bestToday)}</b><span>best today</span></div><div class="dt-stat"><span class="ds-ico saver">${ICON.shield}</span><b>${d.savers}</b><span>streak savers</span></div>`;
    const week = el('div', 'dt-week');
    week.setAttribute('aria-label', 'This week');
    for (const w of d.week) week.insertAdjacentHTML('beforeend', `<span class="dw${w.done ? ' done' : ''}${w.today ? ' today' : ''}"><i>${w.done ? ICON.flame : ''}</i><small>${w.label}</small></span>`);
    const rewards = el('div', 'dt-rewards');
    rewards.innerHTML = d.playedToday
      ? `<span class="dr-done">${ICON.check}Today's reward collected. Beat your best!</span>`
      : `<span>First run today:</span><b>+${d.firstXp} XP</b><b>${ICON.shell}+100</b>`;
    const ms = el('div', 'dt-miles');
    for (const m of d.milestones) {
      const pct = Math.min(100, Math.round((Math.min(d.streak, m.days) / m.days) * 100));
      ms.insertAdjacentHTML('beforeend', `<div class="dm${m.got ? ' got' : ''}"><span class="dm-art">${m.art}</span><span class="dm-col"><span class="dm-name">${m.name}</span><span class="bar"><i style="width:${m.got ? 100 : pct}%"></i></span><span class="dm-sub">${m.got ? 'Unlocked' : `${m.days}-day streak · ${Math.min(d.streak, m.days)}/${m.days}`}</span></span></div>`);
    }
    const play = btn(`${ICON.play}<span>${d.playedToday ? 'Play again' : 'Play'}</span>`, 'big daily-play', () => this.h.play());
    const foot = el('div', 'dt-foot', `New tide in <b class="cd">${countdown(d.msLeft)}</b> · Everyone gets the same course today`);
    this.body.append(hero, stats, week, rewards, ms, play, foot);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.msLeft -= 1000;
      const cd = this.body.querySelector('.cd');
      if (cd) cd.textContent = countdown(this.msLeft);
    }, 1000);
    requestAnimationFrame(() => play.focus({ preventScroll: true }));
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

