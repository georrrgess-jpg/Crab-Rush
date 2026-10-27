/**
 * All sound is synthesised at runtime (PLAN.md §7): SFX are computed into AudioBuffers when audio is
 * unlocked by the first user gesture, and the music loop is rendered once with an OfflineAudioContext
 * so playback costs no CPU. Nothing is downloaded.
 */
export type Sfx =
  | 'shell' | 'bigShell' | 'lane' | 'hop' | 'land' | 'slam' | 'bump' | 'crash' | 'powerup' | 'shieldPop'
  | 'rider' | 'closeShave' | 'goal' | 'newBest' | 'zone' | 'tap' | 'purchase' | 'countdown' | 'go' | 'milestone' | 'deny'
  | 'tick' | 'pop' | 'levelUp'
  // Update 2 (UPDATE2_PLAN.md §7)
  | 'dollar' | 'win' | 'star' | 'claim' | 'equip' | 'gull' | 'boing' | 'splash' | 'whoosh' | 'streakFlame'
  // Update 3 (UPDATE3_PLAN.md §7)
  | 'giftCollect' | 'pearl' | 'place' | 'chatter' | 'trophy' | 'chestOpen' | 'coconut' | 'ring';

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
  // results count-up tick, row landing pop, Sunny Pass tier-up fanfare
  tick: (sr) => normalize(tone(sr, 0.025, () => 2400, 'sine', (t) => Math.exp(-t * 160)), 0.16),
  pop: (sr) => normalize(tone(sr, 0.09, (t) => 520 + t * 2600, 'sine', (t) => Math.exp(-t * 38)), 0.3),
  levelUp: (sr) => {
    const x = buf(sr, 1.0);
    [79, 83, 86, 91, 95].forEach((m, i) => bell(sr, midiHz(m), 0.45, x, i * 0.07, 0.9));
    return normalize(x, 0.6);
  },
  go: (sr) => normalize(tone(sr, 0.2, (t) => 1100 + t * 900, 'tri', (t) => Math.exp(-t * 14)), 0.4),
  milestone: (sr) => {
    const x = buf(sr, 0.5);
    bell(sr, midiHz(91), 0.3, x, 0, 1);
    bell(sr, midiHz(96), 0.35, x, 0.08, 1);
    return normalize(x, 0.45);
  },
  /** sand dollar: a sparkling three-bell chord with a shimmer */
  dollar: (sr) => {
    const x = buf(sr, 0.9);
    bell(sr, midiHz(88), 0.6, x, 0, 1);
    bell(sr, midiHz(92), 0.6, x, 0.04, 0.8);
    bell(sr, midiHz(95), 0.7, x, 0.08, 0.8);
    bell(sr, midiHz(100), 0.5, x, 0.16, 0.5);
    const shimmer = svf(noise(sr, 0.9, (t) => Math.min(1, t * 20) * Math.exp(-t * 5) * 0.25, 21), sr, () => 9000, 0.4, 'hp');
    return normalize(mix(x, shimmer), 0.7);
  },
  /** level win fanfare: brassy arpeggio and a held chord */
  win: (sr) => {
    const x = buf(sr, 1.45);
    const notes: [number, number, number][] = [
      [67, 0, 0.12], [72, 0.1, 0.12], [76, 0.2, 0.12], [79, 0.3, 0.12], [84, 0.42, 0.9], [76, 0.42, 0.9], [79, 0.42, 0.9],
    ];
    for (const [m, at, d] of notes) {
      const f = midiHz(m);
      const n = mix(tone(sr, d, () => f * (1 + Math.sin(at * 9) * 0.001), 'square', (t) => Math.min(1, t * 60) * Math.exp(-t * 2.2) * 0.3), tone(sr, d, () => f, 'tri', (t) => Math.exp(-t * 2.2)));
      const o = Math.floor(at * sr);
      for (let k = 0; k < n.length && o + k < x.length; k++) x[o + k] = (x[o + k] as number) + (n[k] as number);
    }
    return normalize(x, 0.6);
  },
  /** star stamp: thump + bell (pitched up per star via playbackRate) */
  star: (sr) => {
    const thump = tone(sr, 0.15, (t) => 180 - t * 500, 'sine', (t) => Math.exp(-t * 26));
    const x = buf(sr, 0.6);
    bell(sr, midiHz(84), 0.5, x, 0.02, 1);
    bell(sr, midiHz(91), 0.4, x, 0.05, 0.6);
    return normalize(mix(thump, x), 0.65);
  },
  claim: (sr) => {
    const x = buf(sr, 0.8);
    [76, 81, 85, 88].forEach((m, i) => bell(sr, midiHz(m), 0.4, x, i * 0.05, 0.9));
    const sweep = svf(noise(sr, 0.35, (t) => Math.sin(Math.min(1, t / 0.35) * Math.PI) * 0.5, 13), sr, (t) => 2000 + t * 18000, 0.5, 'bp');
    return normalize(mix(x, sweep), 0.6);
  },
  /** wardrobe equip: soft fabric swish and a click */
  equip: (sr) => normalize(mix(svf(noise(sr, 0.16, (t) => Math.sin(Math.min(1, t / 0.16) * Math.PI), 17), sr, (t) => 1200 + t * 9000, 0.7, 'bp'), tone(sr, 0.05, () => 1800, 'sine', (t) => (t < 0.11 ? 0 : 1) * Math.exp(-t * 60))), 0.4),
  /** gull squawk: a wobbling, nasal falling call */
  gull: (sr) => {
    const x = buf(sr, 0.5);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const call = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.28;
      const f = 1400 - t * 1300 + Math.sin(t * 70) * 120;
      ph += f / sr;
      const p = ph % 1;
      x[i] = (p < 0.3 ? 1 : -0.4) * Math.max(0, call) * Math.min(1, t * 200);
    }
    return normalize(svf(x, sr, () => 2400, 0.3, 'bp'), 0.4);
  },
  /** bounce pad: rubbery rising boing */
  boing: (sr) => normalize(tone(sr, 0.5, (t) => 160 + t * 900 + Math.sin(t * 70) * (80 * Math.exp(-t * 6)), 'sine', (t) => Math.exp(-t * 6)), 0.55),
  /** tide pool splash */
  splash: (sr) => normalize(mix(svf(noise(sr, 0.5, (t) => Math.min(1, t * 80) * Math.exp(-t * 9), 19), sr, (t) => 5000 - t * 7000, 0.6, 'lp'), tone(sr, 0.12, (t) => 700 - t * 2500, 'sine', (t) => Math.exp(-t * 30))), 0.55),
  /** UI screen transition */
  whoosh: (sr) => normalize(svf(noise(sr, 0.28, (t) => Math.sin(Math.min(1, t / 0.28) * Math.PI) ** 2, 23), sr, (t) => 400 + t * 7000, 1.2, 'bp'), 0.35),
  /** daily streak flame: crackle and a warm swell */
  streakFlame: (sr) => {
    const r = noiseGen(29);
    const crackle = buf(sr, 0.7);
    for (let i = 0; i < crackle.length; i++) crackle[i] = r() > 0.995 ? r() : 0;
    const swell = tone(sr, 0.7, (t) => 220 + t * 220, 'tri', (t) => Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.5);
    return normalize(mix(svf(crackle, sr, () => 3000, 0.5, 'hp'), swell), 0.5);
  },
  /** Tide Gifts: a cascade of shell chimes */
  giftCollect: (sr) => {
    const x = buf(sr, 1.1);
    [84, 86, 88, 91, 93, 96, 98, 100].forEach((m, i) => bell(sr, midiHz(m), 0.35, x, i * 0.055, 0.7 + (i % 2) * 0.2));
    return normalize(x, 0.65);
  },
  /** a pearl: a soft glassy ping with a shimmer */
  pearl: (sr) => {
    const x = buf(sr, 0.7);
    bell(sr, midiHz(100), 0.6, x, 0, 1);
    bell(sr, midiHz(107), 0.5, x, 0.03, 0.5);
    return normalize(mix(x, svf(noise(sr, 0.5, (t) => Math.exp(-t * 7) * 0.2, 43), sr, () => 10000, 0.4, 'hp')), 0.5);
  },
  /** a decoration lands: soft sand thud and a sparkle */
  place: (sr) => {
    const thud = tone(sr, 0.18, (t) => 150 - t * 400, 'sine', (t) => Math.exp(-t * 20));
    const sand = svf(noise(sr, 0.25, (t) => Math.min(1, t * 60) * Math.exp(-t * 14), 47), sr, () => 1400, 0.7, 'lp');
    const x = buf(sr, 0.5);
    bell(sr, midiHz(91), 0.3, x, 0.08, 0.5);
    return normalize(mix(thud, sand, x), 0.55);
  },
  /** friend chatter: little pitched crab blips */
  chatter: (sr) => {
    const x = buf(sr, 0.55);
    [0, 0.09, 0.17, 0.27, 0.36].forEach((at, i) => {
      const f0 = 520 + ((i * 137) % 5) * 90;
      const n = tone(sr, 0.07, (t) => f0 + Math.sin(t * 90) * 60, 'square', (t) => Math.exp(-t * 30) * 0.5);
      const o = Math.floor(at * sr);
      for (let k = 0; k < n.length && o + k < x.length; k++) x[o + k] = (x[o + k] as number) + (n[k] as number);
    });
    return normalize(svf(x, sr, () => 2600, 0.5, 'lp'), 0.4);
  },
  /** trophy: a bright little fanfare */
  trophy: (sr) => {
    const x = buf(sr, 1.2);
    const notes: [number, number][] = [[76, 0], [79, 0.1], [84, 0.2], [88, 0.32], [91, 0.32]];
    for (const [m, at] of notes) {
      const n = mix(tone(sr, 0.7, () => midiHz(m), 'tri', (t) => Math.exp(-t * 3)), tone(sr, 0.7, () => midiHz(m) * 2, 'sine', (t) => Math.exp(-t * 6) * 0.3));
      const o = Math.floor(at * sr);
      for (let k = 0; k < n.length && o + k < x.length; k++) x[o + k] = (x[o + k] as number) + (n[k] as number);
    }
    bell(sr, midiHz(103), 0.5, x, 0.45, 0.6);
    return normalize(x, 0.6);
  },
  /** treasure chest: wooden rattle, a creak, then a burst of chimes */
  chestOpen: (sr) => {
    const x = buf(sr, 1.45);
    for (let i = 0; i < 6; i++) {
      const n = svf(noise(sr, 0.06, (t) => Math.exp(-t * 60), 50 + i), sr, () => 900, 1.5, 'bp');
      const o = Math.floor(i * 0.12 * sr);
      for (let k = 0; k < n.length && o + k < x.length; k++) x[o + k] = (x[o + k] as number) + (n[k] as number) * 0.7;
    }
    const creak = tone(sr, 0.25, (t) => 220 + t * 300 + Math.sin(t * 160) * 30, 'square', (t) => Math.sin(Math.min(1, t / 0.25) * Math.PI) * 0.25);
    const o = Math.floor(0.75 * sr);
    for (let k = 0; k < creak.length && o + k < x.length; k++) x[o + k] = (x[o + k] as number) + (creak[k] as number);
    [84, 88, 91, 96, 100].forEach((m, i) => bell(sr, midiHz(m), 0.4, x, 0.95 + i * 0.05, 0.8));
    return normalize(x, 0.65);
  },
  /** a coconut drops: a falling whistle */
  coconut: (sr) => normalize(tone(sr, 0.55, (t) => 1500 - t * 1700, 'sine', (t) => Math.min(1, t * 20) * (1 - t / 0.55) * 0.6), 0.4),
  /** through a shell ring: a rising sparkle chord */
  ring: (sr) => {
    const x = buf(sr, 0.7);
    [86, 90, 93, 98].forEach((m, i) => bell(sr, midiHz(m), 0.4, x, i * 0.035, 0.8));
    const sweep = svf(noise(sr, 0.3, (t) => Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.4, 53), sr, (t) => 3000 + t * 20000, 0.5, 'bp');
    return normalize(mix(x, sweep), 0.55);
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

export type MusicLoop = 'beach' | 'whistle' | 'steel' | 'pad' | 'island' | 'chase';
/** loops that play in sync on top of the beach loop, one per zone flavour */
const LAYERS: MusicLoop[] = ['whistle', 'steel', 'pad'];
const LOOP_BPM: Record<MusicLoop, number> = { beach: 104, whistle: 104, steel: 104, pad: 104, island: 122, chase: 140 };
const MUSIC_SR = 32000;

/** Render one music loop (8 bars) with an OfflineAudioContext: no CPU cost during play. */
async function renderMusic(sampleRate: number, kind: MusicLoop = 'beach'): Promise<AudioBuffer | null> {
  const OAC = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OAC) return null;
  const bpm = LOOP_BPM[kind];
  const beat = 60 / bpm;
  const bars = 8;
  const len = bars * 4 * beat;
  const sr = Math.min(sampleRate, MUSIC_SR);
  const layer = LAYERS.includes(kind);
  const chans = layer ? 1 : 2;
  const tail = 2; // seconds rendered past the loop end and folded back into the start (seamless loop)
  const ctx = new OAC(chans, Math.ceil((len + tail) * sr), sr);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);

  const C4 = 60;
  const play = (b: AudioBuffer, at: number, semis: number, gain: number, pan = 0): void => {
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = Math.pow(2, semis / 12);
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g);
    if (pan !== 0 && chans === 2 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(out);
    } else g.connect(out);
    s.start(at);
  };
  const shaker = (): AudioBuffer => toBuffer(ctx, svf(noise(sr, 0.07, (t) => Math.exp(-t * 60), 11), sr, () => 7000, 0.6, 'hp'));
  const kick = (): AudioBuffer => toBuffer(ctx, tone(sr, 0.18, (t) => 120 - t * 350, 'sine', (t) => Math.exp(-t * 22)));

  if (kind === 'beach') {
    const pl = toBuffer(ctx, pluck(sr, midiHz(C4), 1.4));
    const mar = toBuffer(ctx, marimba(sr, midiHz(72)));
    const bass = toBuffer(ctx, bassNote(sr, midiHz(48)));
    const sh = shaker();
    const kk = kick();
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
      for (let k = 0; k < 16; k++) play(sh, t0 + k * (beat / 4), 0, k % 2 === 1 ? 0.12 : 0.05, 0.35);
      play(kk, t0, 0, 0.35);
      play(kk, t0 + 2 * beat, 0, 0.28);
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
  } else if (kind === 'whistle') {
    // Boardwalk Pier: a breezy whistled counter-melody (sine + vibrato), answering the marimba
    const wh = toBuffer(ctx, tone(sr, 0.9, (t) => midiHz(84) * (1 + Math.sin(t * 34) * 0.012 * Math.min(1, t * 4)), 'sine', (t) => Math.min(1, t * 18) * Math.exp(-t * 2.2)));
    const line: [number, number, number][] = [
      [0, 6, 84], [1, 0, 86], [1, 3, 88], [2, 6, 88], [3, 0, 89], [3, 3, 88], [3, 5, 86],
      [4, 6, 84], [5, 0, 86], [5, 3, 83], [6, 6, 81], [7, 0, 84], [7, 4, 83], [7, 6, 79],
    ];
    for (const [bar, e, m] of line) play(wh, bar * 4 * beat + e * (beat / 2), m - 84, 0.38);
  } else if (kind === 'steel') {
    // Tide Pool Cove: rolling steel-drum arpeggios in 16ths over the chords
    const steel = buf(sr, 0.5);
    const f = midiHz(72);
    for (let i = 0; i < steel.length; i++) {
      const t = i / sr;
      steel[i] = Math.sin(TAU * f * t + Math.sin(TAU * f * 1.5 * t) * 2 * Math.exp(-t * 7)) * Math.exp(-t * 7) * Math.min(1, t * 600);
    }
    const sb = toBuffer(ctx, steel);
    const arps = [[72, 76, 79, 84], [71, 74, 79, 83], [72, 76, 81, 84], [72, 77, 81, 84]];
    for (let bar = 0; bar < bars; bar++) {
      const a = arps[bar % 4] as number[];
      for (let k = 0; k < 16; k++) {
        if (k % 8 === 7) continue;
        const m = a[[0, 1, 2, 3, 2, 1, 2, 3][k % 8] as number] as number;
        play(sb, bar * 4 * beat + k * (beat / 4), m - 72, k % 4 === 0 ? 0.24 : 0.15);
      }
    }
  } else if (kind === 'pad') {
    // Sunset Lagoon: warm slow pad swells under everything
    const padNote = (m: number): Float32Array => {
      const x = buf(sr, 4 * beat * 1.05);
      const fq = midiHz(m);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.8) * Math.min(1, (x.length / sr - t) / 0.6);
        x[i] = (Math.sin(TAU * fq * t) + 0.35 * Math.sin(TAU * fq * 2.003 * t) + 0.2 * Math.sin(TAU * fq * 0.998 * t + 1)) * env;
      }
      return x;
    };
    const chords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]];
    const cache = new Map<number, AudioBuffer>();
    for (let bar = 0; bar < bars; bar++) {
      for (const m of chords[bar % 4] as number[]) {
        if (!cache.has(m)) cache.set(m, toBuffer(ctx, padNote(m)));
        play(cache.get(m) as AudioBuffer, bar * 4 * beat, 0, 0.13);
      }
    }
  } else if (kind === 'island') {
    // Island Hop: upbeat and bouncy: octave-jumping bass, offbeat plucks, claps and a sunny whistle-marimba tune in G
    const pl = toBuffer(ctx, pluck(sr, midiHz(C4), 0.6));
    const mar = toBuffer(ctx, marimba(sr, midiHz(72)));
    const bass = toBuffer(ctx, tone(sr, 0.22, () => midiHz(48), 'tri', (t) => Math.exp(-t * 9) * Math.min(1, t * 300)));
    const clap = toBuffer(ctx, svf(noise(sr, 0.12, (t) => (Math.exp(-t * 40) + (t > 0.012 ? Math.exp(-(t - 0.012) * 45) : 0)) * 0.7, 31), sr, () => 1800, 0.8, 'bp'));
    const sh = shaker();
    const kk = kick();
    const roots = [43, 48, 40, 38]; // G C Em D
    const chords = [[67, 71, 74], [67, 72, 76], [67, 71, 76], [66, 69, 74]];
    for (let bar = 0; bar < bars; bar++) {
      const ci = bar % 4;
      const t0 = bar * 4 * beat;
      const r = roots[ci] as number;
      for (let e = 0; e < 8; e++) play(bass, t0 + e * (beat / 2), r - 48 + (e % 2 === 1 ? 12 : 0), e % 2 === 0 ? 0.55 : 0.38);
      for (let q = 0; q < 4; q++) for (const m of chords[ci] as number[]) play(pl, t0 + q * beat + beat / 2, m - C4, 0.09, -0.3);
      play(clap, t0 + beat, 0, 0.45, 0.1);
      play(clap, t0 + 3 * beat, 0, 0.45, 0.1);
      play(kk, t0, 0, 0.4);
      play(kk, t0 + 2 * beat, 0, 0.32);
      for (let k = 0; k < 8; k++) play(sh, t0 + k * (beat / 2) + beat / 4, 0, 0.08, 0.35);
    }
    const mel: [number, number, number][] = [
      [0, 0, 79], [0, 2, 83], [0, 3, 81], [0, 4, 79], [0, 6, 74],
      [1, 0, 76], [1, 2, 79], [1, 4, 84], [1, 6, 83],
      [2, 0, 83], [2, 1, 81], [2, 2, 79], [2, 4, 76], [2, 6, 79],
      [3, 0, 78], [3, 2, 81], [3, 4, 86], [3, 6, 84],
      [4, 0, 83], [4, 1, 84], [4, 2, 86], [4, 4, 83], [4, 6, 79],
      [5, 0, 84], [5, 2, 88], [5, 4, 84], [5, 6, 79],
      [6, 0, 83], [6, 2, 79], [6, 3, 76], [6, 4, 79], [6, 6, 83],
      [7, 0, 81], [7, 2, 78], [7, 4, 74], [7, 6, 79],
    ];
    for (const [bar, e, m] of mel) play(mar, bar * 4 * beat + e * (beat / 2), m - 72, 0.34, 0.2);
  } else {
    // Great Wave chase: driving and tense: pulsing 8th bass in A minor, toms, a rising ostinato
    const bass = toBuffer(ctx, tone(sr, 0.2, () => midiHz(45), 'square', (t) => Math.exp(-t * 10) * Math.min(1, t * 400) * 0.6));
    const tom = toBuffer(ctx, tone(sr, 0.3, (t) => 140 - t * 160, 'sine', (t) => Math.exp(-t * 12)));
    const hat = toBuffer(ctx, svf(noise(sr, 0.04, (t) => Math.exp(-t * 90), 37), sr, () => 9000, 0.5, 'hp'));
    const ost = toBuffer(ctx, tone(sr, 0.16, () => midiHz(69), 'tri', (t) => Math.exp(-t * 14)));
    const kk = kick();
    const roots = [45, 41, 48, 43]; // Am F C G
    const pattern = [0, 7, 12, 7, 0, 7, 12, 15];
    for (let bar = 0; bar < bars; bar++) {
      const ci = bar % 4;
      const t0 = bar * 4 * beat;
      const r = roots[ci] as number;
      for (let e = 0; e < 8; e++) play(bass, t0 + e * (beat / 2), r - 45, e % 2 === 0 ? 0.5 : 0.35, -0.15);
      for (let k = 0; k < 16; k++) play(hat, t0 + k * (beat / 4), 0, k % 4 === 2 ? 0.16 : 0.07, 0.4);
      for (let q = 0; q < 4; q++) play(kk, t0 + q * beat, 0, 0.42);
      play(tom, t0 + 3.5 * beat, 0, 0.4, -0.2);
      play(tom, t0 + 3.75 * beat, -5, 0.4, 0.2);
      for (let e = 0; e < 8; e++) play(ost, t0 + e * (beat / 2), r - 45 + (pattern[e] as number) + (bar >= 4 ? 12 : 0), 0.13, 0.25);
    }
  }
  const rendered = await ctx.startRendering();
  const n = Math.ceil(len * sr);
  const loop = new AudioBuffer({ numberOfChannels: chans, length: n, sampleRate: sr });
  for (let ch = 0; ch < chans; ch++) {
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
  /** rendered loops, and the live sources/gains of the current ones */
  private loops = new Map<MusicLoop, AudioBuffer>();
  private loopGain = new Map<MusicLoop, GainNode>();
  private loopSrc = new Map<MusicLoop, AudioBufferSourceNode>();
  private track: 'beach' | 'island' | 'chase' | 'mellow' = 'beach';
  private zone = 0;
  private rumbleGain: GainNode | null = null;
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
      void this.renderAll().catch(() => {});
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

  /** Render the beach loop first (music starts), then the zone layers and mode loops one by one. */
  private async renderAll(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const beach = await renderMusic(ctx.sampleRate, 'beach');
    if (!beach || !this.ctx) return;
    this.loops.set('beach', beach);
    // the beach loop and its layers start together so they stay in sync
    this.startLoop('beach', 0);
    this.musicSrc = this.loopSrc.get('beach') ?? null;
    this.setMusicMode(this.mode);
    for (const k of ['whistle', 'steel', 'pad', 'island', 'chase'] as MusicLoop[]) {
      await new Promise((r) => setTimeout(r, 120));
      const b = await renderMusic(ctx.sampleRate, k);
      if (!b || !this.ctx) return;
      this.loops.set(k, b);
      if (LAYERS.includes(k)) this.startLoop(k, this.loopOffset());
    }
    this.applyMix(0.05);
  }

  /** where the beach loop is now (layers join in step) */
  private loopOffset(): number {
    const ctx = this.ctx;
    const b = this.loops.get('beach');
    if (!ctx || !b || this.beachStart < 0) return 0;
    return (ctx.currentTime - this.beachStart) % b.duration;
  }
  private beachStart = -1;

  private startLoop(k: MusicLoop, offset: number): void {
    const ctx = this.ctx;
    const b = this.loops.get(k);
    if (!ctx || !b || !this.musicBus) return;
    this.loopSrc.get(k)?.stop();
    let g = this.loopGain.get(k);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicBus);
      this.loopGain.set(k, g);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(g);
    src.start(ctx.currentTime, offset % b.duration);
    if (k === 'beach') this.beachStart = ctx.currentTime - offset;
    this.loopSrc.set(k, src);
    this.applyMix(0.05);
  }

  /** Gains for the current track and zone (UPDATE2_PLAN.md §7: zones crossfade). */
  private applyMix(tc = 0.6): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const beach = this.track === 'beach';
    const mellow = this.track === 'mellow';
    const want: Record<MusicLoop, number> = {
      beach: beach ? (this.zone === 3 ? 0.7 : 1) : mellow ? 0.5 : 0,
      whistle: beach && this.zone === 1 ? 1 : 0,
      steel: beach && this.zone === 2 ? 1 : 0,
      pad: (beach && this.zone === 3) || mellow ? 1 : 0,
      island: this.track === 'island' ? 1 : 0,
      chase: this.track === 'chase' ? 1 : 0,
    };
    for (const [k, g] of this.loopGain) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(want[k], t, tc);
    }
  }

  /** Which loop plays: Beach Run (with zone layers), Island Hop, the Great Wave chase, or the mellow
   * mix (Crab Cove, Home at night). */
  setTrack(track: 'beach' | 'island' | 'chase' | 'mellow'): void {
    if (track === this.track) return;
    this.track = track;
    // mode loops restart from the top so the tune begins with the level
    if ((track === 'island' || track === 'chase') && this.loops.has(track)) this.startLoop(track, 0);
    this.applyMix(0.35);
  }

  setZone(z: number): void {
    if (z === this.zone) return;
    this.zone = z;
    this.applyMix(1.2);
  }

  /** Great Wave rumble: 0 (far/off) .. 1 (right behind) */
  setRumble(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    if (!this.rumbleGain) {
      if (level <= 0) return;
      const r = noiseGen(41);
      const x = new Float32Array(ctx.sampleRate * 2);
      // brown-ish noise, looped
      let v = 0;
      for (let i = 0; i < x.length; i++) {
        v = v * 0.985 + r() * 0.06;
        x[i] = v;
      }
      const fade = 2000;
      for (let i = 0; i < fade; i++) x[x.length - fade + i] = (x[x.length - fade + i] as number) * (1 - i / fade) + (x[i] as number) * (i / fade);
      const src = ctx.createBufferSource();
      src.buffer = toBuffer(ctx, normalize(x, 0.8));
      src.loop = true;
      src.loopEnd = (x.length - fade) / ctx.sampleRate;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      this.rumbleGain = ctx.createGain();
      this.rumbleGain.gain.value = 0;
      src.connect(lp);
      lp.connect(this.rumbleGain);
      this.rumbleGain.connect(this.sfxBus);
      src.start();
    }
    this.rumbleGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.9, ctx.currentTime, 0.15);
  }

  play(s: Sfx, opt: { streak?: number; pan?: number; pitch?: number; muffle?: boolean } = {}): void {
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
    if (opt.pitch) src.playbackRate.value = Math.pow(2, opt.pitch / 12);
    const g = ctx.createGain();
    g.gain.value = s === 'shell' ? 0.7 : 1;
    if (opt.muffle) {
      // behind the camera: duller and quieter
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.value *= 0.6;
      src.connect(lp);
      lp.connect(g);
    } else src.connect(g);
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
