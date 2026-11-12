import { useEffect, useRef } from "react";
import { useApp, type Screen } from "../store/app.ts";
import { audio } from "../audio/audio.ts";
import { Stage } from "./components/Stage.tsx";
import { Particles } from "./components/Particles.tsx";
import { ClipBar } from "./components/ClipBar.tsx";
import { BusyOverlay, Hud, Toasts } from "./components/Overlays.tsx";
import { DnaDots } from "./components/Specimen.tsx";
import { Icon, LogoMark } from "./icons.tsx";
import { LabScreen } from "./screens/LabScreen.tsx";
import { DnaScreen } from "./screens/DnaScreen.tsx";
import { SpeakScreen } from "./screens/SpeakScreen.tsx";
import { StudioScreen } from "./screens/StudioScreen.tsx";
import { LibraryScreen } from "./screens/LibraryScreen.tsx";
import { EditorScreen } from "./screens/EditorScreen.tsx";
import { AboutScreen } from "./screens/AboutScreen.tsx";
import { onBackButton } from "../platform/lifecycle.ts";

const DOCK: { id: Screen; label: string; icon: keyof typeof Icon }[] = [
  { id: "lab", label: "LAB", icon: "lab" },
  { id: "dna", label: "DNA", icon: "dna" },
  { id: "speak", label: "SPEAK", icon: "speak" },
  { id: "studio", label: "STUDIO", icon: "studio" },
  { id: "library", label: "VAULT", icon: "vault" },
];

function Header() {
  const go = useApp((s) => s.go);
  const name = useApp((s) => s.specimenName);
  const toggleHud = useApp((s) => s.toggleHud);
  const press = useRef(0);
  return (
    <header className="header">
      <button
        className="logo"
        onPointerDown={() => (press.current = window.setTimeout(toggleHud, 700))}
        onPointerUp={() => clearTimeout(press.current)}
        onClick={() => go("about")}
        aria-label="About Creature Voice Studio"
      >
        <LogoMark />
        <span className="logo-text">
          CREATURE VOICE
          <small>STUDIO</small>
        </span>
      </button>
      <span className="spacer" />
      <button className="specimen-badge" onClick={() => go("dna")}>
        <DnaDots />
        <b>{name}</b>
      </button>
    </header>
  );
}

export function App() {
  const screen = useApp((s) => s.screen);
  const go = useApp((s) => s.go);
  // the AudioContext may only start from a user gesture
  useEffect(() => {
    const unlock = () => {
      audio.start().then(() => {
        const d = useApp.getState().design;
        audio.applyDesign(d, d.body);
      }).catch(() => undefined);
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  useEffect(
    () =>
      onBackButton(() => {
        const s = useApp.getState();
        if (s.busy?.cancel) return s.busy.cancel(), true;
        if (s.screen === "editor" || s.screen === "about") return s.go(s.prevScreen === s.screen ? "lab" : s.prevScreen), true;
        if (s.screen !== "lab") return s.go("lab"), true;
        return false;
      }),
    [],
  );
  return (
    <div className="app" data-screen={screen}>
      <Particles />
      <div className="vignette" />
      <Header />
      <Stage />
      <main className="content" key={screen}>
        {screen === "lab" && <LabScreen />}
        {screen === "dna" && <DnaScreen />}
        {screen === "speak" && <SpeakScreen />}
        {screen === "studio" && <StudioScreen />}
        {screen === "library" && <LibraryScreen />}
        {screen === "editor" && <EditorScreen />}
        {screen === "about" && <AboutScreen />}
      </main>
      <ClipBar />
      <nav className="dock">
        {DOCK.map((d) => (
          <button key={d.id} className={screen === d.id ? "on" : ""} onClick={() => go(d.id)} aria-label={d.label}>
            {Icon[d.icon]}
            {d.label}
          </button>
        ))}
      </nav>
      <BusyOverlay />
      <Toasts />
      <Hud />
    </div>
  );
}
