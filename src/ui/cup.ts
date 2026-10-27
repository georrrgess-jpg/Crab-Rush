/**
 * Crab Cup screens (UPDATE4_PLAN.md §5.4): cup select (three cups, their races and trophies) and the
 * race results (a podium, standings, points and the cup table).
 */
import { CUPS, type CupDef, type CupState, cupTable, cupUnlocked, nextRace, pointsFor } from '../meta/cup';
import { btn, el, fmt } from './dom';
import { ICON } from './icons';
import { Wallet, actionBar, pageHead } from './kit';

export const CUP_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 6h16v8a8 8 0 0 1-16 0z" fill="#fff"/><path d="M12 9H6c0 6 3 9 7 9M28 9h6c0 6-3 9-7 9" stroke="#fff" stroke-width="3" fill="none"/><rect x="18" y="21" width="4" height="7" fill="#fff"/><rect x="12" y="28" width="16" height="5" rx="2" fill="#fff"/></svg>`;
const TROPHY = (cls: string): string => `<svg class="cup-trophy ${cls}" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="currentColor" stroke="rgba(0,0,0,.25)" stroke-width="2"/><path d="M18 13H8c0 10 5 15 12 15M46 13h10c0 10-5 15-12 15" stroke="currentColor" stroke-width="5" fill="none"/><rect x="28" y="35" width="8" height="10" fill="currentColor"/><rect x="18" y="45" width="28" height="9" rx="3" fill="currentColor" stroke="rgba(0,0,0,.25)" stroke-width="2"/><path d="M25 14l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#fff" opacity=".7"/></svg>`;

export interface CupData {
  state: CupState;
  shells: number;
  pearls: number;
  /** rival display names */
  names: Record<string, string>;
  /** avatars (data URLs) per racer id, when rendered */
  avatars: Record<string, string>;
}

export class CupScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private actions: HTMLElement;
  private wallet = new Wallet();
  private selected = 'sandy';

  constructor(private h: { back(): void; race(cupId: string): void; select?(): void }) {
    this.el = el('div', 'screen page cup');
    this.el.id = 'cup';
    const card = el('div', 'page-card wide cup-card');
    const { head } = pageHead('Crab Cup', () => this.h.back(), [this.wallet.el]);
    this.body = el('div', 'page-body cup-body');
    this.actions = actionBar();
    card.append(head, this.body, this.actions);
    this.el.append(el('div', 'page-dim'), card);
  }

  /** open fresh: select the cup in progress, else the first unlocked cup not yet cleared */
  open(d: CupData): void {
    const st = d.state;
    this.selected = st.current?.cup ?? [...CUPS].reverse().find((c) => cupUnlocked(st, c.id) && !st.cleared.includes(c.id))?.id ?? 'sandy';
    this.render(d);
  }

  render(d: CupData): void {
    this.wallet.set(d.shells, d.pearls);
    // default to the cup in progress, else the first not yet cleared
    const st = d.state;
    if (st.current) this.selected = st.current.cup;
    else if (!cupUnlocked(st, this.selected)) this.selected = 'sandy';
    this.body.innerHTML = '';
    const intro = el('div', 'cup-intro', `<b>Race three rivals down the beach.</b> Crashes slow you down instead of ending the race, and every 25 shells fire a <b>Shell Dash</b>. Finish in the top three of a cup to unlock the next one.`);
    const grid = el('div', 'cup-grid');
    CUPS.forEach((cup, i) => grid.appendChild(this.cupCard(cup, i, d)));
    this.body.append(intro, grid);
    this.actions.innerHTML = '';
    const cup = CUPS.find((c) => c.id === this.selected) as CupDef;
    const nr = nextRace(st, cup.id);
    const go = btn(`${ICON.play}<span>${st.current?.cup === cup.id ? 'Next race' : 'Start cup'}</span>`, 'big cup-go', () => this.h.race(cup.id), `Race: ${nr?.name ?? ''}`);
    go.disabled = !cupUnlocked(st, cup.id);
    const sub = el('div', 'cup-next', nr ? `<span>${cup.name} · race ${cup.races.indexOf(nr) + 1}/3</span><b>${nr.name}</b>` : '');
    const col = el('div', 'cup-playcol');
    col.append(go, sub);
    this.actions.appendChild(col);
  }

  /** keyboard Enter: the action bar's race button */
  go(): void {
    (this.actions.querySelector('.cup-go') as HTMLButtonElement | null)?.click();
  }

  private cupCard(cup: CupDef, i: number, d: CupData): HTMLElement {
    const st = d.state;
    const open = cupUnlocked(st, cup.id);
    const gold = st.golds.includes(cup.id);
    const cleared = st.cleared.includes(cup.id);
    const c = el('button', `cup-c cup-${cup.id}${open ? '' : ' locked'}${this.selected === cup.id ? ' on' : ''}`) as HTMLButtonElement;
    c.type = 'button';
    c.dataset.cup = cup.id;
    c.setAttribute('aria-pressed', String(this.selected === cup.id));
    const results = st.current?.cup === cup.id ? st.current.results : {};
    const pips = cup.races
      .map((r) => {
        const p = results[r.id];
        return `<span class="cup-pip${p ? ` p${p}` : ''}" title="${r.name}${p ? `: ${ordinal(p)}` : ''}">${p ? ordinal(p) : ''}</span>`;
      })
      .join('');
    const rw = cup.reward;
    c.innerHTML = `<span class="cup-art">${TROPHY(gold ? 'gold' : cleared ? 'silver' : open ? 'plain' : 'lock')}</span>
      <span class="cup-col"><span class="cup-name">${cup.name}</span>
      <span class="cup-meta">${open ? (gold ? 'Gold trophy!' : cleared ? (st.best[cup.id] ? `Cleared · best ${st.best[cup.id]} pts` : 'Cleared') : 'Three races') : `Clear the ${CUPS[i - 1]?.name} to unlock`}</span>
      <span class="cup-pips">${pips}</span>
      <span class="cup-rw">${ICON.shell}${fmt(rw.shells)} · ${rw.pearls} pearls${rw.title ? ` · “${rw.title}”` : ''}${rw.item ? ' · Race Helmet' : ''}</span></span>
      ${open ? '' : `<span class="cup-lock">${ICON.lock}</span>`}`;
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!open) return;
      this.selected = cup.id;
      this.h.select?.();
      this.render(d);
    });
    return c;
  }
}

export interface RaceEndData {
  cup: CupDef;
  raceName: string;
  raceIndex: number;
  standings: { id: string; name: string; place: number; time: number; you: boolean }[];
  shells: number;
  xp: number;
  state: CupState;
  names: Record<string, string>;
  avatars: Record<string, string>;
  /** set after the third race */
  outcome: { points: number; place: number; cleared: boolean; firstClear: boolean; gold: boolean; reward: string | null } | null;
}

/** Race results: a podium for the top three, everyone's time, points and the cup table. */
export class RaceEndScreen {
  readonly el: HTMLElement;
  private card: HTMLElement;

  constructor(private h: { next(): void; cup(): void; home(): void }) {
    this.el = el('div', 'screen results2 race-end hidden');
    this.el.id = 'race-end';
    this.card = el('div', 'res-card race-card');
    this.el.append(el('div', 'res-dim'), this.card);
  }

  show(d: RaceEndData): void {
    const me = d.standings.find((s) => s.you)!;
    const top = [2, 1, 3].map((pl) => d.standings.find((s) => s.place === pl));
    const ava = (id: string): string => (d.avatars[id] ? `<img alt="" src="${d.avatars[id]}">` : ICON.crab);
    const podium = top
      .map((s) => (s ? `<div class="pod pod${s.place}${s.you ? ' you' : ''}" style="--i:${s.place}"><span class="pod-ava">${ava(s.id)}</span><span class="pod-name">${s.you ? 'You' : s.name}</span><span class="pod-step"><b>${s.place}</b></span></div>` : ''))
      .join('');
    const rows = d.standings
      .map((s) => `<div class="rs-row${s.you ? ' you' : ''}"><span class="rs-pl">${ordinal(s.place)}</span><span class="rs-name">${s.you ? 'You' : s.name}</span><span class="rs-time">${s.time.toFixed(1)} s</span><span class="rs-pts">+${pointsFor(s.place)}</span></div>`)
      .join('');
    // cup table so far (after this race's points are in)
    const t = cupTable(d.state, d.cup.id);
    const table = d.outcome
      ? `<div class="cup-out${d.outcome.cleared ? ' ok' : ''}">${d.outcome.gold ? TROPHY('gold') : d.outcome.cleared ? TROPHY('silver') : TROPHY('plain')}<span><b>${d.cup.name}: ${ordinal(d.outcome.place)} overall</b><small>${d.outcome.points} points${d.outcome.cleared ? (d.outcome.firstClear ? ' · cup cleared!' : ' · cleared') : ' · top 3 needed to clear'}${d.outcome.reward ? ` · ${d.outcome.reward}` : ''}</small></span></div>`
      : `<div class="cup-tbl"><span>Cup so far</span><b>You ${t.you}</b>${Object.entries(t.rivals)
          .sort((a, b) => b[1] - a[1])
          .map(([id, p]) => `<span>${d.names[id] ?? id} ${p}</span>`)
          .join('')}</div>`;
    this.card.className = `res-card race-card${me.place === 1 ? ' best' : ''}`;
    this.card.innerHTML = `<div class="res-head" data-toast-avoid><span class="rh-title">${me.place === 1 ? 'You won!' : `${ordinal(me.place)} place`}</span></div>
      <div class="race-name">${d.cup.name} · ${d.raceName} (${d.raceIndex + 1}/3)</div>
      <div class="podium">${podium}</div>
      <div class="rs-list">${rows}</div>
      <div class="lv-rewards"><span class="rw">${ICON.shell}+${fmt(d.shells)}</span><span class="rw xp">${ICON.sun}+${d.xp} XP</span></div>
      ${table}`;
    const bar = el('div', 'res-buttons one-row');
    const more = !d.outcome;
    bar.append(btn(`${ICON.home}<span>Home</span>`, 'blue small', () => this.h.home()), btn(`${more ? ICON.play : CUP_ICON}<span>${more ? 'Next race' : 'Cups'}</span>`, 'big', () => (more ? this.h.next() : this.h.cup())));
    this.card.appendChild(bar);
    this.el.classList.remove('hidden');
    (bar.querySelector('.btn.big') as HTMLElement).focus({ preventScroll: true });
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  /** keyboard Enter: Next race / Cups */
  primary(): void {
    (this.card.querySelector('.res-buttons .btn.big') as HTMLButtonElement | null)?.click();
  }
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}
