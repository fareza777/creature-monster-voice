/**
 * Live voice AudioWorklet: the CHIMERA engine followed by the creature-lab DNA rack, both from
 * the same wasm instance (the rack processes the engine's output buffer in place).
 * Posts a compact telemetry frame (~60 Hz) for the 3D anatomy.
 *
 * Adapted from CHIMERA (MIT) — src/worklet/processor.ts
 */
import { writeGestures, writeSteps, fromUtf8, utf8, CONTROL_KEYS } from "../engine/wire.ts";
import type { ToVoice, FromVoice } from "./protocol.ts";

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

type Fn = (...a: number[]) => number;
type Exports = { memory: WebAssembly.Memory } & Record<string, Fn>;

const ARTIC_KEYS = CONTROL_KEYS.slice(0, 17);
const SOURCE_KEYS = ["f0", "glide", "pressure", "breathiness", "tension", "fry", "roughness", "vibratoDepth", "vibratoRate", "drift", "voiced", "brightness"];
const TELE_HEADER = 16;
const STRIDE = 56;
const N_AREAS = 32;

interface CreatureInfo {
  id: string;
  params: string[];
  calls: string[];
  tubes: { name: string; n: number }[];
  sources: string[];
}

function resample(src: Float64Array, dst: Float32Array, at: number, n: number): void {
  if (src.length === 0) {
    for (let i = 0; i < n; i++) dst[at + i] = 2;
    return;
  }
  for (let i = 0; i < n; i++) {
    const p = (i * (src.length - 1)) / Math.max(1, n - 1);
    const k = Math.floor(p), fr = p - k;
    const a = src[Math.min(k, src.length - 1)], b = src[Math.min(k + 1, src.length - 1)];
    dst[at + i] = a + (b - a) * fr;
  }
}

class VoiceProcessor extends AudioWorkletProcessor {
  private readonly x: Exports;
  private readonly h: number;
  private readonly rack: number;
  private rackOn = true;
  private failed = false;
  private telemetryOn = true;
  private blocks = 0;
  private load = 0;
  private level = 0;
  private creature: CreatureInfo | null = null;
  /**
   * Sleep: the physical engine is heavy for a phone's audio thread, and running it in silence
   * starves clip playback (dropouts). It sleeps after a short silence once nothing is scheduled
   * and wakes on any command that can make sound. While asleep its clock stands still, so
   * gestures scheduled later keep their timing.
   */
  private gateLevel = 0;
  private beatPlaying = false;
  private quietBlocks = 0;
  private awakeUntil = 0;

  constructor(options: { processorOptions: { module: WebAssembly.Module } }) {
    super();
    this.x = new WebAssembly.Instance(options.processorOptions.module, {}).exports as unknown as Exports;
    this.h = this.x.engine_new(sampleRate);
    this.rack = this.x.lab_rack_new(sampleRate);
    this.port.onmessage = (e: MessageEvent<ToVoice>) => {
      if (this.failed) return;
      try {
        this.handle(e.data);
      } catch (err) {
        this.fail(err);
      }
    };
    this.post({ type: "ready", sampleRate });
  }

  private post(m: FromVoice, transfer?: Transferable[]): void {
    this.port.postMessage(m, transfer ?? []);
  }

  private fail(err: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.post({ type: "error", message: `engine stopped: ${String(err)}` });
  }

  private get mem(): ArrayBuffer {
    return this.x.memory.buffer;
  }

  private values(): Float64Array {
    return new Float64Array(this.mem, this.x.engine_values(this.h), 32).fill(NaN);
  }

  private engineJson<T>(fn: string, args: Record<string, unknown>): T {
    const x = this.x;
    const bytes = utf8(JSON.stringify(args));
    const p = x.chimera_alloc(bytes.length);
    new Uint8Array(this.mem, p, bytes.length).set(bytes);
    const status = x[fn](this.h, p, bytes.length);
    x.chimera_free(p, bytes.length);
    const v = JSON.parse(fromUtf8(new Uint8Array(this.mem, x.chimera_result_ptr(), x.chimera_result_len())));
    if (status !== 0) throw new Error(v.error);
    return v as T;
  }

  private wake(seconds: number): void {
    this.quietBlocks = 0;
    this.awakeUntil = Math.max(this.awakeUntil, this.blocks + Math.ceil((seconds * sampleRate) / 128));
  }

  private handle(m: ToVoice): void {
    switch (m.type) {
      case "gate":
        this.gateLevel = m.level;
        this.wake(0.5);
        break;
      case "schedule": {
        let end = 0;
        for (const g of m.gestures) end = Math.max(end, Number.isFinite(g.t1) ? g.t1 : 30);
        this.wake(end + (m.lead ?? 0.03) + 0.4);
        break;
      }
      case "beat":
        if (m.playing !== undefined) this.beatPlaying = m.playing;
        this.wake(0.5);
        break;
      case "beatHit":
      case "call":
      case "creature":
      case "artic":
      case "body":
        this.wake(1.5);
        break;
    }
    this.apply(m);
  }

  private apply(m: ToVoice): void {
    const x = this.x, h = this.h;
    switch (m.type) {
      case "body":
        x.engine_set_body(h, m.body.female, m.body.child);
        break;
      case "artic": {
        const v = this.values();
        for (const [k, val] of Object.entries(m.values)) {
          const i = ARTIC_KEYS.indexOf(k as never);
          if (i >= 0 && typeof val === "number") v[i] = val;
        }
        x.engine_set_artic(h, m.tipFree === undefined ? 2 : m.tipFree ? 1 : 0);
        break;
      }
      case "source": {
        const v = this.values();
        for (const [k, val] of Object.entries(m.values)) {
          const i = SOURCE_KEYS.indexOf(k);
          if (i >= 0) v[i] = typeof val === "boolean" ? (val ? 1 : 0) : (val as number);
        }
        x.engine_set_source(h);
        break;
      }
      case "gate":
        x.engine_set_gate(h, m.level);
        break;
      case "telemetry":
        this.telemetryOn = m.enabled;
        break;
      case "schedule": {
        const n = writeGestures(this.mem, x.engine_records(h), m.gestures, 4000);
        x.engine_schedule(h, n, m.lead ?? 0.03, m.replace ? 1 : 0);
        break;
      }
      case "stopSpeech":
        x.engine_stop_speech(h);
        break;
      case "beat": {
        const n = m.steps ? writeSteps(this.mem, x.engine_records(h), m.steps) : 0;
        x.engine_set_beat(h, m.steps ? 1 : 0, n, m.bpm ?? NaN, m.swing ?? NaN, m.playing === undefined ? 2 : m.playing ? 1 : 0);
        break;
      }
      case "beatHit":
        writeSteps(this.mem, x.engine_records(h), [{ id: m.id, note: m.note, accent: m.accent }]);
        x.engine_beat_hit(h);
        break;
      case "creature":
        this.creature = m.id === "human" ? (x.engine_set_human(h), null) : this.engineJson<CreatureInfo>("engine_set_creature", { id: m.id, params: m.params ?? {} });
        break;
      case "call": {
        const i = this.creature ? this.creature.calls.indexOf(m.id) : -1;
        if (i >= 0) x.engine_play_call(h, i, m.pitch ?? NaN, m.amp ?? NaN);
        break;
      }
      case "rack": {
        const n = x.lab_rack_n_params();
        const p = new Float32Array(this.mem, x.lab_rack_params(this.rack), n);
        for (let i = 0; i < n && i < m.values.length; i++) if (Number.isFinite(m.values[i])) p[i] = m.values[i];
        x.lab_rack_commit(this.rack);
        break;
      }
      case "rackOn":
        this.rackOn = m.on;
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const ch0 = out[0];
    if (this.failed) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    const t0 = Date.now();
    this.blocks++;
    const asleep = this.gateLevel <= 0 && !this.beatPlaying && this.blocks > this.awakeUntil && this.quietBlocks > (0.4 * sampleRate) / 128;
    if (asleep) {
      for (const ch of out) ch.fill(0);
      this.level *= 0.93;
      this.load += 0.05 * (0 - this.load);
      return true;
    }
    try {
      const p = this.x.engine_render(this.h, ch0.length);
      if (this.rackOn) this.x.lab_rack_process(this.rack, p, ch0.length);
      ch0.set(new Float32Array(this.mem, p, ch0.length));
    } catch (err) {
      ch0.fill(0);
      this.fail(err);
    }
    let pk = 0;
    for (let i = 0; i < ch0.length; i++) pk = Math.max(pk, Math.abs(ch0[i]));
    this.level = Math.max(pk, this.level * 0.93);
    this.quietBlocks = pk < 3e-4 ? this.quietBlocks + 1 : 0;
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    const budget = (ch0.length / sampleRate) * 1000;
    this.load += 0.05 * ((Date.now() - t0) / budget - this.load);
    if (this.telemetryOn && !this.failed && this.blocks % 6 === 0) {
      try {
        this.postFrame();
      } catch (err) {
        this.fail(err);
      }
    }
    return true;
  }

  private postFrame(): void {
    const x = this.x, h = this.h;
    const f = new Float32Array(STRIDE);
    if (this.creature) {
      const o = Math.min(1, this.level * 3);
      f[0] = 0.15 + 0.85 * o; f[1] = 2.9; f[2] = 7.6; f[3] = 5.9; f[4] = 8.8; f[5] = 0.3 + 1.4 * o; f[7] = 0.5;
      f[11] = o; f[12] = 8 * o; f[13] = this.level; f[14] = o; f[15] = 0.05 + 0.1 * o; f[19] = 1;
      for (let i = 0; i < N_AREAS; i++) f[24 + i] = 1.5 + 2.5 * (i / (N_AREAS - 1)) * o + (1 - i / (N_AREAS - 1));
    } else {
      const p = x.engine_telemetry(h);
      const head = new Float64Array(this.mem, p, TELE_HEADER);
      const [, , velumPort, f0, voicing, pLung, , noiseLevel, , gate, , nArtic, nPh, nOr, nScope] = head;
      const all = new Float64Array(this.mem, p, TELE_HEADER + nArtic + 3 * (nPh + nOr) + 2 * nScope);
      let o = TELE_HEADER;
      const artic = all.subarray(o, (o += nArtic));
      const ph = all.subarray(o, (o += nPh));
      const or = all.subarray(o, (o += nOr));
      o += nPh + nOr; // pressure RMS
      const flow = all.subarray(o, (o += nPh + nOr));
      const glottal = all.subarray(o, (o += nScope));
      f[0] = artic[0]; f[1] = artic[1]; f[2] = artic[2]; f[3] = artic[3]; f[4] = artic[4];
      f[5] = artic[7]; f[6] = artic[8]; f[7] = artic[9]; f[8] = artic[11]; f[9] = artic[12];
      f[10] = f0; f[11] = voicing; f[12] = pLung; f[13] = this.level; f[14] = gate;
      let g = 0;
      for (let i = 0; i < glottal.length; i++) g += glottal[i];
      f[15] = glottal.length ? g / glottal.length : 0;
      f[16] = velumPort; f[17] = noiseLevel;
      let fl = 0;
      for (let i = 0; i < flow.length; i++) fl += Math.abs(flow[i]);
      f[18] = flow.length ? fl / flow.length : 0;
      resample(ph, f, 24, 16);
      resample(or, f, 40, 16);
    }
    this.post({ type: "frame", frame: f, load: this.load, beatStep: x.engine_beat_step(h), creature: !!this.creature }, [f.buffer]);
  }
}

registerProcessor("creature-voice", VoiceProcessor);
