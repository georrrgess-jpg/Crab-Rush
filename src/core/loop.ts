/**
 * Fixed-timestep loop. `step` runs at a constant rate (default 120 Hz) with an accumulator, `render`
 * runs once per animation frame with the interpolation factor. The game therefore plays identically at
 * 30, 60, 120 and 144 Hz displays.
 */
export interface LoopHooks {
  step(dt: number): void;
  render(alpha: number, frameDt: number): void;
}

export class Loop {
  readonly stepDt: number;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  manual = false; // when true, rAF does nothing (test hooks drive the loop)
  /** Smoothed frame time in ms, for the debug overlay and quality manager. */
  frameMs = 16.7;

  constructor(private hooks: LoopHooks, hz = 120, private maxSteps = 8) {
    this.stepDt = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Reset the clock (after tab was hidden, etc.). */
  resetClock(): void {
    this.last = performance.now();
    this.acc = 0;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.manual) {
      this.last = now;
      return;
    }
    const raw = (now - this.last) / 1000;
    this.last = now;
    this.tick(Math.min(Math.max(raw, 0), 0.1), raw * 1000);
  };

  /** Advance by `dt` seconds of wall time. Exposed so tests/screenshots can drive time. */
  tick(dt: number, rawMs = dt * 1000): void {
    this.frameMs += (Math.min(rawMs, 100) - this.frameMs) * 0.08;
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.stepDt && n < this.maxSteps) {
      this.hooks.step(this.stepDt);
      this.acc -= this.stepDt;
      n++;
    }
    if (n === this.maxSteps) this.acc = 0;
    this.hooks.render(this.acc / this.stepDt, dt);
  }
}
