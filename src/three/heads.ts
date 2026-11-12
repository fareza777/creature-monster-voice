/**
 * The specimen heads (one GLB each, built by tools/blender/build_specimen.py + kinds.py) and how a
 * specimen picks one: its own `head`, else the dominant DNA strand.
 */
import type { Shares } from "./specimen.ts";

export type HeadKind = "ogre" | "demon" | "alien" | "robot" | "beast" | "skull" | "pumpkin" | "frank";

/** Served from public/models (copied as-is into the app; relative so it works under file:// and Capacitor). */
export function headUrl(kind: HeadKind): string {
  return `${import.meta.env.BASE_URL}models/${kind}.glb`;
}

export interface HeadInfo {
  id: HeadKind;
  name: string;
  emoji: string;
  /** the DNA growths this head wears (the others would clash with its sculpt) */
  cosmetics: string[];
  /** the hide when the specimen has no skin of its own (null: the DNA colours) */
  skin: string | null;
}

export const HEADS: HeadInfo[] = [
  { id: "ogre", name: "Ogre", emoji: "👹", cosmetics: ["Horns", "Tusks", "Collar"], skin: null },
  { id: "demon", name: "Demon", emoji: "😈", cosmetics: ["Horns", "Collar"], skin: null },
  { id: "alien", name: "Alien", emoji: "👽", cosmetics: ["Antennae", "Collar"], skin: null },
  { id: "robot", name: "Robot", emoji: "🤖", cosmetics: [], skin: null },
  { id: "beast", name: "Beast", emoji: "🐺", cosmetics: ["Tusks", "Collar"], skin: "#6e4b2f" },
  { id: "skull", name: "Skull", emoji: "💀", cosmetics: ["Horns", "Visor"], skin: "#e9e4d8" },
  { id: "pumpkin", name: "Pumpkin", emoji: "🎃", cosmetics: [], skin: "#e8590c" },
  { id: "frank", name: "Patchwork", emoji: "🧟", cosmetics: ["Visor", "Collar"], skin: "#8fae86" },
];

export const HEAD = Object.fromEntries(HEADS.map((h) => [h.id, h])) as Record<HeadKind, HeadInfo>;

/** The head a specimen wears. */
export function headFor(head: string | undefined, s: Shares): HeadKind {
  if (head && head in HEAD) return head as HeadKind;
  const top = (["m", "a", "r", "n", "h"] as const).reduce((a, b) => (s[b] > s[a] ? b : a), "h");
  if (top === "m") return s.m > 0.75 ? "demon" : "ogre";
  if (top === "a") return "alien";
  if (top === "r") return "robot";
  if (top === "n") return "beast";
  return s.m > 0.2 ? "ogre" : "frank";
}
