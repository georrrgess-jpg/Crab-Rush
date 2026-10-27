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

describe('save v1 → v2 migration', () => {
  // a save exactly as written by v1 (build 1)
  const V1_BLOB = {
    v: 1,
    shells: 1234,
    best: 2875.4,
    stats: { runs: 42, totalShells: 9000, totalDistance: 51000, totalHops: 800, totalWaves: 120, totalPowerups: 60, totalCloseShaves: 15 },
    crabs: { owned: ['sandy', 'chill', 'dazzle'], selected: 'chill' },
    upgrades: { magnet: 2, shield: 1, rider: 0 },
    goals: { active: ['run1500', 'cove', 'streak30'], completed: ['run300', 'play3'], progress: { run1500: 900 } },
    zonesSeen: [0, 1, 2, 3],
    tutorial: { move: true, hop: true },
    settings: { music: 0.3, sfx: 0.9, quality: 'low', touchButtons: 'show', reduceMotion: true },
  };

  it('keeps every v1 field and fills v2 defaults', () => {
    const st = new MemStorage();
    st.setItem(SAVE_KEY, JSON.stringify(V1_BLOB));
    const d = new SaveStore(st).data;
    expect(d.v).toBe(3);
    expect(d.shells).toBe(1234);
    expect(d.best).toBe(2875.4);
    expect(d.stats.runs).toBe(42);
    expect(d.crabs).toEqual({ owned: ['sandy', 'chill', 'dazzle'], selected: 'chill' });
    expect(d.upgrades).toEqual({ magnet: 2, shield: 1, rider: 0 });
    expect(d.goals.completed).toEqual(['run300', 'play3']);
    expect(d.settings.quality).toBe('low');
    expect(d.settings.reduceMotion).toBe(true);
    expect(d.settings.haptics).toBe(true);
    expect(d.xp).toBe(0);
    expect(d.levels).toEqual({});
    expect(d.daily.streak).toBe(0);
    // Phase D additions default sensibly for old saves
    expect(d.settings.contrastOutlines).toBe(false);
    expect(d.stats.runsByCrab).toEqual({});
    expect(d.stats.longestRun).toBe(0);
  });

  it('marks everything owned before NEW tracking as seen, and sanitizes seen lists', () => {
    const d = sanitize(V1_BLOB);
    expect(d.seen).toEqual(expect.arrayContaining(['bodies:chill', 'bodies:dazzle', 'hats:shades', 'hats:tophat', 'trails:sand']));
    const e = sanitize({ ...V1_BLOB, v: 2, seen: ['hats:straw', 'hats:nope', 7, 'hats:straw'] });
    expect(e.seen).toEqual(['hats:straw']);
  });

  it('sanitizes the Phase D stats and settings fields', () => {
    const d = sanitize({ ...V1_BLOB, v: 2, settings: { ...V1_BLOB.settings, contrastOutlines: true }, stats: { ...V1_BLOB.stats, runsByCrab: { sandy: 12.7, chill: -3, dazzle: 'x' }, longestRun: 95.5 } });
    expect(d.settings.contrastOutlines).toBe(true);
    expect(d.stats.runsByCrab).toEqual({ sandy: 12 });
    expect(d.stats.longestRun).toBe(95.5);
  });

  it('turns owned crabs into wardrobe bodies + hats and wears the selected one', () => {
    const d = sanitize(V1_BLOB);
    expect(d.wardrobe.owned.bodies).toEqual(expect.arrayContaining(['sandy', 'chill', 'dazzle']));
    expect(d.wardrobe.owned.hats).toEqual(expect.arrayContaining(['straw', 'shades', 'tophat']));
    expect(d.wardrobe.equipped).toMatchObject({ body: 'chill', hat: 'shades' });
  });

  it('round-trips v2 data and drops junk', () => {
    const d = sanitize({ ...V1_BLOB, v: 2, xp: 777, passClaimed: [1, 2, 2, 99, 'x'], boosts: 9, wardrobe: { owned: { hats: ['crown', 'bogus'] }, equipped: { body: 'dazzle', hat: 'crown' } }, levels: { 'shore-1': { stars: [true, false, true], best: 61 }, bad: 5 }, daily: { lastDate: '2026-10-25', streak: 4, savers: 7, history: ['2026-10-25', 'nope'] } });
    expect(d.xp).toBe(777);
    expect(d.passClaimed).toEqual([1, 2]);
    expect(d.boosts).toBe(3);
    expect(d.wardrobe.owned.hats).toContain('crown');
    expect(d.wardrobe.owned.hats).not.toContain('bogus');
    expect(d.wardrobe.equipped).toMatchObject({ body: 'dazzle', hat: 'crown' });
    expect(d.levels).toEqual({ 'shore-1': { stars: [true, false, true], best: 61 } });
    expect(d.daily).toMatchObject({ lastDate: '2026-10-25', streak: 4, savers: 2, history: ['2026-10-25'] });
  });

  it('buying a crab in the v1 shop also stocks the wardrobe', async () => {
    const { buyCrab } = await import('../src/sim/economy');
    const d = sanitize(V1_BLOB);
    d.shells = 5000;
    expect(buyCrab(d, 'pinch')).toBe(true);
    expect(d.wardrobe.owned.hats).toContain('pirate');
    expect(d.wardrobe.equipped).toMatchObject({ body: 'pinch', hat: 'pirate' });
  });
});

describe('save v2 → v3 migration (UPDATE3_PLAN.md §6.4)', () => {
  it('keeps v2 progress and fills the v3 fields', () => {
    const v2 = { v: 2, shells: 900, xp: 4000, passClaimed: [1, 2], levels: { 'shore-1': { stars: [true, true, false], best: 40 } }, daily: { lastDate: '2026-10-01', streak: 3, savers: 0, bestToday: 0, bestDate: '', history: [] } };
    const d = sanitize(v2);
    expect(d.v).toBe(3);
    expect(d.shells).toBe(900);
    expect(d.xp).toBe(4000);
    expect(d.levels['shore-1']!.stars).toEqual([true, true, false]);
    expect(d.pearls).toBe(0);
    expect(d.chests).toEqual([[], [], [], []]);
    expect(d.crowns).toEqual([]);
  });
  it('sanitizes pearls, chests and crowns', () => {
    const d = sanitize({ v: 3, pearls: -5, chests: [[0, 2, 2, 7], 'x', [1]], crowns: ['shore-1', 'shore-1', 3] });
    expect(d.pearls).toBe(0);
    expect(d.chests).toEqual([[0, 2], [], [1], []]);
    expect(d.crowns).toEqual(['shore-1']);
  });
});

describe('save v3: Crab Cove fields', () => {
  it('fill defaults for older saves and sanitize garbage', () => {
    const d = sanitize({ v: 2, shells: 5 });
    expect(d.cove.plots.length).toBe(12);
    expect(d.cove.owned).toEqual([]);
    expect(d.friends).toEqual({ moved: [], quests: {} });
    expect(d.achievements).toEqual([]);
    const e = sanitize({ v: 3, cove: { owned: ['chair', 'nope', 'chair'], plots: ['chair', 'chair', 'bench', null], lastGift: 9e15, banked: -4 }, friends: { moved: ['shelly', 'ghost'], quests: { shelly: { idx: 7, base: 'x' } } }, achievements: ['dist:0', 'dist:9'] });
    expect(e.cove.owned).toEqual(['chair']);
    expect(e.cove.plots.slice(0, 3)).toEqual(['chair', null, null]);
    expect(e.cove.lastGift).toBeLessThanOrEqual(Date.now());
    expect(e.cove.banked).toBe(0);
    expect(e.friends.moved).toEqual(['shelly']);
    expect(e.friends.quests.shelly).toEqual({ idx: 3, base: 0 });
    expect(e.achievements).toEqual(['dist:0']);
  });
});
