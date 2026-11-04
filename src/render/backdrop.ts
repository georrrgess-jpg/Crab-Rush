import { CFG } from '../config';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';
import type { ZonePalette } from './palettes';
import { boat } from './props';

const vert = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const frag = /* glsl */ `
uniform vec3 uHaze; uniform float uAmount; uniform vec3 uSun; uniform vec3 uTint; uniform float uAmb;
varying vec3 vColor; varying vec3 vNormal;
void main() {
  float l = uAmb + (1.1 - uAmb) * max(0.0, dot(normalize(vNormal), normalize(uSun)));
  vec3 c = vColor * uTint * l;
  gl_FragColor = vec4(mix(c, uHaze, uAmount), 1.0);
}`;

// Update 7: clouds get volume. Undersides sink toward the zone's shadow colour, sun-facing puffs
// warm up, and edges seen against the light pick up a silver lining.
/** Update 9 cloud drift (to move into CFG.sky): loop width (m), drift speed range (m/s, toward -x:
 *  the breeze comes off the sea), and how far from the loop's ends a cloud starts to thin away */
const CLOUD_SPAN = CFG.clouds.cloudSpan;
const CLOUD_SPEED_MIN = CFG.clouds.cloudSpeedMin;
const CLOUD_SPEED_MAX = CFG.clouds.cloudSpeedMax;
const CLOUD_EDGE = CFG.clouds.cloudEdge;

// Update 9: every cloud drifts on the GPU (aCloud = its centre and speed), wrapping round a loop
// wider than the view; near the loop's ends it shrinks away, and its puffs billow slowly
const cloudVert = /* glsl */ `
attribute vec3 color;
attribute vec4 aCloud;
uniform float uTime;
uniform float uSpan;
uniform float uEdge;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec3 c = aCloud.xyz;
  float x = mod(c.x + uTime * aCloud.w + uSpan * 0.5, uSpan) - uSpan * 0.5;
  float k = smoothstep(uSpan * 0.5, uSpan * 0.5 - uEdge, abs(x));
  float billow = 1.0 + 0.04 * sin(uTime * 0.23 + c.x * 0.1 + position.y * 0.35 + position.x * 0.05);
  vec3 p = vec3(x, c.y, c.z) + (position - c) * k * billow;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const cloudFrag = /* glsl */ `
uniform vec3 uHaze; uniform float uAmount; uniform vec3 uSun; uniform vec3 uTint; uniform vec3 uShade; uniform vec3 uSunColor;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 sd = normalize(uSun);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 base = vColor * uTint;
  // underside shade: a soft gradient on the normal's height, not a hard terminator
  vec3 c = mix(mix(base, uShade, 0.42), base, smoothstep(-0.75, 0.45, n.y));
  float lit = max(0.0, dot(n, sd));
  c *= 0.9 + 0.16 * lit;
  c += uSunColor * pow(lit, 6.0) * 0.08;
  // silver lining: grazing edges brighten, more so on the side toward the sun
  float rim = pow(1.0 - abs(dot(n, v)), 3.0);
  float back = 0.35 + 0.65 * max(0.0, dot(-v, sd));
  c += mix(vec3(1.0), uSunColor, 0.5) * rim * back * 0.3;
  gl_FragColor = vec4(mix(c, uHaze, uAmount), 1.0);
}`;

function cloudMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: cloudVert,
    fragmentShader: cloudFrag,
    fog: false,
    uniforms: {
      uHaze: { value: new THREE.Color(0xcdefff) },
      uAmount: { value: 0.1 },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0x9fb4dc) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
      uSpan: { value: CLOUD_SPAN },
      uEdge: { value: CLOUD_EDGE },
    },
  });
}

function hazeMat(amount: number, amb = 0.72): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    fog: false,
    uniforms: {
      uHaze: { value: new THREE.Color(0xcdefff) },
      uAmount: { value: amount },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uAmb: { value: amb },
    },
  });
}

function island(scale: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const rockCols = [0x9b8577, 0x8a7466, 0xb09a86];
  for (let i = 0; i < 5; i++) b.ico(rockCols[i % 3] as number, 7 + i * 1.5, [(i - 2) * 6, 2 + (i % 2) * 3, (i % 3) * 3], [1.3, 0.9 + (i === 2 ? 0.6 : 0), 1], 1, 0.2, 40 + i);
  b.sphere(0x3f9a4f, 11, [0, 9, 0], [1.6, 0.35, 1.0], 12);
  b.sphere(0x4cae58, 6, [-9, 8, 2], [1.3, 0.45, 1], 10);
  // lighthouse
  for (let i = 0; i < 5; i++) b.cyl(i % 2 ? 0xe53935 : 0xffffff, 1.5 - i * 0.12, 1.62 - i * 0.12, 2.6, [2, 11.3 + i * 2.6, 0], [0, 0, 0], 12);
  b.cyl(0x2c3e66, 1.4, 1.4, 0.4, [2, 24.3, 0], [0, 0, 0], 12);
  // Update 8: a gallery rail round the lantern room and a few windows up the tower
  b.torus(0x2c3e66, 1.75, 0.08, [2, 25.0, 0], [Math.PI / 2, 0, 0], 14, [1, 1, 1], 3);
  for (let i = 0; i < 6; i++) b.cyl(0x2c3e66, 0.06, 0.06, 0.7, [2 + Math.cos((i / 6) * Math.PI * 2) * 1.75, 24.65, Math.sin((i / 6) * Math.PI * 2) * 1.75], [0, 0, 0], 3);
  for (let i = 0; i < 3; i++) b.box(0x2c3e66, 0.5, 0.8, 0.1, [2, 13.5 + i * 4.2, 1.45 - i * 0.12]);
  b.cyl(0xfff3c4, 1.0, 1.0, 1.6, [2, 25.3, 0], [0, 0, 0], 12);
  b.cone(0xe53935, 1.5, 1.6, [2, 26.9, 0], [0, 0, 0], 12);
  b.box(0xfff4dc, 4, 2.6, 3, [-3, 10.6, 1]);
  b.cone(0xe53935, 2.6, 1.6, [-3, 12.7, 1], [0, Math.PI / 4, 0], 4);
  const g = b.build();
  g.scale(scale, scale, scale);
  return g;
}

function hills(seed: number, color: number, n: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let i = 0; i < n; i++) {
    const s = 10 + ((seed * (i + 3)) % 9);
    b.sphere(new THREE.Color(color).multiplyScalar(0.9 + (i % 3) * 0.07).getHex(), s, [i * 16, 0, (i % 2) * 8], [1.6, 0.55, 1], 10);
  }
  return b.build();
}

function cloud(seed: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  let s = seed;
  const r = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // Update 9: 8 segments a puff (was 10): overlapping puffs hide the facets, and it frees ~1k triangles
  for (let i = 0; i < 6; i++) b.sphere(0xffffff, 3 + r() * 3, [(i - 2.5) * 3.2, r() * 2, r() * 2], [1, 0.75, 0.6], 8);
  b.sphere(0xf2f8ff, 5, [0, -1.4, 0], [3.2, 0.35, 0.8], 8);
  return b.build();
}

/** Far scenery fixed relative to the player: never recycled, gently drifting. */
export class Backdrop {
  readonly group = new THREE.Group();
  private islandMesh: THREE.Mesh;
  private boats: THREE.Mesh[] = [];
  private clouds: THREE.Mesh;
  private hillsMesh: THREE.Mesh;
  private landMat = hazeMat(0.28);
  private farMat = hazeMat(0.5);
  private cloudMat = cloudMat();
  private zone = -1;

  constructor() {
    this.islandMesh = new THREE.Mesh(island(1), this.landMat);
    this.islandMesh.position.set(70, -2, -175);
    this.group.add(this.islandMesh);
    this.hillsMesh = new THREE.Mesh(hills(3, 0x4a9a52, 7), this.farMat);
    this.hillsMesh.position.set(-150, -3, -175);
    this.group.add(this.hillsMesh);
    const boatGeo = [0xe53935, 0x2f6fd6, 0xffc933].map((c) => {
      const g = boat(c);
      g.scale(2.2, 2.2, 2.2);
      return g;
    });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(boatGeo[i] as THREE.BufferGeometry, this.landMat);
      m.position.set(25 + i * 30, -0.5, -140 - i * 12);
      m.rotation.y = 1.2 + i * 0.5;
      this.boats.push(m);
      this.group.add(m);
    }
    // all clouds share one merged mesh (one draw call); each drifts on its own (aCloud)
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const g = cloud(11 + i * 7);
      const s = 1 + (i % 3) * 0.3;
      g.scale(s, s, s);
      const cx = -CLOUD_SPAN / 2 + (i + 0.5) * (CLOUD_SPAN / 7);
      const cy = 28 + (i % 3) * 9;
      const cz = -170 + (i % 2) * 15;
      g.translate(cx, cy, cz);
      const speed = -(CLOUD_SPEED_MIN + (CLOUD_SPEED_MAX - CLOUD_SPEED_MIN) * (((i * 5) % 7) / 6));
      const n = g.attributes.position!.count;
      const a = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) a.set([cx, cy, cz, speed], k * 4);
      g.setAttribute('aCloud', new THREE.BufferAttribute(a, 4));
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aCloud'].includes(key)) g.deleteAttribute(key);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    const merged = mergeGeometries(parts, false);
    if (!merged) throw new Error('Backdrop: cloud merge failed');
    this.clouds = new THREE.Mesh(merged, this.cloudMat);
    this.group.add(this.clouds);
    for (const m of this.group.children) m.frustumCulled = false;
  }

  setDetail(full: boolean): void {
    for (const b of this.boats) b.visible = full;
  }

  update(time: number, zone: number, p: ZonePalette): void {
    for (const mat of [this.landMat, this.farMat, this.cloudMat]) {
      (mat.uniforms.uHaze as { value: THREE.Color }).value.copy(p.skyHorizon);
      (mat.uniforms.uSun as { value: THREE.Vector3 }).value.copy(p.sunDir);
    }
    (this.cloudMat.uniforms.uTint as { value: THREE.Color }).value.copy(p.cloud);
    (this.cloudMat.uniforms.uShade as { value: THREE.Color }).value.copy(p.lightShadow).lerp(p.skyMid, 0.35);
    (this.cloudMat.uniforms.uSunColor as { value: THREE.Color }).value.copy(p.sunColor);
    (this.landMat.uniforms.uTint as { value: THREE.Color }).value.copy(p.groundTint);
    if (zone !== this.zone) {
      this.zone = zone;
      // the lighthouse gets closer as you progress
      const pos = [
        [70, -2, -175, 1],
        [55, -2, -165, 1.15],
        [38, -2, -140, 1.45],
        [80, -2, -180, 0.95],
      ][zone] as number[];
      this.islandMesh.position.set(pos[0] as number, pos[1] as number, pos[2] as number);
      this.islandMesh.scale.setScalar(pos[3] as number);
      this.hillsMesh.visible = zone !== 1;
    }
    for (let i = 0; i < this.boats.length; i++) {
      const b = this.boats[i] as THREE.Mesh;
      b.position.x = 25 + i * 30 + Math.sin(time * 0.05 + i * 2) * 8;
      b.position.y = -0.5 + Math.sin(time * 1.2 + i) * 0.25;
      b.rotation.z = Math.sin(time * 0.9 + i) * 0.05;
    }
    (this.cloudMat.uniforms.uTime as { value: number }).value = time;
  }
}
