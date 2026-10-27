import { describe, expect, it } from 'vitest';
import { BASE_COMFORT, DECOR, GIFT_CAP_HOURS, GIFT_MAX, GIFT_MIN, MAX_COMFORT, PLOTS, buyDecor, collectGifts, comfort, defaultCove, giftRate, pendingGifts, place, store } from '../src/meta/cove';
import { FRIENDS, claimQuest, defaultFriends, moveIn, questProgress } from '../src/meta/friends';
import { ACHIEVEMENTS, FAMILIES, evaluate, pearlsFor, titlesFor, type Metrics } from '../src/meta/achievements';

const H = 3600_000;
const zero = (): Metrics => ({ distance: 0, best: 0, shells: 0, runs: 0, hops: 0, waves: 0, closeShaves: 0, powerups: 0, stars: 0, crowns: 0, streak: 0, items: 0, comfort: 0, friends: 0, tier: 0 });

describe('Crab Cove (UPDATE3_PLAN.md §6)', () => {
  it('has 24 decorations and 12 plots; comfort spans the gift rates', () => {
    expect(DECOR.length).toBe(24);
    expect(new Set(DECOR.map((d) => d.id)).size).toBe(24);
    expect(PLOTS).toBe(12);
    expect(giftRate(BASE_COMFORT)).toBe(GIFT_MIN);
    expect(giftRate(MAX_COMFORT)).toBe(GIFT_MAX);
  });
  it('buys, places, moves and stores decorations', () => {
    const c = defaultCove(0);
    const w = { shells: 1000, pearls: 0 };
    expect(buyDecor(c, w, 'chair')).toBe(true);
    expect(w.shells).toBe(700);
    expect(buyDecor(c, w, 'chair')).toBe(false); // owned once
    expect(buyDecor(c, w, 'flamingo')).toBe(false); // pearls
    expect(place(c, 3, 'chair', 0)).toBe(true);
    expect(comfort(c)).toBe(BASE_COMFORT + 6);
    expect(place(c, 5, 'chair', 0)).toBe(true); // moved, not duplicated
    expect(c.plots.filter(Boolean)).toEqual(['chair']);
    expect(c.plots[5]).toBe('chair');
    expect(place(c, 1, 'bench', 0)).toBe(false); // not owned
    expect(store(c, 5, 0)).toBe(true);
    expect(comfort(c)).toBe(BASE_COMFORT);
  });
  it('Tide Gifts accrue by comfort, cap at 8 hours and collect', () => {
    const c = defaultCove(0);
    expect(pendingGifts(c, 2 * H)).toBe(GIFT_MIN * 2);
    expect(pendingGifts(c, 100 * H)).toBe(GIFT_MIN * GIFT_CAP_HOURS);
    expect(collectGifts(c, 3 * H)).toBe(GIFT_MIN * 3);
    expect(pendingGifts(c, 3 * H)).toBe(0);
  });
  it('a comfort change pays the old rate up to now', () => {
    const c = defaultCove(0);
    const w = { shells: 99999, pearls: 999 };
    buyDecor(c, w, 'tiki');
    place(c, 0, 'tiki', 2 * H); // two hours at the base rate are banked
    const later = pendingGifts(c, 3 * H);
    expect(later).toBe(GIFT_MIN * 2 + giftRate(comfort(c)));
  });
});

describe('crab friends', () => {
  it('move in by comfort and run three-quest chains measured from acceptance', () => {
    const s = defaultFriends();
    const m = zero();
    m.shells = 500;
    expect(moveIn(s, 10, m)).toEqual(['shelly']);
    expect(moveIn(s, 10, m)).toEqual([]);
    // shells collected before the quest started don't count
    expect(questProgress(s, 'shelly', m).have).toBe(0);
    m.shells = 800;
    const p = questProgress(s, 'shelly', m);
    expect(p.done).toBe(true);
    const r = claimQuest(s, 'shelly', m);
    expect(r?.pearls).toBe(5);
    expect(questProgress(s, 'shelly', m).quest?.metric).toBe('hops');
    expect(claimQuest(s, 'shelly', m)).toBeNull();
  });
  it('six friends, each finishing with a hat', () => {
    expect(FRIENDS.length).toBe(6);
    for (const f of FRIENDS) expect(f.quests[2].gift?.startsWith('hat:')).toBe(true);
  });
});

describe('achievements', () => {
  it('36 trophies in 12 families; pearls by tier; gold titles', () => {
    expect(ACHIEVEMENTS.length).toBe(36);
    expect(FAMILIES.length).toBe(12);
    const m = zero();
    m.distance = 60_000;
    m.shells = 2500;
    const got = evaluate([], m);
    expect(got).toEqual(['dist:0', 'dist:1', 'shells:0']);
    expect(evaluate(got, m)).toEqual([]);
    expect(pearlsFor('dist:1')).toBe(10);
    expect(titlesFor(['dist:2'])).toContain('Marathon Crab');
  });
});
