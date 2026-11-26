/**
 * Deterministic software 3D (painter's algorithm, flat-shaded) tuned for small polygon counts.
 * Chosen over WebGL meshes so the compositor stays one Canvas2D → one post-shader pass, with
 * identical results on any machine and a small memory footprint. This is a real-time
 * approximation (studio-HDR analytic reflections) — not path tracing.
 */
import { TAU, clamp, type RGB } from "../core/math";

export type V3 = [number, number, number];
export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

export function rotate(p: V3, rx: number, ry: number, rz: number): V3 {
  let [x, y, z] = p;
  if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  return [x, y, z];
}

export interface Cam { yaw: number; pitch: number; dist: number; focal: number; cx: number; cy: number; target?: V3 }

/** world → view (camera looks along +z, y up) */
export function toView(cam: Cam, p: V3): V3 {
  const t = cam.target ?? [0, 0, 0];
  const q = rotate(v3.sub(p, t), cam.pitch, cam.yaw, 0);
  return [q[0], q[1], q[2] + cam.dist];
}
export function toScreen(cam: Cam, p: V3): [number, number, number] {
  const k = cam.focal / Math.max(0.05, p[2]);
  return [cam.cx + p[0] * k, cam.cy - p[1] * k, p[2]];
}
export const project = (cam: Cam, p: V3) => toScreen(cam, toView(cam, p));

export interface Mesh { verts: V3[]; faces: number[][]; closed?: boolean; tag?: number[] }

/* ---------------- primitives ---------------- */
function orient(m: Mesh, outward: (c: V3, fi: number) => V3) {
  for (let fi = 0; fi < m.faces.length; fi++) {
    const f = m.faces[fi];
    const a = m.verts[f[0]], b = m.verts[f[1]], c = m.verts[f[2]];
    const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    const ctr: V3 = f.reduce<V3>((acc, i) => v3.add(acc, v3.mul(m.verts[i], 1 / f.length)), [0, 0, 0]);
    if (v3.dot(n, outward(ctr, fi)) < 0) f.reverse();
  }
  return m;
}

export function icosahedron(r = 1): Mesh {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const verts = raw.map((v) => v3.mul(v3.norm(v), r));
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return orient({ verts, faces, closed: true }, (c) => c);
}

export function octahedron(rx = 1, ry = 1, rz = 1): Mesh {
  const verts: V3[] = [[rx, 0, 0], [-rx, 0, 0], [0, ry, 0], [0, -ry, 0], [0, 0, rz], [0, 0, -rz]];
  const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  return orient({ verts, faces, closed: true }, (c) => c);
}

/**
 * Elliptical-section tube along a parametric curve. curve(u) for u in [0,1).
 * Frames: tangent by central difference, normal = tangent × (0,0,1) so the section stays stable for planar curves.
 */
export function tube(curve: (u: number) => V3, segs: number, sides: number, rw: number, rt: number, loop = true): Mesh {
  const verts: V3[] = [];
  const faces: number[][] = [];
  const tag: number[] = [];
  const count = loop ? segs : segs + 1;
  const centers: V3[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / segs;
    const c = curve(u);
    centers.push(c);
    const e = 1e-3;
    const T = v3.norm(v3.sub(curve(u + e), curve(u - e)));
    let N = v3.cross(T, [0, 0, 1]);
    if (v3.len(N) < 1e-4) N = v3.cross(T, [0, 1, 0]);
    N = v3.norm(N);
    const B = v3.norm(v3.cross(T, N));
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU;
      verts.push(v3.add(c, v3.add(v3.mul(N, Math.cos(a) * rw), v3.mul(B, Math.sin(a) * rt))));
    }
  }
  const nSeg = loop ? segs : segs;
  for (let i = 0; i < nSeg; i++) {
    const i0 = i, i1 = (i + 1) % count;
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      faces.push([i0 * sides + j, i1 * sides + j, i1 * sides + j1, i0 * sides + j1]);
      tag.push(i);
    }
  }
  const m: Mesh = { verts, faces, tag };
  return orient(m, (c, fi) => v3.sub(c, centers[tag[fi]]));
}

/* ---------------- studio HDR environment ---------------- */
const KEY = v3.norm([-0.55, 0.75, -0.4]);
const STRIP = v3.norm([0.85, 0.15, -0.35]);
const RIM = v3.norm([0.45, 0.35, 0.8]);

/** Analytic studio environment sampled along a reflection vector (view space, y up, camera at −z). */
export function envChrome(r: V3): V3 {
  const h = r[1];
  const sky: RGB = [12, 14, 22];
  const floor: RGB = [5, 5, 7];
  const horizon: RGB = [168, 66, 22];
  let col: RGB;
  if (h > 0) {
    const k = Math.pow(h, 0.45);
    col = [horizon[0] + (sky[0] - horizon[0]) * k, horizon[1] + (sky[1] - horizon[1]) * k, horizon[2] + (sky[2] - horizon[2]) * k];
  } else {
    const k = Math.pow(-h, 0.55);
    col = [horizon[0] + (floor[0] - horizon[0]) * k, horizon[1] + (floor[1] - horizon[1]) * k, horizon[2] + (floor[2] - horizon[2]) * k];
  }
  const hb = Math.exp(-(h * h) / 0.009);
  col = [col[0] + 255 * hb, col[1] + 150 * hb, col[2] + 60 * hb];
  const k1 = Math.pow(Math.max(0, v3.dot(r, KEY)), 22) * 2.4;
  const k2 = Math.pow(Math.max(0, v3.dot(r, STRIP)), 36) * 1.1;
  const k3 = Math.pow(Math.max(0, v3.dot(r, RIM)), 10) * 0.9;
  col = [col[0] + 255 * k1 + 53 * k2 + 255 * k3, col[1] + 250 * k1 + 227 * k2 + 90 * k3, col[2] + 245 * k1 + 255 * k2 + 31 * k3];
  // gentle filmic shoulder
  return [shoulder(col[0]), shoulder(col[1]), shoulder(col[2])];
}
const shoulder = (v: number) => (v < 180 ? v : 180 + (255 - 180) * (1 - Math.exp(-(v - 180) / 90)));

export type Shader = (n: V3, c: V3, fi: number) => RGB;

export const chromeShader = (tintWarm = 0): Shader => (n, c) => {
  const vdir = v3.norm(c);
  const d = v3.dot(vdir, n);
  const r = v3.sub(vdir, v3.mul(n, 2 * d));
  const e = envChrome(r);
  const fres = Math.pow(1 - Math.abs(d), 3) * 0.35;
  return [clamp(e[0] + 255 * fres * 0.6 + 14 * tintWarm, 0, 255), clamp(e[1] + 255 * fres * 0.5, 0, 255), clamp(e[2] + 255 * fres * 0.45, 0, 255)];
};

export const forgedShader: Shader = (n, c, fi) => {
  const vdir = v3.norm(c);
  const lam = Math.max(0, v3.dot(n, v3.mul(KEY, -1)) * -1);
  const rim = Math.pow(1 - Math.abs(v3.dot(vdir, n)), 2.5);
  const edge = Math.pow(Math.max(0, v3.dot(n, RIM)), 2);
  const j = 0.88 + (((fi * 2654435761) >>> 0) % 100) / 100 * 0.24;
  return [clamp((26 + lam * 90) * j + rim * 150 + edge * 160, 0, 255), clamp((28 + lam * 92) * j + rim * 62 + edge * 60, 0, 255), clamp((36 + lam * 104) * j + rim * 20 + edge * 20, 0, 255)];
};

export interface Model { rot: V3; pos: V3; scale: number }

export interface DrawOpts {
  shader: Shader;
  alpha?: number;
  /** only draw faces whose tag <= this (draw-on growth) */
  tagMax?: number;
}

export interface Poly { z: number; pts: [number, number][]; col: RGB; a: number }

/** Transform + cull + shade a mesh into screen-space polygons (no painting). */
export function meshPolys(mesh: Mesh, m: Model, cam: Cam, o: DrawOpts, out: Poly[] = []): Poly[] {
  if (m.scale <= 0.0005) return out;
  const vs: V3[] = new Array(mesh.verts.length);
  for (let i = 0; i < mesh.verts.length; i++) {
    const w = v3.add(rotate(v3.mul(mesh.verts[i], m.scale), m.rot[0], m.rot[1], m.rot[2]), m.pos);
    vs[i] = toView(cam, w);
  }
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (o.tagMax !== undefined && mesh.tag && mesh.tag[fi] > o.tagMax) continue;
    const f = mesh.faces[fi];
    const a = vs[f[0]], b = vs[f[1]], c = vs[f[2]];
    let n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    const l = v3.len(n);
    if (l < 1e-9) continue;
    n = v3.mul(n, 1 / l);
    let cen: V3 = [0, 0, 0];
    for (const i of f) cen = v3.add(cen, vs[i]);
    cen = v3.mul(cen, 1 / f.length);
    if (cen[2] < 0.2) continue;
    if (v3.dot(n, cen) >= 0) continue; // back-face
    const col = o.shader(n, cen, fi);
    out.push({ z: cen[2], pts: f.map((i) => { const s = toScreen(cam, vs[i]); return [s[0], s[1]] as [number, number]; }), col, a: o.alpha ?? 1 });
  }
  return out;
}

/** Depth-sort (far → near) and fill. Seams are hidden with a hairline stroke in the face colour. */
export function paintPolys(ctx: CanvasRenderingContext2D, polys: Poly[], edge?: { color: string; width: number } | null) {
  polys.sort((p, q) => q.z - p.z);
  ctx.save();
  ctx.lineJoin = "round";
  const base = ctx.globalAlpha;
  for (const p of polys) {
    const s = `rgb(${p.col[0] | 0},${p.col[1] | 0},${p.col[2] | 0})`;
    ctx.globalAlpha = base * p.a;
    ctx.beginPath();
    ctx.moveTo(p.pts[0][0], p.pts[0][1]);
    for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = s;
    ctx.fill();
    ctx.strokeStyle = s;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (edge) {
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = edge.width;
      ctx.stroke();
    }
  }
  ctx.restore();
  return polys.length;
}

export function drawMesh(ctx: CanvasRenderingContext2D, mesh: Mesh, m: Model, cam: Cam, o: DrawOpts, edge?: { color: string; width: number } | null): number {
  return paintPolys(ctx, meshPolys(mesh, m, cam, o), edge);
}

/** Wireframe-only render (blueprint look), no culling. */
export function drawWire(ctx: CanvasRenderingContext2D, mesh: Mesh, m: Model, cam: Cam, color: string, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  const ps = mesh.verts.map((v) => project(cam, v3.add(rotate(v3.mul(v, m.scale), m.rot[0], m.rot[1], m.rot[2]), m.pos)));
  ctx.beginPath();
  for (const f of mesh.faces) {
    ctx.moveTo(ps[f[0]][0], ps[f[0]][1]);
    for (let i = 1; i < f.length; i++) ctx.lineTo(ps[f[i]][0], ps[f[i]][1]);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}
