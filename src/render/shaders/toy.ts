import * as THREE from 'three';
import type { ZonePalette } from '../palettes';

/**
 * "Toy" shading (UPDATE2_PLAN.md §1.2): half-Lambert wrapped sun light between a shadow and a sun
 * colour, a hemisphere sky/ground term, a rim light and an optional specular dot. Lighting colours
 * come from shared uniforms so a zone's time of day re-lights every object. Lighting is computed in
 * view space; the shared direction uniforms are refreshed once per frame by ToyLighting.update().
 *
 * Variants (defines): TOY_GLOSS (specular), TOY_LITE (Low tier: no rim/spec), TOY_EMISSIVE (unlit),
 * TOY_MAP (multiplies a texture; used by ground), plus three's instancing/vertex colours/fog chunks.
 */

export interface ToyLightingUniforms {
  [k: string]: THREE.IUniform;
  uSunDirV: THREE.IUniform<THREE.Vector3>;
  uUpV: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uShadowColor: THREE.IUniform<THREE.Color>;
  uSkyColor: THREE.IUniform<THREE.Color>;
  uGroundColor: THREE.IUniform<THREE.Color>;
  uRimColor: THREE.IUniform<THREE.Color>;
  /** x exposure, y saturation, z warmth, w rim strength */
  uGrade: THREE.IUniform<THREE.Vector4>;
  /** seconds, for wind and other vertex animation */
  uTime: THREE.IUniform<number>;
}

const vert = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vNormalV;
varying vec3 vViewPos;
#ifdef TOY_WIND
attribute float wind;
uniform float uTime;
#endif
void main() {
  #include <uv_vertex>
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #ifdef TOY_WIND
    // living world (UPDATE2_PLAN.md §1.7): wind > 0 sways (palms, seaweed), wind < 0 flutters (flags)
    if (wind != 0.0) {
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      float ph = wp.x * 0.37 + wp.z * 0.23;
      if (wind > 0.0) {
        transformed.x += (sin(uTime * 1.6 + ph) + 0.35 * sin(uTime * 3.7 + ph * 2.1)) * wind;
        transformed.z += sin(uTime * 1.13 + ph * 1.3) * wind * 0.45;
      } else {
        float f = -wind;
        transformed.z += sin(uTime * 9.0 + transformed.x * 7.0 + transformed.y * 3.0 + ph) * f;
        transformed.y += sin(uTime * 7.0 + transformed.x * 5.0 + ph) * f * 0.35;
      }
    }
  #endif
  #include <project_vertex>
  #include <fog_vertex>
  vNormalV = normalize(transformedNormal);
  vViewPos = mvPosition.xyz;
}`;

const frag = /* glsl */ `
#include <common>
#include <uv_pars_fragment>
#include <color_pars_fragment>
#include <fog_pars_fragment>
uniform vec3 diffuse;
uniform vec3 uSunDirV;
uniform vec3 uUpV;
uniform vec3 uSunColor;
uniform vec3 uShadowColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uRimColor;
uniform vec4 uGrade;
uniform float uGloss;
uniform float uEmissive;
#ifdef TOY_MAP
uniform sampler2D map;
#endif
varying vec3 vNormalV;
varying vec3 vViewPos;

vec3 grade(vec3 c) {
  c *= uGrade.x;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uGrade.y);
  c *= vec3(1.0 + uGrade.z * 0.06, 1.0, 1.0 - uGrade.z * 0.06);
  return c;
}

void main() {
  vec3 base = diffuse;
  #ifdef USE_COLOR
    base *= vColor.rgb;
  #endif
  #ifdef TOY_MAP
    base *= texture2D(map, vMapUv).rgb;
  #endif
  vec3 col;
  #ifdef TOY_EMISSIVE
    col = base * uEmissive;
  #else
    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, uSunDirV);
    // soft-toon terminator: readable form without the flatness of a pure wrap
    float wrap = smoothstep(-0.2, 0.55, ndl);
    vec3 light = mix(uShadowColor, uSunColor, wrap);
    float hemi = dot(n, uUpV) * 0.5 + 0.5;
    light += mix(uGroundColor, uSkyColor, hemi) * 0.22;
    col = base * light;
    #ifndef TOY_LITE
      vec3 v = normalize(-vViewPos);
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * uGrade.w;
      col += uRimColor * rim * (0.4 + 0.6 * hemi);
      #ifdef TOY_GLOSS
        vec3 h = normalize(uSunDirV + v);
        float spec = pow(max(dot(n, h), 0.0), mix(24.0, 64.0, min(uGloss, 1.0))) * uGloss;
        col += uSunColor * spec;
      #endif
    #endif
  #endif
  col = grade(col);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const outlineVert = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <skinning_pars_vertex>
uniform float uThickness;
void main() {
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uThickness;
  #include <project_vertex>
  #include <fog_vertex>
}`;

const outlineFrag = /* glsl */ `
#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
uniform vec3 uInk;
uniform float uTint;
void main() {
  vec3 c = uInk;
  #ifdef USE_COLOR
    c = mix(uInk, vColor.rgb * 0.25, uTint);
  #endif
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Shared lighting state for every toy material. */
export class ToyLighting {
  readonly uniforms: ToyLightingUniforms = {
    uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
    uUpV: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1.08, 1.02, 0.92) },
    uShadowColor: { value: new THREE.Color(0.62, 0.68, 0.86) },
    uSkyColor: { value: new THREE.Color(0.55, 0.75, 1) },
    uGroundColor: { value: new THREE.Color(0.95, 0.8, 0.6) },
    uRimColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uGrade: { value: new THREE.Vector4(1, 1.05, 0, 0.35) },
    uTime: { value: 0 },
  };
  /** world-space sun direction (normalised) */
  readonly sunDir = new THREE.Vector3(-0.4, 0.8, 0.45).normalize();
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** Copy a zone palette's lighting into the shared uniforms. */
  fromPalette(p: ZonePalette): void {
    const u = this.uniforms;
    // key light from the upper left and slightly toward the camera so forms read from the play
    // camera; the sky's sun position only nudges it
    this.sunDir.set(-0.78 + p.sunDir.x * 0.2, 0.62, 0.05).normalize();
    u.uSunColor.value.copy(p.lightSun);
    u.uShadowColor.value.copy(p.lightShadow);
    u.uSkyColor.value.copy(p.lightSky);
    u.uGroundColor.value.copy(p.lightBounce);
    u.uRimColor.value.copy(p.lightRim);
    u.uGrade.value.copy(p.grade);
  }

  /** Re-express world directions in view space; call once per frame after the camera moves. */
  update(camera: THREE.Camera): void {
    const m = camera.matrixWorldInverse;
    this.uniforms.uSunDirV.value.copy(this.sunDir).transformDirection(m);
    this.uniforms.uUpV.value.copy(this.up).transformDirection(m);
  }
}

export interface ToyOptions {
  gloss?: number;
  lite?: boolean;
  emissive?: number;
  map?: THREE.Texture;
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  side?: THREE.Side;
  /** vertex wind animation from a `wind` attribute */
  wind?: boolean;
}

export function makeToy(lighting: ToyLighting, o: ToyOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.gloss) defines.TOY_GLOSS = '';
  if (o.lite) defines.TOY_LITE = '';
  if (o.emissive !== undefined) defines.TOY_EMISSIVE = '';
  if (o.map) defines.TOY_MAP = '';
  if (o.wind) defines.TOY_WIND = '';
  const m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    defines,
    fog: true,
    vertexColors: o.vertexColors ?? true,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      ...THREE.UniformsLib.fog,
      ...lighting.uniforms,
      diffuse: { value: new THREE.Color(o.color ?? 0xffffff) },
      uGloss: { value: o.gloss ?? 0 },
      uEmissive: { value: o.emissive ?? 1 },
      map: { value: o.map ?? null },
      mapTransform: { value: new THREE.Matrix3() },
    },
  });
  // geometries without a wind attribute read 0 (not whatever generic value was left bound)
  if (o.wind) (m as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = { color: [1, 1, 1], uv: [0, 0], uv1: [0, 0], wind: [0] };
  // let three set up the uv/map varyings for TOY_MAP
  if (o.map) (m as unknown as { map: THREE.Texture }).map = o.map;
  return m;
}

/** Inverted-hull outline: back faces pushed out along normals, ink-coloured. */
export function makeOutline(thickness = 0.035, ink: THREE.ColorRepresentation = 0x3a2416, tint = 0.6): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: outlineVert,
    fragmentShader: outlineFrag,
    side: THREE.BackSide,
    fog: true,
    vertexColors: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      uThickness: { value: thickness },
      uInk: { value: new THREE.Color(ink) },
      uTint: { value: tint },
    },
  });
}

/** Every material variant, for shader compile checks. */
export function toyVariants(l: ToyLighting, map: THREE.Texture): Record<string, THREE.Material> {
  return {
    toy: makeToy(l),
    toyGloss: makeToy(l, { gloss: 0.6 }),
    toyGold: makeToy(l, { gloss: 1.0, color: 0xfff0c0 }),
    toyLite: makeToy(l, { lite: true }),
    toyEmissive: makeToy(l, { emissive: 1.2 }),
    toyMap: makeToy(l, { map }),
    toyWind: makeToy(l, { wind: true }),
    outline: makeOutline(),
  };
}
