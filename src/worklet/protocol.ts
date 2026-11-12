/** Messages between the main thread and the live voice / mic worklets. */
import type { BeatStep, BodyMix, Gesture, HumanArtic, VoiceSource } from "../engine/types.ts";

export type ToVoice =
  | { type: "body"; body: BodyMix }
  | { type: "artic"; values: Partial<HumanArtic>; tipFree?: boolean }
  | { type: "source"; values: Partial<VoiceSource> }
  | { type: "gate"; level: number }
  | { type: "telemetry"; enabled: boolean }
  | { type: "schedule"; gestures: Gesture[]; replace: boolean; lead?: number }
  | { type: "stopSpeech" }
  | { type: "creature"; id: string; params?: Record<string, number> }
  | { type: "call"; id: string; pitch?: number; amp?: number }
  | { type: "beat"; steps?: (BeatStep | null)[]; bpm?: number; swing?: number; playing?: boolean }
  | { type: "beatHit"; id: string; note?: number; accent?: number }
  /** rack targets in RACK_KEYS order */
  | { type: "rack"; values: number[] }
  | { type: "rackOn"; on: boolean };

export type FromVoice =
  | { type: "ready"; sampleRate: number }
  /** compact telemetry frame (FRAME_STRIDE floats), engine load, beat step */
  | { type: "frame"; frame: Float32Array; load: number; beatStep: number; creature: boolean }
  | { type: "error"; message: string };

export type ToMic =
  | { type: "rack"; values: number[] }
  | { type: "monitor"; on: boolean }
  | { type: "record"; on: boolean };

export type FromMic =
  | { type: "ready" }
  /** raw input blocks while recording, and the input level */
  | { type: "chunk"; data: Float32Array }
  | { type: "level"; input: number; output: number };
