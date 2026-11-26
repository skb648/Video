# REFERENCE_ANALYSIS — PHASE 01 status

## Finding (measured fact)
**The reference video `1906.mp4` was not present in the production environment.**

Commands executed at the start of production:

```
find / -iname "1906*" -not -path "*/proc/*"      → no result
ls <project root>                                 → package.json, src/, vite.config.ts, index.html, tsconfig.json
which ffmpeg ffprobe                              → neither installed (static builds were later installed via npm)
```

The only prior information about the reference is the brief's mention of "an earlier summary" which was also not
supplied. Consequently:

- **No frame extraction, scene-cut detection, motion estimation, colour sampling or audio analysis of 1906.mp4 was
  performed.** None is claimed.
- **No scene breakdown, transition taxonomy, typography analysis or music-structure analysis of the reference exists
  in this report**, because writing one would be fabrication.

## What was built instead so the analysis can be run the moment the file exists
`scripts/analyze_reference.mjs <path-to-1906.mp4>` performs, with FFprobe/FFmpeg only, a real measurement pass and
writes `reports/reference-analysis/REFERENCE_MEASURED.md`:

| Measurement | Method |
|---|---|
| Container, codec, resolution, fps, exact decoded frame count | `ffprobe -count_frames` |
| Cut list with frame numbers + shot lengths | `select='gt(scene,0.25)'` scene score |
| Integrated loudness, LRA, true-peak | `ebur128=peak=true` |
| Silent passages | `silencedetect` |
| Colour of 16 evenly spaced frames | 1×1 downscale of sampled frames |

The script was validated on the project's own master render (see `reports/reference-analysis/SELF_TEST_master.md`),
which proves the tooling works, but it says nothing about 1906.mp4.

## Consequence for the creative work
`ART_DIRECTION.md` documents an **original** direction (forge / ember / hairline-anvil) chosen from three internally
developed concepts. It is not derived from, and makes no claim of similarity to, the missing reference. When
1906.mp4 is supplied, run the script and append an *Interpretation* section; any divergence should then be reviewed
by the creative director.

## Measured vs interpreted
| Category | Status |
|---|---|
| Measured facts about 1906.mp4 | **none available** |
| Interpretation of 1906.mp4 | **none available** |
