// Stage E (+A/D) validation of the delivered master. Every statement in the report comes from a command executed here.
// Usage: node scripts/validate.mjs [path/to/master.mp4]
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";

const file = process.argv[2] ?? "build/toonforge-master.mp4";
const FFP = ffprobe.path;
const run = (bin, a) => spawnSync(bin, a, { encoding: "utf8", maxBuffer: 1 << 28 });
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail: String(detail) }); console.log(pass ? "PASS" : "FAIL", name, "-", detail); };

if (!existsSync(file)) throw new Error("missing " + file);

/* ---- container / stream properties ---- */
const probe = JSON.parse(run(FFP, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file]).stdout);
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
check("Resolution 1080×1920", v.width === 1080 && v.height === 1920, `${v.width}×${v.height}`);
check("Aspect ratio 9:16", v.width * 16 === v.height * 9, `${v.width}/${v.height}`);
check("Frame rate 60 (r_frame_rate)", v.r_frame_rate === "60/1", v.r_frame_rate);
check("Average frame rate 60", v.avg_frame_rate === "60/1", v.avg_frame_rate);
check("Frame count 1800 (decoded count)", Number(v.nb_read_frames) === 1800, `nb_read_frames=${v.nb_read_frames}, nb_frames=${v.nb_frames}`);
check("Codec H.264", v.codec_name === "h264", `${v.codec_name} ${v.profile} L${v.level}`);
check("Pixel format yuv420p", v.pix_fmt === "yuv420p", v.pix_fmt);
check("Colour tags BT.709", v.color_space === "bt709" && v.color_primaries === "bt709" && v.color_transfer === "bt709", `${v.color_space}/${v.color_primaries}/${v.color_transfer}, range ${v.color_range}`);
check("Container MP4", /mp4/.test(probe.format.format_name), probe.format.format_name);
check("Audio codec AAC", a?.codec_name === "aac", a?.codec_name);
check("Audio 48 kHz stereo", a?.sample_rate === "48000" && a?.channels === 2, `${a?.sample_rate} Hz, ${a?.channels} ch`);
const dur = Number(probe.format.duration);
check("Duration 30.000 s (±0.05)", Math.abs(dur - 30) < 0.05, `${dur.toFixed(4)} s`);
check("Audio/video duration match (±0.06 s)", Math.abs(Number(a.duration) - Number(v.duration)) < 0.06, `video ${Number(v.duration).toFixed(3)} s, audio ${Number(a.duration).toFixed(3)} s`);

/* ---- constant frame rate: inspect every packet timestamp ---- */
const pk = run(FFP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", file]).stdout.trim().split("\n").map(Number).sort((x, y) => x - y);
let maxDev = 0;
for (let i = 1; i < pk.length; i++) maxDev = Math.max(maxDev, Math.abs(pk[i] - pk[i - 1] - 1 / 60));
check("Constant frame rate (every PTS delta = 1/60 s)", pk.length === 1800 && maxDev < 1e-4, `${pk.length} packets, max deviation ${maxDev.toExponential(2)} s`);

/* ---- full decode ---- */
const dec = run(ffmpeg, ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"]);
check("Full-file decode, zero errors", dec.status === 0 && dec.stderr.trim() === "", dec.stderr.trim() || "decoded 100% without warnings");

/* ---- audio: EBU R128 on the delivered AAC track ---- */
const r128 = run(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
const sum = r128.slice(r128.lastIndexOf("Summary:"));
const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]);
const LRA = Number(/LRA:\s+([\d.]+) LU/.exec(sum)?.[1]);
const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)?.[1]);
check("Integrated loudness −14 LUFS (±1.0)", Math.abs(I + 14) <= 1, `${I} LUFS (LRA ${LRA} LU)`);
check("True peak ≤ −1.0 dBTP after AAC", TP <= -1.0, `${TP} dBTP (ffmpeg ebur128 true-peak)`);
const vd = run(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"]).stderr;
const maxVol = Number(/max_volume:\s+(-?[\d.]+) dB/.exec(vd)?.[1]);
check("No clipping (max sample < 0 dBFS)", maxVol < -0.1, `max_volume ${maxVol} dB`);
const sil = run(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "silencedetect=n=-50dB:d=0.4", "-f", "null", "-"]).stderr;
const silences = [...sil.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
const unexpected = silences.filter((s) => s > 0.5 && s < 29.0);
check("No unintended silence (>0.4 s below −50 dB before the final fade)", unexpected.length === 0, silences.length ? `silence starts at ${silences.map((s) => s.toFixed(2) + "s").join(", ")} (expected only the final tail)` : "none detected");
const hdAudio = run(ffmpeg, ["-hide_banner", "-nostats", "-ss", "29.9", "-i", file, "-vn", "-af", "astats=metadata=0", "-f", "null", "-"]).stderr;
const endRms = Number(/RMS level dB:\s+(-?[\d.inf]+)/.exec(hdAudio)?.[1] ?? -99);
check("Clean ending (final 0.1 s ≤ −60 dB RMS)", endRms <= -60 || Number.isNaN(endRms), `RMS ${endRms} dB`);

/* ---- per-frame statistics gathered during the render (Stage A) ---- */
let frameDetail = "frame_stats.json not found";
if (existsSync("reports/quality-assurance/frame_stats.json")) {
  const st = JSON.parse(readFileSync("reports/quality-assurance/frame_stats.json", "utf8"));
  const tl = readFileSync("src/core/timeline.ts", "utf8");
  const cuts = new Set([...tl.matchAll(/\bf:\s*(\d+)/g)].map((m) => Number(m[1])));
  [0, 240, 600, 960, 1200, 1560].forEach((x) => cuts.add(x));
  const near = (f) => [...cuts].some((c) => f >= c - 1 && f <= c + 40);
  const black = st.filter((s) => s.mean < 1.2 && s.f > 8 && s.f < 1738); // 0–8 = authored fade-in, 1738–1799 = authored fade-out (fxAt)
  const fadeBlack = st.filter((s) => s.mean < 1.2 && s.f >= 1738).length;
  check("Stage A: no unexpected black frames (authored fade-in 0–8 and fade-out 1738–1799 excluded)", black.length === 0, black.length ? `frames ${black.slice(0, 10).map((s) => s.f).join(",")}` : `${st.length} frames analysed; ${fadeBlack} near-black frames, all inside the authored fade-out`);
  check("Stage A: every frame analysed once", st.length === 1800 && st.every((s, i) => s.f === i), `${st.length} frame records`);
  const dups = st.filter((s) => s.diff === 0 && s.f > 0 && s.mean >= 1.2);
  check("Stage A: no duplicated frames (native 60 fps; near-black fade-out frames cannot be compared)", dups.length === 0, dups.length ? `identical to previous: ${dups.slice(0, 10).map((s) => s.f).join(",")}` : "every frame differs from its predecessor");
  const spikes = st.filter((s) => s.diff > 55 && !near(s.f));
  check("Stage B: no unexplained flicker/hitches (large frame-to-frame jumps only on authored cuts/impacts)", spikes.length === 0, spikes.length ? `unexplained: ${spikes.slice(0, 10).map((s) => `${s.f}(${s.diff.toFixed(0)})`).join(",")}` : `max authored jump ${Math.max(...st.map((s) => s.diff)).toFixed(1)}`);
  frameDetail = `${st.length} frames, mean luma ${(st.reduce((x, s) => x + s.mean, 0) / st.length).toFixed(1)}`;
}

/* ---- contact sheet from the final file ---- */
mkdirSync("reports/storyboard", { recursive: true });
const cs = run(ffmpeg, ["-y", "-v", "error", "-i", file, "-vf", "select='not(mod(n,150))',scale=270:480,tile=6x2:padding=6:color=0x07080B", "-frames:v", "1", "-update", "1", "reports/storyboard/contact_sheet.jpg"]);
check("Contact sheet extracted from master", cs.status === 0 && existsSync("reports/storyboard/contact_sheet.jpg"), "reports/storyboard/contact_sheet.jpg (12 frames, every 2.5 s)");

/* ---- outputs ---- */
const size = statSync(file).size;
const bitrate = (size * 8) / dur / 1e6;
const qa = { generated: new Date().toISOString(), file, sizeMB: +(size / 1e6).toFixed(1), bitrateMbps: +bitrate.toFixed(1), video: v, audio: a, loudness: { I, LRA, TP }, frameDetail, checks };
writeFileSync("src/generated/qa.json", JSON.stringify({ ...qa, video: { width: v.width, height: v.height, r_frame_rate: v.r_frame_rate, codec_name: v.codec_name, pix_fmt: v.pix_fmt, nb_frames: v.nb_read_frames } }, null, 1));
const passed = checks.filter((c) => c.pass).length;
const md = `# FINAL QA REPORT — TOONFORGE ∞

Generated ${qa.generated} by \`node scripts/validate.mjs\`. Every row below is the output of a command that was actually executed against \`${file}\` (${qa.sizeMB} MB, ${qa.bitrateMbps} Mb/s). Nothing is claimed that was not measured.

**Result: ${passed}/${checks.length} checks passed.**

| # | Check | Result | Measured |
|---|-------|--------|----------|
${checks.map((c, i) => `| ${i + 1} | ${c.name} | ${c.pass ? "PASS" : "**FAIL**"} | ${c.detail.replace(/\|/g, "/")} |`).join("\n")}

## Tools used
FFprobe (stream/packet inspection), FFmpeg ${run(ffmpeg, ["-version"]).stdout.split("\n")[0].slice(15, 40)} (full decode, ebur128, volumedetect, silencedetect, astats), per-frame statistics captured in-browser during the render (${frameDetail}).

## What was NOT automated
- Typography clipping, mask correctness and composition quality were judged by **visual inspection of rendered frames** (reports/production/snaps and reports/storyboard/contact_sheet.jpg), not by a machine test.
- The reference video \`1906.mp4\` was not available in the environment, so no comparison against it could be performed (see REFERENCE_ANALYSIS.md).
- True-peak is the value reported by FFmpeg's ebur128 filter on the decoded AAC track.
`;
writeFileSync("FINAL_QA_REPORT.md", md);
writeFileSync("reports/quality-assurance/FINAL_QA_REPORT.md", md);
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 2);
