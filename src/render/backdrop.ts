import * as THREE from 'three';
import { GeoBuilder, mergeAll } from './geo';
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
  for (let i = 0; i < 6; i++) b.sphere(0xffffff, 3 + r() * 3, [(i - 2.5) * 3.2, r() * 2, r() * 2], [1, 0.75, 0.6], 10);
  b.sphere(0xf2f8ff, 5, [0, -1.4, 0], [3.2, 0.35, 0.8], 10);
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
  private cloudMat = hazeMat(0.1, 0.97);
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
    // all clouds share one merged mesh (one draw call); the group sways slowly
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const g = cloud(11 + i * 7);
      const s = 1 + (i % 3) * 0.3;
      g.scale(s, s, s);
      g.translate(-130 + i * 44, 28 + (i % 3) * 9, -170 + (i % 2) * 15);
      parts.push(g);
    }
    this.clouds = new THREE.Mesh(mergeAll(parts), this.cloudMat);
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
    this.clouds.position.x = Math.sin(time * 0.012) * 22;
  }
}
