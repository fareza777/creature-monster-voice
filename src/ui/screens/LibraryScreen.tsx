/** The Specimen Vault: stored clips and projects (IndexedDB), with play, rename, export, edit. */
import { useEffect, useState } from "react";
import { useApp } from "../../store/app.ts";
import { audio } from "../../audio/audio.ts";
import { deleteClip, deleteProject, getClip, listClips, listProjects, renameClip, saveProject, usage, type ClipRecord, type Project } from "../../store/db.ts";
import { Panel, Sheet } from "../components/Controls.tsx";
import { exportClip } from "../components/ClipBar.tsx";
import { Icon } from "../icons.tsx";

const KIND_EMOJI: Record<string, string> = { speech: "🗣️", song: "🎤", beat: "🥁", call: "🐾", vocal: "🦖", sfx: "⚗️", process: "🎙️" };

export function LibraryScreen() {
  const version = useApp((s) => s.libraryVersion);
  const toast = useApp((s) => s.toast);
  const openEditor = useApp((s) => s.openEditor);
  const setClip = useApp((s) => s.setClip);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [space, setSpace] = useState<string>("");
  const [menu, setMenu] = useState<ClipRecord | null>(null);
  const [rename, setRename] = useState("");
  const [projName, setProjName] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    listClips().then(setClips).catch(() => setClips([]));
    listProjects().then(setProjects).catch(() => setProjects([]));
    usage().then((u) => u && setSpace(`${(u.used / 1048576).toFixed(1)} MB used`));
  }, [version, tick]);
  const refresh = () => setTick((t) => t + 1);

  const play = async (r: ClipRecord) => {
    const c = await getClip(r.id);
    if (c) {
      setClip(c);
      await audio.play(c);
    }
  };
  const saveProj = async () => {
    const s = useApp.getState();
    const p: Project = {
      id: `proj-${Date.now()}`,
      name: projName.trim() || `${s.specimenName} session`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      specimen: s.specimen,
      studio: { speak: s.speak, sing: s.sing, beat: s.beat, sfx: s.sfx, morph: s.morph, specimenName: s.specimenName },
      clipIds: clips.slice(0, 50).map((c) => c.id),
    };
    await saveProject(p);
    setProjName("");
    toast(`Project "${p.name}" saved`, "ok");
    refresh();
  };
  const openProj = (p: Project) => {
    const st = p.studio as Record<string, unknown>;
    useApp.setState({ speak: st.speak as never, sing: st.sing as never, beat: st.beat as never, sfx: st.sfx as never, morph: st.morph as never });
    useApp.getState().setSpecimen(p.specimen, (st.specimenName as string) ?? p.name);
    toast(`Project "${p.name}" restored`, "ok");
  };

  return (
    <div className="screen-in">
      <div className="title-xl" style={{ marginTop: 8 }}>Specimen Vault</div>
      <p className="sub">Everything stays on this device. {space}</p>

      <Panel title="Projects" hint="settings + specimen">
        <div className="row">
          <input type="text" placeholder="Project name" value={projName} onChange={(e) => setProjName(e.target.value)} />
          <button className="btn primary" onClick={saveProj}>
            Save session
          </button>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {projects.map((p) => (
            <div key={p.id} className="item">
              <div className="k">🧪</div>
              <div style={{ minWidth: 0 }}>
                <b>{p.name}</b>
                <small>{new Date(p.updatedAt).toLocaleString()}</small>
              </div>
              <div className="row">
                <button className="btn small" onClick={() => openProj(p)}>Open</button>
                <button className="btn small icon" aria-label="Duplicate" onClick={async () => (await saveProject({ ...p, id: `proj-${Date.now()}`, name: `${p.name} copy`, createdAt: Date.now() }), refresh())}>{Icon.copy}</button>
                <button className="btn small icon danger" aria-label="Delete" onClick={async () => (await deleteProject(p.id), refresh())}>{Icon.trash}</button>
              </div>
            </div>
          ))}
          {!projects.length && <p className="sub">No projects yet. Save your session to come back to it later.</p>}
        </div>
      </Panel>

      <Panel title="Clips" hint={`${clips.length} stored`}>
        <div className="list">
          {clips.map((c) => (
            <div key={c.id} className="item">
              <button className="k" style={{ cursor: "pointer" }} onClick={() => play(c)} aria-label={`Play ${c.name}`}>
                {KIND_EMOJI[c.meta.kind] ?? "🔊"}
              </button>
              <div style={{ minWidth: 0 }} onClick={() => play(c)}>
                <b>{c.name}</b>
                <small>
                  {(c.meta.samples / c.meta.sampleRate).toFixed(1)} s · {new Date(c.createdAt).toLocaleDateString()}
                </small>
              </div>
              <button className="btn small" onClick={() => (setMenu(c), setRename(c.name))}>
                •••
              </button>
            </div>
          ))}
        </div>
        {!clips.length && (
          <div className="empty">
            <div className="big">🫙</div>
            The vault is empty. Render something and tap {Icon.save} to keep it.
          </div>
        )}
      </Panel>

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="row">
            <input type="text" value={rename} onChange={(e) => setRename(e.target.value)} />
            <button className="btn" onClick={async () => (await renameClip(menu.id, rename.trim() || menu.name), setMenu(null), refresh())}>
              Rename
            </button>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={async () => { const c = await getClip(menu.id); setMenu(null); if (c) exportClip(c, "wav", toast); }}>Export WAV</button>
            <button className="btn violet" onClick={async () => { const c = await getClip(menu.id); setMenu(null); if (c) exportClip(c, "mp3", toast); }}>Export MP3</button>
            <button className="btn" onClick={async () => { const c = await getClip(menu.id); setMenu(null); if (c) openEditor(c); }}>{Icon.edit} Edit</button>
            <button className="btn danger" onClick={async () => { await deleteClip(menu.id); setMenu(null); refresh(); toast("Clip deleted"); }}>{Icon.trash} Delete</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
