/**
 * Editorial timeline. Every cut, hit and effect is addressed in absolute frames at 60 fps.
 * Picture (fxAt, scenes) and sound (audio engine) both read from this file — that is the sync contract.
 */
import { BAR, TOTAL_FRAMES } from "./config";
import { noise1 } from "./math";
import { E, prog } from "../motion/easing";

export interface SceneDef {
  id: string;
  index: number;
  name: string;
  act: string;
  start: number;
  end: number;
  shot: string;
  hierarchy: string;
  camera: string;
  typography: string;
  graphics: string;
  threeD: string;
  animation: string;
  transition: string;
  music: string;
  sfx: string;
}

const s = (n: number) => n * BAR;

export const SCENES: SceneDef[] = [
  {
    id: "ignition", index: 1, name: "IGNITION", act: "HOOK", start: s(0), end: s(2),
    shot: "Locked-off wide, centred axis, one hairline anvil at 54% height",
    hierarchy: "Ember → hairline → ONE SPARK. → caption",
    camera: "Locked; impact shake + 1.2% punch-in on the strike",
    typography: "Anton 290 px, masked rise, spring overshoot; mono caption typed on",
    graphics: "Seeded ballistic spark field (300), flattened shock-ring, tracking readout",
    threeD: "—", animation: "Gravity-accelerated fall, anticipation dip on exit",
    transition: "Match-cut: the hairline becomes the horizon of Scene 2",
    music: "Near-silence: drone only, 2.5 s of tension", sfx: "Falling whistle, sub-boom + inharmonic metal strike, spark crackle",
  },
  {
    id: "structure", index: 2, name: "STRUCTURE", act: "DEVELOPMENT", start: s(2), end: s(5),
    shot: "Low horizon, shape centred on the upper third",
    hierarchy: "Word → morphing shape → diagram labels → floor grid",
    camera: "Constant forward dolly over perspective floor",
    typography: "Five different kinetic word choreographies (rise, pop, slice, drop, scramble)",
    graphics: "Pointwise path morph line→circle→square→triangle→disc, compass ring, data labels",
    threeD: "Projected floor grid", animation: "Beat-locked entries every 2 beats×2, morph on cinema curve",
    transition: "Circle iris: the final disc expands and reveals Scene 3",
    music: "Kick enters at bar 3, offbeat hats, claps, arpeggiated pluck, bass", sfx: "UI ticks per word, whooshes, circle-wipe sweep",
  },
  {
    id: "depth", index: 3, name: "DEPTH", act: "ESCALATION", start: s(5), end: s(8),
    shot: "Low-angle product hero, object low-centre, title high-left",
    hierarchy: "Chrome core → extruded title → orbit rings → data readout",
    camera: "Orbit + dolly, accelerating spin, shake into implosion",
    typography: "Perspective-warped extruded Anton (BUILD IN / DEPTH)",
    graphics: "Counters, wireframe blueprint overlay, ring annotations",
    threeD: "Faceted chrome icosahedron, 3 tube rings, 72 forged shards (software rasteriser, studio-HDR reflections)",
    animation: "Spiral assembly, parallax, accelerating spin, implosion to a point",
    transition: "Everything collapses to the ember (callback) → 0.5 s of visual silence",
    music: "Pad enters, bass, rising snare roll + riser, hard drop-out at 15.5 s", sfx: "Riser, reverse swell, heartbeat ×2 in the silence",
  },
  {
    id: "reveal", index: 4, name: "REVEAL", act: "REVEAL", start: s(8), end: s(10),
    shot: "Hero chrome emblem low-centre, title above",
    hierarchy: "Infinity emblem → TOONFORGE → descriptor",
    camera: "Slow dolly with parallax yaw; deliberate stillness at the end",
    typography: "Extruded TOONFORGE, perspective turn, travelling specular sweep",
    graphics: "Shock ring, radial speed lines, spark burst, hairline rules",
    threeD: "Lemniscate chrome tube with emissive aura, drawn on along the curve",
    animation: "Draw-on growth, spring yaw settle, light sweep",
    transition: "Hard cut on the beat with flash + RGB split",
    music: "Massive impact, Am(add9) pad swell, bell motif, riser in last bar", sfx: "Boom, metal hit, shimmer on the light sweep, riser",
  },
  {
    id: "climax", index: 5, name: "OVERDRIVE", act: "CLIMAX", start: s(10), end: s(13),
    shot: "Full-bleed type, background flips colour on each beat",
    hierarchy: "One giant word per beat → tunnel → three-line manifesto",
    camera: "Tunnel rush with time-remap deceleration",
    typography: "Slam, extrude, glitch, waveform, rolling counter, stacked manifesto",
    graphics: "Hex tunnel, speed lines, waveform, frame counter, shock rings, 400 sparks",
    threeD: "Perspective tunnel + extruded type", animation: "Pattern interruption every beat; freeze at 1470",
    transition: "Time-remap to stillness, then dissolve through black",
    music: "Full drop: kick, 16th hats, claps, syncopated bass, tape-stop at the freeze", sfx: "Glitch stutters, impacts, riser into the resolution",
  },
  {
    id: "resolve", index: 6, name: "RESOLVE", act: "RESOLUTION", start: s(13), end: s(15),
    shot: "Quiet centred lock-up, generous negative space",
    hierarchy: "Infinity mark → wordmark → tagline → spec row",
    camera: "Locked", typography: "Anton wordmark tracked +0.12em; mono tagline",
    graphics: "Single-line infinity draw-on with travelling ember, hairline callback to scene 1",
    threeD: "—", animation: "Draw-on, masked rise, slow ember pulse",
    transition: "Fade to black, 0.8 s of silence in the tail",
    music: "Am9 pad, sparse bell melody, low final note", sfx: "Shimmer, sub-drop",
  },
];

export const sceneAt = (f: number) => SCENES.find((sc) => f >= sc.start && f < sc.end) ?? SCENES[SCENES.length - 1];

/* ---------------- Scene 2 kinetic script (local frames, scene start = 240) ---------------- */
export type WordStyle = "rise" | "pop" | "slice" | "drop" | "scramble";
export interface S2Beat { lf: number; word: string; sides: number; style: WordStyle; label: string }
export const S2_SCRIPT: S2Beat[] = [
  { lf: 30, word: "LINE", sides: 0, style: "rise", label: "01" },
  { lf: 90, word: "CIRCLE", sides: 64, style: "pop", label: "02" },
  { lf: 150, word: "SQUARE", sides: 4, style: "slice", label: "03" },
  { lf: 210, word: "TRIANGLE", sides: 3, style: "drop", label: "04" },
  { lf: 270, word: "FORM", sides: 64, style: "scramble", label: "05" },
];
export const S2_WIPE = { start: 330, dur: 30 };

/* ---------------- Scene 5 script (local frames, scene start = 1200) ---------------- */
export interface S5Beat { lf: number; text: string; style: "ink" | "extrude" | "glitch" | "wave" | "count" }
export const S5_SCRIPT: S5Beat[] = [
  { lf: 0, text: "2D", style: "ink" },
  { lf: 30, text: "3D", style: "extrude" },
  { lf: 60, text: "VFX", style: "glitch" },
  { lf: 90, text: "SOUND", style: "wave" },
  { lf: 120, text: "60", style: "count" },
];
export const S5_STACK = [
  { lf: 180, text: "EVERY" },
  { lf: 195, text: "FRAME" },
  { lf: 210, text: "FORGED." },
];

/* ---------------- Sync events (absolute frames) ---------------- */
export interface Impact { f: number; s: number; decay: number }
export interface Glitch { f: number; dur: number; s: number }
export interface Flash { f: number; s: number; decay: number }

export const IMPACTS: Impact[] = [
  { f: 90, s: 1.0, decay: 14 },
  { f: 960, s: 1.7, decay: 24 },
  { f: 1200, s: 1.3, decay: 16 },
  { f: 1230, s: 0.7, decay: 12 },
  { f: 1260, s: 0.9, decay: 12 },
  { f: 1290, s: 0.9, decay: 12 },
  { f: 1320, s: 1.1, decay: 16 },
  { f: 1380, s: 0.7, decay: 10 },
  { f: 1395, s: 0.8, decay: 10 },
  { f: 1410, s: 1.4, decay: 20 },
  { f: 1440, s: 0.9, decay: 14 },
  { f: 1470, s: 0.6, decay: 30 },
];
export const GLITCHES: Glitch[] = [
  { f: 390, dur: 7, s: 0.45 },
  { f: 1200, dur: 10, s: 0.9 },
  { f: 1260, dur: 26, s: 1.0 },
  { f: 1290, dur: 6, s: 0.5 },
  { f: 1320, dur: 8, s: 0.8 },
  { f: 1366, dur: 4, s: 0.6 },
  { f: 1410, dur: 12, s: 0.9 },
  { f: 1440, dur: 6, s: 0.6 },
  { f: 1470, dur: 8, s: 0.7 },
  { f: 960, dur: 8, s: 0.7 },
];
export const FLASHES: Flash[] = [
  { f: 90, s: 0.7, decay: 5 },
  { f: 960, s: 1.0, decay: 9 },
  { f: 1200, s: 0.85, decay: 7 },
  { f: 1320, s: 0.45, decay: 8 },
  { f: 1410, s: 0.55, decay: 8 },
];
/** Visual-silence window before the reveal (heartbeat dot only). */
export const SILENCE = { start: 930, end: 960 };
export const HEARTBEATS = [934, 948];

export interface PostParams {
  shake: [number, number];
  zoom: number;
  chroma: number;
  glitch: number;
  flash: number;
  grain: number;
  vignette: number;
  bloom: number;
  warp: number;
  fade: number;
}

export function fxAt(f: number): PostParams {
  let amp = 0, chroma = 0.12, glitch = 0, flash = 0;
  for (const e of IMPACTS) {
    if (f < e.f) continue;
    const a = e.s * Math.exp(-(f - e.f) / e.decay);
    amp += a;
    chroma += a * 0.7;
  }
  for (const g of GLITCHES) if (f >= g.f && f < g.f + g.dur) glitch = Math.max(glitch, g.s * (1 - ((f - g.f) / g.dur) * 0.5));
  for (const l of FLASHES) if (f >= l.f) flash += l.s * Math.exp(-(f - l.f) / l.decay);
  amp = Math.min(amp, 2.2);
  const shake: [number, number] = [noise1(f * 0.85, 3) * amp * 16, noise1(f * 0.85, 9) * amp * 16];
  // opening fade-in (6 frames) and final fade-out (1740→1792)
  const fade = Math.max(1 - prog(f, 0, 8), E.inOutCubic(prog(f, 1738, 54)));
  const bloomBase = f >= 1200 && f < 1560 ? 0.75 : 0.62;
  return {
    shake,
    zoom: 1 + Math.min(amp, 1.5) * 0.010,
    chroma: Math.min(chroma + glitch * 0.8, 1.6),
    glitch,
    flash: Math.min(flash, 1),
    grain: 0.05,
    vignette: 0.55,
    bloom: bloomBase + Math.min(flash, 1) * 0.5,
    warp: 0.035 + amp * 0.02,
    fade,
  };
}

export const SCENE_ENDS = SCENES.map((x) => x.end);
if (SCENES[SCENES.length - 1].end !== TOTAL_FRAMES) throw new Error("Timeline does not match TOTAL_FRAMES");
