import { btn, el, fmt } from './dom';
import { BOOST_SVG, HAT_SVG, ICON } from './icons';
import type { GoalView } from './ui';
import { Sheet, Wallet, onSizeClass } from './kit';
import { morphFrom } from './motion';
import { CUP_ICON } from './cup';
import { DIG_ICON } from './dig';

/** Everything the Home screen shows (UPDATE3_PLAN.md §2). */
export interface HomeData {
  best: number;
  shells: number;
  /** Sunny Pass */
  tier: number;
  maxTier: number;
  tierInto: number;
  tierNeed: number;
  passClaimable: number;
  goals: GoalView[];
  crabName: string;
  wardrobeBadge: boolean;
  /** Island Hop progress */
  islands: { stars: number; total: number } | null;
  /** Daily Tide */
  daily: { streak: number; playedToday: boolean; modifier: string; msLeft: number } | null;
  keyboard: boolean;
  /** Golden Shell boosts stored, and whether the next Beach Run uses one */
  boosts: number;
  boostOn: boolean;
  /** the next big Sunny Pass reward ("Next: Parrot Pal, 2 tiers") */
  nextReward: string | null;
  /** profile card: a portrait of the equipped crab (data URL) and the player's title */
  avatar?: string | null;
  title?: string;
  /** Treasure Dig: spades in hand, relics found, current site */
  dig?: { spades: number; relics: number; total: number; site: number } | null;
  pearls?: number;
  /** Crab Cup: cups cleared, the cup in progress */
  cup?: { cleared: number; total: number; current: string | null; wins: number } | null;
}

export interface HomeHandlers {
  play(): void;
  islands(): void;
  daily(): void;
  dig?(): void;
  trophies?(): void;
  cup?(): void;
  wardrobe(): void;
  pass(): void;
  settings(): void;
  howto(): void;
  stats(): void;
  /** tap on the crab area: emote */
  poke(): void;
  toggleBoost(): void;
  /** carousel focus changed (sound / camera) */
  focus?(i: number): void;
}

const pad = (n: number): string => String(n).padStart(2, '0');
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Illustrated, animated card scenes (inline SVG + CSS animation; no assets). */
const ART = {
  beach: `<svg class="mc-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="ab-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset=".55" stop-color="#ff8a3a"/><stop offset="1" stop-color="#ff6a2a"/></linearGradient></defs><rect width="320" height="160" fill="url(#ab-sky)"/><circle class="a-sun" cx="250" cy="52" r="26" fill="#fff3b0" opacity=".9"/><g class="a-waves" fill="rgba(255,255,255,.28)"><path d="M0 112q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0v60H0z"/></g><path d="M0 130c60-14 140-18 320-6v36H0z" fill="#ffd27a"/><g class="a-palm"><path d="M44 132c2-26 6-46 14-64" stroke="#8a4a1e" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M58 68c-18-10-34-6-42 2 14-2 26 0 42 6zm0 0c14-14 32-14 40-6-14-2-26 0-40 10zm0 0c4-18-4-30-14-34 8 10 10 22 8 34z" fill="#2f9e4a"/></g><g class="a-crab"><ellipse cx="0" cy="0" rx="12" ry="8" fill="#e8402f"/><circle cx="-5" cy="-9" r="3.4" fill="#fff"/><circle cx="5" cy="-9" r="3.4" fill="#fff"/><circle cx="-5" cy="-9" r="1.6" fill="#222"/><circle cx="5" cy="-9" r="1.6" fill="#222"/><path d="M-12-2l-8-6M12-2l8-6" stroke="#e8402f" stroke-width="3.5" stroke-linecap="round"/></g></svg>`,
  islands: `<svg class="mc-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="ai-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fc4f0"/><stop offset="1" stop-color="#1f74b8"/></linearGradient></defs><rect width="320" height="160" fill="url(#ai-sea)"/><g class="a-waves" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="3" stroke-linecap="round"><path d="M10 40q10-6 20 0t20 0M200 24q10-6 20 0t20 0M120 140q10-6 20 0t20 0"/></g><g class="a-isle"><ellipse cx="230" cy="112" rx="70" ry="22" fill="#f6dda6"/><path d="M232 104c2-20 6-34 12-46" stroke="#8a4a1e" stroke-width="5" fill="none"/><path d="M244 58c-14-8-26-4-32 2 10-2 20 0 32 4zm0 0c10-10 24-10 30-4-10-2-20 0-30 8z" fill="#2f9e4a"/><path class="a-flag" d="M200 100V74l18 6-18 6" fill="#ff5a4a" stroke="#fff" stroke-width="2"/></g><path d="M40 120q40-30 80-20t80-4" stroke="#fff" stroke-width="3" stroke-dasharray="6 7" fill="none" opacity=".8"/><circle cx="40" cy="120" r="7" fill="#ffd23a" stroke="#fff" stroke-width="2"/><circle cx="120" cy="100" r="7" fill="#ffd23a" stroke="#fff" stroke-width="2"/></svg>`,
  daily: `<svg class="mc-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="ad-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd0c0"/><stop offset="1" stop-color="#1d8c84"/></linearGradient></defs><rect width="320" height="160" fill="url(#ad-sky)"/><g class="a-waves" fill="rgba(255,255,255,.22)"><path d="M0 120q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0v60H0z"/></g><g class="a-cal"><rect x="208" y="34" width="76" height="76" rx="12" fill="#fff"/><rect x="208" y="34" width="76" height="22" rx="10" fill="#ff5a4a"/><rect class="a-page" x="216" y="62" width="60" height="40" rx="6" fill="#eef7fb"/><path d="M232 82l9 9 17-19" stroke="#3fbf55" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><path class="a-flame" d="M60 118c2-10 12-14 12-28 6 8 4 14 8 18 2-4 2-8 2-10 6 6 8 12 8 20a15 15 0 0 1-30 0z" fill="#ffb020"/></svg>`,
  dig: `<svg class="mc-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="ag-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf4a"/><stop offset="1" stop-color="#ff8a2a"/></linearGradient></defs><rect width="320" height="160" fill="url(#ag-sky)"/><g class="a-rays" fill="rgba(255,255,255,.16)"><path d="M232 92L330 30v34zM232 92L330 120v34zM232 92L170 -10h50z"/></g><path d="M0 118c70-14 180-18 320-4v46H0z" fill="#f6dda6"/><path d="M0 132c90-10 200-10 320 0v28H0z" fill="#e9c37e"/><g class="a-chest"><rect x="200" y="84" width="64" height="38" rx="6" fill="#a8743f" stroke="#5a3a1a" stroke-width="3"/><path d="M198 88c0-18 68-18 68 0z" fill="#c98a4a" stroke="#5a3a1a" stroke-width="3"/><rect x="226" y="92" width="12" height="14" rx="3" fill="#ffd23a" stroke="#8a5a10" stroke-width="2"/><path d="M200 100h64" stroke="#5a3a1a" stroke-width="3"/><circle class="a-glint" cx="214" cy="78" r="5" fill="#fff"/></g><path d="M196 122c10-8 60-8 72 0z" fill="#e9c37e"/><g class="a-shovel"><path d="M70 40l40 66" stroke="#8a4a1e" stroke-width="7" stroke-linecap="round"/><path d="M98 96l26 14-8 18c-8 6-24-2-26-12z" fill="#cfd8e0" stroke="#5a6a7a" stroke-width="3"/></g><g fill="#fff"><path class="a-spark" d="M150 50l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><path class="a-spark s2" d="M282 54l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></g><g class="a-sandpuff" fill="rgba(255,240,200,.85)"><circle cx="118" cy="118" r="7"/><circle cx="132" cy="112" r="5"/><circle cx="106" cy="110" r="4"/></g></svg>`,
  cup: `<svg class="mc-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="au-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a8a"/><stop offset="1" stop-color="#d23a5a"/></linearGradient></defs><rect width="320" height="160" fill="url(#au-sky)"/><g class="a-rays" fill="rgba(255,255,255,.12)"><path d="M250 70L330 20v30zM250 70L330 100v30zM250 70L200 -10h40z"/></g><path d="M0 128h320v32H0z" fill="#f6dda6"/><g opacity=".9"><rect x="150" y="104" width="10" height="34" fill="#fff"/><rect x="150" y="104" width="5" height="5" fill="#222"/><rect x="155" y="109" width="5" height="5" fill="#222"/><rect x="150" y="114" width="5" height="5" fill="#222"/><rect x="155" y="119" width="5" height="5" fill="#222"/></g><g class="a-cup"><path d="M226 40h48v20a24 24 0 0 1-48 0z" fill="#ffd23a" stroke="#b07a10" stroke-width="3"/><path d="M226 46h-12c0 14 8 20 16 20M274 46h12c0 14-8 20-16 20" stroke="#ffd23a" stroke-width="6" fill="none"/><rect x="244" y="82" width="12" height="12" fill="#e9a820"/><rect x="232" y="94" width="36" height="10" rx="3" fill="#ffd23a" stroke="#b07a10" stroke-width="3"/><path d="M250 48l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#fff" opacity=".8"/></g><g class="a-racers"><g class="a-r1"><ellipse cx="0" cy="0" rx="13" ry="9" fill="#ff5a4a"/><circle cx="-5" cy="-9" r="3" fill="#fff"/><circle cx="5" cy="-9" r="3" fill="#fff"/></g><g class="a-r2"><ellipse cx="0" cy="0" rx="13" ry="9" fill="#5ab0ff"/><circle cx="-5" cy="-9" r="3" fill="#fff"/><circle cx="5" cy="-9" r="3" fill="#fff"/></g></g><g stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"><path class="a-speed" d="M20 112h30M10 122h40M30 132h26"/></g></svg>`,
};

interface Card {
  id: 'beach' | 'cup' | 'islands' | 'daily' | 'dig';
  el: HTMLButtonElement;
  sub: HTMLElement;
  badge: HTMLElement;
  cta: HTMLElement;
}

/**
 * Home v3 (UPDATE3_PLAN.md §2): a profile card and wallet on top, the logo and goals, the crab
 * diorama, a mode carousel of animated illustrated cards, and an animated bottom nav.
 */
export class HomeScreen {
  readonly el: HTMLElement;
  private profile: HTMLButtonElement;
  private wallet: Wallet;
  private more: Sheet;
  private goalsSheet = new Sheet('home-goals-sheet');
  private goalsSheetList = el('div', 'sheet-goals');
  private passNext: HTMLElement;
  private goalsEl: HTMLElement;
  private goalsChip: HTMLButtonElement;
  private wardrobeDot: HTMLElement;
  private passDot: HTMLElement;
  private boost: HTMLButtonElement;
  private track: HTMLElement;
  private dots: HTMLElement;
  private cards: Card[] = [];
  private digDot: HTMLElement | null = null;
  private navBubble: HTMLElement;
  private nav: HTMLElement;
  private focusIdx = 0;
  private dailyMs = 0;
  private data: HomeData | null = null;
  private timer = 0;

  constructor(private h: HomeHandlers) {
    this.el = el('div', 'screen home v3 v4 hidden');
    this.el.id = 'home';

    // ---- top bar: profile card + wallet
    const top = el('div', 'home-top');
    this.profile = el('button', 'pass-pill profile') as HTMLButtonElement;
    this.profile.type = 'button';
    this.profile.setAttribute('aria-label', 'Sunny Pass and profile');
    this.profile.innerHTML = `<span class="pf-ava"><span class="pf-ring"></span><span class="pf-img">${ICON.crab}</span><span class="pf-tier"><b>0</b></span></span><span class="col"><span class="lbl pf-title">Beach Rookie</span><span class="pf-row"><span class="bar"><i></i></span><span class="txt"></span></span></span><i class="dot hidden"></i>`;
    this.profile.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.pass();
    });
    this.passDot = this.profile.querySelector('.dot') as HTMLElement;
    this.passNext = el('span', 'pass-next-chip hidden');
    this.profile.appendChild(this.passNext);
    // one wallet pill (shells and pearls); help lives in the More sheet
    this.wallet = new Wallet('home-wallet');
    const right = el('div', 'home-top-r');
    right.append(this.wallet.el);
    top.append(this.profile, right);

    // ---- logo + goals
    const brand = el('div', 'home-brand');
    brand.innerHTML = `<h1 class="logo intro" aria-label="Crab Dash"><span class="w w1" data-t="Crab">${HAT_SVG}${split('Crab')}</span><span class="gap-shell">${ICON.shell}</span><span class="w w2" data-t="Dash">${split('Dash')}</span></h1><div class="home-tag"><span class="tagline">Shell Shock</span></div>`;
    this.goalsChip = el('button', 'goals-chip') as HTMLButtonElement;
    this.goalsChip.type = 'button';
    this.goalsChip.addEventListener('click', (e) => {
      e.stopPropagation();
      // the goals list opens as a sheet (it only sits inline on wide landscape screens)
      this.goalsSheetList.innerHTML = this.goalsEl.innerHTML;
      this.goalsSheet.show('Goals');
    });
    this.goalsEl = el('div', 'home-goals');

    // ---- the crab stage: taps make the crab emote
    const stage = el('div', 'home-stage');
    stage.setAttribute('aria-hidden', 'true');
    stage.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.poke();
    });

    // ---- mode carousel
    const modes = el('div', 'home-modes');
    this.track = el('div', 'mc-track');
    this.track.setAttribute('role', 'list');
    const mk = (id: Card['id'], title: string, icon: string, on: () => void, extra = ''): Card => {
      const c = el('button', `mode-card big ${id}${extra}`) as HTMLButtonElement;
      c.type = 'button';
      c.dataset.mode = id;
      c.setAttribute('role', 'listitem');
      c.innerHTML = `${ART[id]}<span class="mc-shade"></span><span class="mc-ico">${icon}</span><span class="mc-col"><span class="mc-title pc-label">${title}</span><span class="mc-sub pc-sub"></span></span><span class="mc-cta">${ICON.play}</span><span class="mc-badge hidden"></span><span class="shine"></span>`;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        // other modes grow out of their card; Play hands over to the camera's run intro instead
        if (id !== 'beach') morphFrom(c);
        on();
      });
      c.addEventListener('focus', () => this.setFocus(this.cards.findIndex((k) => k.el === c), false));
      return { id, el: c, sub: c.querySelector('.mc-sub') as HTMLElement, badge: c.querySelector('.mc-badge') as HTMLElement, cta: c.querySelector('.mc-cta') as HTMLElement };
    };
    this.cards.push(mk('beach', 'Play', ICON.play, () => this.h.play(), ' play-card'));
    if (this.h.cup) this.cards.push(mk('cup', 'Crab Cup', CUP_ICON, () => this.h.cup?.()));
    this.cards.push(mk('islands', 'Island Hop', ICON.island, () => this.h.islands()));
    this.cards.push(mk('daily', 'Daily Tide', ICON.calendar, () => this.h.daily()));
    if (this.h.dig) this.cards.push(mk('dig', 'Treasure Dig', DIG_ICON, () => this.h.dig?.()));
    for (const c of this.cards) this.track.appendChild(c.el);
    // the focused card follows the scroll position (swipes, wheel, arrows)
    let raf = 0;
    this.track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = this.track.scrollLeft + this.track.clientWidth / 2;
        let best = 0;
        let bd = Infinity;
        this.cards.forEach((c, i) => {
          const d = Math.abs(c.el.offsetLeft + c.el.offsetWidth / 2 - mid);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best !== this.focusIdx) this.setFocus(best, false);
      });
    });
    this.track.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && this.el.classList.contains('carousel-x')) {
          e.preventDefault();
          this.step(e.deltaY > 0 ? 1 : -1);
        }
      },
      { passive: false },
    );
    this.boost = el('button', 'boost-chip hidden') as HTMLButtonElement;
    this.boost.type = 'button';
    this.boost.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.toggleBoost();
    });
    this.dots = el('div', 'mc-dots');
    this.cards.forEach((c, i) => {
      // decorative position dots (swipes, arrows and keys do the navigating); still clickable
      const d = el('span', 'mc-dot');
      d.setAttribute('aria-hidden', 'true');
      void c;
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setFocus(i, true);
      });
      this.dots.appendChild(d);
    });
    const prev = btn(ICON.back, 'icon ghost mc-arrow prev', () => this.step(-1), 'Previous mode');
    const next = btn(ICON.back, 'icon ghost mc-arrow next', () => this.step(1), 'Next mode');
    modes.append(this.goalsChip, this.boost, this.track, prev, next, this.dots);

    // ---- bottom nav with a sliding bubble
    this.nav = el('nav', 'home-nav');
    this.nav.setAttribute('aria-label', 'Main');
    this.navBubble = el('span', 'nav-bubble');
    this.nav.appendChild(this.navBubble);
    const tab = (icon: string, label: string, on: () => void, current = false): HTMLButtonElement => {
      const b = el('button', `tab${current ? ' on' : ''}`, `<span class="ti">${icon}</span><span class="tl">${label}</span>`) as HTMLButtonElement;
      b.type = 'button';
      if (current) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveBubble(b);
        b.classList.remove('pop');
        void b.offsetWidth;
        b.classList.add('pop');
        on();
      });
      return b;
    };
    const wardrobe = tab(`${ICON.hanger}<i class="dot hidden"></i>`, 'Wardrobe', () => this.h.wardrobe());
    this.wardrobeDot = wardrobe.querySelector('.dot') as HTMLElement;
    const tabs = [tab(ICON.home, 'Home', () => {}, true), wardrobe, tab(ICON.sun, 'Pass', () => this.h.pass())];
    if (this.h.dig) {
      const dg = tab(`${DIG_ICON}<i class="dot hidden"></i>`, 'Dig', () => this.h.dig?.());
      this.digDot = dg.querySelector('.dot');
      tabs.push(dg);
    }
    // Stats, Settings and How to play share the More sheet: five tabs fit a 360 px phone
    tabs.push(tab(MORE_ICON, 'More', () => this.openMore()));
    this.nav.append(...tabs);
    this.more = new Sheet('home-more');
    const item = (icon: string, label: string, sub: string, on: () => void, color = ''): HTMLButtonElement => {
      const b = el('button', 'sheet-item', `<span class="si-ico"${color ? ` style="background:${color}"` : ''}>${icon}</span><span>${label}<small>${sub}</small></span>`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.item = label.toLowerCase();
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.more.close();
        on();
      });
      return b;
    };
    const list = el('div', 'sheet-list');
    list.append(
      item(ICON.trophy, 'Trophies', 'Your trophy shelf and profile titles', () => this.h.trophies?.(), '#ffb020'),
      item(ICON.chart, 'Stats', 'Records, totals and your favourite crab', () => this.h.stats()),
      item(ICON.gear, 'Settings', 'Sound, controls, graphics and accessibility', () => this.h.settings(), '#5a7a9a'),
      item(ICON.help, 'How to play', 'Controls, obstacles and power-ups', () => this.h.howto(), '#3fbf55'),
    );
    this.more.body.appendChild(list);

    const left = el('div', 'home-left');
    left.append(brand, this.goalsEl);
    this.goalsSheet.body.appendChild(this.goalsSheetList);
    this.el.append(top, left, stage, modes, this.nav, this.more.el, this.goalsSheet.el);
    window.addEventListener('resize', () => this.layout());
    onSizeClass(() => this.layout());
    // parallax: card art layers drift with the pointer (desktop) or the device tilt (phones)
    const setPar = (x: number, y: number): void => {
      this.el.style.setProperty('--px', x.toFixed(3));
      this.el.style.setProperty('--py', y.toFixed(3));
    };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.el.classList.contains('hidden')) return;
      setPar((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
    }, { passive: true });
    window.addEventListener('deviceorientation', (e) => {
      if (this.el.classList.contains('hidden') || e.gamma === null || e.beta === null) return;
      setPar(Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 25)));
    }, { passive: true });
  }

  /** narrow screens scroll the carousel sideways; wide ones stack the cards */
  private layout(): void {
    const x = window.innerWidth < 900 || window.innerHeight < 500;
    this.el.classList.toggle('carousel-x', x);
    const on = this.nav.querySelector('.tab.on') as HTMLElement | null;
    if (on) this.moveBubble(on, true);
  }

  private openMore(): void {
    const homeTab = this.nav.querySelector('.tab') as HTMLElement;
    this.more.show('More', () => this.moveBubble(homeTab));
  }

  private moveBubble(b: HTMLElement, instant = false): void {
    if (!b.offsetWidth) return;
    this.navBubble.classList.toggle('instant', instant);
    this.navBubble.style.width = `${b.offsetWidth}px`;
    this.navBubble.style.height = `${b.offsetHeight}px`;
    this.navBubble.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  }

  /** move the carousel by one card (arrow keys, buttons) */
  step(d: number): void {
    this.setFocus(Math.max(0, Math.min(this.cards.length - 1, this.focusIdx + d)), true);
  }

  /** activate the focused card (Enter on Home) */
  activate(): void {
    this.cards[this.focusIdx]?.el.click();
  }

  get focused(): Card['id'] {
    return this.cards[this.focusIdx]?.id ?? 'beach';
  }

  private setFocus(i: number, scroll: boolean): void {
    if (i < 0) return;
    const changed = i !== this.focusIdx;
    this.focusIdx = i;
    this.cards.forEach((c, k) => c.el.classList.toggle('focus', k === i));
    [...this.dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    this.el.dataset.focus = this.cards[i]?.id ?? 'beach';
    if (scroll && this.el.classList.contains('carousel-x')) {
      const c = this.cards[i]!.el;
      this.track.scrollTo({ left: c.offsetLeft - (this.track.clientWidth - c.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    if (changed) this.h.focus?.(i);
  }

  set(d: HomeData): void {
    this.data = d;
    const p = this.profile;
    (p.querySelector('.pf-tier b') as HTMLElement).textContent = String(d.tier);
    const frac = d.tier >= d.maxTier ? 1 : d.tierInto / Math.max(1, d.tierNeed);
    (p.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    (p.querySelector('.pf-ring') as HTMLElement).style.setProperty('--p', String(frac));
    // the tier number is on the avatar badge; the row shows XP into the next tier
    (p.querySelector('.txt') as HTMLElement).textContent = d.tier >= d.maxTier ? 'Complete!' : `${fmt(d.tierInto)}/${fmt(d.tierNeed)}`;
    p.setAttribute('aria-label', `${d.title ?? 'Sunny Pass'}: tier ${d.tier}, ${fmt(d.tierInto)} of ${fmt(d.tierNeed)} XP. Open the Sunny Pass`);
    (p.querySelector('.pf-title') as HTMLElement).textContent = d.title ?? 'Sunny Pass';
    const img = p.querySelector('.pf-img') as HTMLElement;
    if (d.avatar && !img.querySelector(`img[src="${d.avatar}"]`)) img.innerHTML = `<img alt="" src="${d.avatar}">`;
    this.passDot.classList.toggle('hidden', d.passClaimable <= 0);
    this.wallet.set(d.shells, d.pearls);
    this.wardrobeDot.classList.toggle('hidden', !d.wardrobeBadge);
    this.boost.classList.toggle('hidden', d.boosts <= 0);
    this.boost.classList.toggle('on', d.boostOn);
    this.boost.setAttribute('aria-pressed', String(d.boostOn));
    this.boost.setAttribute('aria-label', `Golden Shell: double shells next run (${d.boosts} left)`);
    this.boost.innerHTML = `${BOOST_SVG}<span>${d.boostOn ? '2× on' : '2× shells'}</span><b>${d.boosts}</b>`;
    this.passNext.classList.toggle('hidden', !d.nextReward || d.passClaimable > 0);
    this.passNext.textContent = d.passClaimable > 0 ? '' : (d.nextReward ?? '');

    for (const c of this.cards) {
      c.badge.classList.add('hidden');
      c.el.classList.remove('ready', 'soon');
      if (c.id === 'beach') c.sub.innerHTML = `Beach Run${d.best > 0 ? ` · Best <b>${fmt(d.best)} m</b>` : ' · Endless'}`;
      else if (c.id === 'islands') {
        c.el.classList.toggle('soon', !d.islands);
        c.sub.innerHTML = d.islands ? `<span class="mstar">${ICON.star}</span>${d.islands.stars}/${d.islands.total} stars` : 'Coming soon';
      } else if (c.id === 'daily') {
        if (d.daily) {
          this.dailyMs = d.daily.msLeft;
          c.sub.innerHTML = d.daily.playedToday ? `New tide in <span class="cd">${countdown(this.dailyMs)}</span>` : `Today: ${d.daily.modifier}`;
          c.badge.classList.toggle('hidden', d.daily.streak <= 0);
          c.badge.innerHTML = `${ICON.flame}${d.daily.streak}`;
          c.el.classList.toggle('ready', !d.daily.playedToday);
        } else c.sub.textContent = 'Coming soon';
      } else if (c.id === 'cup') {
        const cu = d.cup;
        c.sub.innerHTML = cu ? (cu.current ? `${cu.current} in progress` : cu.cleared >= cu.total ? `All cups cleared · ${cu.wins} wins` : `${cu.cleared}/${cu.total} cups · race 3 rivals`) : 'Race 3 rivals';
        c.badge.classList.toggle('hidden', !cu?.current);
        c.badge.innerHTML = '!';
        c.el.classList.toggle('ready', !!cu?.current);
      } else if (c.id === 'dig') {
        this.digDot?.classList.toggle('hidden', !d.dig || d.dig.spades < 3);
        const dg = d.dig;
        c.sub.innerHTML = dg ? `Site ${dg.site} · ${dg.relics}/${dg.total} relics` : 'Dig up buried treasure';
        c.badge.classList.toggle('hidden', !dg || dg.spades <= 0);
        c.badge.innerHTML = dg ? `${DIG_ICON}${dg.spades}` : '';
        c.el.classList.toggle('ready', !!dg && dg.spades >= 3);
      }
    }

    // goals
    const done = d.goals.filter((g) => g.done).length;
    this.goalsChip.innerHTML = `<span class="gi">${ICON.trophy}</span><span class="gl">Goals</span> <b>${done}/${d.goals.length}</b>`;
    this.goalsChip.setAttribute('aria-label', `Goals: ${done} of ${d.goals.length} done`);
    this.goalsChip.classList.toggle('hidden', d.goals.length === 0);
    this.goalsEl.innerHTML = '';
    for (const g of d.goals) {
      const r = el('div', `hgoal${g.done ? ' done' : ''}`);
      r.innerHTML = `<span class="chk">${g.done ? ICON.check : ''}</span><span class="txt">${g.text}<span class="bar"><i style="width:${Math.round(Math.min(1, g.progress) * 100)}%"></i></span></span><span class="rw">${ICON.shell}${g.reward}</span>`;
      r.title = g.value;
      this.goalsEl.appendChild(r);
    }
  }

  show(): void {
    this.el.classList.remove('hidden', 'leaving');
    this.layout();
    // replay the entrance animation
    this.el.classList.remove('enter');
    void this.el.offsetWidth;
    this.el.classList.add('enter');
    this.setFocus(this.focusIdx, true);
    (this.cards[this.focusIdx]?.el as HTMLElement | undefined)?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const on = this.nav.querySelector('.tab.on') as HTMLElement | null;
      if (on) this.moveBubble(on, true);
    });
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.el.classList.remove('goals-open');
    if (this.more.open) this.more.close();
    if (this.goalsSheet.open) this.goalsSheet.close();
    clearInterval(this.timer);
  }

  /** the boot cinematic hides the chrome until the crab has popped out of the sand */
  setCinematic(on: boolean): void {
    // finished entrance animations hold their end state, which would override the hiding
    if (on) this.el.classList.remove('enter');
    this.el.classList.toggle('cine', on);
    if (!on) {
      this.el.classList.remove('enter');
      void this.el.offsetWidth;
      this.el.classList.add('enter');
    }
  }

  private tick(): void {
    if (!this.data?.daily?.playedToday) return;
    this.dailyMs -= 1000;
    const cd = this.el.querySelector('.mode-card.daily .cd');
    if (cd) cd.textContent = countdown(this.dailyMs);
  }
}

/** letters as spans so each can drop in on its own */
function split(word: string): string {
  return [...word].map((ch, i) => `<span class="ch" style="--i:${i}">${ch}</span>`).join('');
}

const MORE_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="10" cy="20" r="4" fill="#fff"/><circle cx="20" cy="20" r="4" fill="#fff"/><circle cx="30" cy="20" r="4" fill="#fff"/></svg>`;
export const PEARL = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="21" r="14" fill="#e8dcfa" stroke="#8a72c0" stroke-width="2"/><circle cx="23" cy="24" r="9" fill="#d4c2f4"/><circle cx="15" cy="15" r="4.5" fill="#fff"/></svg>`;
