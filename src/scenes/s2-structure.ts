/** SCENE 2 — STRUCTURE (frames 240–599). DEVELOPMENT: the hairline becomes a horizon; shapes are forged from a line. */
import { H, W } from "../core/config";
import { TAU, clamp, lerp, mod } from "../core/math";
import { C, rgb } from "../creative/palette";
import { background, dust, glow, morph, polarShape, strokePoly } from "../graphics/fx";
import { E, prog, spring, tw } from "../motion/easing";
import { display, label } from "../typography/engine";
import { kineticWord } from "../typography/kinetic";
import { S2_SCRIPT, S2_WIPE } from "../core/timeline";
import { LINE_Y } from "./s1-ignition";

type Ctx = CanvasRenderingContext2D;
export const S2_START = 240;
export const SHAPE_C: [number, number] = [W / 2, 790];
export const SHAPE_R = 215;

const FOCAL = 800, CAMH = 1;
const shapeCache = new Map<number, [number, number][]>();
const shape = (sides: number): [number, number][] => {
  let s = shapeCache.get(sides);
  if (!s) {
    s = polarShape(sides, sides === 0 ? 0 : 1, SHAPE_R);
    shapeCache.set(sides, s);
  }
  return s;
};

function floorGrid(ctx: Ctx, lf: number) {
  const reveal = tw(lf, 0, 54, E.outQuint);
  const zReveal = lerp(48, 0.9, reveal);
  const stepZ = 0.5;
  const scroll = (lf * 0.016) % stepZ;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // verticals (constant X)
  const xs = 0.16;
  for (let k = -11; k <= 11; k++) {
    const X = k * xs;
    const far = 48;
    const near = FOCAL * CAMH / (H - LINE_Y);
    const x0 = W / 2 + (FOCAL * X) / far, y0 = LINE_Y + (FOCAL * CAMH) / far;
    const x1 = W / 2 + (FOCAL * X) / near, y1 = H + 4;
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    const major = k % 4 === 0;
    const col = k === 0 ? C.cyan : major ? C.ember : C.steel;
    gr.addColorStop(0, rgb(col, 0));
    gr.addColorStop(0.25, rgb(col, (major ? 0.55 : 0.5) * reveal));
    gr.addColorStop(1, rgb(col, (major ? 0.9 : 0.75) * reveal));
    ctx.strokeStyle = gr;
    ctx.lineWidth = k === 0 ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // horizontals (constant Z), scrolling toward the viewer
  for (let k = 0; k < 90; k++) {
    const z = 0.9 + k * stepZ - scroll;
    if (z < 0.9 || z > 48 || z < zReveal) continue;
    const y = LINE_Y + (FOCAL * CAMH) / z;
    if (y > H + 2) continue;
    const idx = Math.floor((lf * 0.016 - scroll) / stepZ) + k;
    const major = idx % 4 === 0;
    const a = clamp(1.15 - (z - 0.9) / 24) * (major ? 0.95 : 0.55);
    ctx.strokeStyle = rgb(major ? C.ember : C.steel, a);
    ctx.lineWidth = clamp(2.2 / Math.sqrt(z) + 0.4, 0.5, 2.4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function currentBeat(lf: number) {
  let i = -1;
  for (let k = 0; k < S2_SCRIPT.length; k++) if (lf >= S2_SCRIPT[k].lf) i = k;
  return i;
}

export function structure(ctx: Ctx, f: number) {
  const lf = f - S2_START;
  background(ctx, W / 2, LINE_Y, 0.55 - 0.25 * prog(lf, 0, 60), C.ink, C.ember);
  dust(ctx, f, 23, 0.55, 40);

  /* horizon hairline + glow, carried over from Scene 1 */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const hg = ctx.createLinearGradient(0, LINE_Y - 120, 0, LINE_Y + 40);
  hg.addColorStop(0, rgb(C.ember, 0));
  hg.addColorStop(1, rgb(C.ember, 0.22 + 0.1 * Math.sin(lf * 0.05)));
  ctx.fillStyle = hg;
  ctx.fillRect(0, LINE_Y - 120, W, 160);
  ctx.restore();
  floorGrid(ctx, lf);
  const hl = ctx.createLinearGradient(0, 0, W, 0);
  hl.addColorStop(0, rgb(C.steel, 0));
  hl.addColorStop(0.18, rgb(C.mist, 0.9));
  hl.addColorStop(0.82, rgb(C.mist, 0.9));
  hl.addColorStop(1, rgb(C.steel, 0));
  ctx.fillStyle = hl;
  ctx.fillRect(0, LINE_Y - 1, W, 2);

  /* shape morph (pointwise): dot → line → circle → square → triangle → disc */
  const bi = currentBeat(lf);
  const wipe = tw(lf, S2_WIPE.start, S2_WIPE.dur, E.inQuint);
  if (bi >= 0) {
    const cur = S2_SCRIPT[bi];
    const prev = bi === 0 ? null : S2_SCRIPT[bi - 1];
    const m = tw(lf, cur.lf, 34, E.snap);
    const target = shape(cur.sides);
    const from = prev ? shape(prev.sides) : shape(0).map((p) => [p[0] * 0.0, 0] as [number, number]);
    const pts = morph(from, target, m);
    const [cx, cy] = SHAPE_C;
    const isDisc = bi === S2_SCRIPT.length - 1;
    const discFill = isDisc ? tw(lf, cur.lf + 14, 40, E.cinema) : 0;
    const growR = 1 + wipe * 6.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(growR, growR);
    ctx.translate(-cx, -cy);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    strokePoly(ctx, pts, cx, cy);
    ctx.strokeStyle = rgb(C.cyan, 0.2);
    ctx.lineWidth = 16 / growR;
    ctx.stroke();
    ctx.restore();
    strokePoly(ctx, pts, cx, cy);
    if (discFill > 0.001) {
      const dg = ctx.createRadialGradient(cx, cy - 60, 10, cx, cy, SHAPE_R);
      dg.addColorStop(0, rgb(C.hot, discFill));
      dg.addColorStop(0.45, rgb(C.molten, discFill));
      dg.addColorStop(1, rgb(C.ember, discFill));
      ctx.fillStyle = dg;
      ctx.fill();
    }
    ctx.strokeStyle = rgb(isDisc ? C.hot : C.cyan, 1);
    ctx.lineWidth = 3.5 / growR;
    ctx.stroke();
    ctx.restore();

    /* compass ring with rotating ticks */
    const ringA = (1 - wipe) * tw(lf, 24, 30);
    ctx.save();
    ctx.globalAlpha = ringA;
    ctx.translate(cx, cy);
    ctx.rotate(lf * 0.004);
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU;
      const long = i % 5 === 0;
      const r0 = SHAPE_R + 62, r1 = r0 + (long ? 24 : 11);
      ctx.strokeStyle = rgb(long ? C.bone : C.mist, long ? 0.8 : 0.45);
      ctx.lineWidth = long ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();

    /* vertex markers (only after the morph settles) */
    if (cur.sides > 0 && cur.sides < 40 && m > 0.7) {
      const sc = spring((lf - cur.lf - 24) / 60, 3, 0.45);
      ctx.save();
      ctx.globalAlpha = 1 - wipe;
      for (let j = 0; j < cur.sides; j++) {
        const a = -Math.PI / 2 + (cur.sides === 4 ? Math.PI / 4 : 0) + (j / cur.sides) * TAU;
        const x = cx + Math.cos(a) * SHAPE_R, y = cy + Math.sin(a) * SHAPE_R;
        ctx.fillStyle = rgb(C.bone);
        const s = 11 * Math.max(0, sc);
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
        ctx.fillStyle = rgb(C.ink);
        ctx.fillRect(x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9);
      }
      ctx.restore();
    }

    /* the ember rides the perimeter */
    const u = mod(lf * 0.007, 1);
    const idx = Math.floor(u * pts.length);
    const ep = pts[idx];
    glow(ctx, cx + ep[0], cy + ep[1], 60, C.ember, 0.85 * (1 - wipe));
    glow(ctx, cx + ep[0], cy + ep[1], 18, [255, 255, 255], 1 - wipe);

    /* data diagram: leader + readouts */
    const dA = tw(lf, cur.lf + 18, 20) * (1 - prog(lf, (S2_SCRIPT[bi + 1]?.lf ?? 330) - 14, 10)) * (1 - wipe);
    if (dA > 0.01) {
      ctx.save();
      ctx.globalAlpha = dA;
      const ax = cx + SHAPE_R * 0.74, ay = cy - SHAPE_R * 0.74;
      ctx.strokeStyle = rgb(C.bone, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 90, ay - 90);
      ctx.lineTo(W - 72, ay - 90);
      ctx.stroke();
      const nv = cur.sides === 0 ? 2 : cur.sides >= 40 ? 0 : cur.sides;
      label(ctx, `N = ${nv === 0 ? "∞" : nv}`.replace("∞", "INF"), W - 72, ay - 150, { size: 26, align: "right", color: rgb(C.bone, 0.95) });
      label(ctx, cur.sides === 0 ? "ONE DIMENSION" : cur.sides >= 40 ? "CONTINUOUS CURVE" : `${nv} VERTICES / ${nv} EDGES`, W - 72, ay - 118, { size: 18, align: "right", color: rgb(C.mist, 1) });
      label(ctx, `θ = ${(cur.sides > 0 && cur.sides < 40 ? 180 - 360 / cur.sides : cur.sides === 0 ? 180 : 180).toFixed(1)}°`, W - 72, ay - 98, { size: 18, align: "right", color: rgb(C.cyan, 1) });
      ctx.restore();
    }
  }

  /* kinetic words — five different choreographies */
  const wordA = 1 - wipe;
  if (wordA > 0.01) {
    ctx.save();
    ctx.globalAlpha = wordA;
    for (let k = 0; k < S2_SCRIPT.length; k++) {
      const b = S2_SCRIPT[k];
      const next = S2_SCRIPT[k + 1]?.lf ?? S2_WIPE.start + 4;
      const t = lf - b.lf;
      const o = prog(lf, next - 12, 12);
      if (t < 0 || o >= 1) continue;
      const fill = k === S2_SCRIPT.length - 1 ? rgb(C.gold) : rgb(C.bone);
      kineticWord(ctx, b.word, b.style, t, o, { x: 72, y: 450, size: k === 3 ? 215 : 235, fill, accent: rgb(C.cyan), seed: 5 + k, tracking: 0.004 });
    }
    ctx.restore();

    /* chapter rail */
    ctx.save();
    ctx.globalAlpha = wordA * tw(lf, 20, 20);
    S2_SCRIPT.forEach((b, i) => {
      const active = i === bi;
      const y = 1300 + i * 52;
      label(ctx, b.label, 72, y, { size: 22, color: active ? rgb(C.ember) : rgb(C.mist, 0.8) });
      ctx.fillStyle = active ? rgb(C.ember) : rgb(C.steel, 1);
      ctx.fillRect(122, y - 8, active ? 64 : 24, 2);
    });
    ctx.restore();
  }
  void display;
}
