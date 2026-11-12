/** Singing Studio: a note strip + piano roll, lyrics in four languages, tempo and vibrato. */
import { useState } from "react";
import { useApp } from "../../store/app.ts";
import { SONGS } from "../../store/presets.ts";
import { DEMO_SONGS } from "../../engine/lab.ts";
import { Chips, Panel, Slider } from "../components/Controls.tsx";
import { usePlayhead } from "../components/ClipBar.tsx";
import { haptic } from "../../platform/native.ts";

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const LOW = 52;
const HIGH = 76;

const ALL_SONGS = [...SONGS, ...DEMO_SONGS.map((d) => ({ name: `${d.name} (engine demo)`, bpm: d.bpm, lang: "en", lyrics: d.lyrics, notes: d.notes as [number, number][] }))];

export function SingScreen() {
  const s = useApp((x) => x.sing);
  const sp = useApp((x) => x.specimen);
  const patch = useApp((x) => x.patch);
  const renderJob = useApp((x) => x.renderJob);
  const name = useApp((x) => x.specimenName);
  const clip = useApp((x) => x.clip);
  const [sel, setSel] = useState(0);
  const { t, playing } = usePlayhead();
  const cur = clip?.meta.kind === "song" && playing?.id === clip.id && t !== null ? clip.meta.words.findIndex((w) => t! >= w.t0 && t! < w.t1) : -1;

  const notes = s.notes;
  const setNotes = (n: [number, number][]) => patch("sing", { notes: n });
  const male = sp.female < 0.5 && sp.child < 0.5;
  const octave = male ? -12 : 0;

  const setPitch = (i: number, midi: number) => {
    const n = notes.slice();
    n[i] = [Math.max(LOW, Math.min(HIGH, midi)), n[i][1]];
    setNotes(n);
    haptic("light");
  };
  const setLen = (b: number) => {
    const n = notes.slice();
    n[sel] = [n[sel][0], b];
    setNotes(n);
  };
  const insert = () => {
    const n = notes.slice();
    n.splice(sel + 1, 0, [n[sel]?.[0] ?? 60, 1]);
    setNotes(n);
    setSel(sel + 1);
  };
  const remove = () => {
    if (notes.length <= 1) return;
    const n = notes.slice();
    n.splice(sel, 1);
    setNotes(n);
    setSel(Math.max(0, sel - 1));
  };
  const sing = () =>
    renderJob({ kind: "song", notes: notes.map(([m, b]) => ({ midi: m + octave, beats: b })), lyrics: s.lyrics, lang: s.lang, bpm: s.bpm, vibrato: s.vibrato }, `${name} sings`);

  return (
    <>
      <Panel title="Songbook">
        <Chips
          options={ALL_SONGS.map((x, i) => ({ id: String(i), label: x.name }))}
          value={String(s.song)}
          onChange={(v) => {
            const song = ALL_SONGS[+v];
            patch("sing", { song: +v, notes: song.notes, lyrics: song.lyrics, lang: song.lang, bpm: song.bpm });
            setSel(0);
          }}
        />
      </Panel>
      <Panel title="Melody" hint={`${notes.length} notes · ${notes.reduce((a, n) => a + n[1], 0)} beats`}>
        <div className="notes-strip">
          {notes.map(([m, b], i) => (
            <button key={i} className={`note-chip ${i === sel ? "sel" : ""} ${i === cur ? "cur" : ""}`} onClick={() => setSel(i)}>
              <b>{noteName(m)}</b>
              {b} beat{b === 1 ? "" : "s"}
            </button>
          ))}
        </div>
        <div className="roll">
          <div className="roll-grid" style={{ "--rows": HIGH - LOW + 1 } as React.CSSProperties}>
            {notes.map(([m], i) =>
              Array.from({ length: HIGH - LOW + 1 }, (_, r) => {
                const midi = HIGH - r;
                const black = [1, 3, 6, 8, 10].includes(midi % 12);
                return <button key={`${i}-${r}`} aria-label={`${noteName(midi)} at note ${i + 1}`} className={`roll-cell ${black ? "black" : ""} ${m === midi ? "on" : ""} ${i === cur ? "cur" : ""}`} onClick={() => (setSel(i), setPitch(i, midi))} />;
              }),
            )}
          </div>
        </div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => setPitch(sel, notes[sel][0] + 1)}>▲ Up</button>
          <button className="btn small" onClick={() => setPitch(sel, notes[sel][0] - 1)}>▼ Down</button>
          {[0.5, 1, 2, 3].map((b) => (
            <button key={b} className={`btn small ${notes[sel]?.[1] === b ? "primary" : ""}`} onClick={() => setLen(b)}>
              {b === 0.5 ? "½" : b}
            </button>
          ))}
          <button className="btn small" onClick={insert}>＋ Note</button>
          <button className="btn small danger" onClick={remove}>✕</button>
        </div>
      </Panel>
      <Panel title="Lyrics" hint="one syllable per note">
        <Chips options={[{ id: "en", label: "English" }, { id: "id", label: "Indonesian" }, { id: "es", label: "Spanish" }, { id: "creature", label: "Creature" }]} value={s.lang} onChange={(lang) => patch("sing", { lang })} />
        <textarea rows={3} value={s.lyrics} onChange={(e) => patch("sing", { lyrics: e.target.value })} />
        <div className="grid2" style={{ marginTop: 10 }}>
          <Slider label="Tempo" value={s.bpm} min={50} max={180} step={1} format={(v) => `${v} BPM`} onChange={(bpm) => patch("sing", { bpm })} />
          <Slider label="Vibrato" value={s.vibrato} min={0} max={100} step={1} format={(v) => `${v} cents`} color="#a45bff" onChange={(vibrato) => patch("sing", { vibrato })} />
        </div>
        <button className="btn primary big wide" style={{ marginTop: 10 }} onClick={sing}>
          Sing, creature, sing
        </button>
        <p className="sub" style={{ marginTop: 8 }}>
          {male ? "Adult male bodies sing an octave down." : "Sung in the written register."} The DNA shifts the key: monsters sing low, aliens high.
        </p>
      </Panel>
    </>
  );
}
