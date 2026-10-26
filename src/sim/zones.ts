import { CFG, zoneAt } from '../config';

export { zoneAt };
export const ZONE_COUNT = CFG.zoneStarts.length;

/** 0 → 1 blend factor into zone `z` for a given distance (blends over 40 m after the zone start). */
export function zoneBlend(dist: number, z: number): number {
  const start = CFG.zoneStarts[z] ?? 0;
  if (z === 0) return 1;
  return Math.min(1, Math.max(0, (dist - start) / 40));
}
