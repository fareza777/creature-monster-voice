/** Voice Morphing: character A↔B (blend or sweep) and morphing your own microphone voice. */
import { useEffect, useRef, useState } from "react";
import { useApp, presetById } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";
import { rackArray, LANGUAGES } from "../../engine/lab.ts";
import { decodeWav } from "../../engine/renderer.ts";
import { Chips, Panel, Slider, pct } from "../components/Controls.tsx";
import { PresetCarousel } from "../components/Specimen.tsx";
import { Icon } from "../icons.tsx";
import { haptic } from "../../platform/native.ts";

function CharacterMorph() {
  const m = useApp((s) => s.morph);
  const patch = useApp((s) => s.patch);
  const renderJob = useApp((s) => s.renderJob);
  const a = presetById(m.a), b = presetById(m.b);
  const go = () => {
    if (!a || !b) return;
    renderJob({ kind: "speech", text: m.text, lang: m.lang }, `${a.name} → ${b.name}`, { specimen: a.specimen, morph: { to: b.specimen, amount: m.amount, sweep: m.sweep } });
  };
  return (
    <>
      <Panel title="Specimen A" hint={a?.name}>
        <PresetCarousel selectedId={m.a} onPick={(p) => patch("morph", { a: p.id })} />
      </Panel>
      <Panel title="Specimen B" hint={b?.name}>
        <PresetCarousel selectedId={m.b} onPick={(p) => patch("morph", { b: p.id })} />
      </Panel>
      <Panel title="Morph">
        <Chips options={[{ id: "sweep", label: "Transform during the line" }, { id: "blend", label: "Fixed blend" }]} value={m.sweep ? "sweep" : "blend"} onChange={(v) => patch("morph", { sweep: v === "sweep" })} />
        {!m.sweep && <Slider label={`${a?.name ?? "A"} ↔ ${b?.name ?? "B"}`} value={m.amount} min={0} max={1} format={pct} color="#a45bff" onChange={(amount) => patch("morph", { amount })} />}
        <Chips options={LANGUAGES.filter((l) => l.id !== "ipa").map((l) => ({ id: l.id, label: l.name }))} value={m.lang} onChange={(lang) => patch("morph", { lang })} />
        <textarea rows={3} value={m.text} onChange={(e) => patch("morph", { text: e.target.value })} />
        <button className="btn violet big wide" style={{ marginTop: 10 }} onClick={go} disabled={!m.text.trim()}>
          {m.sweep ? "Transform" : "Blend & speak"}
        </button>
      </Panel>
    </>
  );
}

function MicMorph() {
  const d = useApp((s) => s.design);
  const name = useApp((s) => s.specimenName);
  const renderJob = useApp((s) => s.renderJob);
  const toast = useApp((s) => s.toast);
  const m = useApp((s) => s.morph);
  const patch = useApp((s) => s.patch);
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [lvl, setLvl] = useState(0);
  const [take, setTake] = useState<Float32Array | null>(null);
  const started = useRef(0);
  const file = useRef<HTMLInputElement>(null);

  // the live monitor uses the full pitch change (a recording cannot move its folds)
  const rack = () => {
    const r = { ...d.rack, shift: Math.max(-12, Math.min(12, d.pitchSemis)), shiftMix: Math.abs(d.pitchSemis) > 0.05 ? 1 : 0 };
    return rackArray(r);
  };
  useEffect(() => {
    if (open) audio.micSend({ type: "rack", values: rack() });
  });
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setLvl(Math.min(1, audio.micLevel.input * 3));
      if (rec) setSecs((performance.now() - started.current) / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, rec]);
  useEffect(() => () => audio.micClose(), []);

  const openMic = async () => {
    try {
      await audio.micOpen();
      setOpen(true);
      audio.micSend({ type: "rack", values: rack() });
      audio.micSend({ type: "monitor", on: m.monitor });
    } catch (e) {
      toast(`Microphone unavailable: ${e instanceof Error ? e.message : e}. Allow microphone access in Android settings.`, "error");
    }
  };
  const toggleRec = async () => {
    haptic("heavy");
    if (!rec) {
      audio.micRecord(true);
      started.current = performance.now();
      setSecs(0);
      setRec(true);
      return;
    }
    audio.micRecord(false);
    setRec(false);
    const pcm = await audio.micTake();
    if (pcm.length < audio.micRate * 0.2) return toast("That take was too short", "error");
    setTake(pcm);
    renderJob({ kind: "process", sampleRate: audio.micRate }, `My voice as ${name}`, { input: pcm });
  };
  const importWav = async (f: File) => {
    try {
      const pcm = await decodeWav(new Uint8Array(await f.arrayBuffer()));
      setTake(pcm);
      renderJob({ kind: "process", sampleRate: 48000 }, `${f.name.replace(/\.\w+$/, "")} as ${name}`, { input: pcm });
    } catch (e) {
      toast(`Could not read that file: ${e instanceof Error ? e.message : e}`, "error");
    }
  };
  return (
    <Panel title="Microphone Morph" hint={`into ${name}`}>
      <p className="sub">Record yourself; the take runs through {name}'s DNA rack and animal splice. Use headphones for the live monitor.</p>
      {!open ? (
        <button className="btn primary big wide" onClick={openMic}>
          {Icon.mic} Open the microphone
        </button>
      ) : (
        <>
          <div className="row" style={{ alignItems: "stretch" }}>
            <button className={`btn big grow ${rec ? "danger" : "primary"}`} onClick={toggleRec}>
              {rec ? `■ Stop · ${secs.toFixed(1)} s` : "● Record"}
            </button>
            <div className="meter" style={{ height: 56 }}>
              <i style={{ height: `${lvl * 100}%` }} />
            </div>
          </div>
          <label className="row" style={{ marginTop: 12, gap: 10 }}>
            <input type="checkbox" checked={m.monitor} onChange={(e) => (patch("morph", { monitor: e.target.checked }), audio.micSend({ type: "monitor", on: e.target.checked }))} style={{ width: 22, height: 22, accentColor: "#39ff88" }} />
            <span>Live monitor (headphones only — speakers will feed back)</span>
          </label>
          {take && (
            <button className="btn wide" style={{ marginTop: 10 }} onClick={() => renderJob({ kind: "process", sampleRate: audio.micRate }, `My voice as ${name}`, { input: take })}>
              Re-morph last take with the current DNA
            </button>
          )}
        </>
      )}
      <input ref={file} type="file" accept="audio/wav,.wav" hidden onChange={(e) => e.target.files?.[0] && importWav(e.target.files[0])} />
      <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={() => file.current?.click()}>
        Import a WAV file instead
      </button>
      <p className="sub" style={{ marginTop: 6 }}>Pitch {d.pitchSemis.toFixed(1)} st · DNA {Object.entries(d.shares).map(([k, v]) => `${k.toUpperCase()} ${(v * 100).toFixed(0)}%`).join(" · ")}</p>
    </Panel>
  );
}

export function MorphScreen() {
  const [mode, setMode] = useState<"character" | "mic">("character");
  return (
    <>
      <Chips options={[{ id: "character", label: "🧬 Character morph" }, { id: "mic", label: "🎙️ Your voice" }]} value={mode} onChange={setMode} />
      {mode === "character" ? <CharacterMorph /> : <MicMorph />}
    </>
  );
}
