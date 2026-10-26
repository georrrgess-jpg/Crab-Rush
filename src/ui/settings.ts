import type { QualitySetting, Settings, TouchButtons } from '../core/save';
import { btn, el, fmt } from './dom';
import { ICON } from './icons';

export interface SettingsHandlers {
  change(s: Settings): void;
  reset(): void;
  back(): void;
  stats(): void;
}

/** Settings (UPDATE2_PLAN.md §4.3): grouped sections; the Stats page is a separate screen. */
export class SettingsScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private s!: Settings;
  private confirming = false;

  constructor(private h: SettingsHandlers) {
    this.el = el('div', 'screen page');
    this.el.id = 'settings';
    const panel = el('div', 'page-card');
    const head = el('div', 'page-head');
    head.append(btn(ICON.back, 'icon ghost back', () => this.h.back(), 'Back'), el('h2', '', 'Settings'));
    this.body = el('div', 'page-body');
    panel.append(head, this.body);
    this.el.append(el('div', 'page-dim'), panel);
  }

  open(s: Settings): void {
    this.s = { ...s };
    this.confirming = false;
    this.render();
  }

  private render(): void {
    const s = this.s;
    const b = this.body;
    const scroll = b.scrollTop;
    b.innerHTML = '';
    const section = (title: string, ...rows: HTMLElement[]): HTMLElement => {
      const sec = el('section', 'set-sec');
      sec.append(el('h3', '', title), ...rows);
      return sec;
    };
    const slider = (label: string, key: 'music' | 'sfx'): HTMLElement => {
      const row = el('div', 'set-row');
      const id = `set-${key}`;
      row.innerHTML = `<label for="${id}">${label}</label>`;
      const inp = el('input') as HTMLInputElement;
      inp.type = 'range';
      inp.id = id;
      inp.min = '0';
      inp.max = '100';
      inp.value = String(Math.round(s[key] * 100));
      inp.style.setProperty('--v', `${inp.value}%`);
      inp.addEventListener('input', () => {
        s[key] = Number(inp.value) / 100;
        inp.style.setProperty('--v', `${inp.value}%`);
        this.h.change({ ...s });
      });
      row.appendChild(inp);
      return row;
    };
    const seg = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void, hint = ''): HTMLElement => {
      const row = el('div', 'set-row');
      row.innerHTML = `<label>${label}${hint ? `<small>${hint}</small>` : ''}</label>`;
      const g = el('div', 'seg');
      g.setAttribute('role', 'radiogroup');
      g.setAttribute('aria-label', label);
      for (const [v, txt] of options) {
        const o = el('button', v === value ? 'on' : '', txt) as HTMLButtonElement;
        o.type = 'button';
        o.setAttribute('role', 'radio');
        o.setAttribute('aria-checked', String(v === value));
        o.addEventListener('click', (e) => {
          e.stopPropagation();
          set(v);
          this.h.change({ ...s });
          this.render();
        });
        g.appendChild(o);
      }
      row.appendChild(g);
      return row;
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void, hint = ''): HTMLElement => {
      const row = el('div', 'set-row');
      row.innerHTML = `<label>${label}${hint ? `<small>${hint}</small>` : ''}</label>`;
      const t = el('button', `toggle${value ? ' on' : ''}`, '<i></i>') as HTMLButtonElement;
      t.type = 'button';
      t.setAttribute('role', 'switch');
      t.setAttribute('aria-checked', String(value));
      t.setAttribute('aria-label', label);
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        set(!value);
        this.h.change({ ...s });
        this.render();
      });
      row.appendChild(t);
      return row;
    };
    b.append(
      section('Sound', slider('Music', 'music'), slider('Sound effects', 'sfx')),
      section(
        'Controls',
        seg<'low' | 'normal' | 'high'>('Swipe sensitivity', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], s.swipeSensitivity, (v) => (s.swipeSensitivity = v)),
        seg<TouchButtons>('Touch arrows', [['auto', 'Auto'], ['show', 'Show'], ['hide', 'Hide']], s.touchButtons, (v) => (s.touchButtons = v)),
        toggle('Left-handed HUD', s.leftHanded, (v) => (s.leftHanded = v), 'Pause button on the left'),
        toggle('Vibration', s.haptics, (v) => (s.haptics = v), 'Where your device supports it'),
      ),
      section(
        'Graphics',
        seg<QualitySetting>('Quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], s.quality, (v) => (s.quality = v)),
        seg<'auto' | 'on' | 'off'>('Reduce motion', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], s.reduceMotion === null ? 'auto' : s.reduceMotion ? 'on' : 'off', (v) => (s.reduceMotion = v === 'auto' ? null : v === 'on')),
        toggle('High-contrast outlines', s.contrastOutlines, (v) => (s.contrastOutlines = v), 'Bright edges on obstacles'),
      ),
    );
    const more = section('More');
    more.append(
      (() => {
        const r = el('div', 'set-row');
        r.innerHTML = '<label>Your stats<small>Lifetime records</small></label>';
        r.append(btn(`${ICON.chart}<span>Stats</span>`, 'blue small', () => this.h.stats()));
        return r;
      })(),
    );
    const resetRow = el('div', 'set-row');
    resetRow.innerHTML = '<label>Progress</label>';
    if (!this.confirming) {
      resetRow.appendChild(
        btn('Reset progress', 'red small', () => {
          this.confirming = true;
          this.render();
        }),
      );
    } else {
      const c = el('div', 'confirm', 'Erase all shells, crabs, upgrades, goals, pass progress and records? This can’t be undone.');
      const row = el('div', 'btn-row');
      row.style.marginTop = '8px';
      row.append(
        btn('Cancel', 'blue small', () => {
          this.confirming = false;
          this.render();
        }),
        btn('Erase', 'red small', () => {
          this.confirming = false;
          this.h.reset();
          this.render();
        }),
      );
      c.appendChild(row);
      resetRow.appendChild(c);
    }
    more.append(resetRow);
    b.append(more);
    const done = btn('Done', 'big', () => this.h.back());
    done.style.width = '100%';
    b.appendChild(done);
    b.appendChild(el('div', 'credits', 'Crab Dash · every model, sound and song is made in code · built with three.js'));
    b.scrollTop = scroll;
  }
}

export interface StatsData {
  best: number;
  runs: number;
  totalDistance: number;
  totalShells: number;
  totalHops: number;
  totalWaves: number;
  totalPowerups: number;
  totalCloseShaves: number;
  favourite: string;
  favouriteRuns: number;
  passTier: number;
  islandStars: number | null;
  dailyStreak: number | null;
}

/** Lifetime stats page. */
export class StatsScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor(back: () => void) {
    this.el = el('div', 'screen page');
    this.el.id = 'stats';
    const panel = el('div', 'page-card');
    const head = el('div', 'page-head');
    head.append(btn(ICON.back, 'icon ghost back', back, 'Back'), el('h2', '', 'Stats'));
    this.body = el('div', 'page-body');
    panel.append(head, this.body);
    this.el.append(el('div', 'page-dim'), panel);
  }

  render(d: StatsData): void {
    const tile = (icon: string, label: string, value: string, cls = ''): string => `<div class="stat ${cls}"><span class="si">${icon}</span><b>${value}</b><span>${label}</span></div>`;
    const km = d.totalDistance >= 10000 ? `${(d.totalDistance / 1000).toFixed(1)} km` : `${fmt(d.totalDistance)} m`;
    this.body.innerHTML = `<div class="stat-grid">${[
      tile(ICON.trophy, 'Best Beach Run', `${fmt(d.best)} m`, 'wide'),
      tile(ICON.flag, 'Distance run', km),
      tile(ICON.play, 'Runs played', fmt(d.runs)),
      tile(ICON.shell, 'Shells earned', fmt(d.totalShells)),
      tile(ICON.up, 'Hops', fmt(d.totalHops)),
      tile(ICON.rider, 'Waves hopped', fmt(d.totalWaves)),
      tile(ICON.magnet, 'Power-ups', fmt(d.totalPowerups)),
      tile(ICON.sparkle, 'Close shaves', fmt(d.totalCloseShaves)),
      tile(ICON.sun, 'Sunny Pass tier', String(d.passTier)),
      tile(ICON.crab, 'Favourite crab', d.favouriteRuns > 0 ? d.favourite : '—', 'wide'),
      ...(d.islandStars !== null ? [tile(ICON.star, 'Island stars', String(d.islandStars))] : []),
      ...(d.dailyStreak !== null ? [tile(ICON.flame, 'Daily streak', String(d.dailyStreak))] : []),
    ].join('')}</div>`;
  }
}
