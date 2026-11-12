/** The latest clip: play/stop with a live progress line and the current word, keep, export, edit. */
import { useEffect, useState } from "react";
import { useApp } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";
import { encode, type Clip } from "../../engine/renderer.ts";
import { saveExport, safeName, haptic } from "../../platform/native.ts";
import { Icon } from "../icons.tsx";
import { Sheet } from "./Controls.tsx";

export async function exportClip(clip: Clip, format: "wav" | "mp3", toast: (t: string, k?: "info" | "ok" | "error") => void): Promise<void> {
  try {
    toast(`Encoding ${format.toUpperCase()}…`);
    const bytes = await encode(clip.pcm, format, clip.meta.sampleRate);
    const where = await saveExport(bytes, `${safeName(clip.name)}.${format}`, format === "wav" ? "audio/wav" : "audio/mpeg");
    toast(`Saved to ${where}`, "ok");
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : e}`, "error");
  }
}

export function usePlayhead(): { t: number | null; playing: Clip | null } {
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      force((x) => (x + 1) % 1e6);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return { t: audio.playhead(), playing: audio.playing };
}

function Progress({ clip }: { clip: Clip }) {
  const { t, playing } = usePlayhead();
  const dur = clip.meta.samples / clip.meta.sampleRate;
  const on = playing?.id === clip.id && t !== null;
  const word = on ? clip.meta.words.find((w) => t! >= w.t0 - 0.02 && t! <= w.t1 + 0.08)?.text : null;
  const seg = on ? clip.meta.segments.find((s) => t! >= s.t0 && t! <= s.t1)?.text : null;
  return (
    <>
      <div className="word">{on ? (word ? `${word}${seg ? `  /${seg}/` : ""}` : seg ? `/${seg}/` : "…") : `${dur.toFixed(1)} s · ${clip.meta.kind}`}</div>
      <div className="prog">
        <i style={{ width: `${on ? Math.min(100, (t! / dur) * 100) : 0}%` }} />
      </div>
    </>
  );
}

export function ClipBar() {
  const clip = useApp((s) => s.clip);
  const keep = useApp((s) => s.keepClip);
  const toast = useApp((s) => s.toast);
  const openEditor = useApp((s) => s.openEditor);
  const screen = useApp((s) => s.screen);
  const [sheet, setSheet] = useState(false);
  const [playing, setPlaying] = useState(false);
  // follow the player (renders auto-play after the clip is set)
  useEffect(() => {
    const t = setInterval(() => setPlaying(!!clip && audio.playing?.id === clip.id), 150);
    return () => clearInterval(t);
  }, [clip]);
  if (!clip || screen === "editor" || screen === "library" || screen === "about") return null;
  const toggle = async () => {
    haptic("light");
    if (playing) {
      audio.stop();
      setPlaying(false);
    } else {
      await audio.play(clip);
      setPlaying(true);
    }
  };
  return (
    <>
      <div className="clipbar">
        <button className="playbtn" onClick={toggle} aria-label={playing ? "Stop" : "Play"}>
          {playing ? Icon.stop : Icon.play}
        </button>
        <div className="meta">
          <b>{clip.name}</b>
          <Progress clip={clip} />
        </div>
        <div className="acts">
          <button className="btn icon small" onClick={() => keep()} aria-label="Keep in vault">
            {Icon.save}
          </button>
          <button className="btn icon small" onClick={() => setSheet(true)} aria-label="Export">
            {Icon.share}
          </button>
          <button className="btn icon small" onClick={() => openEditor(clip)} aria-label="Edit">
            {Icon.edit}
          </button>
        </div>
      </div>
      {sheet && (
        <Sheet title="Export specimen" onClose={() => setSheet(false)}>
          <p className="sub">Saved to Documents/CreatureVoiceStudio, then the share sheet opens.</p>
          <div className="grid2">
            <button className="btn primary big" onClick={() => (setSheet(false), exportClip(clip, "wav", toast))}>
              WAV · 48 kHz
            </button>
            <button className="btn violet big" onClick={() => (setSheet(false), exportClip(clip, "mp3", toast))}>
              MP3 · 128k
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
