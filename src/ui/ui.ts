import { ICON, HAT_SVG } from './icons';
import { btn, el, fmt } from './dom';
import type { PowerKind } from '../sim/events';

export interface UIHandlers {
  play(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  home(): void;
  openShop(): void;
  openSettings(): void;
  openHowTo(): void;
  touch(a: 'left' | 'right'): void;
  tap(): void;
}

export interface GoalView {
  text: string;
  progress: number; // 0..1
  value: string; // e.g. "120 / 300 m"
  reward: number;
  done: boolean;
}

export interface ResultsData {
  distance: number;
  best: number;
  newBest: boolean;
  pickups: number;
  bonus: number;
  goalRewards: number;
  total: number;
  balance: number;
  goals: GoalView[];
  unlock: { name: string; have: number; need: number } | null;
  zone: string;
}

type ScreenName = 'title' | 'hud' | 'pause' | 'results' | 'none';

/** All DOM UI. Screens are built once and toggled. */
export class UI {
  private root: HTMLElement;
  private title: HTMLElement;
  private hud: HTMLElement;
  private pauseEl: HTMLElement;
  private results: HTMLElement;
  private countdown: HTMLElement;
  private tutorial: HTMLElement;
  private toasts: HTMLElement;
  private fade: HTMLElement;
  private touchL: HTMLButtonElement;
  private touchR: HTMLButtonElement;
  private shellsVal: HTMLElement;
  private shellsPill: HTMLElement;
  private distVal: HTMLElement;
  private powerRing: HTMLElement;
  private powerArc: SVGCircleElement;
  private powerIc: HTMLElement;
  private streakEl: HTMLElement;
  private titleBest: HTMLElement;
  private titleGoals: HTMLElement;
  private pauseGoals: HTMLElement;
  private lastShells = -1;
  private lastDist = -1;
  private lastPower: PowerKind | null = null;
  touchButtonsVisible = false;
  private crabsBtn!: HTMLButtonElement;
  private shopBadge = false;
  current: ScreenName = 'none';
  extraScreens: HTMLElement[] = [];

  constructor(root: HTMLElement, private h: UIHandlers) {
    this.root = root;

    // ---------------- title
    this.title = el('div', 'screen hidden');
    this.title.id = 'title';
    const top = el('div', 'top');
    top.innerHTML = `<h1 class="logo" aria-label="Crab Dash"><span class="w" data-t="Crab">${HAT_SVG}Crab</span><span class="gap-shell">${ICON.shell}</span><span class="w" data-t="Dash">Dash</span></h1><div><span class="tagline">Beach Run</span></div>`;
    this.titleBest = el('div', 'best');
    top.appendChild(this.titleBest);
    const bottom = el('div', 'bottom');
    const tap = el('button', 'tap', 'Tap to Play');
    tap.type = 'button';
    tap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.play();
    });
    this.titleGoals = el('div', 'goals-card');
    const menu = el('div', 'menu-row');
    this.crabsBtn = btn(`${ICON.crab}<span>Crabs</span><i class="dot hidden"></i>`, 'blue small', () => this.h.openShop(), 'Crabs and upgrades');
    menu.append(
      this.crabsBtn,
      btn(`${ICON.gear}`, 'blue small', () => this.h.openSettings(), 'Settings'),
      btn(`${ICON.help}`, 'blue small', () => this.h.openHowTo(), 'How to play'),
    );
    bottom.append(tap, this.titleGoals, menu);
    this.title.append(top, bottom);
    // tapping empty space on the title also starts
    this.title.addEventListener('click', (e) => {
      if (e.target === this.title || (e.target as HTMLElement).classList.contains('top')) this.h.play();
    });

    // ---------------- HUD
    this.hud = el('div', 'screen hidden');
    this.hud.id = 'hud';
    const left = el('div', 'left');
    this.shellsPill = el('div', 'pill shells', `<span class="ico">${ICON.shell}</span><b>0</b>`);
    this.shellsVal = this.shellsPill.querySelector('b') as HTMLElement;
    this.powerRing = el(
      'div',
      'power-ring hidden',
      `<svg class="ring" viewBox="0 0 54 54"><circle cx="27" cy="27" r="23" fill="#173f66" stroke="#7cc8f2" stroke-width="3"/><circle class="arc" cx="27" cy="27" r="23" fill="none" stroke="#ffd23a" stroke-width="5" stroke-linecap="round" stroke-dasharray="144.5" stroke-dashoffset="0"/></svg><span class="ic"></span>`,
    );
    this.powerArc = this.powerRing.querySelector('.arc') as SVGCircleElement;
    this.powerIc = this.powerRing.querySelector('.ic') as HTMLElement;
    this.streakEl = el('div', 'streak hidden');
    left.append(this.shellsPill, this.powerRing, this.streakEl);
    const right = el('div', 'right');
    const pauseBtn = btn(ICON.pause, 'blue pause-btn', () => this.h.pause(), 'Pause');
    const dist = el('div', 'pill dist', `<b>0</b><span class="unit">m</span><span class="ico">${ICON.flag}</span>`);
    this.distVal = dist.querySelector('b') as HTMLElement;
    right.append(pauseBtn, dist);
    this.hud.append(left, right);
    this.touchL = el('button', 'touch-btn l', ICON.left) as HTMLButtonElement;
    this.touchR = el('button', 'touch-btn r', ICON.right) as HTMLButtonElement;
    this.touchL.setAttribute('aria-label', 'Move left');
    this.touchR.setAttribute('aria-label', 'Move right');
    for (const [b, a] of [[this.touchL, 'left'], [this.touchR, 'right']] as [HTMLButtonElement, 'left' | 'right'][]) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('lit');
        this.h.touch(a);
      });
      const off = (): void => b.classList.remove('lit');
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    }
    this.hud.append(this.touchL, this.touchR);

    // ---------------- tutorial, toasts, countdown
    this.tutorial = el('div', 'screen hidden');
    this.tutorial.id = 'tutorial';
    this.toasts = el('div');
    this.toasts.id = 'toasts';
    this.countdown = el('div', 'screen hidden');
    this.countdown.id = 'countdown';

    // ---------------- pause
    this.pauseEl = el('div', 'screen hidden');
    this.pauseEl.id = 'pause';
    const pdim = el('div', 'dim');
    const pp = el('div', 'panel');
    pp.innerHTML = `<div class="panel-head">Paused</div>`;
    const pbody = el('div', 'panel-body');
    const pcol = el('div', 'btn-col');
    pcol.append(
      btn(`${ICON.play}<span>Resume</span>`, 'big', () => this.h.resume()),
      (() => {
        const row = el('div', 'btn-row');
        row.append(
          btn(`${ICON.restart}<span>Restart</span>`, 'blue small', () => this.h.restart()),
          btn(`${ICON.gear}<span>Settings</span>`, 'blue small', () => this.h.openSettings()),
          btn(`${ICON.home}<span>Home</span>`, 'blue small', () => this.h.home()),
        );
        return row;
      })(),
    );
    this.pauseGoals = el('div', 'goals-card');
    this.pauseGoals.style.margin = '14px auto 0';
    this.pauseGoals.style.width = '100%';
    pbody.append(pcol, this.pauseGoals);
    pp.append(pbody);
    this.pauseEl.append(pdim, pp);

    // ---------------- results
    this.results = el('div', 'screen hidden');
    this.results.id = 'results';

    this.fade = el('div');
    this.fade.id = 'fade';

    root.append(this.title, this.hud, this.tutorial, this.countdown, this.pauseEl, this.results, this.toasts, this.fade);
  }

  // ------------------------------------------------------------------ screens
  show(name: ScreenName): void {
    this.current = name;
    this.title.classList.toggle('hidden', name !== 'title');
    this.hud.classList.toggle('hidden', !(name === 'hud' || name === 'pause'));
    this.pauseEl.classList.toggle('hidden', name !== 'pause');
    this.results.classList.toggle('hidden', name !== 'results');
    if (name !== 'hud') this.hideTutorial();
    if (name === 'title' || name === 'results') this.clearToasts();
    for (const s of this.extraScreens) s.classList.add('hidden');
    if (name === 'pause') (this.pauseEl.querySelector('.btn') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  addScreen(node: HTMLElement): void {
    node.classList.add('hidden');
    this.extraScreens.push(node);
    this.root.insertBefore(node, this.toasts);
  }

  showExtra(node: HTMLElement): void {
    this.title.classList.add('hidden');
    this.results.classList.add('hidden');
    this.pauseEl.classList.add('hidden');
    for (const s of this.extraScreens) s.classList.toggle('hidden', s !== node);
  }

  hideExtras(): void {
    for (const s of this.extraScreens) s.classList.add('hidden');
  }

  setTitleInfo(best: number, goals: GoalView[]): void {
    this.titleBest.textContent = best > 0 ? `Best: ${fmt(best)} m` : '';
    this.renderGoals(this.titleGoals, goals, 'Goals');
    this.renderGoals(this.pauseGoals, goals, 'Goals');
  }

  /** A red dot on the Crabs buttons when something is affordable. */
  setShopBadge(on: boolean): void {
    this.shopBadge = on;
    this.crabsBtn.querySelector('.dot')?.classList.toggle('hidden', !on);
  }

  setPlayPrompt(keyboard: boolean): void {
    const t = this.title.querySelector('.tap');
    if (t) t.textContent = keyboard ? 'Press Space to Play' : 'Tap to Play';
  }

  renderGoals(node: HTMLElement, goals: GoalView[], heading: string): void {
    node.innerHTML = `<h3>${heading}</h3>`;
    node.classList.toggle('hidden', goals.length === 0);
    for (const g of goals) {
      const row = el('div', `goal${g.done ? ' done' : ''}`);
      row.innerHTML = `<span class="chk">${g.done ? ICON.check : ''}</span><div class="txt">${g.text}<div class="bar"><i style="width:${Math.round(Math.min(1, g.progress) * 100)}%"></i></div></div><span class="rw">${ICON.shell}${g.reward}</span>`;
      row.title = g.value;
      node.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ HUD
  setTouchButtons(visible: boolean): void {
    this.touchButtonsVisible = visible;
    this.touchL.classList.toggle('hidden', !visible);
    this.touchR.classList.toggle('hidden', !visible);
  }

  updateHUD(shells: number, dist: number, power: PowerKind | null, powerFrac: number, streak: number): void {
    if (shells !== this.lastShells) {
      if (this.lastShells >= 0 && shells > this.lastShells) {
        this.shellsPill.classList.remove('bump');
        void this.shellsPill.offsetWidth;
        this.shellsPill.classList.add('bump');
      }
      this.lastShells = shells;
      this.shellsVal.textContent = fmt(shells);
    }
    const d = Math.floor(dist);
    if (d !== this.lastDist) {
      this.lastDist = d;
      this.distVal.textContent = fmt(d);
    }
    if (power !== this.lastPower) {
      this.lastPower = power;
      this.powerRing.classList.toggle('hidden', !power);
      if (power) this.powerIc.innerHTML = ICON[power];
    }
    if (power) this.powerArc.style.strokeDashoffset = String(144.5 * (1 - Math.max(0, Math.min(1, powerFrac))));
    const showStreak = streak >= 10;
    this.streakEl.classList.toggle('hidden', !showStreak);
    if (showStreak) this.streakEl.textContent = `Streak ×${streak}`;
  }

  resetHUD(): void {
    this.lastShells = -1;
    this.lastDist = -1;
    this.lastPower = null;
    this.powerRing.classList.add('hidden');
    this.updateHUD(0, 0, null, 0, 0);
  }

  // ------------------------------------------------------------------ tutorial
  showTutorial(step: string, device: 'touch' | 'keyboard' | 'mouse'): void {
    const touch = device === 'touch';
    let html = '';
    switch (step) {
      case 'move':
        html = touch
          ? `<div class="row"><span class="arr">${ICON.left}</span>Swipe<span class="arr">${ICON.right}</span></div><span class="hand lr">${ICON.hand}</span><div class="sub">or tap the side you want to go</div>`
          : `<div class="row">Press ${ICON.key('◄')}${ICON.key('►')}</div><div class="sub">or A / D to change lanes</div>`;
        break;
      case 'hop':
        html = touch
          ? `<div class="row">Swipe<span class="arr">${ICON.up}</span>to hop</div><span class="hand up">${ICON.hand}</span>`
          : `<div class="row">Press ${ICON.key('▲')} or ${ICON.key('Space')}</div><div class="sub">to hop over the wave</div>`;
        break;
      case 'move2':
        html = `<div class="row">Follow the shells!</div>`;
        break;
      case 'log':
        html = `<div class="row">Hop logs to grab shells</div>`;
        break;
      case 'ball':
        html = `<div class="row">Hop or dodge!</div>`;
        break;
      case 'power':
        html = `<div class="row">Grab the power-up!</div>`;
        break;
      case 'complete':
        html = `<div class="row">Nice! You're on your own now</div>`;
        break;
      default:
        html = '';
    }
    this.tutorial.innerHTML = `<div class="bubble">${html}</div>`;
    this.tutorial.classList.remove('hidden');
  }

  hideTutorial(): void {
    this.tutorial.classList.add('hidden');
    this.tutorial.innerHTML = '';
  }

  // ------------------------------------------------------------------ toasts
  toast(text: string, opts: { sub?: string; kind?: 'gold' | 'green' | ''; big?: boolean; life?: number } = {}): void {
    const t = el('div', `toast ${opts.kind ?? ''}${opts.big ? ' big' : ''}`, `${text}${opts.sub ? `<small>${opts.sub}</small>` : ''}`);
    const life = opts.life ?? 2;
    t.style.setProperty('--life', `${life}s`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), (life + 0.4) * 1000);
  }

  floater(text: string, xFrac: number, yFrac: number): void {
    const f = el('div', 'floater', text);
    f.style.left = `${xFrac * 100}%`;
    f.style.top = `${yFrac * 100}%`;
    this.root.appendChild(f);
    setTimeout(() => f.remove(), 850);
  }

  clearToasts(): void {
    this.toasts.innerHTML = '';
  }

  // ------------------------------------------------------------------ countdown
  showCountdown(n: number): void {
    this.countdown.classList.toggle('hidden', n <= 0);
    if (n > 0) this.countdown.innerHTML = `<div class="num">${n}</div>`;
  }

  // ------------------------------------------------------------------ results
  showResults(d: ResultsData): void {
    const r = this.results;
    r.innerHTML = '';
    const dim = el('div', 'dim');
    const p = el('div', 'panel');
    const head = el('div', 'panel-head', d.newBest ? 'New Best!' : 'Wipeout!');
    const body = el('div', 'panel-body');
    const grid = el('div', 'res-grid');
    const colA = el('div', 'ra');
    colA.innerHTML = `${d.newBest ? '<span class="newbest">NEW BEST!</span>' : ''}<div class="res-dist">${fmt(d.distance)}<span class="unit"> m</span></div><div class="res-sub">${[d.newBest ? `Previous best ${fmt(d.best)} m` : d.best > d.distance ? `${fmt(d.best - d.distance)} m short of your best` : '', d.zone].filter(Boolean).join(' · ')}</div>`;
    const rows = el('div', 'res-rows');
    const row = (label: string, val: number, cls = ''): string => `<div class="res-row ${cls}"><span>${label}</span><b>${ICON.shell}${val > 0 && cls !== 'total' ? '+' : ''}${fmt(val)}</b></div>`;
    rows.innerHTML = row('Shells collected', d.pickups) + (d.bonus > 0 ? row('Bonuses', d.bonus) : '') + (d.goalRewards > 0 ? row('Goals completed', d.goalRewards) : '') + row('Your shells', d.balance, 'total');
    colA.appendChild(rows);
    const colB = el('div', 'rb');
    if (d.unlock) {
      const u = el('div', 'unlock');
      const pct = Math.min(100, Math.round((d.unlock.have / d.unlock.need) * 100));
      u.innerHTML = `<div class="lbl"><span>Next: <b>${d.unlock.name}</b></span><span>${fmt(Math.min(d.unlock.have, d.unlock.need))} / ${fmt(d.unlock.need)}</span></div><div class="bar"><i style="width:0%"></i></div>`;
      colB.appendChild(u);
      requestAnimationFrame(() => requestAnimationFrame(() => ((u.querySelector('.bar i') as HTMLElement).style.width = `${pct}%`)));
    }
    const goals = el('div', 'goals-card');
    goals.style.width = '100%';
    this.renderGoals(goals, d.goals, 'Goals');
    colB.appendChild(goals);
    const buttons = el('div', 'btn-col rc');
    buttons.style.marginTop = '14px';
    const again = btn(`${ICON.restart}<span>Play Again</span>`, 'big', () => this.h.restart());
    const sub = el('div', 'btn-row');
    sub.append(btn(`${ICON.crab}<span>Crabs</span><i class="dot${this.shopBadge ? '' : ' hidden'}"></i>`, 'blue small', () => this.h.openShop()), btn(`${ICON.home}<span>Home</span>`, 'blue small', () => this.h.home()));
    buttons.append(again, sub);
    grid.append(colA, colB, buttons);
    body.appendChild(grid);
    p.append(head, body);
    r.append(dim, p);
    this.show('results');
    again.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ fade
  flashFade(onMid: () => void): void {
    this.fade.classList.add('on');
    setTimeout(() => {
      onMid();
      this.fade.classList.remove('on');
    }, 180);
  }
}
