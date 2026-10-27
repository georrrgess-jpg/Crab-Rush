/**
 * Keyframed tracks for scripted sequences (the boot cinematic, UPDATE3_PLAN.md §2.1). Pure: no three,
 * no DOM. Values ease between keys with a smoothstep so camera moves start and stop gently.
 */
export type Key = readonly [t: number, ...v: number[]];

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** Sample a track at time `t` into `out` (length = values per key). */
export function sample(keys: readonly Key[], t: number, out: number[]): number[] {
  const n = (keys[0]?.length ?? 1) - 1;
  if (keys.length === 0) return out;
  const first = keys[0] as Key;
  const last = keys[keys.length - 1] as Key;
  if (t <= first[0]) {
    for (let i = 0; i < n; i++) out[i] = first[i + 1] as number;
    return out;
  }
  if (t >= last[0]) {
    for (let i = 0; i < n; i++) out[i] = last[i + 1] as number;
    return out;
  }
  for (let k = 1; k < keys.length; k++) {
    const b = keys[k] as Key;
    if (t > b[0]) continue;
    const a = keys[k - 1] as Key;
    const u = smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
    for (let i = 0; i < n; i++) out[i] = (a[i + 1] as number) + ((b[i + 1] as number) - (a[i + 1] as number)) * u;
    return out;
  }
  return out;
}

/** One-shot cues: returns the names whose time falls in (from, to]. */
export function cues(list: readonly (readonly [number, string])[], from: number, to: number): string[] {
  const out: string[] = [];
  for (const [t, name] of list) if (t > from && t <= to) out.push(name);
  return out;
}
