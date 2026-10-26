import { CFG } from '../config';

export interface CameraFit {
  fov: number;
  /** distance from the focus point (the player) to the camera */
  dist: number;
}

const HALF_VIEW = CFG.trackHalfWidth * 1.02; // keep the whole track (berms included) visible at the player's depth
const BASE_DIST = Math.hypot(CFG.camera.height - 0.5, CFG.camera.back);

/** Chooses FOV and camera distance so the full track fits any aspect ratio (esp. portrait phones). */
export function fitCamera(aspect: number, baseFov: number = CFG.camera.fov): CameraFit {
  const needTan = HALF_VIEW / (Math.max(aspect, 0.2) * BASE_DIST);
  const baseTan = Math.tan((baseFov * Math.PI) / 360);
  if (needTan <= baseTan) return { fov: baseFov, dist: BASE_DIST };
  const maxTan = Math.tan((CFG.camera.portraitFovMax * Math.PI) / 360);
  if (needTan <= maxTan) return { fov: (2 * Math.atan(needTan) * 180) / Math.PI, dist: BASE_DIST };
  return { fov: CFG.camera.portraitFovMax, dist: HALF_VIEW / (Math.max(aspect, 0.2) * maxTan) };
}

/** Elevation angle (radians) of the camera above the focus point. */
export const CAMERA_ELEVATION = Math.atan2(CFG.camera.height - 0.5, CFG.camera.back);
