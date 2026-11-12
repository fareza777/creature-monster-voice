# Third-party notices

Creature Voice Studio (MIT, © 2026 F7 Developer) includes or depends on the following.

| Component | Use | Licence | Notes |
|---|---|---|---|
| CHIMERA (`crates/chimera`, `crates/chimera-wasm`) by Jameson Hodge | Physical-model voice engine, C ABI | MIT | Vendored unchanged from github.com/jamesondh/chimera-vocal-synth @ 6259e88. Licence: `third_party/chimera/LICENSE`. |
| CHIMERA TypeScript files (`src/engine/wire.ts`, `src/engine/types.ts`; loader and worklet patterns) | Gesture wire format, types | MIT | Adapted; each file carries an "Adapted from CHIMERA (MIT)" header. |
| CMU Pronouncing Dictionary (`public/data/cmudict.txt.gz`) | English pronunciations | BSD-style (CMU) | `public/data/CMUDICT-LICENSE.txt`. |
| libm (Rust) | Deterministic math | MIT / Apache-2.0 | |
| serde, serde_json (Rust) | JSON boundary | MIT / Apache-2.0 | |
| react, react-dom | UI | MIT | |
| zustand | State | MIT | |
| three.js | 3D Voice Anatomy | MIT | |
| Capacitor (core, android, app, filesystem, haptics, share, splash-screen, status-bar) | Android shell and plugins | MIT | |
| @fontsource/space-grotesk (Space Grotesk by Florian Karsten), @fontsource/inter (Inter by Rasmus Andersson) | Fonts, bundled | SIL OFL 1.1 | |
| Blender 4.5 (build tool only, not shipped) | Procedural modelling of `public/models/specimen.glb` | GPL-3.0 (tool) | The generated model is original output of `tools/blender/build_specimen.py` (MIT); Blender's licence does not apply to its output. |
| three.js addons (GLTFLoader, RoomEnvironment) | Model loading, studio environment | MIT | Bundled from the three package. |
| @breezystack/lamejs (lamejs, a JS port of LAME) | MP3 encoding | LGPL-3.0 | Used unmodified as a separate, dynamically loaded chunk (`lamejs-*.js` in the build) inside the render worker. To replace it, swap the npm package for any build exposing `Mp3Encoder` and rebuild; source: github.com/shijinyu/lamejs. |
| Vite, TypeScript, @vitejs/plugin-react | Build tools (not shipped) | MIT / Apache-2.0 | |
| @modelcontextprotocol/sdk, zod | Dev-only ADB MCP server (not shipped) | MIT | |

No audio samples or recorded voices are shipped: every sound is synthesised on the device.
