/** Studio: Sing, Beatbox, SFX and Morph under one tab bar. */
import { useApp, type StudioTab } from "../../store/app.ts";
import { SingScreen } from "./SingScreen.tsx";
import { BeatScreen } from "./BeatScreen.tsx";
import { SfxScreen } from "./SfxScreen.tsx";
import { MorphScreen } from "./MorphScreen.tsx";

const TABS: { id: StudioTab; label: string }[] = [
  { id: "sing", label: "SING" },
  { id: "beat", label: "BEATBOX" },
  { id: "sfx", label: "SFX" },
  { id: "morph", label: "MORPH" },
];

export function StudioScreen() {
  const tab = useApp((s) => s.studioTab);
  const setTab = useApp((s) => s.setStudioTab);
  return (
    <div className="screen-in">
      <div className="stage-spacer" />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab} className="screen-in">
        {tab === "sing" && <SingScreen />}
        {tab === "beat" && <BeatScreen />}
        {tab === "sfx" && <SfxScreen />}
        {tab === "morph" && <MorphScreen />}
      </div>
    </div>
  );
}
