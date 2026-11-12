/** About: credits, how it works, licences (shown in full, offline). */
import { useApp } from "../../store/app.ts";
import { LAB_VERSION } from "../../engine/lab.ts";
import { Panel } from "../components/Controls.tsx";
import { Icon, LogoMark } from "../icons.tsx";
import appLicense from "../../../LICENSE?raw";
import chimeraLicense from "../../../third_party/chimera/LICENSE?raw";
import notices from "../../../THIRD_PARTY_NOTICES.md?raw";

export function AboutScreen() {
  const go = useApp((s) => s.go);
  const prev = useApp((s) => s.prevScreen);
  return (
    <div className="screen-in about">
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn icon" onClick={() => go(prev === "about" ? "lab" : prev)} aria-label="Back">
          {Icon.back}
        </button>
        <LogoMark />
        <div>
          <div className="title-xl" style={{ fontSize: 17 }}>Creature Voice Studio</div>
          <p className="sub">Monster Voice Laboratory · v1.0.0 · by F7 Developer</p>
        </div>
      </div>
      <Panel title="How it works">
        <p>
          Every sound is <b>simulated</b>, not sampled: a physical model of lungs, vocal folds, throat, mouth and nose (the CHIMERA engine, Rust → WebAssembly) breathes out each word. Our lab layer then
          splices in creature DNA — formant and pitch shifting, sub-octaves, growl, ring modulation, vocoder, metallic combs, animal trills, cave reverbs — and can graft a real animal airway into the
          voice. All of it runs on this phone. No internet, no accounts, no paid APIs.
        </p>
        <div className="kv">
          <span>Engine</span> CHIMERA physical voice model (MIT)
          <span>Lab DSP</span> creature-lab {LAB_VERSION} (original)
          <span>Languages</span> English · Indonesian · Spanish · IPA · Creature Tongue
          <span>Export</span> WAV 16-bit 48 kHz · MP3 128 kbps
          <span>Made for</span> Kiroween 2026 — Costume Contest
        </div>
      </Panel>
      <Panel title="Credits">
        <p>
          Physical voice engine: <b>CHIMERA</b> by Jameson Hodge, MIT licence (github.com/jamesondh/chimera-vocal-synth). Pronunciations: CMU Pronouncing Dictionary. MP3 encoding: lamejs (LGPL-3.0,
          unmodified, separate module). Fonts: Space Grotesk and Inter (SIL OFL 1.1). 3D specimen modelled procedurally in Blender (tools/blender/build_specimen.py). Built with Kiro.
        </p>
      </Panel>
      <Panel title="Licence — Creature Voice Studio">
        <div className="licence">{appLicense}</div>
      </Panel>
      <Panel title="Licence — CHIMERA engine">
        <div className="licence">{chimeraLicense}</div>
      </Panel>
      <Panel title="Third-party notices">
        <div className="licence">{notices}</div>
      </Panel>
    </div>
  );
}
