/** Text-to-Voice: English, Indonesian, Spanish, IPA and Creature Tongue through the specimen. */
import { useMemo } from "react";
import { useApp } from "../../store/app.ts";
import { LANGUAGES, DIALECTS, transcribe } from "../../engine/lab.ts";
import { SPEAK_SAMPLES } from "../../store/presets.ts";
import { Chips, Panel } from "../components/Controls.tsx";
import { PresetCarousel, ShareBar } from "../components/Specimen.tsx";
import { usePlayhead } from "../components/ClipBar.tsx";

function Karaoke() {
  const clip = useApp((s) => s.clip);
  const { t, playing } = usePlayhead();
  if (!clip || clip.meta.kind !== "speech" || !clip.meta.words.length) return null;
  const on = playing?.id === clip.id && t !== null;
  return (
    <Panel title="Playback">
      <div style={{ fontSize: 18, lineHeight: 1.5 }}>
        {clip.meta.words.map((w, i) => {
          const cur = on && t! >= w.t0 - 0.02 && t! <= w.t1 + 0.06;
          const past = on && t! > w.t1;
          return (
            <span key={i} style={{ color: cur ? "var(--green)" : past ? "var(--text)" : "var(--dim)", textShadow: cur ? "0 0 12px var(--green)" : "none", marginRight: 6, transition: "color .1s" }}>
              {w.text}
            </span>
          );
        })}
      </div>
      <div className="ipa" style={{ marginTop: 8 }}>
        /{clip.meta.transcription}/
      </div>
    </Panel>
  );
}

export function SpeakScreen() {
  const s = useApp((x) => x.speak);
  const patch = useApp((x) => x.patch);
  const renderJob = useApp((x) => x.renderJob);
  const name = useApp((x) => x.specimenName);
  const preview = useMemo(() => {
    try {
      return s.text.trim() ? transcribe(s.text, s.lang, s.dialect).transcription : "";
    } catch {
      return "";
    }
  }, [s.text, s.lang, s.dialect]);
  const go = () => renderJob({ kind: "speech", text: s.text, lang: s.lang, dialect: s.dialect, intonation: s.intonation === "auto" ? undefined : s.intonation }, `${name}: ${s.text.slice(0, 30)}`);
  return (
    <div className="screen-in">
      <div className="stage-spacer" />
      <Panel title="Voice" hint={name}>
        <PresetCarousel />
        <ShareBar />
      </Panel>
      <Panel title="Language">
        <Chips
          options={LANGUAGES.map((l) => ({ id: l.id, label: l.name }))}
          value={s.lang}
          onChange={(lang) => {
            const sample = Object.values(SPEAK_SAMPLES).includes(s.text) || !s.text.trim();
            patch("speak", { lang, ...(sample ? { text: SPEAK_SAMPLES[lang] ?? s.text } : {}) });
          }}
        />
        {s.lang === "creature" && <Chips options={DIALECTS.map((d) => ({ id: d, label: d[0].toUpperCase() + d.slice(1) }))} value={s.dialect} onChange={(dialect) => patch("speak", { dialect })} />}
      </Panel>
      <Panel title="Script" hint={`${s.text.length}/600`}>
        <textarea rows={4} maxLength={600} value={s.text} onChange={(e) => patch("speak", { text: e.target.value })} placeholder="Type what your creature should say…" />
        {preview && <div className="ipa" style={{ marginTop: 8 }}>/{preview}/</div>}
        <div style={{ marginTop: 10 }}>
          <Chips
            options={[
              { id: "auto", label: "Auto intonation" },
              { id: "statement", label: "Statement ↘" },
              { id: "question", label: "Question ↗" },
              { id: "flat", label: "Monotone →" },
            ]}
            value={s.intonation}
            onChange={(intonation) => patch("speak", { intonation })}
          />
        </div>
        <button className="btn primary big wide" style={{ marginTop: 10 }} onClick={go} disabled={!s.text.trim()}>
          Bring it to life
        </button>
      </Panel>
      <Karaoke />
    </div>
  );
}
