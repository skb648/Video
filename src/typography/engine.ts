/** Typography engine: kerned layout, per-glyph transforms, masked reveals, extrusion, perspective warp. */
import { FONT } from "../creative/palette";

export type Ctx = CanvasRenderingContext2D;

export const fontStr = (family: string, size: number, weight = 400) => `${weight} ${size}px ${family}`;
export const display = (size: number) => fontStr(FONT.display, size, 400);
export const ui = (size: number, weight = 500) => fontStr(FONT.ui, size, weight);
export const mono = (size: number, weight = 400) => fontStr(FONT.mono, size, weight);

export interface Glyph { ch: string; x: number; w: number }
export interface Layout { glyphs: Glyph[]; width: number }

const layoutCache = new Map<string, Layout>();

/** Kerning is derived from pair metrics: kern(a,b) = w(ab) − w(a) − w(b). Tracking is in em. */
export function layoutText(ctx: Ctx, text: string, font: string, size: number, tracking = 0): Layout {
  const key = `${font}|${text}|${tracking}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  ctx.save();
  ctx.font = font;
  const glyphs: Glyph[] = [];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = ctx.measureText(ch).width;
    glyphs.push({ ch, x, w });
    let kern = 0;
    if (i < text.length - 1) {
      const nx = text[i + 1];
      kern = ctx.measureText(ch + nx).width - w - ctx.measureText(nx).width;
    }
    x += w + kern + tracking * size;
  }
  ctx.restore();
  const width = glyphs.length ? x - tracking * size : 0;
  const out = { glyphs, width };
  layoutCache.set(key, out);
  return out;
}

export interface CharFx { dx?: number; dy?: number; rot?: number; sx?: number; sy?: number; alpha?: number; ch?: string }
export interface TextOpts {
  x: number; y: number; font: string; size: number; fill: string | CanvasGradient;
  tracking?: number; align?: "left" | "center" | "right";
  fx?: (i: number, n: number, ch: string) => CharFx | null;
  stroke?: { color: string; width: number };
}

export function measureWidth(ctx: Ctx, text: string, font: string, size: number, tracking = 0) {
  return layoutText(ctx, text, font, size, tracking).width;
}

export function drawText(ctx: Ctx, text: string, o: TextOpts) {
  const lay = layoutText(ctx, text, o.font, o.size, o.tracking ?? 0);
  const ox = o.align === "center" ? -lay.width / 2 : o.align === "right" ? -lay.width : 0;
  ctx.save();
  ctx.font = o.font;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = o.fill;
  const baseAlpha = ctx.globalAlpha;
  const n = lay.glyphs.length;
  for (let i = 0; i < n; i++) {
    const g = lay.glyphs[i];
    const fx = o.fx ? o.fx(i, n, g.ch) : {};
    if (!fx) continue;
    const a = fx.alpha ?? 1;
    if (a <= 0.003) continue;
    ctx.save();
    ctx.globalAlpha = baseAlpha * a;
    ctx.translate(o.x + ox + g.x + g.w / 2 + (fx.dx ?? 0), o.y + (fx.dy ?? 0));
    if (fx.rot) ctx.rotate(fx.rot);
    if (fx.sx !== undefined || fx.sy !== undefined) ctx.scale(fx.sx ?? 1, fx.sy ?? fx.sx ?? 1);
    const ch = fx.ch ?? g.ch;
    if (o.stroke) {
      ctx.lineWidth = o.stroke.width;
      ctx.strokeStyle = o.stroke.color;
      ctx.strokeText(ch, -g.w / 2, 0);
    }
    ctx.fillText(ch, -g.w / 2, 0);
    ctx.restore();
  }
  ctx.restore();
  return lay.width;
}

/** Small tracked mono / UI label. */
export function label(ctx: Ctx, text: string, x: number, y: number, o: { size?: number; color?: string; track?: number; align?: "left" | "center" | "right"; alpha?: number; font?: string } = {}) {
  const size = o.size ?? 26;
  ctx.save();
  ctx.font = o.font ?? mono(size, 500);
  ctx.fillStyle = o.color ?? "rgba(244,239,230,0.8)";
  ctx.globalAlpha *= o.alpha ?? 1;
  const tr = (o.track ?? 0.14) * size;
  (ctx as any).letterSpacing = `${tr}px`;
  const w = ctx.measureText(text).width - tr;
  const ax = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, ax, y);
  (ctx as any).letterSpacing = "0px";
  ctx.restore();
  return w;
}

export function clipRect(ctx: Ctx, x: number, y: number, w: number, h: number, fn: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  fn();
  ctx.restore();
}

/* ---------------- offscreen layer pool ---------------- */
const pool = new Map<string, HTMLCanvasElement>();
export function layer(name: string, w: number, h: number): HTMLCanvasElement {
  let c = pool.get(name);
  if (!c) {
    c = document.createElement("canvas");
    pool.set(name, c);
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  } else c.getContext("2d")!.clearRect(0, 0, w, h);
  return c;
}

/**
 * Perspective-correct rotation of a flat texture about its centre using two cheap strip passes
 * (Y-axis then X-axis). Returns a pooled canvas of the same size.
 */
export function perspectiveWarp(src: HTMLCanvasElement, rotX: number, rotY: number, dist: number, name = "warp"): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const tmp = layer(name + "-a", w, h);
  const out = layer(name + "-b", w, h);
  const t = tmp.getContext("2d")!;
  const o = out.getContext("2d")!;
  const step = 3;
  const cx = w / 2, cy = h / 2;
  const sy = Math.sin(rotY), cyy = Math.cos(rotY);
  for (let x = 0; x < w; x += step) {
    const px = x + step / 2 - cx;
    const z = px * sy;
    const k = dist / (dist + z);
    const dx = cx + px * cyy * k;
    t.drawImage(src, x, 0, step, h, dx - (step * cyy * k) / 2 - 0.4, cy + (0 - cy) * k, step * cyy * k + 0.8, h * k);
  }
  const sx = Math.sin(rotX), cxx = Math.cos(rotX);
  for (let y = 0; y < h; y += step) {
    const py = y + step / 2 - cy;
    const z = -py * sx;
    const k = dist / (dist + z);
    const dy = cy + py * cxx * k;
    o.drawImage(tmp, 0, y, w, step, cx + (0 - cx) * k, dy - (step * cxx * k) / 2 - 0.4, w * k, step * cxx * k + 0.8);
  }
  return out;
}

/** Tint a copy of `face` into `dst` using a vertical gradient (for extrusion side walls). */
export function tintedSide(face: HTMLCanvasElement, name: string, top: string, bottom: string): HTMLCanvasElement {
  const c = layer(name, face.width, face.height);
  const g = c.getContext("2d")!;
  g.drawImage(face, 0, 0);
  g.globalCompositeOperation = "source-in";
  const gr = g.createLinearGradient(0, 0, 0, face.height);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, face.width, face.height);
  g.globalCompositeOperation = "source-over";
  return c;
}

/** Stack copies of `side` along (dx,dy), converging slightly to a vanishing scale, then draw `face` on top. */
export function extrude(ctx: Ctx, face: HTMLCanvasElement, side: HTMLCanvasElement, x: number, y: number, dx: number, dy: number, layers = 26, vanish = 0.0) {
  const w = face.width, h = face.height;
  for (let i = layers; i >= 1; i--) {
    const t = i / layers;
    const s = 1 - vanish * t;
    ctx.drawImage(side, x + dx * t - (w * (s - 1)) / 2, y + dy * t - (h * (s - 1)) / 2, w * s, h * s);
  }
  ctx.drawImage(face, x, y);
}
