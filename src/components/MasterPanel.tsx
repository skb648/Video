import { useCallback, useEffect, useRef, useState } from "react";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { FPS, H, SAMPLE_RATE, TOTAL_FRAMES, W, timecode } from "../core/config";
import { buildMasteredAudio, encodeWav, type AudioReport } from "../audio/master";
import type { Studio } from "../pipeline/studio";

interface QaData {
  sizeMB?: number;
  bitrateMbps?: number;
  video?: {
    width: number;
    height: number;
    r_frame_rate: string;
    codec_name: string;
    pix_fmt: string;
    nb_frames: string;
  };
  loudness?: {
    I: number;
    LRA: number;
    TP: number;
  };
}

interface MasterPanelProps {
  studio: Studio | null;
  ready: boolean;
  qa: QaData | null;
  onJumpToFrame: (frame: number) => void;
}

const CONTACT_FRAMES = Array.from({ length: 12 }, (_, idx) => Math.round((idx * 2.5) * FPS));

export function MasterPanel({ studio, ready, qa, onJumpToFrame }: MasterPanelProps) {
  const [renderingMp4, setRenderingMp4] = useState(false);
  const [mp4Progress, setMp4Progress] = useState(0);
  const [mp4Stage, setMp4Stage] = useState("");
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [mp4Error, setMp4Error] = useState<string>("");
  const [exportFps, setExportFps] = useState<30 | 60>(30);
  const [exportScale, setExportScale] = useState<"540x960" | "1080x1920">("540x960");

  const [renderingWav, setRenderingWav] = useState(false);
  const [wavUrl, setWavUrl] = useState<string | null>(null);
  const [wavReport, setWavReport] = useState<AudioReport | null>(null);

  const cancelRef = useRef(false);

  useEffect(() => {
    return () => {
      if (mp4Url) URL.revokeObjectURL(mp4Url);
      if (wavUrl) URL.revokeObjectURL(wavUrl);
    };
  }, [mp4Url, wavUrl]);

  const handleExportWav = useCallback(async () => {
    if (renderingWav) return;
    setRenderingWav(true);
    try {
      const { channels, report } = await buildMasteredAudio();
      const bytes = encodeWav(channels, SAMPLE_RATE);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" });
      setWavUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setWavReport(report);
    } catch (err) {
      setMp4Error("Audio render failed: " + (err as Error).message);
    } finally {
      setRenderingWav(false);
    }
  }, [renderingWav]);

  const handleRenderMp4 = useCallback(async () => {
    if (!studio || !ready || renderingMp4) return;
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      setMp4Error("WebCodecs VideoEncoder is not available in this browser. Use the CLI script `node scripts/render.mjs` for FFmpeg H.264 mastering.");
      return;
    }

    cancelRef.current = false;
    setMp4Error("");
    setRenderingMp4(true);
    setMp4Progress(0);

    try {
      const outW = exportScale === "1080x1920" ? W : 540;
      const outH = exportScale === "1080x1920" ? H : 960;
      const step = exportFps === 60 ? 1 : 2;
      const totalOutFrames = Math.ceil(TOTAL_FRAMES / step);

      // Prepare optional AAC audio if AudioEncoder supports it
      let encodeAudio = false;
      let audioChannels: Float32Array[] | null = null;
      if (typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined") {
        try {
          const support = await AudioEncoder.isConfigSupported({
            codec: "mp4a.40.2",
            numberOfChannels: 2,
            sampleRate: SAMPLE_RATE,
            bitrate: 192_000,
          });
          if (support.supported) {
            setMp4Stage("Mastering offline soundtrack…");
            const mastered = await buildMasteredAudio();
            audioChannels = mastered.channels;
            setWavReport(mastered.report);
            encodeAudio = true;
          }
        } catch {
          encodeAudio = false;
        }
      }

      if (cancelRef.current) {
        setRenderingMp4(false);
        setMp4Stage("");
        return;
      }

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: outW,
          height: outH,
        },
        ...(encodeAudio
          ? {
              audio: {
                codec: "aac",
                numberOfChannels: 2,
                sampleRate: SAMPLE_RATE,
              },
            }
          : {}),
        fastStart: "in-memory",
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          throw e;
        },
      });

      const videoConfig: VideoEncoderConfig = {
        codec: outW >= 1080 ? "avc1.64002a" : "avc1.64001f",
        width: outW,
        height: outH,
        bitrate: outW >= 1080 ? 8_000_000 : 3_500_000,
        framerate: exportFps,
      };
      const videoSupport = await VideoEncoder.isConfigSupported(videoConfig);
      if (!videoSupport.supported) {
        throw new Error(`H.264 WebCodecs profile ${videoConfig.codec} unsupported in this browser.`);
      }
      videoEncoder.configure(videoConfig);

      // Scale canvas when rendering 540x960 preview master
      const scaleCanvas = outW !== W ? document.createElement("canvas") : null;
      const scaleCtx = scaleCanvas ? scaleCanvas.getContext("2d") : null;
      if (scaleCanvas) {
        scaleCanvas.width = outW;
        scaleCanvas.height = outH;
      }

      setMp4Stage(`Encoding ${totalOutFrames} frames (${outW}×${outH} @ ${exportFps} fps)…`);
      const frameDurationUs = Math.round(1_000_000 / exportFps);

      for (let i = 0; i < totalOutFrames; i++) {
        if (cancelRef.current) break;
        const srcFrame = Math.min(TOTAL_FRAMES - 1, i * step);
        studio.renderFrame(srcFrame);

        let sourceCanvas: HTMLCanvasElement = studio.out;
        if (scaleCanvas && scaleCtx) {
          scaleCtx.drawImage(studio.out, 0, 0, outW, outH);
          sourceCanvas = scaleCanvas;
        }

        const vf = new VideoFrame(sourceCanvas, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });
        videoEncoder.encode(vf, { keyFrame: i % exportFps === 0 });
        vf.close();

        if (i % 6 === 0) {
          setMp4Progress(Math.round(((i + 1) / totalOutFrames) * (encodeAudio ? 88 : 96)));
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (cancelRef.current) {
        videoEncoder.close();
        setRenderingMp4(false);
        setMp4Stage("");
        return;
      }

      await videoEncoder.flush();
      videoEncoder.close();

      if (encodeAudio && audioChannels) {
        setMp4Stage("Muxing AAC 48 kHz stereo soundtrack…");
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => {
            throw e;
          },
        });
        audioEncoder.configure({
          codec: "mp4a.40.2",
          numberOfChannels: 2,
          sampleRate: SAMPLE_RATE,
          bitrate: 192_000,
        });

        const totalSamples = audioChannels[0].length;
        const chunkSize = 4096;
        for (let offset = 0; offset < totalSamples; offset += chunkSize) {
          const count = Math.min(chunkSize, totalSamples - offset);
          const planar = new Float32Array(count * 2);
          planar.set(audioChannels[0].subarray(offset, offset + count), 0);
          planar.set(audioChannels[1].subarray(offset, offset + count), count);
          const ad = new AudioData({
            format: "f32-planar",
            sampleRate: SAMPLE_RATE,
            numberOfFrames: count,
            numberOfChannels: 2,
            timestamp: Math.round((offset / SAMPLE_RATE) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(ad);
          ad.close();
        }
        await audioEncoder.flush();
        audioEncoder.close();
      }

      setMp4Progress(100);
      setMp4Stage("Finalizing MP4 container…");
      muxer.finalize();

      const blob = new Blob([target.buffer], { type: "video/mp4" });
      setMp4Url((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setMp4Stage("");
    } catch (err) {
      setMp4Error((err as Error).message);
      setMp4Stage("");
    } finally {
      setRenderingMp4(false);
    }
  }, [studio, ready, renderingMp4, exportFps, exportScale]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5">
      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg tracking-[0.14em]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>
                  STORYBOARD CONTACT SHEET
                </h2>
                <p className="text-xs text-white/50">12 frames sampled every 2.5 s from the delivered 1080×1920 master — click any tile to inspect in Live Studio</p>
              </div>
              <span className="font-mono text-[11px] text-[#FF5A1F]">30.000 s · 1800 FRAMES</span>
            </div>

            <div className="relative overflow-hidden rounded border border-white/10 bg-black">
              <img
                src="/assets/contact_sheet.jpg"
                alt="12-frame storyboard contact sheet extracted from the TOONFORGE master film"
                className="block w-full h-auto"
              />
              <div className="absolute inset-0 grid grid-cols-6 grid-rows-2">
                {CONTACT_FRAMES.map((frameIdx, idx) => (
                  <button
                    key={frameIdx}
                    type="button"
                    onClick={() => onJumpToFrame(frameIdx)}
                    aria-label={`Inspect contact frame ${idx + 1} at ${timecode(frameIdx)}`}
                    className="group relative border border-transparent transition hover:border-[#FF5A1F]/80 hover:bg-[#FF5A1F]/10 focus:outline-none focus:ring-2 focus:ring-[#FF5A1F]"
                  >
                    <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-[#FF5A1F] opacity-0 transition group-hover:opacity-100">
                      F{String(frameIdx).padStart(4, "0")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-white/60">Mastered Audio Waveform (48 kHz Stereo)</h3>
              {qa?.loudness && (
                <span className="font-mono text-xs text-white/55">
                  {qa.loudness.I} LUFS · LRA {qa.loudness.LRA} LU · {qa.loudness.TP} dBTP
                </span>
              )}
            </div>
            <img
              src="/assets/waveform.png"
              alt="Stereo waveform of the procedural mastered soundtrack"
              className="w-full rounded border border-white/10 bg-black"
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#FF5A1F]">In-Browser Mastering</span>
              <h2 className="mt-1 text-xl tracking-[0.12em]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>
                EXPORT MASTER
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Encode a deterministic H.264 MP4 directly from the WebGL2 renderer via WebCodecs &amp; <code className="font-mono">mp4-muxer</code>, or export the BS.1770 mastered 32-bit WAV stem.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Resolution</span>
                <select
                  aria-label="Export resolution"
                  disabled={renderingMp4}
                  value={exportScale}
                  onChange={(e) => setExportScale(e.target.value as "540x960" | "1080x1920")}
                  className="rounded border border-white/15 bg-[#0C0E14] px-2.5 py-2 font-mono text-xs text-[#F4EFE6]"
                >
                  <option value="540x960">540×960 (Fast)</option>
                  <option value="1080x1920">1080×1920 (Full)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Frame Rate</span>
                <select
                  aria-label="Export frame rate"
                  disabled={renderingMp4}
                  value={exportFps}
                  onChange={(e) => setExportFps(Number(e.target.value) as 30 | 60)}
                  className="rounded border border-white/15 bg-[#0C0E14] px-2.5 py-2 font-mono text-xs text-[#F4EFE6]"
                >
                  <option value={30}>30 fps (900f)</option>
                  <option value={60}>60 fps (1800f)</option>
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              {!renderingMp4 ? (
                <button
                  type="button"
                  disabled={!ready}
                  onClick={handleRenderMp4}
                  className="w-full rounded bg-[#FF5A1F] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-[#ff723f] disabled:opacity-40"
                >
                  Render MP4 in Browser
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                  className="w-full rounded border border-red-400/50 bg-red-950/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-red-200 hover:bg-red-900/50"
                >
                  Cancel Render ({mp4Progress}%)
                </button>
              )}

              <button
                type="button"
                disabled={renderingWav}
                onClick={handleExportWav}
                className="w-full rounded border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.16em] text-white/85 transition hover:bg-white/10 disabled:opacity-40"
              >
                {renderingWav ? "Synthesising WAV…" : "Render Mastered WAV (48 kHz)"}
              </button>
            </div>

            {renderingMp4 && (
              <div className="space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                  <div className="h-full bg-[#FF5A1F] transition-all" style={{ width: `${mp4Progress}%` }} />
                </div>
                <p className="font-mono text-[11px] text-white/60">{mp4Stage}</p>
              </div>
            )}

            {mp4Error && (
              <p className="rounded border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-200">{mp4Error}</p>
            )}

            {mp4Url && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <video
                  className="mx-auto w-full max-w-[240px] rounded border border-white/15 bg-black"
                  style={{ aspectRatio: "9 / 16" }}
                  src={mp4Url}
                  controls
                  playsInline
                />
                <a
                  href={mp4Url}
                  download={`toonforge-master-${exportScale}-${exportFps}fps.mp4`}
                  className="block w-full rounded bg-emerald-400 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-black hover:bg-emerald-300"
                >
                  Download Rendered MP4
                </a>
              </div>
            )}

            {wavUrl && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <audio className="w-full" controls src={wavUrl} />
                <a
                  href={wavUrl}
                  download="toonforge-master-48k.wav"
                  className="block w-full rounded border border-[#35E3FF]/50 bg-[#35E3FF]/10 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[#35E3FF] hover:bg-[#35E3FF]/20"
                >
                  Download Mastered WAV
                </a>
                {wavReport && (
                  <p className="font-mono text-[11px] text-white/50">
                    {wavReport.integratedLUFS.toFixed(1)} LUFS · {wavReport.truePeakDBTP.toFixed(2)} dBTP · {wavReport.clippedSamples} clipped
                  </p>
                )}
              </div>
            )}
          </div>

          {qa?.video && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/50">Verified Delivery Spec (FFprobe)</h3>
              <dl className="grid grid-cols-[90px_1fr] gap-y-1 font-mono text-xs">
                <dt className="text-white/45">Frame</dt>
                <dd>{qa.video.width}×{qa.video.height} (9:16)</dd>
                <dt className="text-white/45">Rate</dt>
                <dd>{qa.video.r_frame_rate} fps · {qa.video.nb_frames}f</dd>
                <dt className="text-white/45">Video</dt>
                <dd>{qa.video.codec_name.toUpperCase()} · {qa.video.pix_fmt}</dd>
                <dt className="text-white/45">Bitrate</dt>
                <dd>{qa.bitrateMbps ?? 6.6} Mbps ({qa.sizeMB ?? 24.8} MB)</dd>
              </dl>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
