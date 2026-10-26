import * as THREE from 'three';
import { CFG } from '../config';
import type { ZonePalette } from './palettes';

const vert = /* glsl */ `
uniform float uTime;
uniform float uDist;
uniform float uWaves;
varying vec2 vWorld;
varying float vViewZ;
varying vec3 vWorldPos;
void main() {
  vec3 p = position;
  // plane lies in x/z; z is "toward the player"; world scroll via uDist
  float wz = p.z - uDist;               // fixed coordinate along the track (plane scrolls with the player)
  vWorld = vec2(p.x, -wz);
  p.y += uWaves * (sin(p.x * 0.35 + uTime * 0.9 + wz * 0.05) * 0.12 + sin(wz * 0.22 + uTime * 1.3) * 0.09);
  vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uZones;      // zone start distances (pier, cove, sunset)
uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uFog;
uniform float uFogNear; uniform float uFogFar;
uniform vec3 uSky; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uDetail;
varying vec2 vWorld;
varying float vViewZ;
varying vec3 vWorldPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  // shoreline depends on the zone at this point of the track (pier = water on both sides)
  float W = vWorld.y;
  bool pier = W >= uZones.x && W < uZones.y;
  float shoreR = pier ? 4.6 : (W >= uZones.y && W < uZones.z ? 7.4 : 8.4);
  float shoreL = pier ? -4.6 : -1000.0;
  float x = max(vWorld.x - shoreR, shoreL - vWorld.x);   // distance from the nearest shoreline
  float depth = smoothstep(0.0, 22.0, x);
  vec3 col = mix(uShallow, uMid, smoothstep(0.0, 8.0, x));
  col = mix(col, uDeep, depth);
  // soft bands + sparkles
  float n = noise(vec2(vWorld.x * 0.35, vWorld.y * 0.12 + uTime * 0.35));
  col += (n - 0.5) * 0.14;
  float sp = noise(vec2(vWorld.x * 1.6 + uTime * 0.5, vWorld.y * 0.5 - uTime * 0.8));
  col += smoothstep(0.82, 1.0, sp) * 0.22;
  // rolling foam lines that travel toward the beach
  float wave = fract(x * 0.09 - uTime * 0.07 + n * 0.25);
  float line = smoothstep(0.0, 0.03, wave) * (1.0 - smoothstep(0.03, 0.09, wave));
  col = mix(col, uFoam, line * (1.0 - depth) * 0.55);
  // Fresnel: grazing angles reflect the sky
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  col = mix(col, uSky, fres * 0.55);
  // sun glints from procedural ripple normals (skipped on Low)
  if (uDetail > 0.5) {
    vec2 q = vec2(vWorld.x * 1.3, vWorld.y * 0.9) + vec2(uTime * 0.4, -uTime * 0.6);
    float h0 = noise(q);
    float hx = noise(q + vec2(0.15, 0.0));
    float hz = noise(q + vec2(0.0, 0.15));
    vec3 N = normalize(vec3((h0 - hx) * 3.0, 1.0, (h0 - hz) * 3.0));
    vec3 R = reflect(-V, N);
    float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 160.0);
    col += uSunColor * glint * 1.6 * (1.0 - depth * 0.3);
  }
  // shoreline wash: the water's edge advances and recedes, a trailing foam line follows it
  float wash = sin(uTime * 0.55) * 0.9 + sin(uTime * 0.23 + 1.3) * 0.45;
  float edge = x + wash + sin(vWorld.y * 0.25 + uTime * 1.1) * 0.5 + sin(vWorld.y * 0.9 - uTime * 1.7) * 0.18 + (n - 0.5) * 0.6;
  float foam = 1.0 - smoothstep(0.0, 1.3, edge);
  float trail = (1.0 - smoothstep(0.0, 0.35, abs(edge - 1.9 - wash * 0.4))) * 0.45 * (0.6 + 0.4 * noise(vWorld * vec2(0.8, 0.3)));
  col = mix(col, uFoam, clamp(foam + trail, 0.0, 1.0));
  float alpha = smoothstep(-0.3, 0.35, edge + 0.3);
  float f = clamp((vViewZ - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFog, f);
  gl_FragColor = vec4(col, alpha);
}`;

export class Ocean {
  readonly mesh: THREE.Mesh = new THREE.Mesh();
  private mat: THREE.ShaderMaterial;
  constructor(waves: boolean) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uDist: { value: 0 },
        uWaves: { value: waves ? 1 : 0 },
        uZones: { value: new THREE.Vector3(...CFG.zoneStarts.slice(1, 4)) },
        uSky: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 0.5, -1) },
        uSunColor: { value: new THREE.Color() },
        uDetail: { value: waves ? 1 : 0 },
        uShallow: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uFoam: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uFogNear: { value: 20 },
        uFogFar: { value: 95 },
      },
    });
    this.setWaves(waves);
    this.mesh.renderOrder = -5;
    this.mesh.frustumCulled = false;
  }
  private geo: THREE.PlaneGeometry | null = null;
  private setWaves(waves: boolean): void {
    this.geo?.dispose();
    // x from shore to far sea, z from behind the camera to far ahead
    const w = 160;
    const l = 260;
    this.geo = new THREE.PlaneGeometry(w * 2, l, waves ? 60 : 1, waves ? 80 : 1);
    this.geo.rotateX(-Math.PI / 2);
    this.geo.translate(0, -0.04, -l / 2 + 20);
    this.mesh.geometry = this.geo;
    this.mesh.material = this.mat;
    (this.mat.uniforms.uWaves as { value: number }).value = waves ? 1 : 0;
    (this.mat.uniforms.uDetail as { value: number }).value = waves ? 1 : 0;
  }
  setQualityWaves(waves: boolean): void {
    if ((this.mat.uniforms.uWaves as { value: number }).value === (waves ? 1 : 0)) return;
    this.setWaves(waves);
  }
  update(time: number, dist: number, p: ZonePalette, fogNear: number, fogFar: number): void {
    const u = this.mat.uniforms as Record<string, { value: THREE.Color }>;
    (this.mat.uniforms.uTime as { value: number }).value = time;
    (this.mat.uniforms.uDist as { value: number }).value = dist;
    u.uShallow!.value.copy(p.oceanShallow);
    u.uMid!.value.copy(p.oceanMid);
    u.uDeep!.value.copy(p.oceanDeep);
    u.uFoam!.value.copy(p.foam);
    u.uSky!.value.copy(p.skyHorizon).lerp(p.skyMid, 0.4);
    u.uSunColor!.value.copy(p.sunColor);
    (this.mat.uniforms.uSunDir as { value: THREE.Vector3 }).value.copy(p.sunDir);
    u.uFog!.value.copy(p.fog);
    (this.mat.uniforms.uFogNear as { value: number }).value = fogNear;
    (this.mat.uniforms.uFogFar as { value: number }).value = fogFar;
  }
}
