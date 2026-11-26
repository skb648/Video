/** Master delivery specification — single source of truth for picture, sound and editorial. */
export const W = 1080;
export const H = 1920;
export const FPS = 60;
export const BPM = 120;
export const BEAT = (60 / BPM) * FPS; // 30 frames
export const BAR = BEAT * 4; // 120 frames
export const TOTAL_FRAMES = 1800; // 30.000 s
export const DURATION = TOTAL_FRAMES / FPS;
export const SAMPLE_RATE = 48000;

export const f2t = (f: number) => f / FPS;

export function timecode(f: number): string {
  const ff = Math.floor(f) % FPS;
  const s = Math.floor(f / FPS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
}
