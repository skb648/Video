import { useCallback, useEffect, useRef, useState } from "react";
import { installHooks } from "./pipeline/hooks";
import { buildMasteredAudio, type AudioReport } from "./audio/master";
import { BEAT, FPS, SAMPLE_RATE, TOTAL_FRAMES, timecode } from "./core/config";
import { IMPACTS, SCENES, sceneAt } from "./core/timeline";
import { MasterPanel } from "./components/MasterPanel";
import qaData from "./generated/qa.json";

type Tab = "live" | "master" | "edit" | "qa";
const ACT_COLORS = ["#FF5A1F", "#35E3FF", "#FF8A2B", "#F4EFE6", "#FFC24D", "#7a8294"];
const HERO_FRAMES: Record<string, number> = {
  ignition: 150,
  structure: 450,
  depth: 740,
  reveal: 1080,
  climax: 1500,
  resolve: 1680,
};

interface AudioState {
  ctx?: AudioContext;
  buf?: AudioBuffer;
  src?: AudioBufferSourceNode | null;
  t0: number;
  f0: number;
  report?: AudioReport;
}

function getInitialFrame(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("frame");
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.floor(parsed)));
    }
  }
  return HERO_FRAMES.ignition;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<number>(() => getInitialFrame());
  const [playing, setPlaying] = useState(false);
  const [audioMsg, setAudioMsg] = useState<string>("");
  const [report, setReport] = useState<AudioReport | null>(null);
  const [error, setError] = useState<string>("");

  const api = useRef<ReturnType<typeof installHooks> | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioState>({ t0: 0, f0: 0, src: null });
  const clock = useRef({ t0: 0, f0: 0 });
  const shown = useRef(-1);
  const frameRef = useRef(frame);
  const playRef = useRef(false);
  const scrubbingRef = useRef(false);

  const draw = useCallback((f: number) => {
    const fi = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.floor(f)));
    if (fi !== shown.current && api.current) {
      api.current.studio.renderFrame(fi);
      shown.current = fi;
    }
    frameRef.current = fi;
    setFrame(fi);
  }, []);

  useEffect(() => {
    try {
      const a = installHooks();
      api.current = a;
      if (host.current && !host.current.contains(a.studio.out)) {
        host.current.appendChild(a.studio.out);
      }
      a.studio.out.className = "h-full w-full block";
      a.init()
        .then(() => {
          setReady(true);
          draw(frameRef.current);
        })
        .catch((e: Error) => setError(e.message));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [draw]);

  // keep the canvas mounted in the live tab
  useEffect(() => {
    if (tab === "live" && api.current && host.current && !host.current.contains(api.current.studio.out)) {
      host.current.appendChild(api.current.studio.out);
    }
  }, [tab]);

  const stopSrc = useCallback(() => {
    const a = audio.current;
    try {
      a.src?.stop();
    } catch {
      /* already stopped */
    }
    a.src = null;
  }, []);

  const startSrc = useCallback((from: number) => {
    const a = audio.current;
    if (!a.ctx || !a.buf) return;
    stopSrc();
    const s = a.ctx.createBufferSource();
    s.buffer = a.buf;
    s.connect(a.ctx.destination);
    s.start(0, from / FPS);
    a.src = s;
    a.t0 = a.ctx.currentTime;
    a.f0 = from;
  }, [stopSrc]);

  const ensureAudio = useCallback(async () => {
    const a = audio.current;
    if (!a.ctx) a.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (a.ctx.state === "suspended") await a.ctx.resume();
    if (!a.buf) {
      setAudioMsg("Rendering & mastering soundtrack (offline, deterministic)…");
      try {
        const { channels, report: r } = await buildMasteredAudio();
        const b = a.ctx.createBuffer(2, channels[0].length, SAMPLE_RATE);
        b.copyToChannel(channels[0] as Float32Array<ArrayBuffer>, 0);
        b.copyToChannel(channels[1] as Float32Array<ArrayBuffer>, 1);
        a.buf = b;
        a.report = r;
        setReport(r);
        setAudioMsg("");
      } catch (e) {
        setAudioMsg("Audio unavailable: " + (e as Error).message);
      }
    }
  }, []);

  const play = useCallback(async (from = frameRef.current) => {
    if (!ready) return;
    const start = from >= TOTAL_FRAMES - 2 ? 0 : from;
    await ensureAudio();
    clock.current = { t0: performance.now(), f0: start };
    startSrc(start);
    playRef.current = true;
    setPlaying(true);
  }, [ready, ensureAudio, startSrc]);

  const pause = useCallback(() => {
    playRef.current = false;
    setPlaying(false);
    stopSrc();
  }, [stopSrc]);

  const seek = useCallback((f: number) => {
    const t = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(f)));
    shown.current = -1;
    draw(t);
    if (playRef.current) {
      clock.current = { t0: performance.now(), f0: t };
      startSrc(t);
    }
  }, [draw, startSrc]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      if (!playRef.current) return;
      const a = audio.current;
      let f: number;
      if (a.src && a.ctx) f = a.f0 + (a.ctx.currentTime - a.t0) * FPS; // audio clock is master
      else f = clock.current.f0 + ((performance.now() - clock.current.t0) / 1000) * FPS;
      if (f >= TOTAL_FRAMES) {
        playRef.current = false;
        setPlaying(false);
        stopSrc();
        draw(TOTAL_FRAMES - 1);
        return;
      }
      draw(f);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, draw, stopSrc]);

  // Keyboard shortcuts when viewing Live Studio
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (tab !== "live") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (playRef.current) pause();
        else play();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(frameRef.current - (e.shiftKey ? BEAT : 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(frameRef.current + (e.shiftKey ? BEAT : 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab, play, pause, seek]);

  const sc = sceneAt(frame);
  const qa = qaData as any;

  const scrubFromClientX = (el: HTMLDivElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    seek(ratio * (TOTAL_FRAMES - 1));
  };

  return (
    <div className="min-h-screen bg-[#07080B] text-[#F4EFE6]" style={{ fontFamily: '"Space Grotesk Variable", system-ui, sans-serif' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl tracking-[0.18em]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>
            TOONFORGE <span className="text-[#FF5A1F]">&infin;</span>
          </h1>
          <span className="hidden text-xs uppercase tracking-[0.25em] text-white/50 sm:inline">
            procedural cinematic motion picture studio
          </span>
        </div>
        <nav aria-label="Studio workspace views" className="flex flex-wrap gap-1 text-[11px] uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.18em]">
          {(
            [
              ["live", "Live studio"],
              ["master", "Master MP4"],
              ["edit", "Editorial"],
              ["qa", "QA report"],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
              className={`rounded px-2.5 py-1.5 transition sm:px-3 sm:py-2 ${tab === k ? "bg-[#FF5A1F] font-semibold text-black" : "text-white/70 hover:bg-white/10"}`}
            >
              {l}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div role="alert" className="m-5 rounded border border-red-500/60 bg-red-950/40 p-4 text-sm">
          Renderer error: {error}
        </div>
      )}

      <main className={tab === "live" ? "mx-auto grid max-w-6xl gap-6 p-5 lg:grid-cols-[auto_1fr]" : "mx-auto hidden max-w-6xl p-5"}>
        <section className="flex flex-col items-center gap-3">
          <div
            ref={host}
            data-testid="studio-canvas-host"
            data-frame={frame}
            data-scene={sc.id}
            className="relative overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_0_80px_rgba(255,90,31,0.12)]"
            style={{ aspectRatio: "9 / 16", height: "min(76vh, 130vw)" }}
          >
            {!ready && !error && (
              <div className="absolute inset-0 grid place-items-center text-xs uppercase tracking-[0.3em] text-white/50">
                loading fonts &amp; renderer…
              </div>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!ready}
                onClick={() => (playing ? pause() : play())}
                className="rounded bg-[#FF5A1F] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-black transition hover:bg-[#ff723f] disabled:opacity-40"
              >
                {playing ? "Pause" : "Play with sound"}
              </button>
              <button
                type="button"
                onClick={() => seek(frame - 1)}
                aria-label="Previous frame"
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
              >
                −1f
              </button>
              <button
                type="button"
                onClick={() => seek(frame + 1)}
                aria-label="Next frame"
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
              >
                +1f
              </button>
              <button
                type="button"
                onClick={() => seek(frame - BEAT)}
                aria-label="Back one beat"
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
              >
                −beat
              </button>
              <button
                type="button"
                onClick={() => seek(frame + BEAT)}
                aria-label="Forward one beat"
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
              >
                +beat
              </button>
              <button
                type="button"
                onClick={() => {
                  pause();
                  seek(0);
                }}
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
              >
                Reset
              </button>
              <span data-testid="timecode-readout" className="ml-auto font-mono text-xs text-white/85">
                {timecode(frame)} · F {String(frame).padStart(4, "0")}/{TOTAL_FRAMES}
              </span>
            </div>

            {audioMsg && <p className="mb-2 text-xs text-[#FFC24D]">{audioMsg}</p>}

            <div
              className="relative h-10 cursor-ew-resize select-none"
              onPointerDown={(e) => {
                scrubbingRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubFromClientX(e.currentTarget, e.clientX);
              }}
              onPointerMove={(e) => {
                if (!scrubbingRef.current) return;
                scrubFromClientX(e.currentTarget, e.clientX);
              }}
              onPointerUp={() => {
                scrubbingRef.current = false;
              }}
            >
              <div className="absolute inset-0 flex gap-px overflow-hidden rounded">
                {SCENES.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center overflow-hidden px-2 text-[10px] font-semibold uppercase tracking-widest text-black transition-opacity"
                    style={{
                      width: `${((s.end - s.start) / TOTAL_FRAMES) * 100}%`,
                      background: ACT_COLORS[i],
                      opacity: s.id === sc.id ? 1 : 0.45,
                    }}
                  >
                    <span className="truncate">{s.name}</span>
                  </div>
                ))}
              </div>
              {IMPACTS.filter((e) => e.s >= 0.9).map((e) => (
                <div
                  key={e.f}
                  className="pointer-events-none absolute bottom-0 h-2 w-[2px] bg-black/70"
                  style={{ left: `${(e.f / TOTAL_FRAMES) * 100}%` }}
                />
              ))}
              <div
                className="pointer-events-none absolute -top-1 bottom-[-4px] w-[2px] bg-white shadow-[0_0_8px_#fff]"
                style={{ left: `${(frame / TOTAL_FRAMES) * 100}%` }}
              />
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <input
                type="range"
                aria-label="Timeline frame scrubber"
                min={0}
                max={TOTAL_FRAMES - 1}
                value={frame}
                onChange={(e) => seek(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-[#FF5A1F]"
              />
              <span className="hidden font-mono text-[11px] text-white/40 sm:inline">Space: Play · ←/→: Step</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
              {SCENES.map((s, i) => {
                const heroFrame = HERO_FRAMES[s.id] ?? s.start;
                const active = s.id === sc.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => seek(heroFrame)}
                    className={`flex items-center justify-center gap-1.5 truncate rounded border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${
                      active
                        ? "border-[#FF5A1F] bg-[#FF5A1F]/15 text-[#F4EFE6]"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACT_COLORS[i] }} />
                    <span className="truncate">{String(s.index).padStart(2, "0")} {s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed">
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-mono text-xs text-[#FF5A1F]">
                {String(sc.index).padStart(2, "0")} / {sc.act}
              </span>
              <h2 className="text-xl tracking-[0.12em]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>
                {sc.name}
              </h2>
              <span className="ml-auto font-mono text-xs text-white/50">
                F {sc.start}–{sc.end - 1} · {((sc.end - sc.start) / FPS).toFixed(1)} s
              </span>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[110px_1fr]">
              {(
                [
                  ["Shot", sc.shot],
                  ["Hierarchy", sc.hierarchy],
                  ["Camera", sc.camera],
                  ["Typography", sc.typography],
                  ["Graphics", sc.graphics],
                  ["3D", sc.threeD],
                  ["Transition", sc.transition],
                  ["Music", sc.music],
                  ["SFX", sc.sfx],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-white/45">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {report && (
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[
                ["Integrated", `${report.integratedLUFS.toFixed(1)} LUFS`],
                ["True peak", `${report.truePeakDBTP.toFixed(2)} dBTP`],
                ["Sample peak", `${report.samplePeakDBFS.toFixed(2)} dBFS`],
                ["Clipped", String(report.clippedSamples)],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{k}</div>
                  <div className="font-mono text-lg">{v}</div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-white/40">
            Every pixel is a pure function of the frame number; the soundtrack is synthesised offline from the same frame-addressed timeline and the picture clock follows the audio clock. Use the Master MP4 tab to inspect the storyboard contact sheet or render MP4 / WAV directly in-browser.
          </p>
        </section>
      </main>

      {tab === "master" && (
        <MasterPanel
          studio={api.current?.studio ?? null}
          ready={ready}
          qa={qa}
          onJumpToFrame={(f) => {
            setTab("live");
            seek(f);
          }}
        />
      )}

      {tab === "edit" && (
        <main className="mx-auto max-w-6xl space-y-4 p-5 text-sm">
          <p className="text-white/60">
            Frame-addressed edit decision list — 60 fps, 120 BPM (1 beat = 30 frames, 1 bar = 120 frames). Scene boundaries fall on bar lines.
          </p>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="bg-white/5 text-xs uppercase tracking-widest text-white/50">
                <tr>
                  <th className="p-3">#</th>
                  <th>Act</th>
                  <th>Scene</th>
                  <th>Frames</th>
                  <th>Dur</th>
                  <th>Transition out</th>
                  <th>Music event</th>
                </tr>
              </thead>
              <tbody>
                {SCENES.map((s, i) => (
                  <tr
                    key={s.id}
                    className="border-t border-white/10 align-top hover:bg-white/5"
                  >
                    <td className="p-3 font-mono" style={{ color: ACT_COLORS[i] }}>
                      {String(s.index).padStart(2, "0")}
                    </td>
                    <td className="py-3 pr-3">{s.act}</td>
                    <td className="py-3 pr-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setTab("live");
                          seek(HERO_FRAMES[s.id] ?? s.start);
                        }}
                        className="text-left underline decoration-white/25 underline-offset-4 hover:text-[#FF5A1F] hover:decoration-[#FF5A1F]"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="py-3 pr-3 font-mono">
                      {s.start}–{s.end - 1}
                    </td>
                    <td className="py-3 pr-3 font-mono">{((s.end - s.start) / FPS).toFixed(1)}s</td>
                    <td className="py-3 pr-3">{s.transition}</td>
                    <td className="py-3 pr-3">{s.music}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <h3 className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
              Sync impacts (picture shake + audio boom share these frames)
            </h3>
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {IMPACTS.map((e) => (
                <button
                  key={e.f}
                  type="button"
                  onClick={() => {
                    setTab("live");
                    seek(e.f);
                  }}
                  className="rounded border border-white/15 px-2 py-1 hover:bg-white/10"
                >
                  F{e.f} · {(e.f / FPS).toFixed(2)}s · ×{e.s}
                </button>
              ))}
            </div>
          </div>
        </main>
      )}

      {tab === "qa" && (
        <main className="mx-auto max-w-6xl space-y-4 p-5 text-sm">
          {!qa ? (
            <p className="text-white/60">
              No QA data bundled yet. Run <code className="font-mono">node scripts/validate.mjs</code> after the final render.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-white/60">
                  Results produced by <code className="font-mono">scripts/validate.mjs</code> against the delivered MP4 (FFprobe, full FFmpeg decode, EBU R128) and per-frame render statistics.
                </p>
                <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-xs text-emerald-300">
                  {(qa.checks as { pass: boolean }[]).filter((c) => c.pass).length} / {(qa.checks as { pass: boolean }[]).length} PASSED
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(qa.checks as { name: string; pass: boolean; detail: string }[]).map((c) => (
                  <div key={c.name} className="flex gap-3 rounded border border-white/10 bg-white/[0.03] p-3">
                    <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${c.pass ? "bg-emerald-400" : "bg-red-500"}`} />
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="font-mono text-xs text-white/60">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      )}
    </div>
  );
}
