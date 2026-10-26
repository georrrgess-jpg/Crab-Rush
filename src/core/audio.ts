/**
 * All sound is synthesised at runtime (PLAN.md §7): SFX are computed into AudioBuffers when audio is
 * unlocked by the first user gesture, and the music loop is rendered once with an OfflineAudioContext
 * so playback costs no CPU. Nothing is downloaded.
 */
export type Sfx =
  | 'shell' | 'bigShell' | 'lane' | 'hop' | 'land' | 'slam' | 'bump' | 'crash' | 'powerup' | 'shieldPop'
  | 'rider' | 'closeShave' | 'goal' | 'newBest' | 'zone' | 'tap' | 'purchase' | 'countdown' | 'go' | 'milestone' | 'deny';

type Gen = (sr: number) => Float32Array;

const TAU = Math.PI * 2;
const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

function buf(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.floor(sr * seconds)));
}

/** deterministic noise so every session sounds the same */
function noiseGen(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

/** State-variable filter (bandpass/lowpass/highpass) processed in place, cutoff may vary per sample. */
function svf(x: Float32Array, sr: number, cutoff: (t: number) => number, q: number, mode: 'lp' | 'bp' | 'hp'): Float32Array {
  let low = 0;
  let band = 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff(i / sr), sr * 0.45)) / sr);
    low += f * band;
    const high = (x[i] as number) - low - q * band;
    band += f * high;
    out[i] = mode === 'lp' ? low : mode === 'bp' ? band : high;
  }
  return out;
}

function normalize(x: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = ((x[i] as number) / m) * peak;
  return x;
}

/** bell: fundamental + inharmonic partial, fast attack, exponential decay */
function bell(sr: number, f: number, dur: number, out?: Float32Array, offset = 0, gain = 1): Float32Array {
  const x = out ?? buf(sr, dur + offset);
  const o = Math.floor(offset * sr);
  const n = Math.floor(dur * sr);
  for (let i = 0; i < n && o + i < x.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 400) * Math.exp(-t * 9);
    const v = Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 14) + 0.2 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 30);
    x[o + i] = (x[o + i] as number) + v * env * gain;
  }
  return x;
}

function tone(sr: number, dur: number, freq: (t: number) => number, wave: 'sine' | 'tri' | 'square' = 'sine', env: (t: number) => number = (t) => Math.exp(-t * 8)): Float32Array {
  const x = buf(sr, dur);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    ph += freq(t) / sr;
    const p = ph % 1;
    const w = wave === 'sine' ? Math.sin(TAU * p) : wave === 'tri' ? 1 - 4 * Math.abs(p - 0.5) : p < 0.5 ? 0.6 : -0.6;
    x[i] = w * env(t) * Math.min(1, t * 600);
  }
  return x;
}

function mix(...xs: Float32Array[]): Float32Array {
  const n = Math.max(...xs.map((x) => x.length));
  const o = new Float32Array(n);
  for (const x of xs) for (let i = 0; i < x.length; i++) o[i] = (o[i] as number) + (x[i] as number);
  return o;
}

function noise(sr: number, dur: number, env: (t: number) => number, seed = 3): Float32Array {
  const r = noiseGen(seed);
  const x = buf(sr, dur);
  for (let i = 0; i < x.length; i++) x[i] = r() * env(i / sr);
  return x;
}

export const SFX: Record<Sfx, Gen> = {
  shell: (sr) => normalize(bell(sr, midiHz(84), 0.35), 0.55),
  bigShell: (sr) => {
    const x = buf(sr, 0.7);
    bell(sr, midiHz(84), 0.45, x, 0, 1);
    bell(sr, midiHz(88), 0.45, x, 0.05, 0.9);
    bell(sr, midiHz(91), 0.5, x, 0.1, 0.9);
    bell(sr, midiHz(96), 0.5, x, 0.16, 0.7);
    return normalize(x, 0.7);
  },
  lane: (sr) => normalize(svf(noise(sr, 0.12, (t) => Math.sin(Math.min(1, t / 0.12) * Math.PI) ** 2), sr, (t) => 1400 + t * 22000, 0.6, 'bp'), 0.32),
  hop: (sr) => normalize(mix(tone(sr, 0.18, (t) => 300 + t * 2600 + Math.sin(t * 90) * 20, 'tri', (t) => Math.exp(-t * 14)), tone(sr, 0.12, (t) => 600 + t * 3000, 'sine', (t) => Math.exp(-t * 25))), 0.45),
  land: (sr) => normalize(mix(tone(sr, 0.12, (t) => 110 - t * 400, 'sine', (t) => Math.exp(-t * 30)), svf(noise(sr, 0.08, (t) => Math.exp(-t * 50)), sr, () => 900, 0.8, 'lp')), 0.45),
  slam: (sr) => normalize(mix(svf(noise(sr, 0.2, (t) => Math.min(1, t * 20) * Math.exp(-t * 12)), sr, (t) => 3000 - t * 12000, 0.7, 'bp'), tone(sr, 0.2, (t) => 120 - t * 300, 'sine', (t) => (t > 0.06 ? Math.exp(-(t - 0.06) * 25) : 0))), 0.6),
  bump: (sr) => normalize(mix(tone(sr, 0.16, (t) => 540 - t * 900, 'sine', (t) => Math.exp(-t * 28)), tone(sr, 0.05, () => 1600, 'square', (t) => Math.exp(-t * 90))), 0.55),
  crash: (sr) => {
    const bonk = tone(sr, 0.25, (t) => 420 - t * 700, 'sine', (t) => Math.exp(-t * 18));
    const whistle = tone(sr, 0.75, (t) => 1100 - t * 1100 + Math.sin(t * 40) * 25, 'sine', (t) => (t < 0.08 ? 0 : Math.min(1, (t - 0.08) * 10) * Math.exp(-(t - 0.08) * 2.5) * 0.6));
    const splash = svf(noise(sr, 0.6, (t) => Math.min(1, t * 30) * Math.exp(-t * 6)), sr, (t) => 4000 - t * 4000, 0.5, 'lp');
    return normalize(mix(bonk, whistle, splash), 0.75);
  },
  powerup: (sr) => {
    const x = buf(sr, 0.5);
    [72, 76, 79, 84].forEach((m, i) => {
      const t0 = Math.floor(i * 0.06 * sr);
      const n = tone(sr, 0.22, () => midiHz(m), 'tri', (t) => Math.exp(-t * 10));
      for (let k = 0; k < n.length && t0 + k < x.length; k++) x[t0 + k] = (x[t0 + k] as number) + (n[k] as number);
    });
    return normalize(x, 0.5);
  },
  shieldPop: (sr) => normalize(mix(tone(sr, 0.08, (t) => 500 + t * 14000, 'sine', (t) => Math.exp(-t * 40)), noise(sr, 0.03, (t) => Math.exp(-t * 150), 9)), 0.6),
  rider: (sr) => {
    const surf = svf(noise(sr, 0.9, (t) => Math.sin(Math.min(1, t / 0.9) * Math.PI)), sr, (t) => 600 + t * 2500, 0.8, 'bp');
    const x = buf(sr, 0.9);
    bell(sr, midiHz(79), 0.5, x, 0.15, 0.5);
    bell(sr, midiHz(84), 0.5, x, 0.22, 0.5);
    return normalize(mix(surf, x), 0.6);
  },
  closeShave: (sr) => normalize(mix(svf(noise(sr, 0.18, (t) => Math.sin(Math.min(1, t / 0.18) * Math.PI)), sr, (t) => 2000 + t * 20000, 0.5, 'bp'), tone(sr, 0.06, () => 2400, 'sine', (t) => (t > 0.1 ? 0 : Math.exp(-t * 60)))), 0.45),
  goal: (sr) => {
    const x = buf(sr, 0.8);
    bell(sr, midiHz(79), 0.5, x, 0, 1);
    bell(sr, midiHz(84), 0.6, x, 0.13, 1);
    return normalize(x, 0.6);
  },
  newBest: (sr) => {
    const x = buf(sr, 1.2);
    const notes: [number, number, number][] = [
      [72, 0, 0.14],
      [76, 0.12, 0.14],
      [79, 0.24, 0.14],
      [84, 0.36, 0.7],
    ];
    for (const [m, at, d] of notes) {
      const n = mix(tone(sr, d, () => midiHz(m), 'square', (t) => Math.exp(-t * 3) * 0.35), tone(sr, d, () => midiHz(m), 'tri', (t) => Math.exp(-t * 3)));
      const o = Math.floor(at * sr);
      for (let k = 0; k < n.length && o + k < x.length; k++) x[o + k] = (x[o + k] as number) + (n[k] as number);
    }
    return normalize(x, 0.55);
  },
  zone: (sr) => {
    // steel drum: FM bell
    const x = buf(sr, 1.0);
    [[79, 0], [76, 0.14], [84, 0.28]].forEach(([m, at]) => {
      const f = midiHz(m as number);
      const o = Math.floor((at as number) * sr);
      for (let i = 0; i < sr * 0.6 && o + i < x.length; i++) {
        const t = i / sr;
        const mod = Math.sin(TAU * f * 1.5 * t) * 2.2 * Math.exp(-t * 6);
        x[o + i] = (x[o + i] as number) + Math.sin(TAU * f * t + mod) * Math.exp(-t * 5) * Math.min(1, t * 500);
      }
    });
    return normalize(x, 0.55);
  },
  tap: (sr) => normalize(tone(sr, 0.04, () => 1300, 'sine', (t) => Math.exp(-t * 90)), 0.3),
  purchase: (sr) => {
    const x = buf(sr, 0.9);
    [84, 88, 91, 96, 91, 96].forEach((m, i) => bell(sr, midiHz(m), 0.35, x, i * 0.06, 0.8));
    return normalize(x, 0.65);
  },
  countdown: (sr) => normalize(tone(sr, 0.1, () => 880, 'sine', (t) => Math.exp(-t * 30)), 0.35),
  go: (sr) => normalize(tone(sr, 0.2, (t) => 1100 + t * 900, 'tri', (t) => Math.exp(-t * 14)), 0.4),
  milestone: (sr) => {
    const x = buf(sr, 0.5);
    bell(sr, midiHz(91), 0.3, x, 0, 1);
    bell(sr, midiHz(96), 0.35, x, 0.08, 1);
    return normalize(x, 0.45);
  },
  deny: (sr) => normalize(tone(sr, 0.14, () => 170, 'square', (t) => Math.exp(-t * 10)), 0.3),
};

/** Synthesise one effect's samples (exported for tests). */
export function synthSfx(name: Sfx, sampleRate: number): Float32Array {
  return SFX[name](sampleRate);
}

/** pentatonic steps for the shell streak (C D E G A ...) */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

// ------------------------------------------------------------------------------------- music

/** Karplus-Strong plucked string (ukulele-ish) at the given frequency. */
function pluck(sr: number, f: number, dur: number): Float32Array {
  const x = buf(sr, dur);
  const period = Math.max(2, Math.round(sr / f));
  const ring = new Float32Array(period);
  const r = noiseGen(7);
  for (let i = 0; i < period; i++) ring[i] = r() * 0.8;
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    const v = ring[idx] as number;
    const nv = 0.5 * (v + prev) * 0.996;
    prev = v;
    ring[idx] = nv;
    idx = (idx + 1) % period;
    x[i] = v;
  }
  return svf(x, sr, () => 3500, 0.7, 'lp');
}

function marimba(sr: number, f: number): Float32Array {
  const x = buf(sr, 0.7);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    x[i] = (Math.sin(TAU * f * t) * Math.exp(-t * 7) + 0.25 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 28)) * Math.min(1, t * 800);
  }
  return x;
}

function bassNote(sr: number, f: number): Float32Array {
  return tone(sr, 0.45, () => f, 'tri', (t) => Math.exp(-t * 4.5) * Math.min(1, t * 200));
}

function toBuffer(ctx: BaseAudioContext, x: Float32Array): AudioBuffer {
  const b = ctx.createBuffer(1, x.length, ctx.sampleRate);
  b.getChannelData(0).set(x);
  return b;
}

/** Render the 8-bar beach loop. */
async function renderMusic(sampleRate: number): Promise<AudioBuffer | null> {
  const OAC = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OAC) return null;
  const bpm = 104;
  const beat = 60 / bpm;
  const bars = 8;
  const len = bars * 4 * beat;
  const sr = Math.min(sampleRate, 44100);
  const tail = 2; // seconds rendered past the loop end and folded back into the start (seamless loop)
  const ctx = new OAC(2, Math.ceil((len + tail) * sr), sr);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);

  const C4 = 60;
  const pl = toBuffer(ctx, pluck(sr, midiHz(C4), 1.4));
  const mar = toBuffer(ctx, marimba(sr, midiHz(72)));
  const bass = toBuffer(ctx, bassNote(sr, midiHz(48)));
  const shaker = toBuffer(ctx, svf(noise(sr, 0.07, (t) => Math.exp(-t * 60), 11), sr, () => 7000, 0.6, 'hp'));
  const kick = toBuffer(ctx, tone(sr, 0.18, (t) => 120 - t * 350, 'sine', (t) => Math.exp(-t * 22)));

  const play = (b: AudioBuffer, at: number, semis: number, gain: number, pan = 0): void => {
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = Math.pow(2, semis / 12);
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g);
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(out);
    } else g.connect(out);
    s.start(at);
  };

  // chords (ukulele voicings as MIDI notes) and bass roots: C G Am F
  const chords = [
    [67, 60, 64, 72],
    [67, 62, 67, 71],
    [69, 60, 64, 69],
    [69, 60, 65, 69],
  ];
  const roots = [48, 43, 45, 41];
  // strum pattern in 8ths: D . D U . U D U  (1 = down, -1 = up, 0 = rest)
  const strum = [1, 0, 1, -1, 0, -1, 1, -1];
  for (let bar = 0; bar < bars; bar++) {
    const ci = bar % 4;
    const chord = chords[ci] as number[];
    const t0 = bar * 4 * beat;
    strum.forEach((d, i) => {
      if (d === 0) return;
      const at = t0 + i * (beat / 2);
      const notes = d > 0 ? chord : [...chord].reverse();
      notes.forEach((m, k) => play(pl, at + k * 0.012, m - C4, d > 0 ? 0.16 : 0.1, -0.25));
    });
    // bass on 1 and 3, pickup on the "and" of 4
    const root = roots[ci] as number;
    play(bass, t0, root - 48, 0.55);
    play(bass, t0 + 2 * beat, root - 48 + (ci === 1 ? 0 : 7), 0.45);
    play(bass, t0 + 3.5 * beat, root - 48 + 12, 0.3);
    for (let s = 0; s < 16; s++) play(shaker, t0 + s * (beat / 4), 0, s % 2 === 1 ? 0.12 : 0.05, 0.35);
    play(kick, t0, 0, 0.35);
    play(kick, t0 + 2 * beat, 0, 0.28);
  }
  // marimba melody: [bar, eighth, midi]
  const mel: [number, number, number][] = [
    [0, 0, 76], [0, 1, 79], [0, 2, 81], [0, 3, 79], [0, 4, 76], [0, 6, 74],
    [1, 0, 74], [1, 2, 79], [1, 4, 83], [1, 5, 81], [1, 6, 79],
    [2, 0, 84], [2, 2, 81], [2, 4, 79], [2, 5, 76],
    [3, 0, 77], [3, 2, 81], [3, 4, 79],
    [4, 0, 76], [4, 1, 79], [4, 2, 84], [4, 4, 81], [4, 5, 79], [4, 6, 76],
    [5, 0, 74], [5, 1, 76], [5, 2, 79], [5, 4, 74], [5, 6, 71],
    [6, 0, 69], [6, 1, 72], [6, 2, 76], [6, 4, 79], [6, 6, 81],
    [7, 0, 79], [7, 2, 77], [7, 4, 76], [7, 6, 74],
  ];
  for (const [bar, e, m] of mel) play(mar, bar * 4 * beat + e * (beat / 2), m - 72, 0.32, 0.2);
  const rendered = await ctx.startRendering();
  const n = Math.ceil(len * sr);
  const loop = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) {
    const src = rendered.getChannelData(ch);
    const dst = loop.getChannelData(ch);
    dst.set(src.subarray(0, n));
    for (let i = n; i < src.length; i++) dst[i - n] = (dst[i - n] as number) + (src[i] as number);
  }
  return loop;
}

// ------------------------------------------------------------------------------------- facade

export class Audio {
  unlocked = false;
  musicVolume = 0.5;
  sfxVolume = 0.8;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicOut: GainNode | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private buffers = new Map<Sfx, AudioBuffer>();
  private mode: 'menu' | 'run' | 'off' = 'menu';
  private lastPlay = new Map<Sfx, number>();
  private wantSuspended = false;

  /** Must be called from inside a user gesture (iOS). Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.wantSuspended) void this.ctx.resume();
      return;
    }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 900;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicOut = ctx.createGain();
      // music path: bus (menu/run ducking) → low-pass (muffled in menus) → volume setting → master
      this.musicBus.connect(this.musicFilter);
      this.musicFilter.connect(this.musicOut);
      this.musicOut.connect(this.master);
      // a silent buffer kicks iOS into playing
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
      void ctx.resume();
      this.unlocked = true;
      this.applyVolumes();
      this.buildSfx();
      void renderMusic(ctx.sampleRate).then((b) => {
        if (!b || !this.ctx) return;
        this.startMusic(b);
      }).catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  private buildSfx(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const k of Object.keys(SFX) as Sfx[]) {
      try {
        this.buffers.set(k, toBuffer(ctx, SFX[k](ctx.sampleRate)));
      } catch {
        /* skip a broken sound rather than the whole set */
      }
    }
  }

  private startMusic(b: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(this.musicBus);
    src.start();
    this.musicSrc = src;
    this.setMusicMode(this.mode);
  }

  play(s: Sfx, opt: { streak?: number; pan?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxVolume <= 0) return;
    const b = this.buffers.get(s);
    if (!b) return;
    // de-duplicate identical sounds fired in the same instant
    const now = ctx.currentTime;
    const last = this.lastPlay.get(s) ?? -1;
    if (now - last < 0.025 && s !== 'shell') return;
    this.lastPlay.set(s, now);
    const src = ctx.createBufferSource();
    src.buffer = b;
    if (s === 'shell' && opt.streak) {
      const step = PENTA[Math.min(PENTA.length - 1, Math.max(0, opt.streak - 1))] as number;
      src.playbackRate.value = Math.pow(2, step / 12);
    }
    const g = ctx.createGain();
    g.gain.value = s === 'shell' ? 0.7 : 1;
    src.connect(g);
    if (opt.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opt.pan;
      g.connect(p);
      p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    src.start();
  }

  setMusicMode(m: 'menu' | 'run' | 'off'): void {
    this.mode = m;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.musicFilter) return;
    const t = ctx.currentTime;
    const target = m === 'off' || !this.musicSrc ? 0 : m === 'menu' ? 0.7 : 1;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(target, t, 0.25);
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(m === 'run' ? 16000 : 1000, t, 0.3);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
    if (this.musicOut) this.musicOut.gain.value = this.musicVolume * 0.55;
  }

  suspend(): void {
    this.wantSuspended = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    this.wantSuspended = false;
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
}
