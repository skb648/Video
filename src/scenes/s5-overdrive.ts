/** SCENE 5 — OVERDRIVE (frames 1200–1559). CLIMAX: one word per beat, bg flips, tunnel rush, manifesto, time-remap freeze. */
import { H, TOTAL_FRAMES, W } from "../core/config";
import { TAU, lerp, mod, rnd } from "../core/math";
import { C, rgb } from "../creative/palette";
import { background, glow, sparks } from "../graphics/fx";
import { E, prog, tw } from "../motion/easing";
import { display, drawText, extrude, label, layer, mono, perspectiveWarp, tintedSide } from "../typography/engine";
import { S5_SCRIPT } from "../core/timeline";

type Ctx = CanvasRenderingContext2D;
export const S5_START = 1200;

/** Time remap: runs 1:1 until lf 270, decelerates to a stop by lf 330. */
const remapT = (lf: number) => (lf < 270 ? lf : lf < 330 ? 270 + 20 * (1 - Math.pow(1 - (lf - 270) / 60, 3)) : 290);

function tunnel(ctx: Ctx, tt: number, a: number) {
  if (a <= 0.01) return;
  const cx = W / 2, cy = 960;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const fr = mod(tt * 0.05, 1);
  for (let k = 27; k >= 0; k--) {
    const z = 1 + (k - fr) * 0.42;
    const R = 820 / z;
    const al = a * Math.pow(1 - k / 28, 1.4) * 0.9;
    const rot = tt * 0.006 + (k + Math.floor(tt * 0.05)) * 0.11;
    ctx.strokeStyle = rgb((k + Math.floor(tt * 0.05)) % 3 === 0 ? C.cyan : C.ember, al);
    ctx.lineWidth = 1.5 + 9 / z;
    ctx.beginPath();
    for (let j = 0; j <= 6; j++) {
      const ang = rot + (j / 6) * TAU;
      const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 44; i++) {
    const ang = rnd(77, i) * TAU;
    const r0 = mod(rnd(77, i + 100) * 1000 + tt * 34 * (0.5 + rnd(77, i + 200)), 1150) + 100;
    const len = 50 + r0 * 0.3;
    ctx.strokeStyle = rgb(i % 4 === 0 ? C.hot : C.ember, a * 0.4);
    ctx.lineWidth = 1.5 + rnd(77, i + 300) * 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
    ctx.stroke();
  }
  ctx.restore();
}

const slam = (lf: number, start: number, k = 1) => {
  const p = tw(lf, start, 9, E.outExpo);
  return { s: lerp(1.55 * k, 1, p), a: prog(lf, start, 2) };
};

function wordCard(ctx: Ctx, f: number, lf: number, idx: number) {
  const b = S5_SCRIPT[idx];
  const sl = slam(lf, b.lf);
  const cx = W / 2;
  ctx.save();
  switch (b.style) {
    case "ink": {
      ctx.fillStyle = rgb(C.ember);
      ctx.fillRect(0, 0, W, H);
      glow(ctx, cx, 960, 900, C.gold, 0.35);
      ctx.strokeStyle = rgb(C.ink, 0.35);
      ctx.lineWidth = 2;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, 960, i * 150 * tw(lf, 0, 14, E.outExpo), 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = rgb(C.ink, 0.35);
      ctx.fillRect(0, 959, W, 2);
      ctx.fillRect(cx - 1, 0, 2, H);
      ctx.translate(cx, 960);
      ctx.scale(sl.s, sl.s);
      ctx.globalAlpha = sl.a;
      drawText(ctx, b.text, { x: 0, y: 232, font: display(660), size: 660, fill: rgb(C.ink), align: "center", tracking: -0.01 });
      break;
    }
    case "extrude": {
      ctx.fillStyle = rgb(C.ink);
      ctx.fillRect(0, 0, W, H);
      glow(ctx, cx, 960, 900, C.ember, 0.35);
      const lt = lf - b.lf;
      const CH = 900;
      const face = layer("t5-face", W, CH);
      const g = face.getContext("2d")!;
      const gr = g.createLinearGradient(0, 150, 0, 760);
      gr.addColorStop(0, rgb(C.hot));
      gr.addColorStop(1, rgb(C.bone));
      drawText(g, b.text, { x: W / 2, y: 690, font: display(660), size: 660, fill: gr, align: "center" });
      const rotY = Math.sin(lt * 0.18) * 0.35 * Math.exp(-lt / 18) + 0.12;
      const warped = perspectiveWarp(face, 0.05, rotY, 1500, "t5");
      const side = tintedSide(warped, "t5-side", "rgb(255,120,40)", "rgb(90,24,8)");
      ctx.translate(cx, 960);
      ctx.scale(sl.s, sl.s);
      ctx.translate(-cx, -960);
      ctx.globalAlpha = sl.a;
      extrude(ctx, warped, side, 0, 510, 46 + rotY * 90, 54, 34, 0.05);
      break;
    }
    case "glitch": {
      ctx.fillStyle = rgb(C.bone);
      ctx.fillRect(0, 0, W, H);
      const lt = lf - b.lf;
      // scan grid
      ctx.fillStyle = rgb(C.ink, 0.07);
      for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 2);
      ctx.translate(cx, 960);
      ctx.scale(sl.s, sl.s);
      ctx.globalAlpha = sl.a;
      const slices = 10;
      const shake = lt < 20 ? 1 - lt / 20 : 0;
      for (let pass = 0; pass < 3; pass++) {
        const off = pass === 0 ? -16 : pass === 1 ? 16 : 0;
        const col = pass === 0 ? C.ember : pass === 1 ? C.cyan : C.ink;
        ctx.save();
        if (pass < 2) ctx.globalCompositeOperation = "multiply";
        for (let s = 0; s < slices; s++) {
          const y0 = -360 + (s * 760) / slices;
          ctx.save();
          ctx.beginPath();
          ctx.rect(-W / 2, y0, W, 760 / slices + 1);
          ctx.clip();
          const dx = (rnd(f, s) - 0.5) * 220 * shake;
          drawText(ctx, b.text, { x: dx + off * (0.4 + shake), y: 190, font: display(540), size: 540, fill: rgb(col), align: "center", tracking: -0.01 });
          ctx.restore();
        }
        ctx.restore();
      }
      break;
    }
    case "wave": {
      ctx.fillStyle = rgb(C.ink);
      ctx.fillRect(0, 0, W, H);
      const lt = lf - b.lf;
      const env = Math.exp(-lt / 9) * 0.8 + 0.2;
      ctx.globalCompositeOperation = "lighter";
      for (let w = 0; w < 7; w++) {
        ctx.strokeStyle = rgb(w % 2 ? C.cyan : C.ember, 0.75 - w * 0.07);
        ctx.lineWidth = 3 - w * 0.2;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const env2 = Math.sin((x / W) * Math.PI);
          const y = 960 + Math.sin(x * 0.02 + lf * 0.35 + w * 0.7) * 260 * env * env2 * (1 - w * 0.1) + Math.sin(x * 0.07 - lf * 0.5) * 60 * env * env2;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.translate(cx, 960);
      ctx.scale(sl.s, sl.s);
      ctx.globalAlpha = sl.a;
      drawText(ctx, b.text, { x: 0, y: 125, font: display(345), size: 345, fill: rgb(C.bone), align: "center", tracking: 0.01 });
      break;
    }
    case "count": {
      break;
    }
  }
  ctx.restore();
}

export function overdrive(ctx: Ctx, f: number) {
  const lf = f - S5_START;
  const tt = remapT(lf);
  const cx = W / 2;

  if (lf < 120) {
    let idx = 0;
    for (let i = 0; i < 4; i++) if (lf >= S5_SCRIPT[i].lf) idx = i;
    wordCard(ctx, f, lf, idx);
    // beat counter strip along the top
    ctx.save();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i <= idx ? (idx === 0 ? rgb(C.ink) : idx === 2 ? rgb(C.ink) : rgb(C.ember)) : (idx === 0 ? rgb(C.ink, 0.25) : rgb(C.mist, 0.4));
      ctx.fillRect(72 + i * 240, 150, 216, 6);
    }
    ctx.restore();
  } else {
    background(ctx, cx, 960, 0.25, C.ink, C.ember);
    tunnel(ctx, tt, Math.min(1, tw(lf, 120, 14, E.outQuad)) * (lf >= 318 ? 1 - prog(lf, 318, 40) * 0.2 : 1));
    // core glow
    glow(ctx, cx, 960, 600, C.ember, 0.22 + 0.18 * Math.exp(-mod(lf, 30) / 8));

    /* 60 FPS counter (120–178) */
    if (lf < 178) {
      const val = Math.round(60 * E.outExpo(prog(lf, 120, 26)));
      const s = slam(lf, 120, 1.3);
      ctx.save();
      ctx.translate(cx, 900);
      ctx.scale(s.s, s.s);
      ctx.globalAlpha = s.a * (1 - prog(lf, 172, 6));
      drawText(ctx, String(val).padStart(2, "0"), { x: 0, y: 330, font: display(780), size: 780, fill: rgb(C.bone), align: "center", tracking: -0.01 });
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = prog(lf, 134, 8) * (1 - prog(lf, 172, 6));
      drawText(ctx, "FPS", { x: cx, y: 1330, font: display(210), size: 210, fill: rgb(C.gold), align: "center", tracking: 0.1 });
      label(ctx, "1080 × 1920  /  REC.709", cx, 1400, { size: 28, align: "center", color: rgb(C.bone, 0.9), track: 0.26 });
      label(ctx, `FRAME ${String(f).padStart(4, "0")} / ${TOTAL_FRAMES}`, cx, 1450, { size: 24, align: "center", color: rgb(C.cyan, 1), track: 0.2 });
      ctx.restore();
    }

    /* manifesto stack (from 180) */
    if (lf >= 180) {
      ctx.save();
      const dark = ctx.createLinearGradient(0, 380, 0, 1360);
      dark.addColorStop(0, "rgba(7,8,11,0)");
      dark.addColorStop(0.5, "rgba(7,8,11,0.55)");
      dark.addColorStop(1, "rgba(7,8,11,0)");
      ctx.fillStyle = dark;
      ctx.globalAlpha = tw(lf, 180, 10);
      ctx.fillRect(0, 380, W, 980);
      ctx.restore();
      const rows = [
        { text: "EVERY", lf: 180, y: 690 },
        { text: "FRAME", lf: 195, y: 950 },
        { text: "FORGED.", lf: 210, y: 1210 },
      ];
      rows.forEach((r, i) => {
        if (lf < r.lf) return;
        const p = tw(lf, r.lf, 10, E.outExpo);
        const last = i === 2;
        ctx.save();
        ctx.globalAlpha = prog(lf, r.lf, 2) * (1 - prog(lf, 340, 20));
        ctx.translate(lerp(-260, 0, p), lerp(0, 0, p));
        const size = 262;
        if (last) {
          const CH = 360;
          const face = layer("t5-last", W, CH);
          const g = face.getContext("2d")!;
          const gr = g.createLinearGradient(0, 40, 0, 270);
          gr.addColorStop(0, rgb(C.hot));
          gr.addColorStop(0.5, rgb(C.gold));
          gr.addColorStop(1, rgb(C.ember));
          drawText(g, r.text, { x: 72, y: 250, font: display(size), size, fill: gr, tracking: 0.004 });
          const side = tintedSide(face, "t5-last-side", "rgb(180,52,14)", "rgb(60,14,6)");
          const k = E.cinema(prog(lf, r.lf, 20));
          extrude(ctx, face, side, 0, r.y - 250, 22 * k, 26 * k, 22, 0);
        } else {
          drawText(ctx, r.text, { x: 72, y: r.y, font: display(size), size, fill: rgb(C.bone), tracking: 0.004 });
        }
        ctx.restore();
        void i;
      });
      // marginalia
      ctx.save();
      ctx.globalAlpha = tw(lf, 214, 20) * (1 - prog(lf, 340, 20));
      label(ctx, "FRAME-BASED  ·  DETERMINISTIC  ·  60 FPS", 72, 1330, { size: 20, color: rgb(C.bone, 0.85) });
      ctx.restore();
    }

    /* shock rings + sparks on the peak beats */
    for (const b of [210, 240, 270]) {
      const t = lf - b;
      if (t < 0) continue;
      const r = t * 30;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgb(b === 210 ? C.hot : C.ember, Math.exp(-t / 18));
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, 1100, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    sparks(ctx, { seed: 303, count: 400, ox: cx, oy: 1230, t: lf - 210, fan: [-Math.PI * 0.98, -Math.PI * 0.02], speed: 1.3, life: 1.8, gravity: 1300 });
  }

  /* dissolve through darkness into the resolution */
  const d = prog(lf, 326, 34);
  if (d > 0) {
    ctx.fillStyle = rgb(C.ink, E.inOutCubic(d));
    ctx.fillRect(0, 0, W, H);
  }
  void mono;
}
