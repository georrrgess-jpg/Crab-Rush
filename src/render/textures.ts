import * as THREE from 'three';

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function rnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Light sand with soft mottling and speckles. Mostly white so vertex colours set the hue. */
export function sandTexture(dark = false): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rnd(dark ? 77 : 13);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // soft blotches (tileable by drawing wrapped copies)
  for (let i = 0; i < 60; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 10 + r() * 30;
    const a = 0.04 + r() * 0.05;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(170,130,70,${a})`);
        gr.addColorStop(1, 'rgba(170,130,70,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
  }
  // speckles
  for (let i = 0; i < (dark ? 2200 : 1600); i++) {
    const x = r() * S;
    const y = r() * S;
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(150,105,55,${0.25 + r() * 0.3})` : `rgba(255,255,245,${0.4 + r() * 0.4})`;
    const s = r() < 0.9 ? 1 : 2;
    g.fillRect(x, y, s, s);
  }
  if (dark) {
    // pebbles
    for (let i = 0; i < 40; i++) {
      const x = r() * S;
      const y = r() * S;
      g.fillStyle = `rgba(${90 + r() * 50},${80 + r() * 40},${70 + r() * 30},0.6)`;
      g.beginPath();
      g.ellipse(x, y, 1.5 + r() * 2.5, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return finish(c);
}

/** Boardwalk planks: boards run across the track. */
export function plankTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rnd(5);
  const boards = 8;
  const h = S / boards;
  for (let i = 0; i < boards; i++) {
    const shade = 0.88 + r() * 0.2;
    g.fillStyle = `rgb(${Math.round(255 * shade)},${Math.round(236 * shade)},${Math.round(210 * shade)})`;
    g.fillRect(0, i * h, S, h);
    // grain
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(120,80,40,${0.08 + r() * 0.08})`;
      g.lineWidth = 1;
      g.beginPath();
      const y = i * h + 3 + r() * (h - 6);
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 4, S * 0.6, y + (r() - 0.5) * 4, S, y);
      g.stroke();
    }
    // gap
    g.fillStyle = 'rgba(70,40,20,0.75)';
    g.fillRect(0, i * h, S, 2);
    // nails
    g.fillStyle = 'rgba(60,50,45,0.7)';
    for (const x of [S * 0.08, S * 0.5, S * 0.92]) g.fillRect(x, i * h + h / 2 - 1, 3, 3);
  }
  return finish(c);
}
