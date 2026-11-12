# Implementation Plan — Creature Voice Studio

Status legend: `[x]` done and verified, `[ ]` open. Each task cites requirements.

## Phase 1 — Foundation
- [x] 1.1 Vendor CHIMERA `chimera` + `chimera-wasm` unchanged; workspace `Cargo.toml` (R1.1)
- [x] 1.2 `creature-lab` crate skeleton with DSP primitives and tests (R2.2)
- [x] 1.3 `creature-wasm` cdylib re-exporting the upstream ABI; verify zero imports (R1.2)
- [x] 1.4 Vite + React + TS app, wasm loader shared by UI/worker/worklet (R1.2)

## Phase 2 — Lab DSP (Rust)
- [x] 2.1 DNA model and mapping to source + rack params (R2.1, R2.2)
- [x] 2.2 Effect rack: formant/pitch shifter, sub-octave, growl, ring mod, crusher, comb,
      flanger, vocoder, animal trill, reverb, limiter (R2.2)
- [x] 2.3 Indonesian G2P, Spanish G2P, Creature Tongue (R4.1)
- [x] 2.4 SFX synthesiser, 14 categories, seed/mutate (R7.1, R7.2)
- [x] 2.5 Editor ops + WAV encoder (R9.1, R9.3)
- [x] 2.6 Offline renderer with telemetry frames and animal splice (R2.3, R4.3, R5.1, R6.2)
- [x] 2.7 `lab_*` C ABI + JSON dispatcher (R1.2)

## Phase 3 — Audio runtime (TS)
- [x] 3.1 Live worklet: engine + rack, telemetry (R2.4, R6.1)
- [x] 3.2 Render worker + client with progress, MP3 encoding (R4.3, R9.3)
- [x] 3.3 Playback with telemetry sync (R3.2)
- [x] 3.4 Mic capture + morph (R8.2)

## Phase 4 — 3D Voice Anatomy
- [x] 4.1 Hologram scene, tract tube from area function, organs (R3.1, R3.2)
- [x] 4.2 Touch orbit/zoom/inspect (R3.3)
- [x] 4.3 DNA cosmetics (R3.4)

## Phase 5 — Screens
- [x] 5.1 Shell: dock, particle field, transitions, toasts, haptics (R10.1)
- [x] 5.2 Lab home + DNA Mixer + Incubate pad + presets (R2)
- [x] 5.3 Speak (R4)
- [x] 5.4 Sing (R5)
- [x] 5.5 Beatbox (R6)
- [x] 5.6 SFX (R7)
- [x] 5.7 Morph (R8)
- [x] 5.8 Editor (R9.1)
- [x] 5.9 Projects + export + share (R9.2, R9.3)
- [x] 5.10 About / licences (R10.4)

## Phase 6 — Android
- [x] 6.1 Capacitor 8 Android project, icons, splash, permissions (RECORD_AUDIO) (R11.1)
- [x] 6.2 ADB install on device, logcat review, fix bugs, performance pass (R11.2)
- [x] 6.3 Release signing, APK + AAB (R11.1)

## Phase 7 — Kiroween deliverables
- [x] 7.1 Kiro hooks + MCP ADB server (process)
- [x] 7.2 README, CONTRIBUTIONS, THIRD_PARTY_NOTICES, docs/PROCESS.md, bug log (R11.4)
- [ ] 7.3 Demo video < 3 min + script (R11.3)
- [x] 7.4 Publish to the public repo (R11.4)
