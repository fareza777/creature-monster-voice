/**
 * The audio runtime: one 48 kHz AudioContext, the live voice worklet (engine + DNA rack), clip
 * playback with a synced anatomy track, and the microphone morph worklet. Everything the 3D view
 * draws comes from `currentFrame()`.
 */
import voiceUrl from "../worklet/voice.ts?worker&url";
import micUrl from "../worklet/mic.ts?worker&url";
import { wasmModule } from "../engine/wasm.ts";
import { FRAME_RATE, FRAME_STRIDE, rackArray, type Design } from "../engine/lab.ts";
import type { BeatStep, BodyMix, Gesture, HumanArtic, VoiceSource } from "../engine/types.ts";
import type { Chunk, Clip } from "../engine/renderer.ts";

interface Stream {
  sampleRate: number;
  total: number;
  received: number;
  scheduled: number;
  queue: Float32Array[];
  frames: Float32Array;
  nFrames: number;
  started: boolean;
  t0: number;
  nextTime: number;
  sources: AudioBufferSourceNode[];
  clip: Clip;
  done: boolean;
}
import type { FromMic, FromVoice, ToMic, ToVoice } from "../worklet/protocol.ts";

type Listener = () => void;

class AudioRuntime {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private voice: AudioWorkletNode | null = null;
  private starting: Promise<void> | null = null;
  liveFrame: Float32Array | null = null;
  liveAt = 0;
  load = 0;
  beatStep = -1;
  error: string | null = null;
  // playback
  private source: AudioBufferSourceNode | null = null;
  playing: Clip | null = null;
  private playStart = 0;
  private playOffset = 0;
  private stream: Stream | null = null;
  private endListeners = new Set<Listener>();
  // mic
  private mic: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private micChunks: Float32Array[] = [];
  micLevel = { input: 0, output: 0 };
  private pendingArtic: Partial<HumanArtic> | null = null;
  private flushQueued = false;

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Create (or resume) the context and the live voice. Call from a user gesture. */
  start(): Promise<void> {
    if (this.ctx && this.voice) return this.ctx.resume();
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(voiceUrl);
      await ctx.audioWorklet.addModule(micUrl);
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      this.master = master;
      this.analyser = analyser;
      this.buildVoice();
      await ctx.resume();
    })();
    this.starting.catch((e) => {
      this.error = String(e);
      this.starting = null;
    });
    return this.starting;
  }

  private buildVoice(): void {
    const ctx = this.ctx!;
    const node = new AudioWorkletNode(ctx, "creature-voice", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module: wasmModule() } });
    node.port.onmessage = (e: MessageEvent<FromVoice>) => {
      const m = e.data;
      if (m.type === "frame") {
        this.liveFrame = m.frame;
        this.liveAt = performance.now();
        this.load = m.load;
        this.beatStep = m.beatStep;
      } else if (m.type === "error") {
        this.error = m.message;
        console.error(m.message);
        // rebuild on the next interaction
        node.disconnect();
        this.voice = null;
      }
    };
    node.connect(this.master!);
    this.voice = node;
  }

  send(m: ToVoice): void {
    if (!this.voice && this.ctx) this.buildVoice();
    this.voice?.port.postMessage(m);
  }

  // ---------------------------------------------------------------- live voice

  /** Apply a specimen's design to the live voice (body, source, rack). */
  applyDesign(d: Design, body?: BodyMix): void {
    if (body) this.send({ type: "body", body });
    const s = d.source;
    this.send({ type: "source", values: { f0: s.f0, pressure: s.pressure, breathiness: s.breathiness, tension: s.tension, fry: s.fry, roughness: s.roughness, vibratoDepth: s.vibratoDepth, vibratoRate: s.vibratoRate, drift: s.drift, brightness: s.brightness, voiced: true } });
    this.send({ type: "rack", values: rackArray(d.rack) });
  }

  setRack(values: number[]): void {
    this.send({ type: "rack", values });
  }

  gate(level: number): void {
    this.send({ type: "gate", level });
  }

  setSource(values: Partial<VoiceSource>): void {
    this.send({ type: "source", values });
  }

  /** Coalesced to one message per animation frame. */
  setArtic(values: Partial<HumanArtic>): void {
    this.pendingArtic = { ...(this.pendingArtic ?? {}), ...values };
    if (this.flushQueued) return;
    this.flushQueued = true;
    requestAnimationFrame(() => {
      this.flushQueued = false;
      if (this.pendingArtic) this.send({ type: "artic", values: this.pendingArtic });
      this.pendingArtic = null;
    });
  }

  schedule(gestures: Gesture[], replace = false, lead = 0.01): void {
    this.send({ type: "schedule", gestures, replace, lead });
  }

  beat(m: { steps?: (BeatStep | null)[]; bpm?: number; swing?: number; playing?: boolean }): void {
    this.send({ type: "beat", ...m });
  }

  beatHit(id: string, note?: number, accent?: number): void {
    this.send({ type: "beatHit", id, note, accent });
  }

  setCreature(id: string): void {
    this.send({ type: "creature", id });
  }

  playCall(id: string, pitch?: number): void {
    this.send({ type: "call", id, pitch });
  }

  // ---------------------------------------------------------------- clip playback

  async play(clip: Clip, offset = 0): Promise<void> {
    await this.start();
    const ctx = this.ctx!;
    this.stop(false);
    const buf = ctx.createBuffer(1, clip.pcm.length, clip.meta.sampleRate);
    buf.copyToChannel(clip.pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master!);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.playing = null;
      for (const l of this.endListeners) l();
    };
    this.playOffset = Math.max(0, Math.min(offset, buf.duration));
    this.playStart = ctx.currentTime + 0.01;
    src.start(this.playStart, this.playOffset);
    this.source = src;
    this.playing = clip;
  }

  stop(notify = true): void {
    if (this.stream) {
      for (const s of this.stream.sources) {
        s.onended = null;
        try {
          s.stop();
        } catch {
          /* not started */
        }
      }
      const had = this.stream.started;
      this.stream = null;
      if (had) {
        this.playing = null;
        if (notify) for (const l of this.endListeners) l();
      }
    }
    if (this.source) {
      const s = this.source;
      this.source = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      this.playing = null;
      if (notify) for (const l of this.endListeners) l();
    }
  }

  // ---------------------------------------------------------------- streaming playback

  /** Prepare to play a render while it is still being rendered. */
  beginStream(sampleRate = 48000): void {
    this.stop(false);
    const meta = { sampleRate, samples: 0, frames: 0, frameRate: FRAME_RATE, stride: FRAME_STRIDE, segments: [], words: [], transcription: "", design: undefined as never, kind: "stream" };
    this.stream = { sampleRate, total: 0, received: 0, scheduled: 0, queue: [], frames: new Float32Array(0), nFrames: 0, started: false, t0: performance.now(), nextTime: 0, sources: [], done: false, clip: { id: "stream", name: "", pcm: new Float32Array(0), frames: new Float32Array(0), meta, createdAt: Date.now() } };
  }

  private scheduleChunk(pcm: Float32Array): void {
    const st = this.stream!, ctx = this.ctx!;
    if (!pcm.length) return;
    const buf = ctx.createBuffer(1, pcm.length, st.sampleRate);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master!);
    // an underrun leaves a short gap rather than overlapping audio
    const at = Math.max(st.nextTime, ctx.currentTime + 0.02);
    src.start(at);
    st.nextTime = at + buf.duration;
    st.scheduled += pcm.length;
    st.sources.push(src);
    src.onended = () => {
      if (this.stream !== st) return;
      st.sources = st.sources.filter((x) => x !== src);
      if (st.done && st.sources.length === 0) {
        this.stream = null;
        this.playing = null;
        for (const l of this.endListeners) l();
      }
    };
  }

  /** A streamed chunk arrived. Returns true once playback has started. */
  pushChunk(c: Chunk): boolean {
    const st = this.stream;
    if (!st || !this.ctx) return false;
    st.total = c.total;
    st.received = c.at + c.pcm.length;
    // grow the anatomy track
    const need = st.nFrames * FRAME_STRIDE + c.frames.length;
    if (need > st.frames.length) {
      const g = new Float32Array(Math.max(need, Math.ceil((c.total / st.sampleRate) * FRAME_RATE + 4) * FRAME_STRIDE));
      g.set(st.frames.subarray(0, st.nFrames * FRAME_STRIDE));
      st.frames = g;
    }
    st.frames.set(c.frames, st.nFrames * FRAME_STRIDE);
    st.nFrames += c.frames.length / FRAME_STRIDE;
    st.clip.frames = st.frames;
    st.clip.meta.frames = st.nFrames;
    if (st.started) {
      this.scheduleChunk(c.pcm);
      return true;
    }
    st.queue.push(c.pcm);
    // start as soon as the rest will render before playback reaches it
    const sr = st.sampleRate;
    const rendered = st.received / sr, total = st.total / sr;
    const rate = rendered / Math.max(0.05, (performance.now() - st.t0) / 1000);
    const remainingRender = (total - rendered) / Math.max(0.05, rate);
    if (rendered >= 0.35 && remainingRender < total - 0.25 - rendered * 0.1) {
      st.started = true;
      st.nextTime = this.ctx.currentTime + 0.06;
      this.playStart = st.nextTime;
      this.playOffset = 0;
      this.playing = st.clip;
      for (const q of st.queue) this.scheduleChunk(q);
      st.queue = [];
      return true;
    }
    return false;
  }

  /** The render finished: play what was not streamed (or the whole clip if it never started). */
  async endStream(clip: Clip): Promise<void> {
    const st = this.stream;
    if (!st || !st.started) {
      this.stream = null;
      await this.play(clip);
      return;
    }
    this.scheduleChunk(clip.pcm.subarray(st.scheduled));
    st.done = true;
    st.clip = clip;
    this.playing = clip;
    if (st.sources.length === 0) {
      this.stream = null;
      this.playing = null;
      for (const l of this.endListeners) l();
    }
  }

  onEnded(l: Listener): () => void {
    this.endListeners.add(l);
    return () => this.endListeners.delete(l);
  }

  /** Seconds into the playing clip (what is heard now, latency included). */
  playhead(): number | null {
    if (!this.playing || !this.ctx) return null;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return Math.max(0, this.ctx.currentTime - this.playStart - lat + this.playOffset);
  }

  /** The anatomy frame for now: the playing clip's track, else the live voice, else null. */
  currentFrame(): Float32Array | null {
    const clip = this.playing;
    const t = this.playhead();
    if (clip && t !== null && clip.meta.frames > 0) {
      const i = Math.min(clip.meta.frames - 1, Math.floor(t * FRAME_RATE));
      return clip.frames.subarray(i * FRAME_STRIDE, (i + 1) * FRAME_STRIDE);
    }
    if (this.liveFrame && performance.now() - this.liveAt < 300) return this.liveFrame;
    return null;
  }

  // ---------------------------------------------------------------- microphone

  async micOpen(): Promise<void> {
    await this.start();
    if (this.mic) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.micStream = stream;
    const ctx = this.ctx!;
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "creature-mic", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { module: wasmModule() } });
    node.port.onmessage = (e: MessageEvent<FromMic>) => {
      const m = e.data;
      if (m.type === "chunk") this.micChunks.push(m.data);
      else if (m.type === "level") this.micLevel = { input: m.input, output: m.output };
    };
    src.connect(node);
    node.connect(this.master!);
    this.mic = node;
  }

  micSend(m: ToMic): void {
    this.mic?.port.postMessage(m);
  }

  micRecord(on: boolean): void {
    if (on) this.micChunks = [];
    this.micSend({ type: "record", on });
  }

  /** The recording so far, joined. */
  async micTake(): Promise<Float32Array> {
    // the worklet flushes its last partial chunk when recording stops
    await new Promise((r) => setTimeout(r, 120));
    const n = this.micChunks.reduce((s, c) => s + c.length, 0);
    const out = new Float32Array(n);
    let at = 0;
    for (const c of this.micChunks) {
      out.set(c, at);
      at += c.length;
    }
    this.micChunks = [];
    return out;
  }

  micClose(): void {
    this.mic?.disconnect();
    this.mic = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  get micRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }
}

export const audio = new AudioRuntime();
