/** Motion choreography framework: cubic Béziers, springs, damped oscillation, anticipation. All pure. */
import { FPS } from "../core/config";
import { clamp } from "../core/math";

export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

export const E = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuint: (t: number) => t * t * t * t * t,
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outBounce: (t: number) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  /** Signature curves of the TOONFORGE motion language */
  cinema: cubicBezier(0.16, 1, 0.3, 1), // fast attack, long soft landing
  snap: cubicBezier(0.76, 0, 0.18, 1), // mechanical, decisive
  settle: cubicBezier(0.22, 1, 0.36, 1),
  press: cubicBezier(0.55, 0, 1, 0.45), // accelerating exit
};

/** Normalised progress of frame f in [start, start+dur]. */
export const prog = (f: number, start: number, dur: number) => clamp((f - start) / dur);
export const tw = (f: number, start: number, dur: number, ease: (t: number) => number = E.cinema) => ease(prog(f, start, dur));

/** Analytic damped spring step response (0 → 1 with overshoot). t in seconds. */
export function spring(t: number, freq = 3, damp = 0.5): number {
  if (t <= 0) return 0;
  const w = freq * Math.PI * 2;
  if (damp >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - damp * damp);
  return 1 - Math.exp(-damp * w * t) * (Math.cos(wd * t) + ((damp * w) / wd) * Math.sin(wd * t));
}
export const springF = (f: number, start: number, freq = 3, damp = 0.5) => spring((f - start) / FPS, freq, damp);

/** Damped oscillation around zero (follow-through / secondary motion). */
export const dampedOsc = (t: number, amp: number, freq: number, decay: number) =>
  t <= 0 ? 0 : amp * Math.exp(-decay * t) * Math.cos(Math.PI * 2 * freq * t);

/** Anticipation: dips below 0 first, then travels to 1 with ease-out. */
export function anticipate(p: number, back = 0.14, split = 0.28): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < split) return -back * Math.sin((p / split) * Math.PI * 0.5);
  const q = (p - split) / (1 - split);
  return -back + (1 + back) * E.inOutCubic(q) * 1;
}

export const stagger = (i: number, n: number, spread: number) => (n <= 1 ? 0 : (i / (n - 1)) * spread);
