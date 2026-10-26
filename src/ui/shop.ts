import { CFG } from '../config';
import type { SaveData } from '../core/save';
import { CRAB_ORDER, SKILL_UNLOCKS, crabPrice, powerDuration, upgradeCost } from '../sim/economy';
import type { PowerKind } from '../sim/events';
import { ITEMS, type Item, type Slot, owns } from '../meta/wardrobe';
import type { CrabSkin } from '../render/models/crab';
import { btn, el, fmt } from './dom';
import { DANCE_SVG, ICON, TRAIL_SVG } from './icons';

export interface ShopHandlers {
  back(): void;
  /** show an item on the turntable crab without equipping it */
  preview(slot: Slot, id: string): void;
  equip(slot: Slot, id: string): void;
  buyCrab(id: string): void;
  buyUpgrade(kind: PowerKind): void;
}

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
  private balance: HTMLElement;
  private tabBtns: HTMLButtonElement[] = [];
  private tab: Tab = 'bodies';
  private previewId: Record<Slot, string> = { bodies: 'sandy', hats: 'straw', trails: 'sand', dances: 'clap' };
  private last: SaveData | null = null;
  /** portraits from the renderer (bodies and hats); filled in the background */
  thumbs: { bodies: Record<string, string>; hats: Record<string, string> } = { bodies: {}, hats: {} };

  constructor(private skins: CrabSkin[], private h: ShopHandlers) {
    this.el = el('div', 'screen');
    this.el.id = 'shop';
    const top = el('div', 'top-bar');
    const back = btn(ICON.back, 'blue round', () => this.h.back(), 'Back');
    const title = el('h2', '', 'Wardrobe');
    this.balance = el('div', 'pill', `<span class="ico">${ICON.shell}</span><b>0</b>`);
    top.append(back, title, this.balance);
    const stage = el('div', 'shop-stage');
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
    this.body = el('div', 'shop-body');
    panel.append(tabs, this.body);
    this.el.append(top, stage, panel);
  }

  open(save: SaveData): void {
    const e = save.wardrobe.equipped;
    this.previewId = { bodies: e.body, hats: e.hat, trails: e.trail, dances: e.dance };
    this.render(save);
  }

  render(save: SaveData): void {
    this.last = save;
    (this.balance.querySelector('b') as HTMLElement).textContent = fmt(save.shells);
    for (const b of this.tabBtns) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    this.body.innerHTML = '';
    if (this.tab === 'upgrades') this.renderUpgrades(save);
    else this.renderSlot(save, this.tab);
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
    for (const item of list) {
      const id = item.id;
      const owned = owns(w, slot, id);
      const wearing = equipped === id;
      const t = el('button', `tile${owned ? ' owned' : ' locked'}${wearing ? ' selected' : ''}${this.previewId[slot] === id ? ' preview' : ''}`) as HTMLButtonElement;
      t.type = 'button';
      t.dataset.item = `${slot}:${id}`;
      t.setAttribute('aria-label', `${item.name}${owned ? (wearing ? ', wearing' : ', owned') : `, locked: ${item.source}`}`);
      let badge = '';
      if (wearing) badge = `<span class="badge ok">${ICON.check}</span>`;
      else if (!owned) {
        const buyable = slot === 'bodies' && (CRAB_ORDER as readonly string[]).includes(id) && !SKILL_UNLOCKS[id];
        badge = buyable ? `<span class="badge">${ICON.shell}${fmt(crabPrice(id))}</span>` : `<span class="badge lock">${ICON.lock}</span>`;
      }
      t.innerHTML = `${this.art(slot, id)}${badge}<span class="nm">${item.name}</span>`;
      t.addEventListener('click', () => {
        this.previewId[slot] = id;
        this.h.preview(slot, id);
        if (owned && !wearing) this.h.equip(slot, id);
        else this.render(save);
      });
      grid.appendChild(t);
    }
    this.body.append(count, grid);

    // detail + action for the previewed item
    const id = this.previewId[slot];
    const item = list.find((i) => i.id === id) ?? (list[0] as Item);
    const owned = owns(w, slot, item.id);
    const d = el('div', 'crab-detail');
    const blurb = slot === 'bodies' ? (this.skins.find((s) => s.id === item.id)?.blurb ?? '') : owned ? 'Yours to wear.' : '';
    const txt = el('div', 'txt', `<div class="nm">${item.name}</div><div class="bl">${owned ? blurb : `<span class="src">${ICON.lock.replace(/#fff/g, '#c46a0a')}${item.source}</span>`}</div>`);
    let action: HTMLElement;
    if (owned) {
      const wearing = equipped === item.id;
      action = btn(wearing ? 'Wearing' : 'Wear', `small ${wearing ? 'blue' : 'green'}`, () => this.h.equip(slot, item.id));
      if (wearing) (action as HTMLButtonElement).disabled = true;
    } else if (slot === 'bodies' && (CRAB_ORDER as readonly string[]).includes(item.id) && !SKILL_UNLOCKS[item.id]) {
      const price = crabPrice(item.id);
      const can = save.shells >= price;
      action = btn(`<span class="price">${ICON.shell}${fmt(price)}</span>`, `small ${can ? '' : 'blue'}`, () => this.h.buyCrab(item.id), `Buy ${item.name} for ${price} shells`);
      if (!can) (action as HTMLButtonElement).disabled = true;
    } else {
      action = el('div', 'w-lock', ICON.lock);
    }
    d.append(txt, action);
    if (slot === 'dances') {
      const again = btn(ICON.restart, 'icon small blue', () => this.h.preview('dances', item.id), 'Play the dance again');
      d.insertBefore(again, action);
    }
    this.body.appendChild(d);
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

function order(id: string): number {
  const i = (CRAB_ORDER as readonly string[]).indexOf(id);
  return i < 0 ? 100 : i;
}
