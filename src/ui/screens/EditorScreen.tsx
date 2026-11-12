/** Clip editor: waveform with a drag selection, trims, fades, gain, reverse, speed, echo, re-DNA, undo. */
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";
import { editClip, render, waveform, type Clip } from "../../engine/renderer.ts";
import { saveClip } from "../../store/db.ts";
import { FRAME_RATE, FRAME_STRIDE } from "../../engine/lab.ts";
import { Panel } from "../components/Controls.tsx";
import { exportClip } from "../components/ClipBar.tsx";
import { Icon } from "../icons.tsx";
import { haptic } from "../../platform/native.ts";

/** Keep the anatomy track aligned with an edit: crop/reverse/stretch the frames the same way. */
function remapFrames(old: Clip, pcm: Float32Array, op: Record<string, unknown>): Float32Array {
  const n = old.meta.frames;
  const want = Math.max(1, Math.round((pcm.length / old.meta.sampleRate) * FRAME_RATE));
  const out = new Float32Array(want * FRAME_STRIDE);
  for (let i = 0; i < want; i++) {
    const t = i / FRAME_RATE;
    let src: number;
    switch (op.op) {
      case "trim":
        src = (t + (op.start as number)) * FRAME_RATE;
        break;
      case "reverse":
        src = n - 1 - i;
        break;
      case "speed":
        src = t * (op.factor as number) * FRAME_RATE;
        break;
      case "padStart":
        src = (t - (op.secs as number)) * FRAME_RATE;
        break;
      default:
        src = i;
    }
    const k = Math.max(0, Math.min(n - 1, Math.round(src)));
    out.set(old.frames.subarray(k * FRAME_STRIDE, (k + 1) * FRAME_STRIDE), i * FRAME_STRIDE);
  }
  return out;
}

export function EditorScreen() {
  const initial = useApp((s) => s.editorClip);
  const go = useApp((s) => s.go);
  const prev = useApp((s) => s.prevScreen);
  const toast = useApp((s) => s.toast);
  const specimen = useApp((s) => s.specimen);
  const name = useApp((s) => s.specimenName);
  const [clip, setClip] = useState<Clip | null>(initial);
  const [undo, setUndo] = useState<Clip[]>([]);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [working, setWorking] = useState(false);
  const [, setT] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  const dur = clip ? clip.pcm.length / clip.meta.sampleRate : 0;

  useEffect(() => {
    if (!clip) return;
    waveform(clip.pcm, 600).then(setPeaks);
  }, [clip]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const g = c.getContext("2d")!;
    const w = c.width, h = c.height, bins = peaks.length / 2;
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#39ff88");
    grad.addColorStop(0.5, "#2de2ff");
    grad.addColorStop(1, "#a45bff");
    g.clearRect(0, 0, w, h);
    g.fillStyle = grad;
    for (let i = 0; i < bins; i++) {
      const x = (i / bins) * w;
      const lo = peaks[i * 2], hi = peaks[i * 2 + 1];
      g.fillRect(x, h / 2 - hi * h * 0.48, Math.max(1, w / bins), Math.max(1, (hi - lo) * h * 0.48));
    }
  }, [peaks]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setT((x) => (x + 1) % 1e6);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!clip) {
    return (
      <div className="screen-in empty">
        <div className="big">✂️</div>
        Open a clip from the vault or the clip bar to edit it.
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => go("library")}>Open the vault</button>
        </div>
      </div>
    );
  }

  const at = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  const apply = async (op: Record<string, unknown>, label: string) => {
    if (working) return;
    setWorking(true);
    haptic("light");
    try {
      audio.stop();
      const pcm = await editClip(clip.pcm, op, clip.meta.sampleRate);
      const frames = remapFrames(clip, pcm, op);
      const next: Clip = { ...clip, id: `clip-${Date.now()}`, pcm, frames, meta: { ...clip.meta, samples: pcm.length, frames: frames.length / FRAME_STRIDE, words: op.op === "trim" || op.op === "padStart" || op.op === "reverse" || op.op === "speed" ? [] : clip.meta.words, segments: op.op === "trim" || op.op === "padStart" || op.op === "reverse" || op.op === "speed" ? [] : clip.meta.segments } };
      setUndo((u) => [...u.slice(-19), clip]);
      setClip(next);
      setSel(null);
      toast(label);
    } catch (e) {
      toast(`Edit failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setWorking(false);
    }
  };
  const reDna = async () => {
    setWorking(true);
    try {
      const h = render({ job: { kind: "process", sampleRate: clip.meta.sampleRate }, specimen }, `${clip.name} + ${name}`, undefined, clip.pcm);
      const next = await h.promise;
      setUndo((u) => [...u.slice(-19), clip]);
      setClip({ ...next, name: `${clip.name} + ${name}` });
      toast(`Spliced with ${name}`, "ok");
    } catch (e) {
      toast(`DNA failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setWorking(false);
    }
  };
  const ph = audio.playing && audio.playing.id === clip.id ? audio.playhead() : null;
  const s = sel ? [Math.min(sel[0], sel[1]), Math.max(sel[0], sel[1])] : null;

  return (
    <div className="screen-in">
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn icon" onClick={() => go(prev === "editor" ? "library" : prev)} aria-label="Back">{Icon.back}</button>
        <div className="grow">
          <div className="title-xl" style={{ fontSize: 17 }}>{clip.name}</div>
          <p className="sub">{dur.toFixed(2)} s {s ? `· selection ${s[0].toFixed(2)}–${s[1].toFixed(2)} s` : "· drag to select"}</p>
        </div>
        <button className="btn icon" disabled={!undo.length} onClick={() => { setClip(undo[undo.length - 1]); setUndo(undo.slice(0, -1)); }} aria-label="Undo">{Icon.undo}</button>
      </div>
      <Panel title="Waveform">
        <div
          className="wave"
          ref={wrap}
          onPointerDown={(e) => {
            wrap.current!.setPointerCapture(e.pointerId);
            drag.current = at(e.clientX);
            setSel([drag.current, drag.current]);
          }}
          onPointerMove={(e) => drag.current !== null && setSel([drag.current, at(e.clientX)])}
          onPointerUp={(e) => {
            if (drag.current !== null && Math.abs(at(e.clientX) - drag.current) < 0.02) setSel(null);
            drag.current = null;
          }}
        >
          <canvas ref={canvas} />
          {s && <div className="sel" style={{ left: `${(s[0] / dur) * 100}%`, width: `${((s[1] - s[0]) / dur) * 100}%` }} />}
          {ph !== null && <div className="head" style={{ left: `${(ph / dur) * 100}%` }} />}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary grow" onClick={() => (audio.playing?.id === clip.id ? audio.stop() : audio.play(clip, s ? s[0] : 0))}>
            {audio.playing?.id === clip.id ? Icon.stop : Icon.play} {audio.playing?.id === clip.id ? "Stop" : s ? "Play selection" : "Play"}
          </button>
          <button className="btn grow" disabled={!s || s[1] - s[0] < 0.02} onClick={() => s && apply({ op: "trim", start: s[0], end: s[1] }, "Trimmed to selection")}>Trim to selection</button>
        </div>
      </Panel>
      <Panel title="Operations">
        <div className="grid3">
          <button className="btn small" disabled={working} onClick={() => apply({ op: "fadeIn", secs: 0.15 }, "Faded in")}>Fade in</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "fadeOut", secs: 0.3 }, "Faded out")}>Fade out</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "normalize", db: -1 }, "Normalised to −1 dB")}>Normalise</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "gain", db: 3 }, "+3 dB")}>Gain +3</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "gain", db: -3 }, "−3 dB")}>Gain −3</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "reverse" }, "Reversed — demonic!")}>Reverse</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "speed", factor: 0.8 }, "Slowed down")}>Slower</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "speed", factor: 1.25 }, "Sped up")}>Faster</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "echo", ms: 280, feedback: 0.45, mix: 0.5 }, "Echo added")}>Echo</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "trimSilence", db: -45 }, "Silence trimmed")}>Trim silence</button>
          <button className="btn small" disabled={working} onClick={() => apply({ op: "padStart", secs: 0.25 }, "Lead-in added")}>Lead-in</button>
          <button className="btn small violet" disabled={working} onClick={reDna}>Splice DNA</button>
        </div>
      </Panel>
      <Panel title="Keep">
        <div className="grid3">
          <button className="btn primary small" onClick={async () => { await saveClip({ ...clip, id: `clip-${Date.now()}`, createdAt: Date.now() }); useApp.setState((st) => ({ libraryVersion: st.libraryVersion + 1 })); toast("Saved to the vault", "ok"); }}>{Icon.save} Save</button>
          <button className="btn small" onClick={() => exportClip(clip, "wav", toast)}>WAV</button>
          <button className="btn small violet" onClick={() => exportClip(clip, "mp3", toast)}>MP3</button>
        </div>
      </Panel>
    </div>
  );
}
