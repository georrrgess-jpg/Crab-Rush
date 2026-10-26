import { btn, el, fmt } from './dom';
import { HAT_SVG, ICON } from './icons';
import type { GoalView } from './ui';

/** Everything the Home screen shows (UPDATE2_PLAN.md §4.3 Home). */
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
  /** Island Hop progress; null until the mode ships */
  islands: { stars: number; total: number } | null;
  /** Daily Tide; null until the mode ships */
  daily: { streak: number; playedToday: boolean; modifier: string; msLeft: number } | null;
  keyboard: boolean;
}

export interface HomeHandlers {
  play(): void;
  islands(): void;
  daily(): void;
  wardrobe(): void;
  pass(): void;
  settings(): void;
  howto(): void;
  stats(): void;
  /** tap on the crab area: emote */
  poke(): void;
}

const pad = (n: number): string => String(n).padStart(2, '0');
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Home: animated logo, Sunny Pass bar and wallet up top, a big Play card for Beach Run with Island
 * Hop and Daily Tide cards beside it, the goals, and a bottom nav. The 3D diorama shows through.
 */
export class HomeScreen {
  readonly el: HTMLElement;
  private passTier: HTMLElement;
  private passFill: HTMLElement;
  private passText: HTMLElement;
  private passDot: HTMLElement;
  private wallet: HTMLElement;
  private playSub: HTMLElement;
  private playLabel: HTMLElement;
  private islandCard: HTMLButtonElement;
  private dailyCard: HTMLButtonElement;
  private goalsEl: HTMLElement;
  private goalsChip: HTMLButtonElement;
  private wardrobeDot: HTMLElement;
  private dailyMs = 0;
  private data: HomeData | null = null;
  private timer = 0;

  constructor(private h: HomeHandlers) {
    this.el = el('div', 'screen home hidden');
    this.el.id = 'home';

    // ---- top bar: pass + wallet
    const top = el('div', 'home-top');
    const pass = el('button', 'pass-pill') as HTMLButtonElement;
    pass.type = 'button';
    pass.setAttribute('aria-label', 'Sunny Pass');
    pass.innerHTML = `<span class="tier"><span class="sunico">${ICON.sun}</span><b>0</b></span><span class="col"><span class="lbl">Sunny Pass</span><span class="bar"><i></i></span></span><span class="txt"></span><i class="dot hidden"></i>`;
    pass.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.pass();
    });
    this.passTier = pass.querySelector('.tier b') as HTMLElement;
    this.passFill = pass.querySelector('.bar i') as HTMLElement;
    this.passText = pass.querySelector('.txt') as HTMLElement;
    this.passDot = pass.querySelector('.dot') as HTMLElement;
    this.wallet = el('div', 'wallet', `<span class="ico">${ICON.shell}</span><b>0</b>`);
    const help = btn(ICON.help, 'icon ghost', () => this.h.howto(), 'How to play');
    const right = el('div', 'home-top-r');
    right.append(this.wallet, help);
    top.append(pass, right);

    // ---- logo
    const brand = el('div', 'home-brand');
    brand.innerHTML = `<h1 class="logo intro" aria-label="Crab Dash"><span class="w w1" data-t="Crab">${HAT_SVG}Crab</span><span class="gap-shell">${ICON.shell}</span><span class="w w2" data-t="Dash">Dash</span></h1><div class="home-tag"><span class="tagline">Sunny Season</span></div>`;
    this.goalsChip = el('button', 'goals-chip') as HTMLButtonElement;
    this.goalsChip.type = 'button';
    this.goalsChip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.el.classList.toggle('goals-open');
    });
    this.goalsEl = el('div', 'home-goals');

    // ---- the crab stage: taps make the crab emote
    const stage = el('div', 'home-stage');
    stage.setAttribute('aria-hidden', 'true');
    stage.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.poke();
    });

    // ---- play + mode cards
    const modes = el('div', 'home-modes');
    const play = el('button', 'play-card') as HTMLButtonElement;
    play.type = 'button';
    play.innerHTML = `<span class="pc-ico">${ICON.play}</span><span class="pc-col"><span class="pc-label">Play</span><span class="pc-sub"></span></span><span class="shine"></span>`;
    play.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.play();
    });
    this.playLabel = play.querySelector('.pc-label') as HTMLElement;
    this.playSub = play.querySelector('.pc-sub') as HTMLElement;
    const mk = (cls: string, icon: string, title: string, on: () => void): HTMLButtonElement => {
      const c = el('button', `mode-card ${cls}`) as HTMLButtonElement;
      c.type = 'button';
      c.innerHTML = `<span class="mc-ico">${icon}</span><span class="mc-col"><span class="mc-title">${title}</span><span class="mc-sub"></span></span><span class="mc-badge hidden"></span>`;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        on();
      });
      return c;
    };
    this.islandCard = mk('islands', ICON.island, 'Island Hop', () => this.h.islands());
    this.dailyCard = mk('daily', ICON.calendar, 'Daily Tide', () => this.h.daily());
    const row = el('div', 'mode-row');
    row.append(this.islandCard, this.dailyCard);
    modes.append(play, row);

    // ---- bottom nav
    const nav = el('nav', 'home-nav');
    nav.setAttribute('aria-label', 'Main');
    const tab = (icon: string, label: string, on: () => void, current = false): HTMLButtonElement => {
      const b = el('button', `tab${current ? ' on' : ''}`, `<span class="ti">${icon}</span><span class="tl">${label}</span>`) as HTMLButtonElement;
      b.type = 'button';
      if (current) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        on();
      });
      return b;
    };
    const wardrobe = tab(`${ICON.hanger}<i class="dot hidden"></i>`, 'Wardrobe', () => this.h.wardrobe());
    this.wardrobeDot = wardrobe.querySelector('.dot') as HTMLElement;
    nav.append(tab(ICON.home, 'Home', () => {}, true), wardrobe, tab(ICON.sun, 'Pass', () => this.h.pass()), tab(ICON.chart, 'Stats', () => this.h.stats()), tab(ICON.gear, 'Settings', () => this.h.settings()));

    const left = el('div', 'home-left');
    left.append(brand, this.goalsChip, this.goalsEl);
    this.el.append(top, left, stage, modes, nav);
  }

  set(d: HomeData): void {
    this.data = d;
    this.passTier.textContent = String(d.tier);
    const frac = d.tier >= d.maxTier ? 1 : d.tierInto / Math.max(1, d.tierNeed);
    this.passFill.style.width = `${Math.round(frac * 100)}%`;
    this.passText.textContent = d.tier >= d.maxTier ? 'Max!' : `${fmt(d.tierInto)}/${fmt(d.tierNeed)}`;
    this.passDot.classList.toggle('hidden', d.passClaimable <= 0);
    (this.wallet.querySelector('b') as HTMLElement).textContent = fmt(d.shells);
    this.playLabel.textContent = d.keyboard ? 'Play' : 'Play';
    this.playSub.innerHTML = `Beach Run${d.best > 0 ? ` · Best <b>${fmt(d.best)} m</b>` : ''}`;
    this.wardrobeDot.classList.toggle('hidden', !d.wardrobeBadge);
    // Island Hop card
    const isub = this.islandCard.querySelector('.mc-sub') as HTMLElement;
    this.islandCard.classList.toggle('soon', !d.islands);
    isub.innerHTML = d.islands ? `<span class="mstar">${ICON.star}</span>${d.islands.stars}/${d.islands.total}` : 'Coming soon';
    // Daily Tide card
    const dsub = this.dailyCard.querySelector('.mc-sub') as HTMLElement;
    const badge = this.dailyCard.querySelector('.mc-badge') as HTMLElement;
    this.dailyCard.classList.toggle('soon', !d.daily);
    if (d.daily) {
      this.dailyMs = d.daily.msLeft;
      dsub.innerHTML = d.daily.playedToday ? `New tide in <span class="cd">${countdown(this.dailyMs)}</span>` : d.daily.modifier;
      badge.classList.toggle('hidden', d.daily.streak <= 0);
      badge.innerHTML = `${ICON.flame}${d.daily.streak}`;
      this.dailyCard.classList.toggle('ready', !d.daily.playedToday);
    } else {
      dsub.textContent = 'Coming soon';
      badge.classList.add('hidden');
    }
    // goals
    const done = d.goals.filter((g) => g.done).length;
    this.goalsChip.innerHTML = `<span class="gi">${ICON.trophy}</span>Goals <b>${done}/${d.goals.length}</b>`;
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
    // replay the entrance animation
    this.el.classList.remove('enter');
    void this.el.offsetWidth;
    this.el.classList.add('enter');
    (this.el.querySelector('.play-card') as HTMLElement | null)?.focus({ preventScroll: true });
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.el.classList.remove('goals-open');
    clearInterval(this.timer);
  }

  private tick(): void {
    if (!this.data?.daily?.playedToday) return;
    this.dailyMs -= 1000;
    const cd = this.dailyCard.querySelector('.cd');
    if (cd) cd.textContent = countdown(this.dailyMs);
  }
}
