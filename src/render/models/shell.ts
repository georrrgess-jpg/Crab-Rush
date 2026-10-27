import * as THREE from 'three';
import { PALETTE } from '../../config';

/**
 * A scallop (Update 4 v2): a domed fan with rounded ribs that bulge toward the rim, a wavy edge,
 * two ears at the hinge and a nacre sheen on the rib crests. Upright, hinge at the bottom.
 */
export function scallopGeometry(): THREE.BufferGeometry {
  const ribs = 9;
  const RU = ribs * 2; // samples across the fan: crest and groove per rib (smooth normals round them)
  const RV = 3; // rings from hinge to rim (the back is a single ring)
  const spread = Math.PI * 0.86;
  const R = 0.36;
  const hy = -R * 0.55;
  const base = new THREE.Color(PALETTE.shellGold);
  const hi = new THREE.Color(PALETTE.shellHighlight);
  const edge = new THREE.Color(PALETTE.shellEdge);
  const pearl = new THREE.Color(0xfff2f6);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const at = (u: number, v: number, back: boolean): void => {
    const a = -spread / 2 + u * spread;
    const rib = Math.cos(u * ribs * Math.PI * 2) * 0.5 + 0.5; // 1 on a crest, 0 in a groove
    const rr = R * (0.12 + v * 1.0) * (1 + (v > 0.9 ? Math.sin(u * ribs * Math.PI * 2) * 0.02 : 0));
    const x = Math.sin(a) * rr * 1.05;
    const y = hy + Math.cos(a) * rr * 1.25;
    const dome = Math.sin(v * Math.PI * 0.92) * 0.13 * Math.cos((u - 0.5) * 1.6);
    const z = back ? -0.02 - dome * 0.25 : dome + rib * 0.03 * v;
    pos.push(x, y, z);
    if (back) c.copy(edge);
    else c.copy(base).lerp(hi, rib * 0.8 * v).lerp(pearl, rib * 0.35 * v * v).lerp(edge, Math.max(0, v - 0.88) * 3);
    col.push(c.r, c.g, c.b);
  };
  for (const back of [false, true]) {
    const o = pos.length / 3;
    const rv = back ? 1 : RV;
    for (let j = 0; j <= rv; j++) for (let i = 0; i <= RU; i++) at(i / RU, j / rv, back);
    for (let j = 0; j < rv; j++) {
      for (let i = 0; i < RU; i++) {
        const a = o + j * (RU + 1) + i;
        const b2 = a + RU + 1;
        if (back) idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
        else idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
      }
    }
  }
  // ears at the hinge
  for (const s of [-1, 1]) {
    const o = pos.length / 3;
    const ear: [number, number, number][] = [[0, hy - 0.02, 0.05], [s * 0.16, hy - 0.03, 0.03], [s * 0.15, hy + 0.08, 0.04], [s * 0.04, hy + 0.06, 0.07]];
    for (const p of ear) {
      pos.push(...p);
      col.push(base.r * 0.9, base.g * 0.9, base.b * 0.9);
    }
    if (s < 0) idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
