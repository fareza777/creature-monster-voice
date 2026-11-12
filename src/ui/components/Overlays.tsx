import { useEffect, useState } from "react";
import { useApp } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";

export function BusyOverlay() {
  const busy = useApp((s) => s.busy);
  if (!busy) return null;
  const p = Math.round(busy.progress * 100);
  return (
    <div className="busy" role="status" aria-live="polite">
      <div className="tube">
        <div className="fluid" style={{ height: `${8 + busy.progress * 86}%` }} />
        {[12, 38, 64, 86].map((x, i) => (
          <i key={x} className="bubble" style={{ left: `${x}%`, animationDelay: `${i * 0.45}s` }} />
        ))}
      </div>
      <div className="label">{busy.label.toUpperCase()}</div>
      <div className="pct">{p}%</div>
      {busy.cancel && (
        <button className="btn danger small" onClick={busy.cancel}>
          Abort
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Developer HUD (long-press the logo): fps, engine load, audio latency. */
export function Hud() {
  const on = useApp((s) => s.hud);
  const [txt, setTxt] = useState("");
  useEffect(() => {
    if (!on) return;
    let frames = 0, last = performance.now(), raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      frames++;
      const now = performance.now();
      if (now - last > 1000) {
        const ctx = audio.ctx;
        setTxt(`${Math.round((frames * 1000) / (now - last))} fps · engine ${(audio.load * 100).toFixed(0)}% · out ${(((ctx?.outputLatency ?? 0) + (ctx?.baseLatency ?? 0)) * 1000).toFixed(0)} ms · ${ctx?.sampleRate ?? "–"} Hz`);
        frames = 0;
        last = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return on ? <div className="hud">{txt || "measuring…"}</div> : null;
}
