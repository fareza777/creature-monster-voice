/** Sound FX Generator: procedural synth categories, physical creature vocals, animal calls. */
import { useEffect } from "react";
import { useApp } from "../../store/app.ts";
import { CREATURES, SFX_CATEGORIES, VOCALS, sfxMutate, sfxPreset } from "../../engine/lab.ts";
import { Chips, Panel, Slider, pct } from "../components/Controls.tsx";
import { Icon } from "../icons.tsx";
import { SPECIES_INFO } from "../../store/presets.ts";

const EMOJI: Record<string, string> = {
  laser: "🔫", zap: "⚡", explosion: "💥", powerup: "⭐", portal: "🌀", alarm: "🚨", robot_beep: "🤖", ghost_wail: "👻", heartbeat: "🫀",
  thunder: "🌩️", slime: "🟢", creak: "🚪", stomp: "🦶", wind: "🌫️", bubble: "🧪", alien_chatter: "👾", magic: "✨", ufo: "🛸",
  roar: "🦖", growl: "🐺", laugh: "😈", cackle: "🧙", moan: "👻", groan: "🧟", scream: "😱", hiss: "🐍", snarl: "👹", chant: "🕯️",
};

const KNOBS: { key: string; label: string; min: number; max: number; step?: number; fmt?: (v: number) => string; color?: string }[] = [
  { key: "freq", label: "Start pitch", min: 20, max: 4000, step: 1, fmt: (v) => `${v.toFixed(0)} Hz` },
  { key: "freqEnd", label: "End pitch", min: 20, max: 4000, step: 1, fmt: (v) => `${v.toFixed(0)} Hz` },
  { key: "hold", label: "Hold", min: 0, max: 3, fmt: (v) => `${v.toFixed(2)} s`, color: "#39ff88" },
  { key: "decay", label: "Decay", min: 0.01, max: 3, fmt: (v) => `${v.toFixed(2)} s`, color: "#39ff88" },
  { key: "noise", label: "Noise", min: 0, max: 1, fmt: pct, color: "#8aa7b8" },
  { key: "lp", label: "Filter", min: 100, max: 18000, step: 10, fmt: (v) => `${(v / 1000).toFixed(1)} kHz`, color: "#a45bff" },
  { key: "res", label: "Resonance", min: 0.5, max: 12, fmt: (v) => v.toFixed(1), color: "#a45bff" },
  { key: "vibDepth", label: "Wobble", min: 0, max: 12, fmt: (v) => `${v.toFixed(1)} st`, color: "#2de2ff" },
  { key: "repeat", label: "Repeat", min: 0, max: 30, fmt: (v) => (v > 0 ? `${v.toFixed(1)} Hz` : "off"), color: "#ffb547" },
  { key: "drive", label: "Drive", min: 0, max: 1, fmt: pct, color: "#ff3b5c" },
  { key: "crush", label: "Crush", min: 0, max: 1, fmt: pct, color: "#ffb547" },
  { key: "echo", label: "Echo", min: 0, max: 1, fmt: pct, color: "#a45bff" },
  { key: "reverb", label: "Reverb", min: 0, max: 1, fmt: pct, color: "#a45bff" },
];

export function SfxScreen() {
  const s = useApp((x) => x.sfx);
  const patch = useApp((x) => x.patch);
  const renderJob = useApp((x) => x.renderJob);
  const name = useApp((x) => x.specimenName);
  const catName = SFX_CATEGORIES.find((c) => c.id === s.category)?.name ?? s.category;

  useEffect(() => {
    if (!Object.keys(s.params).length) patch("sfx", { params: sfxPreset(s.category, s.seed) });
  }, [s.params, s.category, s.seed, patch]);

  const play = (params = s.params) => renderJob({ kind: "sfx", params, dna: s.dna }, `${catName} #${s.seed}`);
  const pick = (category: string) => {
    const params = sfxPreset(category, s.seed);
    patch("sfx", { category, params });
    renderJob({ kind: "sfx", params, dna: s.dna }, `${SFX_CATEGORIES.find((c) => c.id === category)?.name} #${s.seed}`);
  };
  const randomise = () => {
    const seed = 1 + Math.floor(Math.random() * 99999);
    const params = sfxPreset(s.category, seed);
    patch("sfx", { seed, params });
    renderJob({ kind: "sfx", params, dna: s.dna }, `${catName} #${seed}`);
  };
  const mutate = () => {
    const params = sfxMutate(s.params, 0.35, Math.floor(Math.random() * 1e6));
    patch("sfx", { params });
    play(params);
  };

  return (
    <>
      <Chips options={[{ id: "synth", label: "⚗️ Synth FX" }, { id: "vocal", label: "🗣️ Creature vocals" }, { id: "animal", label: "🐾 Animal calls" }]} value={s.mode} onChange={(mode) => patch("sfx", { mode })} />
      {s.mode === "synth" && (
        <>
          <Panel title="Category" hint="tap to generate">
            <div className="cat-grid">
              {SFX_CATEGORIES.map((c) => (
                <button key={c.id} className={`cat ${c.id === s.category ? "on" : ""}`} onClick={() => pick(c.id)}>
                  <span>{EMOJI[c.id] ?? "🔊"}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={catName} hint={`seed ${s.seed}`}>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn primary grow" onClick={() => play()}>
                {Icon.play} Play
              </button>
              <button className="btn grow" onClick={randomise}>
                {Icon.dice} Random
              </button>
              <button className="btn grow" onClick={mutate}>
                {Icon.wand} Mutate
              </button>
            </div>
            <div className="grid2">
              {KNOBS.map((k) => (
                <Slider key={k.key} label={k.label} value={s.params[k.key] ?? 0} min={k.min} max={k.max} step={k.step ?? 0.01} format={k.fmt} color={k.color} onChange={(v) => patch("sfx", { params: { ...s.params, [k.key]: v } })} onCommit={() => play()} />
              ))}
            </div>
            <label className="row" style={{ marginTop: 12, gap: 10 }}>
              <input type="checkbox" checked={s.dna} onChange={(e) => patch("sfx", { dna: e.target.checked })} style={{ width: 22, height: 22, accentColor: "#39ff88" }} />
              <span>Run through {name}'s DNA rack</span>
            </label>
          </Panel>
        </>
      )}
      {s.mode === "vocal" && (
        <Panel title="Creature vocals" hint={`voiced by ${name}`}>
          <p className="sub">Physical airway performances: the vocal folds and tract are pushed into creature territory, then spliced with your DNA.</p>
          <div className="cat-grid">
            {VOCALS.map((v) => (
              <button key={v.id} className="cat" onClick={() => renderJob({ kind: "vocal", vocal: v.id, seed: Math.floor(Math.random() * 9999) }, `${name}: ${v.name}`)}>
                <span>{EMOJI[v.id] ?? "🗣️"}</span>
                {v.name}
              </button>
            ))}
          </div>
        </Panel>
      )}
      {s.mode === "animal" && (
        <>
          {CREATURES.map((c) => (
            <Panel key={c.id} title={`${SPECIES_INFO[c.id]?.emoji ?? ""} ${c.name}`} hint={c.latin}>
              <p className="sub">{c.blurb}</p>
              <div className="row wrap">
                {c.calls.map((call) => (
                  <button key={call.id} className="btn small" title={call.hint} onClick={() => renderJob({ kind: "call", species: c.id, call: call.id }, `${c.name}: ${call.name}`)}>
                    {call.name}
                  </button>
                ))}
              </div>
            </Panel>
          ))}
        </>
      )}
    </>
  );
}
