import * as THREE from 'three';

/**
 * Shared materials. Characters, obstacles and props use matcap shading (zero lighting cost, glossy
 * "toy" look); the ground/ocean/sky use unlit materials with baked textures.
 */

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

/** Soft clay matcap: warm light from the top-left, cool shadow, small specular and a rim. */
function makeMatcap(opts: { ambient: number; spec: number; shadowTint: [number, number, number]; lightTint: [number, number, number]; rim: number }): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  const img = g.createImageData(S, S);
  const L = new THREE.Vector3(-0.45, 0.75, 0.55).normalize();
  const V = new THREE.Vector3(0, 0, 1);
  const n = new THREE.Vector3();
  const r = new THREE.Vector3();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1;
      const v = -((y + 0.5) / S * 2 - 1);
      const d2 = u * u + v * v;
      const i = (y * S + x) * 4;
      if (d2 > 1) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = 255;
        continue;
      }
      n.set(u, v, Math.sqrt(1 - d2));
      const diff = Math.max(0, n.dot(L));
      const half = Math.pow(diff, 0.8);
      r.copy(n).multiplyScalar(2 * n.dot(L)).sub(L);
      const spec = Math.pow(Math.max(0, r.dot(V)), 28) * opts.spec;
      const rim = Math.pow(1 - n.z, 2.5) * opts.rim;
      const k = opts.ambient + (1 - opts.ambient) * half;
      const t = k; // 0 shadow .. 1 light
      const cr = (opts.shadowTint[0] * (1 - t) + opts.lightTint[0] * t) * k + spec + rim * 0.5;
      const cg = (opts.shadowTint[1] * (1 - t) + opts.lightTint[1] * t) * k + spec + rim * 0.6;
      const cb = (opts.shadowTint[2] * (1 - t) + opts.lightTint[2] * t) * k + spec + rim * 0.8;
      img.data[i] = Math.min(255, cr * 255);
      img.data[i + 1] = Math.min(255, cg * 255);
      img.data[i + 2] = Math.min(255, cb * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Materials {
  readonly clayMatcap = makeMatcap({ ambient: 0.62, spec: 0.35, shadowTint: [0.78, 0.84, 1.0], lightTint: [1.08, 1.04, 0.95], rim: 0.18 });
  readonly goldMatcap = makeMatcap({ ambient: 0.7, spec: 0.8, shadowTint: [0.95, 0.85, 0.7], lightTint: [1.15, 1.08, 0.9], rim: 0.25 });
  readonly glossMatcap = makeMatcap({ ambient: 0.55, spec: 0.7, shadowTint: [0.75, 0.82, 1.0], lightTint: [1.1, 1.06, 1.0], rim: 0.2 });

  /** vertex-coloured clay: the default for everything solid */
  readonly clay = new THREE.MeshMatcapMaterial({ matcap: this.clayMatcap, vertexColors: true });
  readonly gloss = new THREE.MeshMatcapMaterial({ matcap: this.glossMatcap, vertexColors: true });
  readonly gold = new THREE.MeshMatcapMaterial({ matcap: this.goldMatcap, vertexColors: true });
  /** translucent bubble (shield) */
  readonly bubble = new THREE.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.28, depthWrite: false });
  readonly unlitVC = new THREE.MeshBasicMaterial({ vertexColors: true });

  readonly glowTex = makeRadial([[0, 'rgba(255,240,170,1)'], [0.35, 'rgba(255,200,70,0.55)'], [1, 'rgba(255,180,40,0)']]);
  readonly shadowTex = makeRadial([[0, 'rgba(40,30,10,0.55)'], [0.6, 'rgba(40,30,10,0.25)'], [1, 'rgba(40,30,10,0)']]);
  readonly sparkTex = makeRadial([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
  readonly dustTex = makeRadial([[0, 'rgba(255,240,205,0.62)'], [0.6, 'rgba(240,215,160,0.3)'], [1, 'rgba(240,215,160,0)']]);

  /** mutable colour materials for tinting (e.g. beach ball seams) are created on demand */
  basic(color: number, opts: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, ...opts });
  }
}

export function makeRadial(stops: [number, string][], size = 64): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { canvas as makeCanvas };
