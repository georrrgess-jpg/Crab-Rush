import { tierFromXp } from '../meta/xp';
import { btn, el, fmt } from './dom';
import { ICON } from './icons';
import type { GoalView } from './ui';

export interface ResultsView {
  title: string;
  distance: number;
  best: number;
  newBest: boolean;
  zone: string;
  pickups: number;
  bonus: number;
  completed: { text: string; reward: number }[];
  balance: number;
  xpBefore: number;
  xpGained: number;
  goals: GoalView[];
  unlock: { name: string; have: number; need: number } | null;
  wardrobeBadge: boolean;
  /** extra reward rows (Golden Shell boost, Daily Tide rewards) */
  extra?: { label: string; value: number }[];
  /** a highlighted line under the distance (Daily Tide score) */
  banner?: string;
}

export interface ResultsHandlers {
  again(): void;
  home(): void;
  wardrobe(): void;
  /** count-up tick sound */
  tick(): void;
  /** a pass tier was reached during the XP fill */
  levelUp(tier: number): void;
  /** a row landed (goal check, total) */
  pop(): void;
}

interface Step {
  at: number;
  dur: number;
  run(k: number): void;
  done?: boolean;
}

const ease = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * Staged results (UPDATE2_PLAN.md §4.3): distance counts up with ticks, then shells, bonuses and goals
 * tick off one by one, the total lands, XP fills the Sunny Pass bar (bursting at each new tier) and
 * the next unlock teases. Tapping anywhere skips to the end. Reduce Motion shows the end state.
 */
export class ResultsScreen {
  readonly el: HTMLElement;
  private panel: HTMLElement;
  private steps: Step[] = [];
  private t0 = 0;
  private raf = 0;
  private again!: HTMLButtonElement;
  reduceMotion = false;

  constructor(private h: ResultsHandlers) {
    this.el = el('div', 'screen results2 hidden');
    this.el.id = 'results';
    this.panel = el('div', 'res-card');
    this.el.append(el('div', 'res-dim'), this.panel);
    // tapping the card (not a button) skips the reveal
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.finish();
    });
  }

  show(d: ResultsView): void {
    cancelAnimationFrame(this.raf);
    this.steps = [];
    const p = this.panel;
    p.innerHTML = '';
    p.classList.toggle('best', d.newBest);
    const head = el('div', 'res-head', `<span class="rh-title">${d.title}</span>${d.newBest ? `<span class="rh-badge">${ICON.trophy}New best!</span>` : ''}`);
    const dist = el('div', 'res-big', `<b>0</b><span class="unit"> m</span>`);
    const distB = dist.querySelector('b') as HTMLElement;
    const sub = el('div', 'res-sub2', [d.newBest && d.best > 0 ? `Previous best ${fmt(d.best)} m` : d.best > d.distance ? `${fmt(d.best - d.distance)} m short of your best` : '', d.zone].filter(Boolean).join(' · '));
    const rows = el('div', 'res-list');
    const xp = el('div', 'res-xp', `<span class="xp-tier"><span class="sunico">${ICON.sun}</span><b></b></span><span class="xp-col"><span class="xp-lbl">Sunny Pass <span class="xp-gain"></span></span><span class="bar"><i></i></span></span>`);
    const xpTier = xp.querySelector('.xp-tier b') as HTMLElement;
    const xpFill = xp.querySelector('.bar i') as HTMLElement;
    const xpGain = xp.querySelector('.xp-gain') as HTMLElement;
    let unlock: HTMLElement | null = null;
    if (d.unlock) {
      unlock = el('div', 'res-unlock', `<span class="ul-lbl">Next crab: <b>${d.unlock.name}</b></span><span class="bar"><i></i></span><span class="ul-num">${fmt(Math.min(d.unlock.have, d.unlock.need))} / ${fmt(d.unlock.need)}</span>`);
    }
    const buttons = el('div', 'res-buttons');
    this.again = btn(`${ICON.restart}<span>Play Again</span>`, 'big', () => this.h.again());
    const small = el('div', 'btn-row');
    small.append(
      btn(`${ICON.hanger}<span>Wardrobe</span><i class="dot${d.wardrobeBadge ? '' : ' hidden'}"></i>`, 'blue small', () => this.h.wardrobe()),
      btn(`${ICON.home}<span>Home</span>`, 'blue small', () => this.h.home()),
    );
    buttons.append(this.again, small);
    p.append(head, dist, sub);
    if (d.banner) p.append(el('div', 'res-banner', d.banner));
    p.append(rows);
    p.append(xp);
    if (unlock) p.append(unlock);
    p.append(buttons, el('div', 'res-skip', 'Tap to skip'));

    // ---- timeline
    let at = 250;
    let lastTick = -1;
    this.steps.push({
      at,
      dur: 900,
      run: (k) => {
        const v = Math.round(d.distance * ease(k));
        distB.textContent = fmt(v);
        const bucket = Math.floor(k * 12);
        if (bucket !== lastTick && k < 1) {
          lastTick = bucket;
          this.h.tick();
        }
        if (k >= 1) dist.classList.add('landed');
      },
    });
    at += 1000;
    const addRow = (label: string, value: number, cls = '', count = true): void => {
      const r = el('div', `res-line pending ${cls}`, `<span class="rl-l">${label}</span><b>${ICON.shell}<span>${value > 0 && cls !== 'total' ? '+' : ''}0</span></b>`);
      const num = r.querySelector('b span') as HTMLElement;
      rows.append(r);
      this.steps.push({
        at,
        dur: count ? 420 : 1,
        run: (k) => {
          if (r.classList.contains('pending')) {
            r.classList.remove('pending');
            r.classList.add('in');
            this.h.pop();
          }
          num.textContent = `${value > 0 && cls !== 'total' ? '+' : ''}${fmt(Math.round(value * ease(k)))}`;
        },
      });
      at += 260;
    };
    addRow('Shells collected', d.pickups);
    if (d.bonus > 0) addRow('Bonuses', d.bonus);
    for (const x of d.extra ?? []) addRow(x.label, x.value, 'extra');
    for (const g of d.completed) addRow(`<span class="chk">${ICON.check}</span>${g.text}`, g.reward, 'goal');
    addRow('Your shells', d.balance, 'total');
    at += 150;
    // XP fill with level-up bursts
    const before = tierFromXp(d.xpBefore);
    let shownTier = before.tier;
    xpTier.textContent = String(before.tier);
    xpFill.style.width = `${before.need ? Math.round((before.into / before.need) * 100) : 100}%`;
    this.steps.push({
      at,
      dur: Math.min(1600, 500 + d.xpGained * 3),
      run: (k) => {
        const cur = tierFromXp(d.xpBefore + d.xpGained * ease(k));
        xpGain.textContent = `+${fmt(Math.round(d.xpGained * ease(k)))} XP`;
        xpFill.style.width = `${cur.need ? Math.round((cur.into / cur.need) * 100) : 100}%`;
        if (cur.tier !== shownTier) {
          shownTier = cur.tier;
          xpTier.textContent = String(cur.tier);
          xp.classList.remove('burst');
          void xp.offsetWidth;
          xp.classList.add('burst');
          this.h.levelUp(cur.tier);
        }
      },
    });
    at += 900;
    if (unlock && d.unlock) {
      const u = d.unlock;
      const fill = unlock.querySelector('.bar i') as HTMLElement;
      const pct = Math.min(100, Math.round((u.have / u.need) * 100));
      this.steps.push({ at, dur: 700, run: (k) => (fill.style.width = `${Math.round(pct * ease(k))}%`) });
    }

    this.el.classList.remove('hidden', 'done');
    this.again.focus({ preventScroll: true });
    if (this.reduceMotion) {
      this.finish();
      return;
    }
    this.t0 = performance.now();
    const loop = (): void => {
      const t = performance.now() - this.t0;
      let pending = false;
      for (const s of this.steps) {
        if (s.done) continue;
        if (t < s.at) {
          pending = true;
          continue;
        }
        const k = s.dur <= 1 ? 1 : (t - s.at) / s.dur;
        s.run(Math.min(1, k));
        if (k >= 1) s.done = true;
        else pending = true;
      }
      if (pending) this.raf = requestAnimationFrame(loop);
      else this.el.classList.add('done');
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Jump to the end state (skip). */
  finish(): void {
    cancelAnimationFrame(this.raf);
    const tick = this.h.tick;
    const lv = this.h.levelUp;
    const pop = this.h.pop;
    // finish silently: one pop at most
    this.h.tick = () => {};
    this.h.pop = () => {};
    let leveled = 0;
    this.h.levelUp = (t) => (leveled = t);
    for (const s of this.steps) {
      if (!s.done) {
        s.run(1);
        s.done = true;
      }
    }
    this.h.tick = tick;
    this.h.pop = pop;
    this.h.levelUp = lv;
    if (leveled) lv(leveled);
    this.el.classList.add('done');
  }

  hide(): void {
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
  }
}
