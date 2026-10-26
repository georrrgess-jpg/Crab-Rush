/**
 * Damped springs for secondary motion (hat wobble, antennae, lean, squash, camera). Integrated with
 * semi-implicit Euler in fixed sub-steps so they stay stable at any frame rate. No allocations.
 */
export interface SpringParams {
  /** angular frequency (rad/s): higher = snappier */
  freq: number;
  /** damping ratio: 1 = critically damped, <1 overshoots */
  damping: number;
}

const MAX_SUB = 1 / 240;

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  constructor(initial = 0, public p: SpringParams = { freq: 18, damping: 1 }) {
    this.value = initial;
    this.target = initial;
  }
  /** add an instantaneous kick (units per second) */
  impulse(v: number): void {
    this.velocity += v;
  }
  snap(v: number): void {
    this.value = this.target = v;
    this.velocity = 0;
  }
  update(dt: number): number {
    const w = this.p.freq;
    const z = this.p.damping;
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, MAX_SUB);
      const acc = w * w * (this.target - this.value) - 2 * z * w * this.velocity;
      this.velocity += acc * h;
      this.value += this.velocity * h;
      left -= h;
    }
    return this.value;
  }
  get settled(): boolean {
    return Math.abs(this.target - this.value) < 1e-3 && Math.abs(this.velocity) < 1e-3;
  }
}

/** Three independent springs; works with any {x,y,z} target object. */
export class Spring3 {
  readonly x: Spring;
  readonly y: Spring;
  readonly z: Spring;
  constructor(x = 0, y = 0, z = 0, p: SpringParams = { freq: 18, damping: 1 }) {
    this.x = new Spring(x, p);
    this.y = new Spring(y, p);
    this.z = new Spring(z, p);
  }
  setTarget(x: number, y: number, z: number): void {
    this.x.target = x;
    this.y.target = y;
    this.z.target = z;
  }
  impulse(x: number, y: number, z: number): void {
    this.x.impulse(x);
    this.y.impulse(y);
    this.z.impulse(z);
  }
  snap(x: number, y: number, z: number): void {
    this.x.snap(x);
    this.y.snap(y);
    this.z.snap(z);
  }
  /** integrate and write into `out` (e.g. an Object3D's position or rotation) */
  update(dt: number, out?: { x: number; y: number; z: number }): void {
    this.x.update(dt);
    this.y.update(dt);
    this.z.update(dt);
    if (out) {
      out.x = this.x.value;
      out.y = this.y.value;
      out.z = this.z.value;
    }
  }
}
