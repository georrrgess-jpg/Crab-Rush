import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { currentStreak, dateKey, daysBetween, defaultDaily, modifierFor, MODIFIERS, recordFinish, seedFor } from '../src/meta/daily';
import { claim, claimable, MAX_BOOSTS, PASS_REWARDS } from '../src/meta/pass';
import { ITEMS, defaultWardrobe, equip, exists, grant, owns } from '../src/meta/wardrobe';
import { PASS_TIERS, streakBonus, tierCost, tierFromXp, totalXpForTier, xpFor } from '../src/meta/xp';

describe('xp', () => {
  it('awards XP from every source', () => {
    expect(xpFor({ distance: 1234, shells: 101 })).toBe(41 + 6);
    expect(xpFor({ goals: 2, stars: 3, firstClears: 1 })).toBe(100 + 120 + 60);
    expect(xpFor({ daily: true, streak: 1 })).toBe(150);
    expect(xpFor({ daily: true, streak: 4, distance: 600 })).toBe(Math.round((150 + 20) * 1.3));
  });
  it('caps the streak bonus at +70%', () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(8)).toBeCloseTo(0.7);
    expect(streakBonus(100)).toBeCloseTo(0.7);
  });
  it('tiers grow gently and max out at 40', () => {
    expect(tierCost(0)).toBe(100);
    expect(tierFromXp(99)).toEqual({ tier: 0, into: 99, need: 100 });
    expect(tierFromXp(100).tier).toBe(1);
    expect(tierFromXp(totalXpForTier(20)).tier).toBe(20);
    const max = tierFromXp(1e9);
    expect(max.tier).toBe(PASS_TIERS);
    expect(max.need).toBe(0);
  });
});

describe('sunny pass', () => {
  it('has a valid reward for every tier and items that exist', () => {
    expect(PASS_REWARDS).toHaveLength(PASS_TIERS);
    for (const r of PASS_REWARDS) if (r.kind === 'item') expect(exists(r.slot, r.id), r.id).toBe(true);
  });
  it('claims only reached tiers, once each', () => {
    const s = defaultSave();
    expect(claimable(s)).toEqual([]);
    s.xp = totalXpForTier(5);
    expect(claimable(s)).toEqual([1, 2, 3, 4, 5]);
    expect(claim(s, 6)).toBeNull();
    const shells = s.shells;
    expect(claim(s, 1)?.kind).toBe('shells');
    expect(s.shells).toBeGreaterThan(shells);
    expect(claim(s, 1)).toBeNull();
    claim(s, 3);
    expect(owns(s.wardrobe, 'trails', 'bubbles')).toBe(true);
    claim(s, 5);
    expect(owns(s.wardrobe, 'hats', 'parrot')).toBe(true);
    expect(claimable(s)).toEqual([2, 4]);
  });
  it('caps stored boosts', () => {
    const s = defaultSave();
    s.xp = totalXpForTier(40);
    for (let t = 1; t <= 40; t++) claim(s, t);
    expect(s.boosts).toBeLessThanOrEqual(MAX_BOOSTS);
    expect(claimable(s)).toEqual([]);
  });
});

describe('wardrobe', () => {
  it('only equips owned items and ignores unknown ones', () => {
    const w = defaultWardrobe();
    expect(equip(w, 'hats', 'crown')).toBe(false);
    expect(grant(w, 'hats', 'crown')).toBe(true);
    expect(grant(w, 'hats', 'crown')).toBe(false);
    expect(grant(w, 'hats', 'nope')).toBe(false);
    expect(equip(w, 'hats', 'crown')).toBe(true);
    expect(w.equipped.hat).toBe('crown');
  });
  it('has unique ids per slot and 13 new hats (12 from Update 2, the Race Helmet from Update 4)', () => {
    const keys = ITEMS.map((i) => `${i.slot}:${i.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    const v1 = ['straw', 'shades', 'flower', 'captain', 'pirate', 'tophat', 'none'];
    expect(ITEMS.filter((i) => i.slot === 'hats' && !v1.includes(i.id))).toHaveLength(13);
  });
});

describe('daily tide', () => {
  it('formats local dates and counts days across months', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-03-07', '2026-03-10')).toBe(3);
  });
  it('gives everyone the same seed and a rotating modifier per day', () => {
    expect(seedFor('2026-10-26')).toBe(seedFor('2026-10-26'));
    expect(seedFor('2026-10-26')).not.toBe(seedFor('2026-10-27'));
    const week = Array.from({ length: MODIFIERS.length }, (_, i) => modifierFor(dateKey(new Date(2026, 9, 1 + i))));
    expect(new Set(week).size).toBe(MODIFIERS.length);
  });
  it('builds a streak on consecutive days and resets after a gap', () => {
    const s = defaultDaily();
    expect(recordFinish(s, '2026-10-01', 500)).toMatchObject({ firstToday: true, streak: 1, newBest: true });
    expect(recordFinish(s, '2026-10-01', 400)).toMatchObject({ firstToday: false, streak: 1, newBest: false });
    expect(recordFinish(s, '2026-10-02', 100).streak).toBe(2);
    expect(currentStreak(s, '2026-10-03')).toBe(2);
    expect(currentStreak(s, '2026-10-05')).toBe(0);
    expect(recordFinish(s, '2026-10-05', 100).streak).toBe(1);
  });
  it('earns a saver every 7 days and spends it to cover a missed day', () => {
    const s = defaultDaily();
    let r = recordFinish(s, '2026-10-01', 1);
    for (let d = 2; d <= 7; d++) r = recordFinish(s, `2026-10-0${d}`, 1);
    expect(r.streak).toBe(7);
    expect(r.milestone).toBe(7);
    expect(s.savers).toBe(1);
    // skip the 8th
    expect(currentStreak(s, '2026-10-09')).toBe(7);
    r = recordFinish(s, '2026-10-09', 1);
    expect(r.usedSavers).toBe(1);
    expect(r.streak).toBe(8);
    expect(s.savers).toBe(0);
  });
});

describe('island hop progression', async () => {
  const I = await import('../src/meta/islands');
  const { LEVELS } = await import('../src/sim/levelData');
  it('gates open with stars and levels open in order', () => {
    const r: Record<string, { stars: [boolean, boolean, boolean]; best: number }> = {};
    expect(I.islandUnlocked(r, 0)).toBe(true);
    expect(I.islandUnlocked(r, 1)).toBe(false);
    expect(I.levelUnlocked(r, 'shore-1')).toBe(true);
    expect(I.levelUnlocked(r, 'shore-2')).toBe(false);
    const a = I.applyLevelResult(r, 'shore-1', [true, true, false], 40);
    expect(a).toMatchObject({ firstClear: true, newStars: 2, shells: 60, xp: 140 });
    expect(I.levelUnlocked(r, 'shore-2')).toBe(true);
    expect(I.nextLevel(r)).toBe('shore-2');
    // replaying keeps old stars and only pays for new ones
    const b = I.applyLevelResult(r, 'shore-1', [true, false, true], 38);
    expect(b).toMatchObject({ firstClear: false, newStars: 1, shells: 0, xp: 40 });
    expect(r['shore-1']).toEqual({ stars: [true, true, true], best: 38 });
    for (const l of LEVELS.filter((x) => x.island === 0 && x.index > 1)) I.applyLevelResult(r, l.id, [true, true, l.index < 5], 30);
    expect(I.islandComplete(r, 0)).toBe(true);
    expect(I.totalStars(r)).toBeGreaterThanOrEqual(10);
    expect(I.islandUnlocked(r, 1)).toBe(true);
  });
  it('completing an island and all 72 stars pay out once', () => {
    const r: Record<string, { stars: [boolean, boolean, boolean]; best: number }> = {};
    let completed: number[] = [];
    let gold = 0;
    for (const l of LEVELS) {
      const res = I.applyLevelResult(r, l.id, [true, true, true], 30);
      if (res.islandCompleted !== null) completed.push(res.islandCompleted);
      if (res.goldCrab) gold++;
    }
    expect(completed).toEqual([0, 1, 2, 3]);
    expect(gold).toBe(1);
    expect(I.totalStars(r)).toBe(72);
    completed = [];
  });
});

import { BONUS_XP, bonusProgress, bonusReady } from '../src/meta/pass';
import { totalXpForTier as txp } from '../src/meta/xp';
describe('pass bonus loop', () => {
  it('a chest every 1,000 XP after tier 40', () => {
    const full = txp(40);
    expect(bonusReady(full - 1, 0)).toBe(0);
    expect(bonusReady(full + BONUS_XP * 2.5, 0)).toBe(2);
    expect(bonusReady(full + BONUS_XP * 2.5, 2)).toBe(0);
    expect(bonusProgress(full + 250)).toBe(250);
  });
});
