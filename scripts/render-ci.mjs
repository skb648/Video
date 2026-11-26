/**
 * Parallel 1080×1920 60 fps Master MP4 Renderer for GitHub Actions CI.
 *
 * Uses a local preview server + N parallel Playwright Chromium workers streaming
 * raw WebGL2 RGBA frames over loopback HTTP directly into FFmpeg (zero base64 overhead),
 * then concatenates segments losslessly and muxes the BS.1770 mastered 48 kHz AAC soundtrack.
 *
 * Usage:
 *   node scripts/render-ci.mjs [--workers 4] [--out build/toonforge-master-1080p-60fps.mp4]
 */
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const argVal = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const W = 1080;
const H = 1920;
const FPS = 60;
const TOTAL_FRAMES = 1800;
const WORKERS = Math.max(1, Math.min(8, Number(argVal("--workers", String(Math.min(4, os.cpus().length))))));
const OUT_FILE = path.resolve(argVal("--out", "build/toonforge-master-1080p-60fps.mp4"));
const TMP_DIR = path.resolve("build/.ci-segments");

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// Partition 1800 frames evenly across workers (GOP aligned so concat is seamless)
const ranges = [];
const baseChunk = Math.floor(TOTAL_FRAMES / WORKERS);
for (let i = 0; i < WORKERS; i++) {
  const start = i * baseChunk;
  const end = i === WORKERS - 1 ? TOTAL_FRAMES : (i + 1) * baseChunk;
  ranges.push({ id: i, start, end, count: end - start });
}

// 1. Start static server for dist/
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

const distDir = path.resolve("dist");
const staticServer = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  const filePath = path.join(distDir, urlPath === "/" ? "index.html" : urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
const appPort = staticServer.address().port;
const appUrl = `http://127.0.0.1:${appPort}/`;

// 2. Start binary frame-sink server piping directly into per-worker FFmpeg encoders
const sinkWorkers = new Map();
function ensureEncoder(id, expectedFrames) {
  if (sinkWorkers.has(id)) return sinkWorkers.get(id);
  const segPath = path.join(TMP_DIR, `seg_${id}.mp4`);
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${W}x${H}`,
      "-framerate",
      String(FPS),
      "-i",
      "pipe:0",
      "-vf",
      "vflip,scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "16",
      "-maxrate",
      "30M",
      "-bufsize",
      "60M",
      "-profile:v",
      "high",
      "-level",
      "4.2",
      "-r",
      String(FPS),
      "-g",
      "150",
      "-keyint_min",
      "150",
      "-sc_threshold",
      "0",
      "-bf",
      "2",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      segPath,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );

  const st = {
    id,
    segPath,
    ff,
    frames: 0,
    expectedFrames,
    exitPromise: new Promise((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg seg ${id} exited ${code}`))));
    }),
  };
  sinkWorkers.set(id, st);
  return st;
}

const audioPath = path.join(TMP_DIR, "master.wav");
const sinkServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/audio") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(audioPath, buf);
      console.log(`[ci-render] mastered audio written (${(buf.length / 1e6).toFixed(2)} MB)`);
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  const mFrame = req.url?.match(/^\/seg\/(\d+)\/frame$/);
  if (req.method === "POST" && mFrame) {
    const id = Number(mFrame[1]);
    const st = ensureEncoder(id, ranges[id].count);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const ok = st.ff.stdin.write(buf);
      st.frames++;
      if (st.frames % 90 === 0 || st.frames === st.expectedFrames) {
        console.log(`[ci-render] worker ${id}: ${st.frames}/${st.expectedFrames} frames`);
      }
      const reply = () => {
        res.writeHead(200);
        res.end("ok");
      };
      if (ok) reply();
      else st.ff.stdin.once("drain", reply);
    });
    return;
  }

  const mDone = req.url?.match(/^\/seg\/(\d+)\/done$/);
  if (req.method === "POST" && mDone) {
    const id = Number(mDone[1]);
    const st = ensureEncoder(id, ranges[id].count);
    st.ff.stdin.end();
    st.exitPromise
      .then(() => {
        res.writeHead(200);
        res.end("ok");
      })
      .catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

await new Promise((resolve) => sinkServer.listen(0, "127.0.0.1", resolve));
const sinkPort = sinkServer.address().port;
const sinkBase = `http://127.0.0.1:${sinkPort}`;

console.log(`[ci-render] Rendering ${W}x${H} @ ${FPS} fps (${TOTAL_FRAMES} frames) across ${WORKERS} parallel workers...`);
const t0 = Date.now();

const launchArgs = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
];

// 3. Synthesize offline mastered audio once
{
  const browser = await chromium.launch({ args: launchArgs });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__tf && window.__tf.ready, null, { timeout: 60_000 });
  const report = await page.evaluate(async (base) => {
    const { b64, report } = await window.__tf.audio();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r = await fetch(`${base}/audio`, { method: "POST", body: bytes });
    if (!r.ok) throw new Error(`Audio upload failed: ${r.status}`);
    return report;
  }, sinkBase);
  console.log(
    `[ci-render] Audio loudness: ${report.integratedLUFS.toFixed(2)} LUFS, true peak: ${report.truePeakDBTP.toFixed(2)} dBTP`
  );
  await browser.close();
}

// 4. Launch N parallel Chromium render workers
await Promise.all(
  ranges.map(async (range) => {
    const browser = await chromium.launch({ args: launchArgs });
    try {
      const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
      await page.goto(appUrl, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__tf && window.__tf.ready, null, { timeout: 60_000 });
      await page.evaluate(
        async ({ id, start, end, base }) => {
          const studio = window.__tf.studio;
          const gl = studio.post.gl;
          const w = studio.out.width;
          const h = studio.out.height;
          const rgba = new Uint8Array(w * h * 4);
          for (let f = start; f < end; f++) {
            studio.renderFrame(f);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
            const r = await fetch(`${base}/seg/${id}/frame`, { method: "POST", body: rgba });
            if (!r.ok) throw new Error(`Worker ${id} frame ${f} failed: ${r.status}`);
          }
          const done = await fetch(`${base}/seg/${id}/done`, { method: "POST" });
          if (!done.ok) throw new Error(`Worker ${id} finalize failed: ${done.status}`);
        },
        { id: range.id, start: range.start, end: range.end, base: sinkBase }
      );
    } finally {
      await browser.close();
    }
  })
);

// 5. Concatenate segments + mux AAC 48kHz stereo audio into final MP4
const concatListPath = path.join(TMP_DIR, "concat.txt");
const concatLines = ranges.map((r) => `file '${path.join(TMP_DIR, `seg_${r.id}.mp4`).replace(/'/g, "'\\''")}'`).join("\n");
fs.writeFileSync(concatListPath, concatLines + "\n");

console.log(`[ci-render] Muxing final master -> ${OUT_FILE}`);
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-i",
    audioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    "30.000",
    "-movflags",
    "+faststart",
    OUT_FILE,
  ],
  { stdio: "inherit" }
);

const probe = execFileSync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", OUT_FILE],
  { encoding: "utf8" }
);
console.log("[ci-render] FFprobe summary:");
for (const line of probe.split("\n")) {
  if (/^(codec_name|width|height|r_frame_rate|avg_frame_rate|pix_fmt|nb_frames|nb_read_frames|sample_rate|channels|duration|size|bit_rate)=/.test(line)) {
    console.log("  " + line);
  }
}

const sizeMB = (fs.statSync(OUT_FILE).size / 1e6).toFixed(2);
const mins = ((Date.now() - t0) / 60000).toFixed(2);
console.log(`[ci-render] Done! Wrote ${OUT_FILE} (${sizeMB} MB) in ${mins} min.`);

fs.rmSync(TMP_DIR, { recursive: true, force: true });
sinkServer.close();
staticServer.close();
