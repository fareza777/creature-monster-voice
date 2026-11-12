/**
 * The lab (crates/creature-lab) and upstream catalogs as the UI sees them. Import only after
 * `initWasm()` resolved: the catalogs are read when this module loads.
 */
import { chimera, lab } from "./wasm.ts";
import type { BeatPreset, BeatSound, CreatureDef, DemoSong, HumanArtic } from "./types.ts";

export type * from "./types.ts";

/** Five DNA strands plus the body and performance knobs (crates/creature-lab/src/dna.rs). */
export interface Specimen {
  monster: number;
  alien: number;
  robot: number;
  human: number;
  animal: number;
  species: string;
  female: number;
  child: number;
  pitch: number;
  size: number;
  rasp: number;
  breath: number;
  intensity: number;
  reverb: number;
  echo: number;
  rate: number;
  /** optional skin colour for the 3D specimen (CSS hex); the engine ignores it */
  skin?: string;
  /** optional 3D head (src/three/heads.ts); undefined: follows the dominant strand */
  head?: string;
}

export const DEFAULT_SPECIMEN: Specimen = {
  monster: 0, alien: 0, robot: 0, human: 100, animal: 0, species: "none",
  female: 0, child: 0, pitch: 0, size: 0, rasp: 0, breath: 0, intensity: 1, reverb: -1, echo: 0, rate: 1,
};

export type RackParams = Record<string, number>;

export interface VoiceSettings {
  f0: number; f0Mul: number; pressure: number; breathiness: number; tension: number; fry: number;
  roughness: number; vibratoDepth: number; vibratoRate: number; drift: number; brightness: number;
}

export interface Design {
  shares: { m: number; a: number; r: number; h: number; n: number };
  body: { female: number; child: number };
  source: VoiceSettings;
  rack: RackParams;
  pitchSemis: number;
  formantSemis: number;
  species: string;
  animalGain: number;
  rate: number;
}

export interface Named { id: string; name: string }

interface LabCatalog {
  rackKeys: string[];
  rackRanges: [number, number][];
  frameStride: number;
  frameRate: number;
  species: string[];
  sfxCategories: Named[];
  vocals: Named[];
  languages: Named[];
  dialects: string[];
  version: string;
}

interface UpstreamCatalog {
  neutral: HumanArtic;
  beatSounds: BeatSound[];
  beatPresets: BeatPreset[];
  demoSongs: DemoSong[];
  creatures: CreatureDef[];
  vowelTargets: Record<string, Record<string, { artic: Partial<HumanArtic>; formants: number[] }>>;
}

const LAB = lab<LabCatalog>("catalog");
const UP = chimera<UpstreamCatalog>("catalog");

export const RACK_KEYS = LAB.rackKeys;
export const FRAME_STRIDE = LAB.frameStride;
export const FRAME_RATE = LAB.frameRate;
export const SPECIES = LAB.species;
export const SFX_CATEGORIES = LAB.sfxCategories;
export const VOCALS = LAB.vocals;
export const LANGUAGES = LAB.languages;
export const DIALECTS = LAB.dialects;
export const LAB_VERSION = LAB.version;

export const NEUTRAL = UP.neutral;
export const BEAT_SOUNDS = UP.beatSounds;
export const BEAT_PRESETS = UP.beatPresets;
export const DEMO_SONGS = UP.demoSongs;
export const CREATURES = UP.creatures;
export const VOWEL_TARGETS = UP.vowelTargets;

/** Telemetry frame layout (crates/creature-lab/src/render.rs `frame`). */
export const F = {
  JAW: 0, TB_X: 1, TB_Y: 2, TT_X: 3, TT_Y: 4, LIP_AP: 5, LIP_PROT: 6, LIP_WIDTH: 7, VELUM: 8, LARYNX: 9,
  F0: 10, VOICING: 11, P_LUNG: 12, LEVEL: 13, GATE: 14, GLOTTIS: 15, VELUM_PORT: 16, NOISE: 17, FLOW: 18, ANIMAL: 19,
  AREAS: 24, N_AREAS: 32,
} as const;

export function design(s: Specimen): Design {
  return lab<Design>("design", { specimen: s });
}

export function morphDesign(a: Specimen, b: Specimen, t: number): Design {
  return lab<Design>("morphDesign", { a, b, t });
}

/** Rack params in array order (for the worklet). */
export function rackArray(r: RackParams): number[] {
  return RACK_KEYS.map((k) => r[k] ?? 0);
}

export function transcribe(text: string, lang: string, dialect?: string): { transcription: string; words: string[][] } {
  return lab("g2p", { text, lang, dialect });
}

export type SfxParams = Record<string, number>;

export function sfxPreset(category: string, seed: number): SfxParams {
  return lab("sfxPreset", { category, seed });
}

export function sfxMutate(params: SfxParams, amount: number, seed: number): SfxParams {
  return lab("sfxMutate", { params, amount, seed });
}

/** A vowel's articulation for a body (the calibrated targets), blended across the body mix. */
export function vowelArtic(ipa: string, body: { female: number; child: number }): Partial<HumanArtic> {
  const w = { male: (1 - body.female) * (1 - body.child), female: body.female * (1 - body.child), child: body.child };
  const out: Record<string, number> = {};
  for (const [name, weight] of Object.entries(w)) {
    const t = VOWEL_TARGETS[name]?.[ipa]?.artic;
    if (!t || weight <= 0) continue;
    for (const [k, v] of Object.entries(t)) out[k] = (out[k] ?? 0) + (v as number) * weight;
  }
  return out as Partial<HumanArtic>;
}

/** Bilinear vowel space: x 0 front … 1 back, y 0 close … 1 open. */
export function vowelSpace(x: number, y: number, body: { female: number; child: number }): Partial<HumanArtic> {
  const i = vowelArtic("i", body), u = vowelArtic("u", body), a = vowelArtic("a", body), o = vowelArtic("ɑ", body);
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(i), ...Object.keys(u), ...Object.keys(a), ...Object.keys(o)]);
  const neutral = NEUTRAL as unknown as Record<string, number>;
  for (const k of keys) {
    const g = (v: Partial<HumanArtic>) => (v as Record<string, number>)[k] ?? neutral[k];
    const top = g(i) * (1 - x) + g(u) * x;
    const bot = g(a) * (1 - x) + g(o) * x;
    out[k] = top * (1 - y) + bot * y;
  }
  return out as Partial<HumanArtic>;
}
