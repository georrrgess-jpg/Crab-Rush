import { CFG } from '../config';
import type { SaveData } from '../core/save';
import { CRAB_ORDER, SKILL_UNLOCKS, crabPrice, powerDuration, upgradeCost } from '../sim/economy';
import type { PowerKind } from '../sim/events';
import type { CrabSkin } from '../render/models/crab';
import { btn, el, fmt } from './dom';
import { ICON } from './icons';

export interface ShopHandlers {
  back(): void;
  preview(id: string): void;
  select(id: string): void;
  buyCrab(id: string): void;
  buyUpgrade(kind: PowerKind): void;
}

const UP_INFO: Record<PowerKind, { name: string; desc: string }> = {
  magnet: { name: 'Shell Magnet', desc: 'Pulls nearby shells toward you.' },
  shield: { name: 'Bubble Shield', desc: 'Absorbs one crash.' },
  rider: { name: 'Wave Rider', desc: 'Surf over everything, collecting shells in every lane.' },
};

export class ShopScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private balance: HTMLElement;
  private tabBtns: HTMLButtonElement[] = [];
  private tab: 'crabs' | 'upgrades' = 'crabs';
  private previewId = 'sandy';
  thumbs: string[] = [];

  constructor(private skins: CrabSkin[], private h: ShopHandlers) {
    this.el = el('div', 'screen');
    this.el.id = 'shop';
    const top = el('div', 'top-bar');
    const back = btn(ICON.back, 'blue round', () => this.h.back(), 'Back');
    const title = el('h2', '', 'Crabs');
    this.balance = el('div', 'pill', `<span class="ico">${ICON.shell}</span><b>0</b>`);
    top.append(back, title, this.balance);
    const stage = el('div', 'shop-stage');
    const panel = el('div', 'panel shop-panel');
    const tabs = el('div', 'tabs');
    for (const [id, label] of [['crabs', 'Crabs'], ['upgrades', 'Upgrades']] as const) {
      const b = el('button', '', label) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => {
        this.tab = id;
        this.render(this.last as SaveData);
      });
      this.tabBtns.push(b);
      tabs.appendChild(b);
    }
    this.body = el('div', 'shop-body');
    panel.append(tabs, this.body);
    this.el.append(top, stage, panel);
  }

  private last: SaveData | null = null;

  open(save: SaveData): void {
    this.previewId = save.crabs.selected;
    this.render(save);
  }

  render(save: SaveData): void {
    this.last = save;
    (this.balance.querySelector('b') as HTMLElement).textContent = fmt(save.shells);
    this.tabBtns[0]!.classList.toggle('on', this.tab === 'crabs');
    this.tabBtns[1]!.classList.toggle('on', this.tab === 'upgrades');
    this.body.innerHTML = '';
    if (this.tab === 'crabs') this.renderCrabs(save);
    else this.renderUpgrades(save);
  }

  private renderCrabs(save: SaveData): void {
    const grid = el('div', 'crab-grid');
    CRAB_ORDER.forEach((id, i) => {
      const skin = this.skins.find((s) => s.id === id) as CrabSkin;
      const owned = save.crabs.owned.includes(id);
      const selected = save.crabs.selected === id;
      const t = el('button', `tile${owned ? ' owned' : ' locked'}${selected ? ' selected' : ''}${this.previewId === id ? ' preview' : ''}`) as HTMLButtonElement;
      t.type = 'button';
      t.setAttribute('aria-label', `${skin.name}${owned ? (selected ? ', wearing' : ', owned') : ', locked'}`);
      const img = this.thumbs[i] ? `<img alt="" src="${this.thumbs[i]}">` : '';
      let badge = '';
      if (selected) badge = `<span class="badge ok">${ICON.check}</span>`;
      else if (!owned) badge = SKILL_UNLOCKS[id] ? `<span class="badge lock">${ICON.lock}</span>` : `<span class="badge">${ICON.shell}${fmt(crabPrice(id))}</span>`;
      t.innerHTML = `${img}${badge}<span class="nm">${skin.name}</span>`;
      t.addEventListener('click', () => {
        this.previewId = id;
        this.h.preview(id);
        if (owned && !selected) this.h.select(id);
        else this.render(save);
      });
      grid.appendChild(t);
    });
    this.body.appendChild(grid);

    // detail + action for the previewed crab
    const id = this.previewId;
    const skin = this.skins.find((s) => s.id === id) as CrabSkin;
    const owned = save.crabs.owned.includes(id);
    const d = el('div', 'crab-detail');
    const txt = el('div', 'txt', `<div class="nm">${skin.name}</div><div class="bl">${skin.blurb}</div>`);
    let action: HTMLElement;
    if (owned) {
      const wearing = save.crabs.selected === id;
      action = btn(wearing ? 'Wearing' : 'Wear', `small ${wearing ? 'blue' : 'green'}`, () => this.h.select(id));
      if (wearing) (action as HTMLButtonElement).disabled = true;
    } else if (SKILL_UNLOCKS[id]) {
      action = el('div', 'bl', `${ICON.lock.replace('#fff', '#1e5e8c')}`);
      action = el('div', '', `<span class="bl" style="color:#c46a0a;font-family:var(--font-display)">${SKILL_UNLOCKS[id]!.text}</span>`);
    } else {
      const price = crabPrice(id);
      const can = save.shells >= price;
      action = btn(`<span class="price">${ICON.shell}${fmt(price)}</span>`, `small ${can ? '' : 'blue'}`, () => this.h.buyCrab(id), `Buy ${skin.name} for ${price} shells`);
      if (!can) (action as HTMLButtonElement).disabled = true;
    }
    d.append(txt, action);
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
