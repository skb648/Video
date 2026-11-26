// Reference intelligence: measured facts about a source video (FFprobe + FFmpeg scene detection + EBU R128 + silence).
// Usage: node scripts/analyze_reference.mjs path/to/1906.mp4 [out.md]
// Everything written is measured; interpretive notes are explicitly absent (add them by hand under "Interpretation").
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";

const src = process.argv[2];
const out = process.argv[3] ?? "reports/reference-analysis/REFERENCE_MEASURED.md";
if (!src || !existsSync(src)) {
  console.error(`Reference video not found: ${src ?? "(no path given)"}`);
  process.exit(1);
}
const run = (bin, a) => spawnSync(bin, a, { encoding: "utf8", maxBuffer: 1 << 28 });
const p = JSON.parse(run(ffprobe.path, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", src]).stdout);
const v = p.streams.find((s) => s.codec_type === "video");
const a = p.streams.find((s) => s.codec_type === "audio");
const fps = v.r_frame_rate.split("/").reduce((x, y) => x / y);

// scene changes (threshold 0.25 on the FFmpeg scene score) with their frame numbers
const sc = run(ffmpeg, ["-hide_banner", "-nostats", "-i", src, "-vf", "select='gt(scene,0.25)',metadata=print:file=-", "-an", "-f", "null", "-"]);
const cuts = [...(sc.stdout + sc.stderr).matchAll(/pts_time:([\d.]+)[\s\S]*?lavfi\.scene_score=([\d.]+)/g)].map((m) => ({ t: +m[1], score: +m[2], frame: Math.round(+m[1] * fps) }));

const r128 = run(ffmpeg, ["-hide_banner", "-nostats", "-i", src, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
const sum = r128.slice(r128.lastIndexOf("Summary:"));
const sil = [...run(ffmpeg, ["-hide_banner", "-nostats", "-i", src, "-vn", "-af", "silencedetect=n=-50dB:d=0.2", "-f", "null", "-"]).stderr.matchAll(/silence_(start|end): ([\d.]+)/g)].map((m) => `${m[1]} ${(+m[2]).toFixed(2)}s`);
// dominant colours: 16 sampled frames reduced to a 1×1 average each
const cols = [];
for (let i = 0; i < 16; i++) {
  const t = (Number(p.format.duration) * (i + 0.5)) / 16;
  const r = spawnSync(ffmpeg, ["-v", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 20 });
  if (r.stdout?.length >= 3) cols.push(`#${[...r.stdout.subarray(0, 3)].map((x) => x.toString(16).padStart(2, "0")).join("")} @${t.toFixed(1)}s`);
}

const md = `# Measured reference facts — ${src}

*All values below were measured by FFprobe/FFmpeg in this run. Interpretation is intentionally not included.*

## Technical properties
- Container: ${p.format.format_name}, ${(Number(p.format.size) / 1e6).toFixed(1)} MB, duration ${Number(p.format.duration).toFixed(3)} s, bitrate ${(Number(p.format.bit_rate) / 1e6).toFixed(2)} Mb/s
- Video: ${v.codec_name} (${v.profile}), ${v.width}×${v.height}, ${v.r_frame_rate} fps (avg ${v.avg_frame_rate}), ${v.nb_read_frames} frames decoded, ${v.pix_fmt}, colour ${v.color_space}/${v.color_primaries}/${v.color_transfer}
- Audio: ${a ? `${a.codec_name}, ${a.sample_rate} Hz, ${a.channels} ch` : "none"}

## Scene-change detections (scene score > 0.25)
${cuts.length ? "| # | time (s) | frame | score |\n|---|---|---|---|\n" + cuts.map((c, i) => `| ${i + 1} | ${c.t.toFixed(3)} | ${c.frame} | ${c.score.toFixed(2)} |`).join("\n") : "none detected"}

Shot lengths (s): ${cuts.length ? cuts.map((c, i) => (c.t - (cuts[i - 1]?.t ?? 0)).toFixed(2)).join(", ") : "n/a"}

## Audio
\`\`\`
${sum.trim()}
\`\`\`
Silence (< −50 dB, ≥ 0.2 s): ${sil.join(", ") || "none"}

## Average colour of 16 evenly spaced frames
${cols.join("  ·  ")}
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md);
console.log("wrote", out, `(${cuts.length} cuts)`);
