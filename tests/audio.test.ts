import { describe, expect, it } from 'vitest';
import {
  FORM_BARS, INSTRUMENTS, PENTA, SFX, TRACK_IDS, ZONE_LAYERS, barEvents, barSeconds, instRate, instRoots, partInst, shellStep,
  stepTime, synthInstrument, synthSfx, synthShell, trackScale, trackSwing, voiceLead, type Sfx,
} from '../src/core/audio';

function peakOf(x: Float32Array): number {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}

describe('synthesised sound effects', () => {
  for (const name of Object.keys(SFX) as Sfx[]) {
    it(`${name} renders finite, audible, non-clipping, click-free samples`, () => {
      const x = synthSfx(name, 44100);
      expect(x.length).toBeGreaterThan(441);
      expect(x.length).toBeLessThan(44100 * 1.5);
      expect(x.every((v) => Number.isFinite(v))).toBe(true);
      const peak = peakOf(x);
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThanOrEqual(1);
      // starts and ends at silence (declicked)
      expect(Math.abs(x[0] as number)).toBeLessThan(0.01);
      expect(Math.abs(x[x.length - 1] as number)).toBeLessThan(0.01);
    });
  }

  it('the whole set synthesises quickly (it runs inside the unlock gesture)', () => {
    const t0 = performance.now();
    for (const name of Object.keys(SFX) as Sfx[]) synthSfx(name, 48000);
    for (let i = 0; i < PENTA.length; i++) synthShell(i, 48000);
    const ms = performance.now() - t0;
    if (process.env.AUDIO_TIME) process.stdout.write(`sfx synth: ${ms.toFixed(0)} ms\n`);
    expect(ms).toBeLessThan(4000);
  });

  it('the new effects are all distinct sounds', () => {
    const names: Sfx[] = ['powerup', 'magnet', 'shield', 'rider', 'fever', 'revive', 'dash'];
    const sigs = names.map((n) => {
      const x = synthSfx(n, 22050);
      return `${x.length}:${peakOf(x.subarray(0, 2000)).toFixed(3)}`;
    });
    expect(new Set(sigs).size).toBe(names.length);
  });

  it('the crash has debris after the impact', () => {
    const x = synthSfx('crash', 22050);
    const win = (a: number, b: number): number => peakOf(x.subarray(Math.floor(a * 22050), Math.floor(b * 22050)));
    expect(win(0.3, 0.7)).toBeGreaterThan(0.05);
  });
});

describe('shell streak chime', () => {
  it('climbs one pentatonic step per shell and resets with the streak', () => {
    for (let n = 1; n <= PENTA.length; n++) expect(shellStep(n)).toBe(n - 1);
    expect(shellStep(1)).toBe(0);
    expect(shellStep(0)).toBe(0);
    // past the top it alternates the top two notes instead of sticking
    const top = [PENTA.length + 1, PENTA.length + 2, PENTA.length + 3].map(shellStep);
    expect(top).toEqual([PENTA.length - 2, PENTA.length - 1, PENTA.length - 2]);
    // every step is pentatonic (C D E G A)
    for (const s of PENTA) expect([0, 2, 4, 7, 9]).toContain(s % 12);
  });

  it('each step is rendered at its own pitch (zero crossings rise)', () => {
    const sr = 22050;
    const crossings = (x: Float32Array): number => {
      let c = 0;
      for (let i = 1; i < Math.floor(sr * 0.1); i++) if ((x[i - 1] as number) < 0 && (x[i] as number) >= 0) c++;
      return c;
    };
    const c0 = crossings(synthShell(0, sr));
    const c5 = crossings(synthShell(5, sr));
    const c10 = crossings(synthShell(10, sr));
    expect(c5).toBeGreaterThan(c0 * 1.6);
    expect(c10).toBeGreaterThan(c5 * 1.6);
  });
});

describe('instrument samples', () => {
  for (const inst of INSTRUMENTS) {
    it(`${inst} renders clean samples at every root`, () => {
      for (const root of instRoots(inst)) {
        const x = synthInstrument(inst, root, instRate(inst));
        expect(x.length).toBeGreaterThan(100);
        expect(x.every((v) => Number.isFinite(v))).toBe(true);
        const p = peakOf(x);
        expect(p).toBeGreaterThan(0.1);
        expect(p).toBeLessThanOrEqual(1);
        expect(Math.abs(x[x.length - 1] as number)).toBeLessThan(0.01);
      }
    });
  }
});

describe('music arrangements', () => {
  for (const id of TRACK_IDS) {
    describe(id, () => {
      const form = Array.from({ length: FORM_BARS }, (_, b) => barEvents(id, b));

      it('has a kick on every downbeat and a bassline on the chord root', () => {
        for (const bar of form) {
          expect(bar.some((e) => e.part === 'kick' && e.step === 0)).toBe(true);
          const bass = bar.filter((e) => e.part === 'bass');
          expect(bass.length).toBeGreaterThanOrEqual(3);
          expect(bass[0]?.step).toBe(0);
        }
      });

      it('has a backbeat (clap or rim) and a shaker or hat', () => {
        for (const bar of form) {
          expect(bar.some((e) => (e.part === 'clap' || e.part === 'rim') && (e.step === 4 || e.step === 12))).toBe(true);
          expect(bar.filter((e) => e.part === 'shaker' || e.part === 'hat').length).toBeGreaterThanOrEqual(4);
        }
      });

      it('keeps the lead in key and varies it every 8 bars', () => {
        const scale = trackScale(id);
        const sections = [0, 1, 2, 3].map((s) =>
          form.slice(s * 8, s * 8 + 8).map((bar) => bar.filter((e) => e.part === 'lead').map((e) => `${e.step}:${e.midi}`).join(',')).join('|'),
        );
        expect(new Set(sections).size).toBe(4);
        for (const bar of form) for (const e of bar) if (e.part === 'lead') expect(scale).toContain(e.midi % 12);
        // a motif, not noodling: every bar has a few lead notes
        for (const bar of form) expect(bar.filter((e) => e.part === 'lead').length).toBeGreaterThanOrEqual(2);
      });

      it('voice-leads its chords (small moves between voicings)', () => {
        const chordNotes = form.map((bar) => [...new Set(bar.filter((e) => e.part === 'chord' || e.part === 'pad' || e.part === 'sunset').map((e) => e.midi))]);
        for (let i = 1; i < chordNotes.length; i++) {
          const a = chordNotes[i - 1] as number[];
          const b = chordNotes[i] as number[];
          if (!a.length || !b.length) continue;
          for (const n of b) expect(Math.min(...a.map((m) => Math.abs(m - n)))).toBeLessThanOrEqual(5);
        }
      });

      it('loops seamlessly and swings the odd 16ths', () => {
        expect(barEvents(id, FORM_BARS)).toBe(barEvents(id, 0));
        const s16 = barSeconds(id) / 16;
        expect(stepTime(id, 2)).toBeCloseTo(2 * s16, 6);
        expect(stepTime(id, 3)).toBeCloseTo((3 + trackSwing(id)) * s16, 6);
        for (const bar of form) for (const e of bar) {
          expect(e.step).toBeGreaterThanOrEqual(0);
          expect(e.step).toBeLessThan(16);
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          expect(partInst(id, e.part)).toBeTruthy();
        }
      });
    });
  }

  it('the beach track carries the three zone layers', () => {
    const bar = barEvents('beach', 1);
    for (const l of ZONE_LAYERS) expect(bar.some((e) => e.part === l)).toBe(true);
    expect(barEvents('island', 1).some((e) => ZONE_LAYERS.includes(e.part))).toBe(false);
  });

  it('voiceLead picks the nearest inversion', () => {
    const v = voiceLead([{ r: 48, iv: [0, 4, 7] }, { r: 41, iv: [0, 4, 7] }]);
    // C major then F major: common tone C stays put
    const [c, f] = v as [number[], number[]];
    const common = c.filter((n) => n % 12 === 0);
    expect(common.some((n) => f.includes(n))).toBe(true);
  });
});

// ----------------------------------------------------------------------------------- offline mixdown

/** Render bars of a track in plain JS (the same samples and events the player uses) for a level check. */
function mixdown(id: (typeof TRACK_IDS)[number], bars: number, sr = 16000, zone = 0): Float32Array {
  const out = new Float32Array(Math.ceil((bars * barSeconds(id) + 2) * sr));
  const cache = new Map<string, Float32Array>();
  const gains: Record<string, number> = { kick: 0.55, clap: 0.25, rim: 0.14, shaker: 0.1, hat: 0.1, tom: 0.35, bass: 0.5, chord: 0.12, pad: 0.08, arp: 0.12, lead: 0.3, double: 0.1, whistle: 0.24, steel: 0.13, sunset: 0.1 };
  for (let bar = 0; bar < bars; bar++) {
    for (const e of barEvents(id, bar)) {
      if (ZONE_LAYERS.includes(e.part) && ZONE_LAYERS.indexOf(e.part) + 1 !== zone) continue;
      const inst = partInst(id, e.part);
      if (!inst) continue;
      const roots = instRoots(inst);
      let root = roots[0] as number;
      for (const r of roots) if (Math.abs(r - e.midi) < Math.abs(root - e.midi)) root = r;
      const key = `${inst}:${root}`;
      let x = cache.get(key);
      if (!x) cache.set(key, (x = synthInstrument(inst, root)));
      const rate = Math.pow(2, (e.midi - root) / 12) * (instRate(inst) / sr);
      const t0 = Math.floor((bar * barSeconds(id) + stepTime(id, e.step)) * sr);
      const g = (gains[e.part] ?? 0.2) * e.vel;
      const n = Math.min(Math.floor((x.length - 1) / rate), Math.floor((e.len * barSeconds(id)) / 16 * sr + sr * 0.3));
      for (let i = 0; i < n && t0 + i < out.length; i++) {
        const p = i * rate;
        const k = Math.floor(p);
        out[t0 + i] = (out[t0 + i] as number) + ((x[k] as number) + ((x[k + 1] as number) - (x[k] as number)) * (p - k)) * g;
      }
    }
  }
  return out;
}

describe('offline mixdown', () => {
  for (const id of TRACK_IDS) {
    it(`${id}: 8 bars render at a healthy, unclipped level`, () => {
      const x = mixdown(id, 8, 16000, id === 'beach' ? 2 : 0);
      let sum = 0;
      let peak = 0;
      expect(x.every((v) => Number.isFinite(v))).toBe(true);
      for (const v of x) {
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      const rms = Math.sqrt(sum / x.length);
      expect(rms).toBeGreaterThan(0.03);
      // headroom before the limiter (music bus is scaled by the volume setting after this)
      expect(peak).toBeLessThan(2.5);
      if (process.env.AUDIO_WAV) writeWav(`${process.env.AUDIO_WAV}/${id}.wav`, x, 16000);
    });
  }
});

function writeWav(path: string, x: Float32Array, sr: number): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(((x[i] as number) / Math.max(1, peak)) * 32000), 44 + i * 2);
  fs.writeFileSync(path, b);
}
