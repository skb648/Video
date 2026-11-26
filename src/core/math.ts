/** Deterministic math + seeded randomness. Nothing here holds state. */
export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Integer hash (lowbias32). */
export function hash32(n: number): number {
  n = n | 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return n >>> 0;
}

/** Stateless seeded random in [0,1). rnd(seed, i) is a pure function. */
export const rnd = (seed: number, i = 0) =>
  hash32(Math.imul(seed | 0, 374761393) + Math.imul(i | 0, 668265263) + 0x9e3779b9) / 4294967296;

/** Smooth 1D value noise in [-1,1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const t = x - i;
  const u = t * t * (3 - 2 * t);
  return lerp(rnd(seed, i) * 2 - 1, rnd(seed, i + 1) * 2 - 1, u);
}

export function fbm1(x: number, seed = 0, oct = 3): number {
  let a = 0.5, s = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * noise1(x * f, seed + o * 17);
    f *= 2;
    a *= 0.5;
  }
  return s;
}

/** Sequential seeded generator (mulberry32) for build-time data — never used per-frame. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RGB = [number, number, number];
export const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
