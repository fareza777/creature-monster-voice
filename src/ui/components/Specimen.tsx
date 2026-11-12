/** Specimen pickers and DNA readouts shared by several screens. */
import { useApp, allPresets } from "../../store/app.ts";
import { STRANDS, type Preset } from "../../store/presets.ts";

export function ShareBar() {
  const s = useApp((x) => x.design.shares);
  const v = [s.m, s.a, s.r, s.h, s.n];
  return (
    <div className="share-bar">
      {STRANDS.map((st, i) => (
        <i key={st.key} style={{ width: `${v[i] * 100}%`, background: st.color }} />
      ))}
    </div>
  );
}

export function DnaDots() {
  const s = useApp((x) => x.design.shares);
  const v = [s.m, s.a, s.r, s.h, s.n];
  return (
    <span className="dna-dots">
      {STRANDS.map((st, i) => (
        <i key={st.key} style={{ color: st.color, height: `${5 + v[i] * 13}px`, opacity: 0.35 + v[i] }} />
      ))}
    </span>
  );
}

export function PresetCarousel(props: { onPick?: (p: Preset) => void; selectedId?: string }) {
  const name = useApp((s) => s.specimenName);
  const load = useApp((s) => s.loadPreset);
  const userPresets = useApp((s) => s.userPresets);
  const del = useApp((s) => s.deletePreset);
  const list = allPresets();
  void userPresets;
  return (
    <div className="chips">
      {list.map((p) => {
        const on = props.selectedId ? props.selectedId === p.id : p.name === name;
        return (
          <button key={p.id} className={`preset-card ${on ? "on" : ""}`} onClick={() => (props.onPick ? props.onPick(p) : load(p))}>
            <span className="emo">{p.emoji}</span>
            <b>{p.name}</b>
            <small>{p.tagline}</small>
            {p.id.startsWith("user-") && !props.onPick && (
              <span
                className="x"
                role="button"
                aria-label="Delete preset"
                onClick={(e) => {
                  e.stopPropagation();
                  del(p.id);
                }}
              >
                ✕
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
