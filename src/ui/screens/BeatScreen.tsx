/** Beatbox Maker: live pads, a 16-step sequencer looping in the worklet, presets, bar export. */
import { useEffect, useState, type CSSProperties } from "react";
import { useApp } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";
import { BEAT_PRESETS, BEAT_SOUNDS } from "../../engine/lab.ts";
import { chimera } from "../../engine/wasm.ts";
import type { HumanArtic } from "../../engine/types.ts";
import { Chips, Panel, Slider, pct } from "../components/Controls.tsx";
import { haptic } from "../../platform/native.ts";

const ROLE_COLOR: Record<string, string> = { kick: "#ff3b5c", snare: "#ffb547", hat: "#2de2ff", perc: "#a45bff", bass: "#39ff88" };
const color = (id: string | null) => ROLE_COLOR[BEAT_SOUNDS.find((s) => s.id === id)?.role ?? "perc"];

function parse(text: string): (string | null)[] {
  const t = text.split(/[\s|]+/).filter(Boolean).map((x) => (x === "." || x === "-" ? null : x.replace(/:\d+$/, "").replace(/>$/, "")));
  const out = t.slice(0, 16);
  while (out.length < 16) out.push(null);
  return out;
}

const steps = (p: (string | null)[]) => p.map((id) => (id ? { id } : null));

export function BeatScreen() {
  const b = useApp((s) => s.beat);
  const d = useApp((s) => s.design);
  const patch = useApp((s) => s.patch);
  const renderJob = useApp((s) => s.renderJob);
  const name = useApp((s) => s.specimenName);
  const [loop, setLoop] = useState(false);
  const [now, setNow] = useState(-1);
  const [hit, setHit] = useState<string | null>(null);

  // a beatboxer's ready posture and a bass voice for this body
  const ready = async () => {
    await audio.start();
    audio.applyDesign(d, d.body);
    audio.setArtic(chimera<Partial<HumanArtic>>("beatReady", { body: d.body }));
    audio.setSource({ f0: Math.max(50, Math.min(400, 100 * d.source.f0Mul)), pressure: 8, voiced: true });
    audio.gate(0);
  };

  useEffect(() => {
    if (!loop) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setNow(audio.beatStep >= 0 ? audio.beatStep % 16 : -1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop]);
  useEffect(() => () => audio.beat({ playing: false }), []);
  useEffect(() => {
    if (loop) audio.beat({ steps: steps(b.pattern), bpm: b.bpm, swing: b.swing });
  }, [b.pattern, b.bpm, b.swing, loop]);

  const pad = async (id: string) => {
    haptic("medium");
    setHit(id);
    setTimeout(() => setHit(null), 120);
    patch("beat", { brush: id });
    if (!loop) await ready();
    audio.beatHit(id);
  };
  const toggleLoop = async () => {
    if (loop) {
      audio.beat({ playing: false });
      setLoop(false);
      setNow(-1);
      return;
    }
    await ready();
    audio.beat({ steps: steps(b.pattern), bpm: b.bpm, swing: b.swing, playing: true });
    setLoop(true);
  };
  const paint = (i: number) => {
    const p = b.pattern.slice();
    p[i] = p[i] === b.brush ? null : b.brush;
    patch("beat", { pattern: p });
    haptic("light");
  };
  const exportBeat = () => {
    if (loop) toggleLoop();
    renderJob({ kind: "beat", pattern: b.pattern.map((x) => x ?? ".").join(" "), bpm: b.bpm, swing: b.swing, bars: b.bars }, `${name} beat ${b.bpm} BPM`);
  };

  return (
    <>
      <Panel title="Mouth Kit" hint="tap to play · selects the brush">
        <div className="pads">
          {BEAT_SOUNDS.map((s) => (
            <button key={s.id} className={`padbtn ${b.brush === s.id ? "brush" : ""} ${hit === s.id ? "hit" : ""}`} style={{ "--c": ROLE_COLOR[s.role] } as CSSProperties} onPointerDown={() => pad(s.id)} title={s.hint}>
              <b>{s.id}</b>
              <small>{s.name}</small>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Sequencer" hint="paint steps with the brush">
        <div className="steps">
          {b.pattern.map((id, i) => (
            <button key={i} className={`step ${id ? "filled" : ""} ${i === now ? "now" : ""}`} style={{ "--c": color(id) } as CSSProperties} onClick={() => paint(i)}>
              {id ?? ""}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className={`btn big grow ${loop ? "danger" : "primary"}`} onClick={toggleLoop}>
            {loop ? "■ Stop loop" : "▶ Live loop"}
          </button>
          <button className="btn big" onClick={() => patch("beat", { pattern: new Array(16).fill(null) })}>
            Clear
          </button>
        </div>
      </Panel>
      <Panel title="Grooves">
        <Chips options={BEAT_PRESETS.map((p) => ({ id: p.name, label: p.name }))} value={""} onChange={(n) => {
          const p = BEAT_PRESETS.find((x) => x.name === n)!;
          patch("beat", { pattern: parse(p.text), bpm: p.bpm, swing: p.swing });
        }} />
        <div className="grid2">
          <Slider label="Tempo" value={b.bpm} min={60} max={180} step={1} format={(v) => `${v} BPM`} onChange={(bpm) => patch("beat", { bpm })} />
          <Slider label="Swing" value={b.swing} min={0} max={0.6} format={pct} color="#a45bff" onChange={(swing) => patch("beat", { swing })} />
          <Slider label="Bars to export" value={b.bars} min={1} max={8} step={1} format={(v) => `${v}`} color="#ffb547" onChange={(bars) => patch("beat", { bars })} />
        </div>
        <button className="btn violet big wide" style={{ marginTop: 10 }} onClick={exportBeat}>
          Render {b.bars} bar{b.bars === 1 ? "" : "s"} with DNA
        </button>
      </Panel>
    </>
  );
}
