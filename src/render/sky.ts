import * as THREE from 'three';
import type { ZonePalette } from './palettes';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const frag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon;
uniform vec3 uSunColor; uniform vec3 uSunDir;
uniform float uTime; uniform float uCirrus; uniform float uNight;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uTop, smoothstep(0.12, 0.8, h));
  float s = max(0.0, dot(d, normalize(uSunDir)));
  // sun disk with a soft bloom halo
  col += uSunColor * (smoothstep(0.9975, 0.999, s) * 0.9 + pow(s, 220.0) * 0.8 + pow(s, 24.0) * 0.28 + pow(s, 5.0) * 0.1);
  // high cirrus streaks: stretched noise on a plane above the camera, drifting slowly
  if (uCirrus > 0.0 && d.y > 0.02) {
    vec2 uv = d.xz / (d.y + 0.12);
    uv = vec2(uv.x * 0.6 + uTime * 0.004, uv.y * 3.2);
    float n = noise(uv * 2.0) * 0.6 + noise(uv * 4.3 + 3.1) * 0.3 + noise(uv * 9.0) * 0.1;
    float c = smoothstep(0.55, 0.85, n) * smoothstep(0.02, 0.2, d.y) * (1.0 - smoothstep(0.5, 0.9, d.y));
    col = mix(col, mix(vec3(1.0), uSunColor, 0.35 + 0.4 * s), c * 0.42 * uCirrus);
  }
  // dusk: darken toward a deep blue and let stars through
  if (uNight > 0.0) {
    vec3 nightCol = mix(vec3(0.16, 0.12, 0.3), vec3(0.04, 0.05, 0.16), smoothstep(0.0, 0.5, h));
    col = mix(col, nightCol + uHorizon * 0.18 * (1.0 - h), uNight * 0.85);
  }
  // below the horizon (seen through gaps) fade to the horizon colour
  col = mix(col, uHorizon, step(d.y, 0.0));
  gl_FragColor = vec4(col, 1.0);
}`;

/** Gradient sky with sun halo, cirrus streaks and (Sunset, late) a dusk fade with stars. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly stars: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private starMat: THREE.PointsMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, -1) },
        uTime: { value: 0 },
        uCirrus: { value: 1 },
        uNight: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), this.mat);
    this.mesh.renderOrder = -100;
    this.mesh.frustumCulled = false;

    // stars: a fixed dome of points, additive, faded in with uNight
    const n = 260;
    const pos = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.08 + rnd() * 0.9;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 90;
      pos[i * 3 + 1] = y * 90;
      pos[i * 3 + 2] = Math.sin(a) * r * 90;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xfff6e0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -99;
    this.stars.frustumCulled = false;
    this.stars.visible = false;
  }
  apply(p: ZonePalette): void {
    const u = this.mat.uniforms as Record<string, { value: THREE.Color & THREE.Vector3 }>;
    u.uTop!.value.copy(p.skyTop);
    u.uMid!.value.copy(p.skyMid);
    u.uHorizon!.value.copy(p.skyHorizon);
    u.uSunColor!.value.copy(p.sunColor);
    u.uSunDir!.value.copy(p.sunDir);
  }
  /** time in seconds, night 0..1, cirrus on/off (Low tier off) */
  update(time: number, night: number, cirrus: boolean): void {
    const u = this.mat.uniforms;
    u.uTime!.value = time;
    u.uNight!.value = night;
    u.uCirrus!.value = cirrus ? 1 : 0;
    this.starMat.opacity = Math.max(0, night * 1.2 - 0.2);
    this.stars.visible = night > 0.17;
  }
}
