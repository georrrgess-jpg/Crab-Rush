import * as THREE from 'three';
import { PALETTE } from '../../config';

/** A stylised scallop: a fan of ridged wedges standing upright, hinge at the bottom. */
export function scallopGeometry(): THREE.BufferGeometry {
  const ribs = 11;
  const spread = Math.PI * 0.88; // fan angle
  const R = 0.34;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new THREE.Color(PALETTE.shellGold);
  const hi = new THREE.Color(PALETTE.shellHighlight);
  const edge = new THREE.Color(PALETTE.shellEdge);
  const c = new THREE.Color();
  const pearl = new THREE.Color(0xfff2f6);
  const push = (x: number, y: number, z: number, color: THREE.Color): number => {
    pos.push(x, y, z);
    col.push(color.r, color.g, color.b);
    return pos.length / 3 - 1;
  };
  // hinge (centre) is slightly thick
  const hinge = push(0, -R * 0.55, 0.04, hi);
  const hingeBack = push(0, -R * 0.55, -0.05, edge);
  // outer ring of vertices: for each rib an edge point and a mid-rib raised point
  const ring: { rib: number; mid: number; back: number }[] = [];
  for (let i = 0; i <= ribs; i++) {
    const a = -spread / 2 + (i / ribs) * spread;
    const ex = Math.sin(a) * R * 1.05;
    const ey = -R * 0.55 + Math.cos(a) * R * 1.3;
    const edgeIdx = push(ex, ey, 0.0, edge);
    ring.push({ rib: edgeIdx, mid: -1, back: push(ex, ey, -0.02, edge) });
  }
  // raised mid-points between ribs
  const mids: number[] = [];
  for (let i = 0; i < ribs; i++) {
    const a = -spread / 2 + ((i + 0.5) / ribs) * spread;
    const mx = Math.sin(a) * R * 1.0;
    const my = -R * 0.55 + Math.cos(a) * R * 1.22;
    // pearly ridges: alternate a pale nacre tone with the gold
    const m = push(mx, my, 0.11, i % 2 === 0 ? c.copy(hi).lerp(pearl, 0.35) : base);
    mids.push(m);
    // inner raised point halfway to the hinge
    c.copy(base);
  }
  const inner: number[] = [];
  for (let i = 0; i < ribs; i++) {
    const a = -spread / 2 + ((i + 0.5) / ribs) * spread;
    inner.push(push(Math.sin(a) * R * 0.5, -R * 0.55 + Math.cos(a) * R * 0.55, 0.15, base));
  }
  for (let i = 0; i < ribs; i++) {
    const e0 = (ring[i] as { rib: number }).rib;
    const e1 = (ring[i + 1] as { rib: number }).rib;
    const m = mids[i] as number;
    const n = inner[i] as number;
    // front: hinge → inner → mid → edges
    idx.push(hinge, e0, n, hinge, n, e1);
    idx.push(n, e0, m, n, m, e1);
    idx.push(m, e0, e1);
    // back
    const b0 = (ring[i] as { back: number }).back;
    const b1 = (ring[i + 1] as { back: number }).back;
    idx.push(hingeBack, b1, b0);
    idx.push(b0, b1, m);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
