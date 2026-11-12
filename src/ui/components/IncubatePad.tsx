/**
 * Hold to Incubate: press and hold to voice the current specimen live (engine + DNA rack in the
 * worklet); drag to move through the vowel space (left front … right back, top close … bottom
 * open). Releasing lets the breath go.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { audio } from "../../audio/audio.ts";
import { useApp } from "../../store/app.ts";
import { vowelSpace } from "../../engine/lab.ts";
import { haptic } from "../../platform/native.ts";

export function IncubatePad({ height = 210 }: { height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0.35, y: 0.7 });
  const [on, setOn] = useState(false);
  const [lvl, setLvl] = useState(0);
  const d = useApp((s) => s.design);
  const active = useRef<number | null>(null);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setLvl(Math.min(1, (audio.liveFrame?.[13] ?? 0) * 2.5));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  const place = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    setPos({ x, y });
    audio.setArtic(vowelSpace(x, y, d.body));
    // a little pitch bend with height, like a theremin: higher on the pad = higher pitch
    audio.setSource({ f0: d.source.f0 * Math.pow(2, (0.5 - y) * 0.5) });
  };

  const down = async (e: React.PointerEvent) => {
    if (active.current !== null) return;
    active.current = e.pointerId;
    ref.current!.setPointerCapture(e.pointerId);
    haptic("medium");
    await audio.start();
    audio.applyDesign(d, d.body);
    place(e);
    audio.gate(1);
    setOn(true);
  };
  const up = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    audio.gate(0);
    setOn(false);
  };

  return (
    <div
      ref={ref}
      className="pad"
      data-on={on ? 1 : 0}
      style={{ height, "--x": `${pos.x * 100}%`, "--y": `${pos.y * 100}%`, "--on": on ? 1 : 0, "--lvl": lvl } as CSSProperties}
      onPointerDown={down}
      onPointerMove={(e) => active.current === e.pointerId && place(e)}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <span className="lbl" style={{ left: 12, top: 10 }}>EE</span>
      <span className="lbl" style={{ right: 12, top: 10 }}>OO</span>
      <span className="lbl" style={{ left: 12, bottom: 34 }}>AA</span>
      <span className="lbl" style={{ right: 12, bottom: 34 }}>AH</span>
      <div className="cursor" />
      <div className="hold">HOLD TO INCUBATE</div>
    </div>
  );
}
