/** Reusable kinetic-word choreographies. t = frames since entrance, o = exit progress (0..1). */
import { rnd } from "../core/math";
import { E, prog, spring, tw } from "../motion/easing";
import { FPS, W } from "../core/config";
import { clipRect, display, drawText, layoutText, type Ctx } from "./engine";
import type { WordStyle } from "../core/timeline";

export interface WordOpts {
  x: number; y: number; size: number; fill: string | CanvasGradient; font?: string;
  align?: "left" | "center" | "right"; tracking?: number; seed?: number;
  accent?: string;
}

const SCR = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&";

export function kineticWord(ctx: Ctx, text: string, style: WordStyle, t: number, o: number, p: WordOpts) {
  if (t < 0) return;
  const font = p.font ?? display(p.size);
  const lay = layoutText(ctx, text, font, p.size, p.tracking ?? 0);
  const left = p.align === "center" ? p.x - lay.width / 2 : p.align === "right" ? p.x - lay.width : p.x;
  const base = { x: p.x, y: p.y, font, size: p.size, fill: p.fill, align: p.align, tracking: p.tracking };
  const n = text.length;
  const boxTop = p.y - p.size * 1.02;
  const boxH = p.size * 1.02 + 0.04 * p.size + 4;

  switch (style) {
    case "rise": {
      clipRect(ctx, left - 40, boxTop, lay.width + 80, boxH, () =>
        drawText(ctx, text, {
          ...base,
          fx: (i) => {
            const d = Math.abs(i - (n - 1) / 2) * 2.4;
            const enter = tw(t - d, 0, 30, E.cinema);
            const exit = E.inQuint(o);
            return { dy: (1 - enter) * p.size * 1.3 - exit * p.size * 1.3 };
          },
        }),
      );
      break;
    }
    case "pop": {
      drawText(ctx, text, {
        ...base,
        fx: (i) => {
          const d = i * 2.2;
          const s = spring((t - d) / FPS, 3.4, 0.42);
          const a = prog(t - d, 0, 3) * (1 - o);
          return { sx: Math.max(0, s) * (1 - o * 0.3), sy: Math.max(0, s) * (1 - o * 0.3), rot: (1 - Math.min(1, s)) * (i % 2 ? 0.6 : -0.6), alpha: a, dy: -p.size * 0.28 * (1 - Math.min(1, s)) * 0 };
        },
      });
      break;
    }
    case "slice": {
      const mid = p.y - p.size * 0.36;
      const k = E.snap(prog(t, 0, 24));
      const ex = E.press(o);
      const offTop = -(1 - k) * W * 0.9 - ex * W * 0.9;
      const offBot = (1 - k) * W * 0.9 + ex * W * 0.9;
      clipRect(ctx, 0, boxTop - 10, W, mid - boxTop + 10, () => { ctx.save(); ctx.translate(offTop, 0); drawText(ctx, text, base); ctx.restore(); });
      clipRect(ctx, 0, mid, W, boxH, () => { ctx.save(); ctx.translate(offBot, 0); drawText(ctx, text, base); ctx.restore(); });
      if (k < 1 && p.accent) {
        // chromatic edge flare while the halves slide
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5 * (1 - k);
        clipRect(ctx, 0, mid - 3, W, 6, () => { ctx.fillStyle = p.accent!; ctx.fillRect(0, mid - 3, W, 6); });
        ctx.restore();
      }
      break;
    }
    case "drop": {
      drawText(ctx, text, {
        ...base,
        fx: (i) => {
          const d = i * 3.2;
          const k = prog(t - d, 0, 38);
          return { dy: -(1 - E.outBounce(k)) * 620 + o * 50, alpha: Math.min(1, k * 8) * (1 - o), rot: (1 - E.outBounce(k)) * (i % 2 ? 0.25 : -0.25) };
        },
      });
      break;
    }
    case "scramble": {
      drawText(ctx, text, {
        ...base,
        fx: (i, _n, ch) => {
          const done = 16 + i * 4;
          if (t >= done) return { alpha: 1 - o };
          if (ch === " ") return {};
          const rc = SCR[Math.floor(rnd(p.seed ?? 5, i * 131 + Math.floor(t / 2)) * SCR.length)];
          return { ch: rc, alpha: (0.55 + 0.45 * rnd(3, i + Math.floor(t))) * (1 - o) };
        },
      });
      break;
    }
  }
}
