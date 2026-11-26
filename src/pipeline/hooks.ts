/**
 * window.__tf — automation surface used by scripts/render.mjs (Playwright).
 * Every method is deterministic: output depends only on the frame index.
 */
import { H, TOTAL_FRAMES, W } from "../core/config";
import { Studio, loadFonts } from "./studio";
import { buildMasteredAudio, encodeWav } from "../audio/master";

export interface FrameStats { f: number; mean: number; nonBlack: number; diff: number; maxCh: number }

export function installHooks() {
  const existing = (window as any).__tf;
  if (existing) return existing as ReturnType<typeof createHooks>;
  return createHooks();
}

function createHooks() {
  const studio = new Studio();
  let prev: Uint8Array | null = null;
  let buf: Uint8Array | null = null;
  const api = {
    ready: false,
    W, H, TOTAL_FRAMES,
    async init() {
      await loadFonts();
      this.ready = true;
    },
    /** render frame, return base64 RGB24 + QA statistics */
    frame(f: number) {
      studio.renderFrame(f);
      buf = studio.post.readRGB(buf ?? undefined);
      // Stage-A statistics on a 1/8 pixel grid
      let sum = 0, nb = 0, d = 0, n = 0, maxCh = 0;
      for (let y = 0; y < H; y += 8) {
        for (let x = 0; x < W; x += 8) {
          const i = (y * W + x) * 3;
          const l = (buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722);
          sum += l;
          if (l > 6) nb++;
          if (buf[i] > maxCh) maxCh = buf[i];
          if (prev) d += Math.abs(buf[i] - prev[i]) + Math.abs(buf[i + 1] - prev[i + 1]) + Math.abs(buf[i + 2] - prev[i + 2]);
          n++;
        }
      }
      if (!prev) prev = new Uint8Array(buf.length);
      prev.set(buf);
      const stats: FrameStats = { f, mean: sum / n, nonBlack: nb / n, diff: d / n / 3, maxCh };
      let s = "";
      const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH) as unknown as number[]);
      return { b64: btoa(s), stats };
    },
    /** PNG data URL of a frame (for contact sheets) */
    png(f: number) {
      studio.renderFrame(f);
      return studio.out.toDataURL("image/png");
    },
    /** render + master the soundtrack; returns 32-bit float WAV (base64) and the measured report */
    async audio() {
      const { channels, report } = await buildMasteredAudio();
      const wav = encodeWav(channels);
      let s = "";
      const CH = 0x8000;
      for (let i = 0; i < wav.length; i += CH) s += String.fromCharCode.apply(null, wav.subarray(i, i + CH) as unknown as number[]);
      return { b64: btoa(s), report };
    },
    resetDiff() { prev = null; },
    studio,
  };
  (window as any).__tf = api;
  return api;
}
