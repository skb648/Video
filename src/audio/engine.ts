/**
 * Procedural sound department. Everything is synthesised in an OfflineAudioContext from the same
 * frame-addressed timeline as the picture: t = frame / 60. Seeded noise → bit-identical renders.
 */
import { BPM, DURATION, FPS, SAMPLE_RATE } from "../core/config";
import { makeRng, rnd } from "../core/math";
import { S2_SCRIPT, HEARTBEATS } from "../core/timeline";

type Ctx = OfflineAudioContext;
const t = (f: number) => f / FPS;
const BEATF = (60 / BPM) * FPS; // 30 frames
const BARF = BEATF * 4;

interface Mixer {
  c: Ctx;
  noise: AudioBuffer;
  bus: { drums: GainNode; music: GainNode; fx: GainNode; duck: GainNode };
  verb: GainNode;
  delay: GainNode;
  ducks: { t: number; depth: number; rel: number }[];
}

/* ---------- primitives ---------- */
function makeNoise(c: Ctx): AudioBuffer {
  const b = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const d = b.getChannelData(0);
  const r = makeRng(0x70f0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}
function makeIR(c: Ctx, secs: number, seed: number, chan: number): Float32Array {
  const n = Math.floor(c.sampleRate * secs);
  const r = makeRng(seed + chan * 97);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const x = (r() * 2 - 1) * Math.pow(1 - p, 3.4);
    y += (x - y) * (0.85 - 0.72 * Math.sqrt(p)); // tail darkens as it decays
    out[i] = y * (i < 400 ? i / 400 : 1);
  }
  return out;
}

interface V {
  type?: OscillatorType; f: number; f2?: number; fdur?: number; t: number; a?: number; d: number; vel: number;
  dest: AudioNode; pan?: number; lp?: number; lpEnd?: number; q?: number; send?: number; det?: number; dly?: number;
}
function voice(m: Mixer, o: V) {
  const c = m.c;
  const a = o.a ?? 0.003;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, o.t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, o.t + (o.fdur ?? o.d));
  if (o.det) osc.detune.value = o.det;
  let node: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(o.lp, o.t);
    if (o.lpEnd) f.frequency.exponentialRampToValueAtTime(o.lpEnd, o.t + a + o.d);
    f.Q.value = o.q ?? 0.7;
    node.connect(f);
    node = f;
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vel), o.t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + a + o.d);
  node.connect(g);
  tail(m, g, o);
  osc.start(o.t);
  osc.stop(o.t + a + o.d + 0.05);
}
function tail(m: Mixer, g: AudioNode, o: { dest: AudioNode; pan?: number; send?: number; dly?: number }) {
  const c = m.c;
  let out: AudioNode = g;
  if (o.pan) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    out.connect(p);
    out = p;
  }
  out.connect(o.dest);
  if (o.send) { const s = c.createGain(); s.gain.value = o.send; out.connect(s); s.connect(m.verb); }
  if (o.dly) { const s = c.createGain(); s.gain.value = o.dly; out.connect(s); s.connect(m.delay); }
}

interface N {
  t: number; d: number; a?: number; vel: number; dest: AudioNode; kind: BiquadFilterType; f: number; f2?: number; q?: number;
  pan?: number; pan2?: number; send?: number; off?: number; dly?: number;
}
function noise(m: Mixer, o: N) {
  const c = m.c;
  const src = c.createBufferSource();
  src.buffer = m.noise;
  src.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = o.kind;
  fl.frequency.setValueAtTime(o.f, o.t);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, o.t + (o.a ?? 0.002) + o.d);
  fl.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  const a = o.a ?? 0.002;
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vel), o.t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + a + o.d);
  src.connect(fl);
  fl.connect(g);
  let out: AudioNode = g;
  if (o.pan !== undefined) {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(o.pan, o.t);
    if (o.pan2 !== undefined) p.pan.linearRampToValueAtTime(o.pan2, o.t + a + o.d);
    out.connect(p);
    out = p;
  }
  out.connect(o.dest);
  if (o.send) { const s = c.createGain(); s.gain.value = o.send; out.connect(s); s.connect(m.verb); }
  if (o.dly) { const s = c.createGain(); s.gain.value = o.dly; out.connect(s); s.connect(m.delay); }
  src.start(o.t, o.off ?? 0);
  src.stop(o.t + a + o.d + 0.05);
}

/* ---------- instruments ---------- */
const kick = (m: Mixer, T: number, vel = 0.9) => {
  voice(m, { f: 165, f2: 44, fdur: 0.09, t: T, d: 0.34, vel, dest: m.bus.drums });
  noise(m, { t: T, d: 0.012, vel: vel * 0.22, dest: m.bus.drums, kind: "highpass", f: 3000 });
  m.ducks.push({ t: T, depth: 0.42, rel: 0.26 });
};
const boom = (m: Mixer, T: number, d: number, vel: number) => {
  voice(m, { f: 64, f2: 26, fdur: d * 0.8, t: T, a: 0.004, d, vel, dest: m.bus.fx, send: 0.35 });
  noise(m, { t: T, d: d * 0.5, vel: vel * 0.35, dest: m.bus.fx, kind: "lowpass", f: 380, f2: 60, send: 0.4 });
  noise(m, { t: T, d: 0.18, vel: vel * 0.4, dest: m.bus.fx, kind: "highpass", f: 2200, send: 0.3 });
  m.ducks.push({ t: T, depth: 0.25, rel: Math.min(1.2, d * 0.5) });
};
const PART = [1, 2.76, 5.4, 8.93, 13.34];
const metal = (m: Mixer, T: number, base: number, vel: number, pan = 0) => {
  PART.forEach((r, i) => voice(m, { f: base * r, t: T, d: [2.2, 1.4, 0.9, 0.5, 0.3][i], vel: vel * [0.6, 0.36, 0.24, 0.15, 0.09][i], dest: m.bus.fx, pan, send: 0.35 }));
  noise(m, { t: T, d: 0.03, vel: vel * 0.3, dest: m.bus.fx, kind: "bandpass", f: 4200, q: 1.5, pan });
};
const clap = (m: Mixer, T: number, vel = 0.5) => {
  [0, 0.011, 0.022].forEach((o, i) => noise(m, { t: T + o, d: i < 2 ? 0.02 : 0.16, vel: vel * (i < 2 ? 0.7 : 1), dest: m.bus.drums, kind: "bandpass", f: 1600, q: 0.9, send: 0.22, off: 0.3 + i }));
};
const hat = (m: Mixer, T: number, vel: number, open = false, pan = 0) =>
  noise(m, { t: T, d: open ? 0.2 : 0.04, vel, dest: m.bus.drums, kind: "highpass", f: 7500, pan, off: 1.1 });
const bass = (m: Mixer, T: number, f: number, d: number, vel: number) => {
  voice(m, { type: "sawtooth", f, t: T, a: 0.004, d, vel: vel * 0.7, dest: m.bus.music, lp: 1500, lpEnd: 200, q: 3 });
  voice(m, { f, t: T, a: 0.004, d: d * 1.1, vel, dest: m.bus.music });
};
const pluck = (m: Mixer, T: number, f: number, vel: number, pan: number) =>
  voice(m, { type: "sawtooth", f, t: T, a: 0.002, d: 0.24, vel, dest: m.bus.music, lp: 3600, lpEnd: 500, q: 2, pan, send: 0.25, dly: 0.5 });
const pad = (m: Mixer, T: number, freqs: number[], d: number, vel: number, attack = 0.9) =>
  freqs.forEach((fr, i) => [-7, 7].forEach((det) => voice(m, { type: "sawtooth", f: fr, t: T, a: attack, d: Math.max(0.1, d - attack), vel: vel / freqs.length * 1.6, dest: m.bus.music, det, lp: 700, lpEnd: 2200, q: 0.5, pan: (i % 2 ? 1 : -1) * 0.35, send: 0.45 })));
const bell = (m: Mixer, T: number, f: number, vel: number, pan = 0) =>
  [1, 2.0, 3.01, 4.2, 5.4].forEach((r, i) => voice(m, { f: f * r, t: T, a: 0.002, d: [3.2, 2.2, 1.5, 1, 0.6][i], vel: vel * [1, 0.5, 0.3, 0.18, 0.1][i], dest: m.bus.fx, pan, send: 0.6, dly: 0.25 }));
const whoosh = (m: Mixer, T: number, d: number, dir: number, vel: number, p0 = -0.5, p1 = 0.5) =>
  noise(m, { t: T, a: dir > 0 ? d * 0.7 : d * 0.25, d: dir > 0 ? d * 0.3 : d * 0.75, vel, dest: m.bus.fx, kind: "bandpass", f: dir > 0 ? 350 : 6000, f2: dir > 0 ? 6000 : 350, q: 1.1, pan: p0, pan2: p1, send: 0.3, off: 0.5 });
const riser = (m: Mixer, T0: number, T1: number, vel: number) => {
  noise(m, { t: T0, a: T1 - T0, d: 0.03, vel, dest: m.bus.fx, kind: "highpass", f: 300, f2: 9000, q: 0.6, send: 0.3, off: 1.7 });
  voice(m, { type: "sawtooth", f: 110, f2: 880, fdur: T1 - T0, t: T0, a: T1 - T0, d: 0.03, vel: vel * 0.35, dest: m.bus.fx, lp: 1200, lpEnd: 5000 });
};
const snareRoll = (m: Mixer, T0: number, T1: number, v0: number, v1: number) => {
  let T = T0, i = 0;
  while (T < T1) {
    const p = (T - T0) / (T1 - T0);
    const vel = v0 + (v1 - v0) * p;
    noise(m, { t: T, d: 0.07, vel, dest: m.bus.drums, kind: "bandpass", f: 1900, q: 0.8, off: 2 + (i % 5) * 0.2, send: 0.15 });
    voice(m, { f: 200, f2: 150, t: T, d: 0.05, vel: vel * 0.5, dest: m.bus.drums });
    T += 0.25 * (60 / BPM) * (1 - 0.75 * p) * 2;
    i++;
  }
};
const glitch = (m: Mixer, T: number, seed: number) => {
  const pan = rnd(seed, 99) * 2 - 1;
  for (let i = 0; i < 7; i++) {
    const f = 120 * Math.pow(2, Math.floor(rnd(seed, i) * 30) / 5);
    voice(m, { type: "square", f, t: T + i * 0.024, a: 0.001, d: 0.02, vel: 0.1, dest: m.bus.fx, pan });
    if (i % 2) noise(m, { t: T + i * 0.024, d: 0.015, vel: 0.12, dest: m.bus.fx, kind: "highpass", f: 4000 + rnd(seed, i + 40) * 4000, pan: -pan });
  }
};
const tick = (m: Mixer, T: number, f: number, pan: number, vel: number) => voice(m, { f, t: T, a: 0.001, d: 0.035, vel, dest: m.bus.fx, pan, send: 0.2 });
const crackle = (m: Mixer, T0: number, count: number, seed: number, spread: number, vel: number) => {
  for (let i = 0; i < count; i++) {
    const tt = T0 + Math.pow(rnd(seed, i * 3), 1.8) * spread;
    noise(m, { t: tt, d: 0.008 + rnd(seed, i * 3 + 1) * 0.01, vel: vel * (0.3 + rnd(seed, i * 3 + 2)), dest: m.bus.fx, kind: "highpass", f: 3500 + rnd(seed, i) * 4000, pan: rnd(seed, i + 500) * 2 - 1, send: 0.1, off: rnd(seed, i + 900) * 3 });
  }
};
const heartbeat = (m: Mixer, T: number) => voice(m, { f: 58, f2: 38, fdur: 0.18, t: T, a: 0.004, d: 0.3, vel: 0.55, dest: m.bus.fx, send: 0.15 });

/* ---------- harmony ---------- */
const ROOT: Record<number, number> = { 2: 55, 3: 43.65, 4: 49, 5: 55, 6: 43.65, 7: 49, 10: 55, 11: 43.65, 12: 49 };
const CHORD: Record<number, number[]> = {
  2: [220, 261.63, 329.63, 440], 3: [174.61, 220, 261.63, 349.23], 4: [196, 246.94, 293.66, 392],
  5: [220, 261.63, 329.63, 440], 6: [174.61, 220, 261.63, 349.23], 7: [196, 246.94, 293.66, 392],
  10: [220, 261.63, 329.63, 440], 11: [174.61, 220, 261.63, 349.23], 12: [196, 246.94, 293.66, 392],
};
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2];
const PADS: Record<number, number[]> = {
  5: [110, 164.81, 220, 261.63], 6: [87.31, 130.81, 174.61, 220], 7: [98, 146.83, 196, 246.94],
};

/* ---------- the score ---------- */
export function schedule(m: Mixer) {
  const c = m.c;

  /* drone bed (continuous) */
  const dg = c.createGain();
  const dl = c.createBiquadFilter();
  dl.type = "lowpass";
  dl.Q.value = 1.2;
  [[55, "sawtooth", 0], [55.28, "sawtooth", 0], [27.5, "sine", 0]].forEach(([f, ty]) => {
    const o = c.createOscillator();
    o.type = ty as OscillatorType;
    o.frequency.value = f as number;
    const og = c.createGain();
    og.gain.value = ty === "sine" ? 0.9 : 0.35;
    o.connect(og);
    og.connect(dl);
    o.start(0);
    o.stop(DURATION);
  });
  dl.connect(dg);
  dg.connect(m.bus.music);
  const lv: [number, number][] = [[0, 0.0001], [0.5, 0.05], [1.45, 0.07], [1.52, 0.16], [4, 0.07], [10, 0.08], [15.45, 0.1], [15.5, 0.0001], [15.98, 0.0001], [16.02, 0.16], [20, 0.12], [24.5, 0.1], [26, 0.07], [29, 0.04], [29.9, 0.0001]];
  dg.gain.setValueAtTime(0.0001, 0);
  lv.forEach(([x, v]) => dg.gain.linearRampToValueAtTime(Math.max(0.0001, v * 0.5), x));
  const cut: [number, number][] = [[0, 180], [1.5, 600], [4, 300], [10, 1100], [15.5, 1800], [16, 900], [20, 2600], [24.5, 700], [26, 500], [30, 300]];
  dl.frequency.setValueAtTime(180, 0);
  cut.forEach(([x, v]) => dl.frequency.linearRampToValueAtTime(v, x));

  /* S1 — IGNITION */
  voice(m, { f: 2600, f2: 700, fdur: 1.1, t: t(24), a: 0.5, d: 0.65, vel: 0.035, dest: m.bus.fx, pan: 0.05, send: 0.3 });
  boom(m, t(90), 2.4, 0.95);
  metal(m, t(90), 210, 0.55);
  crackle(m, t(90), 90, 3, 1.4, 0.14);
  metal(m, t(124), 160, 0.16, -0.2);
  metal(m, t(130), 120, 0.14, 0.2);
  whoosh(m, t(196), 0.5, +1, 0.22, -0.5, 0.6);
  riser(m, t(205), t(240), 0.13);

  /* S2 / S3 — groove (frames 240–900) */
  whoosh(m, t(236), 0.7, -1, 0.2, 0, 0);
  for (let b = 8; b < 30; b++) kick(m, t(b * BEATF), 0.9);
  for (let k = 0; k < (900 - 240) / (BEATF / 2); k++) {
    const f = 240 + k * (BEATF / 2);
    const bar = Math.floor(f / BARF);
    const oct = [1, 1, 2, 1, 1, 2, 1, 1][k % 8];
    bass(m, t(f), (ROOT[bar] ?? 55) * oct, 0.2, 0.34);
  }
  for (let f = 360; f < 900; f += BEATF) {
    const b = f / BEATF;
    hat(m, t(f + BEATF / 2), 0.2, b % 4 === 3, (b % 2 ? 0.2 : -0.2));
    if (b % 4 === 1 || b % 4 === 3) clap(m, t(f), 0.38);
    if (f >= 720) { hat(m, t(f + BEATF / 4), 0.08, false, -0.3); hat(m, t(f + BEATF * 0.75), 0.09, false, 0.3); }
  }
  for (let k = 0; k < (900 - 360) / (BEATF / 4); k++) {
    const f = 360 + k * (BEATF / 4);
    const bar = Math.floor(f / BARF);
    const ch = CHORD[bar];
    if (!ch) continue;
    pluck(m, t(f), ch[ARP[k % 16]] * (bar >= 5 ? 2 : 1), 0.075 + 0.02 * Math.sin(k * 0.4), Math.sin(k * 0.7) * 0.55);
  }
  S2_SCRIPT.forEach((s, i) => {
    const f = 240 + s.lf;
    tick(m, t(f), 1700 + i * 260, i % 2 ? 0.5 : -0.5, 0.2);
    tick(m, t(f + 3), 3400 + i * 260, i % 2 ? -0.4 : 0.4, 0.08);
    whoosh(m, t(f - 3), 0.32, +1, 0.16, i % 2 ? 0.7 : -0.7, i % 2 ? -0.3 : 0.3);
  });
  whoosh(m, t(566), 0.55, +1, 0.45, -0.7, 0.7);

  /* S3 — escalation */
  [5, 6, 7].forEach((bar) => { const T = t(bar * BARF); pad(m, T, PADS[bar], Math.min(2.25, t(930) - T), 0.07); });
  metal(m, t(636), 150, 0.3, -0.4);
  metal(m, t(684), 120, 0.4, 0.2);
  boom(m, t(684), 0.9, 0.35);
  whoosh(m, t(892), 0.6, -1, 0.35, 0.6, 0);
  riser(m, t(840), t(930), 0.34);
  snareRoll(m, t(840), t(930), 0.1, 0.42);
  HEARTBEATS.forEach((h) => heartbeat(m, t(h)));
  riser(m, t(949), t(960), 0.18);

  /* S4 — reveal */
  boom(m, t(960), 3.2, 1.0);
  metal(m, t(960), 140, 0.62);
  metal(m, t(960), 210, 0.4, 0.15);
  noise(m, { t: t(960), d: 1.8, vel: 0.2, dest: m.bus.fx, kind: "highpass", f: 5000, send: 0.35, off: 0.9 });
  crackle(m, t(960), 120, 5, 2.0, 0.15);
  pad(m, t(960), [110, 164.81, 220, 261.63, 329.63, 246.94], 4.2, 0.1, 0.35);
  pad(m, t(1080), [87.31, 130.81, 174.61, 261.63, 220, 196], 2.2, 0.08, 0.6);
  [[990, 440], [1020, 523.25], [1050, 659.25], [1080, 880], [1110, 783.99], [1140, 659.25]].forEach(([f, n], i) => bell(m, t(f), n, 0.2, i % 2 ? 0.4 : -0.4));
  for (let i = 0; i < 9; i++) tick(m, t(994 + i * 3.6), 1800 + i * 130, (i - 4) * 0.12, 0.09);
  whoosh(m, t(1086), 0.7, +1, 0.32, -0.6, 0.6);
  bell(m, t(1096), 1760, 0.12, 0.3);
  riser(m, t(1140), t(1200), 0.4);
  snareRoll(m, t(1165), t(1200), 0.08, 0.4);
  for (let f = 1140; f < 1200; f += BEATF / 4) hat(m, t(f), 0.06 + 0.1 * ((f - 1140) / 60), false, Math.sin(f) * 0.3);

  /* S5 — overdrive (frames 1200–1470 full drop) */
  boom(m, t(1200), 1.4, 0.95);
  noise(m, { t: t(1200), d: 1.4, vel: 0.35, dest: m.bus.fx, kind: "highpass", f: 5200, send: 0.3, off: 2.1 });
  glitch(m, t(1200), 1);
  metal(m, t(1200), 180, 0.35);
  for (let b = 40; b < 49; b++) kick(m, t(b * BEATF), 1.0);
  for (let k = 0; k < (1470 - 1200) / (BEATF / 4); k++) {
    const f = 1200 + k * (BEATF / 4);
    const open = k % 4 === 2;
    hat(m, t(f), open ? 0.22 : k % 2 ? 0.1 : 0.15, open, Math.sin(k) * 0.35);
  }
  for (let f = 1200; f < 1470; f += BEATF) {
    const b = f / BEATF;
    if (b % 4 === 1 || b % 4 === 3) clap(m, t(f), 0.5);
  }
  const SYNC = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
  for (let bar = 10; bar < 13; bar++) for (let k = 0; k < 16; k++) {
    const f = bar * BARF + k * (BEATF / 4);
    if (SYNC[k] && f < 1470) bass(m, t(f), ROOT[bar] * (k === 13 ? 2 : 1), 0.13, 0.5);
  }
  for (let k = 0; k < (1470 - 1320) / (BEATF / 4); k++) {
    const f = 1320 + k * (BEATF / 4);
    const ch = CHORD[Math.floor(f / BARF)];
    if (ch) pluck(m, t(f), ch[ARP[k % 16]] * 2, 0.07, Math.sin(k * 0.9) * 0.6);
  }
  pad(m, t(1320), [110, 164.81, 220, 261.63], 3.0, 0.07, 0.3);
  metal(m, t(1230), 150, 0.5);
  boom(m, t(1230), 0.5, 0.5);
  glitch(m, t(1260), 2); glitch(m, t(1266), 3);
  boom(m, t(1290), 0.7, 0.55);
  bell(m, t(1290), 220, 0.18);
  boom(m, t(1320), 1.2, 0.9);
  whoosh(m, t(1316), 0.3, +1, 0.4, -0.8, 0.8);
  for (let i = 0; i < 14; i++) tick(m, t(1322 + i * 2), 900 + i * 120, 0, 0.07);
  [[1380, 150], [1395, 220], [1410, 330]].forEach(([f, n]) => { metal(m, t(f), n, 0.5); boom(m, t(f), 0.4, 0.45); });
  boom(m, t(1410), 1.4, 1.0);
  crackle(m, t(1410), 150, 9, 1.5, 0.12);
  glitch(m, t(1410), 4); glitch(m, t(1440), 5);
  tick(m, t(1366), 3000, 0, 0.1);
  /* freeze at 1470: tape-stop, then a held pad */
  voice(m, { type: "sawtooth", f: 110, f2: 14, fdur: 0.95, t: t(1470), a: 0.004, d: 0.95, vel: 0.3, dest: m.bus.fx, lp: 900, lpEnd: 120 });
  noise(m, { t: t(1470), d: 0.6, vel: 0.2, dest: m.bus.fx, kind: "lowpass", f: 1800, f2: 80, send: 0.4, off: 3 });
  pad(m, t(1470), [110, 164.81, 220, 261.63, 329.63], 3.0, 0.09, 0.4);
  bell(m, t(1480), 880, 0.14, 0.2);
  whoosh(m, t(1508), 0.9, -1, 0.3, 0.5, -0.5);
  riser(m, t(1500), t(1558), 0.2);

  /* S6 — resolve */
  boom(m, t(1560), 2.8, 0.5);
  pad(m, t(1560), [110, 164.81, 220, 261.63, 329.63, 493.88], 5.4, 0.1, 1.2);
  whoosh(m, t(1584), 1.3, +1, 0.16, -0.4, 0.4);
  [[1590, 440], [1620, 523.25], [1650, 659.25], [1680, 880]].forEach(([f, n], i) => bell(m, t(f), n, 0.24, i % 2 ? 0.35 : -0.35));
  for (let i = 0; i < 9; i++) tick(m, t(1652 + i * 3.5), 1500 + i * 90, (i - 4) * 0.1, 0.05);
  metal(m, t(1672), 130, 0.14);
  bell(m, t(1694), 1318.5, 0.1, 0.2);
  bell(m, t(1710), 220, 0.26, 0);
  voice(m, { f: 55, t: t(1650), a: 0.3, d: 3.6, vel: 0.28, dest: m.bus.music, send: 0.2 });
}

/* ---------- build ---------- */
export async function renderMix(): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * DURATION), SAMPLE_RATE);
  const sum = c.createGain();
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 28; hp.Q.value = 0.6;
  const shelf = c.createBiquadFilter(); shelf.type = "highshelf"; shelf.frequency.value = 9000; shelf.gain.value = -2.5;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -17; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.012; comp.release.value = 0.2;
  const mg = c.createGain();
  mg.gain.setValueAtTime(0.0001, 0);
  mg.gain.exponentialRampToValueAtTime(1, 0.25);
  mg.gain.setValueAtTime(1, 28.9);
  mg.gain.exponentialRampToValueAtTime(0.0001, 29.9);
  sum.connect(hp); hp.connect(shelf); shelf.connect(comp); comp.connect(mg); mg.connect(c.destination);

  const bus = { drums: c.createGain(), music: c.createGain(), fx: c.createGain(), duck: c.createGain() };
  bus.drums.gain.value = 1;
  bus.fx.gain.value = 1;
  bus.music.connect(bus.duck);
  bus.duck.connect(sum);
  bus.drums.connect(sum);
  bus.fx.connect(sum);
  bus.duck.gain.value = 1;

  const conv = c.createConvolver();
  const ir = c.createBuffer(2, Math.floor(c.sampleRate * 3.2), c.sampleRate);
  ir.copyToChannel(makeIR(c, 3.2, 17, 0) as Float32Array<ArrayBuffer>, 0);
  ir.copyToChannel(makeIR(c, 3.2, 17, 1) as Float32Array<ArrayBuffer>, 1);
  conv.buffer = ir;
  const verb = c.createGain(); verb.gain.value = 1;
  const verbRet = c.createGain(); verbRet.gain.setValueAtTime(0.55, 0);
  // visual-silence window (930–960): pull the reverb return down so the dropout is genuinely dry
  verbRet.gain.setValueAtTime(0.55, 15.48); verbRet.gain.linearRampToValueAtTime(0.1, 15.54);
  verbRet.gain.setValueAtTime(0.1, 15.97); verbRet.gain.linearRampToValueAtTime(0.55, 16.04);
  verb.connect(conv); conv.connect(verbRet); verbRet.connect(sum);

  const delay = c.createGain();
  const dL = c.createDelay(2), dR = c.createDelay(2);
  dL.delayTime.value = 0.375; dR.delayTime.value = 0.5625;
  const fb = c.createGain(); fb.gain.value = 0.38;
  const dlp = c.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 3200;
  const merger = c.createChannelMerger(2);
  delay.connect(dL); delay.connect(dR);
  dL.connect(merger, 0, 0); dR.connect(merger, 0, 1);
  merger.connect(dlp); dlp.connect(fb); fb.connect(dL); fb.connect(dR);
  const dRet = c.createGain(); dRet.gain.value = 0.45;
  dlp.connect(dRet); dRet.connect(sum);

  const m: Mixer = { c, noise: makeNoise(c), bus, verb, delay, ducks: [] };
  schedule(m);

  // sidechain-style ducking of the music bus, applied in time order
  m.ducks.sort((a, b) => a.t - b.t);
  let last = -1;
  bus.duck.gain.setValueAtTime(1, 0);
  for (const d of m.ducks) {
    if (d.t <= last + 0.02) continue;
    bus.duck.gain.setValueAtTime(d.depth, d.t);
    bus.duck.gain.linearRampToValueAtTime(1, d.t + d.rel);
    last = d.t + d.rel;
  }
  return c.startRendering();
}
