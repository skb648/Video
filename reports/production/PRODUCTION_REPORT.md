# PRODUCTION REPORT — TOONFORGE ∞ "FORGE MOTION."

## Deliverables (all present)
| Item | Location |
|---|---|
| **Delivery MP4** (1080×1920, 60 fps, H.264 High L4.2, yuv420p, BT.709, AAC 48 kHz stereo, 30.000 s, 24.8 MB) | `public/toonforge-master.mp4` (also served from `dist/`) |
| Full-quality master (CRF 16, 114 MB) | `build/toonforge-master.mp4` (regenerate with `node scripts/render.mjs`) |
| Mastered soundtrack (32-bit float WAV) | `build/master.wav` |
| Source, scenes, animation/graphics/3D/shader/audio systems | `src/` |
| Lockfile / manifest | `package-lock.json` / `package.json` |
| Reference status, art direction, storyboard, QA | `reports/…`, `FINAL_QA_REPORT.md` |
| Install & reproduction | `README.md` |

## Phase log (gate = deliverable exists **and** the check was executed)
| Phase | Result |
|---|---|
| 01 Reference analysis | **Not performable** — `1906.mp4` absent. Documented honestly; measuring tool built and self-tested on the project's own render. |
| 02–04 Concept, art direction, storyboard | 3 concepts scored; "FORGE" chosen; `ART_DIRECTION.md`, `STORYBOARD.md`, contact sheet from the final file. |
| 05 Core animation | Béziers, springs, damped oscillation, anticipation, stagger, seeded hash noise; frame-pure. |
| 06 2D | Morphs, diagrams, HUD, kinetic type (12 treatments), sparks, tunnel, draw-on paths. |
| 07 3D | Software rasteriser: icosahedron, tubes, shards, lemniscate, studio-HDR chrome, depth-sorted pools; extruded + perspective-warped type. |
| 08 Shader | Single WebGL2 pass: bloom (mip chain), radial chroma, seeded glitch, scanlines, grain+dither, grade, vignette. |
| 09 Sound | ~600 scheduled voices; sidechain-style ducking; convolution reverb (seeded IR); ping-pong delay; BS.1770 loudness; lookahead limiter; 4× true-peak. |
| 10–12 Edit, preview, audit | Stills of 30+ frames inspected; defects fixed (see below). |
| 13 Defect correction | Bloom wash, boxy heat glow, glyph tops peeking through masks, diamond "square", leader/label collision, tube faceting (reduced), true-peak headroom after AAC. |
| 14 Final render | All 1800 frames rendered individually at their own timestamp (no duplication/interpolation), 30.1 min on 2 CPUs with software WebGL. |
| 15 Validation | 25/25 automated checks on both the full-quality master and the delivery file (`FINAL_QA_REPORT.md`). |

## Defects found by inspection and fixed
1. Milky full-frame wash from high mip bloom levels → bloom now uses local mips with a higher threshold.
2. Rectangular edges on the strike's heat glow → replaced by a scaled radial sprite.
3. Glyph tops visible under the bottom of mask boxes before entrance → clip boxes and start offsets corrected.
4. "SQUARE" drew as a diamond → polygon phase corrected for 4 sides.
5. Diagram leader line crossed its own labels → labels moved above the leader.
6. AAC overshoot left only ≈0.5 dB true-peak headroom → limiter ceiling −2.5 dBFS; delivered true peak −2.1 dBTP (FFmpeg ebur128).

## Known issues (not fixed — stated plainly)
- **"60 FPS" card (≈ frames 1320–1378):** the yellow "FPS" label overlaps the lower edge of the "60" numerals. Visible in the contact sheet. Needs a layout offset in `src/scenes/s5-overdrive.ts` (`FPS` baseline) and a re-render of those frames.
- **Emblem highlights (S4)** still show faint facet banding on the chrome tube (flat shading per quad; no Gouraud/normal interpolation).
- Colour handling uses gamma 2.2 as an approximation of the sRGB transfer for bloom/flash.
- The pre-render loudness normalisation is a single gain + limiter; there is no multiband mastering.
- Typography clipping, masks and composition were judged visually on sampled frames (≈30 stills + 12-frame sheet), **not** on all 1800 frames by machine; machine checks covered black/duplicate/flicker statistics on every frame.
- The in-app live preview depends on the viewer's GPU/CPU speed; frames may be skipped on slow devices (picture follows the audio clock). The MP4 is the reference output.
- Three.js / React Three Fiber / Remotion / GSAP / Vitest were deliberately **not** used (custom deterministic engine; Playwright + FFmpeg for rendering and validation). No automated unit-test suite exists beyond `scripts/validate.mjs`.

## Reproducibility
Rendering is deterministic by construction (frame-pure scenes, hashed randomness, seeded audio). A byte-identical MP4 is not guaranteed (x264 threading, AAC encoder), but frames and samples are.
