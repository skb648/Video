# FINAL QA REPORT — TOONFORGE ∞

Generated 2026-11-25T07:22:43.278Z by `node scripts/validate.mjs`. Every row below is the output of a command that was actually executed against `build/toonforge-master.mp4` (114.4 MB, 30.5 Mb/s). Nothing is claimed that was not measured.

**Result: 25/25 checks passed.**

| # | Check | Result | Measured |
|---|-------|--------|----------|
| 1 | Resolution 1080×1920 | PASS | 1080×1920 |
| 2 | Aspect ratio 9:16 | PASS | 1080/1920 |
| 3 | Frame rate 60 (r_frame_rate) | PASS | 60/1 |
| 4 | Average frame rate 60 | PASS | 60/1 |
| 5 | Frame count 1800 (decoded count) | PASS | nb_read_frames=1800, nb_frames=1800 |
| 6 | Codec H.264 | PASS | h264 High L42 |
| 7 | Pixel format yuv420p | PASS | yuv420p |
| 8 | Colour tags BT.709 | PASS | bt709/bt709/bt709, range tv |
| 9 | Container MP4 | PASS | mov,mp4,m4a,3gp,3g2,mj2 |
| 10 | Audio codec AAC | PASS | aac |
| 11 | Audio 48 kHz stereo | PASS | 48000 Hz, 2 ch |
| 12 | Duration 30.000 s (±0.05) | PASS | 30.0000 s |
| 13 | Audio/video duration match (±0.06 s) | PASS | video 30.000 s, audio 30.000 s |
| 14 | Constant frame rate (every PTS delta = 1/60 s) | PASS | 1800 packets, max deviation 6.67e-7 s |
| 15 | Full-file decode, zero errors | PASS | decoded 100% without warnings |
| 16 | Integrated loudness −14 LUFS (±1.0) | PASS | -14.3 LUFS (LRA 3.5 LU) |
| 17 | True peak ≤ −1.0 dBTP after AAC | PASS | -2.1 dBTP (ffmpeg ebur128 true-peak) |
| 18 | No clipping (max sample < 0 dBFS) | PASS | max_volume -2.1 dB |
| 19 | No unintended silence (>0.4 s below −50 dB before the final fade) | PASS | silence starts at 29.33s (expected only the final tail) |
| 20 | Clean ending (final 0.1 s ≤ −60 dB RMS) | PASS | RMS -113.442149 dB |
| 21 | Stage A: no unexpected black frames (authored fade-in 0–8 and fade-out 1738–1799 excluded) | PASS | 1800 frames analysed; 22 near-black frames, all inside the authored fade-out |
| 22 | Stage A: every frame analysed once | PASS | 1800 frame records |
| 23 | Stage A: no duplicated frames (native 60 fps; near-black fade-out frames cannot be compared) | PASS | every frame differs from its predecessor |
| 24 | Stage B: no unexplained flicker/hitches (large frame-to-frame jumps only on authored cuts/impacts) | PASS | max authored jump 212.6 |
| 25 | Contact sheet extracted from master | PASS | reports/storyboard/contact_sheet.jpg (12 frames, every 2.5 s) |

## Tools used
FFprobe (stream/packet inspection), FFmpeg 7.0.2-static https://john (full decode, ebur128, volumedetect, silencedetect, astats), per-frame statistics captured in-browser during the render (1800 frames, mean luma 33.9).

## What was NOT automated
- Typography clipping, mask correctness and composition quality were judged by **visual inspection of rendered frames** (reports/production/snaps and reports/storyboard/contact_sheet.jpg), not by a machine test.
- The reference video `1906.mp4` was not available in the environment, so no comparison against it could be performed (see REFERENCE_ANALYSIS.md).
- True-peak is the value reported by FFmpeg's ebur128 filter on the decoded AAC track.
