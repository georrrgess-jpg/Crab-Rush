/**
 * Treasure Dig screen (UPDATE5_PLAN.md §3): a sand grid to dig with spades, hot/cold hints, three
 * relics per site, a site chest and the Relic Museum.
 */
import { COLS, RELIC_SETS, RELIC_TOTAL, ROWS, SITE_THEMES, TILES, type DigResult, type DigState, type DugTile, generateSite, heat, relicId, siteReward } from '../meta/dig';
import { btn, el, fmt } from './dom';
import { ICON } from './icons';
import { PEARL_ICO, Sheet, Wallet, pageHead } from './kit';
import { flyReward, reduced } from './motion';

export const DIG_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M24.5 6.5l9 9-3 3-9-9z" fill="#ffd23a" stroke="#8a5a10" stroke-width="2" stroke-linejoin="round"/><path d="M26 14L12 28" stroke="#8a4a1e" stroke-width="4" stroke-linecap="round"/><path d="M7 25l8 8-4 3c-3 1-6-2-5-5z" fill="#cfd8e0" stroke="#5a6a7a" stroke-width="2" stroke-linejoin="round"/></svg>`;
const DYNAMITE = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="10" y="14" width="20" height="20" rx="4" fill="#ff4a3a" stroke="#8a1a10" stroke-width="2"/><path d="M10 21h20M10 27h20" stroke="#ffd0c0" stroke-width="2"/><path d="M20 14c0-5 4-6 7-8" stroke="#5a3a1a" stroke-width="2.5" fill="none"/><circle cx="28" cy="6" r="3.5" fill="#ffd23a"/></svg>`;
const HEAT_ICON = {
  hot: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4c2 8 10 11 10 21a10 10 0 0 1-20 0c0-5 3-8 5-10 0 4 2 6 4 6-1-6 1-12 1-17z" fill="#ff4a3a"/><path d="M20 22c1 3 5 4 5 8a5 5 0 0 1-10 0c0-3 3-5 5-8z" fill="#ffc93a"/></svg>`,
  warm: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="#ff9a1f" stroke-width="4.5" fill="none" stroke-linecap="round"><path d="M7 13c4-4 8 4 13 0s9 4 13 0"/><path d="M7 21c4-4 8 4 13 0s9 4 13 0"/><path d="M7 29c4-4 8 4 13 0s9 4 13 0"/></g></svg>`,
  cold: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4c5 8 11 14 11 21a11 11 0 0 1-22 0c0-7 6-13 11-21z" fill="#2fa6ea"/><ellipse cx="15.5" cy="25" rx="3" ry="5" fill="#bfe8ff"/></svg>`,
};
const HALL_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 14L20 5l16 9z" fill="#fff"/><rect x="6" y="15" width="28" height="3" fill="#fff"/><g fill="#fff"><rect x="8" y="19" width="4" height="12"/><rect x="15" y="19" width="4" height="12"/><rect x="22" y="19" width="4" height="12"/><rect x="29" y="19" width="4" height="12"/></g><rect x="5" y="32" width="30" height="4" rx="1" fill="#fff"/></svg>`;
/** the site card's illustration: an open chest of gold on the sand */
const CHEST_ART = `<svg viewBox="0 0 220 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="dgs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fdcff"/><stop offset="1" stop-color="#e8f7ff"/></linearGradient></defs><rect width="220" height="130" fill="url(#dgs)"/><path d="M150 70l18-26 12 6 14-16 26 36z" fill="#7a8494"/><rect x="186" y="26" width="8" height="18" fill="#fff"/><rect x="186" y="32" width="8" height="4" fill="#e8432a"/><path d="M0 74h220v16H0z" fill="#3fc6ea"/><path d="M0 86c50-10 160-12 220 0v44H0z" fill="#f6dda6"/><path d="M14 92c-2-22 4-40 12-52" stroke="#8a5a2a" stroke-width="4" fill="none"/><path d="M26 40c-10-6-22-2-26 4 9-2 18 0 26 3zm0 0c2-10 12-14 20-12-7 3-12 8-16 15z" fill="#3fae4f"/><g class="dc-chest"><path d="M70 120l6-38h70l6 38z" fill="#a8743f" stroke="#5a3a1a" stroke-width="3"/><path d="M76 82c0-26 70-26 70 0z" fill="#c98a4a" stroke="#5a3a1a" stroke-width="3" transform="rotate(-18 76 82)"/><path d="M78 84h66l-3 10H81z" fill="#ffc93a"/><circle cx="96" cy="84" r="9" fill="#ffd23a" stroke="#c4840a" stroke-width="2"/><circle cx="118" cy="80" r="11" fill="#ffd23a" stroke="#c4840a" stroke-width="2"/><circle cx="136" cy="86" r="8" fill="#ffd23a" stroke="#c4840a" stroke-width="2"/><path d="M114 75v10M110 80h8" stroke="#c4840a" stroke-width="2"/><rect x="104" y="94" width="14" height="14" rx="3" fill="#ffd23a" stroke="#8a5a10" stroke-width="2"/><path d="M70 104h82" stroke="#5a3a1a" stroke-width="3"/></g><path d="M160 116l6-6 6 6-6 6z" fill="#ff7a3a"/><circle class="dc-glint" cx="122" cy="70" r="4" fill="#fff"/></svg>`;

/** relic art: a gem-studded artefact tinted per set */
const RELIC_HUES = [42, 200, 320, 28, 190, 150, 12, 48, 230, 260, 6, 50];
export function relicSvg(set: number, i: number, found = true): string {
  const h = RELIC_HUES[set % RELIC_HUES.length] as number;
  const fill = found ? `hsl(${h} 85% 58%)` : '#c9b48a';
  const dark = found ? `hsl(${h} 70% 32%)` : '#9a8458';
  const gem = found ? `hsl(${(h + 180) % 360} 90% 65%)` : '#b3a070';
  const shapes = [
    `<circle cx="20" cy="20" r="13" fill="${fill}" stroke="${dark}" stroke-width="3"/><circle cx="20" cy="20" r="6" fill="${gem}"/>`,
    `<path d="M20 4l14 10-5 20H11L6 14z" fill="${fill}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/><path d="M20 12l6 5-2 8h-8l-2-8z" fill="${gem}"/>`,
    `<path d="M8 30l4-18 8 8 8-8 4 18z" fill="${fill}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/><circle cx="20" cy="26" r="3.5" fill="${gem}"/><circle cx="12" cy="11" r="2.5" fill="${gem}"/><circle cx="28" cy="11" r="2.5" fill="${gem}"/>`,
  ];
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${shapes[i % 3]}</svg>`;
}

export interface DigData {
  st: DigState;
  shells: number;
  pearls: number;
}

export interface DigHandlers {
  back(): void;
  dig(i: number): void;
  play(): void;
}

/** Treasure Dig: the grid, its hints, the relic tracker and the museum. */
export class DigScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private grid: HTMLElement;
  private info: HTMLElement;
  private wallet = new Wallet();
  private spadeChip: HTMLElement;
  private actions: HTMLElement;
  private museum: Sheet;
  private tiles: HTMLButtonElement[] = [];
  private data: DigData | null = null;
  private busy = false;

  constructor(private h: DigHandlers) {
    this.el = el('div', 'screen page dig');
    this.el.id = 'dig';
    const card = el('div', 'page-card wide dig-card');
    this.spadeChip = el('div', 'spade-chip', `${DIG_ICON}<b>0</b>`);
    this.spadeChip.setAttribute('aria-label', 'Spades');
    const { head } = pageHead('Treasure Dig', () => this.h.back(), [this.spadeChip, this.wallet.el]);
    this.body = el('div', 'page-body dig-body');
    // left: the site card, relics found, the site reward, Museum and Play (UPDATE6_PLAN.md §2)
    this.info = el('div', 'dig-side');
    const main = el('div', 'dig-main');
    const field = el('div', 'dig-field');
    field.innerHTML = '<i class="rope r1"></i><i class="rope r2"></i><i class="rope r3"></i><i class="rope r4"></i>';
    this.grid = el('div', 'dig-grid');
    this.grid.style.setProperty('--cols', String(COLS));
    this.grid.style.setProperty('--rows', String(ROWS));
    for (let i = 0; i < TILES; i++) {
      const t = el('button', 'dt') as HTMLButtonElement;
      t.type = 'button';
      t.dataset.i = String(i);
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.busy) this.h.dig(i);
      });
      this.tiles.push(t);
      this.grid.appendChild(t);
    }
    field.appendChild(this.grid);
    const legend = el('div', 'dig-legend', `<span class="dl-hint">Choose a tile to dig · 1 spade per dig</span><span class="dl-keys"><span class="hl hot">${HEAT_ICON.hot}<b>Hot:</b> very close</span><span class="hl warm">${HEAT_ICON.warm}<b>Warm:</b> nearby</span><span class="hl cold">${HEAT_ICON.cold}<b>Cold:</b> farther away</span></span>`);
    main.append(field, legend);
    this.body.append(this.info, main);
    this.actions = el('div', 'dig-side-btns');
    card.append(head, this.body);
    this.museum = new Sheet('museum-sheet');
    this.el.append(el('div', 'page-dim'), card, this.museum.el);
  }

  render(d: DigData): void {
    this.data = d;
    const st = d.st;
    this.wallet.set(d.shells, d.pearls);
    (this.spadeChip.querySelector('b') as HTMLElement).textContent = String(st.spades);
    this.spadeChip.classList.toggle('empty', st.spades === 0);
    const site = generateSite(st.site);
    const set = (st.site - 1) % RELIC_SETS.length;
    const rw = siteReward(st.site);
    // relic tracker: found relics glow, the others are sand-coloured outlines
    const relics = [0, 1, 2]
      .map((ri) => {
        const cells = site.relic.map((r, k) => (r === ri ? k : -1)).filter((k) => k >= 0);
        const got = cells.filter((k) => st.dug.includes(k)).length;
        const done = got === cells.length;
        return `<span class="rl${done ? ' got' : ''}" title="${RELIC_SETS[set]!.relics[ri]}"><span class="rl-art">${relicSvg(set, ri, done)}</span><span class="rl-pips">${cells.map((_, k) => `<i class="${k < got ? 'on' : ''}"></i>`).join('')}</span></span>`;
      })
      .join('');
    const theme = SITE_THEMES[(st.site - 1) % SITE_THEMES.length];
    const found = [0, 1, 2].filter((ri) => site.relic.every((r, k) => r !== ri || st.dug.includes(k))).length;
    this.info.innerHTML = `<div class="dig-site-card"><span class="ds-art">${CHEST_ART}</span><span class="ds-col"><span class="ds-n">Site ${st.site}</span><span class="ds-theme">${theme} · ${RELIC_SETS[set]!.name}</span></span></div>
      <div class="dig-box dig-relics-box"><span class="db-t">Relics found <b>${found}/3</b></span><div class="dig-relics">${relics}</div></div>
      <div class="dig-box dig-reward-box"><span class="db-t">Site reward</span><div class="dig-rw"><span>${ICON.shell}<b>${fmt(rw.shells)}</b></span><span>${PEARL_ICO}<b>${rw.pearls}</b></span>${rw.boosts ? `<span class="dr-x">+ Golden Shell</span>` : ''}${rw.item ? `<span class="dr-x">+ Pearl crab!</span>` : ''}</div></div>`;
    for (let i = 0; i < TILES; i++) this.paintTile(i, site, st.dug, false);
    this.grid.classList.toggle('out', st.spades === 0);
    // the Museum, and a way to earn spades
    this.actions.innerHTML = '';
    const museum = btn(`${ICON.trophy}<span class="dm-col">Museum<small>${st.relics.length}/${RELIC_TOTAL}</small></span><span class="dm-hall">${HALL_ICON}</span>`, 'blue big dig-museum', () => this.openMuseum(), `Relic Museum: ${st.relics.length} of ${RELIC_TOTAL}`);
    const play = btn(`${ICON.play}<span>${st.spades === 0 ? 'Play for spades' : 'Play'}</span>`, `dig-play${st.spades === 0 ? ' glow' : ''}`, () => this.h.play(), st.spades === 0 ? 'Play a run to earn spades' : 'Play a run');
    this.actions.append(museum, play);
    this.info.appendChild(this.actions);
  }

  private paintTile(i: number, site: ReturnType<typeof generateSite>, dug: readonly number[], fresh: boolean): void {
    const t = this.tiles[i] as HTMLButtonElement;
    const isDug = dug.includes(i);
    const kind = site.kind[i];
    t.className = `dt${isDug ? ' dug' : ''}${fresh ? ' fresh' : ''}`;
    t.disabled = isDug;
    t.style.setProperty('--d', String(((i % COLS) + Math.floor(i / COLS)) * 0.02));
    if (!isDug) {
      t.innerHTML = '<span class="dt-sand"></span>';
      t.setAttribute('aria-label', `Dig tile ${i + 1}`);
      return;
    }
    const h = kind === 'relic' ? 'relic' : heat(site, dug, i);
    t.classList.add(`h-${h}`, `k-${kind}`);
    const set = (site.n - 1) % RELIC_SETS.length;
    const amt = site.amount[i] as number;
    let inner = '';
    if (kind === 'relic') inner = `<span class="dt-ico relic">${relicSvg(set, site.relic[i] as number, true)}</span>`;
    else if (kind === 'shells') inner = `<span class="dt-ico">${ICON.shell}</span><b>${amt}</b>`;
    else if (kind === 'pearls') inner = `<span class="dt-ico">${PEARL_ICO}</span><b>${amt}</b>`;
    else if (kind === 'spade') inner = `<span class="dt-ico">${DIG_ICON}</span><b>+${amt}</b>`;
    else if (kind === 'dynamite') inner = `<span class="dt-ico">${DYNAMITE}</span>`;
    if (kind === 'empty') inner = `<span class="dt-heat">${HEAT_ICON[h as 'hot' | 'warm' | 'cold']}<b>${h === 'hot' ? 'Hot' : h === 'warm' ? 'Warm' : 'Cold'}</b></span>`;
    t.innerHTML = `<span class="dt-hole"></span>${inner}`;
    t.setAttribute('aria-label', kind === 'empty' ? `${h} hole` : `${kind} ${amt || ''}`.trim());
  }

  /** play a dig: tiles pop open in order (dynamite blasts outward), prizes fly to the wallet */
  animate(r: DigResult, before: DigState, done: () => void): void {
    if (!this.data) return done();
    const site = generateSite(before.site);
    const dugSoFar = [...before.dug];
    this.busy = true;
    const fast = reduced();
    r.tiles.forEach((d: DugTile, k) => {
      setTimeout(
        () => {
          dugSoFar.push(d.i);
          this.paintTile(d.i, site, dugSoFar, true);
          const t = this.tiles[d.i] as HTMLElement;
          if (!fast) this.burst(t, d.kind === 'dynamite' ? 14 : 7);
          const tb = t.getBoundingClientRect();
          const from = { x: tb.left + tb.width / 2, y: tb.top + tb.height / 2 };
          if (d.kind === 'shells') flyReward(from, this.wallet.target('shells'), 'shells', Math.min(6, 2 + Math.floor(d.amount / 25)));
          else if (d.kind === 'pearls') flyReward(from, this.wallet.target('pearls'), 'pearls', Math.min(4, d.amount));
          if (d.kind === 'dynamite') this.grid.classList.add('shake');
        },
        fast ? 0 : k === 0 ? 0 : 160 + k * 70,
      );
    });
    setTimeout(
      () => {
        this.grid.classList.remove('shake');
        this.busy = false;
        done();
      },
      fast ? 30 : 260 + r.tiles.length * 70,
    );
  }

  /** a puff of sand grains from a tile (DOM, a handful of nodes, removed when done) */
  private burst(t: HTMLElement, n: number): void {
    const b = t.getBoundingClientRect();
    const host = this.el;
    const hb = host.getBoundingClientRect();
    for (let k = 0; k < n; k++) {
      const g = el('i', 'sand-grain');
      g.style.left = `${b.left - hb.left + b.width / 2}px`;
      g.style.top = `${b.top - hb.top + b.height / 2}px`;
      host.appendChild(g);
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = 26 + Math.random() * 30;
      const anim = g.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r - 18}px)) scale(0.4)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 160, easing: 'cubic-bezier(.2,.7,.4,1)' },
      );
      anim.onfinish = () => g.remove();
    }
  }

  /** The site chest: a celebration card over the grid. */
  celebrate(n: number, lines: string[], next: () => void): void {
    const ov = el('div', 'dig-clear');
    const set = (n - 1) % RELIC_SETS.length;
    ov.innerHTML = `<div class="dcl-card"><div class="dcl-rays"></div><div class="dcl-relics">${[0, 1, 2].map((i) => `<span style="--i:${i}">${relicSvg(set, i, true)}</span>`).join('')}</div>
      <h3>Site ${n} cleared!</h3><p>${RELIC_SETS[set]!.name} complete</p><div class="dcl-rw">${lines.map((l, i) => `<span style="--i:${i}">${l}</span>`).join('')}</div></div>`;
    const go = btn(`${DIG_ICON}<span>Next site</span>`, 'big green', () => {
      ov.remove();
      next();
    });
    (ov.querySelector('.dcl-card') as HTMLElement).appendChild(go);
    this.el.appendChild(ov);
    setTimeout(() => go.focus({ preventScroll: true }), 40);
  }

  /** the museum: every relic set, found pieces in colour */
  private openMuseum(): void {
    const st = this.data?.st;
    if (!st) return;
    const b = this.museum.body;
    b.innerHTML = '';
    b.appendChild(el('div', 'mu-count', `<b>${st.relics.length}</b>/${RELIC_TOTAL} relics · ${st.cleared} sites cleared`));
    const list = el('div', 'mu-list');
    RELIC_SETS.forEach((s, si) => {
      const row = el('div', 'mu-set');
      const items = s.relics
        .map((name, i) => {
          const got = st.relics.includes(`${si}:${i}`);
          return `<span class="mu-r${got ? ' got' : ''}"><span class="mu-art">${relicSvg(si, i, got)}</span><small>${got ? name : '???'}</small></span>`;
        })
        .join('');
      const all = [0, 1, 2].every((i) => st.relics.includes(`${si}:${i}`));
      row.innerHTML = `<span class="mu-name">${s.name}${all ? ' ✓' : ''}</span><span class="mu-items">${items}</span>`;
      list.appendChild(row);
    });
    b.appendChild(list);
    this.museum.show('Relic Museum', () => {});
  }

  /** test/automation helper: an undug tile index (prefers relics when `relic`) */
  pick(relic: boolean): number {
    const st = this.data?.st;
    if (!st) return -1;
    const site = generateSite(st.site);
    for (let i = 0; i < TILES; i++) if (!st.dug.includes(i) && (site.kind[i] === 'relic') === relic) return i;
    return -1;
  }
}

/** a quick reference for relic ids → names (results toasts) */
export function relicName(id: string): string {
  const [s, i] = id.split(':').map(Number) as [number, number];
  return RELIC_SETS[s]?.relics[i] ?? id;
}
export { relicId };
