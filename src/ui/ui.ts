import { ICON } from './icons';
import { toastCorner, toastTop } from './kit';
import { btn, el, fmt } from './dom';
import type { PowerKind } from '../sim/events';
import { HomeScreen, type HomeData, type HomeHandlers } from './home';
import { ResultsScreen, type ResultsHandlers, type ResultsView } from './results';

export interface UIHandlers {
  pause(): void;
  resume(): void;
  restart(): void;
  home(): void;
  openSettings(): void;
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

type ScreenName = 'title' | 'hud' | 'pause' | 'results' | 'none';

/** All DOM UI. Screens are built once and toggled (UPDATE2_PLAN.md §4). */
export class UI {
  private root: HTMLElement;
  readonly home: HomeScreen;
  readonly results: ResultsScreen;
  private hud: HTMLElement;
  private pauseEl: HTMLElement;
  private pauseStats: HTMLElement;
  private countdown: HTMLElement;
  private tutorial: HTMLElement;
  private toasts: HTMLElement;
  private fade: HTMLElement;
  private wipe: HTMLElement;
  reduceMotionUI = false;
  private touchL: HTMLButtonElement;
  private touchR: HTMLButtonElement;
  private shellsVal: HTMLElement;
  private shellsPill: HTMLElement;
  /** pooled flying shell sprites (pickup → counter) */
  private flyers: { el: HTMLElement; busy: boolean }[] = [];
  private distVal: HTMLElement;
  private powerPie: HTMLElement;
  private powerIc: HTMLElement;
  private streakEl: HTMLElement;
  private streakNum: HTMLElement;
  private pauseGoals: HTMLElement;
  // Island Hop HUD
  private lvBar: HTMLElement;
  private lvFill: HTMLElement;
  private lvCrab: HTMLElement;
  private lvDollars: HTMLElement;
  private lvRule: HTMLElement;
  private lvChase: HTMLElement;
  private lvChaseFill: HTMLElement;
  private foam: HTMLElement;
  private lastLv = '';
  private lastShells = -1;
  private lastDist = -1;
  private lastPower: PowerKind | null = null;
  private lastStreak = -1;
  private lastPie = -1;
  touchButtonsVisible = false;
  current: ScreenName = 'none';
  extraScreens: HTMLElement[] = [];

  constructor(root: HTMLElement, private h: UIHandlers, homeH: HomeHandlers, resultsH: ResultsHandlers) {
    this.root = root;
    this.home = new HomeScreen(homeH);
    this.results = new ResultsScreen(resultsH);

    // ---------------- HUD
    this.hud = el('div', 'screen hidden');
    this.hud.id = 'hud';
    const left = el('div', 'left');
    this.shellsPill = el('div', 'pill shells', `<span class="ico">${ICON.shell}</span><b>0</b>`);
    this.shellsVal = this.shellsPill.querySelector('b') as HTMLElement;
    // power-up timer: a radial pie around the icon
    this.powerPie = el('div', 'power-pie hidden', '<span class="ic"></span>');
    this.powerIc = this.powerPie.querySelector('.ic') as HTMLElement;
    // shell streak meter with a flame that grows
    this.streakEl = el('div', 'streak-meter hidden', `<span class="fl">${ICON.flame}</span><b>×<span>0</span></b>`);
    this.streakNum = this.streakEl.querySelector('b span') as HTMLElement;
    left.append(this.shellsPill, this.powerPie, this.streakEl);
    for (let i = 0; i < 10; i++) {
      const f = el('div', 'shell-fly', ICON.shell);
      f.setAttribute('aria-hidden', 'true');
      this.flyers.push({ el: f, busy: false });
    }
    const right = el('div', 'right');
    const pauseBtn = btn(ICON.pause, 'blue pause-btn', () => this.h.pause(), 'Pause');
    const dist = el('div', 'pill dist', `<b>0</b><span class="unit">m</span><span class="ico">${ICON.flag}</span>`);
    this.distVal = dist.querySelector('b') as HTMLElement;
    right.append(pauseBtn, dist);
    this.hud.append(left, right);
    // Island Hop: progress to the flag, sand dollar slots, the star-3 rule and the chase meter
    this.lvBar = el('div', 'lv-progress hidden', `<span class="track"><i></i><span class="me">${ICON.crab}</span></span><span class="fl">${ICON.flag}</span>`);
    this.lvFill = this.lvBar.querySelector('i') as HTMLElement;
    this.lvCrab = this.lvBar.querySelector('.me') as HTMLElement;
    this.lvDollars = el('div', 'lv-dollars hidden', '<span></span><span></span><span></span>');
    this.lvRule = el('div', 'lv-rule hidden');
    this.lvChase = el('div', 'lv-chase hidden', `<span class="ci">${ICON.rider}</span><span class="bar"><i></i></span>`);
    this.lvChaseFill = this.lvChase.querySelector('i') as HTMLElement;
    left.append(this.lvDollars, this.lvRule);
    this.hud.append(this.lvBar, this.lvChase);
    this.foam = el('div', 'chase-foam hidden');
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

    // ---------------- pause: a bottom sheet on phones, a side panel on wide screens
    this.pauseEl = el('div', 'screen hidden');
    this.pauseEl.id = 'pause';
    const pdim = el('div', 'sheet-dim');
    pdim.addEventListener('click', () => this.h.resume());
    const sheet = el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Paused');
    sheet.innerHTML = `<div class="grab"></div><div class="sheet-head">Paused</div>`;
    this.pauseStats = el('div', 'pause-stats');
    const pcol = el('div', 'btn-col');
    const row = el('div', 'btn-row');
    row.append(
      btn(`${ICON.restart}<span>Restart</span>`, 'blue small', () => this.h.restart()),
      btn(`${ICON.gear}<span>Settings</span>`, 'blue small', () => this.h.openSettings()),
      btn(`${ICON.home}<span>Home</span>`, 'blue small', () => this.h.home()),
    );
    pcol.append(btn(`${ICON.play}<span>Resume</span>`, 'big', () => this.h.resume()), row);
    this.pauseGoals = el('div', 'goals-card');
    sheet.append(this.pauseStats, pcol, this.pauseGoals);
    this.pauseEl.append(pdim, sheet);

    this.fade = el('div');
    this.fade.id = 'fade';
    // wave wipe (UPDATE3_PLAN.md §2.4): a curling wave sweeps across between big screen changes
    this.wipe = el('div', 'wave-wipe', `<svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h150c-14 10-22 22-18 34 6 18 30 14 28 34-2 16-22 22-20 32H0z" fill="#2fa6d6"/><path d="M0 0h138c-12 10-18 22-14 34 6 18 28 14 26 34-2 16-20 22-18 32H0z" fill="#4fc4f0"/><path d="M150 0c-14 10-22 22-18 34 6 18 30 14 28 34-2 16-22 22-20 32" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`);
    this.wipe.setAttribute('aria-hidden', 'true');

    root.append(this.foam, this.home.el, this.hud, this.tutorial, this.countdown, this.pauseEl, this.results.el, this.toasts, this.fade, this.wipe);
  }

  // ------------------------------------------------------------------ screens
  show(name: ScreenName): void {
    const prev = this.current;
    this.current = name;
    if (name === 'title') this.home.show();
    else this.home.hide();
    this.hud.classList.toggle('hidden', !(name === 'hud' || name === 'pause'));
    this.pauseEl.classList.toggle('hidden', name !== 'pause');
    if (name !== 'results') this.results.hide();
    if (name !== 'hud') this.hideTutorial();
    if (name === 'title' || name === 'results') this.clearToasts();
    for (const s of this.extraScreens) s.classList.add('hidden');
    if (name === 'pause' && prev !== 'pause') {
      this.pauseEl.classList.remove('enter');
      void this.pauseEl.offsetWidth;
      this.pauseEl.classList.add('enter');
      (this.pauseEl.querySelector('.btn.big') as HTMLElement | null)?.focus({ preventScroll: true });
    }
    if (name === 'hud' && prev !== 'pause') {
      this.hud.classList.remove('enter');
      void this.hud.offsetWidth;
      this.hud.classList.add('enter');
    }
  }

  /** a floating layer above every screen (not part of the screen stack) */
  mountOverlay(node: HTMLElement): void {
    this.root.insertBefore(node, this.toasts);
  }

  addScreen(node: HTMLElement): void {
    node.classList.add('hidden');
    this.extraScreens.push(node);
    this.root.insertBefore(node, this.toasts);
  }

  showExtra(node: HTMLElement): void {
    this.home.hide();
    this.results.hide();
    this.pauseEl.classList.add('hidden');
    for (const s of this.extraScreens) s.classList.toggle('hidden', s !== node);
    node.classList.remove('rt-enter');
    void node.offsetWidth;
    node.classList.add('rt-enter');
  }

  hideExtras(): void {
    for (const s of this.extraScreens) s.classList.add('hidden');
  }

  setHome(d: HomeData): void {
    this.home.set(d);
  }

  showResults(d: ResultsView): void {
    this.show('results');
    this.results.show(d);
  }

  setPauseInfo(goals: GoalView[], dist: number, shells: number): void {
    this.pauseStats.innerHTML = `<div><span>Distance</span><b>${fmt(dist)} m</b></div><div><span>Shells</span><b>${ICON.shell}${fmt(shells)}</b></div>`;
    this.renderGoals(this.pauseGoals, goals, 'Goals');
  }

  /** Island Hop HUD on/off (null = endless run). */
  setLevelHUD(info: { chase: boolean } | null): void {
    const on = !!info;
    this.lvBar.classList.toggle('hidden', !on);
    this.lvDollars.classList.toggle('hidden', !on);
    this.lvRule.classList.toggle('hidden', !on);
    this.lvChase.classList.toggle('hidden', !info?.chase);
    this.foam.classList.toggle('hidden', !info?.chase);
    this.hud.classList.toggle('level', on);
    this.lastLv = '';
  }

  updateLevelHUD(progress: number, dollars: number, rule: string, met: boolean, lost: boolean, gap: number | null): void {
    const p = Math.max(0, Math.min(1, progress));
    this.lvFill.style.width = `${(p * 100).toFixed(1)}%`;
    this.lvCrab.style.left = `${(p * 100).toFixed(1)}%`;
    const key = `${dollars}|${rule}|${met}|${lost}`;
    if (key !== this.lastLv) {
      const was = this.lastLv ? Number(this.lastLv.split('|')[0]) : 0;
      this.lastLv = key;
      const spans = this.lvDollars.children;
      for (let i = 0; i < 3; i++) {
        const sp = spans[i] as HTMLElement;
        const on = i < dollars;
        sp.classList.toggle('on', on);
        if (on && i >= was) {
          sp.classList.remove('pop');
          void sp.offsetWidth;
          sp.classList.add('pop');
        }
      }
      this.lvRule.className = `lv-rule${lost ? ' lost' : met ? ' met' : ''}`;
      this.lvRule.innerHTML = `<span class="ri">${lost ? '✕' : met ? ICON.check : ICON.trophy}</span>${rule}`;
    }
    if (gap !== null) {
      const k = Math.max(0, Math.min(1, gap / 20));
      this.lvChaseFill.style.width = `${(k * 100).toFixed(0)}%`;
      this.lvChase.classList.toggle('danger', gap < 6);
      this.foam.style.opacity = String(Math.max(0, Math.min(1, (12 - gap) / 10)));
    }
  }

  /** Left-handed HUD: pause and distance on the left, shells on the right. */
  setLefty(on: boolean): void {
    this.hud.classList.toggle('lefty', on);
  }

  setReduceMotion(on: boolean): void {
    this.results.reduceMotion = on;
    this.reduceMotionUI = on;
    document.getElementById('app')?.classList.toggle('reduce-motion', on);
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

  /** A collected shell flies from its screen position to the counter along a curve (UPDATE2_PLAN.md §3.3). */
  flyShell(x: number, y: number, big: boolean): void {
    if (this.hud.classList.contains('hidden')) return;
    const f = this.flyers.find((q) => !q.busy);
    if (!f) return;
    if (!f.el.isConnected) this.hud.append(f.el);
    const r = this.shellsPill.querySelector('.ico')?.getBoundingClientRect() ?? this.shellsPill.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    // control point: up and toward the counter so the path arcs
    const mx = x + (tx - x) * 0.35;
    const my = Math.max(12, Math.min(y, ty) - 40);
    f.busy = true;
    const s0 = big ? 1.5 : 1;
    const a = f.el.animate(
      [
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s0 * 0.6})`, opacity: 0 },
        { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) scale(${s0 * 1.15})`, opacity: 1, offset: 0.35 },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.7)`, opacity: 1 },
      ],
      { duration: 480, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
    );
    a.onfinish = () => {
      f.busy = false;
      f.el.style.opacity = '0';
      this.shellsPill.classList.remove('pop');
      void this.shellsPill.offsetWidth;
      this.shellsPill.classList.add('pop');
    };
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
      this.powerPie.classList.toggle('hidden', !power);
      this.powerPie.dataset.kind = power ?? '';
      if (power) this.powerIc.innerHTML = ICON[power];
      this.lastPie = -1;
    }
    if (power) {
      const p = Math.round(Math.max(0, Math.min(1, powerFrac)) * 100);
      if (p !== this.lastPie) {
        this.lastPie = p;
        this.powerPie.style.setProperty('--p', String(p / 100));
        this.powerPie.classList.toggle('low', p < 25);
      }
    }
    const s = streak >= 5 ? streak : 0;
    if (s !== this.lastStreak) {
      this.lastStreak = s;
      this.streakEl.classList.toggle('hidden', s === 0);
      if (s > 0) {
        this.streakNum.textContent = String(s);
        // the flame grows with the streak and flares on every tenth shell
        this.streakEl.style.setProperty('--heat', String(Math.min(1, s / 40)));
        if (s % 10 === 0) {
          this.streakEl.classList.remove('flare');
          void this.streakEl.offsetWidth;
          this.streakEl.classList.add('flare');
        }
      }
    }
  }

  resetHUD(): void {
    this.lastShells = -1;
    this.lastDist = -1;
    this.lastPower = null;
    this.lastStreak = -1;
    this.powerPie.classList.add('hidden');
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
    // the toast lane: just under whatever header, wallet or HUD row is showing
    const corner = toastCorner() && [...document.querySelectorAll<HTMLElement>('.res-card, .chest-card')].some((n) => n.offsetParent !== null);
    this.toasts.classList.toggle('corner', corner);
    this.toasts.style.top = corner ? '' : `${Math.round(toastTop())}px`;
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

  // ------------------------------------------------------------------ fade
  /** A wave sweeps across; `onMid` runs while the screen is covered. Reduce Motion: a quick fade. */
  waveWipe(onMid: () => void): void {
    if (this.reduceMotionUI) return this.flashFade(onMid);
    const w = this.wipe;
    w.classList.remove('go');
    void w.offsetWidth;
    w.classList.add('go');
    setTimeout(onMid, 330);
    setTimeout(() => w.classList.remove('go'), 800);
  }

  flashFade(onMid: () => void): void {
    this.fade.classList.add('on');
    setTimeout(() => {
      onMid();
      this.fade.classList.remove('on');
    }, 180);
  }
}
