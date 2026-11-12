---
inclusion: always
---

# Tech stack and rules

## Stack
- **Engine**: `crates/chimera` (upstream CHIMERA, MIT, vendored unchanged) — physical voice model.
- **Lab DSP**: `crates/creature-lab` (original) — DNA effect rack, Indonesian/Spanish/Creature
  G2P, SFX synthesiser, clip editor operations, WAV encoder, offline renderer with telemetry.
- **WASM boundary**: `crates/creature-wasm` (original cdylib) re-exports the upstream C ABI from
  `chimera-wasm` and adds the `lab_*` C ABI. Built for `wasm32-unknown-unknown`, **no imports**
  (the AudioWorklet instantiates it with `{}`), no wasm-bindgen.
- **App**: Vite + React 19 + TypeScript + zustand + three.js. Capacitor 8 for Android.
- **MP3**: `@breezystack/lamejs` (LGPL-3.0, unmodified, loaded as a separate chunk in a worker).

## Hard rules
- Everything runs offline. Never add a network request, CDN font or remote asset.
- Audio thread (AudioWorklet) code must not allocate per block in Rust; the rack is sized at
  construction. Transcendentals in Rust go through `libm` (deterministic native vs wasm).
- Long renders (TTS, song, beat bars, SFX, morph) run in the **render worker**, never on the
  UI thread. The UI thread only plans small JSON calls.
- The AudioContext runs at 48 kHz (`latencyHint: "interactive"`), like upstream.
- Three.js: cap devicePixelRatio at 2, no post-processing passes, additive glow sprites only;
  pause the render loop when the tab is hidden or the view is off-screen.
- Keep upstream crates byte-identical so attribution stays clean; extend in our crates.
- Gesture records are defined in `crates/chimera-wasm/src/lib.rs` and `src/engine/wire.ts`.

## Commands
| Task | Command |
|---|---|
| Rust tests | `cargo test -p creature-lab` |
| WASM build | `npm run wasm` |
| Typecheck | `npm run typecheck` |
| Web build | `npm run build` |
| Android sync | `npx cap sync android` |
| Debug APK | `cd android; ./gradlew assembleDebug` |
| Release AAB/APK | `cd android; ./gradlew bundleRelease assembleRelease` |
| Install on device | `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` |

JDK 21 is required for the Android build (`JAVA_HOME` = Temurin 21).
