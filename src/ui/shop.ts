import { CFG } from '../config';
import type { SaveData } from '../core/save';
import { CRAB_ORDER, SKILL_UNLOCKS, crabPrice, powerDuration, upgradeCost } from '../sim/economy';
import type { PowerKind } from '../sim/events';
import { ITEMS, type Item, type Slot, owns, unseen } from '../meta/wardrobe';
import type { CrabSkin } from '../render/models/crab';
import { btn, el, fmt } from './dom';
import { DANCE_SVG, ICON, TRAIL_SVG } from './icons';
import { Sheet, Wallet } from './kit';
import { tabIndicator } from './motion';

export interface ShopHandlers {
  back(): void;
  /** show an item on the turntable crab without equipping it */
  preview(slot: Slot, id: string): void;
  equip(slot: Slot, id: string): void;
  buyCrab(id: string): void;
  buyUpgrade(kind: PowerKind): void;
  /** these owned items have now been looked at */
  seen(keys: string[]): void;
  /** outfits: wear / save slot i; a random outfit from owned items */
  outfit(i: number): void;
  saveOutfit(i: number): void;
  surprise(): void;
  /** hat dye: wear (or buy with pearls) dye n of a hat */
  dye(hat: string, n: number): void;
  /** the turntable: drag to rotate (radians), and back to the front */
  spin?(d: number): void;
  resetView?(): void;
}

type Filter = 'all' | 'owned' | 'locked';

export const DYE_COST = 10;
const DYE_COLORS = [['#f2cf7a', '#2a5ab0'], ['#7ad85a', '#ff5a8a'], ['#5ab8ff', '#ffd23a'], ['#d07aff', '#3fbf55']];

const UP_INFO: Record<PowerKind, { name: string; desc: string }> = {
  magnet: { name: 'Shell Magnet', desc: 'Pulls nearby shells toward you.' },
  shield: { name: 'Bubble Shield', desc: 'Absorbs one crash.' },
  rider: { name: 'Wave Rider', desc: 'Surf over everything, collecting shells in every lane.' },
};

type Tab = Slot | 'upgrades';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'bodies', label: 'Crabs', icon: ICON.crab },
  { id: 'hats', label: 'Hats', icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="27" rx="17" ry="5" fill="#fff"/><path d="M11 26c0-10 4-15 9-15s9 5 9 15" fill="#fff"/></svg>` },
  { id: 'trails', label: 'Trails', icon: ICON.sparkle },
  { id: 'dances', label: 'Dances', icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M16 30V10l16-4v20" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round"/><ellipse cx="12" cy="30" rx="5" ry="4" fill="#fff"/><ellipse cx="28" cy="26" rx="5" ry="4" fill="#fff"/></svg>` },
  { id: 'upgrades', label: 'Powers', icon: ICON.magnet },
];

const EQUIP_KEY: Record<Slot, 'body' | 'hat' | 'trail' | 'dance'> = { bodies: 'body', hats: 'hat', trails: 'trail', dances: 'dance' };

/**
 * The Wardrobe (UPDATE2_PLAN.md §6.3): bodies, hats, trails and victory dances mix and match on the
 * turntable crab; Powers are the v1 upgrades. Locked items show where they come from.
 */
export class ShopScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  /** pinned under the grid: the previewed item's name, source and Wear / Buy button */
  private foot: HTMLElement;
  private wallet = new Wallet();
  private outfitSheet = new Sheet('outfit-sheet');
  private tabLine: (b: HTMLElement | null) => void = () => {};
  private tabBtns: HTMLButtonElement[] = [];
  private tab: Tab = 'bodies';
  private filter: Filter = 'all';
  /** the name card under the turntable crab (UPDATE6_PLAN.md §2) */
  private nameCard: HTMLElement;
  private previewId: Record<Slot, string> = { bodies: 'sandy', hats: 'straw', trails: 'sand', dances: 'clap' };
  private last: SaveData | null = null;
  /** items that were new when the Wardrobe opened (they keep their NEW tag for this visit) */
  private fresh = new Set<string>();
  /** portraits from the renderer (bodies and hats); filled in the background */
  thumbs: { bodies: Record<string, string>; hats: Record<string, string> } = { bodies: {}, hats: {} };

  constructor(private skins: CrabSkin[], private h: ShopHandlers) {
    this.el = el('div', 'screen');
    this.el.id = 'shop';
    const top = el('div', 'top-bar');
    const back = btn(ICON.back, 'blue round', () => this.h.back(), 'Back');
    const title = el('h2', '', 'Wardrobe');
    const tcard = el('div', 'wd-title');
    tcard.append(back, title);
    top.dataset.toastAvoid = '';
    top.append(tcard, this.wallet.el);
    // the turntable: drag to rotate, the name card, Reset View and Saved Outfits
    const stage = el('div', 'shop-stage');
    let dragX: number | null = null;
    stage.addEventListener('pointerdown', (e) => {
      dragX = e.clientX;
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      this.h.spin?.((e.clientX - dragX) * 0.012);
      dragX = e.clientX;
    });
    const endDrag = (): void => {
      dragX = null;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    this.nameCard = el('div', 'wd-name');
    const hint = el('div', 'wd-hint', `${DRAG_ICON}<span>Drag to rotate</span>`);
    const reset = btn(`${RESET_ICON}<span>Reset View</span>`, 'ghost wd-reset', () => this.h.resetView?.(), 'Reset the view');
    const outfits = btn(`${OUTFIT_ICO}<span>Saved Outfits</span>`, 'teal wd-outfits of-open', () => {
      if (!this.last) return;
      this.fillOutfitSheet(this.last);
      this.outfitSheet.show('Saved Outfits');
    }, 'Saved outfits');
    const sbtns = el('div', 'wd-stage-btns');
    sbtns.append(reset, outfits);
    const sui = el('div', 'wd-stage-ui');
    sui.append(this.nameCard, hint, sbtns);
    stage.appendChild(sui);
    const panel = el('div', 'panel shop-panel');
    const tabs = el('div', 'tabs wtabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of TABS) {
      const b = el('button', '', `<span class="wti">${t.icon}</span><span class="wtl">${t.label}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.tab = t.id;
      b.addEventListener('click', () => {
        this.tab = t.id;
        if (this.last) this.render(this.last);
      });
      this.tabBtns.push(b);
      tabs.appendChild(b);
    }
    this.tabLine = tabIndicator(tabs);
    this.body = el('div', 'shop-body');
    this.foot = el('div', 'shop-foot');
    panel.append(tabs, this.body, this.foot);
    this.el.append(top, stage, panel, this.outfitSheet.el);
  }

  open(save: SaveData): void {
    this.fresh = new Set(unseen(save.wardrobe, save.seen));
    const e = save.wardrobe.equipped;
    this.previewId = { bodies: e.body, hats: e.hat, trails: e.trail, dances: e.dance };
    this.render(save);
  }

  render(save: SaveData): void {
    this.last = save;
    this.wallet.set(save.shells, save.pearls);
    for (const b of this.tabBtns) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      const t = b.dataset.tab as Tab;
      const n = t === 'upgrades' ? 0 : unseen(save.wardrobe, save.seen, t).length;
      let dot = b.querySelector('.wdot');
      if (n > 0 && !dot) {
        dot = el('i', 'wdot');
        b.appendChild(dot);
      }
      if (dot) {
        dot.textContent = String(n);
        dot.classList.toggle('hidden', n <= 0);
      }
    }
    const on = this.tabBtns.find((b) => b.classList.contains('on')) ?? null;
    this.tabLine(on);
    requestAnimationFrame(() => this.tabLine(on));
    this.body.innerHTML = '';
    this.foot.innerHTML = '';
    if (this.outfitSheet.open) this.fillOutfitSheet(save);
    const nb = this.items('bodies').find((i) => i.id === this.previewId.bodies);
    this.nameCard.innerHTML = `<b>${nb?.name ?? ''}</b><small>${this.skins.find((k) => k.id === this.previewId.bodies)?.blurb ?? ''}</small>`;
    if (this.tab === 'upgrades') this.renderUpgrades(save);
    else {
      this.renderSlot(save, this.tab);
      const keys = unseen(save.wardrobe, save.seen, this.tab);
      if (keys.length) this.h.seen(keys);
    }
  }

  private items(slot: Slot): Item[] {
    const list = ITEMS.filter((i) => i.slot === slot);
    if (slot === 'bodies') {
      // v1 crabs in shop order first
      list.sort((a, b) => order(a.id) - order(b.id));
    }
    return list;
  }

  private art(slot: Slot, id: string): string {
    if (slot === 'bodies') return this.thumbs.bodies[id] ? `<img alt="" src="${this.thumbs.bodies[id]}">` : `<span class="art">${ICON.crab}</span>`;
    if (slot === 'hats') {
      if (id === 'none') return `<span class="art none">${ICON.crab}</span>`;
      return this.thumbs.hats[id] ? `<img alt="" src="${this.thumbs.hats[id]}">` : `<span class="art">${TABS[1]!.icon}</span>`;
    }
    if (slot === 'trails') return `<span class="art">${TRAIL_SVG[id] ?? ''}</span>`;
    return `<span class="art">${DANCE_SVG[id] ?? ''}</span>`;
  }

  private renderSlot(save: SaveData, slot: Slot): void {
    const w = save.wardrobe;
    const equipped = w.equipped[EQUIP_KEY[slot]];
    const grid = el('div', `crab-grid w-${slot}`);
    const list = this.items(slot);
    const ownedN = list.filter((i) => owns(w, slot, i.id)).length;
    const count = el('div', 'w-count', `<b>${ownedN}</b>/${list.length} collected`);
    const filters = el('div', 'wd-filters');
    for (const [f, label] of [['all', 'All'], ['owned', 'Owned'], ['locked', 'Locked']] as [Filter, string][]) {
      const b = el('button', `chip${this.filter === f ? ' on' : ''}`, label) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.filter = f;
      b.setAttribute('aria-pressed', String(this.filter === f));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.filter = f;
        this.render(save);
      });
      filters.appendChild(b);
    }
    const frow = el('div', 'wd-frow');
    frow.append(filters, count);
    for (const item of list) {
      const id = item.id;
      const owned = owns(w, slot, id);
      if ((this.filter === 'owned' && !owned) || (this.filter === 'locked' && owned)) continue;
      const wearing = equipped === id;
      const t = el('button', `tile${owned ? ' owned' : ' locked'}${wearing ? ' selected' : ''}${this.previewId[slot] === id ? ' preview' : ''}`) as HTMLButtonElement;
      t.type = 'button';
      t.dataset.item = `${slot}:${id}`;
      t.setAttribute('aria-label', `${item.name}${owned ? (wearing ? ', wearing' : ', owned') : `, locked: ${item.source}`}`);
      let badge = '';
      if (wearing) badge = `<span class="badge ok">${ICON.check}</span><span class="wd-tag eq">Equipped</span>`;
      else if (owned) badge = '<span class="wd-tag own">Owned</span>';
      else if (!owned) {
        const buyable = slot === 'bodies' && (CRAB_ORDER as readonly string[]).includes(id) && !SKILL_UNLOCKS[id];
        badge = buyable ? `<span class="badge">${ICON.shell}${fmt(crabPrice(id))}</span>` : `<span class="badge lock">${ICON.lock}</span>`;
      }
      const isNew = owned && this.fresh.has(`${slot}:${id}`);
      t.innerHTML = `${this.art(slot, id)}${badge}${isNew ? '<span class="new-tag">NEW</span>' : ''}<span class="nm">${item.name}</span>`;
      t.addEventListener('click', () => {
        this.previewId[slot] = id;
        this.h.preview(slot, id);
        if (owned && !wearing) this.h.equip(slot, id);
        else this.render(save);
      });
      grid.appendChild(t);
    }
    if (!grid.children.length) grid.appendChild(el('div', 'wd-empty', this.filter === 'owned' ? 'Nothing here yet: unlock some!' : 'You own everything here!'));
    this.body.append(frow, grid);

    // detail + action for the previewed item
    const id = this.previewId[slot];
    const item = list.find((i) => i.id === id) ?? (list[0] as Item);
    const owned = owns(w, slot, item.id);
    const d = el('div', 'crab-detail');
    d.appendChild(el('span', 'wd-thumb', this.art(slot, item.id)));
    const blurb = slot === 'bodies' ? (this.skins.find((s) => s.id === item.id)?.blurb ?? '') : owned ? 'Yours to wear.' : '';
    const txt = el('div', 'txt', `<div class="nm">${item.name}</div><div class="bl">${owned ? blurb : `<span class="src">${ICON.lock.replace(/#fff/g, '#c46a0a')}${item.source}</span>`}</div>`);
    let action: HTMLElement;
    if (owned) {
      const wearing = equipped === item.id;
      action = btn(wearing ? `${ICON.check}<span>Equipped</span>` : `<span>Equip</span>`, `small wd-equip${wearing ? ' on' : ''}`, () => this.h.equip(slot, item.id));
      if (wearing) (action as HTMLButtonElement).disabled = true;
    } else if (slot === 'bodies' && (CRAB_ORDER as readonly string[]).includes(item.id) && !SKILL_UNLOCKS[item.id]) {
      const price = crabPrice(item.id);
      const can = save.shells >= price;
      action = btn(`<span class="price">${ICON.shell}${fmt(price)}</span>`, `small ${can ? '' : 'blue'}`, () => this.h.buyCrab(item.id), `Buy ${item.name} for ${price} shells`);
      if (!can) (action as HTMLButtonElement).disabled = true;
    } else {
      action = el('div', 'w-lock', ICON.lock);
    }
    const rnd = btn(`${DICE_ICON}<span>Randomize Owned</span>`, 'ghost wd-random surprise', () => this.h.surprise(), 'Wear a random outfit from what you own');
    d.append(txt, rnd, action);
    if (slot === 'hats' && owned && item.id !== 'none') {
      const owns = save.dyes[item.id] ?? [];
      const worn = save.hatDye[item.id] ?? 0;
      const sw = el('div', 'dyes');
      sw.setAttribute('aria-label', 'Hat colours');
      for (let n = 0; n < 4; n++) {
        const have = n === 0 || owns.includes(n);
        const [a, b] = DYE_COLORS[n] as [string, string];
        const dbtn = el('button', `dye${have ? '' : ' locked'}${worn === n ? ' on' : ''}`, have ? '' : `<span class="dye-cost">${DYE_COST}</span>`) as HTMLButtonElement;
        dbtn.type = 'button';
        dbtn.style.background = `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;
        dbtn.setAttribute('aria-label', n === 0 ? 'Original colours' : have ? `Dye ${n}` : `Buy dye ${n} for ${DYE_COST} pearls`);
        dbtn.disabled = !have && save.pearls < DYE_COST;
        dbtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.h.dye(item.id, n);
        });
        sw.appendChild(dbtn);
      }
      d.appendChild(sw);
    }
    if (slot === 'dances') {
      const again = btn(ICON.restart, 'icon small blue', () => this.h.preview('dances', item.id), 'Play the dance again');
      d.insertBefore(again, action);
    }
    this.foot.appendChild(d);
  }

  /** the outfit slots: wear a saved look, or save the current one */
  private fillOutfitSheet(save: SaveData): void {
    const bar = el('div', 'outfits sheet-outfits');
    save.outfits.forEach((o, i) => {
      const slot = el('span', `of-slot${o ? ' saved' : ''}`);
      const wear = el('button', 'of-wear', o ? `<b>${i + 1}</b>` : `<b>${i + 1}</b><small>empty</small>`) as HTMLButtonElement;
      wear.type = 'button';
      wear.disabled = !o;
      wear.setAttribute('aria-label', o ? `Wear outfit ${i + 1}` : `Outfit ${i + 1} is empty`);
      wear.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.outfit(i);
      });
      const sv = el('button', 'of-save', `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 6h18l6 6v22H9z" fill="#fff"/><rect x="14" y="8" width="11" height="8" fill="#1e5e8c"/><rect x="14" y="22" width="14" height="9" rx="2" fill="#1e5e8c"/></svg>`) as HTMLButtonElement;
      sv.type = 'button';
      sv.setAttribute('aria-label', `Save the current look as outfit ${i + 1}`);
      sv.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.saveOutfit(i);
      });
      const lbl = el('span', 'of-desc', o ? `${nameOf('bodies', o.body)} · ${nameOf('hats', o.hat)}` : 'Save your current look here');
      slot.append(wear, lbl, sv);
      bar.appendChild(slot);
    });
    this.outfitSheet.body.innerHTML = '';
    this.outfitSheet.body.appendChild(bar);
  }

  private renderUpgrades(save: SaveData): void {
    for (const kind of ['magnet', 'shield', 'rider'] as PowerKind[]) {
      const lvl = save.upgrades[kind];
      const cost = upgradeCost(lvl);
      const card = el('div', 'up-card');
      const pips = Array.from({ length: CFG.upgradeCosts.length }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const now = powerDuration(kind, lvl);
      const next = cost !== null ? powerDuration(kind, lvl + 1) : null;
      card.innerHTML = `<div class="ic">${ICON[kind]}</div><div class="txt"><div class="nm">${UP_INFO[kind].name}</div><div class="ds">${UP_INFO[kind].desc}</div><div class="pips">${pips}</div><div class="dur">${next !== null ? `${now}s → <b>${next}s</b>` : `Max level · ${now}s`}</div></div>`;
      if (cost !== null) {
        const can = save.shells >= cost;
        const b = btn(`<span class="price">${ICON.shell}${fmt(cost)}</span>`, `small ${can ? '' : 'blue'}`, () => this.h.buyUpgrade(kind), `Upgrade ${UP_INFO[kind].name} for ${cost} shells`);
        b.disabled = !can;
        card.appendChild(b);
      } else {
        card.appendChild(el('div', '', `<span style="font-family:var(--font-display);color:#3fbf55;font-size:20px">MAX</span>`));
      }
      this.body.appendChild(card);
    }
  }
}

const DRAG_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="13" y="6" width="14" height="24" rx="7" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M20 10v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M8 33c-3-2-4-4-4-6M32 33c3-2 4-4 4-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M4 33h5v-5M36 33h-5v-5" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>`;
const RESET_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M31 20a11 11 0 1 1-4-8.5" stroke="#1a84dc" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M29 5l1 8-8 1" stroke="#1a84dc" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DICE_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4l14 8v16l-14 8-14-8V12z" fill="#e6f8fa" stroke="#10a2b4" stroke-width="2.5" stroke-linejoin="round"/><path d="M6 12l14 8 14-8M20 20v16" stroke="#10a2b4" stroke-width="2.5"/><circle cx="20" cy="12" r="2" fill="#10a2b4"/><circle cx="13" cy="22" r="2" fill="#10a2b4"/><circle cx="27" cy="28" r="2" fill="#10a2b4"/></svg>`;
const OUTFIT_ICO = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 6l6 4 6-4 9 6-4 7-4-2v17H13V17l-4 2-4-7z" fill="#fff"/></svg>`;
function nameOf(slot: Slot, id: string): string {
  return ITEMS.find((i) => i.slot === slot && i.id === id)?.name ?? id;
}

function order(id: string): number {
  const i = (CRAB_ORDER as readonly string[]).indexOf(id);
  return i < 0 ? 100 : i;
}
