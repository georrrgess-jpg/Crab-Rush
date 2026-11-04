import { el } from './dom';
import { ICON } from './icons';

/**
 * The controls card (Update 9): Move, Hop, Slam and Pause for the device in hand. It holds a keyboard,
 * a touch and a controller set; CSS shows the one that matches `<html data-input>` (kit.installInputMode),
 * so it updates by itself when the player picks up a different device. `all` shows every set side by
 * side (How to Play), the current device first.
 */
export type ControlsVariant = 'compact' | 'coach' | 'all';

/** keycap arrows as SVG (iOS draws some arrow characters as emoji) */
const arrow = (deg: number): string =>
  `<svg class="ka" viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate(${deg}deg)"><path d="M10 3l6.5 7.5H12V17H8v-6.5H3.5z" fill="currentColor"/></svg>`;
const key = (k: string, wide = false): string => `<kbd class="kc${wide ? ' wide' : ''}">${k}</kbd>`;
const or = '<i class="ctl-or">or</i>';

/** a fingertip with a motion trail: dir 0 = left-right, 1 = up, 2 = down */
const swipe = (dir: 0 | 1 | 2): string => {
  if (dir === 0)
    return `<svg class="ctl-ges" viewBox="0 0 56 36" aria-hidden="true"><path d="M10 18h36" stroke="#9fd4f8" stroke-width="5" stroke-linecap="round"/><path d="M12 10l-9 8 9 8zM44 10l9 8-9 8z" fill="#1a84dc"/><circle cx="28" cy="18" r="8" fill="#fff" stroke="#14254f" stroke-width="3"/></svg>`;
  const flip = dir === 2 ? ' transform="rotate(180 28 18)"' : '';
  return `<svg class="ctl-ges" viewBox="0 0 56 36" aria-hidden="true"><g${flip}><path d="M28 30V8" stroke="#9fd4f8" stroke-width="5" stroke-linecap="round"/><path d="M19 11l9-9 9 9z" fill="#1a84dc"/><circle cx="28" cy="27" r="7" fill="#fff" stroke="#14254f" stroke-width="3"/></g></svg>`;
};
const PAUSE_DOT = `<span class="ctl-pause">${ICON.pause}</span>`;
const DPAD = `<svg class="ctl-pad" viewBox="0 0 36 36" aria-hidden="true"><path d="M13 3h10v10h10v10H23v10H13V23H3V13h10z" fill="#4a5a80"/><path d="M8 18l4-3v6zM28 18l-4-3v6z" fill="#fff"/></svg>`;
const padBtn = (label: string, color: string): string => `<kbd class="kc pad" style="--pc:${color}">${label}</kbd>`;

interface Row {
  keys: string;
  /** one word (the coach strip) */
  label: string;
  /** a fuller line (the pause sheet and How to Play) */
  long?: string;
}

const SETS: { id: 'kb' | 'touch' | 'pad'; title: string; icon: string; rows: Row[] }[] = [
  {
    id: 'kb',
    title: 'Keyboard',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="10" width="34" height="21" rx="4" fill="#fff"/><g fill="#14254f"><rect x="7" y="14" width="4" height="4" rx="1"/><rect x="13" y="14" width="4" height="4" rx="1"/><rect x="19" y="14" width="4" height="4" rx="1"/><rect x="25" y="14" width="4" height="4" rx="1"/><rect x="31" y="14" width="2.5" height="4" rx="1"/><rect x="11" y="23" width="18" height="4" rx="1"/></g></svg>`,
    rows: [
      { keys: `${key(arrow(-90))}${key(arrow(90))}${or}${key('A')}${key('D')}`, label: 'Move' },
      { keys: `${key(arrow(0))}${key('W')}${key('Space', true)}`, label: 'Hop' },
      { keys: `${key(arrow(180))}${key('S')}`, label: 'Slam', long: 'Slam down' },
      { keys: `${key('Esc', true)}${key('P')}`, label: 'Pause' },
    ],
  },
  {
    id: 'touch',
    title: 'Touch',
    icon: ICON.hand,
    rows: [
      { keys: swipe(0), label: 'Move', long: 'Swipe or tap: move' },
      { keys: swipe(1), label: 'Hop', long: 'Swipe up: hop' },
      { keys: swipe(2), label: 'Slam', long: 'Swipe down: slam' },
      { keys: PAUSE_DOT, label: 'Pause', long: 'Pause button' },
    ],
  },
  {
    id: 'pad',
    title: 'Controller',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 12h20c5 0 8 4 8 10 0 5-2 8-5 8-3 0-4-4-7-4H14c-3 0-4 4-7 4-3 0-5-3-5-8 0-6 3-10 8-10z" fill="#fff"/><path d="M11 17v6M8 20h6" stroke="#14254f" stroke-width="2.6" stroke-linecap="round"/><circle cx="27" cy="18" r="2" fill="#3fbf55"/><circle cx="31" cy="22" r="2" fill="#e8432a"/></svg>`,
    rows: [
      { keys: `${DPAD}<i class="ctl-or">or stick</i>`, label: 'Move' },
      { keys: padBtn('A', '#3fbf55'), label: 'Hop' },
      { keys: padBtn('B', '#e8432a'), label: 'Slam', long: 'Slam down' },
      { keys: padBtn('☰', '#4a5a80'), label: 'Pause', long: 'Pause (Start)' },
    ],
  },
];

export function controlsCard(variant: ControlsVariant, heading = 'Controls'): HTMLElement {
  const card = el('div', `ctl-card ${variant}`);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', heading);
  if (variant !== 'all') card.appendChild(el('div', 'ctl-head', `<span class="ctl-h">${heading}</span>${SETS.map((s) => `<span class="ctl-dev for-${s.id}">${s.icon}${s.title}</span>`).join('')}`));
  const wrap = el('div', 'ctl-sets');
  for (const s of SETS) {
    const set = el('div', `ctl-set for-${s.id}`);
    if (variant === 'all') set.appendChild(el('h4', 'ctl-st', `<span class="ctl-sti">${s.icon}</span>${s.title}`));
    for (const r of s.rows) set.appendChild(el('div', 'ctl', `<span class="ctl-k">${r.keys}</span><span class="ctl-l">${variant === 'coach' ? r.label : (r.long ?? r.label)}</span>`));
    wrap.appendChild(set);
  }
  card.appendChild(wrap);
  return card;
}
