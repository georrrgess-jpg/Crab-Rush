import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { COLS, RELIC_TOTAL, ROWS, TILES, defaultDig, dig, generateSite, heat, relicId, sanitizeDig, siteReward, spadesFor } from '../src/meta/dig';

describe('Treasure Dig (UPDATE5_PLAN.md §3)', () => {
  it('every site has three relics (2, 4 and 3 tiles), its prizes and one dynamite', () => {
    for (let n = 1; n <= 60; n++) {
      const s = generateSite(n);
      expect(s.kind.length).toBe(TILES);
      const cells = [0, 1, 2].map((r) => s.relic.filter((x) => x === r).length);
      expect(cells).toEqual([2, 4, 3]);
      expect(s.kind.filter((k) => k === 'shells').length).toBe(CFG.dig.shellPiles);
      expect(s.kind.filter((k) => k === 'pearls').length).toBe(CFG.dig.pearlTiles);
      expect(s.kind.filter((k) => k === 'spade').length).toBe(CFG.dig.spadeTiles);
      expect(s.kind.filter((k) => k === 'dynamite').length).toBe(1);
      // relic cells are connected neighbours (a real shape, not scattered)
      for (let r = 0; r < 3; r++) {
        const idx = s.relic.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);
        const xs = idx.map((i) => i % COLS);
        const ys = idx.map((i) => Math.floor(i / COLS));
        expect((Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1)).toBe(idx.length);
      }
    }
    expect(generateSite(7)).toEqual(generateSite(7));
    expect(COLS * ROWS).toBe(30);
  });

  it('digging spends a spade, pays prizes and finds relics', () => {
    const st = defaultDig();
    st.spades = 50;
    const s = generateSite(1);
    const shellTile = s.kind.indexOf('shells');
    const r = dig(st, shellTile)!;
    expect(r.shells).toBe(s.amount[shellTile]);
    expect(st.spades).toBe(49);
    expect(dig(st, shellTile)).toBeNull();
    const two = s.relic.map((x, i) => (x === 0 ? i : -1)).filter((i) => i >= 0);
    expect(dig(st, two[0]!)!.found).toEqual([]);
    expect(dig(st, two[1]!)!.found).toEqual([relicId(1, 0)]);
    expect(st.relics).toContain('0:0');
  });

  it('dynamite digs its neighbours for free', () => {
    const st = defaultDig();
    st.spades = 5;
    const s = generateSite(1);
    const t = s.kind.indexOf('dynamite');
    const r = dig(st, t)!;
    const x = t % COLS;
    const y = Math.floor(t / COLS);
    const n = [x > 0, x < COLS - 1, y > 0, y < ROWS - 1].filter(Boolean).length;
    expect(r.tiles.length).toBeGreaterThanOrEqual(1 + n);
    expect(st.spades).toBe(Math.min(CFG.dig.maxSpades, 4 + r.spades));
  });

  it('finding all three relics clears the site and moves on', () => {
    const st = defaultDig();
    st.spades = 50;
    const s = generateSite(1);
    let cleared = null;
    for (let i = 0; i < TILES && !cleared; i++) if (s.kind[i] === 'relic' && !st.dug.includes(i)) cleared = dig(st, i)?.cleared ?? null;
    expect(cleared?.n).toBe(1);
    expect(st.site).toBe(2);
    expect(st.dug).toEqual([]);
    expect(st.cleared).toBe(1);
    expect(st.relics.length).toBe(3);
  });

  it('holes say how close the nearest buried relic is', () => {
    const s = generateSite(3);
    const relicTile = s.kind.indexOf('relic');
    const x = relicTile % COLS;
    const y = Math.floor(relicTile / COLS);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx!, y + dy!]).find(([a, b]) => a! >= 0 && a! < COLS && b! >= 0 && b! < ROWS)!;
    expect(heat(s, [], nb[1]! * COLS + nb[0]!)).toBe('hot');
    const far = s.kind.map((_, i) => i).filter((i) => heat(s, [], i) === 'cold');
    expect(far.length).toBeGreaterThan(0);
  });

  it('rewards grow, the Pearl crab waits at site 5, the museum has 36 relics', () => {
    expect(siteReward(2).shells).toBeGreaterThan(siteReward(1).shells);
    expect(siteReward(5).item).toBe('bodies:pearl');
    expect(RELIC_TOTAL).toBe(36);
    expect(relicId(13, 0)).toBe(relicId(1, 0));
  });

  it('spades for playing', () => {
    expect(spadesFor({ distance: 100 })).toBe(1);
    expect(spadesFor({ distance: 1700 })).toBe(5);
    expect(spadesFor({ distance: 99999 })).toBe(CFG.dig.runCap);
    expect(spadesFor({ distance: 500, daily: true })).toBe(2 + CFG.dig.daily);
    expect(spadesFor({ level: true, newStars: 2 })).toBe(3);
    expect(spadesFor({ race: true, win: true })).toBe(3);
  });

  it('sanitises bad saves', () => {
    expect(sanitizeDig(null)).toEqual(defaultDig());
    const d = sanitizeDig({ spades: 9999, site: -4, dug: [1, 1, 99, 'x'], relics: ['0:1', '99:0', 'nope'], cleared: 3 });
    expect(d.spades).toBe(CFG.dig.maxSpades);
    expect(d.site).toBe(1);
    expect(d.dug).toEqual([1]);
    expect(d.relics).toEqual(['0:1']);
  });
});
