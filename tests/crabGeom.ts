import * as THREE from 'three';

/** eyeballs in crab model space (see buildCrab: centre and radius) */
export const EYES = [-1, 1].map((s) => ({ c: new THREE.Vector3(s * 0.26, 0.9, 0.35), r: 0.17 }));
