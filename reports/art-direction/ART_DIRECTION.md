# ART_DIRECTION — TOONFORGE ∞ "FORGE MOTION."

## 1. Concept selection
Three genuinely different directions were developed and scored (1–5) against the brief's criteria.

| Criterion | A · **FORGE** (ember strikes a hairline anvil; geometry is hammered into a brand) | B · SIGNAL (cold blueprint lattice, cyan wireframe world) | C · CUT-PAPER TOON (flat playful shapes, stop-motion feel) |
|---|---|---|---|
| Originality | 4 | 3 | 4 |
| Visual impact (9:16, mobile) | 5 | 3 | 3 |
| Storytelling (hook→resolution) | 5 | 3 | 3 |
| Readability | 5 | 4 | 4 |
| Animation potential (2D+3D+VFX) | 5 | 4 | 3 |
| Audio potential (impacts, metal, sparks) | 5 | 3 | 3 |
| Feasibility (Canvas2D + software 3D, deterministic) | 4 | 5 | 3 |
| Consistency | 5 | 5 | 4 |
| Retention | 5 | 3 | 3 |
| **Total** | **43** | **33** | **30** |

**Chosen: A.** B was rejected as visually cold and sonically thin; C needs hand-drawn texture authoring that a
procedural pipeline would only imitate. Cyan from B survives as the single *contrast* accent, never as a second theme.

**Concept:** a film about making a film. One ember falls onto a hairline; sparks fly; the hairline becomes a horizon;
geometry is forged from a line; a chrome core is built, overspun and collapses back into the same ember; it detonates into
the infinity emblem and brand; an overdrive montage states the craft; the emblem is finally drawn in one quiet line.
The ember is the recurring *visual callback* (S1 → S2 horizon carry → S3 collapse → S4 detonation → S6 draw-on head).

## 2. Visual identity & philosophy
Restraint with a few violent peaks. Large amounts of ink-black negative space, one light source family (fire), one cold
contrast (cyan) used for measurement/diagram language only. Editorial HUD (timecode, scene index, progress hairline) frames
the piece as a *production*, and drops away for the reveal.

## 3. Colour system (sRGB authoring → BT.709 delivery)
| Role | Name | Value |
|---|---|---|
| Background | Ink | `#07080B` |
| Surface | Ink-2 | `#0E1117` |
| Neutral line | Steel / Mist | `#2A303B` / `#78808E` |
| Primary light | Bone | `#F4EFE6` |
| Accent | Ember / Molten / Gold | `#FF5A1F` / `#FF8A2B` / `#FFC24D` |
| Highlight | Hot | `#FFF1D6` |
| Shadow of fire family | Deep | `#6B1D0B` |
| Contrast accent | Cyan | `#35E3FF` |

Colour handling: all 2D/3D drawing is display-referred sRGB. The post shader linearises (gamma 2.2) only for bloom and
flash addition, re-encodes, then grades. The encode converts RGB→YUV with the **BT.709 matrix, limited range**, and tags
BT.709 primaries/transfer/matrix. (Gamma 2.2 is used as a documented approximation of the sRGB curve.)

## 4. Typography system
- **Display — Anton** (condensed grotesque; all hero words). Tracking −0.01…+0.12 em depending on role.
- **UI — Space Grotesk Variable** (loaded; weight axis available for UI text).
- **Data — JetBrains Mono** (timecode, labels, diagram readouts, tracked +0.1…0.34 em).
- Kerning is derived at layout time from pair metrics (`w(ab) − w(a) − w(b)`), tracking added per glyph.
- Hierarchy rule: one dominant word per frame; mono labels are ≤ 26 px at 1080 px width and kept out of the platform UI zones where they matter.
- Treatments (each used once or twice, never repeated back-to-back): masked rise, spring pop, slice, bounce drop, scramble-resolve,
  slam, extrude, glitch-slice, waveform-underlay, rolling counter, stacked manifesto, tracked wordmark.

## 5. Shape, material, lighting language
- **Shape:** hairline (1–2 px) vs. massive solid; circle/square/triangle primitives, hexagon tunnel, lemniscate (∞) as the signature curve.
- **Material:** polished chrome / copper reflecting a studio-HDR (warm horizon band, white key softbox, cyan strip, ember rim); forged dark-steel shards with ember rim light; extruded type with fire-gradient walls.
- **Lighting:** key high-left, cyan strip right, ember rim behind. Lights live in view space (a camera-attached rig), so reflections slide convincingly as objects spin. Real-time analytic approximation — **not** path tracing.

## 6. Motion language
Three speeds: *hairline slow* (expo-out draws), *mechanical snap* (cubic-bezier 0.76,0,0.18,1), *impact* (exp-decay shake + chroma + flash).
Springs for arrivals (pop, wordmark), anticipation dip on exits, accelerating spin before collapse, time-remap deceleration to a freeze.
Everything is a closed-form function of the frame number; randomness is a seeded integer hash. Hits follow a 120 BPM grid (30-frame beat).

## 7. Sound identity
Metal + fire + low sub. Strike = sub boom + inharmonic partials (1 : 2.76 : 5.4 : 8.93 : 13.3) + spark crackle. Groove in A minor (Am–F–G), kick with sidechain-style
ducking of music bus, offbeat hats, claps on 2/4, arpeggiated plucks with ping-pong delay. A 0.5 s *dry* dropout before the reveal. Bells for the emblem and resolution.

## 8. Scene progression
HOOK (S1 Ignition 0–4 s) → DEVELOPMENT (S2 Structure 4–10 s) → ESCALATION (S3 Depth 10–16 s, with a 0.5 s silence) → REVEAL (S4 16–20 s) →
CLIMAX (S5 Overdrive 20–26 s) → RESOLUTION (S6 Resolve 26–30 s).
