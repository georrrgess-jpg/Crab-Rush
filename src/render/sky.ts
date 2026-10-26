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
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uTop, smoothstep(0.12, 0.8, h));
  float s = max(0.0, dot(d, normalize(uSunDir)));
  col += uSunColor * (pow(s, 220.0) * 1.2 + pow(s, 24.0) * 0.22 + pow(s, 5.0) * 0.08);
  // below the horizon (seen through gaps) fade to the horizon colour
  col = mix(col, uHorizon, step(d.y, 0.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
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
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), this.mat);
    this.mesh.renderOrder = -100;
    this.mesh.frustumCulled = false;
  }
  apply(p: ZonePalette): void {
    const u = this.mat.uniforms as Record<string, { value: THREE.Color & THREE.Vector3 }>;
    u.uTop!.value.copy(p.skyTop);
    u.uMid!.value.copy(p.skyMid);
    u.uHorizon!.value.copy(p.skyHorizon);
    u.uSunColor!.value.copy(p.sunColor);
    u.uSunDir!.value.copy(p.sunDir);
  }
}
