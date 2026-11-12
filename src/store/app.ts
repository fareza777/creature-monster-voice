/** App state (zustand): navigation, the current specimen, studio settings, renders, toasts. */
import { create } from "zustand";
import { DEFAULT_SPECIMEN, design, type Design, type Specimen } from "../engine/lab.ts";
import { render, type Clip, type Job, type RenderRequest } from "../engine/renderer.ts";
import { audio } from "../audio/audio.ts";
import { PRESETS, SONGS, SPEAK_SAMPLES, type Preset } from "./presets.ts";
import { saveClip } from "./db.ts";
import { haptic } from "../platform/native.ts";
import type { Organ } from "../three/xray.ts";

export type Screen = "lab" | "dna" | "speak" | "studio" | "library" | "editor" | "about";
export type StudioTab = "sing" | "beat" | "sfx" | "morph";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "ok" | "error";
}

export interface Busy {
  label: string;
  progress: number;
  cancel?: () => void;
}

export interface SpeakState { text: string; lang: string; dialect: string; intonation: string }
export interface SingState { song: number; notes: [number, number][]; lyrics: string; lang: string; bpm: number; vibrato: number }
export interface BeatState { pattern: (string | null)[]; bpm: number; swing: number; bars: number; brush: string }
export interface SfxState { category: string; seed: number; params: Record<string, number>; dna: boolean; mode: "synth" | "vocal" | "animal" }
export interface MorphState { a: string; b: string; amount: number; sweep: boolean; text: string; lang: string; monitor: boolean }

interface State {
  screen: Screen;
  prevScreen: Screen;
  studioTab: StudioTab;
  specimen: Specimen;
  specimenName: string;
  design: Design;
  userPresets: Preset[];
  clip: Clip | null;
  busy: Busy | null;
  /** a render is running in the worker (it may already be playing) */
  rendering: boolean;
  toasts: Toast[];
  organ: Organ | null;
  libraryVersion: number;
  editorClip: Clip | null;
  speak: SpeakState;
  sing: SingState;
  beat: BeatState;
  sfx: SfxState;
  morph: MorphState;
  hud: boolean;

  go: (s: Screen) => void;
  setStudioTab: (t: StudioTab) => void;
  setSpecimen: (patch: Partial<Specimen>, name?: string) => void;
  loadPreset: (p: Preset) => void;
  savePreset: (name: string) => void;
  deletePreset: (id: string) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  setOrgan: (o: Organ | null) => void;
  renderJob: (job: Job, name: string, opts?: { morph?: RenderRequest["morph"]; input?: Float32Array; specimen?: Specimen; autoplay?: boolean }) => Promise<Clip | null>;
  setClip: (c: Clip | null) => void;
  keepClip: (c?: Clip) => Promise<void>;
  openEditor: (c: Clip) => void;
  patch: <K extends "speak" | "sing" | "beat" | "sfx" | "morph">(k: K, v: Partial<State[K]>) => void;
  toggleHud: () => void;
}

const LS = "cvs-state-v1";
let toastId = 0;

function loadSaved(): Partial<State> {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "{}");
  } catch {
    return {};
  }
}

const saved = loadSaved();
const initialSpecimen: Specimen = { ...DEFAULT_SPECIMEN, ...(saved.specimen ?? PRESETS[1].specimen) };
const song0 = SONGS[0];

export const useApp = create<State>((set, get) => ({
  screen: "lab",
  prevScreen: "lab",
  studioTab: (saved.studioTab as StudioTab) ?? "sing",
  specimen: initialSpecimen,
  specimenName: saved.specimenName ?? PRESETS[1].name,
  design: design(initialSpecimen),
  userPresets: saved.userPresets ?? [],
  clip: null,
  busy: null,
  rendering: false,
  toasts: [],
  organ: null,
  libraryVersion: 0,
  editorClip: null,
  speak: { text: SPEAK_SAMPLES.en, lang: "en", dialect: "guttural", intonation: "auto", ...(saved.speak ?? {}) },
  sing: { song: 0, notes: song0.notes, lyrics: song0.lyrics, lang: song0.lang, bpm: song0.bpm, vibrato: 35, ...(saved.sing ?? {}) },
  beat: { pattern: "B . t . Pf . t . B . t B Pf . t tss".split(" ").map((x) => (x === "." ? null : x)), bpm: 96, swing: 0, bars: 2, brush: "B", ...(saved.beat ?? {}) },
  sfx: { category: "laser", seed: 1, params: {}, dna: false, mode: "synth", ...(saved.sfx ?? {}) },
  morph: { a: "human", b: "demon-lord", amount: 0.5, sweep: true, text: "I was human once. Now I am something else.", lang: "en", monitor: false, ...(saved.morph ?? {}) },
  hud: false,

  go: (s) => {
    const cur = get().screen;
    if (cur === s) return;
    haptic("light");
    set({ screen: s, prevScreen: cur, organ: null });
  },
  setStudioTab: (t) => set({ studioTab: t }),
  setSpecimen: (patch, name) => {
    const specimen = { ...get().specimen, ...patch };
    const d = design(specimen);
    set({ specimen, design: d, specimenName: name ?? (patch.human !== undefined || patch.monster !== undefined ? "Custom Specimen" : get().specimenName) });
    audio.applyDesign(d, d.body);
  },
  loadPreset: (p) => {
    haptic("medium");
    const specimen = { ...DEFAULT_SPECIMEN, ...p.specimen };
    const d = design(specimen);
    set({ specimen, design: d, specimenName: p.name });
    audio.applyDesign(d, d.body);
  },
  savePreset: (name) => {
    const p: Preset = { id: `user-${Date.now()}`, name, tagline: "Your specimen", emoji: "🧪", specimen: { ...get().specimen } };
    set({ userPresets: [p, ...get().userPresets], specimenName: name });
    get().toast(`Specimen "${name}" saved`, "ok");
  },
  deletePreset: (id) => set({ userPresets: get().userPresets.filter((p) => p.id !== id) }),
  toast: (text, kind = "info") => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === "error" ? 5200 : 3000);
  },
  setOrgan: (o) => set({ organ: o }),
  renderJob: async (job, name, opts = {}) => {
    if (get().rendering) {
      get().toast("Still incubating the last specimen…");
      return null;
    }
    await audio.start().catch(() => undefined);
    const specimen = opts.specimen ?? get().specimen;
    const autoplay = opts.autoplay !== false;
    // low latency: playback starts while the worker is still rendering, as soon as the rest is
    // sure to arrive in time (src/audio/audio.ts pushChunk)
    if (autoplay) audio.beginStream();
    let streaming = false;
    const h = render(
      { job, specimen, morph: opts.morph },
      name,
      (p) => {
        const b = get().busy;
        if (b) set({ busy: { ...b, progress: p } });
      },
      opts.input,
      autoplay
        ? (c) => {
            if (audio.pushChunk(c) && !streaming) {
              streaming = true;
              set({ busy: null });
              haptic("light");
            }
          }
        : undefined,
    );
    set({ rendering: true, busy: { label: "Incubating", progress: 0, cancel: h.cancel } });
    try {
      const clip = await h.promise;
      set({ busy: null, rendering: false, clip });
      if (!streaming) haptic("success");
      if (autoplay) await audio.endStream(clip);
      return clip;
    } catch (e) {
      audio.stop();
      set({ busy: null, rendering: false });
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "cancelled") get().toast(`Render failed: ${msg}`, "error");
      return null;
    }
  },
  setClip: (c) => set({ clip: c }),
  keepClip: async (c) => {
    const clip = c ?? get().clip;
    if (!clip) return;
    await saveClip(clip);
    set({ libraryVersion: get().libraryVersion + 1 });
    get().toast(`"${clip.name}" stored in the Specimen Vault`, "ok");
  },
  openEditor: (c) => {
    audio.stop();
    set({ editorClip: c, prevScreen: get().screen, screen: "editor" });
  },
  patch: (k, v) => set({ [k]: { ...get()[k], ...v } } as unknown as Partial<State>),
  toggleHud: () => set({ hud: !get().hud }),
}));

// persist the settings worth keeping (not clips: those live in IndexedDB)
let saveTimer = 0;
useApp.subscribe((s) => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const keep = { specimen: s.specimen, specimenName: s.specimenName, userPresets: s.userPresets, speak: s.speak, sing: s.sing, beat: s.beat, sfx: s.sfx, morph: s.morph, studioTab: s.studioTab };
    try {
      localStorage.setItem(LS, JSON.stringify(keep));
    } catch {
      /* storage full: settings stay in memory */
    }
  }, 400);
});

export function allPresets(): Preset[] {
  return [...useApp.getState().userPresets, ...PRESETS];
}

export function presetById(id: string): Preset | undefined {
  return allPresets().find((p) => p.id === id);
}
