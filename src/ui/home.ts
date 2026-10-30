import { btn, el, fmt } from './dom';
import { BOOST_SVG, ICON } from './icons';
import type { GoalView } from './ui';
import { Sheet, Wallet, onSizeClass } from './kit';
import { morphFrom } from './motion';
import { DIG_ICON } from './dig';

/** Everything the Home screen shows. */
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
  pearls?: number;
  /** Crab Cup: cups cleared, the cup in progress */
  cup?: { cleared: number; total: number; current: string | null; wins: number } | null;
  /** Treasure Dig: spades in hand, relics found, current site */
  dig?: { spades: number; relics: number; total: number; site: number } | null;
}

export interface HomeHandlers {
  play(): void;
  islands(): void;
  daily(): void;
  cup?(): void;
  dig?(): void;
  trophies?(): void;
  wardrobe(): void;
  pass(): void;
  settings(): void;
  howto(): void;
  stats(): void;
  /** tap on the crab area: emote */
  poke(): void;
  toggleBoost(): void;
  /** card focus changed (sound / camera) */
  focus?(i: number): void;
}

const pad = (n: number): string => String(n).padStart(2, '0');
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Inline illustrations for the hero card and the mode rows (no assets). */
const HERO_ART = `<svg class="h6-hero-art" viewBox="0 0 300 200" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><defs><linearGradient id="h6s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe9ff"/><stop offset="1" stop-color="#fff6e0"/></linearGradient><linearGradient id="h6w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fd0f0"/><stop offset="1" stop-color="#1b8fd6"/></linearGradient></defs><rect width="300" height="200" fill="url(#h6s)"/><g class="h6-cloud" fill="#fff"><ellipse cx="70" cy="40" rx="30" ry="10"/><ellipse cx="88" cy="34" rx="18" ry="10"/></g><path d="M150 132l40-58 22 10 30-36 30 40 28 4v40z" fill="#4a5568"/><path d="M190 74l22 10 30-36 8 10-28 32-22-8z" fill="#5f6b7d"/><path d="M196 92c10-10 26-12 30-6-10 0-22 4-30 10z" fill="#3a9a52"/><g class="h6-house"><rect x="236" y="34" width="12" height="28" fill="#fff"/><rect x="236" y="42" width="12" height="5" fill="#e8432a"/><rect x="236" y="54" width="12" height="5" fill="#e8432a"/><path d="M233 34h18l-9-9z" fill="#e8432a"/></g><path d="M0 140h300v60H0z" fill="url(#h6w)"/><path d="M0 146q20-6 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0" stroke="#fff" stroke-width="2.5" fill="none" opacity=".6"/><g class="h6-boat"><path d="M232 150h34l-6 8h-22z" fill="#fff"/><path d="M249 150v-34l14 30z" fill="#fff"/><path d="M247 150v-26l-12 24z" fill="#cfe9ff"/></g><path d="M0 170c60-14 140-12 190 4 30 10 70 12 110 6v20H0z" fill="#f6dda6"/><g class="h6-palm"><path d="M44 178c4-24 12-44 24-58" stroke="#8a5a2a" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M68 120c-14-10-30-8-38 0 12-2 24 0 38 6zm0 0c-2-16 8-26 20-28-6 8-10 18-14 30zm0 0c16-6 30-2 36 8-12-4-24-4-36 0zm0 0c-16 4-24 16-24 28 6-10 14-18 26-22z" fill="#3fae4f"/></g></svg>`;
const ROW_ART: Record<'cup' | 'islands' | 'daily', string> = {
  cup: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8h28v16a14 14 0 0 1-28 0z" fill="#ffc93a" stroke="#c4840a" stroke-width="2.5"/><path d="M18 13H9c0 10 5 15 12 15M46 13h9c0 10-5 15-12 15" stroke="#ffc93a" stroke-width="5" fill="none"/><rect x="28" y="36" width="8" height="10" fill="#e9a820"/><rect x="18" y="46" width="28" height="9" rx="3" fill="#ffc93a" stroke="#c4840a" stroke-width="2.5"/><path d="M32 14l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#fff" opacity=".85"/></svg>`,
  islands: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="50" rx="26" ry="8" fill="#2fb8e8"/><ellipse cx="32" cy="46" rx="20" ry="7" fill="#f6dda6"/><path d="M30 46c1-12 4-22 8-30" stroke="#8a5a2a" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M38 16c-8-6-18-4-22 2 8-2 14 0 22 4zm0 0c0-9 6-14 14-14-5 4-8 9-10 16zm0 0c9-2 17 2 20 8-7-3-14-3-20-1z" fill="#3fae4f"/></svg>`,
  daily: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 30c8-10 16-10 24 1 8-11 16-11 24-1-8-2-14 0-24 11C22 30 16 28 8 30z" fill="#fff" stroke="#14254f" stroke-width="2.5" stroke-linejoin="round"/><path d="M29 36l3 5 3-5" fill="#ffb020"/><circle cx="27" cy="31" r="1.6" fill="#14254f"/><path d="M14 52c6-3 12-3 18 0s12 3 18 0" stroke="#2fb8e8" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
};
const LEAVES = `<svg class="h6-leaves" viewBox="0 0 240 120" aria-hidden="true"><path d="M30 92c-10-30 6-60 40-70-22 16-30 40-26 68zM210 92c10-30-6-60-40-70 22 16 30 40 26 68z" fill="#3fae4f"/><path d="M20 70c-2-24 16-44 42-48-18 10-30 26-30 50zM220 70c2-24-16-44-42-48 18 10 30 26 30 50z" fill="#2f9a42"/></svg>`;
const CROWN = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 30l3-18 8 9 3-12 3 12 8-9 3 18z" fill="#ffc93a" stroke="#c4840a" stroke-width="2" stroke-linejoin="round"/><rect x="6" y="30" width="28" height="5" rx="2" fill="#ffb020"/></svg>`;
const CLIPBOARD = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="6" width="24" height="30" rx="4" fill="#ffe0a8" stroke="#c4840a" stroke-width="2"/><rect x="14" y="3" width="12" height="7" rx="2" fill="#ffb020"/><path d="M13 17h14M13 23h14M13 29h9" stroke="#c4840a" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M16 10l10 10-10 10" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GEAR = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 4h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" fill="#14254f"/><circle cx="20" cy="20" r="6" fill="#fffaf2"/></svg>`;
/** goal icons by wording */
const GOAL_ICO = {
  run: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="24" cy="7" r="4" fill="#14254f"/><path d="M22 13l-6 8 6 4-3 10M16 21l-7 2M22 13l6 6 6-1M22 25l7 5" stroke="#14254f" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  hop: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 34h28" stroke="#e9c37e" stroke-width="4" stroke-linecap="round"/><path d="M8 28c4-14 20-14 24 0" stroke="#14254f" stroke-width="3.5" fill="none" stroke-dasharray="4 4"/><path d="M28 18l4 9-9-2" fill="#ff8414"/></svg>`,
  wave: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 30c3-14 12-22 22-22 6 0 10 4 12 8-4-4-10-4-12 2 4-1 8 1 8 5-4-4-10-2-12 3-3 5-10 6-18 4z" fill="#2fb8e8"/></svg>`,
};
function goalIcon(text: string): string {
  const t = text.toLowerCase();
  if (/shell/.test(t)) return ICON.shell;
  if (/wave/.test(t)) return GOAL_ICO.wave;
  if (/hop/.test(t)) return GOAL_ICO.hop;
  if (/run|reach/.test(t)) return GOAL_ICO.run;
  return ICON.star;
}

interface Card {
  id: 'beach' | 'cup' | 'islands' | 'daily';
  el: HTMLButtonElement;
  sub: HTMLElement | null;
  badge: HTMLElement | null;
}

/**
 * Home (UPDATE6_PLAN.md §2): a profile card, wallet and settings on top; the logo and Beach Goals on
 * the left; the crab in the middle with a Customize pill; the Beach Run hero card and the mode rows
 * on the right; the nav at the bottom. Phones stack it: crab, hero, then a row of mode tiles.
 */
export class HomeScreen {
  readonly el: HTMLElement;
  private profile: HTMLButtonElement;
  private wallet: Wallet;
  private more: Sheet;
  private goalsSheet = new Sheet('home-goals-sheet');
  private goalsSheetList = el('div', 'sheet-goals h6-goal-list');
  private goalsList: HTMLElement;
  private goalsChip: HTMLButtonElement;
  private wardrobeDot: HTMLElement;
  private passDot: HTMLElement;
  private boost: HTMLButtonElement;
  private best: HTMLElement;
  private cards: Card[] = [];
  private digDot: HTMLElement | null = null;
  private navBubble: HTMLElement;
  private nav: HTMLElement;
  private focusIdx = 0;
  private dailyMs = 0;
  private data: HomeData | null = null;
  private timer = 0;

  constructor(private h: HomeHandlers) {
    this.el = el('div', 'screen h6 hidden');
    this.el.id = 'home';

    // ---- top: profile card · wallet + settings
    const top = el('div', 'h6-top');
    this.profile = el('button', 'h6-profile') as HTMLButtonElement;
    this.profile.type = 'button';
    this.profile.innerHTML = `<span class="h6-ava"><span class="h6-img">${ICON.crab}</span><b class="h6-lvl">0</b></span><span class="h6-pcol"><span class="h6-name">Beach Rookie</span><span class="h6-prow"><span class="h6-level">Level 0</span><span class="bar"><i></i></span><span class="h6-xp"></span></span></span><i class="dot hidden"></i>`;
    this.profile.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.pass();
    });
    this.passDot = this.profile.querySelector('.dot') as HTMLElement;
    this.wallet = new Wallet('home-wallet');
    const gear = btn(GEAR, 'icon h6-gear', () => this.h.settings(), 'Settings');
    const right = el('div', 'h6-topr');
    right.append(this.wallet.el, gear);
    top.append(this.profile, right);

    // ---- left: logo and Beach Goals
    const left = el('div', 'h6-left');
    const brand = el('div', 'h6-brand home-brand');
    brand.innerHTML = `${LEAVES}<h1 class="logo intro" aria-label="Crab Rush"><span class="w w1" data-t="Crab">${split('Crab')}</span><span class="gap-shell">${ICON.shell}</span><span class="w w2" data-t="Rush">${split('Rush')}</span></h1>`;
    const goals = el('div', 'h6-goals h6-card');
    const gh = el('button', 'h6-goals-head') as HTMLButtonElement;
    gh.type = 'button';
    gh.innerHTML = `<span class="h6-gi">${CLIPBOARD}</span><span class="h6-gt">Beach Goals</span><span class="h6-chev">${CHEVRON}</span>`;
    gh.setAttribute('aria-label', 'Show all goals');
    gh.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openGoals();
    });
    this.goalsList = el('div', 'h6-goal-list');
    goals.append(gh, this.goalsList);
    // phones: goals open from a chip
    this.goalsChip = el('button', 'goals-chip h6-goals-chip') as HTMLButtonElement;
    this.goalsChip.type = 'button';
    this.goalsChip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openGoals();
    });
    left.append(brand, goals);

    // ---- centre: the crab (tap to emote) and Customize
    const stage = el('div', 'h6-stage home-stage');
    stage.setAttribute('aria-hidden', 'true');
    stage.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.poke();
    });
    const custom = btn(`${ICON.hanger}<span>Customize</span>`, 'teal h6-customize', () => this.h.wardrobe(), 'Customize your crab');
    const centre = el('div', 'h6-centre');
    centre.append(stage, this.goalsChip, custom);

    // ---- right: the Beach Run hero card and the mode rows
    const modes = el('div', 'h6-modes');
    const hero = el('div', 'h6-hero h6-card');
    hero.innerHTML = `${HERO_ART}<div class="h6-hero-col"><h2 class="h6-hero-title">Beach Run</h2><span class="h6-hero-sub">Endless adventure</span><span class="h6-best"></span></div>`;
    this.best = hero.querySelector('.h6-best') as HTMLElement;
    const start = el('button', 'h6-start play-card mode-card beach') as HTMLButtonElement;
    start.type = 'button';
    start.dataset.mode = 'beach';
    start.innerHTML = `<span class="h6-play">${ICON.play}</span><span class="h6-start-l">Start Beach Run</span>`;
    start.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.play();
    });
    start.addEventListener('focus', () => this.setFocus(0, false));
    this.boost = el('button', 'boost-chip hidden') as HTMLButtonElement;
    this.boost.type = 'button';
    this.boost.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.toggleBoost();
    });
    hero.append(start, this.boost);
    this.cards.push({ id: 'beach', el: start, sub: null, badge: null });
    const rows = el('div', 'h6-rows');
    rows.setAttribute('role', 'list');
    const row = (id: 'cup' | 'islands' | 'daily', title: string, on: () => void): void => {
      const r = el('button', `h6-row mode-card ${id}`) as HTMLButtonElement;
      r.type = 'button';
      r.dataset.mode = id;
      r.setAttribute('role', 'listitem');
      r.innerHTML = `<span class="h6-ri">${ROW_ART[id]}</span><span class="h6-rcol"><span class="h6-rt">${title}</span><span class="h6-rs"></span></span><span class="h6-chev">${CHEVRON}</span><span class="mc-badge hidden"></span>`;
      r.addEventListener('click', (e) => {
        e.stopPropagation();
        morphFrom(r);
        on();
      });
      const idx = this.cards.length;
      r.addEventListener('focus', () => this.setFocus(idx, false));
      rows.appendChild(r);
      this.cards.push({ id, el: r, sub: r.querySelector('.h6-rs'), badge: r.querySelector('.mc-badge') });
    };
    if (this.h.cup) row('cup', 'Crab Cup', () => this.h.cup?.());
    row('islands', 'Island Hop', () => this.h.islands());
    row('daily', 'Daily Tide', () => this.h.daily());
    modes.append(hero, rows);

    // ---- bottom nav with a sliding bubble
    this.nav = el('nav', 'home-nav h6-nav');
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
    // Trophies, Stats, Settings and How to play share the More sheet
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
    this.goalsSheet.body.appendChild(this.goalsSheetList);

    this.el.append(top, left, centre, modes, this.nav, this.more.el, this.goalsSheet.el);
    window.addEventListener('resize', () => this.layout());
    onSizeClass(() => this.layout());
    // parallax: the hero art drifts with the pointer (desktop) or the device tilt (phones)
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

  private layout(): void {
    const on = this.nav.querySelector('.tab.on') as HTMLElement | null;
    if (on) this.moveBubble(on, true);
  }

  private openGoals(): void {
    this.goalsSheetList.innerHTML = this.goalsList.innerHTML;
    this.goalsSheet.show('Beach Goals');
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

  /** move focus by one card (arrow keys) */
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

  private setFocus(i: number, move: boolean): void {
    if (i < 0) return;
    const changed = i !== this.focusIdx;
    this.focusIdx = i;
    this.cards.forEach((c, k) => c.el.classList.toggle('focus', k === i));
    this.el.dataset.focus = this.cards[i]?.id ?? 'beach';
    if (move) this.cards[i]?.el.focus({ preventScroll: true });
    if (changed) this.h.focus?.(i);
  }

  set(d: HomeData): void {
    this.data = d;
    const p = this.profile;
    (p.querySelector('.h6-lvl') as HTMLElement).textContent = String(d.tier);
    (p.querySelector('.h6-level') as HTMLElement).textContent = `Level ${d.tier}`;
    const frac = d.tier >= d.maxTier ? 1 : d.tierInto / Math.max(1, d.tierNeed);
    (p.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    (p.querySelector('.h6-xp') as HTMLElement).textContent = d.tier >= d.maxTier ? 'Max level' : `${fmt(d.tierInto)} / ${fmt(d.tierNeed)} XP`;
    p.setAttribute('aria-label', `${d.title ?? 'Profile'}: level ${d.tier}, ${fmt(d.tierInto)} of ${fmt(d.tierNeed)} XP. Open the Sunny Pass`);
    (p.querySelector('.h6-name') as HTMLElement).textContent = d.title ?? 'Beach Rookie';
    const img = p.querySelector('.h6-img') as HTMLElement;
    if (d.avatar && !img.querySelector(`img[src="${d.avatar}"]`)) img.innerHTML = `<img alt="" src="${d.avatar}">`;
    this.passDot.classList.toggle('hidden', d.passClaimable <= 0);
    this.wallet.set(d.shells, d.pearls);
    this.wardrobeDot.classList.toggle('hidden', !d.wardrobeBadge);
    this.digDot?.classList.toggle('hidden', !d.dig || d.dig.spades < 3);
    // hero: personal best and the Golden Shell toggle
    this.best.innerHTML = d.best > 0 ? `${CROWN}<span>Personal Best</span><b>${fmt(Math.floor(d.best))} m</b>` : `${CROWN}<span>Set your first record!</span>`;
    this.boost.classList.toggle('hidden', d.boosts <= 0);
    this.boost.classList.toggle('on', d.boostOn);
    this.boost.setAttribute('aria-pressed', String(d.boostOn));
    this.boost.setAttribute('aria-label', `Golden Shell: double shells next run (${d.boosts} left)`);
    this.boost.innerHTML = `${BOOST_SVG}<span>${d.boostOn ? '2× on' : '2× shells'}</span><b>${d.boosts}</b>`;

    for (const c of this.cards) {
      if (!c.sub || !c.badge) continue;
      c.badge.classList.add('hidden');
      c.el.classList.remove('ready');
      if (c.id === 'islands') {
        c.sub.innerHTML = d.islands ? `<b>${d.islands.stars} / ${d.islands.total} stars</b><small>Explore islands</small>` : '<small>Coming soon</small>';
      } else if (c.id === 'daily') {
        if (d.daily) {
          this.dailyMs = d.daily.msLeft;
          c.sub.innerHTML = d.daily.playedToday ? `<b>${d.daily.modifier}</b><small>New tide in <span class="cd">${countdown(this.dailyMs)}</span></small>` : `<b>${d.daily.modifier}</b><small>Special challenge today</small>`;
          c.badge.classList.toggle('hidden', d.daily.streak <= 0);
          c.badge.innerHTML = `${ICON.flame}${d.daily.streak}`;
          c.el.classList.toggle('ready', !d.daily.playedToday);
        }
      } else if (c.id === 'cup') {
        const cu = d.cup;
        c.sub.innerHTML = cu ? (cu.current ? `<b>${cu.current}</b><small>Race in progress</small>` : `<b>${cu.cleared} / ${cu.total} cups</b><small>${cu.cleared >= cu.total ? `${cu.wins} wins` : 'Race 3 rivals'}</small>`) : '<small>Race 3 rivals</small>';
        c.badge.classList.toggle('hidden', !cu?.current);
        c.badge.innerHTML = '!';
        c.el.classList.toggle('ready', !!cu?.current);
      }
    }

    // goals: the card on wide screens, a chip (and a sheet) on phones
    const done = d.goals.filter((g) => g.done).length;
    this.goalsChip.innerHTML = `<span class="gi">${CLIPBOARD}</span><span class="gl">Goals</span> <b>${done}/${d.goals.length}</b>`;
    this.goalsChip.setAttribute('aria-label', `Goals: ${done} of ${d.goals.length} done`);
    this.goalsChip.classList.toggle('hidden', d.goals.length === 0);
    this.goalsList.innerHTML = '';
    for (const g of d.goals) {
      const r = el('div', `h6-goal${g.done ? ' done' : ''}`);
      r.innerHTML = `<span class="h6-goi">${g.done ? ICON.check : goalIcon(g.text)}</span><span class="h6-gcol"><span class="h6-gtxt">${g.text}</span><span class="h6-grow"><span class="bar"><i style="width:${Math.round(Math.min(1, g.progress) * 100)}%"></i></span><small>${g.value}</small></span></span><span class="h6-grw">${ICON.shell}<b>${g.reward}</b></span>`;
      this.goalsList.appendChild(r);
    }
  }

  show(): void {
    this.el.classList.remove('hidden', 'leaving');
    this.layout();
    // replay the entrance animation
    this.el.classList.remove('enter');
    void this.el.offsetWidth;
    this.el.classList.add('enter');
    this.setFocus(this.focusIdx, false);
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
    if (this.more.open) this.more.close();
    if (this.goalsSheet.open) this.goalsSheet.close();
    clearInterval(this.timer);
  }

  /** the boot cinematic hides the chrome until the crab has popped out of the sand */
  setCinematic(on: boolean): void {
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
