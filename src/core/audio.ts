/**
 * All sound is synthesised at runtime (PLAN.md §7, UPDATE8_PLAN.md Audio track). Nothing is downloaded.
 *
 * - SFX are computed into AudioBuffers when audio is unlocked by the first user gesture (layered
 *   envelopes, filtered noise, FM), then played through a shared reverb send.
 * - Music is a lookahead sequencer: every instrument is rendered once into a small sample bank, and
 *   a 25 ms timer schedules notes ~0.2 s ahead on the AudioContext clock (timer jitter never reaches
 *   the beat). Each track has a 32-bar form (A B A' B'): voice-led chords, a bassline, swung drums and
 *   a lead motif that varies every 8 bars. Beach Run zone layers ride on the same clock.
 * - A quiet beach ambience (wave swells and a distant gull now and then) follows the SFX volume.
 * - Mix: master → glue compressor → limiter. Every one-shot node is disconnected when it ends.
 */
export type Sfx =
  | 'shell' | 'bigShell' | 'lane' | 'hop' | 'land' | 'slam' | 'bump' | 'crash' | 'powerup' | 'shieldPop'
  | 'rider' | 'closeShave' | 'goal' | 'newBest' | 'zone' | 'tap' | 'purchase' | 'countdown' | 'go' | 'milestone' | 'deny'
  | 'tick' | 'pop' | 'levelUp'
  // Update 2 (UPDATE2_PLAN.md §7)
  | 'dollar' | 'win' | 'star' | 'claim' | 'equip' | 'gull' | 'boing' | 'splash' | 'whoosh' | 'streakFlame'
  // Update 3 (UPDATE3_PLAN.md §7)
  | 'giftCollect' | 'pearl' | 'place' | 'chatter' | 'trophy' | 'chestOpen' | 'coconut' | 'ring'
  // Update 8: distinct power-ups, Shell Fever, Second Chance, Shell Dash, soft UI confirm
  | 'magnet' | 'shield' | 'fever' | 'revive' | 'dash' | 'confirm';

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

/**
 * State-variable filter (bandpass/lowpass/highpass); cutoff may vary per sample. `q` is the damping
 * (small = narrow and ringing, ~1.4 = flat); the coefficient is clamped to the stable region.
 */
function svf(x: Float32Array, sr: number, cutoff: (t: number) => number, q: number, mode: 'lp' | 'bp' | 'hp'): Float32Array {
  let low = 0;
  let band = 0;
  const out = new Float32Array(x.length);
  const fMax = Math.min(1.4, Math.sqrt(q * q + 4) - q - 0.02);
  let f = 0;
  for (let i = 0; i < x.length; i++) {
    // the coefficient only moves every 16 samples (cheap, and inaudible)
    if ((i & 15) === 0) f = Math.min(fMax, 2 * Math.sin((Math.PI * Math.min(cutoff(i / sr), sr * 0.25)) / sr));
    low += f * band;
    const high = x[i] - low - q * band;
    band += f * high;
    out[i] = mode === 'lp' ? low : mode === 'bp' ? band : high;
  }
  return out;
}

/** Short fades at both ends so no buffer starts or stops on a step (no clicks). */
function declick(x: Float32Array, sr: number, fadeIn = 0.0015, fadeOut = 0.012): Float32Array {
  const a = Math.min(x.length, Math.max(1, Math.floor(fadeIn * sr)));
  const b = Math.min(x.length, Math.max(1, Math.floor(fadeOut * sr)));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

/** Scale to a peak, then declick. */
function finish(x: Float32Array, sr: number, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
  return declick(x, sr);
}

/** add y into x starting at `offset` seconds */
function put(x: Float32Array, y: Float32Array, sr: number, offset = 0, gain = 1): Float32Array {
  const o = Math.floor(offset * sr);
  for (let i = 0; i < y.length && o + i < x.length; i++) x[o + i] += y[i] * gain;
  return x;
}

function mix(...xs: Float32Array[]): Float32Array {
  let n = 0;
  for (const x of xs) n = Math.max(n, x.length);
  const o = new Float32Array(n);
  for (const x of xs) for (let i = 0; i < x.length; i++) o[i] += x[i];
  return o;
}

/** bell: fundamental + inharmonic partials, fast attack, exponential decay (rotating phasors and
 * multiplicative decays: no sin/exp per sample, so chimes build fast on phones) */
function bell(sr: number, f: number, dur: number, out?: Float32Array, offset = 0, gain = 1, decay = 9): Float32Array {
  const x = out ?? buf(sr, dur + offset);
  const o = Math.floor(offset * sr);
  const n = Math.floor(dur * sr);
  const ratios = [1, 2.76, 5.4];
  const amps = [1, 0.45, 0.2];
  const extra = [0, 14, 30];
  const pc = [0, 0, 0];
  const ps = [0, 0, 0];
  const rc = [0, 0, 0];
  const rs = [0, 0, 0];
  const dk = [0, 0, 0];
  const a = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    const w = (TAU * f * (ratios[j] as number)) / sr;
    rc[j] = Math.cos(w);
    rs[j] = Math.sin(w);
    pc[j] = 1;
    // the top partials above Nyquist are dropped
    a[j] = f * (ratios[j] as number) < sr * 0.45 ? (amps[j] as number) * gain : 0;
    dk[j] = Math.exp(-(decay + (extra[j] as number)) / sr);
  }
  const atk = Math.max(1, Math.floor(sr / 500));
  const rel = Math.max(1, Math.floor(sr * 0.01));
  for (let i = 0; i < n && o + i < x.length; i++) {
    let v = 0;
    for (let j = 0; j < 3; j++) {
      const c = (pc[j] as number) * (rc[j] as number) - (ps[j] as number) * (rs[j] as number);
      ps[j] = (ps[j] as number) * (rc[j] as number) + (pc[j] as number) * (rs[j] as number);
      pc[j] = c;
      v += (ps[j] as number) * (a[j] as number);
      a[j] = (a[j] as number) * (dk[j] as number);
    }
    x[o + i] += v * Math.min(1, i / atk) * Math.min(1, (n - i) / rel);
  }
  return x;
}

type Wave = 'sine' | 'tri' | 'square';
function tone(sr: number, dur: number, freq: (t: number) => number, wave: Wave = 'sine', env: (t: number) => number = (t) => Math.exp(-t * 8)): Float32Array {
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

/** two-operator FM: carrier freq(t), modulator at ratio × carrier with index(t) */
function fm(sr: number, dur: number, freq: (t: number) => number, ratio: number, index: (t: number) => number, env: (t: number) => number): Float32Array {
  const x = buf(sr, dur);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const f = freq(t);
    pc += f / sr;
    pm += (f * ratio) / sr;
    x[i] = Math.sin(TAU * pc + index(t) * Math.sin(TAU * pm)) * env(t);
  }
  return x;
}

function noise(sr: number, dur: number, env: (t: number) => number, seed = 3): Float32Array {
  const r = noiseGen(seed);
  const x = buf(sr, dur);
  for (let i = 0; i < x.length; i++) x[i] = r() * env(i / sr);
  return x;
}

/** sparse random impulses (sand grains, gravel) with a density that decays */
function grains(sr: number, dur: number, density: number, decay: number, seed: number): Float32Array {
  const r = noiseGen(seed);
  const x = buf(sr, dur);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const p = (density / sr) * Math.exp(-t * decay);
    if ((r() + 1) / 2 < p) x[i] = r() * (0.5 + 0.5 * Math.exp(-t * decay));
  }
  return x;
}

/** a rising sweep of band-passed air */
const swish = (sr: number, dur: number, f0: number, f1: number, q: number, seed: number, shape = 2): Float32Array =>
  svf(noise(sr, dur, (t) => Math.sin(Math.min(1, t / dur) * Math.PI) ** shape, seed), sr, (t) => f0 + (f1 - f0) * (t / dur), q, 'bp');

/** an arpeggio of bells: [midi, at, gain?][] */
function arp(sr: number, len: number, notes: [number, number, number?][], dur = 0.45, decay = 9): Float32Array {
  const x = buf(sr, len);
  for (const [m, at, g] of notes) bell(sr, midiHz(m), Math.min(dur, len - at), x, at, g ?? 1, decay);
  return x;
}

/** high, glittery shimmer noise */
const shimmer = (sr: number, dur: number, amt: number, seed: number): Float32Array =>
  svf(noise(sr, dur, (t) => Math.min(1, t * 30) * Math.exp(-t * 5) * amt, seed), sr, () => 8000, 0.4, 'hp');

/** sand thump: a falling sine plus low-passed noise */
const thump = (sr: number, dur: number, f0: number, f1: number, decay: number): Float32Array =>
  mix(
    tone(sr, dur, (t) => f1 + (f0 - f1) * Math.exp(-t * 30), 'sine', (t) => Math.exp(-t * decay)),
    svf(noise(sr, dur, (t) => Math.min(1, t * 400) * Math.exp(-t * decay * 1.6) * 0.8, 71), sr, () => 420, 0.7, 'lp'),
  );

/** the shell pickup chime at a given MIDI pitch: bell + FM glint + a tiny tick of attack */
function chime(sr: number, m: number): Float32Array {
  const f = midiHz(m);
  const x = bell(sr, f, 0.42, undefined, 0, 1, 8);
  put(x, fm(sr, 0.18, () => f * 2, 3.5, (t) => 1.4 * Math.exp(-t * 30), (t) => Math.exp(-t * 22) * 0.35), sr);
  put(x, svf(noise(sr, 0.008, (t) => Math.exp(-t * 600), 5), sr, () => 6000, 0.6, 'hp'), sr, 0, 0.5);
  return finish(x, sr, 0.55);
}

export const SFX: Record<Sfx, Gen> = {
  shell: (sr) => chime(sr, SHELL_ROOT),
  /** big shell: a sparkle arpeggio up a pentatonic run */
  bigShell: (sr) => {
    const x = arp(sr, 0.8, [[72, 0, 1], [76, 0.04, 0.9], [79, 0.08, 0.9], [84, 0.12, 0.85], [88, 0.16, 0.75], [91, 0.2, 0.6], [96, 0.26, 0.5]], 0.5, 8);
    return finish(mix(x, shimmer(sr, 0.7, 0.3, 21)), sr, 0.7);
  },
  /** lane change: an airy swish (panned and swept toward the move at play time) */
  lane: (sr) => {
    const air = swish(sr, 0.17, 900, 5200, 0.55, 81);
    const hiss = svf(noise(sr, 0.17, (t) => Math.sin(Math.min(1, t / 0.17) * Math.PI) ** 3 * 0.35, 83), sr, () => 6000, 0.5, 'hp');
    return finish(mix(air, hiss), sr, 0.3);
  },
  /** jump: a pitched-up whoosh plus a soft chirp */
  hop: (sr) => {
    const whoosh = swish(sr, 0.22, 500, 4200, 0.7, 85, 1.5);
    const chirp = fm(sr, 0.14, (t) => 520 + 1100 * Math.min(1, t / 0.1), 2, (t) => 0.8 * Math.exp(-t * 30), (t) => Math.min(1, t * 300) * Math.exp(-t * 22) * 0.7);
    return finish(mix(whoosh, chirp), sr, 0.42);
  },
  /** land: a sand thump plus a grain crackle (intensity scales it at play time) */
  land: (sr) => {
    const t = thump(sr, 0.2, 150, 55, 24);
    const crackle = svf(grains(sr, 0.18, 2200, 22, 87), sr, () => 3800, 1.2, 'bp');
    return finish(mix(t, crackle), sr, 0.48);
  },
  /** Sand Slam / hard landing: a deeper thump, a whump of sand and a long crackle */
  slam: (sr) => {
    const t = thump(sr, 0.45, 130, 38, 10);
    const whump = svf(noise(sr, 0.4, (t) => Math.min(1, t * 200) * Math.exp(-t * 9), 89), sr, (t) => 2200 * Math.exp(-t * 6) + 200, 0.8, 'lp');
    const crackle = svf(grains(sr, 0.45, 3500, 8, 91), sr, () => 3200, 1, 'bp');
    return finish(mix(t, whump, crackle), sr, 0.62);
  },
  /** bump: a soft thud with a knock */
  bump: (sr) => {
    const thud = thump(sr, 0.22, 190, 70, 22);
    const knock = svf(noise(sr, 0.05, (t) => Math.exp(-t * 90), 93), sr, () => 900, 0.5, 'bp');
    return finish(mix(thud, knock), sr, 0.55);
  },
  /** crash: an impact, scattered debris, and the comic falling whistle */
  crash: (sr) => {
    const x = buf(sr, 1.2);
    put(x, thump(sr, 0.5, 120, 34, 7), sr, 0, 1.1);
    put(x, svf(noise(sr, 0.35, (t) => Math.min(1, t * 500) * Math.exp(-t * 12), 95), sr, (t) => 5000 * Math.exp(-t * 8) + 300, 0.6, 'lp'), sr, 0, 0.9);
    const r = noiseGen(61);
    for (let i = 0; i < 16; i++) {
      const at = 0.05 + ((r() + 1) / 2) ** 1.6 * 0.7;
      const f = 1400 + ((r() + 1) / 2) * 4200;
      const bit = svf(noise(sr, 0.04, (t) => Math.exp(-t * 130), 100 + i), sr, () => f, 0.35, 'bp');
      put(x, bit, sr, at, 0.9 * (1 - at));
    }
    put(x, tone(sr, 0.7, (t) => 1100 - t * 1100 + Math.sin(t * 40) * 25, 'sine', (t) => Math.min(1, t * 10) * Math.exp(-t * 2.5) * 0.35), sr, 0.12);
    return finish(x, sr, 0.78);
  },
  /** generic power-up / Golden Shell boost: a bright rising triad */
  powerup: (sr) => {
    const x = buf(sr, 0.6);
    [72, 76, 79, 84].forEach((m, i) => put(x, fm(sr, 0.3, () => midiHz(m), 2, (t) => 0.9 * Math.exp(-t * 12), (t) => Math.min(1, t * 400) * Math.exp(-t * 9)), sr, i * 0.06));
    return finish(mix(x, shimmer(sr, 0.5, 0.15, 23)), sr, 0.5);
  },
  /** Shell Magnet: a humming, wobbling rise with clinks */
  magnet: (sr) => {
    const hum = fm(sr, 0.7, (t) => 180 + 260 * Math.min(1, t / 0.5), 1, (t) => 1.6 + Math.sin(t * TAU * 14) * 0.6, (t) => Math.min(1, t * 20) * (1 - t / 0.7) * (0.75 + 0.25 * Math.sin(t * TAU * 14)) * 0.6);
    const clinks = arp(sr, 0.7, [[91, 0.22, 0.5], [96, 0.32, 0.45], [100, 0.42, 0.4]], 0.3, 14);
    return finish(mix(svf(hum, sr, () => 2200, 0.7, 'lp'), clinks), sr, 0.55);
  },
  /** Bubble Shield: a rising bubble bloop and a glassy ring */
  shield: (sr) => {
    const bloop = tone(sr, 0.25, (t) => 300 + 1300 * (t / 0.25) ** 1.5, 'sine', (t) => Math.min(1, t * 80) * Math.exp(-t * 7));
    const ring = arp(sr, 0.8, [[84, 0.16, 0.8], [91, 0.2, 0.6], [96, 0.24, 0.4]], 0.6, 5);
    const air = swish(sr, 0.35, 1500, 7000, 0.6, 97);
    return finish(mix(bloop, ring, put(new Float32Array(air.length), air, sr, 0, 0.4)), sr, 0.55);
  },
  /** shield breaks: a pop and a spray of bubbles */
  shieldPop: (sr) => {
    const pop = tone(sr, 0.08, (t) => 500 + t * 14000, 'sine', (t) => Math.exp(-t * 40));
    const fizz = buf(sr, 0.35);
    const r = noiseGen(9);
    for (let i = 0; i < 7; i++) {
      const at = 0.03 + ((r() + 1) / 2) * 0.25;
      put(fizz, tone(sr, 0.04, (t) => 1400 + i * 260 + t * 9000, 'sine', (t) => Math.exp(-t * 80)), sr, at, 0.4);
    }
    return finish(mix(pop, noise(sr, 0.03, (t) => Math.exp(-t * 150), 9), fizz), sr, 0.6);
  },
  /** Wave Rider: a surf swell and two bright bells */
  rider: (sr) => {
    const surf = svf(noise(sr, 0.9, (t) => Math.sin(Math.min(1, t / 0.9) * Math.PI), 31), sr, (t) => 600 + t * 2500, 0.8, 'bp');
    const x = arp(sr, 0.9, [[79, 0.15, 0.5], [84, 0.22, 0.5], [88, 0.29, 0.35]], 0.55, 7);
    return finish(mix(surf, x), sr, 0.6);
  },
  /** Shell Fever: crackle, a fast pentatonic run and a held sparkle chord */
  fever: (sr) => {
    const r = noiseGen(29);
    const crackle = buf(sr, 0.9);
    for (let i = 0; i < crackle.length; i++) crackle[i] = r() > 0.993 ? r() * Math.exp((-i / sr) * 3) : 0;
    const run = arp(sr, 0.9, [[72, 0, 0.7], [74, 0.035, 0.7], [76, 0.07, 0.7], [79, 0.105, 0.75], [81, 0.14, 0.8], [84, 0.175, 0.85], [88, 0.24, 0.8], [91, 0.24, 0.6], [96, 0.24, 0.5]], 0.6, 5);
    return finish(mix(svf(crackle, sr, () => 3000, 0.5, 'hp'), run, shimmer(sr, 0.9, 0.2, 33)), sr, 0.62);
  },
  /** Second Chance: a rising whoosh into a bright chime */
  revive: (sr) => {
    const x = buf(sr, 1.1);
    put(x, swish(sr, 0.75, 250, 6500, 0.8, 35, 1.2), sr, 0, 1);
    put(x, tone(sr, 0.75, (t) => 180 + 700 * (t / 0.75) ** 2, 'tri', (t) => Math.min(1, t * 6) * 0.35), sr);
    put(x, arp(sr, 0.45, [[84, 0, 1], [88, 0.03, 0.8], [91, 0.06, 0.7]], 0.45, 6), sr, 0.62);
    return finish(x, sr, 0.62);
  },
  /** Shell Dash: a hard whoosh and a punchy hit */
  dash: (sr) => {
    const w = swish(sr, 0.32, 400, 6000, 0.6, 37, 1);
    const hit = mix(thump(sr, 0.25, 160, 60, 16), arp(sr, 0.5, [[79, 0.05, 0.6], [86, 0.08, 0.5]], 0.4, 9));
    return finish(mix(w, hit), sr, 0.62);
  },
  closeShave: (sr) => finish(mix(swish(sr, 0.18, 2000, 7000, 0.5, 39), tone(sr, 0.06, () => 2400, 'sine', (t) => Math.exp(-t * 60) * 0.6)), sr, 0.42),
  goal: (sr) => finish(arp(sr, 0.8, [[79, 0, 1], [84, 0.13, 1]], 0.6), sr, 0.6),
  newBest: (sr) => {
    const x = buf(sr, 1.2);
    const notes: [number, number, number][] = [[72, 0, 0.14], [76, 0.12, 0.14], [79, 0.24, 0.14], [84, 0.36, 0.7]];
    for (const [m, at, d] of notes) put(x, mix(tone(sr, d, () => midiHz(m), 'square', (t) => Math.exp(-t * 3) * 0.3), tone(sr, d, () => midiHz(m), 'tri', (t) => Math.exp(-t * 3))), sr, at);
    put(x, shimmer(sr, 0.8, 0.12, 41), sr, 0.36);
    return finish(x, sr, 0.55);
  },
  /** zone sting: an FM steel drum */
  zone: (sr) => {
    const x = buf(sr, 1.0);
    for (const [m, at] of [[79, 0], [76, 0.14], [84, 0.28]] as [number, number][]) {
      const f = midiHz(m);
      put(x, fm(sr, 0.6, () => f, 1.5, (t) => 2.2 * Math.exp(-t * 6), (t) => Math.exp(-t * 5)), sr, at);
    }
    return finish(x, sr, 0.55);
  },
  /** UI tap: a soft wooden tok */
  tap: (sr) => finish(mix(tone(sr, 0.05, (t) => 1150 - t * 3000, 'sine', (t) => Math.exp(-t * 80)), svf(noise(sr, 0.01, (t) => Math.exp(-t * 500), 43), sr, () => 2500, 0.6, 'bp')), sr, 0.24),
  /** UI confirm: a soft two-note lift */
  confirm: (sr) => finish(arp(sr, 0.3, [[79, 0, 0.8], [86, 0.06, 0.7]], 0.24, 16), sr, 0.3),
  purchase: (sr) => finish(mix(arp(sr, 0.9, [[84, 0], [88, 0.06], [91, 0.12], [96, 0.18], [91, 0.24], [96, 0.3]].map(([m, a]) => [m as number, a as number, 0.8]), 0.35), shimmer(sr, 0.7, 0.12, 45)), sr, 0.62),
  countdown: (sr) => finish(fm(sr, 0.14, () => 880, 2, (t) => 0.6 * Math.exp(-t * 30), (t) => Math.exp(-t * 26)), sr, 0.34),
  /** results count-up tick: very soft */
  tick: (sr) => finish(tone(sr, 0.025, () => 2200, 'sine', (t) => Math.exp(-t * 170)), sr, 0.12),
  pop: (sr) => finish(tone(sr, 0.09, (t) => 520 + t * 2600, 'sine', (t) => Math.exp(-t * 38)), sr, 0.28),
  levelUp: (sr) => finish(mix(arp(sr, 1.0, [[79, 0, 0.9], [83, 0.07, 0.9], [86, 0.14, 0.9], [91, 0.21, 0.9], [95, 0.28, 0.9]], 0.5), shimmer(sr, 0.9, 0.12, 47)), sr, 0.6),
  go: (sr) => finish(mix(fm(sr, 0.3, (t) => 1100 + t * 900, 1, (t) => 0.8 * Math.exp(-t * 10), (t) => Math.exp(-t * 10)), swish(sr, 0.2, 800, 5000, 0.7, 49)), sr, 0.42),
  milestone: (sr) => finish(arp(sr, 0.5, [[91, 0, 1], [96, 0.08, 1]], 0.35), sr, 0.42),
  /** sand dollar: a sparkling bell chord with a shimmer */
  dollar: (sr) => finish(mix(arp(sr, 0.9, [[88, 0, 1], [92, 0.04, 0.8], [95, 0.08, 0.8], [100, 0.16, 0.5]], 0.6), shimmer(sr, 0.9, 0.25, 51)), sr, 0.68),
  /** level win fanfare: brassy arpeggio and a held chord */
  win: (sr) => {
    const x = buf(sr, 1.45);
    const notes: [number, number, number][] = [[67, 0, 0.12], [72, 0.1, 0.12], [76, 0.2, 0.12], [79, 0.3, 0.12], [84, 0.42, 0.95], [76, 0.42, 0.95], [79, 0.42, 0.95]];
    for (const [m, at, d] of notes) {
      const f = midiHz(m);
      put(x, mix(tone(sr, d, () => f, 'square', (t) => Math.min(1, t * 60) * Math.exp(-t * 2.2) * 0.25), tone(sr, d, () => f * 1.002, 'tri', (t) => Math.exp(-t * 2.2))), sr, at);
    }
    return finish(svf(x, sr, () => 5000, 0.6, 'lp'), sr, 0.6);
  },
  /** star stamp: thump + bell (pitched up per star via the pitch option) */
  star: (sr) => finish(mix(thump(sr, 0.15, 180, 80, 26), arp(sr, 0.6, [[84, 0.02, 1], [91, 0.05, 0.6]], 0.5)), sr, 0.65),
  claim: (sr) => finish(mix(arp(sr, 0.8, [[76, 0, 0.9], [81, 0.05, 0.9], [85, 0.1, 0.9], [88, 0.15, 0.9]], 0.4), swish(sr, 0.35, 2000, 9000, 0.5, 13)), sr, 0.58),
  /** wardrobe equip: a soft fabric swish and a click */
  equip: (sr) => finish(mix(swish(sr, 0.16, 1200, 3000, 0.7, 17), tone(sr, 0.16, () => 1800, 'sine', (t) => (t < 0.11 ? 0 : Math.exp(-(t - 0.11) * 60)))), sr, 0.38),
  /** gull: a nasal two-part "kee-ow" with a breathy edge */
  gull: (sr) => {
    const x = buf(sr, 0.55);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const call = t < 0.08 ? t / 0.08 : t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.33);
      const f = (t < 0.2 ? 1500 + t * 800 : 1660 - (t - 0.2) * 1900) + Math.sin(t * 75) * 90;
      ph += f / sr;
      const p = ph % 1;
      x[i] = (Math.sin(TAU * p) + 0.5 * Math.sin(TAU * p * 2) + 0.3 * Math.sin(TAU * p * 3)) * call;
    }
    const breath = svf(noise(sr, 0.55, (t) => (t < 0.45 ? 0.15 : 0), 53), sr, () => 2600, 1, 'bp');
    return finish(svf(mix(x, breath), sr, () => 2300, 0.5, 'bp'), sr, 0.4);
  },
  /** bounce pad: a rubbery rising boing */
  boing: (sr) => finish(tone(sr, 0.5, (t) => 160 + t * 900 + Math.sin(t * 70) * (80 * Math.exp(-t * 6)), 'sine', (t) => Math.exp(-t * 6)), sr, 0.55),
  /** tide pool splash */
  splash: (sr) => finish(mix(svf(noise(sr, 0.5, (t) => Math.min(1, t * 80) * Math.exp(-t * 9), 19), sr, (t) => 5000 - t * 7000, 0.6, 'lp'), tone(sr, 0.12, (t) => 700 - t * 2500, 'sine', (t) => Math.exp(-t * 30))), sr, 0.55),
  /** UI screen transition */
  whoosh: (sr) => finish(swish(sr, 0.28, 400, 4000, 1.2, 23), sr, 0.32),
  /** daily streak flame: crackle and a warm swell */
  streakFlame: (sr) => {
    const r = noiseGen(29);
    const crackle = buf(sr, 0.7);
    for (let i = 0; i < crackle.length; i++) crackle[i] = r() > 0.995 ? r() : 0;
    const swell = tone(sr, 0.7, (t) => 220 + t * 220, 'tri', (t) => Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.5);
    return finish(mix(svf(crackle, sr, () => 3000, 0.5, 'hp'), swell), sr, 0.5);
  },
  /** Tide Gifts: a cascade of shell chimes */
  giftCollect: (sr) => finish(arp(sr, 1.1, [84, 86, 88, 91, 93, 96, 98, 100].map((m, i) => [m, i * 0.055, 0.7 + (i % 2) * 0.2] as [number, number, number]), 0.35), sr, 0.65),
  /** a pearl: a glassy sparkle arpeggio */
  pearl: (sr) => finish(mix(arp(sr, 0.8, [[91, 0, 0.8], [96, 0.035, 0.8], [100, 0.07, 1], [103, 0.11, 0.6], [108, 0.15, 0.4]], 0.55, 7), shimmer(sr, 0.7, 0.3, 43)), sr, 0.52),
  /** a decoration lands: soft sand thud and a sparkle */
  place: (sr) => finish(mix(thump(sr, 0.2, 150, 60, 20), arp(sr, 0.5, [[91, 0.08, 0.5]], 0.3)), sr, 0.55),
  /** friend chatter: little pitched crab blips */
  chatter: (sr) => {
    const x = buf(sr, 0.55);
    [0, 0.09, 0.17, 0.27, 0.36].forEach((at, i) => {
      const f0 = 520 + ((i * 137) % 5) * 90;
      put(x, tone(sr, 0.07, (t) => f0 + Math.sin(t * 90) * 60, 'square', (t) => Math.exp(-t * 30) * 0.5), sr, at);
    });
    return finish(svf(x, sr, () => 2600, 0.5, 'lp'), sr, 0.4);
  },
  /** trophy: a bright little fanfare */
  trophy: (sr) => {
    const x = buf(sr, 1.2);
    for (const [m, at] of [[76, 0], [79, 0.1], [84, 0.2], [88, 0.32], [91, 0.32]] as [number, number][]) {
      put(x, mix(tone(sr, 0.7, () => midiHz(m), 'tri', (t) => Math.exp(-t * 3)), tone(sr, 0.7, () => midiHz(m) * 2, 'sine', (t) => Math.exp(-t * 6) * 0.3)), sr, at);
    }
    bell(sr, midiHz(103), 0.5, x, 0.45, 0.6);
    return finish(x, sr, 0.6);
  },
  /** treasure chest: wooden rattle, a creak, then a burst of chimes */
  chestOpen: (sr) => {
    const x = buf(sr, 1.45);
    for (let i = 0; i < 6; i++) put(x, svf(noise(sr, 0.06, (t) => Math.exp(-t * 60), 50 + i), sr, () => 900, 1.5, 'bp'), sr, i * 0.12, 0.7);
    put(x, tone(sr, 0.25, (t) => 220 + t * 300 + Math.sin(t * 160) * 30, 'square', (t) => Math.sin(Math.min(1, t / 0.25) * Math.PI) * 0.25), sr, 0.75);
    [84, 88, 91, 96, 100].forEach((m, i) => bell(sr, midiHz(m), 0.4, x, 0.95 + i * 0.05, 0.8));
    return finish(x, sr, 0.65);
  },
  /** a coconut drops: a falling whistle */
  coconut: (sr) => finish(tone(sr, 0.55, (t) => 1500 - t * 1700, 'sine', (t) => Math.min(1, t * 20) * (1 - t / 0.55) * 0.6), sr, 0.4),
  /** through a shell ring: a rising sparkle chord */
  ring: (sr) => finish(mix(arp(sr, 0.7, [[86, 0, 0.8], [90, 0.035, 0.8], [93, 0.07, 0.8], [98, 0.105, 0.8]], 0.4), swish(sr, 0.3, 3000, 9000, 0.5, 53)), sr, 0.55),
  deny: (sr) => finish(svf(tone(sr, 0.16, (t) => 180 - t * 60, 'square', (t) => Math.exp(-t * 12)), sr, () => 1400, 0.7, 'lp'), sr, 0.3),
};

/** Synthesise one effect's samples (exported for tests). */
export function synthSfx(name: Sfx, sampleRate: number): Float32Array {
  return SFX[name](sampleRate);
}

/** Shell streak: pentatonic steps above SHELL_ROOT (C D E G A ...), two octaves. */
export const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const SHELL_ROOT = 72;
/** Index into PENTA for the n-th shell of a streak: climbs one step a shell, then alternates the top two. */
export function shellStep(streak: number): number {
  if (streak <= 1) return 0;
  const s = streak - 1;
  const n = PENTA.length;
  if (s < n) return s;
  return (s - n) % 2 === 0 ? n - 2 : n - 1;
}
/** The pickup chime for one streak step (exported for tests). */
export function synthShell(step: number, sampleRate: number): Float32Array {
  return chime(sampleRate, SHELL_ROOT + (PENTA[Math.max(0, Math.min(PENTA.length - 1, step))] as number));
}

// ------------------------------------------------------------------------------------- instruments

export type Inst = 'kick' | 'kickSoft' | 'clap' | 'hat' | 'shaker' | 'rim' | 'tom' | 'bass' | 'uke' | 'marimba' | 'steel' | 'pad' | 'whistle' | 'epiano';
/** pitched banks are sampled every few semitones and repitched to the nearest; `sustain` voices are
 * gated by note length with a release ramp, the rest ring out */
const INST: Record<Inst, { roots: number[]; sustain: boolean; sr: number }> = {
  kick: { roots: [60], sustain: false, sr: 32000 },
  kickSoft: { roots: [60], sustain: false, sr: 32000 },
  clap: { roots: [60], sustain: false, sr: 32000 },
  hat: { roots: [60], sustain: false, sr: 32000 },
  shaker: { roots: [60], sustain: false, sr: 32000 },
  rim: { roots: [60], sustain: false, sr: 32000 },
  tom: { roots: [45], sustain: false, sr: 32000 },
  bass: { roots: [30, 36, 42, 48], sustain: true, sr: 22050 },
  uke: { roots: [55, 61, 67, 73], sustain: false, sr: 32000 },
  marimba: { roots: [64, 70, 76, 82, 88], sustain: false, sr: 32000 },
  steel: { roots: [64, 70, 76, 82, 88], sustain: false, sr: 32000 },
  pad: { roots: [50, 56, 62, 68, 74], sustain: true, sr: 22050 },
  whistle: { roots: [74, 80, 86, 92], sustain: true, sr: 32000 },
  epiano: { roots: [56, 62, 68, 74, 80], sustain: true, sr: 32000 },
};
export const INSTRUMENTS = Object.keys(INST) as Inst[];
export const instRoots = (i: Inst): readonly number[] => INST[i].roots;
export const instRate = (i: Inst): number => INST[i].sr;

/** Karplus-Strong plucked string (ukulele-ish). */
function pluck(sr: number, f: number, dur: number, seed: number): Float32Array {
  const x = buf(sr, dur);
  const period = Math.max(2, Math.round(sr / f));
  const ring = new Float32Array(period);
  const r = noiseGen(seed);
  let lp = 0;
  for (let i = 0; i < period; i++) {
    lp = lp * 0.5 + r() * 0.5; // a softer pick
    ring[i] = lp;
  }
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    const v = ring[idx];
    const nv = 0.5 * (v + prev) * 0.997;
    prev = v;
    ring[idx] = nv;
    idx = (idx + 1) % period;
    x[i] = v;
  }
  return svf(x, sr, () => 3800, 0.8, 'lp');
}

/** Render one instrument sample at a MIDI pitch (exported for tests). */
export function synthInstrument(inst: Inst, m: number, sr = INST[inst].sr): Float32Array {
  const f = midiHz(m);
  switch (inst) {
    case 'kick': {
      const body = tone(sr, 0.35, (t) => 48 + 110 * Math.exp(-t * 35), 'sine', (t) => Math.exp(-t * 9));
      const click = svf(noise(sr, 0.006, (t) => Math.exp(-t * 900), 201), sr, () => 3000, 0.7, 'hp');
      return finish(mix(body, put(new Float32Array(click.length), click, sr, 0, 0.35)), sr, 0.95);
    }
    case 'kickSoft':
      return finish(tone(sr, 0.3, (t) => 50 + 70 * Math.exp(-t * 30), 'sine', (t) => Math.exp(-t * 10)), sr, 0.9);
    case 'clap': {
      const x = buf(sr, 0.22);
      for (const at of [0, 0.009, 0.018]) put(x, noise(sr, 0.012, (t) => Math.exp(-t * 300), 203), sr, at, 0.8);
      put(x, noise(sr, 0.19, (t) => Math.exp(-t * 28), 205), sr, 0.026, 0.6);
      return finish(svf(x, sr, () => 1600, 0.9, 'bp'), sr, 0.9);
    }
    case 'hat':
      return finish(svf(noise(sr, 0.06, (t) => Math.exp(-t * 75), 207), sr, () => 8000, 0.5, 'hp'), sr, 0.8);
    case 'shaker':
      return finish(svf(noise(sr, 0.09, (t) => Math.min(1, t / 0.008) * Math.exp(-t * 48), 209), sr, () => 5600, 0.9, 'bp'), sr, 0.8);
    case 'rim':
      return finish(mix(tone(sr, 0.05, () => 1700, 'sine', (t) => Math.exp(-t * 110)), svf(noise(sr, 0.03, (t) => Math.exp(-t * 160), 211), sr, () => 2400, 0.5, 'bp')), sr, 0.8);
    case 'tom':
      return finish(mix(tone(sr, 0.38, (t) => f * 1.6 * (0.75 + 0.25 * Math.exp(-t * 18)), 'sine', (t) => Math.exp(-t * 9)), svf(noise(sr, 0.04, (t) => Math.exp(-t * 90), 213), sr, () => 800, 1, 'lp')), sr, 0.9);
    case 'bass': {
      // round sub with a short plucked brightness on top
      const x = buf(sr, 1.6);
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += f / sr;
        const p = TAU * ph;
        const bright = Math.exp(-t * 9);
        x[i] = (Math.sin(p) + (0.35 + 0.3 * bright) * Math.sin(2 * p) + 0.22 * bright * Math.sin(3 * p) + 0.08 * bright * Math.sin(4 * p)) * (0.7 + 0.3 * Math.exp(-t * 2)) * Math.min(1, t * 250);
      }
      return finish(x, sr, 0.85);
    }
    case 'uke':
      return finish(pluck(sr, f, 1.3, 7 + (m % 5)), sr, 0.8);
    case 'marimba': {
      const x = buf(sr, 0.9);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        x[i] = (Math.sin(TAU * f * t) * Math.exp(-t * 6) + 0.3 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 24) + 0.07 * Math.sin(TAU * f * 9.9 * t) * Math.exp(-t * 60)) * Math.min(1, t * 900);
      }
      put(x, svf(noise(sr, 0.004, (t) => Math.exp(-t * 900), 215), sr, () => 1800, 0.8, 'lp'), sr, 0, 0.3);
      return finish(x, sr, 0.85);
    }
    case 'steel': {
      const body = fm(sr, 1.0, () => f, 2, (t) => 1.5 * Math.exp(-t * 8) + 0.2, (t) => Math.min(1, t * 350) * Math.exp(-t * 3.8));
      const third = tone(sr, 1.0, () => f * 3, 'sine', (t) => Math.exp(-t * 6) * 0.18);
      return finish(mix(body, third), sr, 0.8);
    }
    case 'pad': {
      // detuned additive pad: a slow attack, gentle chorus, dark top. Partials run as rotating
      // phasors (no Math.sin per sample) so the 4.5 s samples build quickly on phones.
      const x = buf(sr, 4.5);
      const n = 10;
      const cw = new Float64Array(n);
      const sw = new Float64Array(n);
      const c = new Float64Array(n);
      const sn = new Float64Array(n);
      const amp = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const h = (j >> 1) + 1;
        const w = (TAU * f * h * (j & 1 ? 0.9965 : 1.0035)) / sr;
        cw[j] = Math.cos(w);
        sw[j] = Math.sin(w);
        c[j] = Math.cos(j & 1 ? h : 0);
        sn[j] = Math.sin(j & 1 ? h : 0);
        amp[j] = 1 / (h * h * 0.8 + 0.2);
      }
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        let v = 0;
        for (let j = 0; j < n; j++) {
          const nc = c[j] * cw[j] - sn[j] * sw[j];
          sn[j] = sn[j] * cw[j] + c[j] * sw[j];
          c[j] = nc;
          v += amp[j] * sn[j];
        }
        x[i] = v * Math.min(1, t / 0.35) * (0.85 + 0.15 * Math.sin(TAU * 0.4 * t));
      }
      return finish(x, sr, 0.7);
    }
    case 'whistle': {
      const x = buf(sr, 1.8);
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += (f * (1 + Math.sin(t * TAU * 5.5) * 0.012 * Math.min(1, t * 3))) / sr;
        x[i] = (Math.sin(TAU * ph) + 0.06 * Math.sin(2 * TAU * ph)) * Math.min(1, t * 22) * (0.8 + 0.2 * Math.exp(-t * 3));
      }
      const breath = svf(noise(sr, 1.8, (t) => Math.min(1, t * 20) * 0.1, 217), sr, () => f, 0.3, 'bp');
      return finish(mix(x, breath), sr, 0.75);
    }
    case 'epiano': {
      // Rhodes-ish: FM body with a short metallic tine on top
      const body = fm(sr, 2.0, () => f, 1, (t) => 1.1 * Math.exp(-t * 3) + 0.15, (t) => Math.min(1, t * 400) * Math.exp(-t * 1.4));
      const tine = tone(sr, 0.3, () => f * 7.1, 'sine', (t) => Math.exp(-t * 26) * 0.12);
      return finish(mix(body, tine), sr, 0.7);
    }
  }
  return buf(sr, 0.1);
}

// ------------------------------------------------------------------------------------- arrangements

export type TrackId = 'beach' | 'island' | 'chase' | 'mellow';
export type PartId = 'kick' | 'clap' | 'hat' | 'shaker' | 'rim' | 'tom' | 'bass' | 'chord' | 'pad' | 'arp' | 'lead' | 'double' | 'whistle' | 'steel' | 'sunset';
/** the Beach Run zone layers: zone 1 Boardwalk Pier, 2 Tide Pool Cove, 3 Sunset Lagoon */
export const ZONE_LAYERS: readonly PartId[] = ['whistle', 'steel', 'sunset'];
/** one note: step is in 16ths from the bar start (fractions allowed for strums), len in 16ths */
export interface NoteEv { part: PartId; step: number; midi: number; vel: number; len: number }

interface Chord { r: number; iv: number[] }
const ch = (r: number, ...iv: number[]): Chord => ({ r, iv });
/** [bar, step, midi, len?] */
type Phrase = [number, number, number, number?][];
/** [step, semitones above root or 'A' (approach the next root), len, vel] */
type BassPat = [number, number | 'A', number, number][];

interface TrackDef {
  bpm: number;
  /** delay of every odd 16th, in 16ths (0 = straight) */
  swing: number;
  /** pitch classes of the key (tests check the lead stays in it) */
  scale: number[];
  progA: Chord[];
  progB: Chord[];
  leadA: Phrase;
  leadB: Phrase;
  /** new cadence bars for the A' and B' sections */
  endA2: Phrase;
  endB2: Phrase;
  bass: BassPat;
  /** 16-step drum lanes: X accent, x normal, o ghost, . rest */
  drums: Partial<Record<PartId, string>>;
  /** extra drums in the A'/B' sections */
  drums2?: Partial<Record<PartId, string>>;
  /** fill on the last bar of every 8 */
  fill: Partial<Record<PartId, string>>;
  chords: 'strum' | 'skank' | 'comp' | 'none';
  pad: boolean;
  arp: boolean;
  /** lead doubled an octave down by another voice in the B sections */
  double?: boolean;
  layers: boolean;
  whistleA?: Phrase;
  whistleB?: Phrase;
  inst: Partial<Record<PartId, Inst>>;
  /** part → [gain, pan, reverb send] */
  mix: Partial<Record<PartId, [number, number, number]>>;
}

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const pcs = (root: number, steps: number[]): number[] => steps.map((s) => (root + s) % 12);

const TRACKS: Record<TrackId, TrackDef> = {
  // Beach Run: sunny C major, I-V-vi-IV with a lilting swing
  beach: {
    bpm: 104,
    swing: 0.18,
    scale: pcs(0, MAJ),
    progA: [ch(48, 0, 4, 7, 9), ch(43, 0, 4, 7, 14), ch(45, 0, 3, 7, 10), ch(41, 0, 4, 7, 11), ch(48, 0, 4, 7, 9), ch(43, 0, 4, 7, 14), ch(41, 0, 4, 7, 14), ch(43, 0, 4, 7, 5)],
    progB: [ch(45, 0, 3, 7, 10), ch(41, 0, 4, 7, 11), ch(48, 0, 4, 7, 14), ch(43, 0, 4, 7, 9), ch(45, 0, 3, 7, 14), ch(41, 0, 4, 7, 9), ch(38, 0, 3, 7, 10), ch(43, 0, 4, 7, 10)],
    leadA: [
      [0, 0, 76], [0, 2, 79], [0, 4, 81], [0, 6, 79, 2], [0, 8, 76, 4], [0, 12, 74, 4],
      [1, 0, 74, 4], [1, 4, 79, 4], [1, 8, 83], [1, 10, 81], [1, 12, 79, 4],
      [2, 0, 84, 4], [2, 4, 81, 4], [2, 8, 79], [2, 10, 76, 6],
      [3, 0, 77, 4], [3, 4, 81, 4], [3, 8, 79, 8],
      [4, 0, 76], [4, 2, 79], [4, 4, 84, 4], [4, 8, 81], [4, 10, 79], [4, 12, 76, 4],
      [5, 0, 74], [5, 2, 76], [5, 4, 79, 4], [5, 8, 74, 4], [5, 12, 71, 4],
      [6, 0, 69], [6, 2, 72], [6, 4, 76, 4], [6, 8, 79, 4], [6, 12, 81, 4],
      [7, 0, 79, 4], [7, 4, 77, 4], [7, 8, 76, 4], [7, 12, 74, 4],
    ],
    leadB: [
      [0, 0, 81, 3], [0, 3, 79], [0, 4, 76, 2], [0, 6, 72], [0, 8, 74, 2], [0, 10, 76, 6],
      [1, 0, 77, 2], [1, 2, 76], [1, 4, 72], [1, 6, 69, 4], [1, 12, 72], [1, 14, 74],
      [2, 0, 76, 3], [2, 3, 79], [2, 6, 84, 4], [2, 12, 79, 2], [2, 14, 76],
      [3, 0, 74, 6], [3, 8, 71], [3, 10, 74], [3, 12, 79, 4],
      [4, 0, 81], [4, 2, 84], [4, 4, 81], [4, 6, 79], [4, 8, 76, 4], [4, 14, 79],
      [5, 0, 81, 3], [5, 3, 79], [5, 4, 77], [5, 6, 76], [5, 8, 72, 6],
      [6, 0, 74], [6, 2, 77], [6, 4, 81], [6, 6, 77], [6, 8, 74, 4], [6, 12, 72], [6, 14, 74],
      [7, 0, 71, 4], [7, 4, 74], [7, 6, 79], [7, 8, 83, 8],
    ],
    endA2: [[7, 0, 79], [7, 2, 81], [7, 4, 83], [7, 6, 86, 2], [7, 8, 83], [7, 10, 79], [7, 12, 74, 4]],
    endB2: [[7, 0, 74], [7, 2, 76], [7, 4, 77], [7, 6, 79, 2], [7, 8, 83, 4], [7, 12, 86, 4]],
    bass: [[0, 0, 3, 1], [6, 7, 2, 0.6], [8, 0, 3, 0.85], [11, 12, 1, 0.5], [12, 7, 2, 0.7], [14, 'A', 2, 0.65]],
    drums: {
      kick: 'X.....x.X.....o.',
      clap: '....x.......x...',
      shaker: 'oxoxoxoxoxoxoxox',
      hat: '..o...o...o...o.',
    },
    drums2: { hat: '..x...x...x.o.x.', kick: 'X.....x.X..o..o.' },
    fill: { tom: '........x.x.xx.x', clap: '............x.xx', kick: 'X.....x.X.......' },
    chords: 'strum',
    pad: false,
    arp: false,
    layers: true,
    whistleA: [[0, 12, 84, 4], [1, 0, 86, 6], [1, 6, 88, 6], [2, 12, 88, 4], [3, 0, 89, 6], [3, 6, 88, 4], [3, 10, 86, 6], [4, 12, 84, 4], [5, 0, 86, 6], [5, 6, 83, 10], [6, 12, 81, 4], [7, 0, 84, 8], [7, 8, 83, 4], [7, 12, 79, 4]],
    whistleB: [[0, 8, 84, 8], [1, 0, 84, 4], [1, 4, 81, 4], [2, 8, 79, 8], [3, 0, 83, 8], [4, 8, 88, 8], [5, 0, 89, 4], [5, 4, 88, 4], [6, 8, 86, 8], [7, 0, 86, 4], [7, 4, 83, 4], [7, 8, 79, 8]],
    inst: { kick: 'kick', clap: 'clap', shaker: 'shaker', hat: 'hat', tom: 'tom', bass: 'bass', chord: 'uke', lead: 'marimba', whistle: 'whistle', steel: 'steel', sunset: 'pad' },
    mix: {
      kick: [0.55, 0, 0], clap: [0.22, 0.1, 0.25], shaker: [0.12, 0.35, 0.05], hat: [0.1, -0.3, 0.05], tom: [0.35, -0.15, 0.15],
      bass: [0.5, 0, 0], chord: [0.13, -0.28, 0.2], lead: [0.3, 0.18, 0.28],
      whistle: [0.24, -0.2, 0.35], steel: [0.13, 0.3, 0.3], sunset: [0.1, 0, 0.4],
    },
  },
  // Island Hop: bouncy G major, octave bass, offbeat ukulele skank
  island: {
    bpm: 122,
    swing: 0.1,
    scale: pcs(7, MAJ),
    progA: [ch(43, 0, 4, 7), ch(48, 0, 4, 7, 14), ch(40, 0, 3, 7), ch(38, 0, 4, 7), ch(43, 0, 4, 7, 9), ch(48, 0, 4, 7), ch(40, 0, 3, 7, 10), ch(38, 0, 4, 7, 5)],
    progB: [ch(48, 0, 4, 7), ch(38, 0, 4, 7), ch(47, 0, 3, 7), ch(40, 0, 3, 7), ch(48, 0, 4, 7, 11), ch(38, 0, 4, 7), ch(45, 0, 3, 7, 10), ch(38, 0, 4, 7, 10)],
    leadA: [
      [0, 0, 79], [0, 4, 83], [0, 6, 81], [0, 8, 79], [0, 12, 74, 4],
      [1, 0, 76], [1, 4, 79], [1, 8, 84, 4], [1, 12, 83, 4],
      [2, 0, 83], [2, 2, 81], [2, 4, 79], [2, 8, 76, 4], [2, 12, 79, 4],
      [3, 0, 78], [3, 4, 81], [3, 8, 86, 4], [3, 12, 84, 4],
      [4, 0, 83], [4, 2, 84], [4, 4, 86], [4, 8, 83, 4], [4, 12, 79, 4],
      [5, 0, 84], [5, 4, 88], [5, 8, 84, 4], [5, 12, 79, 4],
      [6, 0, 83], [6, 4, 79], [6, 6, 76], [6, 8, 79], [6, 12, 83, 4],
      [7, 0, 81], [7, 4, 78], [7, 8, 74, 4], [7, 12, 79, 4],
    ],
    leadB: [
      [0, 0, 76], [0, 2, 79], [0, 4, 84, 4], [0, 8, 83], [0, 10, 81], [0, 12, 79, 4],
      [1, 0, 78, 3], [1, 3, 81], [1, 6, 86, 4], [1, 12, 84], [1, 14, 81],
      [2, 0, 83, 4], [2, 4, 81], [2, 6, 78], [2, 8, 74, 4], [2, 12, 78], [2, 14, 81],
      [3, 0, 79, 6], [3, 8, 83], [3, 10, 79], [3, 12, 76, 4],
      [4, 0, 72], [4, 2, 76], [4, 4, 79], [4, 6, 84], [4, 8, 83, 2], [4, 10, 84], [4, 12, 88, 4],
      [5, 0, 86, 4], [5, 4, 84], [5, 6, 81], [5, 8, 78, 4], [5, 12, 81], [5, 14, 83],
      [6, 0, 84, 3], [6, 3, 83], [6, 4, 81], [6, 6, 76], [6, 8, 72, 4], [6, 12, 76], [6, 14, 78],
      [7, 0, 81, 4], [7, 4, 78], [7, 6, 74], [7, 8, 78, 8],
    ],
    endA2: [[7, 0, 81], [7, 2, 83], [7, 4, 84], [7, 6, 86], [7, 8, 88, 2], [7, 10, 86], [7, 12, 83, 4]],
    endB2: [[7, 0, 74], [7, 2, 78], [7, 4, 81], [7, 6, 84], [7, 8, 86, 4], [7, 12, 83], [7, 14, 81]],
    bass: [[0, 0, 2, 1], [2, 12, 1, 0.6], [4, 0, 2, 0.8], [6, 12, 1, 0.6], [8, 0, 2, 0.9], [10, 12, 1, 0.6], [12, 7, 2, 0.75], [14, 'A', 2, 0.65]],
    drums: {
      kick: 'X.....x.X...x...',
      clap: '....X.......X...',
      hat: '..x...x...x...x.',
      shaker: 'o.o.o.o.o.o.o.o.',
    },
    drums2: { shaker: 'oxoxoxoxoxoxoxox', hat: '..x...x...x..xx.' },
    fill: { tom: '........x.x.x.xx', clap: '....X.......X.XX' },
    chords: 'skank',
    pad: false,
    arp: false,
    double: true,
    layers: false,
    inst: { kick: 'kick', clap: 'clap', hat: 'hat', shaker: 'shaker', tom: 'tom', bass: 'bass', chord: 'uke', lead: 'marimba', double: 'steel' },
    mix: {
      kick: [0.6, 0, 0], clap: [0.3, 0.1, 0.22], hat: [0.12, -0.3, 0.05], shaker: [0.1, 0.35, 0.05], tom: [0.35, -0.15, 0.15],
      bass: [0.5, 0, 0], chord: [0.12, -0.3, 0.18], lead: [0.32, 0.2, 0.25], double: [0.1, -0.25, 0.3],
    },
  },
  // Great Wave chase: driving A minor, four-on-the-floor, a rising ostinato and a steel-drum lead
  chase: {
    bpm: 140,
    swing: 0,
    scale: [9, 11, 0, 2, 4, 5, 7, 8],
    progA: [ch(45, 0, 3, 7), ch(41, 0, 4, 7), ch(48, 0, 4, 7), ch(43, 0, 4, 7), ch(45, 0, 3, 7), ch(41, 0, 4, 7), ch(43, 0, 4, 7), ch(40, 0, 4, 7)],
    progB: [ch(41, 0, 4, 7, 11), ch(43, 0, 4, 7), ch(45, 0, 3, 7), ch(45, 0, 3, 7, 10), ch(41, 0, 4, 7), ch(43, 0, 4, 7), ch(40, 0, 4, 7), ch(40, 0, 4, 7, 10)],
    leadA: [
      [0, 0, 76, 2], [0, 2, 72], [0, 4, 69], [0, 6, 72], [0, 8, 76, 2], [0, 10, 77], [0, 12, 76, 4],
      [1, 0, 77, 2], [1, 2, 72], [1, 4, 69], [1, 6, 72], [1, 8, 77, 2], [1, 10, 79], [1, 12, 77, 4],
      [2, 0, 79, 2], [2, 2, 76], [2, 4, 72], [2, 6, 76], [2, 8, 79, 2], [2, 10, 81], [2, 12, 79, 2], [2, 14, 76],
      [3, 0, 74, 4], [3, 4, 79], [3, 6, 74], [3, 8, 71, 4], [3, 12, 74, 4],
      [4, 0, 81, 2], [4, 2, 76], [4, 4, 72], [4, 6, 76], [4, 8, 81, 2], [4, 10, 83], [4, 12, 84, 4],
      [5, 0, 84, 2], [5, 2, 81], [5, 4, 77], [5, 6, 81], [5, 8, 84, 2], [5, 10, 83], [5, 12, 81, 4],
      [6, 0, 83, 2], [6, 2, 79], [6, 4, 74], [6, 6, 79], [6, 8, 83, 2], [6, 10, 84], [6, 12, 86, 4],
      [7, 0, 83, 4], [7, 4, 80], [7, 6, 76], [7, 8, 80], [7, 10, 83], [7, 12, 88, 4],
    ],
    leadB: [
      [0, 0, 81, 6], [0, 6, 79], [0, 8, 77, 4], [0, 12, 76], [0, 14, 77],
      [1, 0, 79, 6], [1, 6, 77], [1, 8, 74, 4], [1, 12, 76], [1, 14, 79],
      [2, 0, 81, 4], [2, 4, 84, 4], [2, 8, 83, 2], [2, 10, 81], [2, 12, 76, 4],
      [3, 0, 72], [3, 2, 76], [3, 4, 81], [3, 6, 76], [3, 8, 72], [3, 10, 76], [3, 12, 81], [3, 14, 84],
      [4, 0, 84, 4], [4, 4, 81], [4, 6, 77], [4, 8, 72, 4], [4, 12, 77], [4, 14, 81],
      [5, 0, 83, 4], [5, 4, 79], [5, 6, 74], [5, 8, 71, 4], [5, 12, 74], [5, 14, 79],
      [6, 0, 80, 4], [6, 4, 83], [6, 6, 88], [6, 8, 86, 2], [6, 10, 83], [6, 12, 80, 4],
      [7, 0, 76, 2], [7, 2, 80], [7, 4, 83], [7, 6, 86], [7, 8, 88, 8],
    ],
    endA2: [[7, 0, 88, 2], [7, 2, 86], [7, 4, 83], [7, 6, 80], [7, 8, 83, 2], [7, 10, 86], [7, 12, 88, 4]],
    endB2: [[7, 0, 76], [7, 2, 80], [7, 4, 83], [7, 6, 88], [7, 8, 86], [7, 10, 83], [7, 12, 80], [7, 14, 76]],
    bass: [[0, 0, 1, 1], [2, 0, 1, 0.7], [4, 12, 1, 0.8], [6, 0, 1, 0.7], [8, 0, 1, 0.9], [10, 0, 1, 0.7], [12, 12, 1, 0.8], [14, 7, 1, 0.7]],
    drums: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: 'oxoxoxoxoxoxoxox',
    },
    drums2: { kick: 'X...X...X...X.x.', hat: 'oxoXoxoXoxoXoxoX' },
    fill: { tom: '........x.x.xxxx', clap: '....X.......X.XX' },
    chords: 'none',
    pad: true,
    arp: true,
    layers: false,
    inst: { kick: 'kick', clap: 'clap', hat: 'hat', tom: 'tom', bass: 'bass', pad: 'pad', arp: 'uke', lead: 'steel' },
    mix: {
      kick: [0.62, 0, 0], clap: [0.3, 0.1, 0.2], hat: [0.11, 0.35, 0.04], tom: [0.4, -0.2, 0.15],
      bass: [0.52, 0, 0], pad: [0.08, 0, 0.35], arp: [0.12, -0.3, 0.15], lead: [0.24, 0.2, 0.25],
    },
  },
  // Home at night: a lazy F major with 7th chords, soft brushes and electric piano
  mellow: {
    bpm: 84,
    swing: 0.28,
    scale: pcs(5, MAJ),
    progA: [ch(41, 0, 4, 7, 11), ch(40, 0, 3, 7, 10), ch(38, 0, 3, 7, 10), ch(36, 0, 4, 7, 11), ch(46, 0, 4, 7, 11), ch(45, 0, 3, 7, 10), ch(43, 0, 3, 7, 10), ch(36, 0, 4, 7, 10)],
    progB: [ch(38, 0, 3, 7, 10), ch(45, 0, 3, 7, 10), ch(46, 0, 4, 7, 11), ch(41, 0, 4, 7, 11), ch(43, 0, 3, 7, 10), ch(45, 0, 3, 7, 10), ch(46, 0, 4, 7, 11), ch(36, 0, 5, 7, 10)],
    leadA: [
      [0, 0, 72, 4], [0, 4, 76, 2], [0, 6, 77], [0, 8, 81, 6],
      [1, 2, 79, 2], [1, 4, 76, 4], [1, 10, 74], [1, 12, 76, 4],
      [2, 0, 77, 4], [2, 4, 74], [2, 6, 72], [2, 8, 69, 8],
      [3, 4, 74], [3, 6, 72], [3, 8, 76, 4], [3, 12, 79, 4],
      [4, 0, 81, 6], [4, 6, 79], [4, 8, 77, 4], [4, 12, 74, 4],
      [5, 0, 76, 4], [5, 4, 72], [5, 6, 74], [5, 8, 76, 8],
      [6, 0, 74, 4], [6, 4, 70], [6, 6, 74], [6, 8, 77, 4], [6, 12, 79, 4],
      [7, 0, 76, 8], [7, 8, 72], [7, 10, 74], [7, 12, 76, 4],
    ],
    leadB: [
      [0, 0, 81, 4], [0, 4, 77], [0, 6, 76], [0, 8, 74, 8],
      [1, 0, 72, 4], [1, 4, 76], [1, 6, 79], [1, 8, 84, 6], [1, 14, 81],
      [2, 0, 81, 4], [2, 4, 77], [2, 6, 74], [2, 8, 70, 8],
      [3, 0, 72, 4], [3, 4, 77], [3, 6, 81], [3, 8, 84, 8],
      [4, 0, 82, 4], [4, 4, 79], [4, 6, 77], [4, 8, 74, 8],
      [5, 0, 76, 4], [5, 4, 79], [5, 6, 81], [5, 8, 84, 4], [5, 12, 81, 4],
      [6, 0, 79, 4], [6, 4, 77], [6, 6, 74], [6, 8, 77, 4], [6, 12, 81, 4],
      [7, 0, 79, 8], [7, 8, 77], [7, 10, 76], [7, 12, 74, 4],
    ],
    endA2: [[7, 0, 76, 4], [7, 4, 79], [7, 6, 82], [7, 8, 81, 4], [7, 12, 79, 4]],
    endB2: [[7, 0, 77, 4], [7, 4, 74], [7, 6, 72], [7, 8, 70, 4], [7, 12, 72, 4]],
    bass: [[0, 0, 6, 0.9], [7, 7, 1, 0.45], [8, 0, 4, 0.7], [14, 'A', 2, 0.5]],
    drums: {
      kick: 'x.........o.....',
      rim: '....x.......x...',
      shaker: 'o.x.o.x.o.x.o.x.',
    },
    drums2: { shaker: 'oxxooxxooxxooxxo' },
    fill: { rim: '....x.......x.oo' },
    chords: 'comp',
    pad: true,
    arp: false,
    layers: false,
    inst: { kick: 'kickSoft', rim: 'rim', shaker: 'shaker', bass: 'bass', chord: 'epiano', pad: 'pad', lead: 'marimba' },
    mix: {
      kick: [0.45, 0, 0], rim: [0.14, 0.15, 0.3], shaker: [0.08, 0.3, 0.1],
      bass: [0.45, 0, 0], chord: [0.1, -0.25, 0.35], pad: [0.07, 0, 0.45], lead: [0.22, 0.2, 0.4],
    },
  },
};

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];
export const trackBpm = (id: TrackId): number => TRACKS[id].bpm;
export const trackSwing = (id: TrackId): number => TRACKS[id].swing;
export const trackScale = (id: TrackId): readonly number[] => TRACKS[id].scale;
export const trackParts = (id: TrackId): PartId[] => Object.keys(TRACKS[id].mix) as PartId[];
export const partInst = (id: TrackId, p: PartId): Inst | undefined => TRACKS[id].inst[p];
export const partMix = (id: TrackId, p: PartId): [number, number, number] => TRACKS[id].mix[p] ?? [0.2, 0, 0.1];
/** bars in one pass of the form (A B A' B') */
export const FORM_BARS = 32;

/** Voice-lead a progression: each chord takes the inversion nearest the previous one, inside [lo, hi]. */
export function voiceLead(prog: Chord[], lo = 55, hi = 76, start?: number[]): number[][] {
  const out: number[][] = [];
  let prev = start;
  for (const c of prog) {
    const tones = [...new Set(c.iv.map((i) => (c.r + i) % 12))].sort((x, y) => x - y);
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (let inv = 0; inv < tones.length; inv++) {
      for (let base = lo; base < lo + 12; base++) {
        if (base % 12 !== tones[inv]) continue;
        const v = [base];
        for (let k = 1; k < tones.length; k++) {
          let n = (v[k - 1] as number) + 1;
          while (n % 12 !== tones[(inv + k) % tones.length]) n++;
          v.push(n);
        }
        if ((v[v.length - 1] as number) > hi) continue;
        let cost = 0;
        if (prev) {
          for (const n of v) cost += Math.min(...prev.map((p) => Math.abs(p - n)));
          for (const p of prev) cost += Math.min(...v.map((n) => Math.abs(p - n)));
        } else cost = Math.abs(v.reduce((a, b) => a + b, 0) / v.length - (lo + hi) / 2);
        if (cost < bestCost) {
          bestCost = cost;
          best = v;
        }
      }
    }
    const v = best ?? tones.map((t) => lo + ((t - lo + 1200) % 12));
    out.push(v);
    prev = v;
  }
  return out;
}

/** the next scale note above m */
function stepUp(m: number, scale: number[]): number {
  for (let k = 1; k <= 2; k++) if (scale.includes((m + k) % 12)) return m + k;
  return m + 2;
}

/** Variation for the A'/B' sections: grace notes in the odd bars, and a new cadence bar. */
function vary(p: Phrase, ending: Phrase, scale: number[]): Phrase {
  const out: Phrase = p.filter((n) => n[0] !== 7).map((n) => [...n] as [number, number, number, number?]);
  for (const bar of [1, 3, 5]) {
    const notes = out.filter((n) => n[0] === bar).sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < notes.length; i++) {
      const n = notes[i] as [number, number, number, number?];
      const prevEnd = (notes[i - 1] as [number, number, number, number?])[1] + ((notes[i - 1] as [number, number, number, number?])[3] ?? 2);
      if (n[1] - prevEnd >= 1 && n[1] >= 2) {
        out.push([bar, n[1] - 1, stepUp(n[2], scale), 1]);
        break;
      }
    }
  }
  for (const e of ending) out.push([...e] as [number, number, number, number?]);
  return out;
}

interface Built {
  voic: [number[][], number[][]];
  lead: Phrase[];
  bars: Map<number, NoteEv[]>;
}
const built = new Map<TrackId, Built>();
function build(id: TrackId): Built {
  let b = built.get(id);
  if (b) return b;
  const d = TRACKS[id];
  // voice-lead A into B and B back into A, so the form wraps smoothly
  let va = voiceLead(d.progA);
  let vb = voiceLead(d.progB, 55, 76, va[va.length - 1]);
  for (let pass = 0; pass < 3; pass++) {
    va = voiceLead(d.progA, 55, 76, vb[vb.length - 1]);
    vb = voiceLead(d.progB, 55, 76, va[va.length - 1]);
  }
  b = {
    voic: [va, vb],
    lead: [d.leadA, d.leadB, vary(d.leadA, d.endA2, d.scale), vary(d.leadB, d.endB2, d.scale)],
    bars: new Map(),
  };
  built.set(id, b);
  return b;
}

/** a small deterministic velocity wobble so repeats don't sound machine-stamped */
const human = (bar: number, step: number, k: number): number => {
  const h = Math.sin(bar * 12.9898 + step * 78.233 + k * 37.719) * 43758.5453;
  return 0.94 + (h - Math.floor(h)) * 0.12;
};
const VEL: Record<string, number> = { X: 1, x: 0.72, o: 0.38 };

/**
 * Every note in one bar of a track (pure, cached per bar of the 32-bar form).
 * Sections: A (bars 0-7), B (8-15), A' (16-23), B' (24-31); the lead varies every 8 bars.
 */
export function barEvents(id: TrackId, bar: number): readonly NoteEv[] {
  const fb = ((bar % FORM_BARS) + FORM_BARS) % FORM_BARS;
  const bt = build(id);
  const cached = bt.bars.get(fb);
  if (cached) return cached;
  const d = TRACKS[id];
  const sec = Math.floor(fb / 8);
  const b = fb % 8;
  const isB = sec % 2 === 1;
  const prog = isB ? d.progB : d.progA;
  const voic = bt.voic[isB ? 1 : 0][b] as number[];
  const chord = prog[b] as Chord;
  const nextChord = b < 7 ? (prog[b + 1] as Chord) : ((isB ? d.progA : d.progB)[0] as Chord);
  const ev: NoteEv[] = [];
  const add = (part: PartId, step: number, midi: number, vel: number, len = 1): void => {
    ev.push({ part, step, midi, vel: Math.min(1, vel * human(fb, step, midi)), len });
  };

  // drums
  const lanes: Partial<Record<PartId, string>> = { ...d.drums, ...(sec >= 2 ? d.drums2 : {}) };
  if (b === 7) for (const [k, v] of Object.entries(d.fill)) lanes[k as PartId] = (lanes[k as PartId] ?? '................').slice(0, 8) + v.slice(8);
  for (const [part, pat] of Object.entries(lanes) as [PartId, string][]) {
    for (let s = 0; s < 16; s++) {
      const v = VEL[pat[s] as string];
      if (!v) continue;
      add(part, s, part === 'tom' ? 45 + (s >= 12 ? -(s - 11) * 2 : 3) : 60, v);
    }
  }

  // bass
  for (const [s, iv, len, vel] of d.bass) {
    let m = chord.r + (iv === 'A' ? 0 : iv);
    if (iv === 'A') {
      const target = nextChord.r;
      const below = target - 1;
      const above = target + 2;
      m = d.scale.includes(((below % 12) + 12) % 12) && Math.abs(below - chord.r) <= 7 ? below : Math.abs(above - chord.r) <= 7 ? above : target - 2;
    }
    add('bass', s, m, vel, len);
  }

  // chords
  if (d.chords === 'strum') {
    // ukulele: D . D U . U D U in 8ths
    const strum = [1, 0, 1, -1, 0, -1, 1, -1];
    strum.forEach((dir, i) => {
      if (!dir) return;
      const notes = dir > 0 ? voic : [...voic].reverse();
      notes.forEach((m, k) => add('chord', i * 2 + k * 0.08, m, dir > 0 ? 1 : 0.62));
    });
  } else if (d.chords === 'skank') {
    for (const s of [2, 6, 10, 14]) voic.forEach((m, k) => add('chord', s + k * 0.04, m, s === 6 || s === 14 ? 0.85 : 1));
  } else if (d.chords === 'comp') {
    voic.forEach((m, k) => add('chord', k * 0.06, m, 0.9, 7));
    voic.forEach((m, k) => add('chord', 10 + k * 0.05, m, 0.6, 5));
  }
  if (d.pad) voic.forEach((m) => add('pad', 0, m - 12 >= 50 ? m - 12 : m, 0.85, 16));

  // arpeggio ostinato (chase): root, fifth, octave climbing in the second half of the form
  if (d.arp) {
    const pat = [0, 7, 12, 7, 0, 7, 12, 15];
    const third = chord.iv.includes(3) ? 3 : 4;
    pat.forEach((iv, e) => add('arp', e * 2, chord.r + 24 + (iv === 15 ? 12 + third : iv) + (sec >= 2 ? 12 : 0), e === 0 ? 1 : 0.75));
  }

  // lead (and the B-section double an octave down)
  for (const [nb, s, m, len] of bt.lead[sec] as Phrase) {
    if (nb !== b) continue;
    add('lead', s, m, s % 4 === 0 ? 1 : 0.8, len ?? 2);
    if (d.double && isB) add('double', s, m - 12, 0.8, len ?? 2);
  }

  // Beach Run zone layers
  if (d.layers) {
    for (const [nb, s, m, len] of (isB ? d.whistleB : d.whistleA) ?? []) if (nb === b) add('whistle', s, m, 0.9, len ?? 4);
    const order = [0, 1, 2, 3, 2, 1, 2, 3];
    for (let k = 0; k < 16; k++) {
      if (k % 8 === 7) continue;
      const v = voic[(order[k % 8] as number) % voic.length] as number;
      add('steel', k, v + 12, k % 4 === 0 ? 1 : 0.62);
    }
    voic.forEach((m) => add('sunset', 0, m, 0.85, 16));
  }
  ev.sort((a, c) => a.step - c.step);
  bt.bars.set(fb, ev);
  return ev;
}

/** Event time in seconds from the bar start, with swing on the odd 16ths. */
export function stepTime(id: TrackId, step: number): number {
  const d = TRACKS[id];
  const s16 = 60 / d.bpm / 4;
  const whole = Math.floor(step);
  return (step + (whole % 2 === 1 ? d.swing : 0)) * s16;
}
export const barSeconds = (id: TrackId): number => (60 / TRACKS[id].bpm) * 4;

// ------------------------------------------------------------------------------------- facade

/** how far ahead notes are scheduled, and how often the scheduler wakes */
const LOOKAHEAD = 0.2;
const TICK_MS = 25;
/** at most this many one-shot SFX voices at once (mobile) */
const MAX_SFX_VOICES = 24;
/** reverb send per sound (default 0.12) */
const SEND: Partial<Record<Sfx, number>> = {
  tap: 0.04, tick: 0.02, pop: 0.06, deny: 0.03, land: 0.05, slam: 0.08, bump: 0.05, lane: 0.08, crash: 0.12,
  shell: 0.22, bigShell: 0.3, pearl: 0.32, dollar: 0.3, ring: 0.28, giftCollect: 0.3, levelUp: 0.25, win: 0.22, gull: 0.35,
};
/** gain per sound at play time */
const LEVEL: Partial<Record<Sfx, number>> = { shell: 0.7, lane: 0.85, tick: 0.8 };
/** these never get dropped by the voice cap */
const IMPORTANT = new Set<Sfx>(['crash', 'revive', 'newBest', 'win', 'go', 'countdown', 'tap', 'deny']);
/** built inside the unlock gesture (cheap, and heard first) */
const UI_FIRST: Sfx[] = ['tap', 'tick', 'pop', 'confirm', 'deny', 'whoosh'];
/** music ducks under these: [depth, hold seconds] */
const DUCK: Partial<Record<Sfx, [number, number]>> = { crash: [0.4, 0.7], newBest: [0.6, 0.9], win: [0.55, 1.2], levelUp: [0.65, 0.8], trophy: [0.6, 1], revive: [0.6, 0.7] };

type Voice = { src: AudioBufferSourceNode; nodes: AudioNode[] };
type Bank = { roots: readonly number[]; bufs: (AudioBuffer | null)[] };
interface PartNodes { g: GainNode; pan: StereoPannerNode | null; send: GainNode | null }
interface Player {
  track: TrackId;
  out: GainNode;
  parts: Map<PartId, PartNodes>;
  bar: number;
  barStart: number;
  events: readonly NoteEv[];
  idx: number;
  /** no notes scheduled after this time (fading out) */
  stopAt: number;
  /** nodes torn down after this time */
  disposeAt: number;
}
interface WaveVoice { g: GainNode; lp: BiquadFilterNode; next: number }

export class Audio {
  unlocked = false;
  musicVolume = 0.5;
  sfxVolume = 0.8;
  /** beach ambience on/off (a settings toggle can drive it; its level follows the SFX volume) */
  ambience = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private sfxVerb: GainNode | null = null;
  private musicVerb: GainNode | null = null;
  private track: TrackId = 'beach';
  private zone = 0;
  private rumbleGain: GainNode | null = null;
  private buffers = new Map<Sfx, AudioBuffer>();
  private shellBufs: AudioBuffer[] = [];
  private banks = new Map<Inst, Bank>();
  private buildQueue: (() => void)[] = [];
  private noiseLoop: AudioBuffer | null = null;
  private players: Player[] = [];
  private waves: WaveVoice[] = [];
  private nextGull = 0;
  private mode: 'menu' | 'run' | 'off' = 'menu';
  private lastPlay = new Map<Sfx, number>();
  private autoStreak = 0;
  private lastShell = -1;
  private voices = 0;
  private wantSuspended = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

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
      // master → glue compressor → brick-wall limiter → speakers
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -18;
      glue.knee.value = 10;
      glue.ratio.value = 3;
      glue.attack.value = 0.01;
      glue.release.value = 0.25;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(glue);
      glue.connect(limiter);
      limiter.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      // music path: bus (menu/run level) → low-pass (muffled in menus) → duck → volume → master
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 1800;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicDuck = ctx.createGain();
      this.musicOut = ctx.createGain();
      this.musicBus.connect(this.musicFilter);
      this.musicFilter.connect(this.musicDuck);
      this.musicDuck.connect(this.musicOut);
      this.musicOut.connect(this.master);
      // one shared reverb: sfx and music sends each scale with their own volume
      this.reverbIn = ctx.createGain();
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(ctx);
      const verbOut = ctx.createGain();
      verbOut.gain.value = 0.8;
      this.reverbIn.connect(verb);
      verb.connect(verbOut);
      verbOut.connect(this.master);
      this.sfxVerb = ctx.createGain();
      this.sfxVerb.connect(this.reverbIn);
      this.musicVerb = ctx.createGain();
      this.musicVerb.gain.value = 0;
      this.musicVerb.connect(this.reverbIn);
      this.ambBus = ctx.createGain();
      this.ambBus.gain.value = 0;
      this.ambBus.connect(this.master);
      // a silent buffer kicks iOS into playing
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.onended = () => s.disconnect();
      s.start(0);
      void ctx.resume();
      this.unlocked = true;
      this.applyVolumes();
      this.buildSfx();
      this.queueBanks();
      this.startPlayer(this.track, 0.15);
      this.setMusicMode(this.mode);
      this.startAmbience();
      this.tick();
    } catch {
      this.ctx = null;
      this.unlocked = false;
    }
  }

  /** a short, soft room: stereo decaying noise, darker as it fades */
  private impulse(ctx: BaseAudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 0.9);
    const b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const r = noiseGen(301 + c);
      let lp = 0;
      let env = 1;
      let bright = 1;
      const de = Math.exp(-5.5 / sr);
      const db = Math.exp(-4 / sr);
      const pre = Math.floor(sr * 0.008);
      for (let i = 0; i < n; i++) {
        lp += (r() - lp) * (0.15 + 0.8 * bright);
        d[i] = i < pre ? 0 : lp * env;
        env *= de;
        bright *= db;
      }
    }
    return b;
  }

  private toBuffer(x: Float32Array, sr: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const b = ctx.createBuffer(1, x.length, sr);
    b.getChannelData(0).set(x);
    return b;
  }

  /** SFX render at up to 32 kHz: plenty for these sounds and a third cheaper to build. */
  private get sfxRate(): number {
    return Math.min((this.ctx as AudioContext).sampleRate, 32000);
  }

  /** Build one effect now (on demand, or from the idle queue). */
  private sfxBuffer(k: Sfx): AudioBuffer | undefined {
    let b = this.buffers.get(k);
    if (b || !this.ctx) return b;
    try {
      b = this.toBuffer(SFX[k](this.sfxRate), this.sfxRate);
      this.buffers.set(k, b);
    } catch {
      /* skip a broken sound rather than the whole set */
    }
    return b;
  }

  private shellBuffer(step: number): AudioBuffer | undefined {
    let b = this.shellBufs[step];
    if (!b && this.ctx) {
      // the streak chimes are rendered at their true pitches (no playback-rate smear)
      b = this.toBuffer(synthShell(step, this.sfxRate), this.sfxRate);
      this.shellBufs[step] = b;
    }
    return b;
  }

  /** The UI sounds are built inside the unlock gesture; the rest follow on idle timers. */
  private buildSfx(): void {
    for (const k of UI_FIRST) this.sfxBuffer(k);
    const run: Sfx[] = ['lane', 'hop', 'land', 'slam', 'bump', 'crash', 'bigShell', 'powerup', 'magnet', 'shield', 'rider', 'shieldPop', 'countdown', 'go', 'revive'];
    this.buildQueue.push(() => {
      for (let i = 0; i < 4; i++) this.shellBuffer(i);
    });
    for (const k of run) this.buildQueue.push(() => void this.sfxBuffer(k));
    this.buildQueue.push(() => {
      for (let i = 4; i < PENTA.length; i++) this.shellBuffer(i);
    });
    for (const k of Object.keys(SFX) as Sfx[]) if (!UI_FIRST.includes(k) && !run.includes(k)) this.buildQueue.push(() => void this.sfxBuffer(k));
  }

  /** Instrument samples are rendered a few at a time on idle timers, needed-first. */
  private queueBanks(): void {
    const first = new Set<Inst>(['kick', 'kickSoft', 'clap', 'hat', 'shaker', 'rim', 'tom', 'bass']);
    for (const p of trackParts(this.track)) {
      const i = partInst(this.track, p);
      if (i) first.add(i);
    }
    const order = [...first, ...INSTRUMENTS.filter((i) => !first.has(i))];
    const jobs: (() => void)[] = [];
    for (const inst of order) {
      const def = INST[inst];
      const bank: Bank = { roots: def.roots, bufs: def.roots.map(() => null) };
      this.banks.set(inst, bank);
      def.roots.forEach((root, k) => {
        jobs.push(() => {
          bank.bufs[k] = this.toBuffer(synthInstrument(inst, root), def.sr);
        });
      });
    }
    // run sounds and the beat first, then this track's instruments, then the other effects and banks
    const sfxJobs = this.buildQueue.splice(0);
    const beat = jobs.splice(0, 7);
    const bass = jobs.splice(0, 4);
    const track = jobs.splice(0, 14);
    this.buildQueue.push(...bass, ...sfxJobs.slice(0, 17), ...track, ...sfxJobs.slice(17), ...jobs);
    const step = (): void => {
      const job = this.buildQueue.shift();
      if (!job || !this.ctx) return;
      try {
        job();
      } catch {
        /* a missing sample just stays silent */
      }
      if (this.buildQueue.length) setTimeout(step, 12);
    };
    // the drums come up at once (a few ms) so the beat starts with the music
    for (const job of beat) {
      try {
        job();
      } catch {
        /* skip */
      }
    }
    setTimeout(step, 12);
  }

  // ------------------------------------------------------------------- scheduler

  private tick = (): void => {
    this.timer = null;
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.schedule(ctx.currentTime);
    } catch {
      /* keep the clock running */
    }
    this.timer = setTimeout(this.tick, TICK_MS);
  };

  private schedule(now: number): void {
    const horizon = now + LOOKAHEAD;
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i] as Player;
      if (now > p.disposeAt) {
        this.disposePlayer(p);
        this.players.splice(i, 1);
        continue;
      }
      this.schedulePlayer(p, now, horizon);
    }
    this.scheduleAmbience(now, horizon);
  }

  private schedulePlayer(p: Player, now: number, horizon: number): void {
    const bar = barSeconds(p.track);
    const silent = this.mode === 'off' || this.musicVolume <= 0;
    // far behind (throttled timers): jump to the current bar instead of walking every missed note
    if (p.barStart + 2 * bar < now) {
      const skip = Math.floor((now - p.barStart) / bar) - 1;
      p.bar += skip;
      p.barStart += skip * bar;
      p.events = barEvents(p.track, p.bar);
      p.idx = p.events.length;
    }
    for (let guard = 0; guard < 512; guard++) {
      if (p.idx >= p.events.length) {
        const next = p.barStart + bar;
        if (next > horizon || next >= p.stopAt) return;
        p.bar++;
        p.barStart = next;
        p.events = barEvents(p.track, p.bar);
        p.idx = 0;
        continue;
      }
      const e = p.events[p.idx] as NoteEv;
      const t = p.barStart + stepTime(p.track, e.step);
      if (t > horizon) return;
      p.idx++;
      if (t >= p.stopAt) return;
      // fell behind (throttled timer): skip rather than burst
      if (silent || t < now - 0.02) continue;
      const part = p.parts.get(e.part);
      if (!part || !this.partAudible(p, e.part)) continue;
      this.note(p.track, e, Math.max(t, now), part.g);
    }
  }

  /** zone layers that are off (and faded) aren't scheduled at all */
  private layerOffAt = new Map<PartId, number>();
  private partAudible(p: Player, part: PartId): boolean {
    if (p.track !== 'beach' || !ZONE_LAYERS.includes(part)) return true;
    if (this.layerWanted(part)) return true;
    const off = this.layerOffAt.get(part) ?? -1;
    return (this.ctx as AudioContext).currentTime < off;
  }
  private layerWanted(part: PartId): boolean {
    return (part === 'whistle' && this.zone === 1) || (part === 'steel' && this.zone === 2) || (part === 'sunset' && this.zone === 3);
  }

  private note(track: TrackId, e: NoteEv, t: number, dest: AudioNode): void {
    const ctx = this.ctx as AudioContext;
    const inst = partInst(track, e.part);
    if (!inst) return;
    const bank = this.banks.get(inst);
    if (!bank) return;
    let k = 0;
    for (let i = 1; i < bank.roots.length; i++) if (Math.abs((bank.roots[i] as number) - e.midi) < Math.abs((bank.roots[k] as number) - e.midi)) k = i;
    const b = bank.bufs[k];
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const rate = Math.pow(2, (e.midi - (bank.roots[k] as number)) / 12);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    if (INST[inst].sustain) {
      const dur = (e.len * 60) / trackBpm(track) / 4;
      const rel = inst === 'pad' ? 0.6 : inst === 'bass' ? 0.06 : 0.12;
      const atk = Math.min(inst === 'pad' ? 0.25 : 0.008, dur * 0.5);
      const end = Math.max(t + atk + 0.002, Math.min(t + dur, t + b.duration / rate - rel));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(e.vel, t + atk);
      g.gain.setValueAtTime(e.vel, end);
      g.gain.linearRampToValueAtTime(0, end + rel);
      src.stop(end + rel + 0.02);
    } else g.gain.value = e.vel;
    src.connect(g);
    g.connect(dest);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start(t);
  }

  private startPlayer(track: TrackId, delay: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.musicVerb) return;
    const now = ctx.currentTime;
    // the old track fades out and stops scheduling
    for (const p of this.players) {
      if (p.stopAt === Infinity) {
        p.out.gain.cancelScheduledValues(now);
        p.out.gain.setTargetAtTime(0, now, 0.25);
        p.stopAt = now + 1.2;
        p.disposeAt = now + 4;
      }
    }
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + delay + 0.05);
    out.connect(this.musicBus);
    const parts = new Map<PartId, PartNodes>();
    for (const part of trackParts(track)) {
      const [gain, pan, send] = partMix(track, part);
      const g = ctx.createGain();
      g.gain.value = track === 'beach' && ZONE_LAYERS.includes(part) ? (this.layerWanted(part) ? gain : 0) : gain;
      let p: StereoPannerNode | null = null;
      if (pan !== 0 && ctx.createStereoPanner) {
        p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(out);
      } else g.connect(out);
      let s: GainNode | null = null;
      if (send > 0) {
        s = ctx.createGain();
        s.gain.value = send;
        (p ?? g).connect(s);
        s.connect(this.musicVerb);
      }
      parts.set(part, { g, pan: p, send: s });
    }
    const start = now + delay;
    this.players.push({ track, out, parts, bar: -1, barStart: start - barSeconds(track), events: [], idx: 0, stopAt: Infinity, disposeAt: Infinity });
    this.applyZoneMix(0.05);
  }

  private disposePlayer(p: Player): void {
    for (const n of p.parts.values()) {
      n.g.disconnect();
      n.pan?.disconnect();
      n.send?.disconnect();
    }
    p.out.disconnect();
  }

  /** Zone layers crossfade on the beach track (UPDATE2_PLAN.md §7). */
  private applyZoneMix(tc: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const p of this.players) {
      if (p.track !== 'beach' || p.stopAt !== Infinity) continue;
      for (const part of ZONE_LAYERS) {
        const n = p.parts.get(part);
        if (!n) continue;
        const want = this.layerWanted(part);
        n.g.gain.cancelScheduledValues(now);
        n.g.gain.setTargetAtTime(want ? partMix('beach', part)[0] : 0, now, tc);
        if (!want) this.layerOffAt.set(part, Math.max(this.layerOffAt.get(part) ?? 0, now + tc * 5));
      }
      // the lead steps back a little under the Sunset Lagoon pad
      const lead = p.parts.get('lead');
      if (lead) {
        lead.g.gain.cancelScheduledValues(now);
        lead.g.gain.setTargetAtTime(partMix('beach', 'lead')[0] * (this.zone === 3 ? 0.75 : 1), now, tc);
      }
    }
  }

  // ------------------------------------------------------------------- ambience

  private ensureNoise(): AudioBuffer | null {
    if (this.noiseLoop || !this.ctx) return this.noiseLoop;
    // 4 s of soft pink-ish noise with a crossfaded seam; shared by the waves and the wave rumble
    const sr = 22050;
    const fade = 2048;
    const n = sr * 4 + fade;
    const x = new Float32Array(n);
    const r = noiseGen(41);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = r();
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      x[i] = b0 + b1 + b2 + w * 0.04;
    }
    const m = n - fade;
    for (let i = 0; i < fade; i++) x[i] = x[i] * (i / fade) + x[m + i] * (1 - i / fade);
    this.noiseLoop = this.toBuffer(finish(x.subarray(0, m).slice(), sr, 0.8), sr);
    return this.noiseLoop;
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    const nb = this.ensureNoise();
    if (!ctx || !nb || !this.ambBus) return;
    const now = ctx.currentTime;
    [-0.45, 0.45].forEach((pan, i) => {
      const src = ctx.createBufferSource();
      src.buffer = nb;
      src.loop = true;
      src.playbackRate.value = i ? 1.03 : 0.97;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.3;
      lp.frequency.value = 450;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      src.connect(lp);
      lp.connect(g);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(this.ambBus as GainNode);
      } else g.connect(this.ambBus as GainNode);
      src.start(now, i * 1.7);
      this.waves.push({ g, lp, next: now + 0.5 + i * 3.4 });
    });
    this.nextGull = now + 8 + Math.random() * 10;
  }

  private scheduleAmbience(now: number, horizon: number): void {
    if (!this.ambBus || !this.ambience || this.sfxVolume <= 0) return;
    for (const w of this.waves) {
      if (w.next > horizon) continue;
      // one wave: the wash swells and brightens, then draws back over the sand
      const t = Math.max(w.next, now);
      const rise = 1.8 + Math.random() * 1.2;
      const fall = 3 + Math.random() * 2;
      const peak = 0.55 + Math.random() * 0.4;
      w.g.gain.setTargetAtTime(peak, t, rise / 3);
      w.g.gain.setTargetAtTime(0.1, t + rise, fall / 3);
      w.lp.frequency.setTargetAtTime(1100 + Math.random() * 600, t, rise / 3);
      w.lp.frequency.setTargetAtTime(380, t + rise, fall / 2.5);
      w.next = t + rise + fall * 0.8 + Math.random() * 2.5;
    }
    if (now >= this.nextGull) {
      this.nextGull = now + 14 + Math.random() * 22;
      if (this.track !== 'chase') {
        const calls = Math.random() < 0.4 ? 2 : 1;
        const pan = (Math.random() * 2 - 1) * 0.7;
        const rate = 0.9 + Math.random() * 0.25;
        for (let c = 0; c < calls; c++) this.oneShot('gull', now + 0.05 + c * 0.32, { pan, rate: rate * (1 - c * 0.04), gain: 0.22, lowpass: 2600, bus: this.ambBus, send: 0.5 });
      }
    }
  }

  private ambLevel(): number {
    if (!this.ambience || this.mode === 'off') return 0;
    const base = this.track === 'chase' ? 0.45 : 1;
    return base * (this.mode === 'menu' ? 0.8 : 1);
  }

  /** Beach ambience on or off (follows the SFX volume). */
  setAmbience(on: boolean): void {
    this.ambience = on;
    this.applyVolumes();
  }

  // ------------------------------------------------------------------- public API

  /** Which music plays: Beach Run (with zone layers), Island Hop, the Great Wave chase, or the mellow
   * night mix (Home after dark). A new track starts from its top and the old one fades out. */
  setTrack(track: TrackId): void {
    if (track === this.track) return;
    this.track = track;
    if (this.ctx) {
      this.startPlayer(track, 0.08);
      this.applyVolumes();
    }
  }

  setZone(z: number): void {
    if (z === this.zone) return;
    this.zone = z;
    this.applyZoneMix(1.2);
  }

  /** Great Wave rumble: 0 (far/off) .. 1 (right behind) */
  setRumble(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    if (!this.rumbleGain) {
      if (level <= 0) return;
      const nb = this.ensureNoise();
      if (!nb) return;
      const src = ctx.createBufferSource();
      src.buffer = nb;
      src.loop = true;
      src.playbackRate.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.Q.value = 0.9;
      this.rumbleGain = ctx.createGain();
      this.rumbleGain.gain.value = 0;
      src.connect(lp);
      lp.connect(this.rumbleGain);
      this.rumbleGain.connect(this.sfxBus);
      src.start();
    }
    this.rumbleGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.7, ctx.currentTime, 0.15);
  }

  /**
   * Play a sound effect.
   * - `streak`: shell pickups climb a pentatonic scale with the streak (resets at 1). Without it,
   *   shells picked within half a second count as a streak.
   * - `pan`: -1..1; the lane swish sweeps toward it.
   * - `intensity`: 0..1, louder and deeper landings / bumps (default 0.5 for land, 1 for slam).
   * - `kind`: with 'powerup', the power-up kind ('magnet' | 'shield' | 'rider') picks its own sound.
   * - `pitch`: semitones; `muffle`: behind the camera.
   */
  play(s: Sfx, opt: { streak?: number; pan?: number; pitch?: number; muffle?: boolean; intensity?: number; kind?: string } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxVolume <= 0) return;
    if (s === 'powerup' && (opt.kind === 'magnet' || opt.kind === 'shield' || opt.kind === 'rider')) s = opt.kind;
    const now = ctx.currentTime;
    // de-duplicate identical sounds fired in the same instant
    const last = this.lastPlay.get(s) ?? -1;
    if (now - last < 0.025 && s !== 'shell') return;
    this.lastPlay.set(s, now);
    if (this.voices >= MAX_SFX_VOICES && !IMPORTANT.has(s)) return;
    let buffer = s === 'shell' ? undefined : this.sfxBuffer(s);
    let rate = 1;
    let gain = LEVEL[s] ?? 1;
    if (s === 'shell') {
      let streak = opt.streak;
      if (streak === undefined) {
        this.autoStreak = now - this.lastShell < 0.5 ? this.autoStreak + 1 : 1;
        streak = this.autoStreak;
      }
      this.lastShell = now;
      buffer = this.shellBuffer(shellStep(streak));
    }
    if (s === 'land' || s === 'slam' || s === 'bump') {
      const k = Math.max(0, Math.min(1, opt.intensity ?? (s === 'slam' ? 1 : 0.5)));
      gain *= 0.5 + 0.6 * k;
      rate = 1.06 - 0.12 * k;
    }
    if (opt.pitch) rate *= Math.pow(2, opt.pitch / 12);
    // behind the camera: duller and quieter
    if (opt.muffle) gain *= 0.6;
    if (!buffer) return;
    this.oneShot(s, now, { buffer, rate, gain, pan: opt.pan, sweep: s === 'lane', lowpass: opt.muffle ? 900 : 0, send: SEND[s] ?? 0.12 });
    const duck = DUCK[s];
    if (duck) this.duck(duck[0], duck[1]);
  }

  /** one buffer voice: src → [low-pass] → gain → [pan] → bus, plus a reverb send; disconnected on end */
  private oneShot(s: Sfx, t: number, o: { buffer?: AudioBuffer; rate?: number; gain?: number; pan?: number; sweep?: boolean; lowpass?: number; send?: number; bus?: GainNode | null }): void {
    const ctx = this.ctx as AudioContext;
    const b = o.buffer ?? this.sfxBuffer(s);
    const bus = o.bus ?? this.sfxBus;
    if (!b || !bus) return;
    const v: Voice = { src: ctx.createBufferSource(), nodes: [] };
    v.src.buffer = b;
    v.src.playbackRate.value = o.rate ?? 1;
    let head: AudioNode = v.src;
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      head.connect(lp);
      v.nodes.push(lp);
      head = lp;
    }
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    head.connect(g);
    v.nodes.push(g);
    head = g;
    const pan = o.pan ?? 0;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      if (o.sweep) {
        // the swish travels with the crab: from a touch behind the move to past it
        const dur = b.duration / (o.rate ?? 1);
        p.pan.setValueAtTime(Math.max(-1, Math.min(1, -pan * 0.3)), t);
        p.pan.linearRampToValueAtTime(Math.max(-0.9, Math.min(0.9, pan * 1.6)), t + dur * 0.8);
      } else p.pan.value = Math.max(-1, Math.min(1, pan));
      head.connect(p);
      v.nodes.push(p);
      head = p;
    }
    head.connect(bus);
    const verb = bus === this.sfxBus || bus === this.ambBus ? this.sfxVerb : null;
    if (verb && (o.send ?? 0) > 0) {
      const sg = ctx.createGain();
      sg.gain.value = o.send as number;
      head.connect(sg);
      sg.connect(verb);
      v.nodes.push(sg);
    }
    this.voices++;
    v.src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      v.src.disconnect();
      for (const n of v.nodes) n.disconnect();
    };
    v.src.start(t);
  }

  /** dip the music under a big moment, then let it swell back */
  private duck(depth: number, hold: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicDuck) return;
    const t = ctx.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.03);
    g.setTargetAtTime(1, t + hold, 0.35);
  }

  setMusicMode(m: 'menu' | 'run' | 'off'): void {
    this.mode = m;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.musicFilter) return;
    const t = ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(this.modeLevel(), t, 0.25);
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(m === 'run' ? 16000 : 1800, t, 0.3);
    this.applyVolumes();
  }

  private modeLevel(): number {
    return this.mode === 'off' ? 0 : this.mode === 'menu' ? 0.7 : 1;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (n: GainNode | null, v: number, tc = 0.03): void => {
      if (!n) return;
      n.gain.cancelScheduledValues(t);
      n.gain.setTargetAtTime(v, t, tc);
    };
    set(this.sfxBus, this.sfxVolume);
    set(this.sfxVerb, this.sfxVolume);
    set(this.musicOut, this.musicVolume * 0.55);
    // the music reverb follows the volume and the menu level (it joins after the music filter)
    set(this.musicVerb, this.musicVolume * 0.55 * this.modeLevel() * (this.mode === 'run' ? 1 : 0.5), 0.25);
    set(this.ambBus, this.sfxVolume * 0.18 * this.ambLevel(), 0.6);
  }

  suspend(): void {
    this.wantSuspended = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    this.wantSuspended = false;
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Stop the scheduler and close the context (tests, teardown). */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const p of this.players) this.disposePlayer(p);
    this.players = [];
    void this.ctx?.close();
    this.ctx = null;
    this.unlocked = false;
  }

  /** live one-shot voices and music players (tests) */
  get stats(): { voices: number; players: number; banksReady: number } {
    let ready = 0;
    for (const b of this.banks.values()) for (const x of b.bufs) if (x) ready++;
    return { voices: this.voices, players: this.players.length, banksReady: ready };
  }
}
