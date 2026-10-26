import { describe, expect, it } from 'vitest';
import { SaveStore, defaultSave, sanitize, SAVE_KEY } from '../src/core/save';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
class ThrowingStorage {
  getItem(): string | null { throw new Error('denied'); }
  setItem(): void { throw new Error('denied'); }
  removeItem(): void { throw new Error('denied'); }
}

describe('save', () => {
  it('round-trips through storage', () => {
    const st = new MemStorage();
    const a = new SaveStore(st);
    a.data.shells = 321;
    a.data.best = 1234.5;
    a.data.crabs.owned.push('chill');
    a.data.crabs.selected = 'chill';
    a.save();
    const b = new SaveStore(st);
    expect(b.data.shells).toBe(321);
    expect(b.data.best).toBe(1234.5);
    expect(b.data.crabs.selected).toBe('chill');
  });
  it('falls back to defaults on corrupt JSON', () => {
    const st = new MemStorage();
    st.setItem(SAVE_KEY, '{not json');
    expect(new SaveStore(st).data).toEqual(defaultSave());
  });
  it('sanitizes malformed fields', () => {
    const d = sanitize({ shells: 'lots', best: -5, crabs: { owned: ['chill', 3], selected: 'ghost' }, upgrades: { magnet: 99 }, settings: { quality: 'ultra', music: 7 } });
    expect(d.shells).toBe(0);
    expect(d.best).toBe(0);
    expect(d.crabs.owned).toContain('sandy');
    expect(d.crabs.selected).toBe('sandy');
    expect(d.upgrades.magnet).toBe(4);
    expect(d.settings.quality).toBe('auto');
    expect(d.settings.music).toBe(1);
  });
  it('keeps working when storage throws (private mode)', () => {
    const s = new SaveStore(new ThrowingStorage());
    s.data.shells = 9;
    s.save();
    expect(s.load().shells).toBe(9);
  });
  it('reset keeps settings', () => {
    const s = new SaveStore(new MemStorage());
    s.data.settings.music = 0.1;
    s.data.shells = 50;
    s.reset();
    expect(s.data.shells).toBe(0);
    expect(s.data.settings.music).toBe(0.1);
  });
});
