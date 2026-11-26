# TOONFORGE ∞ — procedural cinematic motion-picture studio

A 30-second, 1080×1920, native 60 fps brand film ("FORGE MOTION.") generated entirely from code: deterministic Canvas2D
typography/vector/3D compositing, a WebGL2 post pass, an offline-synthesised soundtrack, and an FFmpeg master encode.

## What is in the box
| Path | Purpose |
|---|---|
| `src/core` | master config (60 fps, 120 BPM, 1800 frames), seeded math, **editorial timeline** (scenes, sync events, scripts, per-frame post FX) |
| `src/motion` | cubic Bézier, springs, damped oscillation, anticipation, stagger |
| `src/creative` | colour system |
| `src/typography` | kerned layout, per-glyph FX, masks, extrusion, perspective warp, kinetic word choreographies |
| `src/graphics` | glow sprites, ballistic sparks, morphing outlines, lemniscate, HUD |
| `src/three` | deterministic software 3D (meshes, studio-HDR chrome shading, depth-sorted polygon pool) |
| `src/shaders` | WebGL2 post: mip-chain bloom, radial chroma, seeded glitch, grain + dither, grade, vignette |
| `src/audio` | procedural score + mix (OfflineAudioContext), BS.1770 loudness, lookahead limiter, true-peak, WAV |
| `src/scenes` | the six scenes |
| `src/pipeline` | compositor, automation hooks (`window.__tf`) |
| `scripts` | `render.mjs` (master), `validate.mjs` (QA), `snap.mjs` (frame stills), `audio.mjs`, `analyze_reference.mjs` |
| `reports` | reference status, art direction, storyboard, production + QA reports |
| `public/toonforge-master.mp4` | the delivered master |

**Design note:** the 3D is a purpose-built software rasteriser (not Three.js/R3F). It keeps the compositor to one 2D canvas plus one
shader pass, makes output bit-identical across machines and keeps memory low. Reflections are an analytic studio-HDR
approximation, not path tracing.

## Install
```bash
npm install
npx playwright install chromium        # headless renderer
# Linux only, if Chromium reports missing libraries:
sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 libatspi2.0-0
```
FFmpeg and FFprobe come from the `ffmpeg-static` / `ffprobe-static` dev dependencies.

## Reproduce
```bash
npm run build                          # builds dist/index.html (single file)
node scripts/render.mjs                # audio master + all 1800 frames → build/toonforge-master.mp4  (≈20–30 min on 2 CPUs, software GL)
cp build/toonforge-master.mp4 public/  # so the Master tab can play it
node scripts/validate.mjs              # FFprobe / full decode / EBU R128 / frame statistics → FINAL_QA_REPORT.md
npm run build                          # re-bundle QA data into the app
```
Other tools: `node scripts/snap.mjs 90 960 1410` (PNG stills in `reports/production/snaps`), `node scripts/render.mjs --preview`
(same frames, fast encode), `node scripts/analyze_reference.mjs path/to/1906.mp4`.

## Interactive studio
`npm run dev` (or open `dist/index.html`): scrub the timeline frame-by-frame, play with sound (picture clock follows the audio clock), inspect the
editorial table, view the master MP4 and the QA results.

## Determinism
`frame(n)` is a pure function of `n`: no accumulated state, randomness is an integer hash of (seed, index), shader noise is a hash of (pixel, frame),
audio noise is a seeded buffer. Re-running the render reproduces the same pixels and samples.
