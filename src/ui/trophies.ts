/**
 * Trophy Shelf (moved out of Crab Cove in Update 5): 36 trophies in 12 families and the profile
 * titles they unlock.
 */
import { FAMILIES, TIER_NAMES } from '../meta/achievements';
import { el } from './dom';
import { ICON } from './icons';
import { Wallet, pageHead } from './kit';

const MEDAL = ['#cd7f32', '#c0c8d0', '#ffd23a'];

export interface TrophyData {
  earned: string[];
  /** the metric value per family id */
  progress: Record<string, number>;
  titles: string[];
  title: string;
  shells: number;
  pearls: number;
}

export class TrophyScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private wallet = new Wallet();

  constructor(private h: { back(): void; title(t: string): void }) {
    this.el = el('div', 'screen page trophies');
    this.el.id = 'trophies';
    const card = el('div', 'page-card wide');
    const { head } = pageHead('Trophies', () => this.h.back(), [this.wallet.el]);
    this.body = el('div', 'page-body tr-body');
    card.append(head, this.body);
    this.el.append(el('div', 'page-dim'), card);
  }

  render(d: TrophyData): void {
    this.wallet.set(d.shells, d.pearls);
    this.body.innerHTML = '';
    const titles = el('div', 'title-pick', `<span class="tp-lbl">Your title</span>`);
    if (d.titles.length === 0) titles.appendChild(el('span', 'tp-none', 'Earn a gold trophy to unlock a title'));
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
    shelf.appendChild(el('div', 'ts-count', `${ICON.trophy}<b>${d.earned.length}</b>/${FAMILIES.length * 3} trophies`));
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
}
