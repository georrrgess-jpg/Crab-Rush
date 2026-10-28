/**
 * UI motion system (UPDATE4_PLAN.md §3.2): spring presses with a tilt toward the touch, staggered
 * entrances for lists, rewards that fly into the wallet, and a spring tab underline. Transform and
 * opacity only; everything degrades to plain fades with Reduce Motion.
 */
import { ICON } from './icons';
import { PEARL_ICO } from './kit';

export function reduced(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches || !!document.getElementById('app')?.classList.contains('reduce-motion');
}

const PRESSABLE = '.btn, .mode-card, .tile, .sheet-item, .tab, .lv-node, .pt, .dt-stat, .dt, .boost-chip, .goals-chip, .of-wear';

/** Spring press on every pressable control: squash on down, overshoot on release; cards tilt toward the finger. */
export function installPress(root: HTMLElement): void {
  let active: HTMLElement | null = null;
  const release = (): void => {
    const a = active;
    active = null;
    if (!a) return;
    a.classList.remove('m-down');
    if (reduced()) return;
    a.animate([{ transform: getComputedStyle(a).transform === 'none' ? 'scale(0.96)' : getComputedStyle(a).transform }, { transform: 'scale(1.035)', offset: 0.45 }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', composite: 'replace' });
  };
  root.addEventListener(
    'pointerdown',
    (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.(PRESSABLE) as HTMLElement | null;
      if (!t || (t as HTMLButtonElement).disabled) return;
      active = t;
      if (reduced()) return;
      const r = t.getBoundingClientRect();
      // cards (wide things) tilt toward the touch point; buttons just squash
      const card = r.width > 140 && r.height > 70;
      const tx = card ? ((e.clientX - r.left) / r.width - 0.5) * 2 : 0;
      const ty = card ? ((e.clientY - r.top) / r.height - 0.5) * 2 : 0;
      t.style.setProperty('--tx', `${(-ty * 4).toFixed(2)}deg`);
      t.style.setProperty('--ty', `${(tx * 5).toFixed(2)}deg`);
      t.classList.add('m-down');
    },
    { passive: true },
  );
  for (const ev of ['pointerup', 'pointercancel', 'dragstart']) root.addEventListener(ev, release, { passive: true });
  root.addEventListener('pointerleave', release, { passive: true });
}

/** Stagger the children of `node` in (rise + fade), 40 ms apart, capped so long lists stay snappy. */
export function staggerIn(node: HTMLElement, selector = ':scope > *', max = 14): void {
  if (reduced()) return;
  const kids = [...node.querySelectorAll<HTMLElement>(selector)].slice(0, max);
  kids.forEach((k, i) => {
    k.animate([{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: i * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  });
}

/** Coins arc from a screen point into the wallet target, then the wallet bumps. */
export function flyReward(from: { x: number; y: number }, to: DOMRect, kind: 'shells' | 'pearls', count = 6, onLand?: () => void): void {
  if (reduced() || to.width === 0) {
    onLand?.();
    return;
  }
  const layer = document.getElementById('ui') ?? document.body;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  let landed = 0;
  const n = Math.max(1, Math.min(10, count));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'm-coin';
    c.innerHTML = kind === 'shells' ? ICON.shell : PEARL_ICO;
    layer.appendChild(c);
    const sx = from.x + (Math.random() - 0.5) * 60;
    const sy = from.y + (Math.random() - 0.5) * 40;
    const mx = sx + (tx - sx) * 0.3 + (Math.random() - 0.5) * 80;
    const my = Math.min(sy, ty) - 60 - Math.random() * 60;
    const a = c.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) translate(-50%,-50%) scale(0.2)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx}px, ${my}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%,-50%) scale(0.6)`, opacity: 1 },
      ],
      { duration: 700 + i * 45, delay: i * 35, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' },
    );
    a.onfinish = () => {
      c.remove();
      if (++landed === n) onLand?.();
    };
  }
}

/** A spring underline that slides to the active tab in a tab strip. */
export function tabIndicator(strip: HTMLElement): (active: HTMLElement | null) => void {
  const bar = document.createElement('i');
  bar.className = 'm-tabline';
  bar.setAttribute('aria-hidden', 'true');
  strip.style.position = strip.style.position || 'relative';
  strip.appendChild(bar);
  let first = true;
  return (active) => {
    if (!active || !active.offsetWidth) {
      bar.style.opacity = '0';
      return;
    }
    const w = active.offsetWidth * 0.5;
    const x = active.offsetLeft + (active.offsetWidth - w) / 2;
    bar.style.opacity = '1';
    bar.style.transition = first || reduced() ? 'none' : '';
    bar.style.width = `${w}px`;
    bar.style.transform = `translateX(${x}px)`;
    first = false;
  };
}

/** Card morph: a copy of the card grows from its place to fill the screen and fades as the new screen arrives. */
export function morphFrom(card: HTMLElement): void {
  if (reduced()) return;
  const r = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const g = document.createElement('div');
  g.className = 'm-morph';
  g.style.background = cs.backgroundImage !== 'none' ? `${cs.backgroundImage}, ${cs.backgroundColor}` : cs.backgroundColor;
  const art = card.querySelector('svg.mc-art');
  if (art) g.appendChild(art.cloneNode(true));
  (document.getElementById('ui') ?? document.body).appendChild(g);
  const W = innerWidth;
  const H = innerHeight;
  const a = g.animate(
    [
      { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius, opacity: 1 },
      { left: '0px', top: '0px', width: `${W}px`, height: `${H}px`, borderRadius: '0px', opacity: 1, offset: 0.6 },
      { left: '0px', top: '0px', width: `${W}px`, height: `${H}px`, borderRadius: '0px', opacity: 0 },
    ],
    { duration: 520, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' },
  );
  a.onfinish = () => g.remove();
}
