import type { QualitySetting, Settings, TouchButtons } from '../core/save';
import { btn, el } from './dom';

export interface SettingsHandlers {
  change(s: Settings): void;
  reset(): void;
  back(): void;
}

export class SettingsScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private s!: Settings;
  private confirming = false;

  constructor(private h: SettingsHandlers) {
    this.el = el('div', 'screen');
    this.el.id = 'settings';
    const dim = el('div', 'dim');
    const panel = el('div', 'panel');
    panel.innerHTML = `<div class="panel-head">Settings</div>`;
    this.body = el('div', 'panel-body');
    panel.appendChild(this.body);
    this.el.append(dim, panel);
  }

  open(s: Settings): void {
    this.s = { ...s };
    this.confirming = false;
    this.render();
  }

  private render(): void {
    const s = this.s;
    const b = this.body;
    b.innerHTML = '';
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
      inp.addEventListener('input', () => {
        s[key] = Number(inp.value) / 100;
        this.h.change({ ...s });
      });
      row.appendChild(inp);
      return row;
    };
    const seg = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void): HTMLElement => {
      const row = el('div', 'set-row');
      row.innerHTML = `<label>${label}</label>`;
      const g = el('div', 'seg');
      g.setAttribute('role', 'radiogroup');
      g.setAttribute('aria-label', label);
      for (const [v, txt] of options) {
        const o = el('button', v === value ? 'on' : '', txt) as HTMLButtonElement;
        o.type = 'button';
        o.setAttribute('role', 'radio');
        o.setAttribute('aria-checked', String(v === value));
        o.addEventListener('click', () => {
          set(v);
          this.h.change({ ...s });
          this.render();
        });
        g.appendChild(o);
      }
      row.appendChild(g);
      return row;
    };
    b.append(
      slider('Music', 'music'),
      slider('Sound effects', 'sfx'),
      seg<QualitySetting>('Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality, (v) => (s.quality = v)),
      seg<TouchButtons>('Touch arrows', [['auto', 'Auto'], ['show', 'Show'], ['hide', 'Hide']], s.touchButtons, (v) => (s.touchButtons = v)),
      seg<'auto' | 'on' | 'off'>('Reduce motion', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], s.reduceMotion === null ? 'auto' : s.reduceMotion ? 'on' : 'off', (v) => (s.reduceMotion = v === 'auto' ? null : v === 'on')),
    );
    const resetRow = el('div', 'set-row');
    resetRow.innerHTML = '<label>Progress</label>';
    if (!this.confirming) {
      resetRow.appendChild(btn('Reset progress', 'red small', () => {
        this.confirming = true;
        this.render();
      }));
    } else {
      const c = el('div', 'confirm', 'Erase all shells, crabs, upgrades, goals and records? This can’t be undone.');
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
    b.appendChild(resetRow);
    const done = btn('Done', 'big', () => this.h.back());
    done.style.width = '100%';
    done.style.marginTop = '10px';
    b.appendChild(done);
    b.appendChild(el('div', 'credits', 'Crab Dash · every model, sound and song is made in code · built with three.js'));
  }
}
