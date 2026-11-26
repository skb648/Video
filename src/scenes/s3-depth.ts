/** SCENE 3 — DEPTH (frames 600–959). ESCALATION: a forged chrome core assembles, spins up, implodes into the ember. */
import { H, W } from "../core/config";
import { TAU, lerp, rnd } from "../core/math";
import { C, rgb } from "../creative/palette";
import { background, dust, glow } from "../graphics/fx";
import { E, prog, tw } from "../motion/easing";
import { clipRect, display, drawText, extrude, label, layer, perspectiveWarp, tintedSide } from "../typography/engine";
import { HEARTBEATS } from "../core/timeline";
import { chromeShader, drawWire, forgedShader, icosahedron, meshPolys, octahedron, paintPolys, project, tube, type Cam, type Poly, type V3 } from "../three/g3";

type Ctx = CanvasRenderingContext2D;
export const S3_START = 600;
export const OBJ_C: [number, number] = [W / 2, 1150];

const ico = icosahedron(1.15);
const ringMesh = (r: number) => tube((u) => [Math.cos(u * TAU) * r, Math.sin(u * TAU) * r, 0], 120, 12, 0.034, 0.034, true);
const rings = [ringMesh(1.75), ringMesh(2.08), ringMesh(2.4)];
const shardMesh = octahedron(0.045, 0.17, 0.045);
const SHARDS = 72;
const chrome = chromeShader(1);
const NSEEDS = 41;

function spin(lf: number) {
  const a = Math.max(0, lf - 235);
  return lf * 0.011 + a * a * 0.00042;
}

export function depth(ctx: Ctx, f: number) {
  const lf = f - S3_START;
  const collapse = tw(lf, 292, 36, E.inQuint);
  const silent = lf >= 330;
  background(ctx, W / 2, 1000, 0.5 * (1 - collapse), [10, 9, 12], C.ember);
  dust(ctx, f, 31, 0.6 * (1 - collapse), 46);

  /* 2D layer behind the object: dashed orbit guides */
  ctx.save();
  ctx.globalAlpha = tw(lf, 0, 40) * (1 - collapse);
  ctx.translate(OBJ_C[0], OBJ_C[1]);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(lf * (i % 2 ? -0.003 : 0.004));
    ctx.setLineDash([2, 14 + i * 6]);
    ctx.strokeStyle = rgb(C.cyan, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 470 + i * 38, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  const cam: Cam = {
    yaw: 0.5 * Math.sin(lf * 0.012) + lf * 0.003,
    pitch: 0.2 + 0.07 * Math.sin(lf * 0.019),
    dist: 6.4 - 0.9 * tw(lf, 150, 110, E.inOutCubic),
    focal: 1100, cx: OBJ_C[0], cy: OBJ_C[1],
  };

  /* extruded title sits behind the object */
  titleBlock(ctx, lf, cam);

  /* 3D: collect polys of every mesh then depth-sort once, so rings correctly weave through the core */
  const polys: Poly[] = [];
  const sp = spin(lf);
  const body = 1 - collapse;
  const icoK = E.cinema(prog(lf, -15, 45)) * body;
  meshPolys(ico, { rot: [sp * 0.8, sp, 0.2], pos: [0, 0, 0], scale: icoK }, cam, { shader: chrome, alpha: 0.15 + 0.85 * tw(lf, 24, 40) }, polys);
  rings.forEach((rm, i) => {
    const k = E.cinema(prog(lf, 4 + i * 8, 50)) * body;
    meshPolys(rm, { rot: [1.1 + i * 0.55 + sp * (0.5 + i * 0.2), sp * (0.7 - i * 0.25) + i, i * 0.6], pos: [0, 0, 0], scale: k }, cam, { shader: chrome }, polys);
  });
  let landed = 0;
  for (let i = 0; i < SHARDS; i++) {
    const rho = 1.55 + rnd(NSEEDS, i * 6) * 1.9;
    const th0 = rnd(NSEEDS, i * 6 + 1) * TAU;
    const y0 = (rnd(NSEEDS, i * 6 + 2) - 0.5) * 2.5;
    const w = (0.008 + rnd(NSEEDS, i * 6 + 3) * 0.012) * (rnd(NSEEDS, i * 6 + 4) > 0.5 ? 1 : -1);
    const th = th0 + w * lf;
    const orbit: V3 = [Math.cos(th) * rho, y0, Math.sin(th) * rho];
    const start: V3 = [orbit[0] * 5 + 2, orbit[1] * 3, orbit[2] * 5 - 6];
    const a = E.outQuint(prog(lf, -20 + i * 0.8, 70));
    if (a >= 1) landed++;
    const q = E.inQuint(prog(lf, 245 + rnd(NSEEDS, i * 6 + 5) * 30, 55));
    const pos: V3 = [lerp(start[0], orbit[0], a) * (1 - q), lerp(start[1], orbit[1], a) * (1 - q), lerp(start[2], orbit[2], a) * (1 - q)];
    meshPolys(shardMesh, { rot: [lf * 0.03 + i, lf * 0.02, i * 0.7], pos, scale: (0.8 + rnd(NSEEDS, i) * 0.9) * (1 - q * 0.7) * Math.min(1, a * 3) }, cam, { shader: forgedShader }, polys);
  }
  paintPolys(ctx, polys);

  /* blueprint wireframe overlay */
  const wireA = tw(lf, 70, 20, E.outCubic) * (1 - tw(lf, 190, 30, E.inCubic));
  if (wireA > 0.01 && body > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawWire(ctx, ico, { rot: [sp * 0.8, sp, 0.2], pos: [0, 0, 0], scale: icoK * 1.035 }, cam, rgb(C.cyan, 0.75 * wireA), 1.8);
    ctx.restore();
  }

  /* ember glow bleeding from the core as spin builds */
  const build = tw(lf, 200, 120, E.inQuad);
  glow(ctx, OBJ_C[0], OBJ_C[1], 360 + 260 * build, C.ember, (0.14 + 0.5 * build) * body);

  /* data readout + annotation */
  const dA = tw(lf, 60, 24) * (1 - tw(lf, 262, 20, E.inCubic));
  if (dA > 0.01) {
    ctx.save();
    ctx.globalAlpha = dA;
    const rows: [string, string][] = [["VERTS", "12"], ["FACES", "20"], ["RINGS", "03"], ["SHARDS", String(landed).padStart(3, "0")]];
    rows.forEach(([k, v], i) => {
      const x = 72 + i * 236;
      label(ctx, k, x, 1668, { size: 18, color: rgb(C.mist, 1), track: 0.22 });
      label(ctx, v, x, 1714, { size: 40, color: rgb(C.bone, 1), track: 0.02, font: `500 40px "JetBrains Mono"` });
      ctx.fillStyle = rgb(C.ember);
      ctx.fillRect(x, 1646, 36, 3);
    });
    // ring annotation
    const p = project(cam, [2.4 * Math.cos(0.5), 2.4 * Math.sin(0.5) * 0, 0]);
    ctx.strokeStyle = rgb(C.bone, 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0] + 40, p[1] - 70);
    ctx.lineTo(W - 72, p[1] - 70);
    ctx.stroke();
    label(ctx, "R 2.40 / CHROME", W - 72, p[1] - 86, { size: 20, align: "right", color: rgb(C.bone, 0.9) });
    ctx.restore();
  }

  /* collapse: the object becomes the ember (callback to Scene 1) */
  if (collapse > 0.001) {
    glow(ctx, OBJ_C[0], OBJ_C[1], 40 + 220 * collapse * (1 - collapse * 0.6), C.ember, collapse);
    glow(ctx, OBJ_C[0], OBJ_C[1], 20 + 40 * collapse, C.hot, collapse);
  }
  if (silent) {
    let pulse = 0;
    for (const hb of HEARTBEATS) if (f >= hb) pulse += Math.exp(-(f - hb) / 5.5);
    const settle = 1 - 0.25 * prog(lf, 330, 18);
    glow(ctx, OBJ_C[0], OBJ_C[1], (46 + 80 * pulse) * settle, C.ember, 0.8);
    glow(ctx, OBJ_C[0], OBJ_C[1], 22 + 22 * pulse, C.gold, 1);
    glow(ctx, OBJ_C[0], OBJ_C[1], 8 + 8 * pulse, [255, 255, 255], 1);
  }
  void H;
}

function titleBlock(ctx: Ctx, lf: number, cam: Cam) {
  const exitK = tw(lf, 262, 30, E.inQuint);
  if (exitK >= 1) return;
  const CH = 560, y0 = 250;
  const face = layer("t3-face", W, CH);
  const g = face.getContext("2d")!;
  g.fillStyle = rgb(C.bone);
  drawText(g, "BUILD IN", {
    x: 72, y: 190, font: display(190), size: 190, fill: rgb(C.bone), tracking: 0.01,
    fx: (i) => {
      const d = 36 + i * 4.5;
      const p = tw(lf, d, 38, E.cinema);
      const r1 = rnd(9, i) - 0.5, r2 = rnd(10, i) - 0.5;
      return { sx: lerp(2.8, 1, p), dx: (1 - p) * r1 * 700, dy: (1 - p) * (r2 * 400 - 120), alpha: prog(lf, d, 8), rot: (1 - p) * r1 * 0.8 };
    },
  });
  const gr = g.createLinearGradient(0, 270, 0, 510);
  gr.addColorStop(0, rgb(C.hot));
  gr.addColorStop(0.6, rgb(C.gold));
  gr.addColorStop(1, rgb(C.molten));
  clipRect(g, 40, 250, W - 80, 290, () =>
    drawText(g, "DEPTH", {
      x: 72, y: 500, font: display(290), size: 290, fill: gr, tracking: 0.005,
      fx: (i) => ({ dy: (1 - tw(lf, 84 + i * 5, 36, E.cinema)) * 360 }),
    }),
  );
  const yaw = -0.2 + Math.sin(lf * 0.016) * 0.04 + Math.sin(cam.yaw) * 0.05;
  const warped = perspectiveWarp(face, 0.1, yaw, 1700, "t3");
  const side = tintedSide(warped, "t3-side", "rgb(190,66,18)", "rgb(58,16,6)");
  const bob = Math.sin(lf * 0.03) * 6;
  ctx.save();
  const sc = 1 - exitK;
  ctx.translate(OBJ_C[0], OBJ_C[1]);
  ctx.scale(sc, sc);
  ctx.globalAlpha = 1 - exitK * 0.6;
  ctx.translate(-OBJ_C[0], -OBJ_C[1]);
  const ex = tw(lf, 30, 40, E.cinema);
  extrude(ctx, warped, side, 0, y0 + bob, 30 * ex, 34 * ex, 30, 0.04);
  ctx.restore();
}
