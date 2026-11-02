import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Audio, PENTA, shellStep } from '../src/core/audio';

/** A tiny fake WebAudio graph: enough to drive the Audio facade, the scheduler and node cleanup. */
class FakeParam {
  value: number;
  events: [string, number, number][] = [];
  constructor(v = 1) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.events.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push(['lin', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.events.push(['target', v, t]);
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

let ctxs: FakeCtx[] = [];
class FakeNode {
  outs = new Set<FakeNode>();
  constructor(public ctx: FakeCtx, public kind: string) {
    ctx.nodes.push(this);
  }
  connect(n: FakeNode): FakeNode {
    this.outs.add(n);
    return n;
  }
  disconnect(): void {
    this.outs.clear();
  }
}
class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  startAt = -1;
  stopAt = Infinity;
  ended = false;
  start(t = 0): void {
    this.startAt = t;
  }
  stop(t = 0): void {
    this.stopAt = t;
  }
}
class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  nodes: FakeNode[] = [];
  destination: FakeNode;
  constructor() {
    this.destination = new FakeNode(this, 'dest');
    ctxs.push(this);
  }
  createGain(): FakeNode & { gain: FakeParam } {
    return Object.assign(new FakeNode(this, 'gain'), { gain: new FakeParam(1) });
  }
  createBiquadFilter(): FakeNode {
    return Object.assign(new FakeNode(this, 'filter'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1) });
  }
  createDynamicsCompressor(): FakeNode {
    return Object.assign(new FakeNode(this, 'comp'), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createStereoPanner(): FakeNode {
    return Object.assign(new FakeNode(this, 'pan'), { pan: new FakeParam(0) });
  }
  createConvolver(): FakeNode {
    return Object.assign(new FakeNode(this, 'conv'), { buffer: null });
  }
  createBuffer(ch: number, len: number, sr: number): { duration: number; getChannelData: (c: number) => Float32Array } {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { duration: len / sr, getChannelData: (c: number) => data[c] as Float32Array };
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this, 'src');
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  /** move the clock and fire onended for finished one-shots */
  advance(dt: number): void {
    this.currentTime += dt;
    for (const n of this.nodes) {
      if (!(n instanceof FakeSource) || n.ended || n.loop || n.startAt < 0) continue;
      const end = Math.min(n.stopAt, n.startAt + (n.buffer?.duration ?? 0) / (n.playbackRate.value || 1));
      if (end <= this.currentTime) {
        n.ended = true;
        n.onended?.();
      }
    }
  }
}

function run(a: Audio, seconds: number): FakeCtx {
  const ctx = ctxs[ctxs.length - 1] as FakeCtx;
  for (let t = 0; t < seconds; t += 0.025) {
    ctx.advance(0.025);
    vi.advanceTimersByTime(25);
  }
  void a;
  return ctx;
}

describe('Audio engine (fake WebAudio)', () => {
  beforeEach(() => {
    ctxs = [];
    vi.useFakeTimers();
    (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('unlocks, builds instrument banks and schedules music ahead on the audio clock', () => {
    const a = new Audio();
    a.unlock();
    expect(a.unlocked).toBe(true);
    a.setMusicMode('run');
    const ctx = run(a, 4);
    expect(a.stats.banksReady).toBeGreaterThan(20);
    const srcs = ctx.nodes.filter((n): n is FakeSource => n instanceof FakeSource && !n.loop && n.startAt > 0);
    expect(srcs.length).toBeGreaterThan(40);
    // never scheduled further ahead than the lookahead (plus one timer tick)
    for (const s of srcs) expect(s.startAt).toBeLessThan(ctx.currentTime + 0.25);
    a.dispose();
  });

  it('disconnects every one-shot voice when it ends (no node leaks)', () => {
    const a = new Audio();
    a.unlock();
    a.setAmbience(false);
    a.setMusicMode('run');
    const ctx = run(a, 1);
    for (let i = 0; i < 40; i++) {
      a.play('shell', { streak: i + 1, pan: 0.2 });
      a.play('lane', { pan: i % 2 ? 0.4 : -0.4 });
      a.play('land', { intensity: (i % 5) / 4 });
      run(a, 0.06);
    }
    run(a, 12);
    const live = ctx.nodes.filter((n) => n instanceof FakeSource && !n.loop && !n.ended && n.startAt >= 0);
    // only what the scheduler queued in the last lookahead window (and long pads) is still alive
    expect(live.length).toBeLessThan(60);
    for (const n of ctx.nodes) if (n instanceof FakeSource && n.ended) expect(n.outs.size).toBe(0);
    expect(a.stats.voices).toBe(0);
    a.dispose();
  });

  it('shell pickups use a chime per pentatonic step, climbing with the streak', () => {
    const a = new Audio();
    a.unlock();
    const ctx = run(a, 0.1);
    const before = ctx.nodes.length;
    const picked: unknown[] = [];
    for (let n = 1; n <= 6; n++) {
      a.play('shell', { streak: n });
      const src = ctx.nodes.slice(before).filter((x): x is FakeSource => x instanceof FakeSource).pop();
      picked.push(src?.buffer);
    }
    expect(new Set(picked).size).toBe(6);
    a.play('shell', { streak: 1 });
    const again = ctx.nodes.filter((x): x is FakeSource => x instanceof FakeSource).pop();
    expect(again?.buffer).toBe(picked[0]);
    expect(shellStep(PENTA.length + 5)).toBeLessThan(PENTA.length);
    a.dispose();
  });

  it('the lane swish sweeps toward the move direction', () => {
    const a = new Audio();
    a.unlock();
    const ctx = run(a, 0.1);
    a.play('lane', { pan: 0.4 });
    const pan = ctx.nodes.filter((n) => n.kind === 'pan').pop() as unknown as { pan: FakeParam };
    const [start, end] = pan.pan.events as [[string, number, number], [string, number, number]];
    expect(start[1]).toBeLessThan(0);
    expect(end[1]).toBeGreaterThan(0.4);
    a.dispose();
  });

  it('a power-up kind picks its own sound', () => {
    const a = new Audio();
    a.unlock();
    const ctx = run(a, 0.1);
    const bufs: unknown[] = [];
    for (const kind of ['magnet', 'shield', 'rider', undefined]) {
      a.play('powerup', { kind });
      bufs.push((ctx.nodes.filter((x): x is FakeSource => x instanceof FakeSource).pop() as FakeSource).buffer);
    }
    expect(new Set(bufs).size).toBe(4);
    a.dispose();
  });

  it('switching tracks fades the old one out and tears it down', () => {
    const a = new Audio();
    a.unlock();
    a.setMusicMode('run');
    run(a, 1);
    a.setTrack('island');
    expect(a.stats.players).toBe(2);
    run(a, 6);
    expect(a.stats.players).toBe(1);
    a.setTrack('chase');
    a.setZone(2);
    a.setRumble(0.5);
    run(a, 6);
    expect(a.stats.players).toBe(1);
    a.dispose();
  });

  it('runs a quiet wave bed with the occasional gull, tied to the SFX volume', () => {
    const a = new Audio();
    a.setVolumes(0.5, 0.8);
    a.unlock();
    const ctx = run(a, 60);
    const loops = ctx.nodes.filter((n) => n instanceof FakeSource && n.loop);
    expect(loops.length).toBeGreaterThanOrEqual(2);
    // the wave voices swell (many gain targets scheduled over a minute)
    const swells = ctx.nodes.filter((n) => n.kind === 'gain').map((n) => (n as unknown as { gain: FakeParam }).gain.events.filter((e) => e[0] === 'target').length);
    expect(Math.max(...swells)).toBeGreaterThan(8);
    const gulls = ctx.nodes.filter((n) => n instanceof FakeSource && !n.loop && n.buffer && Math.abs(n.buffer.duration - 0.55) < 0.01);
    expect(gulls.length).toBeGreaterThan(0);
    a.dispose();
  });

  it('schedules no music while muted or off', () => {
    const a = new Audio();
    a.unlock();
    a.setMusicMode('off');
    const ctx = run(a, 1);
    const count = (): number => ctx.nodes.filter((n) => n instanceof FakeSource && !n.loop).length;
    const n0 = count();
    run(a, 3);
    expect(count()).toBe(n0);
    a.setMusicMode('run');
    run(a, 2);
    expect(count()).toBeGreaterThan(n0);
    a.dispose();
  });
});
