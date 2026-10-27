import { DECOR, DECOR_BY_ID, PLOTS, type CoveState } from '../meta/cove';
import { FRIENDS, type QuestDef } from '../meta/friends';
import { FAMILIES, TIER_NAMES } from '../meta/achievements';
import { ITEM_BY_ID } from '../meta/wardrobe';
import { btn, el, fmt } from './dom';
import { COVE_ICON, PEARL } from './home';
import { ICON } from './icons';

export interface CoveFriendView {
  id: string;
  moved: boolean;
  quest: QuestDef | null;
  have: number;
  done: boolean;
  /** quests finished (0..3) */
  step: number;
}

export interface CoveData {
  cove: CoveState;
  comfort: number;
  maxComfort: number;
  rate: number;
  gifts: number;
  cap: number;
  shells: number;
  pearls: number;
  friends: CoveFriendView[];
  /** achievements: earned keys and the metric value per family */
  earned: string[];
  progress: Record<string, number>;
  titles: string[];
  title: string;
  /** decoration portraits (data URLs) */
  thumbs: Record<string, string>;
}

export interface CoveHandlers {
  back(): void;
  collect(): void;
  buy(id: string): void;
  place(plot: number, id: string): void;
  store(plot: number): void;
  claim(friend: string): void;
  title(t: string): void;
  tab(): void;
}

type Tab = 'decor' | 'friends' | 'trophies';
const HEART = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 34S5 25 5 14a8 8 0 0 1 15-4 8 8 0 0 1 15 4c0 11-15 20-15 20z" fill="#ff5a8a" stroke="#fff" stroke-width="2.5"/></svg>`;
const MEDAL = ['#cd7f32', '#c0c8d0', '#ffd23a'];

/**
 * Crab Cove (UPDATE3_PLAN.md §6.3): the island is the 3D scene; this screen is the chrome around it:
 * Comfort and the gift pile on top, plot buttons over the 3D plots, and a drawer with decorations,
 * friends and trophies.
 */
export class CoveScreen {
  readonly el: HTMLElement;
  private top: HTMLElement;
  private giftBtn: HTMLButtonElement;
  private plotLayer: HTMLElement;
  private plots: HTMLButtonElement[] = [];
  private bubbles = new Map<string, HTMLElement>();
  private drawer: HTMLElement;
  private body: HTMLElement;
  private tabBtns: HTMLButtonElement[] = [];
  private tab: Tab = 'decor';
  private selected: string | null = null;
  private data: CoveData | null = null;

  constructor(private h: CoveHandlers) {
    this.el = el('div', 'screen cove hidden');
    this.el.id = 'cove';
    this.top = el('div', 'cove-top');
    const back = btn(ICON.back, 'blue round', () => this.h.back(), 'Back');
    this.top.appendChild(back);
    this.top.appendChild(el('div', 'cove-stats'));
    this.giftBtn = el('button', 'cove-gift') as HTMLButtonElement;
    this.giftBtn.type = 'button';
    this.giftBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.collect();
    });
    this.plotLayer = el('div', 'cove-plots');
    for (let i = 0; i < PLOTS; i++) {
      const b = el('button', 'cove-plot') as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPlot(i);
      });
      this.plots.push(b);
      this.plotLayer.appendChild(b);
    }
    this.drawer = el('div', 'panel cove-drawer');
    const tabs = el('div', 'tabs wtabs');
    for (const [id, label, icon] of [['decor', 'Decorate', COVE_ICON], ['friends', 'Friends', ICON.crab], ['trophies', 'Trophies', ICON.trophy]] as [Tab, string, string][]) {
      const b = el('button', '', `<span class="wti">${icon}</span><span class="wtl">${label}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.tab = id;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tab = id;
        this.selected = null;
        this.h.tab();
        if (this.data) this.render(this.data);
      });
      this.tabBtns.push(b);
      tabs.appendChild(b);
    }
    this.body = el('div', 'shop-body cove-body');
    this.drawer.append(tabs, this.body);
    this.el.append(this.top, this.giftBtn, this.plotLayer, this.drawer);
  }

  get editing(): boolean {
    return this.tab === 'decor';
  }

  open(d: CoveData): void {
    this.selected = null;
    this.tab = 'decor';
    this.render(d);
  }

  /** Called on every data change (gifts tick, purchases, claims). */
  render(d: CoveData): void {
    this.data = d;
    const pct = Math.round((d.comfort / d.maxComfort) * 100);
    (this.top.querySelector('.cove-stats') as HTMLElement).innerHTML = `<span class="cove-comfort">${HEART}<span class="cc-col"><span class="cc-lbl">Comfort <b>${d.comfort}</b></span><span class="bar"><i style="width:${pct}%"></i></span></span></span><span class="pill">${ICON.shell}<b>${fmt(d.shells)}</b></span><span class="pill pearl">${PEARL}<b>${fmt(d.pearls)}</b></span>`;
    this.updateGifts(d);
    for (const b of this.tabBtns) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    const ready = d.friends.filter((f) => f.done).length;
    const fd = this.tabBtns[1]!;
    let dot = fd.querySelector('.wdot');
    if (!dot) {
      dot = el('i', 'wdot');
      fd.appendChild(dot);
    }
    dot.textContent = String(ready);
    dot.classList.toggle('hidden', ready === 0);
    this.el.classList.toggle('editing', this.tab === 'decor');
    this.body.innerHTML = '';
    if (this.tab === 'decor') this.renderDecor(d);
    else if (this.tab === 'friends') this.renderFriends(d);
    else this.renderTrophies(d);
    this.renderPlots(d);
  }

  updateGifts(d: CoveData): void {
    this.giftBtn.classList.toggle('ready', d.gifts > 0);
    this.giftBtn.disabled = d.gifts <= 0;
    this.giftBtn.innerHTML = d.gifts > 0 ? `<span class="cg-ico">${ICON.shell}</span><span class="cg-col"><b>Collect ${fmt(d.gifts)}</b><small>Tide Gifts · ${d.rate}/h</small></span>` : `<span class="cg-ico">${ICON.shell}</span><span class="cg-col"><b>${d.rate} shells/hour</b><small>Gifts wash up while you're away</small></span>`;
    if (d.gifts >= d.cap) this.giftBtn.classList.add('full');
    else this.giftBtn.classList.remove('full');
  }

  private renderPlots(d: CoveData): void {
    d.cove.plots.forEach((id, i) => {
      const b = this.plots[i] as HTMLButtonElement;
      b.classList.toggle('filled', !!id);
      b.classList.toggle('sel', !!id && id === this.selected);
      b.classList.toggle('target', !!this.selected && id !== this.selected);
      b.innerHTML = id ? `<span class="cp-name">${DECOR_BY_ID.get(id)?.name ?? ''}</span>` : `<span class="cp-plus">+</span>`;
      b.setAttribute('aria-label', id ? `${DECOR_BY_ID.get(id)?.name}: tap to move` : this.selected ? `Place ${DECOR_BY_ID.get(this.selected)?.name} here` : `Empty plot ${i + 1}`);
    });
  }

  private onPlot(i: number): void {
    const d = this.data;
    if (!d || this.tab !== 'decor') return;
    const id = d.cove.plots[i];
    if (this.selected) {
      if (id === this.selected) this.selected = null;
      else {
        this.h.place(i, this.selected);
        this.selected = null;
        return;
      }
    } else if (id) this.selected = id;
    else {
      // an empty plot with nothing picked: place the first owned decoration that isn't out yet
      const next = d.cove.owned.find((x) => !d.cove.plots.includes(x));
      if (next) {
        this.h.place(i, next);
        return;
      }
      this.body.querySelector('.cove-hint')?.classList.add('flash');
    }
    this.render(d);
  }

  private renderDecor(d: CoveData): void {
    const free = d.cove.owned.filter((x) => !d.cove.plots.includes(x)).length;
    const hint = this.selected
      ? `<b>${DECOR_BY_ID.get(this.selected)?.name}</b> picked up: tap a plot to move it there, or <button class="link store">put it away</button>`
      : free > 0
        ? `Tap an empty plot (+) to place your decorations, or pick one below`
        : `Buy decorations to make your Cove comfier: more Comfort, more Tide Gifts, new friends`;
    const h = el('div', 'cove-hint', hint);
    h.querySelector('.store')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const at = d.cove.plots.indexOf(this.selected);
      if (at >= 0) this.h.store(at);
      this.selected = null;
    });
    const grid = el('div', 'crab-grid cove-grid');
    for (const x of DECOR) {
      const owned = d.cove.owned.includes(x.id);
      const out = d.cove.plots.includes(x.id);
      const afford = (x.currency === 'pearls' ? d.pearls : d.shells) >= x.cost;
      const t = el('button', `tile${owned ? ' owned' : ' locked'}${out ? ' selected' : ''}${this.selected === x.id ? ' preview' : ''}`) as HTMLButtonElement;
      t.type = 'button';
      t.dataset.decor = x.id;
      const art = d.thumbs[x.id] ? `<img alt="" src="${d.thumbs[x.id]}">` : `<span class="art">${COVE_ICON}</span>`;
      const badge = out ? `<span class="badge ok">${ICON.check}</span>` : owned ? '' : `<span class="badge${afford ? '' : ' poor'}">${x.currency === 'pearls' ? PEARL : ICON.shell}${fmt(x.cost)}</span>`;
      t.innerHTML = `${art}${badge}<span class="cmf">${HEART}+${x.comfort}</span><span class="nm">${x.name}</span>`;
      t.setAttribute('aria-label', `${x.name}, comfort ${x.comfort}${out ? ', placed' : owned ? ', owned' : `, ${x.cost} ${x.currency}`}`);
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!owned) this.h.buy(x.id);
        else {
          this.selected = this.selected === x.id ? null : x.id;
          this.render(d);
        }
      });
      grid.appendChild(t);
    }
    this.body.append(h, grid);
  }

  private renderFriends(d: CoveData): void {
    const list = el('div', 'friend-list');
    for (const f of FRIENDS) {
      const v = d.friends.find((x) => x.id === f.id);
      const card = el('div', `friend${v?.moved ? '' : ' away'}${v?.done ? ' ready' : ''}`);
      const col = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
      const ava = `<span class="fr-ava" style="--b:${col(f.body)};--d:${col(f.dark)}">${ICON.crab}</span>`;
      let status: string;
      if (!v?.moved) status = `<span class="fr-away">${HEART}Moves in at Comfort <b>${f.comfort}</b></span>`;
      else if (!v.quest) status = `<span class="fr-done">${ICON.check}All quests done. Best friends!</span>`;
      else {
        const gift = v.quest.gift ? (v.quest.gift.startsWith('hat:') ? (ITEM_BY_ID.get(`hats:${v.quest.gift.slice(4)}`)?.name ?? '') : (DECOR_BY_ID.get(v.quest.gift)?.name ?? '')) : '';
        status = `<span class="fr-q">Quest ${v.step + 1}/3: <b>${v.quest.text}</b></span><span class="bar"><i style="width:${Math.round((v.have / v.quest.target) * 100)}%"></i></span><span class="fr-rw">${fmt(v.have)}/${fmt(v.quest.target)} · ${PEARL}${v.quest.pearls}${gift ? ` + ${gift}` : ''}</span>`;
      }
      card.innerHTML = `${ava}<span class="fr-col"><span class="fr-name">${f.name}</span>${v?.moved ? `<span class="fr-line">“${f.line}”</span>` : ''}${status}</span>`;
      if (v?.done) {
        const b = btn('Claim', 'small green', () => this.h.claim(f.id), `Claim ${f.name}'s quest reward`);
        card.appendChild(b);
      }
      list.appendChild(card);
    }
    this.body.appendChild(list);
  }

  private renderTrophies(d: CoveData): void {
    const titles = el('div', 'title-pick', `<span class="tp-lbl">Your title</span>`);
    for (const t of d.titles) {
      const b = el('button', `chip${t === d.title ? ' on' : ''}`, t) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.title(t);
      });
      titles.appendChild(b);
    }
    const shelf = el('div', 'trophy-shelf');
    const got = d.earned.length;
    shelf.appendChild(el('div', 'ts-count', `${ICON.trophy}<b>${got}</b>/36 trophies`));
    for (const f of FAMILIES) {
      const have = d.progress[f.id] ?? 0;
      const tierNow = [0, 1, 2].filter((t) => d.earned.includes(`${f.id}:${t}`)).length;
      const next = f.targets[Math.min(2, tierNow)] as number;
      const medals = [0, 1, 2].map((t) => `<span class="medal${d.earned.includes(`${f.id}:${t}`) ? ' on' : ''}" style="--m:${MEDAL[t]}" title="${TIER_NAMES[t]}: ${f.text(f.targets[t] as number)}">${ICON.trophy}</span>`).join('');
      const row = el('div', 'trophy');
      row.innerHTML = `<span class="tr-medals">${medals}</span><span class="tr-col"><span class="tr-name">${f.name}</span><span class="tr-txt">${tierNow >= 3 ? `Complete! Title: <b>${f.title}</b>` : f.text(next)}</span><span class="bar"><i style="width:${tierNow >= 3 ? 100 : Math.round(Math.min(1, have / next) * 100)}%"></i></span></span>`;
      shelf.appendChild(row);
    }
    this.body.append(titles, shelf);
  }

  /** move the plot buttons and friend bubbles over the 3D scene */
  layout(plots: { x: number; y: number; visible: boolean }[], friends: { id: string; x: number; y: number; ready: boolean }[]): void {
    // nothing may sit under the drawer, the top bar or the gift button
    const blocks = [this.drawer, this.top, this.giftBtn].map((e) => e.getBoundingClientRect());
    const covered = (x: number, y: number): boolean => blocks.some((r) => x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24);
    plots.forEach((p, i) => {
      const b = this.plots[i] as HTMLButtonElement;
      b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
      b.style.visibility = p.visible && !covered(p.x, p.y) ? '' : 'hidden';
    });
    for (const f of friends) {
      let bub = this.bubbles.get(f.id);
      if (!bub) {
        bub = el('span', 'fr-bubble', '!');
        bub.setAttribute('aria-hidden', 'true');
        this.plotLayer.appendChild(bub);
        this.bubbles.set(f.id, bub);
      }
      // left/top (not transform): the bob animation owns the transform
      bub.style.left = `${f.x.toFixed(1)}px`;
      bub.style.top = `${f.y.toFixed(1)}px`;
      bub.classList.toggle('hidden', !f.ready || covered(f.x, f.y - 20));
    }
  }
}
