/** SCENE 1 — IGNITION (frames 0–239). HOOK: one ember falls onto a hairline anvil. */
import { H, W } from "../core/config";
import { TAU, clamp, lerp, rnd } from "../core/math";
import { C, rgb } from "../creative/palette";
import { background, dust, glow, sparks, glowSprite } from "../graphics/fx";
import { E, anticipate, prog, spring, tw } from "../motion/easing";
import { clipRect, display, drawText, label, mono } from "../typography/engine";

type Ctx = CanvasRenderingContext2D;
export const LINE_Y = 1040;
const emberSprite = () => glowSprite(C.ember);
export const IMPACT_F = 90;

export function ignition(ctx: Ctx, f: number) {
  const heat = f >= IMPACT_F ? Math.exp(-(f - IMPACT_F) / 80) : 0;
  background(ctx, W / 2, LINE_Y, 0.15 + heat * 0.9);
  dust(ctx, f, 11, 0.7);

  /* hairline anvil draws out from the centre */
  const lp = tw(f, 8, 46, E.outExpo);
  const half = (W / 2) * lp;
  if (half > 1) {
    const gr = ctx.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
    gr.addColorStop(0, rgb(C.steel, 0));
    gr.addColorStop(0.18, rgb(C.mist, 0.9));
    gr.addColorStop(0.82, rgb(C.mist, 0.9));
    gr.addColorStop(1, rgb(C.steel, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(W / 2 - half, LINE_Y - 1, half * 2, 2);
    if (heat > 0.01) {
      // heat bloom travelling along the line
      const hw = half * (0.35 + 0.65 * (1 - heat));
      const hg = ctx.createLinearGradient(W / 2 - hw, 0, W / 2 + hw, 0);
      hg.addColorStop(0, rgb(C.ember, 0));
      hg.addColorStop(0.5, rgb(C.hot, 1));
      hg.addColorStop(1, rgb(C.ember, 0));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, heat * 1.2);
      ctx.fillStyle = hg;
      ctx.fillRect(W / 2 - hw, LINE_Y - 2.5, hw * 2, 5);
      ctx.globalAlpha = heat * 0.7;
      ctx.translate(W / 2, LINE_Y);
      ctx.scale(hw / 110, 1);
      ctx.drawImage(emberSprite(), -110, -110, 220, 220);
      ctx.restore();
    }
  }

  /* the ember: gravity-accelerated fall with a lateral S-curve and analytic trail */
  if (f >= 24 && f < IMPACT_F + 1) {
    const pos = (ff: number): [number, number] => {
      const u = clamp((ff - 24) / (IMPACT_F - 24));
      return [W / 2 + Math.sin(u * 4.2) * 44 * (1 - u * 0.9), lerp(-60, LINE_Y, u * u)];
    };
    for (let k = 14; k >= 1; k--) {
      const [tx, ty] = pos(f - k * 0.9);
      if (f - k * 0.9 < 24) continue;
      glow(ctx, tx, ty, 26 * (1 - k / 16) + 4, C.ember, Math.pow(1 - k / 15, 2) * 0.7);
    }
    const [ex, ey] = pos(f);
    glow(ctx, ex, ey, 70, C.ember, 0.9);
    glow(ctx, ex, ey, 26, C.gold, 1);
    glow(ctx, ex, ey, 11, [255, 255, 255], 1);
    // tracking readout
    const a = prog(f, 28, 8) * (1 - prog(f, IMPACT_F - 6, 6));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgb(C.bone, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex + 30, ey);
    ctx.lineTo(ex + 78, ey);
    ctx.stroke();
    label(ctx, `Y ${String(Math.round(ey)).padStart(4, "0")}`, ex + 90, ey + 8, { size: 22, color: rgb(C.bone, 0.85) });
    label(ctx, `V ${(((ey + 60) / (LINE_Y + 60)) * 9.8).toFixed(2)}`, ex + 90, ey + 38, { size: 18, color: rgb(C.mist, 1) });
    ctx.restore();
  }

  /* impact: shock ring on the line, light wash, sparks */
  if (f >= IMPACT_F) {
    const t = f - IMPACT_F;
    glow(ctx, W / 2, LINE_Y, 520 * Math.exp(-t / 16) + 90, C.hot, 0.9 * Math.exp(-t / 10));
    glow(ctx, W / 2, LINE_Y, 360, C.ember, 0.7 * Math.exp(-t / 36));
    const rx = 40 + t * 22 * Math.pow(0.992, t);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgb(C.gold, 0.9 * Math.exp(-t / 20));
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, LINE_Y, rx, rx * 0.06, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    sparks(ctx, { seed: 7, count: 300, ox: W / 2, oy: LINE_Y - 4, t });
    sparks(ctx, { seed: 19, count: 90, ox: W / 2, oy: LINE_Y - 4, t, fan: [-Math.PI * 0.99, -Math.PI * 0.01], speed: 0.45, width: 2 });
  }

  /* ONE / SPARK. — standing on the line */
  const size = 290;
  const lines = [
    { text: "ONE", base: LINE_Y - 24 - 276, d0: 0 },
    { text: "SPARK.", base: LINE_Y - 24, d0: 6 },
  ];
  for (const ln of lines) {
    const gr = ctx.createLinearGradient(0, ln.base - size * 0.8, 0, ln.base);
    const h = Math.min(1, heat * 1.15);
    gr.addColorStop(0, rgb(C.bone));
    gr.addColorStop(0.55, rgb(C.bone));
    gr.addColorStop(1, rgb([lerp(C.bone[0], C.gold[0], h), lerp(C.bone[1], C.gold[1], h * 0.9), lerp(C.bone[2], C.molten[2], h)]));
    clipRect(ctx, 40, ln.base - size * 1.08, W - 80, size * 1.08 + 11, () =>
      drawText(ctx, ln.text, {
        x: 72, y: ln.base, font: display(size), size, fill: gr, tracking: 0.005,
        fx: (i) => {
          const inT = 118 + ln.d0 + i * 3.4;
          const enter = spring((f - inT) / 60, 2.4, 0.55);
          const out = anticipate(prog(f, 196 + ln.d0 + i * 2.2, 30), 0.06);
          return { dy: (1 - enter) * size * 1.2 - out * size * 1.3 };
        },
      }),
    );
  }

  /* caption typed on */
  const cap = ["EVERY FILM BEGINS", "AS A SINGLE POINT OF LIGHT."];
  const typed = Math.floor(prog(f, 150, 40) * (cap[0].length + cap[1].length));
  const capA = 1 - prog(f, 206, 20);
  ctx.save();
  ctx.globalAlpha = capA;
  label(ctx, cap[0].slice(0, typed), 72, LINE_Y + 70, { size: 28, color: rgb(C.bone, 0.9), track: 0.16 });
  if (typed > cap[0].length) label(ctx, cap[1].slice(0, typed - cap[0].length), 72, LINE_Y + 116, { size: 28, color: rgb(C.bone, 0.9), track: 0.16 });
  if (typed > 0 && typed < 44 && Math.floor(f / 8) % 2 === 0) {
    ctx.fillStyle = rgb(C.ember);
    ctx.fillRect(72 + (typed <= cap[0].length ? typed : typed - cap[0].length) * 21.5, (typed <= cap[0].length ? LINE_Y + 70 : LINE_Y + 116) - 24, 12, 28);
  }
  ctx.restore();

  void H; void mono; void rnd;
}
