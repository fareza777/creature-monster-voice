/**
 * Microphone morph AudioWorklet: input → (optional) DNA rack → output for live monitoring, and
 * raw input blocks posted to the main thread while recording (the recording is morphed offline
 * in the render worker, so the export uses the full-quality chain).
 */
import type { ToMic, FromMic } from "./protocol.ts";

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

type Fn = (...a: number[]) => number;
type Exports = { memory: WebAssembly.Memory } & Record<string, Fn>;

const CHUNK = 4096;

class MicProcessor extends AudioWorkletProcessor {
  private readonly x: Exports;
  private readonly rack: number;
  private readonly buf: number;
  private monitor = false;
  private recording = false;
  private chunk = new Float32Array(CHUNK);
  private fill = 0;
  private inLevel = 0;
  private outLevel = 0;
  private blocks = 0;

  constructor(options: { processorOptions: { module: WebAssembly.Module } }) {
    super();
    this.x = new WebAssembly.Instance(options.processorOptions.module, {}).exports as unknown as Exports;
    this.rack = this.x.lab_rack_new(sampleRate);
    this.buf = this.x.chimera_alloc(128 * 4);
    this.port.onmessage = (e: MessageEvent<ToMic>) => {
      const m = e.data;
      if (m.type === "rack") {
        const n = this.x.lab_rack_n_params();
        const p = new Float32Array(this.x.memory.buffer, this.x.lab_rack_params(this.rack), n);
        for (let i = 0; i < n && i < m.values.length; i++) if (Number.isFinite(m.values[i])) p[i] = m.values[i];
        this.x.lab_rack_commit(this.rack);
      } else if (m.type === "monitor") this.monitor = m.on;
      else if (m.type === "record") {
        if (!m.on && this.recording && this.fill > 0) this.flush();
        this.recording = m.on;
        this.fill = 0;
      }
    };
    this.port.postMessage({ type: "ready" } satisfies FromMic);
  }

  private flush(): void {
    const data = this.chunk.slice(0, this.fill);
    this.port.postMessage({ type: "chunk", data } satisfies FromMic, [data.buffer]);
    this.fill = 0;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const out = outputs[0];
    if (!input) {
      for (const ch of out ?? []) ch.fill(0);
      return true;
    }
    let pk = 0;
    for (let i = 0; i < input.length; i++) pk = Math.max(pk, Math.abs(input[i]));
    this.inLevel = Math.max(pk, this.inLevel * 0.92);
    if (this.recording) {
      for (let i = 0; i < input.length; i++) {
        this.chunk[this.fill++] = input[i];
        if (this.fill === CHUNK) this.flush();
      }
    }
    if (out && out.length) {
      if (this.monitor) {
        const view = new Float32Array(this.x.memory.buffer, this.buf, input.length);
        view.set(input);
        this.x.lab_rack_process(this.rack, this.buf, input.length);
        const res = new Float32Array(this.x.memory.buffer, this.buf, input.length);
        let po = 0;
        for (let i = 0; i < res.length; i++) po = Math.max(po, Math.abs(res[i]));
        this.outLevel = Math.max(po, this.outLevel * 0.92);
        for (const ch of out) ch.set(res);
      } else for (const ch of out) ch.fill(0);
    }
    if (++this.blocks % 8 === 0) this.port.postMessage({ type: "level", input: this.inLevel, output: this.outLevel } satisfies FromMic);
    return true;
  }
}

registerProcessor("creature-mic", MicProcessor);
