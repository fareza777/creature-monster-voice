---
inclusion: always
---

# Repository structure

```
crates/chimera/          upstream engine (MIT, Jameson Hodge) — do not edit
crates/chimera-wasm/     upstream C ABI (MIT) — do not edit
crates/creature-lab/     ORIGINAL: DSP rack, G2P (id/es/creature), SFX, editor, WAV, renderer
crates/creature-wasm/    ORIGINAL: cdylib = upstream ABI + lab ABI
src/engine/              wasm loader, wire format, engine facade, render-worker client
src/audio/               AudioContext, live worklet, mic morph, playback with telemetry sync
src/worklet/             AudioWorklet processors (engine+rack live, mic morph)
src/workers/             render worker (offline render, MP3 encode)
src/three/               3D Specimen: heads, pedestal, lip-sync (original)
src/ui/                  screens, components, styles (original)
src/store/               zustand stores, project persistence
public/data/             CMUdict (BSD-style licence in CMUDICT-LICENSE.txt)
android/                 Capacitor Android project
tools/mcp/               ORIGINAL MCP server for ADB device testing
.kiro/                   specs, steering, hooks, settings (MCP)
docs/                    process, attribution, demo script, upstream docs
```

Naming: React components `PascalCase.tsx`, modules `camelCase.ts`, Rust `snake_case.rs`.
One screen per file under `src/ui/screens/`.
