// Final master render: every frame rendered at its own timestamp in headless Chromium, piped to FFmpeg (x264 + AAC).
// Usage: node scripts/render.mjs [--preview] [--start N --end N]   (preview = every frame but encoded fast / small)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const preview = args.includes("--preview");
const START = arg("--start", 0);
const END = arg("--end", 1800);
const W = 1080, H = 1920, FPS = 60;
const out = preview ? "build/preview.mp4" : "build/toonforge-master.mp4";
mkdirSync("build", { recursive: true });
mkdirSync("reports/quality-assurance", { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(pathToFileURL(resolve("dist/index.html")).href);
await page.waitForFunction(() => window.__tf && window.__tf.ready, null, { timeout: 60000 });

/* ---- audio (rendered once, deterministic) ---- */
console.log("rendering + mastering audio…");
const { b64, report } = await page.evaluate(() => window.__tf.audio());
writeFileSync("build/master.wav", Buffer.from(b64, "base64"));
writeFileSync("reports/quality-assurance/audio_report.json", JSON.stringify(report, null, 2));
console.log("audio:", report.integratedLUFS.toFixed(2), "LUFS,", report.truePeakDBTP.toFixed(2), "dBTP");

/* ---- video ---- */
const enc = preview ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24"] : ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-maxrate", "30M", "-bufsize", "60M", "-profile:v", "high", "-level", "4.2"];
const ff = spawn(ffmpegPath, [
  "-y", "-loglevel", "error",
  "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-framerate", String(FPS), "-i", "pipe:0",
  "-i", "build/master.wav",
  "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p",
  ...enc, "-r", String(FPS), "-fps_mode", "cfr", "-g", "120", "-bf", "2",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
  "-t", String((END - START) / FPS), "-movflags", "+faststart", out,
], { stdio: ["pipe", "inherit", "inherit"] });
ff.on("error", (e) => { console.error(e); process.exit(1); });
const done = new Promise((r) => ff.on("close", r));

const stats = [];
const t0 = Date.now();
for (let f = START; f < END; f++) {
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { res = await page.evaluate((f) => window.__tf.frame(f), f); break; }
    catch (e) { console.log(`frame ${f} failed (attempt ${attempt + 1}): ${e.message}`); }
  }
  if (!res) throw new Error(`frame ${f} could not be rendered`);
  stats.push(res.stats);
  const buf = Buffer.from(res.b64, "base64");
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`frame ${f}/${END}  ${(el / (f - START + 1)).toFixed(2)} s/frame  ETA ${(((END - f) * el) / (f - START + 1) / 60).toFixed(1)} min`);
    writeFileSync("reports/quality-assurance/frame_stats.json", JSON.stringify(stats));
  }
}
ff.stdin.end();
await done;
writeFileSync("reports/quality-assurance/frame_stats.json", JSON.stringify(stats));
await browser.close();
console.log("wrote", out, (statSync(out).size / 1e6).toFixed(1), "MB in", ((Date.now() - t0) / 60000).toFixed(1), "min");
void existsSync; void readFileSync;
