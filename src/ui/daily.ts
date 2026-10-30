import { MODIFIERS, type Modifier } from '../meta/daily';
import { btn, el, fmt } from './dom';
import { Sheet, actionBar, pageHead } from './kit';
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

const CLOCK = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="#14254f" stroke-width="3.5"/><path d="M20 11v10l6 4" stroke="#14254f" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`;
const PEOPLE = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="14" cy="14" r="5" fill="#14254f"/><circle cx="27" cy="14" r="5" fill="#14254f"/><path d="M4 32c0-7 5-11 10-11s10 4 10 11zM18 32c1-6 5-10 9-10 5 0 9 4 9 10z" fill="#14254f"/></svg>`;
const BOOK = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 9c5-2 10-2 14 2v22c-4-4-9-4-14-2zM34 9c-5-2-10-2-14 2v22c4-4 9-4 14-2z" fill="#1a84dc"/></svg>`;

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
  /** the last 30 days with their best scores (oldest first) */
  calendar?: { key: string; day: number; score: number; played?: boolean; today: boolean }[];
  /** every modifier: your best, and how many days until it comes round (0 = today) */
  almanac?: { id: Modifier; name: string; desc: string; best: number; inDays: number }[];
}

/**
 * Daily Tide (UPDATE2_PLAN.md §6.2): one seeded course a day with a rotating modifier, a best score,
 * and a streak with savers.
 */
export class DailyScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private actions: HTMLElement;
  private sheet = new Sheet('daily-sheet');
  private timer = 0;
  private msLeft = 0;
  private reset: HTMLElement;

  constructor(private h: { back(): void; play(): void }) {
    this.el = el('div', 'screen page daily');
    this.el.id = 'daily';
    const card = el('div', 'page-card daily-card');
    this.reset = el('div', 'u-pill dt-reset', `${CLOCK}<span>Resets in <b class="cd">--:--:--</b></span>`);
    const { head } = pageHead('Daily Tide', () => this.h.back(), [this.reset]);
    this.body = el('div', 'page-body daily-body');
    this.actions = actionBar();
    card.append(head, this.body, this.actions);
    this.el.append(el('div', 'page-dim'), card, this.sheet.el);
  }

  render(d: DailyData): void {
    const mod = MODIFIERS.find((m) => m.id === d.modifier)!;
    this.msLeft = d.msLeft;
    this.body.innerHTML = '';
    // left: today's twist as a big illustrated card (UPDATE6_PLAN.md §2)
    const hero = el('div', `dt-hero6 mod-${d.modifier}`);
    hero.innerHTML = `<span class="dh-sky"></span><span class="dh-art">${MODIFIER_SVG[d.modifier]}</span><span class="dh-col"><span class="dh-today">Today's tide</span><span class="dh-name">${mod.name}</span><span class="dh-desc">${mod.desc}</span></span><span class="dh-same">${PEOPLE}<span>Same course for everyone!</span></span>`;
    // right: first-run reward, best and streak, the next streak reward, the week
    const reward = el('div', 'dt-box dt-reward6');
    reward.innerHTML = `<div class="db-row"><span class="db-t">First run reward</span><span class="db-state${d.playedToday ? ' done' : ''}">${d.playedToday ? 'Claimed' : 'Not claimed'}</span></div><div class="dr-chips"><span class="dr-chip xp">${ICON.star}<b>+${d.firstXp} XP</b></span><span class="dr-chip sh">${ICON.shell}<b>+100 Shells</b></span></div>`;
    const tiles = el('div', 'dt-tiles');
    tiles.innerHTML = `<div class="dt-box dt-tile"><span class="dtt-ico">${ICON.trophy}</span><span class="dtt-col"><span>Today's best</span><b>${d.bestToday ? fmt(d.bestToday) : '—'}</b></span></div><div class="dt-box dt-tile${d.streak > 0 ? ' hot' : ''}"><span class="dtt-ico">${ICON.flame}</span><span class="dtt-col"><span>Current streak</span><b>${d.streak} day${d.streak === 1 ? '' : 's'}</b>${d.savers ? `<small>${d.savers} streak saver${d.savers > 1 ? 's' : ''}</small>` : ''}</span></div>`;
    const next = d.milestones.find((m) => !m.got) ?? d.milestones[d.milestones.length - 1]!;
    const have = Math.min(d.streak, next.days);
    const steps = Math.min(next.days, 7);
    const lit = next.days <= 7 ? have : Math.floor((have / next.days) * steps);
    const nr = el('div', 'dt-box dt-next');
    nr.innerHTML = `<span class="dn-art">${next.art}</span><span class="dn-col"><span class="dn-t">${next.got ? 'Unlocked:' : 'Next reward:'} <b>${next.name}</b></span><small>${next.got ? 'Every streak reward is yours!' : `Get ${next.days} consecutive daily tides.`}</small><span class="dn-steps">${Array.from({ length: steps }, (_, k) => `<i class="${k < lit ? 'on' : ''}"></i>`).join('')}<b>${have}/${next.days}</b></span></span>`;
    const week = el('div', 'dt-box dt-week6');
    week.setAttribute('aria-label', 'This week');
    week.innerHTML = d.week.map((w) => `<span class="dw6${w.done ? ' done' : ''}${w.today ? ' today' : ''}"><i>${w.done ? ICON.check : ''}</i><small>${w.label}</small></span>`).join('');
    const colA = el('div', 'dt-col-a');
    colA.append(hero);
    const colB = el('div', 'dt-col-b');
    colB.append(reward, tiles, nr, week);
    this.body.append(colA, colB);
    // the calendar and the almanac open in a sheet
    const cal = d.calendar ? this.calendar(d.calendar) : null;
    const alm = d.almanac ? this.almanac(d.almanac) : null;
    this.actions.innerHTML = '';
    const pc = el('div', 'dt-playcol');
    const play = btn(`${ICON.play}<span>${d.playedToday ? 'Play Again' : "Play Today's Tide"}</span>`, 'big daily-play', () => this.h.play());
    const more = el('div', 'dt-more6');
    if (cal) more.appendChild(btn(`${ICON.chart}<span>History</span>`, 'ghost dt-chip', () => this.openSheet('Last 30 days', cal), 'Show the last 30 days'));
    if (alm) more.appendChild(btn(`${BOOK}<span>Tide Almanac</span>`, 'ghost dt-chip', () => this.openSheet('Tide almanac', alm), 'Show the coming tides'));
    pc.append(play, more);
    this.actions.appendChild(pc);
    const tick = (): void => {
      for (const cd of this.el.querySelectorAll('.cd')) cd.textContent = countdown(this.msLeft);
    };
    tick();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.msLeft -= 1000;
      tick();
    }, 1000);
    requestAnimationFrame(() => play.focus({ preventScroll: true }));
  }

  private calendar(days: NonNullable<DailyData['calendar']>): HTMLElement {
    const best = Math.max(1, ...days.map((c) => c.score));
    const cal = el('div', 'dt-cal');
    cal.innerHTML = `<div class="dt-sec">Last 30 days</div><div class="cal-grid">${days
      .map((c) => `<span class="cd-day${c.score || c.played ? ' played' : ''}${c.today ? ' today' : ''}" title="${c.key}${c.score ? `: ${fmt(c.score)}` : ''}" style="--h:${c.score ? Math.max(0.25, c.score / best) : c.played ? 0.25 : 0}"><i></i><small>${c.day}</small></span>`)
      .join('')}</div>`;
    return cal;
  }

  private almanac(rows: NonNullable<DailyData['almanac']>): HTMLElement {
    const al = el('div', 'dt-almanac');
    al.innerHTML = `<div class="dt-sec">Tide almanac</div>${rows
      .map((a) => `<div class="al-row${a.inDays === 0 ? ' now' : ''}"><span class="al-art">${MODIFIER_SVG[a.id]}</span><span class="al-col"><b>${a.name}</b><small>${a.desc}</small></span><span class="al-when">${a.inDays === 0 ? 'Today' : a.inDays === 1 ? 'Tomorrow' : `in ${a.inDays} days`}${a.best ? `<small>Best ${fmt(a.best)}</small>` : ''}</span></div>`)
      .join('')}`;
    return al;
  }

  private openSheet(title: string, content: HTMLElement): void {
    this.sheet.body.innerHTML = '';
    this.sheet.body.appendChild(content);
    this.sheet.show(title);
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

