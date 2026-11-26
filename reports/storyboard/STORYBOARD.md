# STORYBOARD — TOONFORGE ∞ (1800 frames · 60 fps · 30.000 s · 1080×1920)

The contact sheet `contact_sheet.jpg` in this folder is extracted **from the final MP4** (12 frames, every 2.5 s) by `scripts/validate.mjs`.
Per-scene planning data lives in code at `src/core/timeline.ts` (`SCENES`) so the plan and the edit cannot drift; the table below mirrors it.

| # | Act | Frames (time) | Narrative purpose | Composition & camera | Typography | 2D | 3D | Transition out | Sound |
|---|---|---|---|---|---|---|---|---|---|
| 1 | HOOK | 0–239 (0–4 s) | Promise: everything begins from one point of light | Locked wide; hairline at 54 % height; ember falls on the centre axis | "ONE / SPARK." Anton 290 px standing on the line; mono caption typed on | Hairline, ember trail, tracking readout, 300 ballistic sparks, flat shock ring | — | Match-cut: the hairline is the horizon of S2 | Silence/drone → whistle → sub boom + metal strike + crackle |
| 2 | DEVELOPMENT | 240–599 (4–10 s) | Show craft: form from a line | Low horizon; shape on the upper third; constant dolly over a perspective grid | 5 words (LINE / CIRCLE / SQUARE / TRIANGLE / FORM), five different choreographies | Pointwise morph, compass ring, vertices, diagram leader + readouts, chapter rail | Projected floor grid | Circle iris: final disc becomes a window onto S3 | Kick enters, bass, hats, claps, plucks, UI ticks, whooshes |
| 3 | ESCALATION | 600–959 (10–16 s) | Add dimension and tension, then withdraw everything | Object low-centre, title high-left; orbit + dolly; accelerating spin | Perspective-warped extruded "BUILD IN / DEPTH" | Dashed orbit guides, counters, wireframe blueprint overlay, annotation | Faceted chrome icosahedron, 3 rings, 72 shards (single depth-sorted pool) | Implosion to the ember; 0.5 s of visual/aural silence with two heartbeats | Pad, riser, snare roll, hard drop-out at 15.5 s |
| 4 | REVEAL | 960–1199 (16–20 s) | The payoff: brand + emblem | Emblem low-centre (same position the dot died), title above; slow dolly; stillness 1130–1180 | Extruded TOONFORGE with turning perspective and specular sweep | Shock rings, speed lines, 360 sparks, hairline rules, parametric readout | Chrome lemniscate tube drawn on along the curve | Hard cut on the beat (flash + RGB split) | Boom, metal, pad swell, bell motif, riser |
| 5 | CLIMAX | 1200–1559 (20–26 s) | Release: state the craft at maximum density | Full-bleed; bg flips orange/ink/bone/ink each beat, then hex tunnel; freeze at 1470 | 2D · 3D · VFX · SOUND · 60 · EVERY / FRAME / FORGED. | Rings, wave ribbons, scan grid, counter, 400 sparks, tunnel | Extruded 3D numerals / manifesto | Time-remap stop → dissolve through black | Full drop, glitch stutters, tape-stop at the freeze |
| 6 | RESOLUTION | 1560–1799 (26–30 s) | Calm: the mark, the name, the promise | Quiet centred lock-up; large negative space | Wordmark tracked +0.12 em; mono tagline + spec row | Single-line ∞ draw-on, hairline callback with breathing ember | — | Fade to black; 0.56 s measured silent tail | Am9 pad, sparse bells, low final note |

## Internal review before render (gate)
- Beat grid: every scene boundary falls on a bar line (120-frame bars). ✔ (by construction, `timeline.ts`)
- Pattern interruption: bg colour flips (S5), five different word styles (S2), one 0.5 s silence (S3→S4). ✔
- Progressive complexity: 2D line → morph → 3D → emblem → montage → single line. ✔
- Callback: the ember (S1, S3 collapse, S4 detonation, S6 head/pulse). ✔
