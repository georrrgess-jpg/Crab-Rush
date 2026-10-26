// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Router, type Screen } from '../src/ui/router';

function screen(id: string, log: string[], veto = false): Screen {
  return {
    id,
    mount() {
      const el = document.createElement('div');
      el.innerHTML = `<button>${id}</button>`;
      log.push(`mount:${id}`);
      return el;
    },
    enter: () => log.push(`enter:${id}`),
    exit: () => log.push(`exit:${id}`),
    onBack: () => !veto,
  };
}

describe('router', () => {
  it('pushes, mounts lazily once, and pops back', () => {
    const root = document.createElement('div');
    const log: string[] = [];
    const r = new Router(root, false);
    r.reduceMotion = true;
    const home = screen('home', log);
    const shop = screen('shop', log);
    const changes: (string | null)[] = [];
    r.onChange = (t) => changes.push(t);
    r.reset(home);
    r.push(shop);
    expect(r.top?.id).toBe('shop');
    expect((root.querySelector('#home') as HTMLElement).hidden).toBe(true);
    expect(r.back()).toBe(true);
    expect(r.top?.id).toBe('home');
    expect((root.querySelector('#shop') as HTMLElement).hidden).toBe(true);
    r.push(shop);
    expect(log.filter((l) => l === 'mount:shop')).toHaveLength(1);
    expect(changes).toEqual(['home', 'shop', 'home', 'shop']);
  });
  it('cannot go back past the root and respects vetoes', () => {
    const root = document.createElement('div');
    const r = new Router(root, false);
    r.reduceMotion = true;
    const log: string[] = [];
    r.reset(screen('home', log));
    expect(r.back()).toBe(false);
    r.push(screen('dialog', log, true));
    expect(r.back()).toBe(false);
    expect(r.top?.id).toBe('dialog');
  });
  it('overlays keep the screen below visible and focus the new screen', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const r = new Router(root, false);
    r.reduceMotion = true;
    const log: string[] = [];
    r.reset(screen('game', log));
    r.push(screen('pause', log), { overlay: true });
    expect((root.querySelector('#game') as HTMLElement).hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe('pause');
    r.clear();
    expect(r.depth).toBe(0);
  });
});
