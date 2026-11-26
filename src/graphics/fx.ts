/** 2D graphics toolbox: glow sprites, ballistic sparks, dust, bg, HUD, morphing shapes, infinity path. */
import { BAR, FPS, H, TOTAL_FRAMES, W, timecode } from "../core/config";
import { TAU, clamp, lerp, mod, rnd, type RGB } from "../core/math";
import { C, heat, rgb } from "../creative/palette";
import { label } from "../typography/engine";
import { SCENES, sceneAt } from "../core/timeline";
import { E, prog } from "../motion/easing";

type Ctx = CanvasRenderingContext2D;

/* ---------- glow sprites (cached radial gradients, additive) ---------- */
const sprites = new Map<string, HTMLCanvasElement>();
export function glowSprite(c: RGB) { return sprite(c); }
function sprite(c: RGB): HTMLCanvasElement {
  const key = c.join(",");
  let s = sprites.get(key);
  if (!s) {
    s = document.createElement("canvas");
    s.width = s.height = 256;
    const g = s.getContext("2d")!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, rgb(c, 1));
    gr.addColorStop(0.18, rgb(c, 0.55));
    gr.addColorStop(0.5, rgb(c, 0.12));
    gr.addColorStop(1, rgb(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    sprites.set(key, s);
  }
  return s;
}
export function glow(ctx: Ctx, x: number, y: number, r: number, c: RGB, a = 1) {
  if (a <= 0.003 || r <= 0.5) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = clamp(a, 0, 1) * ctx.globalAlpha;
  ctx.drawImage(sprite(c), x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/* ---------- background ---------- */
export function background(ctx: Ctx, gx: number, gy: number, strength: number, base: RGB = C.ink, tint: RGB = C.ember) {
  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, W, H);
  if (strength > 0.002) glow(ctx, gx, gy, 1200, tint, strength * 0.28);
}

export function dust(ctx: Ctx, f: number, seed: number, alpha = 1, count = 54) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const sp = 6 + rnd(seed, i * 5 + 2) * 22;
    const x = mod(rnd(seed, i * 5) * W + Math.sin(f * 0.01 * (0.5 + rnd(seed, i * 5 + 4)) + i) * 40, W);
    const y = mod(rnd(seed, i * 5 + 1) * H - (f / FPS) * sp, H);
    const tw = 0.5 + 0.5 * Math.sin(f * 0.05 + i * 1.7);
    const r = 0.8 + rnd(seed, i * 5 + 3) * 1.8;
    ctx.fillStyle = rgb(C.hot, (0.1 + 0.3 * tw) * alpha);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- ballistic spark field: analytic, drag + gravity, motion streaks ---------- */
export interface SparkOpts { seed: number; count: number; ox: number; oy: number; t: number; fan?: [number, number]; speed?: number; gravity?: number; life?: number; width?: number }
export function sparks(ctx: Ctx, o: SparkOpts) {
  const ts = o.t / FPS;
  if (ts <= 0) return;
  const BUCKETS = 8;
  const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
  const used = new Array(BUCKETS).fill(false);
  const [a0, a1] = o.fan ?? [-Math.PI * 0.95, -Math.PI * 0.05];
  const g = o.gravity ?? 1500;
  for (let i = 0; i < o.count; i++) {
    const ang = lerp(a0, a1, rnd(o.seed, i * 4));
    const sp = (180 + Math.pow(rnd(o.seed, i * 4 + 1), 2.2) * 1700) * (o.speed ?? 1);
    const k = 1.6 + rnd(o.seed, i * 4 + 2) * 2.6;
    const life = (o.life ?? 1.6) * (0.35 + rnd(o.seed, i * 4 + 3) * 0.65);
    if (ts > life) continue;
    const pos = (t: number): [number, number] => {
      const d = (1 - Math.exp(-k * t)) / k;
      return [o.ox + Math.cos(ang) * sp * d, o.oy + Math.sin(ang) * sp * d + 0.5 * g * t * t * 0.55];
    };
    const [x1, y1] = pos(ts);
    const [x0, y0] = pos(Math.max(0, ts - 0.03));
    const age = ts / life;
    const b = Math.min(BUCKETS - 1, Math.floor(age * BUCKETS));
    paths[b].moveTo(x0, y0);
    paths[b].lineTo(x1, y1);
    used[b] = true;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let b = 0; b < BUCKETS; b++) {
    if (!used[b]) continue;
    const age = (b + 0.5) / BUCKETS;
    ctx.strokeStyle = rgb(heat(1 - age * 0.85), Math.pow(1 - age, 1.3));
    ctx.lineWidth = (o.width ?? 3) * (1 - age * 0.5);
    ctx.stroke(paths[b]);
  }
  ctx.restore();
}

/* ---------- morphing outlines (pointwise, polar) ---------- */
export function polarShape(sides: number, squashY: number, R: number, N = 180): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU - Math.PI / 2;
    let r = R;
    if (sides > 0 && sides < 40) {
      const seg = TAU / sides;
      const phase = sides === 4 ? seg / 2 : 0; // squares sit axis-aligned
      const a = mod(th + Math.PI / 2 - phase, seg) - seg / 2;
      r = (R * Math.cos(seg / 2)) / Math.cos(a);
    }
    pts.push([Math.cos(th) * r, Math.sin(th) * r * squashY]);
  }
  return pts;
}
export function morph(a: [number, number][], b: [number, number][], t: number): [number, number][] {
  return a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]);
}
export function strokePoly(ctx: Ctx, pts: [number, number][], cx: number, cy: number) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(cx + p[0], cy + p[1]) : ctx.moveTo(cx + p[0], cy + p[1])));
  ctx.closePath();
}

/* ---------- lemniscate of Bernoulli ---------- */
export function lemniscate(u: number, a: number): [number, number] {
  const t = u * TAU;
  const d = 1 + Math.sin(t) * Math.sin(t);
  return [(a * Math.cos(t)) / d, (a * Math.sin(t) * Math.cos(t)) / d];
}

/* ---------- editorial HUD (timecode, scene tag, progress) ---------- */
export function hud(ctx: Ctx, f: number, alpha: number) {
  if (alpha <= 0.01) return;
  const sc = sceneAt(f);
  ctx.save();
  ctx.globalAlpha = alpha;
  label(ctx, timecode(f), 72, 112, { size: 24, color: rgb(C.bone, 0.75), track: 0.1 });
  label(ctx, `${String(sc.index).padStart(2, "0")} / ${sc.name}`, W - 72, 112, { size: 24, color: rgb(C.bone, 0.75), align: "right", track: 0.14 });
  // progress hairline with scene ticks
  const y = 1776, x0 = 72, x1 = W - 72;
  ctx.fillStyle = rgb(C.bone, 0.18);
  ctx.fillRect(x0, y, x1 - x0, 2);
  ctx.fillStyle = rgb(C.ember, 1);
  ctx.fillRect(x0, y - 1, (x1 - x0) * (f / TOTAL_FRAMES), 4);
  ctx.fillStyle = rgb(C.bone, 0.55);
  for (const s of SCENES) ctx.fillRect(x0 + ((x1 - x0) * s.start) / TOTAL_FRAMES, y - 7, 2, 16);
  label(ctx, "TOONFORGE", 72, 1822, { size: 20, color: rgb(C.bone, 0.5), track: 0.3 });
  label(ctx, `F ${String(Math.floor(f)).padStart(4, "0")}/${TOTAL_FRAMES}`, W - 72, 1822, { size: 20, color: rgb(C.bone, 0.5), align: "right", track: 0.14 });
  ctx.restore();
}

export const hudAlpha = (f: number): number => {
  const fadeIn = prog(f, 36, 20);
  if (f < 960) return fadeIn * (f > 900 ? 1 - prog(f, 900, 16) : 1);
  if (f < 1200) return E.outCubic(prog(f, 1100, 40)) * 0.9;
  if (f < 1560) return 0.9;
  return 0.8 * (1 - prog(f, 1700, 30));
};

export { BAR };
