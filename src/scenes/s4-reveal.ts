/** SCENE 4 — REVEAL (frames 960–1199). The ember detonates into a chrome lemniscate; the title is forged. */
import { H, W } from "../core/config";
import { TAU, lerp, rnd } from "../core/math";
import { C, rgb } from "../creative/palette";
import { background, dust, glow, lemniscate, sparks } from "../graphics/fx";
import { E, prog, springF, tw } from "../motion/easing";
import { clipRect, display, drawText, extrude, label, layer, perspectiveWarp, tintedSide } from "../typography/engine";
import { chromeShader, meshPolys, paintPolys, project, tube, type Cam, type Poly, type V3 } from "../three/g3";
import { OBJ_C } from "./s3-depth";

type Ctx = CanvasRenderingContext2D;
export const S4_START = 960;
const A = 1.9;
const SEGS = 300;
const curve = (u: number): V3 => {
  const t = u + 0.25;
  const [x, y] = lemniscate(t, A);
  return [x, y, 0.36 * Math.sin(t * TAU)];
};
const emblem = tube(curve, SEGS, 36, 0.17, 0.13, true);
const chrome = chromeShader(1);

export function reveal(ctx: Ctx, f: number) {
  const lf = f - S4_START;
  const tension = lf > 190 ? (lf - 190) / 50 : 0;
  background(ctx, W / 2, 900, 0.35 + 0.25 * Math.exp(-lf / 30) + tension * 0.5, [8, 8, 11], C.ember);
  dust(ctx, f, 47, 0.7, 50);
  const [cx, cy] = OBJ_C;

  /* detonation: radial speed lines, shock rings, sparks */
  if (lf >= 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 64; i++) {
      const ang = rnd(61, i) * TAU;
      const r0 = 40 + lf * (40 + rnd(61, i + 90) * 60);
      const len = 80 + rnd(61, i + 200) * 320;
      ctx.strokeStyle = rgb(i % 5 === 0 ? C.cyan : C.gold, Math.exp(-lf / 13) * 0.85);
      ctx.lineWidth = 2 + rnd(61, i + 300) * 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
      ctx.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const r = (lf - k * 4) * (34 - k * 10);
      if (r > 0) {
        ctx.strokeStyle = rgb(k ? C.ember : C.hot, Math.exp(-lf / (22 + k * 10)));
        ctx.lineWidth = 7 - k * 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
    glow(ctx, cx, cy, 700 * Math.exp(-lf / 18) + 120, C.hot, 0.85 * Math.exp(-lf / 9));
    sparks(ctx, { seed: 101, count: 360, ox: cx, oy: cy, t: lf, fan: [0, TAU], gravity: 500, speed: 1.2, life: 2.0 });
  }

  /* emblem */
  const grow = E.cinema(prog(lf, 2, 70));
  const spring = springF(lf, 6, 0.9, 0.45);
  const yawM = (1 - spring) * 2.9 + Math.sin(lf * 0.02) * 0.2 + Math.pow(Math.max(0, lf - 195), 2) * 0.0016;
  const cam: Cam = { yaw: 0, pitch: 0.1, dist: 6.3 - 0.6 * prog(lf, 0, 200), focal: 1100, cx, cy };
  const model = { rot: [0.12 * Math.sin(lf * 0.017), yawM, 0] as V3, pos: [0, 0, 0] as V3, scale: 1 };
  // aura along the visible part of the path
  const nGlow = 28;
  for (let i = 0; i < nGlow; i++) {
    const u = (i / nGlow) * grow;
    const c = curve(u);
    const w = [c[0], c[1], c[2]] as V3;
    const cr = Math.cos(model.rot[1]), sr = Math.sin(model.rot[1]);
    const rotated = project(cam, [w[0] * cr + w[2] * sr, w[1], -w[0] * sr + w[2] * cr]);
    glow(ctx, rotated[0], rotated[1], 120, C.ember, (0.17 + tension * 0.2) * Math.min(1, lf / 8));
  }
  if (grow > 0.002) {
    const polys: Poly[] = [];
    meshPolys(emblem, model, cam, { shader: chrome, tagMax: Math.floor(SEGS * grow) }, polys);
    paintPolys(ctx, polys);
    // glowing head
    const hu = Math.max(0.0001, grow - 0.003);
    const hp = curve(hu);
    const cr = Math.cos(model.rot[1]), sr = Math.sin(model.rot[1]);
    const hs = project(cam, [hp[0] * cr + hp[2] * sr, hp[1], -hp[0] * sr + hp[2] * cr]);
    const ha = 1 - prog(lf, 60, 24);
    glow(ctx, hs[0], hs[1], 90, C.ember, 0.9 * ha);
    glow(ctx, hs[0], hs[1], 26, [255, 255, 255], ha);
  }

  /* title: extruded, turning in perspective, with a specular sweep */
  const CH = 340, y0 = 330, size = 214;
  const face = layer("t4-face", W, CH);
  const g = face.getContext("2d")!;
  const gr = g.createLinearGradient(0, 40, 0, 270);
  gr.addColorStop(0, rgb(C.hot));
  gr.addColorStop(0.55, rgb(C.bone));
  gr.addColorStop(1, rgb([225, 200, 170]));
  clipRect(g, 0, 20, W, 270, () =>
    drawText(g, "TOONFORGE", {
      x: W / 2, y: 250, font: display(size), size, fill: gr, align: "center", tracking: 0.012,
      fx: (i) => ({ dy: (1 - tw(lf, 34 + i * 3.6, 34, E.cinema)) * 320 }),
    }),
  );
  const sweepX = lerp(-300, W + 300, tw(lf, 128, 42, E.snap));
  if (lf >= 126 && lf <= 172) {
    g.save();
    g.globalCompositeOperation = "source-atop";
    const sg = g.createLinearGradient(sweepX - 90, 0, sweepX + 90, 110);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,248,235,1)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sg;
    g.fillRect(0, 0, W, CH);
    g.restore();
  }
  const rotY = Math.sin(lf * 0.021) * 0.15 * tw(lf, 60, 60, E.cinema);
  const warped = perspectiveWarp(face, 0.03, rotY, 1700, "t4");
  const side = tintedSide(warped, "t4-side", "rgb(200,72,20)", "rgb(70,20,8)");
  const ex = tw(lf, 40, 40, E.cinema);
  extrude(ctx, warped, side, 0, y0, (14 + rotY * 110) * ex, 24 * ex, 26, 0.03);
  glow(ctx, W / 2, y0 + 230, 600, C.ember, 0.08 * ex);

  /* descriptor + hairline rules */
  const rule = tw(lf, 76, 46, E.outExpo);
  ctx.fillStyle = rgb(C.bone, 0.7);
  ctx.fillRect(W / 2 - 468 * rule, 676, 936 * rule, 2);
  const text = "THE PROCEDURAL MOTION PICTURE STUDIO";
  const n = Math.floor(prog(lf, 92, 44) * text.length);
  label(ctx, text.slice(0, n), W / 2 + 0, 732, { size: 26, align: "center", track: 0.22, color: rgb(C.bone, 0.9) });

  /* parametric readout below the emblem */
  const ra = tw(lf, 70, 30) * (1 - tw(lf, 200, 20));
  ctx.save();
  ctx.globalAlpha = ra;
  label(ctx, "r² = a² · cos 2θ", 72, 1600, { size: 26, color: rgb(C.bone, 0.9) });
  label(ctx, `a = ${A.toFixed(2)}`, 72, 1640, { size: 20, color: rgb(C.mist, 1) });
  label(ctx, `θ = ${(grow * 360).toFixed(1).padStart(5, "0")}°`, W - 72, 1600, { size: 26, align: "right", color: rgb(C.cyan, 1) });
  label(ctx, "LEMNISCATE OF BERNOULLI", W - 72, 1640, { size: 20, align: "right", color: rgb(C.mist, 1) });
  ctx.restore();

  /* tension: heartbeat ring just before the cut */
  if (tension > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgb(C.gold, 0.6 * tension);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 420 - tension * 120 + ((lf % 10) * 4), 0, TAU);
    ctx.stroke();
    ctx.restore();
    glow(ctx, cx, cy, 500, C.ember, 0.3 * tension);
  }
  void H;
}
