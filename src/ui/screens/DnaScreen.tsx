/** Creature DNA Mixer: five strands, the animal splice, body and performance knobs, presets. */
import { useState, type CSSProperties } from "react";
import { useApp } from "../../store/app.ts";
import { SKINS, STRANDS, SPECIES_INFO, type StrandKey } from "../../store/presets.ts";
import { HEADS } from "../../three/heads.ts";
import { SPECIES, type Specimen } from "../../engine/lab.ts";
import { Panel, Slider, Sheet, pct, semis } from "../components/Controls.tsx";
import { PresetCarousel, ShareBar } from "../components/Specimen.tsx";
import { IncubatePad } from "../components/IncubatePad.tsx";
import { Icon } from "../icons.tsx";
import { haptic } from "../../platform/native.ts";

function Strands() {
  const sp = useApp((s) => s.specimen);
  const shares = useApp((s) => s.design.shares);
  const set = useApp((s) => s.setSpecimen);
  const share: Record<StrandKey, number> = { monster: shares.m, alien: shares.a, robot: shares.r, human: shares.h, animal: shares.n };
  return (
    <>
      {STRANDS.map((st) => (
        <div key={st.key} className="strand" style={{ "--c": st.color } as CSSProperties}>
          <span className="ico">{st.icon}</span>
          <div>
            <div className="nm">{st.name.toUpperCase()}</div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sp[st.key]}
              aria-label={`${st.name} DNA`}
              style={{ "--p": `${sp[st.key]}%`, "--c": st.color } as CSSProperties}
              onChange={(e) => set({ [st.key]: parseFloat(e.target.value) } as Partial<Specimen>)}
            />
          </div>
          <span className="pct">{Math.round(share[st.key] * 100)}%</span>
        </div>
      ))}
      <ShareBar />
    </>
  );
}

function mutate(sp: Specimen): Partial<Specimen> {
  const r = () => Math.random();
  const strands: number[] = STRANDS.map(() => (r() < 0.35 ? 0 : Math.round(r() * 100)));
  if (!strands.some((x) => x > 0)) strands[3] = 60;
  return {
    monster: strands[0], alien: strands[1], robot: strands[2], human: strands[3], animal: strands[4],
    species: strands[4] > 0 ? SPECIES[1 + Math.floor(r() * (SPECIES.length - 1))] : sp.species,
    size: Math.round((r() * 8 - 4) * 2) / 2,
    pitch: Math.round((r() * 8 - 4) * 2) / 2,
    rasp: Math.round(r() * 60) / 100,
  };
}

export function DnaScreen() {
  const sp = useApp((s) => s.specimen);
  const d = useApp((s) => s.design);
  const name = useApp((s) => s.specimenName);
  const set = useApp((s) => s.setSpecimen);
  const save = useApp((s) => s.savePreset);
  const renderJob = useApp((s) => s.renderJob);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  return (
    <div className="screen-in">
      <div className="stage-spacer" />
      <div className="row" style={{ marginTop: 6 }}>
        <div className="grow">
          <div className="title-xl glitch" data-text={name}>
            {name}
          </div>
          <p className="sub">
            Pitch {semis(d.pitchSemis)} · size {semis(d.formantSemis)} · {d.source.f0.toFixed(0)} Hz folds
          </p>
        </div>
        <button className="btn icon" aria-label="Mutate" onClick={() => (haptic("heavy"), set(mutate(sp), "Mutant Specimen"))}>
          {Icon.dice}
        </button>
        <button className="btn icon" aria-label="Save specimen" onClick={() => (setNewName(name === "Custom Specimen" ? "" : name), setNaming(true))}>
          {Icon.save}
        </button>
      </div>

      <Panel title="Specimen Library" hint="tap to load">
        <PresetCarousel />
      </Panel>

      <Panel title="DNA Strands" hint="shares always total 100%">
        <Strands />
      </Panel>

      <Panel title="Live Incubator" hint="hold · drag for vowels">
        <IncubatePad />
        <div className="row wrap" style={{ marginTop: 10 }}>
          {[
            ["roar", "🦖 Roar"],
            ["growl", "🐺 Growl"],
            ["laugh", "😈 Laugh"],
            ["scream", "😱 Scream"],
          ].map(([id, label]) => (
            <button key={id} className="btn small" onClick={() => renderJob({ kind: "vocal", vocal: id, seed: Math.floor(Math.random() * 999) }, `${name} ${id}`)}>
              {label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Animal Splice" hint={sp.animal > 0 ? "a real animal airway" : "raise the Animal strand"}>
        <div className="chips">
          {SPECIES.map((id) => (
            <button key={id} className={`chip ${sp.species === id ? "on" : ""}`} onClick={() => set({ species: id })}>
              {SPECIES_INFO[id]?.emoji} {SPECIES_INFO[id]?.name ?? id}
            </button>
          ))}
        </div>
        <p className="sub">The chosen creature's physical airway breathes with your specimen's words and follows its melody in every render.</p>
      </Panel>

      <Panel title="Head" hint="Auto follows the strands">
        <div className="chips">
          <button className={`chip ${!sp.head ? "on" : ""}`} onClick={() => set({ head: undefined })}>
            🧬 Auto
          </button>
          {HEADS.map((h) => (
            <button key={h.id} className={`chip ${sp.head === h.id ? "on" : ""}`} onClick={() => set({ head: h.id })}>
              {h.emoji} {h.name}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Skin" hint="DNA follows the strands">
        <div className="chips">
          {SKINS.map((k) => (
            <button key={k.id} className={`swatch ${(sp.skin ?? null) === k.hex ? "on" : ""}`} onClick={() => set({ skin: k.hex ?? undefined })} aria-label={`${k.name} skin`}>
              <i style={{ background: k.hex ?? "conic-gradient(#f43f5e, #8b5cf6, #f59e0b, #0ea5e9, #10b981, #f43f5e)" }} />
              {k.name}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Body & Performance">
        <div className="grid2">
          <Slider label="Body: male → female" value={sp.female} min={0} max={1} format={pct} onChange={(v) => set({ female: v })} />
          <Slider label="Adult → child" value={sp.child} min={0} max={1} format={pct} onChange={(v) => set({ child: v })} />
          <Slider label="Pitch" value={sp.pitch} min={-12} max={12} step={0.5} format={semis} color="#2de2ff" onChange={(v) => set({ pitch: v })} />
          <Slider label="Creature size" value={-sp.size} min={-8} max={8} step={0.5} format={(v) => (v > 0 ? `+${v} bigger` : v < 0 ? `${-v} smaller` : "natural")} color="#ff3b5c" onChange={(v) => set({ size: -v })} />
          <Slider label="Rasp" value={sp.rasp} min={0} max={1} format={pct} color="#ff3b5c" onChange={(v) => set({ rasp: v })} />
          <Slider label="Breath" value={sp.breath} min={0} max={1} format={pct} color="#2de2ff" onChange={(v) => set({ breath: v })} />
          <Slider label="Cave reverb" value={sp.reverb < 0 ? d.rack.reverb : sp.reverb} min={0} max={1} format={pct} color="#a45bff" onChange={(v) => set({ reverb: v })} />
          <Slider label="Echo" value={sp.echo} min={0} max={1} format={pct} color="#a45bff" onChange={(v) => set({ echo: v })} />
          <Slider label="Speaking rate" value={sp.rate} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ rate: v })} />
          <Slider label="Effect intensity" value={sp.intensity} min={0} max={1} format={pct} color="#39ff88" onChange={(v) => set({ intensity: v })} />
        </div>
      </Panel>

      {naming && (
        <Sheet title="Name your specimen" onClose={() => setNaming(false)}>
          <input type="text" value={newName} autoFocus placeholder="e.g. Count Gravelthroat" onChange={(e) => setNewName(e.target.value)} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost grow" onClick={() => setNaming(false)}>
              Cancel
            </button>
            <button
              className="btn primary grow"
              disabled={!newName.trim()}
              onClick={() => {
                save(newName.trim());
                setNaming(false);
              }}
            >
              Save Specimen
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
