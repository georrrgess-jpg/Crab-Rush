import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { defaultSave } from '../src/core/save';
import { buyCrab, buyUpgrade, canBuyCrab, grantSkillUnlocks, nextUnlock, selectCrab, upgradeCost } from '../src/sim/economy';

describe('economy', () => {
  it('prices increase and upgrade costs increase', () => {
    const prices = ['chill', 'blossom', 'skipper', 'pinch'].map((id) => CFG.crabPrices[id] as number);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    for (let i = 1; i < CFG.upgradeCosts.length; i++) expect(CFG.upgradeCosts[i]!).toBeGreaterThan(CFG.upgradeCosts[i - 1]!);
  });
  it('buys a crab only when affordable and selects it', () => {
    const s = defaultSave();
    expect(buyCrab(s, 'chill')).toBe(false);
    s.shells = 1000;
    expect(canBuyCrab(s, 'chill')).toBe(true);
    expect(buyCrab(s, 'chill')).toBe(true);
    expect(s.shells).toBe(1000 - (CFG.crabPrices.chill as number));
    expect(s.crabs.selected).toBe('chill');
    expect(buyCrab(s, 'chill')).toBe(false);
    expect(selectCrab(s, 'sandy')).toBe(true);
    expect(selectCrab(s, 'pinch')).toBe(false);
  });
  it('Dazzle cannot be bought, only earned by reaching Sunset Lagoon', () => {
    const s = defaultSave();
    s.shells = 1e6;
    expect(buyCrab(s, 'dazzle')).toBe(false);
    s.zonesSeen.push(3);
    expect(grantSkillUnlocks(s)).toEqual(['dazzle']);
    expect(grantSkillUnlocks(s)).toEqual([]);
  });
  it('upgrades go to level 4 then max out', () => {
    const s = defaultSave();
    s.shells = 1e6;
    for (let i = 0; i < 4; i++) expect(buyUpgrade(s, 'magnet')).toBe(true);
    expect(buyUpgrade(s, 'magnet')).toBe(false);
    expect(upgradeCost(4)).toBeNull();
    expect(s.upgrades.magnet).toBe(4);
  });
  it('next unlock points at something not yet affordable', () => {
    const s = defaultSave();
    s.shells = 100;
    const n = nextUnlock(s, { chill: 'Chill' });
    expect(n).not.toBeNull();
    expect(n!.need).toBeGreaterThan(0);
  });
});
