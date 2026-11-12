# How Kiro built Creature Voice Studio

The project was built with **Kiro CLI**. Everything it worked from is committed in
[`.kiro/`](../.kiro/): one spec, six steering files and six hook definitions. No custom agents or
Kiro powers were used. The workspace MCP config is in `.kiro/settings/mcp.json` (a copy is kept in
`docs/kiro/mcp.json`).

## 1. Spec-driven development

`.kiro/specs/creature-voice-studio/` holds the spec that Kiro worked from:

| File | What is in it |
|---|---|
| `requirements.md` | 11 requirement groups (R1-R11) in EARS form ("WHEN ... THE SYSTEM SHALL ..."): the offline physical voice engine, the Creature DNA Mixer, the 3D view, Text-to-Voice, Singing, Beatbox, SFX, Voice Morphing, editor/projects/export, UX and performance targets for a Snapdragon 680, and the release and Kiroween deliverables. |
| `design.md` | The three-thread architecture (UI / render worker / AudioWorklet sharing one compiled `creature.wasm`), why speech is rendered offline and then played, the Rust crate layout, and the DNA mapping as formulas (for example f0 multiplier = 2^((-14m + 9a - 2r + 4n)/12)). |
| `tasks.md` | Seven phases (foundation, Rust lab DSP, audio runtime, 3D, screens, Android, Kiroween deliverables). Every task cites the requirements it covers and is ticked only when it is done and verified. |

The spec kept a large build in order: Kiro implemented phase by phase, and the
`spec-progress-reminder` hook made it tick tasks and log what was verified at the end of each
turn ([`docs/DEVLOG.md`](DEVLOG.md)).

The spec also changed when the product did. The first design was an anatomy "hologram" of the
airway. After device testing the user found it tacky, so it was replaced by eight sculpted
creature heads, and the steering now says "No anatomy diagrams ... the specimen is the show".

## 2. Steering

| File | Inclusion | What it keeps Kiro on track with |
|---|---|---|
| `product.md` | always | The product promise, the feature pillars ("all must be real, never placeholders"), the audience, English-only copy and the non-goals (no accounts, no network, no ads, no analytics). |
| `tech.md` | always | The stack, hard rules (offline only; no per-block allocation on the audio thread; long renders only in the worker; 48 kHz; keep upstream crates byte-identical) and the command table. |
| `structure.md` | always | Where code goes. |
| `audio-dsp.md` | `crates/creature-lab/**`, `src/worklet/**`, `src/audio/**`, `src/workers/**` | DSP rules, loaded only when audio code is touched. |
| `specimen-3d.md` | `src/three/**`, `tools/blender/**`, `public/models/**` | The Blender pipeline, the node names `specimen.ts` depends on, the triangle/texture budget for the test phone, lighting and skin colour rules. |
| `licensing.md` | `package.json`, `Cargo.toml`, `THIRD_PARTY_NOTICES.md`, `public/**` | What licences are allowed and how attribution is kept. |

Always-on files hold the rules that apply everywhere. The DSP, 3D and licensing rules load only
for the files they govern, so they do not crowd every request.

## 3. Agent hooks

| Hook | Trigger | What it does |
|---|---|---|
| `rust-lab-tests` | save of `crates/creature-lab` or `creature-wasm` `.rs` files | Runs `cargo test -p creature-lab --release` (rack finiteness and level, G2P, SFX determinism, every render job). |
| `typecheck-on-save` | save of `src/**/*.ts(x)` | `tsc --noEmit`, so type errors show up right away. |
| `rebuild-specimen-model` | save of the Blender scripts | Re-runs the headless Blender build so `public/models/<kind>.glb` always match the scripts. |
| `licence-gate` | save of `package.json`, `Cargo.toml` or the notices | `tools/check-licenses.mjs` fails if a runtime dependency is missing from the notices or has a disallowed licence. |
| `guard-signing-secrets` | before a shell tool call | `tools/hooks/guard-secrets.mjs` blocks any git command that would stage the release keystore or `keystore.properties`. |
| `spec-progress-reminder` | end of an agent turn | Asks the agent to tick `tasks.md` and add a dated devlog entry. |

## 4. MCP: an original server for testing on a real phone

`tools/mcp/adb-mcp.mjs` (`npm run mcp:adb`) is an MCP server written for this project. It lets
Kiro drive the Android phone over ADB and the WebView over the Chrome DevTools Protocol:

`devices`, `install_app`, `launch_app`, `screenshot` (returned as an image), `eval_js` (run
JavaScript in the app; `window.__cvs` exposes the store, audio and renderer), `console_logs`,
`go_screen`, `render_benchmark` (time to first sound, render time, clip length), `perf_stats`
(meminfo, top, gfxinfo) and `tap`.

With it Kiro could see and measure the app on the Redmi Note 11 (Snapdragon 680) instead of
guessing. Bugs found this way are in the devlog, for example:

- choppy playback: the live engine kept running in silence on the audio thread and starved clip
  playback (fixed: the worklet sleeps when idle);
- no sound: the AudioContext had started without a touch and stayed `suspended` (fixed: resume on
  every touch, on visibility and before every playback; checked with real taps over ADB);
- render latency under memory pressure (the 3D view now draws once a second while incubating).

A Blender MCP entry is in the config but disabled; the heads are built by scripts run headless
(`tools/build-models.mjs`).

## 5. Verification Kiro ran

- `cargo test -p creature-lab --release`: 13 tests.
- `node tools/wasm-check.mjs`: the wasm module has 0 imports and the expected exports, plus a
  render benchmark.
- `npm run typecheck`, `node tools/check-licenses.mjs`.
- On the device: screenshots of every head preset (`tools/heads-tour.mjs`, `tools/looks.mjs`)
  and render timings.
