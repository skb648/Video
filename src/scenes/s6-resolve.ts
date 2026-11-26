/** SCENE 6 — RESOLVE (frames 1560–1799). RESOLUTION: quiet lock-up; the emblem is drawn in a single line. */
import { W } from "../core/config";
import { mod } from "../core/math";
import { C, rgb } from "../creative/palette";
import { background, dust, glow, lemniscate } from "../graphics/fx";
import { E, prog, tw } from "../motion/easing";
import { clipRect, display, drawText, label } from "../typography/engine";

type Ctx = CanvasRenderingContext2D;
export const S6_START = 1560;
const N = 260;
const pts: [number, number][] = Array.from({ length: N + 1 }, (_, i) => lemniscate(i / N + 0.25, 280));

export function resolve(ctx: Ctx, f: number) {
  const lf = f - S6_START;
  const cx = W / 2, cy = 690;
  background(ctx, cx, 1250, 0.35 * tw(lf, 0, 60), C.ink, C.ember);
  dust(ctx, f, 59, 0.5 * tw(lf, 0, 40), 36);

  /* single-line infinity draw-on */
  const p = tw(lf, 24, 100, E.inOutCubic);
  const k = Math.floor(p * N);
  if (k > 1) {
    const path = new Path2D();
    for (let i = 0; i <= k; i++) {
      const x = cx + pts[i][0], y = cy + pts[i][1];
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    const gr = ctx.createLinearGradient(cx - 290, 0, cx + 290, 0);
    gr.addColorStop(0, rgb(C.ember));
    gr.addColorStop(0.5, rgb(C.gold));
    gr.addColorStop(1, rgb(C.ember));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgb(C.ember, 0.22);
    ctx.lineWidth = 34;
    ctx.stroke(path);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = gr;
    ctx.lineWidth = 13;
    ctx.stroke(path);
    ctx.strokeStyle = rgb(C.hot, 0.55);
    ctx.lineWidth = 3;
    ctx.stroke(path);
    ctx.restore();
    const hx = cx + pts[k][0], hy = cy + pts[k][1];
    const headA = 1 - prog(lf, 118, 20);
    glow(ctx, hx, hy, 100, C.ember, 0.9 * headA);
    glow(ctx, hx, hy, 24, [255, 255, 255], headA);
    // after completion an ember circulates slowly
    if (lf > 120) {
      const u = mod((lf - 120) * 0.0045, 1);
      const i = Math.floor(u * N);
      glow(ctx, cx + pts[i][0], cy + pts[i][1], 54, C.ember, 0.6 * tw(lf, 120, 30));
      glow(ctx, cx + pts[i][0], cy + pts[i][1], 14, C.hot, 0.9 * tw(lf, 120, 30));
    }
  }

  /* wordmark */
  const size = 150;
  clipRect(ctx, 0, 880, W, 230, () =>
    drawText(ctx, "TOONFORGE", {
      x: cx, y: 1040, font: display(size), size, fill: rgb(C.bone), align: "center", tracking: 0.12,
      fx: (i) => ({ dy: (1 - tw(lf, 92 + i * 3.5, 34, E.cinema)) * 210 }),
    }),
  );

  /* hairline callback to Scene 1 with a breathing ember */
  const hw = 468 * tw(lf, 112, 50, E.outExpo);
  if (hw > 1) {
    const hg = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
    hg.addColorStop(0, rgb(C.steel, 0));
    hg.addColorStop(0.2, rgb(C.mist, 0.9));
    hg.addColorStop(0.8, rgb(C.mist, 0.9));
    hg.addColorStop(1, rgb(C.steel, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(cx - hw, 1111, hw * 2, 2);
    const br = 0.5 + 0.5 * Math.sin(lf * 0.06);
    glow(ctx, cx, 1112, 40 + 14 * br, C.ember, 0.9);
    glow(ctx, cx, 1112, 10, [255, 255, 255], 1);
  }

  /* tagline */
  ctx.save();
  ctx.globalAlpha = tw(lf, 134, 26);
  label(ctx, "FORGE MOTION.", cx, 1196, { size: 36, align: "center", color: rgb(C.bone, 1), track: 0.34 });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = tw(lf, 148, 26) * 0.9;
  label(ctx, "ONE FRAME AT A TIME.", cx, 1250, { size: 24, align: "center", color: rgb(C.mist, 1), track: 0.34 });
  ctx.restore();

  /* spec row */
  const specs = ["1080×1920", "60 FPS", "H.264", "REC.709"];
  specs.forEach((s, i) => {
    const a = tw(lf, 160 + i * 6, 20);
    const x = 72 + i * 234;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = rgb(C.ember);
    ctx.fillRect(x, 1480, 28, 3);
    label(ctx, s, x, 1526, { size: 22, color: rgb(C.bone, 0.9), track: 0.1 });
    ctx.restore();
  });
  void display;
}
