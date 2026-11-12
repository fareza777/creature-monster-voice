/**
 * Render worker: offline renders through creature-lab (speech, song, beat, calls, vocal FX, SFX,
 * microphone morphs), clip edits, waveform peaks, and WAV/MP3 encoding. Owns its own wasm
 * instance, so long renders never block the UI or the audio thread.
 */
import { jsonCall, type WasmExports } from "../engine/wasm.ts";

type In =
  | { id: number; type: "init"; module: WebAssembly.Module; dictUrl: string }
  | { id: number; type: "render"; request: unknown; input?: Float32Array }
  | { id: number; type: "cancel" }
  | { id: number; type: "encode"; pcm: Float32Array; format: "wav" | "mp3"; sampleRate: number }
  | { id: number; type: "edit"; pcm: Float32Array; op: unknown; sampleRate: number }
  | { id: number; type: "waveform"; pcm: Float32Array; bins: number }
  | { id: number; type: "decode"; bytes: Uint8Array };

let x: WasmExports | null = null;
let dictReady: Promise<void> | null = null;
const cancelled = new Set<number>();

const call = <T,>(fn: string, args: Record<string, unknown> = {}): T => jsonCall<T>(x!, "lab", fn, args);

function setInput(pcm: Float32Array): void {
  const p = x!.lab_input_f32(pcm.length);
  new Float32Array(x!.memory.buffer, p, pcm.length).set(pcm);
}

function out(i: number): Float32Array {
  const n = x!.lab_out_f32_len(i);
  return new Float32Array(x!.memory.buffer, x!.lab_out_f32_ptr(i), n).slice();
}

async function loadDict(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`dictionary HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let text: string;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      text = await new Response(stream).text();
    } else text = new TextDecoder().decode(bytes);
    call("loadDict", { text });
  } catch (e) {
    // the letter-to-sound rules still speak English without the dictionary
    console.warn("CMUdict unavailable:", e);
  }
}

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const yieldNow = () => new Promise((r) => setTimeout(r, 0));

async function render(id: number, request: unknown, input?: Float32Array): Promise<void> {
  if (dictReady) await dictReady;
  if (input) setInput(input);
  else x!.lab_input_f32(0);
  const start = call<{ total: number }>("renderStart", { request });
  post({ id, type: "progress", p: 0, total: start.total });
  let sent = 0, sentFrames = 0;
  for (;;) {
    const r = call<{ pos: number; total: number; done: boolean }>("renderStep", { samples: 12000 });
    post({ id, type: "progress", p: r.pos / Math.max(1, r.total) });
    if (r.done) break;
    // stream what is new so playback can start before the render ends
    const t = call<{ samples: number; frames: number }>("renderTake", { fromSample: sent, fromFrame: sentFrames });
    if (t.samples > 0) {
      const pcm = out(0), frames = out(1);
      sent += t.samples;
      sentFrames += t.frames;
      post({ id, type: "chunk", pcm, frames, total: r.total, at: sent - t.samples }, [pcm.buffer, frames.buffer]);
    }
    await yieldNow();
    if (cancelled.has(id)) {
      cancelled.delete(id);
      call("renderCancel");
      throw new Error("cancelled");
    }
  }
  const meta = call("renderFinish");
  const pcm = out(0);
  const frames = out(1);
  x!.lab_release_outputs();
  post({ id, type: "done", result: { meta, pcm, frames } }, [pcm.buffer, frames.buffer]);
}

async function encode(id: number, pcm: Float32Array, format: "wav" | "mp3", sampleRate: number): Promise<void> {
  if (format === "wav") {
    setInput(pcm);
    call("encodeWav", { sampleRate });
    const n = x!.lab_out_u8_len();
    const bytes = new Uint8Array(x!.memory.buffer, x!.lab_out_u8_ptr(), n).slice();
    x!.lab_release_outputs();
    post({ id, type: "done", result: bytes }, [bytes.buffer]);
    return;
  }
  // lamejs (LGPL-3.0) is loaded on demand as its own chunk
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, sampleRate, 128);
  const parts: Uint8Array[] = [];
  const block = 1152 * 8;
  const i16 = new Int16Array(block);
  for (let o = 0; o < pcm.length; o += block) {
    const n = Math.min(block, pcm.length - o);
    for (let i = 0; i < n; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[o + i] * 32767)));
    const b = enc.encodeBuffer(n === block ? i16 : i16.subarray(0, n));
    if (b.length) parts.push(new Uint8Array(b));
    if ((o / block) % 16 === 0) post({ id, type: "progress", p: o / pcm.length });
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  post({ id, type: "done", result: bytes }, [bytes.buffer]);
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case "init": {
        x = (await WebAssembly.instantiate(m.module, {})).exports as unknown as WasmExports;
        dictReady = loadDict(m.dictUrl);
        post({ id: m.id, type: "done", result: true });
        break;
      }
      case "render":
        await render(m.id, m.request, m.input);
        break;
      case "cancel":
        cancelled.add(m.id);
        break;
      case "encode":
        await encode(m.id, m.pcm, m.format, m.sampleRate);
        break;
      case "edit": {
        setInput(m.pcm);
        call("edit", { op: m.op, sampleRate: m.sampleRate });
        const pcm = out(0);
        x!.lab_release_outputs();
        post({ id: m.id, type: "done", result: pcm }, [pcm.buffer]);
        break;
      }
      case "waveform": {
        setInput(m.pcm);
        call("waveform", { bins: m.bins });
        const w = out(0);
        x!.lab_release_outputs();
        post({ id: m.id, type: "done", result: w }, [w.buffer]);
        break;
      }
      case "decode": {
        const p = x!.lab_input_u8(m.bytes.length);
        new Uint8Array(x!.memory.buffer, p, m.bytes.length).set(m.bytes);
        call("decodeWav", { sampleRate: 48000 });
        const pcm = out(0);
        x!.lab_release_outputs();
        post({ id: m.id, type: "done", result: pcm }, [pcm.buffer]);
        break;
      }
    }
  } catch (err) {
    post({ id: m.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
