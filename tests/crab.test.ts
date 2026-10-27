import { describe, expect, it } from 'vitest';
import { GeoBuilder } from '../src/render/geo';
import { BODY_SKINS, buildCrab } from '../src/render/models/crab';
import { HAT_KINDS, buildHat } from '../src/render/models/hats';

const tris = (g: GeoBuilder): number => {
  const geo = g.build();
  return geo.attributes.position!.count / 3;
};

describe('crab v3 model', () => {
  for (const hi of [true, false]) {
    it(`stays within the ${hi ? 'High' : 'Low'} triangle budget and binds every vertex to a bone`, () => {
      const clay = new GeoBuilder();
      const gloss = new GeoBuilder();
      const line = new GeoBuilder();
      buildCrab(BODY_SKINS[0]!, hi, clay, gloss, line);
      const c = clay.build();
      const gl = gloss.build();
      const total = (c.attributes.position!.count + gl.attributes.position!.count) / 3;
      if (process.env.CRAB) console.log(hi ? 'high' : 'low', 'crab tris', total, 'outline', tris(line));
      // Crab v3 budgets (UPDATE3_PLAN.md §4)
      expect(total).toBeLessThanOrEqual(hi ? 9000 : 3500);
      for (const g of [c, gl]) {
        const si = g.attributes.skinIndex!;
        const sw = g.attributes.skinWeight!;
        expect(si.count).toBe(g.attributes.position!.count);
        for (let i = 0; i < si.count; i++) {
          expect(sw.getX(i)).toBe(1);
          expect(si.getX(i)).toBeLessThan(37);
        }
      }
    });
  }
  it('builds every body skin', () => {
    for (const s of BODY_SKINS) {
      const b = [new GeoBuilder(), new GeoBuilder(), new GeoBuilder()] as const;
      buildCrab(s, true, b[0], b[1], b[2]);
      expect(b[1].build().attributes.position!.count).toBeGreaterThan(0);
    }
  });
  it('builds every wardrobe hat', () => {
    for (const k of HAT_KINDS) {
      const h = buildHat(k);
      if (k === 'none') expect(h.geo).toBeNull();
      else expect(h.geo!.attributes.position!.count / 3).toBeLessThan(2500);
    }
  });
});
