# Original contributions vs. inherited work

## Inherited (CHIMERA, MIT, © 2026 Jameson Hodge) — vendored unchanged

| Path | What it is |
|---|---|
| `crates/chimera/` | The physical-modelling voice engine: FDTD airway, glottis and syrinx sources, anatomy, articulators, gestural planner, English G2P with CMUdict, singing and beatbox planners, creature airways (songbird, seal, alligator, elephant). |
| `crates/chimera-wasm/` | The engine's C ABI for the browser (`engine_*`, `chimera_call`). |
| `public/data/cmudict.txt.gz` | CMU Pronouncing Dictionary (its own licence). |
| `src/engine/wire.ts`, `src/engine/types.ts` | Adapted: gesture record format and engine types. |
| `src/worklet/voice.ts`, `src/engine/wasm.ts` | Adapted: the AudioWorklet and loader patterns (extended with the DNA rack and compact telemetry frames). |

Upstream commit: `6259e880f5d0108b862e98cefd930aa8c5bc0dc5`.

## Original to Creature Voice Studio (MIT, © 2026 F7 Developer)

| Path | What it is |
|---|---|
| `crates/creature-lab/src/rack.rs` | The DNA effect rack: granular formant/pitch shifter, flip-flop sub-octave, growl (jittered AM + shaped rasp), saturation, ring modulator with wobble, 16-band channel vocoder, metallic comb, flanger, animal trill (vibrato + tremolo), bit-crusher/decimator, tone tilt, echo, Freeverb-style reverb, DC blocker, soft clipper and peak limiter. Real-time safe. |
| `crates/creature-lab/src/dna.rs` | Specimens: five normalised DNA strands → voice source (pitch, pressure, tension, fry, roughness, breathiness, vibrato, drift, brightness), formant/pitch plan, rack settings, animal splice gain; A↔B interpolation. |
| `crates/creature-lab/src/g2p_id.rs` | Indonesian G2P: digraphs, glottal-stop k, schwa/e resolution, word-final diphthongs, taps, penultimate stress, numbers. |
| `crates/creature-lab/src/g2p_es.rs` | Spanish G2P: seseo/yeísmo, soft c/g, rr/r/ɾ, glides, β ð ɣ allophones, accent-mark stress rules, numbers. |
| `crates/creature-lab/src/creature_tongue.rs` | Creature Tongue: deterministic alien language with three dialects. |
| `crates/creature-lab/src/text.rs` | Clause splitting, phrase building, English number expansion. |
| `crates/creature-lab/src/sfx.rs` | Procedural SFX synthesiser and 18 seeded categories, mutation. |
| `crates/creature-lab/src/render.rs` | Offline render sessions (speech, song, beat, animal call, physical vocal FX, SFX, recording morph), the animal airway splice following the human envelope and melody, morph sweeps, 60 fps telemetry frames, streaming takes. |
| `crates/creature-lab/src/edit.rs`, `wav.rs` | Clip editor operations; WAV encode/decode/resample. |
| `crates/creature-lab/src/api.rs`, `crates/creature-wasm/` | The lab JSON API and the combined wasm module (upstream ABI + `lab_*`). |
| `crates/creature-lab/tests/lab.rs` | 13 tests: rack finiteness/level at 16–96 kHz, DNA mapping, G2P tables, SFX determinism, WAV round trip, editor ops, every render job, the animal splice. |
| `tools/blender/build_specimen.py` | Procedural Blender model of the 3D specimen: voxel-remeshed sculpt, mouth cut, hinge and facial shape keys, slit-pupil eyes, lids, teeth, tongue, keratin horns, tusks, antennae, visor, ears, collar, baked AO vertex colours, GLB export, preview render. |
| `src/three/specimen.ts`, `src/three/xray.ts` | PBR specimen scene: telemetry lip-sync, DNA-driven skin/iris/cosmetics, finger-tracking eyes, X-ray voice anatomy (area-function tube, velum, folds, lungs, airflow), touch orbit/zoom/inspect. |
| `src/audio/audio.ts`, `src/worklet/mic.ts`, `src/workers/render.worker.ts`, `src/engine/renderer.ts` | Audio runtime: live engine+rack worklet, streaming playback, synced anatomy frames, mic morph worklet, render worker with WAV/MP3 encoding. |
| `src/ui/**`, `src/store/**`, `src/platform/**` | The whole app UI (light premium theme), presets, songs, projects/clip vault (IndexedDB), export/share, Android lifecycle. |
| `tools/mcp/adb-mcp.mjs`, `tools/device.mjs`, `tools/shots.mjs` | MCP server and helpers for ADB + DevTools device testing. |
| `tools/make-icons.mjs`, `tools/check-licenses.mjs`, `tools/hooks/*` | Icons/splash/store art, licence gate, secret guard. |
| `.kiro/**`, `docs/**` | Spec, steering, hooks, MCP config and documentation. |
