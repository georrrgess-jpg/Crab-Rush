/** Easing curves and a pooled tween timeline (spawn pops, celebrations, camera moves). */
export type Ease = (t: number) => number;

export const ease = {
  linear: ((t) => t) as Ease,
  inQuad: ((t) => t * t) as Ease,
  outQuad: ((t) => 1 - (1 - t) * (1 - t)) as Ease,
  inOutQuad: ((t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)) as Ease,
  outCubic: ((t) => 1 - (1 - t) ** 3) as Ease,
  inOutCubic: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)) as Ease,
  outBack: ((t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }) as Ease,
  outElastic: ((t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)) as Ease,
  outBounce: ((t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }) as Ease,
};

interface Tw {
  t: number;
  delay: number;
  dur: number;
  from: number;
  to: number;
  ease: Ease;
  set: (v: number) => void;
  done?: () => void;
  active: boolean;
}

/** Fire-and-forget tweens over plain setters, updated once per frame. Objects are pooled. */
export class Tweens {
  private list: Tw[] = [];
  private pool: Tw[] = [];

  to(set: (v: number) => void, from: number, to: number, dur: number, e: Ease = ease.outCubic, delay = 0, done?: () => void): void {
    const tw = this.pool.pop() ?? ({} as Tw);
    tw.t = 0;
    tw.delay = delay;
    tw.dur = Math.max(1e-4, dur);
    tw.from = from;
    tw.to = to;
    tw.ease = e;
    tw.set = set;
    tw.done = done;
    tw.active = true;
    set(from);
    this.list.push(tw);
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const tw = this.list[i] as Tw;
      if (tw.delay > 0) {
        tw.delay -= dt;
        this.list[w++] = tw;
        continue;
      }
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      tw.set(tw.from + (tw.to - tw.from) * tw.ease(tw.t));
      if (tw.t >= 1) {
        tw.active = false;
        tw.done?.();
        this.pool.push(tw);
      } else this.list[w++] = tw;
    }
    this.list.length = w;
  }

  get count(): number {
    return this.list.length;
  }

  clear(): void {
    for (const tw of this.list) this.pool.push(tw);
    this.list.length = 0;
  }
}
