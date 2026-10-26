import { btn, el, fmt } from './dom';
import { ICON } from './icons';

/** Island Hop screens (UPDATE2_PLAN.md §4.3): the island map, the level intro and the level end. */

export interface MapLevel {
  id: string;
  index: number;
  name: string;
  chase: boolean;
  stars: [boolean, boolean, boolean];
  unlocked: boolean;
  next: boolean;
}

export interface MapIsland {
  name: string;
  stars: number;
  unlocked: boolean;
  gate: number;
  complete: boolean;
  rewardName: string;
  levels: MapLevel[];
}

export interface MapData {
  islands: MapIsland[];
  totalStars: number;
  maxStars: number;
}

/** Node positions (percent of the island art) along each island's path. */
const NODES: [number, number][][] = [
  [[14, 72], [30, 52], [47, 66], [62, 44], [76, 62], [88, 34]],
  [[12, 60], [27, 44], [42, 60], [57, 42], [72, 58], [87, 40]],
  [[13, 66], [28, 46], [44, 62], [59, 40], [74, 58], [88, 38]],
  [[12, 58], [27, 40], [43, 58], [58, 38], [73, 56], [88, 36]],
];

/** Hand-drawn style island art per island (inline SVG, no assets). */
function islandArt(i: number): string {
  const sea = ['#36c6e0', '#2fa6d6', '#2a9cb8', '#7a5fb0'][i] as string;
  const sea2 = ['#1d8fd0', '#1b7fc0', '#1a7898', '#3f3a86'][i] as string;
  const sand = ['#f6dda6', '#e9c37e', '#e3c798', '#f8c8a8'][i] as string;
  const sky = i === 3 ? '<linearGradient id="isk3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4aa6"/><stop offset=".55" stop-color="#f07fa0"/><stop offset="1" stop-color="#ffb464"/></linearGradient>' : '';
  let deco = '';
  if (i === 0) deco = `<g fill="#3dae4f"><path d="M70 120c-2-30 6-52 14-62-14 2-24 10-28 20 6-6 12-8 18-6-8 6-10 18-10 30z"/></g><path d="M78 120c2-22 4-40 8-56" stroke="#8a5a2b" stroke-width="5" fill="none"/><path d="M86 60c-12-8-26-6-32 0 12-2 22 0 32 6zm0 0c10-10 24-10 30-4-12-2-20 0-30 8zm0 0c2-12-4-22-12-26 6 8 8 16 6 26z" fill="#3dae4f"/><path d="M290 112h30l-4-26h-22z" fill="#f2d49a"/><path d="M298 86v-12h14v12" fill="#e9c37e"/><path d="M305 74v-12l10 4-10 4" fill="#e53935"/>`;
  if (i === 1) deco = `<g fill="#a8743f"><rect x="40" y="96" width="320" height="10" rx="3"/></g><g fill="#7a5530">${[60, 110, 160, 210, 260, 310].map((x) => `<rect x="${x}" y="100" width="6" height="30"/>`).join('')}</g><g fill="#2c3e66">${[90, 190, 290].map((x) => `<rect x="${x}" y="60" width="4" height="38"/><circle cx="${x + 2}" cy="58" r="6" fill="#fff3c4"/>`).join('')}</g><path d="M330 70l18 10h-18z" fill="#fff"/><path d="M328 70v30" stroke="#8a5a2b" stroke-width="3"/>`;
  if (i === 2) deco = `<g fill="#9b8577"><path d="M30 120l20-58 26 20 18-30 30 68z"/><path d="M300 120l18-44 22 14 16-26 16 56z"/></g><g fill="#3fc6d8"><ellipse cx="170" cy="112" rx="26" ry="8"/><ellipse cx="236" cy="104" rx="18" ry="6"/></g><circle cx="150" cy="100" r="4" fill="#ff7a3a"/>`;
  if (i === 3) deco = `<circle cx="300" cy="44" r="22" fill="#ffd27a" opacity=".9"/><g stroke="#6b4423" stroke-width="4">${[70, 140, 230, 320].map((x) => `<path d="M${x} 118v-30"/>`).join('')}</g><g fill="#ffb020">${[70, 140, 230, 320].map((x) => `<path d="M${x - 5} 88c0-8 5-12 5-16 0 4 5 8 5 16z"/>`).join('')}</g>`;
  return `<svg class="isl-art" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${sky}<linearGradient id="isea${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sea}"/><stop offset="1" stop-color="${sea2}"/></linearGradient></defs>${i === 3 ? '<rect width="400" height="60" fill="url(#isk3)"/>' : ''}<rect y="${i === 3 ? 60 : 0}" width="400" height="${i === 3 ? 100 : 160}" fill="url(#isea${i})"/><g class="wv" stroke="rgba(255,255,255,.45)" stroke-width="3" fill="none" stroke-linecap="round"><path d="M20 30q10-6 20 0t20 0"/><path d="M330 140q10-6 20 0t20 0"/><path d="M200 20q10-6 20 0t20 0"/></g><path d="M10 128c40-40 90-70 190-74s160 30 190 74c-80 24-300 24-380 0z" fill="${sand}"/><path d="M10 128c80 22 300 22 380 0" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/>${deco}</svg>`;
}

const stars3 = (s: readonly boolean[], cls = ''): string => `<span class="st3 ${cls}">${s.map((x) => (x ? ICON.star : ICON.starEmpty)).join('')}</span>`;

export class MapScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private count: HTMLElement;

  constructor(private h: { back(): void; open(id: string): void }) {
    this.el = el('div', 'screen page map');
    this.el.id = 'map';
    const card = el('div', 'page-card map-card');
    const head = el('div', 'page-head');
    this.count = el('span', 'map-count');
    head.append(btn(ICON.back, 'icon ghost back', () => this.h.back(), 'Back'), el('h2', '', 'Island Hop'), this.count);
    this.body = el('div', 'page-body map-body');
    card.append(head, this.body);
    this.el.append(el('div', 'page-dim'), card);
  }

  render(d: MapData): void {
    this.count.innerHTML = `${ICON.star}<b>${d.totalStars}</b>/${d.maxStars}`;
    this.body.innerHTML = '';
    let focus: HTMLElement | null = null;
    d.islands.forEach((isl, i) => {
      const panel = el('section', `isl isl-${i}${isl.unlocked ? '' : ' locked'}`);
      const top = el('div', 'isl-head', `<span class="isl-name">${isl.name}</span><span class="isl-stars">${ICON.star}${isl.stars}/18</span>`);
      const art = el('div', 'isl-stage', islandArt(i));
      // dotted path between the nodes
      const pts = NODES[i] as [number, number][];
      const path = el('div', 'isl-path');
      path.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2.4" vector-effect="non-scaling-stroke" opacity=".85"/></svg>`;
      art.appendChild(path);
      isl.levels.forEach((lv, k) => {
        const [x, y] = pts[k] as [number, number];
        const cleared = lv.stars[0];
        const node = el('button', `lv-node${lv.unlocked ? '' : ' locked'}${cleared ? ' cleared' : ''}${lv.next ? ' next' : ''}${lv.chase ? ' chase' : ''}`) as HTMLButtonElement;
        node.type = 'button';
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        node.setAttribute('aria-label', `${isl.name} level ${lv.index}: ${lv.name}${lv.unlocked ? '' : ' (locked)'}`);
        node.innerHTML = `<span class="ln">${lv.unlocked ? (lv.chase ? ICON.rider : String(lv.index)) : ICON.lock}</span>${lv.unlocked ? stars3(lv.stars, 'tiny') : ''}${lv.next ? `<span class="you">${ICON.crab}</span>` : ''}`;
        node.disabled = !lv.unlocked;
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          this.h.open(lv.id);
        });
        art.appendChild(node);
        if (lv.next && isl.unlocked) focus = node;
      });
      if (!isl.unlocked) art.appendChild(el('div', 'isl-lock', `<span class="lk">${ICON.lock}</span><span>Collect <b>${ICON.star}${isl.gate}</b> stars to sail here</span>`));
      const foot = el('div', 'isl-foot', isl.complete ? `${ICON.check}<span>Island complete! Reward: <b>${isl.rewardName}</b></span>` : `<span>Clear all six to win the <b>${isl.rewardName}</b></span>`);
      panel.append(top, art, foot);
      this.body.appendChild(panel);
    });
    const f = focus as HTMLElement | null;
    if (f) requestAnimationFrame(() => f.scrollIntoView({ block: 'center', inline: 'center' }));
  }
}

export interface IntroData {
  id: string;
  island: string;
  index: number;
  name: string;
  chase: boolean;
  rule: string;
  stars: [boolean, boolean, boolean];
  best: number;
}

export class LevelIntro {
  readonly el: HTMLElement;
  private card: HTMLElement;

  constructor(private h: { play(id: string): void; back(): void }) {
    this.el = el('div', 'screen page lv-intro');
    this.el.id = 'level-intro';
    this.card = el('div', 'page-card lv-card');
    const dim = el('div', 'page-dim');
    dim.addEventListener('click', () => this.h.back());
    this.el.append(dim, this.card);
  }

  render(d: IntroData): void {
    const row = (icon: string, text: string, got: boolean): string => `<div class="obj${got ? ' got' : ''}"><span class="oi">${icon}</span><span class="ot">${text}</span><span class="os">${got ? ICON.star : ICON.starEmpty}</span></div>`;
    this.card.innerHTML = `<div class="page-head"><h2>${d.chase ? 'Great Wave!' : `Level ${d.index}`}</h2></div>
      <div class="page-body">
        <div class="lv-title"><span class="lv-isl">${d.island} · ${d.index}/6</span><b>${d.name}</b></div>
        ${d.chase ? `<div class="lv-tip">${ICON.rider}<span>A giant wave is chasing you! Bumps let it catch up; grab <b>hourglass shells</b> to push it back.</span></div>` : ''}
        <div class="objs">
          ${row(ICON.flag, 'Reach the finish flag', d.stars[0])}
          ${row(`<span class="dollar-ico"></span>`, 'Grab all 3 golden sand dollars', d.stars[1])}
          ${row(ICON.trophy, d.rule, d.stars[2])}
        </div>
        ${d.best > 0 ? `<div class="lv-best">Best time ${d.best.toFixed(1)} s</div>` : ''}
      </div>`;
    const body = this.card.querySelector('.page-body') as HTMLElement;
    const go = btn(`${ICON.play}<span>Play</span>`, 'big', () => this.h.play(d.id));
    const back = btn(`${ICON.back}<span>Map</span>`, 'blue small', () => this.h.back());
    const bar = el('div', 'res-buttons');
    bar.append(go, back);
    body.appendChild(bar);
    requestAnimationFrame(() => go.focus({ preventScroll: true }));
  }
}

export interface LevelEndData {
  success: boolean;
  name: string;
  stars: [boolean, boolean, boolean];
  /** stars earned this attempt (for the fly-in) */
  earned: [boolean, boolean, boolean];
  rule: string;
  dollars: number;
  time: number;
  shells: number;
  xp: number;
  firstClear: boolean;
  islandReward: string | null;
  goldCrab: boolean;
  hasNext: boolean;
}

export class LevelEnd {
  readonly el: HTMLElement;
  private card: HTMLElement;

  constructor(private h: { retry(): void; next(): void; map(): void; star(i: number): void }) {
    this.el = el('div', 'screen results2 lv-end hidden');
    this.el.id = 'level-end';
    this.card = el('div', 'res-card');
    this.el.append(el('div', 'res-dim'), this.card);
  }

  show(d: LevelEndData, reduceMotion: boolean): void {
    const big = (got: boolean, i: number): string => `<span class="bigstar${got ? ' on' : ''}" style="--d:${0.45 + i * 0.35}s">${got ? ICON.star : ICON.starEmpty}</span>`;
    const tick = (ok: boolean, text: string): string => `<div class="res-line in ${ok ? 'goal' : ''}"><span class="rl-l">${ok ? `<span class="chk">${ICON.check}</span>` : '<span class="xk">✕</span>'}${text}</span></div>`;
    this.card.classList.toggle('best', d.success);
    this.card.innerHTML = `<div class="res-head"><span class="rh-title">${d.success ? 'Level Complete!' : 'Wiped Out!'}</span></div>
      <div class="lv-name">${d.name}</div>
      <div class="bigstars">${d.earned.map((g, i) => big(g, i)).join('')}</div>
      <div class="res-list">
        ${tick(d.earned[0], 'Reached the flag')}
        ${tick(d.earned[1], `Sand dollars ${d.dollars}/3`)}
        ${tick(d.earned[2], d.rule)}
      </div>
      ${d.success ? `<div class="lv-rewards">${d.firstClear ? `<span class="rw">${ICON.shell}+${fmt(d.shells)}</span>` : ''}${d.xp > 0 ? `<span class="rw xp">${ICON.sun}+${d.xp} XP</span>` : ''}<span class="rw time">${d.time.toFixed(1)} s</span></div>` : ''}
      ${d.islandReward ? `<div class="lv-unlock">${ICON.sparkle}<span>Island complete! New hat: <b>${d.islandReward}</b></span></div>` : ''}
      ${d.goldCrab ? `<div class="lv-unlock gold">${ICON.crab}<span>All 72 stars! The <b>Golden Crab</b> is yours</span></div>` : ''}`;
    const bar = el('div', 'res-buttons');
    if (d.success && d.hasNext) {
      bar.append(btn(`${ICON.play}<span>Next Level</span>`, 'big', () => this.h.next()));
      const row = el('div', 'btn-row');
      row.append(btn(`${ICON.restart}<span>Retry</span>`, 'blue small', () => this.h.retry()), btn(`${ICON.island}<span>Map</span>`, 'blue small', () => this.h.map()));
      bar.append(row);
    } else {
      bar.append(btn(`${ICON.restart}<span>Retry</span>`, 'big', () => this.h.retry()));
      const row = el('div', 'btn-row');
      row.append(btn(`${ICON.island}<span>Map</span>`, 'blue small', () => this.h.map()));
      bar.append(row);
    }
    this.card.appendChild(bar);
    this.el.classList.remove('hidden');
    (bar.querySelector('.btn') as HTMLElement | null)?.focus({ preventScroll: true });
    if (!reduceMotion) {
      d.earned.forEach((g, i) => {
        if (g) setTimeout(() => this.h.star(i), (0.45 + i * 0.35) * 1000 + 250);
      });
    }
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
