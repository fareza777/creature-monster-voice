/** Built-in character presets ("specimens") and demo content. */
import { DEFAULT_SPECIMEN, type Specimen } from "../engine/lab.ts";

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  specimen: Specimen;
  builtIn?: boolean;
}

const sp = (o: Partial<Specimen>): Specimen => ({ ...DEFAULT_SPECIMEN, human: 0, ...o });

export const PRESETS: Preset[] = [
  { id: "human", name: "Human Control", tagline: "The untouched sample", emoji: "🧑", specimen: sp({ human: 100 }) },
  { id: "pumpkin-king", name: "Pumpkin King", tagline: "Kiroween's hollow-voiced host", emoji: "🎃", specimen: sp({ monster: 35, human: 50, alien: 15, echo: 0.25, size: -1, skin: "#e8590c" }) },
  { id: "demon-lord", name: "Demon Lord", tagline: "Speaks from beneath the floor", emoji: "😈", specimen: sp({ monster: 90, human: 10, size: -3, reverb: 0.6, skin: "#b3122f" }) },
  { id: "swamp-ogre", name: "Swamp Ogre", tagline: "Half beast, half bog", emoji: "👹", specimen: sp({ monster: 60, animal: 30, human: 10, species: "alligator", size: -1, rasp: 0.3 }) },
  { id: "gamma-robot", name: "Gamma Robot", tagline: "Monotone, metallic, obedient", emoji: "🤖", specimen: sp({ robot: 85, human: 15 }) },
  { id: "zeta", name: "Zeta Reticulan", tagline: "Greetings from the grey sector", emoji: "👽", specimen: sp({ alien: 80, human: 20, pitch: 2 }) },
  { id: "werebeast", name: "Werebeast", tagline: "Barks between the words", emoji: "🐺", specimen: sp({ monster: 45, animal: 45, human: 10, species: "seal", rasp: 0.4 }) },
  { id: "banshee", name: "Banshee", tagline: "A wail on the cold wind", emoji: "👻", specimen: sp({ alien: 35, human: 55, animal: 10, female: 1, breath: 0.7, reverb: 0.85, echo: 0.3, skin: "#dfe7f2" }) },
  { id: "cyber-lich", name: "Cyber Lich", tagline: "Undead, upgraded", emoji: "💀", specimen: sp({ robot: 50, monster: 40, human: 10, reverb: 0.5 }) },
  { id: "siren", name: "Siren of the Deep", tagline: "Sings sailors under", emoji: "🧜", specimen: sp({ animal: 35, human: 45, alien: 20, species: "songbird", female: 1, reverb: 0.6, skin: "#0e9fa8" }) },
  { id: "tusk-titan", name: "Tusk Titan", tagline: "Trumpets the ground awake", emoji: "🐘", specimen: sp({ monster: 40, animal: 50, human: 10, species: "elephant", size: -2 }) },
  { id: "goblin", name: "Goblin", tagline: "Small, sly, and loud", emoji: "👺", specimen: sp({ monster: 30, human: 55, alien: 15, child: 1, pitch: 4, rasp: 0.5 }) },
  { id: "ghost-child", name: "Ghost Child", tagline: "Hums in empty halls", emoji: "🕯️", specimen: sp({ human: 70, alien: 30, child: 1, breath: 0.8, reverb: 0.9, skin: "#eef2ff" }) },
  { id: "mecha-dragon", name: "Mecha Dragon", tagline: "Scales of steel, breath of fire", emoji: "🐉", specimen: sp({ robot: 40, monster: 40, animal: 20, species: "alligator", size: -2 }) },
];

/** Skin swatches for the specimen (null: follow the DNA). */
export const SKINS: { id: string; name: string; hex: string | null }[] = [
  { id: "auto", name: "DNA", hex: null },
  { id: "pumpkin", name: "Pumpkin", hex: "#e8590c" },
  { id: "toxic", name: "Toxic", hex: "#2f9e44" },
  { id: "blood", name: "Blood Moon", hex: "#b3122f" },
  { id: "abyss", name: "Abyss", hex: "#0e9fa8" },
  { id: "nebula", name: "Nebula", hex: "#6741d9" },
  { id: "bone", name: "Bone", hex: "#e9e4d8" },
  { id: "ghost", name: "Ghost", hex: "#eef2ff" },
  { id: "obsidian", name: "Obsidian", hex: "#2b2a33" },
  { id: "gold", name: "Gilded", hex: "#d4a72c" },
];

export const STRANDS = [
  { key: "monster", name: "Monster", color: "#f43f5e", icon: "🦷" },
  { key: "alien", name: "Alien", color: "#8b5cf6", icon: "🛸" },
  { key: "robot", name: "Robot", color: "#f59e0b", icon: "⚙️" },
  { key: "human", name: "Human", color: "#0ea5e9", icon: "🧬" },
  { key: "animal", name: "Animal", color: "#10b981", icon: "🐾" },
] as const;

export type StrandKey = (typeof STRANDS)[number]["key"];

export const SPECIES_INFO: Record<string, { name: string; emoji: string }> = {
  none: { name: "Trill only", emoji: "〰️" },
  songbird: { name: "Songbird", emoji: "🐦" },
  seal: { name: "Seal", emoji: "🦭" },
  alligator: { name: "Alligator", emoji: "🐊" },
  elephant: { name: "Elephant", emoji: "🐘" },
};

/** Original demo songs (and the engine's own) for the Singing Studio. */
export interface Song {
  name: string;
  bpm: number;
  lang: string;
  lyrics: string;
  /** [midi, beats] per syllable, adult female register */
  notes: [number, number][];
}

export const SONGS: Song[] = [
  {
    name: "Rise of the Lab (original)",
    bpm: 104,
    lang: "en",
    lyrics: "Rise from the lab tonight, glow in the pale moon light. We are the monster choir, singing through the fire.",
    notes: [
      [57, 1], [60, 1], [64, 1], [62, 1], [60, 0.5], [57, 1.5],
      [57, 1], [60, 0.5], [64, 0.5], [67, 1], [65, 1], [64, 2],
      [62, 1], [64, 0.5], [65, 0.5], [64, 1], [62, 1], [60, 0.5], [59, 1.5],
      [57, 1], [59, 0.5], [60, 0.5], [62, 1], [57, 3],
    ],
  },
  {
    name: "Malam Kiroween (original, Indonesian)",
    bpm: 96,
    lang: "id",
    lyrics: "Bulan merah di langit malam, monster bernyanyi pelan pelan.",
    notes: [
      [60, 1], [62, 1], [64, 1], [64, 1], [62, 0.5], [60, 0.5], [62, 1], [64, 1], [67, 2],
      [65, 1], [64, 1], [62, 1], [60, 1], [62, 0.5], [64, 0.5], [62, 0.5], [60, 0.5], [60, 2],
    ],
  },
  {
    name: "Noche de Monstruos (original, Spanish)",
    bpm: 100,
    lang: "es",
    lyrics: "Canta la noche, canta el monstruo, bajo la luna roja.",
    notes: [
      [64, 1], [62, 0.5], [60, 0.5], [62, 1], [64, 1], [65, 0.5], [64, 0.5], [62, 1], [60, 1],
      [59, 1], [60, 1], [62, 1], [60, 0.5], [57, 0.5], [59, 0.5], [57, 0.5], [60, 2],
    ],
  },
];

export const SPEAK_SAMPLES: Record<string, string> = {
  en: "Welcome to the laboratory. Tonight, we splice a new creature.",
  id: "Selamat datang di laboratorium monster. Malam ini kita ciptakan makhluk baru.",
  es: "Bienvenidos al laboratorio. Esta noche creamos una nueva criatura.",
  ipa: "ˈhæpi ˈkɪɹoʊˌwin",
  creature: "Bow before the master of the swamp and the moon.",
};
