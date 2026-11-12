# Design — Creature Voice Studio

## 1. Architecture

```
 UI thread (React)                 Render Worker                     AudioWorklet (48 kHz)
 ─────────────────                 ─────────────                     ────────────────────
 engine facade (JSON calls) ──┐    creature-wasm instance            creature-wasm instance
 planners: G2P, plans, SFX    │    lab_render_* (Engine + Rack       engine_* (upstream ABI)
 3D hologram  ◀── telemetry ──┼─── + animal splice) → PCM + frames   lab_rack_* (DNA rack)
 playback (AudioBuffer) ◀─────┘    WAV / MP3 encode                  telemetry 60 Hz → UI
 mic capture → worker morph         lab_morph_* (mic → rack)          mic-monitor processor
```

One compiled `WebAssembly.Module` (`creature.wasm`, no imports) is instantiated three times:
UI thread (planning, small JSON calls), worker (offline renders), worklet (live voice).

### Why offline render + synced playback for content
The physical airway costs ~18 % of a desktop core at 48 kHz; a Snapdragon 680 in a WebView is
3–5× slower. Running speech/song through the worker and playing an `AudioBuffer` gives glitch-free
audio, identical exports, and lets us splice a second airway (the animal) that would not fit in
real time. The worker also records 60 fps telemetry frames so the hologram moves exactly with the
sound. Live interaction (Incubate pad, beat pads, beat loop) stays on the worklet for low latency.

## 2. Rust crates

### `creature-lab` (original)
| Module | Responsibility |
|---|---|
| `dsp/` | primitives: one-pole smoother, biquad (RBJ), delay line, DC blocker, envelope follower, LFO, noise (xorshift) |
| `rack.rs` | `Rack` — DNA effect chain, pre-allocated for ≤ 96 kHz, `process(&mut [f32])` |
| `dna.rs` | `Dna` weights + `Specimen` (dna, body, species, overrides) → `SourceSettings` + `RackParams` |
| `g2p_id.rs` | Indonesian orthography → IPA segments (digraphs, schwa heuristics, final-k glottal stop, penultimate stress, numbers) |
| `g2p_es.rs` | Spanish orthography → IPA (c/z/qu/gu/ll/ñ/rr, accent-mark stress, numbers) |
| `creature_tongue.rs` | text → deterministic alien syllables (hash-seeded phonotactics) |
| `sfx.rs` | procedural SFX synth: 2 oscillators + noise, pitch envelopes, FM, filters, ADSR, repeat, 14 categories |
| `edit.rs` | trim, fade, gain, normalise, reverse, resample speed, echo |
| `wav.rs` | 16-bit PCM WAV encoder |
| `render.rs` | offline render jobs (speech/song plan, beat pattern, creature call, roar, mic morph) with telemetry frames |

### `creature-wasm` (original cdylib)
- `pub use chimera_wasm::*` keeps every upstream `engine_*`/`chimera_*` export.
- `lab_call(ptr,len)` — JSON dispatcher for non-real-time work (G2P, SFX, edit, render).
- `lab_rack_new(fs)`, `lab_rack_params(h)`, `lab_rack_apply(h)`, `lab_rack_process(h, ptr, n)`,
  `lab_rack_free(h)` — real-time rack for the worklet.
- Binary results (PCM, frames) are left in a lab result buffer: `lab_bin_ptr(i)`, `lab_bin_len(i)`.

## 3. DNA mapping (normalised weights m,a,r,h,n)
| Target | Formula (summary) |
|---|---|
| f0 multiplier | 2^((−14m + 9a − 2r + 4n)/12) |
| pressure | +4m + 2n cmH₂O |
| fry / roughness | 0.7m + 0.2n / 0.8m + 0.3n |
| tension | +0.4r + 0.3a |
| vibrato depth | 0 for robot share; +0.5n (animal trill) |
| formant shift (semitones) | −7m + 6a + 2n (granular shift + compensated f0) |
| sub-octave mix | 0.65m |
| growl AM depth / rate | 0.6m / 32–60 Hz |
| ring mod | robot: 55 Hz × 0.7r; alien: 420 Hz with LFO × 0.6a |
| bit-crush | bits 16 → 6 with r, rate decimation × (1 + 3r) |
| comb | robot metallic 4.5 ms, feedback 0.75r |
| flanger | alien depth 0.8a |
| vocoder | robot ≥ 0.6 → 16-band vocoder with monotone saw carrier |
| reverb | cave 0.25m + 0.25a + 0.1 |
| animal splice | species layer gain 0.9n, gated by the voice envelope |

## 4. 3D Voice Anatomy (`src/three/`)
- Scene: hologram head (Fresnel shader, scanlines), skull/jaw meshes, tract as a `TubeGeometry`
  whose ring radii are rewritten per frame from `phAreas`/`orAreas` (r = √(A/π)), nasal branch
  scaled by `velumPort`, tongue as a deformable capsule placed from `tbX/tbY/ttX/ttY`, jaw pivot
  rotation from `jaw`, lips as two arcs scaled by `lipAp/lipWidth/lipProt`, vocal folds as two
  wedges whose gap follows `glottalArea`, lungs as icospheres scaled by `pLung`, airflow particles
  along the tube with speed from `flow`.
- DNA cosmetics: horns (monster), antenna and big eyes (alien), visor and bolts (robot),
  ears/snout (animal) fade in by weight.
- Performance: one `WebGLRenderer`, DPR ≤ 2, ~25k triangles, additive sprites for glow, loop paused
  when hidden; frame source is either live telemetry or the rendered clip's frame track sampled at
  `audioCtx.currentTime`.
- Touch: custom orbit (one finger), pinch zoom, tap raycast → organ info card.

## 5. UI
Screens: Lab (home, hologram + quick speak), DNA Mixer, Speak, Sing, Beatbox, SFX, Morph,
Editor, Projects, About. Bottom dock with 5 primary tabs + "More" sheet. Design tokens: toxic
green `#39ff88`, plasma cyan `#2de2ff`, ultraviolet `#a45bff`, blood `#ff3b5c`, near-black
`#05070d`. Orbitron (OFL) for display, system UI font for body. Particle field canvas behind
everything, throttled to 30 fps.

## 6. Persistence and export
- Projects: IndexedDB (`cvs-projects`) — JSON settings + clip PCM as `Float32Array` blobs.
- Export: Capacitor Filesystem → `Documents/CreatureVoiceStudio/<name>.wav|mp3`, then Capacitor
  Share with the file URI. On the web build, download via an anchor.

## 7. Error handling
- Engine JSON errors throw typed errors shown as a toast; the worker reports `{error}` per job.
- Worklet failure → toast + node rebuild on next interaction.
- Mic denied → explain and link to app settings.

## 8. Testing
- Rust unit tests: rack finiteness/peak, G2P tables (Indonesian/Spanish words), SFX determinism,
  WAV header, editor ops, renderer length.
- TypeScript typecheck + Vite build.
- Device: ADB install, logcat filtered on `Capacitor/Console`, screenshots, performance via the
  in-app FPS/engine-load HUD (long-press the logo).
