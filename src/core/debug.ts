import type { QualityName } from '../config';

/** URL flags (PLAN.md §8.5). Parsed once at boot. */
export interface Flags {
  debug: boolean;
  seed: number | null;
  start: number;
  god: boolean;
  autopilot: boolean;
  quality: QualityName | null;
  reset: boolean;
  /** screenshot mode: no auto-play, manual clock, no audio */
  shots: boolean;
  /** skip tutorial */
  notut: boolean;
}

export function parseFlags(search = typeof location !== 'undefined' ? location.search : ''): Flags {
  const q = new URLSearchParams(search);
  const has = (k: string): boolean => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const qual = q.get('quality');
  const seedStr = q.get('seed');
  return {
    debug: has('debug'),
    seed: seedStr !== null && seedStr !== '' && !Number.isNaN(Number(seedStr)) ? Number(seedStr) : null,
    start: Number(q.get('start')) || 0,
    god: has('god'),
    autopilot: has('autopilot'),
    quality: qual === 'low' || qual === 'medium' || qual === 'high' ? qual : null,
    reset: has('reset'),
    shots: has('shots'),
    notut: has('notut'),
  };
}

export interface DebugInfo {
  [k: string]: string | number;
}

/** Tiny text overlay. Updates twice a second. */
export class DebugOverlay {
  private el: HTMLDivElement;
  private acc = 0;
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'debug';
    parent.appendChild(this.el);
  }
  update(dt: number, getInfo: () => DebugInfo): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const info = getInfo();
    this.el.textContent = Object.entries(info)
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v}`)
      .join('\n');
  }
}
