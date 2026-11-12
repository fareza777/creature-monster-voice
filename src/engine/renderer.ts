/** Main-thread client of the render worker. */
import RenderWorker from "../workers/render.worker.ts?worker";
import { wasmModule } from "./wasm.ts";
import type { Specimen } from "./lab.ts";
import type { Design } from "./lab.ts";

const dictUrl = "data/cmudict.txt.gz";

export interface Span { text: string; t0: number; t1: number }

export interface RenderMeta {
  sampleRate: number;
  samples: number;
  frames: number;
  frameRate: number;
  stride: number;
  segments: Span[];
  words: Span[];
  transcription: string;
  design: Design;
  kind: string;
}

/** A rendered clip: audio plus its 60 fps anatomy track. */
export interface Clip {
  id: string;
  name: string;
  pcm: Float32Array;
  frames: Float32Array;
  meta: RenderMeta;
  createdAt: number;
}

export type Job =
  | { kind: "speech"; text: string; lang: string; dialect?: string; intonation?: string }
  | { kind: "song"; notes: { midi: number; beats: number }[]; lyrics: string; lang: string; bpm: number; vibrato: number }
  | { kind: "beat"; pattern: string; bpm: number; swing: number; bars: number }
  | { kind: "call"; species: string; call: string; pitch?: number }
  | { kind: "vocal"; vocal: string; seed: number }
  | { kind: "sfx"; params: Record<string, number>; dna: boolean }
  | { kind: "process"; sampleRate?: number };

export interface RenderRequest {
  job: Job;
  specimen: Specimen;
  morph?: { to: Specimen; amount: number; sweep: boolean };
}

export interface Chunk { pcm: Float32Array; frames: Float32Array; total: number; at: number }
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (p: number) => void; chunk?: (c: Chunk) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let ready: Promise<void> | null = null;

function send<T>(msg: Record<string, unknown>, transfer: Transferable[] = [], progress?: (p: number) => void, chunk?: (c: Chunk) => void): { id: number; promise: Promise<T> } {
  const id = nextId++;
  const promise = new Promise<T>((resolve, reject) => pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress, chunk }));
  worker!.postMessage({ ...msg, id }, transfer);
  return { id, promise };
}

export function startRenderer(): Promise<void> {
  if (ready) return ready;
  worker = new RenderWorker();
  worker.onmessage = (e: MessageEvent<{ id: number; type: string; p?: number; result?: unknown; message?: string } & Partial<Chunk>>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") p.progress?.(m.p ?? 0);
    else if (m.type === "chunk") p.chunk?.({ pcm: m.pcm!, frames: m.frames!, total: m.total!, at: m.at! });
    else if (m.type === "done") {
      pending.delete(m.id);
      p.resolve(m.result);
    } else if (m.type === "error") {
      pending.delete(m.id);
      p.reject(new Error(m.message));
    }
  };
  worker.onerror = (e) => console.error("render worker:", e.message);
  ready = send<void>({ type: "init", module: wasmModule(), dictUrl: new URL(dictUrl, document.baseURI).href }).promise;
  return ready;
}

let clipCounter = 0;

/** Render a request. `cancel()` on the returned handle stops it. */
export function render(req: RenderRequest, name: string, onProgress?: (p: number) => void, input?: Float32Array, onChunk?: (c: Chunk) => void): { promise: Promise<Clip>; cancel: () => void } {
  const copy = input ? input.slice() : undefined;
  const { id, promise } = send<{ meta: RenderMeta; pcm: Float32Array; frames: Float32Array }>({ type: "render", request: req, input: copy }, copy ? [copy.buffer] : [], onProgress, onChunk);
  return {
    promise: (async () => {
      await ready;
      const r = await promise;
      return { id: `clip-${Date.now()}-${++clipCounter}`, name, pcm: r.pcm, frames: r.frames, meta: r.meta, createdAt: Date.now() };
    })(),
    cancel: () => worker?.postMessage({ type: "cancel", id }),
  };
}

export async function encode(pcm: Float32Array, format: "wav" | "mp3", sampleRate = 48000, onProgress?: (p: number) => void): Promise<Uint8Array> {
  await ready;
  const copy = pcm.slice();
  return send<Uint8Array>({ type: "encode", pcm: copy, format, sampleRate }, [copy.buffer], onProgress).promise;
}

export async function editClip(pcm: Float32Array, op: Record<string, unknown>, sampleRate = 48000): Promise<Float32Array> {
  await ready;
  const copy = pcm.slice();
  return send<Float32Array>({ type: "edit", pcm: copy, op, sampleRate }, [copy.buffer]).promise;
}

export async function waveform(pcm: Float32Array, bins: number): Promise<Float32Array> {
  await ready;
  const copy = pcm.slice();
  return send<Float32Array>({ type: "waveform", pcm: copy, bins }, [copy.buffer]).promise;
}

export async function decodeWav(bytes: Uint8Array): Promise<Float32Array> {
  await ready;
  const copy = bytes.slice();
  return send<Float32Array>({ type: "decode", bytes: copy }, [copy.buffer]).promise;
}
