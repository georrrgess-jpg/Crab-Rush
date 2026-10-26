import { MAX_BOOSTS, PASS_REWARDS, type Reward } from '../meta/pass';
import { ITEM_BY_ID } from '../meta/wardrobe';
import { PASS_TIERS } from '../meta/xp';
import { btn, el, fmt } from './dom';
import { BOOST_SVG, DANCE_SVG, ICON, TRAIL_SVG } from './icons';

export interface PassData {
  tier: number;
  into: number;
  need: number;
  claimed: number[];
  boosts: number;
  /** portraits from the Wardrobe (may still be empty) */
  thumbs: { bodies: Record<string, string>; hats: Record<string, string> };
}

export interface PassHandlers {
  back(): void;
  claim(tier: number): void;
  claimAll(): void;
}

const SLOT_LABEL: Record<string, string> = { bodies: 'Crab', hats: 'Hat', trails: 'Trail', dances: 'Dance' };

/** Name + art for a reward tile. */
export function rewardView(r: Reward, thumbs: PassData['thumbs']): { name: string; kind: string; art: string } {
  if (r.kind === 'shells') return { name: `${fmt(r.amount)} shells`, kind: 'Shells', art: `<span class="rw-shells">${ICON.shell}</span>` };
  if (r.kind === 'boost') return { name: 'Golden Shell', kind: '2× shells for a run', art: `<span class="rw-boost">${BOOST_SVG}</span>` };
  const item = ITEM_BY_ID.get(`${r.slot}:${r.id}`);
  const name = item?.name ?? r.id;
  let art = '';
  if (r.slot === 'trails') art = TRAIL_SVG[r.id] ?? '';
  else if (r.slot === 'dances') art = DANCE_SVG[r.id] ?? '';
  else {
    const src = r.slot === 'bodies' ? thumbs.bodies[r.id] : thumbs.hats[r.id];
    art = src ? `<img alt="" src="${src}">` : ICON.crab;
  }
  return { name, kind: SLOT_LABEL[r.slot] ?? '', art: `<span class="rw-item">${art}</span>` };
}

/**
 * The Sunny Pass track (UPDATE2_PLAN.md §6.1): 40 free tiers on a horizontal road. Reached tiers
 * glow until claimed; item tiers are bigger gold cards. Claim one or claim all.
 */
export class PassScreen {
  readonly el: HTMLElement;
  private track: HTMLElement;
  private head: HTMLElement;
  private all: HTMLButtonElement;
  private boosts: HTMLElement;
  private next: HTMLElement;
  private data: PassData | null = null;

  constructor(private h: PassHandlers) {
    this.el = el('div', 'screen page pass');
    this.el.id = 'pass';
    const card = el('div', 'page-card wide pass-card');
    const top = el('div', 'page-head');
    this.boosts = el('span', 'pass-boosts');
    top.append(btn(ICON.back, 'icon ghost back', () => this.h.back(), 'Back'), el('h2', '', 'Sunny Pass'), this.boosts);
    const body = el('div', 'page-body pass-body');
    this.head = el('div', 'pass-hero');
    this.all = btn(`${ICON.check}<span>Claim all</span>`, 'green small pass-all', () => this.h.claimAll());
    this.next = el('div', 'pass-next');
    this.track = el('div', 'pass-track');
    this.track.setAttribute('role', 'list');
    // vertical wheel scrolls the track sideways on desktop
    this.track.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          this.track.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
    const how = el(
      'div',
      'pass-how',
      `<b>Earn XP in every mode</b><span>${ICON.flag}Run distance</span><span>${ICON.shell}Shells</span><span>${ICON.trophy}Goals</span><span>${ICON.star}Island stars</span><span>${ICON.calendar}Daily Tide</span>`,
    );
    const heroRow = el('div', 'pass-hero-row');
    heroRow.append(this.head, this.all);
    body.append(heroRow, this.next, this.track, how);
    card.append(top, body);
    this.el.append(el('div', 'page-dim'), card);
  }

  render(d: PassData, scroll = true): void {
    this.data = d;
    const claimable = Array.from({ length: d.tier }, (_, i) => i + 1).filter((t) => !d.claimed.includes(t));
    const frac = d.tier >= PASS_TIERS ? 1 : d.into / Math.max(1, d.need);
    this.head.innerHTML = `<span class="ph-tier"><span class="sunico">${ICON.sun}</span><b>${d.tier}</b></span><span class="ph-col"><span class="ph-lbl">Tier ${d.tier} of ${PASS_TIERS}</span><span class="bar"><i style="width:${Math.round(frac * 100)}%"></i></span><span class="ph-xp">${d.tier >= PASS_TIERS ? 'Pass complete!' : `${fmt(d.into)} / ${fmt(d.need)} XP to tier ${d.tier + 1}`}</span></span>`;
    this.all.disabled = claimable.length === 0;
    this.all.classList.toggle('hidden', claimable.length < 2);
    this.boosts.innerHTML = `${BOOST_SVG}<b>${d.boosts}</b>/${MAX_BOOSTS}`;
    this.boosts.title = 'Golden Shells: 2× shells for one run';
    // the next big reward
    const nextItem = PASS_REWARDS.findIndex((r, i) => i + 1 > d.tier && r.kind === 'item');
    if (nextItem >= 0) {
      const v = rewardView(PASS_REWARDS[nextItem] as Reward, d.thumbs);
      const left = nextItem + 1 - d.tier;
      this.next.innerHTML = `<span class="pn-art">${v.art}</span><span>Next big reward: <b>${v.name}</b> ${left === 1 ? 'at the next tier' : `in ${left} tiers`}</span>`;
      this.next.classList.remove('hidden');
    } else this.next.classList.add('hidden');

    this.track.innerHTML = '';
    let focus: HTMLElement | null = null;
    PASS_REWARDS.forEach((r, i) => {
      const t = i + 1;
      const reached = t <= d.tier;
      const claimed = d.claimed.includes(t);
      const v = rewardView(r, d.thumbs);
      const big = r.kind === 'item';
      const c = el('div', `pt${big ? ' big' : ''}${claimed ? ' claimed' : reached ? ' ready' : ' locked'}${t === d.tier + 1 ? ' current' : ''}`);
      c.setAttribute('role', 'listitem');
      c.dataset.tier = String(t);
      c.innerHTML = `<span class="pt-num">${t}</span><span class="pt-art">${v.art}</span><span class="pt-name">${v.name}</span><span class="pt-kind">${v.kind}</span>`;
      if (claimed) c.insertAdjacentHTML('beforeend', `<span class="pt-ok">${ICON.check}</span>`);
      else if (reached) {
        const b = btn('Claim', 'small green pt-claim', () => this.h.claim(t), `Claim tier ${t}: ${v.name}`);
        c.appendChild(b);
        if (!focus) focus = c;
      } else c.insertAdjacentHTML('beforeend', `<span class="pt-lock">${ICON.lock}</span>`);
      if (!focus && t === d.tier + 1) focus = c;
      this.track.appendChild(c);
    });
    if (scroll) {
      const f = focus as HTMLElement | null;
      requestAnimationFrame(() => {
        if (!f) return;
        this.track.scrollLeft = Math.max(0, f.offsetLeft - this.track.clientWidth * 0.3);
      });
    }
  }

  /** burst animation on a just-claimed tier */
  burst(tier: number): void {
    const c = this.track.querySelector(`[data-tier="${tier}"]`);
    if (!c) return;
    c.classList.remove('burst');
    void (c as HTMLElement).offsetWidth;
    c.classList.add('burst');
  }

  get current(): PassData | null {
    return this.data;
  }
}
