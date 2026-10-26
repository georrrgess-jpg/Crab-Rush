import * as THREE from 'three';

/** Per-zone look: sky gradient, fog, sun, ocean and ground tints. Blended as the player enters a zone. */
export interface ZonePalette {
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunDir: THREE.Vector3;
  oceanShallow: THREE.Color;
  oceanMid: THREE.Color;
  oceanDeep: THREE.Color;
  foam: THREE.Color;
  /** multiplies ground texture/vertex colours */
  groundTint: THREE.Color;
  cloud: THREE.Color;
  /** object lighting for the toy shader (UPDATE2_PLAN.md §1.2) */
  lightSun: THREE.Color;
  lightShadow: THREE.Color;
  lightSky: THREE.Color;
  lightBounce: THREE.Color;
  lightRim: THREE.Color;
  /** x exposure, y saturation, z warmth, w rim strength */
  grade: THREE.Vector4;
}

const c = (h: number): THREE.Color => new THREE.Color(h);

export const ZONE_PALETTES: ZonePalette[] = [
  // 0 Sunny Shore: late morning (as in the concept art)
  {
    skyTop: c(0x3fa2f2), skyMid: c(0x8fd0f7), skyHorizon: c(0xcdefff), fog: c(0xc4ebff),
    sunColor: c(0xfff6d0), sunDir: new THREE.Vector3(0.45, 0.55, -0.7).normalize(),
    oceanShallow: c(0x3fd6d0), oceanMid: c(0x1fa6d6), oceanDeep: c(0x1570b8), foam: c(0xffffff),
    groundTint: c(0xffffff), cloud: c(0xffffff),
    lightSun: c(0xfff3dc), lightShadow: c(0x8fa6d6), lightSky: c(0x9ccfff), lightBounce: c(0xf2d7a8), lightRim: c(0xfff2d6),
    grade: new THREE.Vector4(1.0, 1.08, 0.2, 0.32),
  },
  // 1 Boardwalk Pier: bright noon
  {
    skyTop: c(0x2a8fe8), skyMid: c(0x78c6f4), skyHorizon: c(0xd6f3ff), fog: c(0xcdeeff),
    sunColor: c(0xffffff), sunDir: new THREE.Vector3(0.0, 0.9, -0.5).normalize(),
    oceanShallow: c(0x35d0c8), oceanMid: c(0x1b9ed4), oceanDeep: c(0x1368b0), foam: c(0xffffff),
    groundTint: c(0xffffff), cloud: c(0xffffff),
    lightSun: c(0xffffff), lightShadow: c(0x93acd8), lightSky: c(0xa6d8ff), lightBounce: c(0xe8cfa0), lightRim: c(0xffffff),
    grade: new THREE.Vector4(1.02, 1.1, 0.0, 0.28),
  },
  // 2 Tide Pool Cove: golden afternoon
  {
    skyTop: c(0x4a96e0), skyMid: c(0xa8c8ea), skyHorizon: c(0xffe1ae), fog: c(0xf8dfb8),
    sunColor: c(0xffd890), sunDir: new THREE.Vector3(-0.5, 0.4, -0.75).normalize(),
    oceanShallow: c(0x44c7b4), oceanMid: c(0x1d92b8), oceanDeep: c(0x15628e), foam: c(0xfff6e4),
    groundTint: c(0xf4dcc0), cloud: c(0xfff0dc),
    lightSun: c(0xffe2b0), lightShadow: c(0x9a8fb8), lightSky: c(0xb8c8e6), lightBounce: c(0xf0c890), lightRim: c(0xffd9a0),
    grade: new THREE.Vector4(1.0, 1.06, 0.5, 0.42),
  },
  // 3 Sunset Lagoon
  {
    skyTop: c(0x5a4aa6), skyMid: c(0xf07fa0), skyHorizon: c(0xffb464), fog: c(0xf2a98c),
    sunColor: c(0xffa050), sunDir: new THREE.Vector3(0.0, 0.14, -1).normalize(),
    oceanShallow: c(0xf08a8e), oceanMid: c(0x8a5fb0), oceanDeep: c(0x3f3a86), foam: c(0xffe0d0),
    groundTint: c(0xf8c8a8), cloud: c(0xffb8a8),
    lightSun: c(0xffc79a), lightShadow: c(0x8a76b0), lightSky: c(0xd88aa8), lightBounce: c(0xe8a070), lightRim: c(0xff9a6a),
    grade: new THREE.Vector4(0.98, 1.0, 0.35, 0.55),
  },
];

/** Sunset Lagoon after dark (UPDATE2_PLAN.md §1.5): blended in past CFG night start. */
export const NIGHT_PALETTE: ZonePalette = {
  skyTop: c(0x1a1850), skyMid: c(0x46387e), skyHorizon: c(0xc86a74), fog: c(0x6a4a7c),
  sunColor: c(0xff8a5a), sunDir: new THREE.Vector3(0.0, 0.04, -1).normalize(),
  oceanShallow: c(0x8a5c9a), oceanMid: c(0x45407e), oceanDeep: c(0x1e2056), foam: c(0xe8d0e8),
  groundTint: c(0xc0a8c0), cloud: c(0x9a7ab0),
  lightSun: c(0xffb890), lightShadow: c(0x5a5498), lightSky: c(0x8a7ac8), lightBounce: c(0xb07a80), lightRim: c(0xffa080),
  grade: new THREE.Vector4(0.92, 0.95, 0.15, 0.7),
};

/** Blend palette `a` toward `b` by t into `out`. */
export function lerpPalette(out: ZonePalette, a: ZonePalette, b: ZonePalette, t: number): ZonePalette {
  out.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
  out.skyMid.copy(a.skyMid).lerp(b.skyMid, t);
  out.skyHorizon.copy(a.skyHorizon).lerp(b.skyHorizon, t);
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  out.oceanShallow.copy(a.oceanShallow).lerp(b.oceanShallow, t);
  out.oceanMid.copy(a.oceanMid).lerp(b.oceanMid, t);
  out.oceanDeep.copy(a.oceanDeep).lerp(b.oceanDeep, t);
  out.foam.copy(a.foam).lerp(b.foam, t);
  out.groundTint.copy(a.groundTint).lerp(b.groundTint, t);
  out.cloud.copy(a.cloud).lerp(b.cloud, t);
  out.lightSun.copy(a.lightSun).lerp(b.lightSun, t);
  out.lightShadow.copy(a.lightShadow).lerp(b.lightShadow, t);
  out.lightSky.copy(a.lightSky).lerp(b.lightSky, t);
  out.lightBounce.copy(a.lightBounce).lerp(b.lightBounce, t);
  out.lightRim.copy(a.lightRim).lerp(b.lightRim, t);
  out.grade.copy(a.grade).lerp(b.grade, t);
  return out;
}

export function clonePalette(p: ZonePalette): ZonePalette {
  return {
    skyTop: p.skyTop.clone(), skyMid: p.skyMid.clone(), skyHorizon: p.skyHorizon.clone(), fog: p.fog.clone(),
    sunColor: p.sunColor.clone(), sunDir: p.sunDir.clone(), oceanShallow: p.oceanShallow.clone(),
    oceanMid: p.oceanMid.clone(), oceanDeep: p.oceanDeep.clone(), foam: p.foam.clone(),
    groundTint: p.groundTint.clone(), cloud: p.cloud.clone(),
    lightSun: p.lightSun.clone(), lightShadow: p.lightShadow.clone(), lightSky: p.lightSky.clone(),
    lightBounce: p.lightBounce.clone(), lightRim: p.lightRim.clone(), grade: p.grade.clone(),
  };
}
