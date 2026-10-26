import * as THREE from 'three';
import { CFG, PALETTE, QUALITY, type QualityPreset } from '../config';
import { CAMERA_ELEVATION, fitCamera } from './camera';

/** Owns the WebGL renderer, scene and camera. Resizes with the viewport and quality tier. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.1, 200);
  quality: QualityPreset;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private dprScale = 1; // dynamic resolution multiplier (auto quality)
  private baseFov: number = CFG.camera.fov;
  contextLost = false;
  onContextLost: () => void = () => {};
  onContextRestored: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement, quality: QualityPreset) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias && Math.min(window.devicePixelRatio || 1, 2) < 1.5,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.gl.setClearColor(PALETTE.skyHorizon);
    this.gl.info.autoReset = false;
    this.scene.fog = new THREE.Fog(PALETTE.skyHorizon, 20, quality.fogFar);
    this.scene.background = new THREE.Color(PALETTE.skyHorizon);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.onContextRestored();
    });
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    (this.scene.fog as THREE.Fog).far = q.fogFar;
    this.applySize();
  }

  /** Dynamic resolution multiplier used by the auto-quality manager (0.5–1). */
  setDprScale(s: number): void {
    this.dprScale = s;
    this.applySize();
  }
  get currentDpr(): number {
    return this.dpr;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.applySize();
  }

  private applySize(): void {
    const native = window.devicePixelRatio || 1;
    this.dpr = Math.max(0.5, Math.min(native, this.quality.maxDpr) * this.dprScale);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(this.width, this.height, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = this.width / this.height;
    this.updateCameraProjection();
  }

  private updateCameraProjection(): void {
    const fit = fitCamera(this.camera.aspect, this.baseFov);
    this.camera.fov = fit.fov;
    this.camera.updateProjectionMatrix();
    this.fitDist = fit.dist;
  }
  fitDist = 8.1;

  /** Speed-dependent FOV (pass 0..1 for speed progress, extra degrees for Wave Rider). */
  setFovBoost(t: number, extra = 0): void {
    const base = CFG.camera.fov + (CFG.camera.fovMaxSpeed - CFG.camera.fov) * t + extra;
    if (Math.abs(base - this.baseFov) > 0.01) {
      this.baseFov = base;
      this.updateCameraProjection();
    }
  }

  /** Place the camera relative to the player. `lateral` is the player's x. */
  placeCamera(lateral: number, shakeX = 0, shakeY = 0): void {
    const d = this.fitDist;
    const el = CAMERA_ELEVATION;
    const focusX = lateral * 0.4;
    this.camera.position.set(focusX + shakeX, 0.5 + Math.sin(el) * d + shakeY, Math.cos(el) * d);
    this.camera.lookAt(lateral * 0.6, CFG.camera.lookY, -CFG.camera.lookAhead);
  }

  render(): void {
    if (this.contextLost) return;
    this.gl.info.reset();
    this.gl.render(this.scene, this.camera);
  }

  get stats(): { calls: number; triangles: number } {
    return { calls: this.gl.info.render.calls, triangles: this.gl.info.render.triangles };
  }
}

export function pickQuality(flag: string | null, saved: string): QualityPreset {
  const n = (flag ?? saved) as string;
  if (n === 'low' || n === 'medium' || n === 'high') return QUALITY[n];
  // Auto: guess from device
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const short = Math.min(window.screen.width, window.screen.height) * dpr;
  if (cores <= 4 && short < 1200) return QUALITY.low;
  if (cores <= 4 || short > 2200) return QUALITY.medium;
  return QUALITY.high;
}
