/** Mastering: ITU-R BS.1770 loudness (K-weighting + gating), lookahead peak limiter, 4× true-peak estimate, WAV writer. */
import { SAMPLE_RATE } from "../core/config";
import { renderMix } from "./engine";

export interface AudioReport {
  sampleRate: number;
  durationSec: number;
  integratedLUFS: number;
  samplePeakDBFS: number;
  truePeakDBTP: number;
  targetLUFS: number;
  ceilingDBFS: number;
  gainAppliedDB: number;
  silentTailSec: number;
  firstSoundSec: number;
  clippedSamples: number;
}

function biquad(x: Float32Array, b: number[], a: number[]): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/** BS.1770-4 K-weighting, coefficients specified for 48 kHz. */
const kWeight = (x: Float32Array) =>
  biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);

export function integratedLUFS(ch: Float32Array[]): number {
  const k = ch.map(kWeight);
  const N = Math.round(0.4 * SAMPLE_RATE), hop = Math.round(0.1 * SAMPLE_RATE);
  const blocks: number[] = [];
  for (let s = 0; s + N <= k[0].length; s += hop) {
    let p = 0;
    for (const c of k) { let sum = 0; for (let i = s; i < s + N; i++) sum += c[i] * c[i]; p += sum / N; }
    blocks.push(p);
  }
  const L = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = blocks.filter((p) => L(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const fin = abs.filter((p) => L(p) > rel);
  return L(fin.reduce((a, b) => a + b, 0) / fin.length);
}

export function limit(ch: Float32Array[], ceiling: number, look = Math.round(0.004 * SAMPLE_RATE)): Float32Array[] {
  const n = ch[0].length;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of ch) m = Math.max(m, Math.abs(c[i]));
    g[i] = m > ceiling ? ceiling / m : 1;
  }
  // running minimum over [i, i+look]
  const mn = new Float32Array(n);
  const dq: number[] = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && g[dq[dq.length - 1]] >= g[i]) dq.pop();
    dq.push(i);
    while (dq[head] > i + look) head++;
    mn[i] = g[dq[head]];
  }
  // causal box smoothing over [i-look, i]; each term ≤ g[i] so the result never exceeds the ceiling
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + mn[i];
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - look);
    gain[i] = (pre[i + 1] - pre[a]) / (i + 1 - a);
  }
  return ch.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * gain[i]; return o; });
}

/** 4× oversampled peak (windowed-sinc, 16 taps per phase) — an estimate in the spirit of BS.1770 Annex 2. */
export function truePeak(ch: Float32Array[]): number {
  const taps = 8;
  const ph: number[][] = [1, 2, 3].map((p) => {
    const frac = p / 4;
    return Array.from({ length: taps * 2 }, (_, j) => {
      const k = j - taps + 1;
      const x = k - frac;
      const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (taps + 0.5));
      return sinc * w;
    });
  });
  let peak = 0;
  for (const c of ch) {
    for (let i = taps; i < c.length - taps; i++) {
      const a = Math.abs(c[i]);
      peak = Math.max(peak, a);
      if (a < 0.2 && Math.abs(c[i + 1]) < 0.2) continue;
      for (const h of ph) {
        let s = 0;
        for (let j = 0; j < taps * 2; j++) s += c[i - taps + 1 + j] * h[j];
        peak = Math.max(peak, Math.abs(s));
      }
    }
  }
  return peak;
}

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

export async function buildMasteredAudio(target = -14, ceilingDb = -2.5): Promise<{ channels: Float32Array[]; report: AudioReport }> {
  const buf = await renderMix();
  const ch: Float32Array[] = [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()];
  const ceiling = Math.pow(10, ceilingDb / 20);
  const raw = integratedLUFS(ch);
  let gDb = target - raw;
  let out: Float32Array[] = ch;
  for (let it = 0; it < 4; it++) {
    const g = Math.pow(10, gDb / 20);
    out = limit(ch.map((c) => c.map((v) => v * g)), ceiling);
    const l = integratedLUFS(out);
    if (Math.abs(l - target) < 0.35) break;
    gDb += target - l;
  }
  const n = out[0].length;
  let sp = 0, clipped = 0, first = -1, lastLoud = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(out[0][i]), Math.abs(out[1][i]));
    if (a > sp) sp = a;
    if (a >= 0.9999) clipped++;
    if (a > 0.001) { if (first < 0) first = i; lastLoud = i; }
  }
  const report: AudioReport = {
    sampleRate: SAMPLE_RATE,
    durationSec: n / SAMPLE_RATE,
    integratedLUFS: integratedLUFS(out),
    samplePeakDBFS: db(sp),
    truePeakDBTP: db(truePeak(out)),
    targetLUFS: target,
    ceilingDBFS: ceilingDb,
    gainAppliedDB: gDb,
    silentTailSec: (n - lastLoud) / SAMPLE_RATE,
    firstSoundSec: first / SAMPLE_RATE,
    clippedSamples: clipped,
  };
  return { channels: out, report };
}

/** 32-bit float stereo WAV */
export function encodeWav(ch: Float32Array[], sr = SAMPLE_RATE): Uint8Array {
  const n = ch[0].length;
  const out = new DataView(new ArrayBuffer(44 + n * 8));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 8, true); w(8, "WAVE"); w(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 3, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 8, true); out.setUint16(32, 8, true); out.setUint16(34, 32, true);
  w(36, "data"); out.setUint32(40, n * 8, true);
  for (let i = 0; i < n; i++) { out.setFloat32(44 + i * 8, ch[0][i], true); out.setFloat32(48 + i * 8, ch[1][i], true); }
  return new Uint8Array(out.buffer);
}
