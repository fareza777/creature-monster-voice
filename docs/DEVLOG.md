# Dev log

## 2026-11-12 (night) - "Night Lab" dark theme

### What changed
- `src/ui/styles.css`: the light theme is replaced by a dark "Night Lab" theme. Every colour is
  now a token in `:root` (near-black `--bg #05070d`, glass panels, `--violet #a45bff`,
  `--toxic #39ff88`, cyan, blood, amber, pumpkin, text levels, glows); the rules use only
  variables. Toxic green marks live state (Lab readouts in a monospace face, active chips and
  tabs, Splice, playback progress, the incubator fluid), ultraviolet marks selection and primary
  actions. Panels read as lab monitors (blinking status dot), DNA sliders and strand icons glow
  in their strand colour, the share bar glows, a vignette frames the stage, and the stage has an
  ultraviolet spotlight and a green floor mist. The vault's empty-state icon is now sized (it
  rendered huge).
- `src/three/specimen.ts`: night-lab lighting (dimmer environment, cool key, ultraviolet and
  toxic-green rims, low fill), an obsidian plinth with brass trims, a darker contact shadow, and
  an additive glow pool on the floor that takes the iris colour and follows the voice level like
  the ring.
- Spores (`Particles.tsx`) recoloured and made smaller and brighter for the dark.
- Native chrome: status bar and window/splash backgrounds `#05070d` with light status icons
  (`capacitor.config.ts`, `lifecycle.ts`, `res/values/styles.xml`, `index.html`);
  `tools/make-icons.mjs` now draws dark splash screens and store art (regenerated).
- Spec and steering brought up to date: R3 is now "Interactive 3D Specimen" (the anatomy
  hologram was removed earlier), R10.1 describes the Night Lab theme and AA contrast,
  `design.md` §4/§5, `product.md`, `structure.md` and `specimen-3d.md` updated.

### Verified, and how
- Contrast on `--bg`: ink 18:1, text 15.6:1, dim 8.1:1, faint 5:1 (4.6:1 on surfaces); white on
  the primary button gradient ≥ 4.8:1; dark text on toxic green 14:1.
- Web build previewed in headless Chrome at 393×873 (Lab, DNA, Speak, Studio, Vault): no console
  errors.
- On the phone (Redmi Note 11, `69f664ea`): the debug APK installed over the previous debug build with `adb install -r` (app data kept; a `run-as` tar backup was taken first). Screenshots of Lab, DNA (library and strands), Speak, Studio and Vault look as intended: status and navigation bars dark, readouts and active states toxic green, the plinth glow visible.

- `npm run build` (typecheck + Vite), `npx cap sync android`, `gradlew bundleRelease
  assembleRelease assembleDebug` (with `--no-daemon --max-workers=2`, 1.25 GB heap, because of
  low free RAM): success. `cargo test -p creature-lab --release`: 13 passed.
  `tools/wasm-check.mjs`: 0 imports, 56 exports. `tools/check-licenses.mjs`: all allowed.
- Release APK signed by CN=F7 Developer (`apksigner verify`).

### Bugs and issues found
- The vault empty state showed the save icon at full width (an unsized inline SVG). Fixed.
- The Lab's quick chips still scroll under the Splice button (unchanged).

## 2026-11-12 (evening) - Kiroween submission prep: docs and a fresh release build

### What changed
- LICENSE: the CHIMERA notice is now a plain second copyright line and the trailing pointer
  to THIRD_PARTY_NOTICES.md is gone, so GitHub can detect the licence as MIT (it showed
  "Other / NOASSERTION").
- New docs/KIRO.md and docs/ARCHITECTURE.md (the README already linked to both, but they
  did not exist), and docs/PROCESS.md with a bug log. Task 7.2 ticked.
- README: "Try it" and "The costume" sections.
- .kiro/settings/mcp.json: the workspace MCP config (copy of docs/kiro/mcp.json;
  	ools/mcp/adb-mcp.mjs already said it was configured there).
- Signed release APK and AAB rebuilt from 82e628a (the previous ones were from 11 November).

### Verified, and how
- 
pm run typecheck: clean. 	ools/check-licenses.mjs: 15 runtime dependencies, all allowed.
  	ools/wasm-check.mjs: 0 imports, 56 exports. cargo test -p creature-lab --release: 13 passed.
- 
pm run build, 
px cap sync android, gradlew bundleRelease assembleRelease: success.
  pksigner verify: signed by CN=F7 Developer. minSdk 24, targetSdk 36. APK 17.6 MB.

### Bugs and issues found
- The first Gradle run died ("daemon disappeared") with ~500 MB of free RAM on this PC; it
  passed with --no-daemon --max-workers=2 and a 1.25 GB heap.
- Not changed: the light theme. The design (design.md section 5) and R10.1 describe a dark
  monster-lab theme; the app ships a light one.
## 2026-11-12 — Eight creature heads, real laughter, smooth playback

### What changed
- 3D: the single ogre bust is replaced by eight sculpted heads (ogre, demon, alien, robot, beast,
  skull, pumpkin, patchwork). `tools/blender/build_specimen.py` is now a pipeline driven by
  `tools/blender/kinds.py` (one parameter set + sculpt primitives per head) and
  `tools/blender/specimen_lib.py`. Skin detail (wrinkles, lid creases, scales, fur, panel seams,
  sutures, pumpkin ribs, stitches, pores) is displaced on a ~500k-face sculpt and baked onto a
  ~15k-triangle game mesh as a 2048² normal map and a 1024² neutral detail map that the app
  tints. UVs are charted on a smoothed proxy (Smart UV on the decimated mesh gave thousands of
  sliver islands). `node tools/build-models.mjs` builds them, two at a time.
- App: `src/three/heads.ts` picks a head per specimen (`specimen.head`, else the dominant
  strand) and lists the cosmetics and default hide per head. Every preset has a head. The DNA
  screen has a new Head panel. `SpecimenScene.setHead()` swaps models with a rise-in animation.
  The eyes blink and the pedestal ring glows with the voice.
- Removed the X-ray anatomy (airway tube, vocal folds, lungs; `src/three/xray.ts`) and the X-ray
  button: the user found it tacky.
- Voice (`crates/creature-lab/src/render.rs`): laugh and cackle are now expiratory pulses (a
  breath peak and a falling pitch on every "ha", low breath in the [h] gaps, a long closing
  "haaa"); the rack's echo/reverb/drive are capped for laughter so they do not fill the gaps.
  Growl no longer uses trills (they stalled into silence in a rough, low voice). Hiss (+13 to
  +25 dB) and groan (+5 to +9 dB) are lifted to the level of the other vocals.
- Playback: the live voice worklet sleeps after 0.4 s of silence when nothing is scheduled and
  wakes on any command that can sound. Streaming playback waits for 0.5 s of audio and a 25%
  render-speed margin before it starts. `audio.underruns` counts streaming gaps.
- GLBs load by path from `public/models` (a `?url` import shipped every model twice).
- New dev tools: `crates/creature-lab/examples/{vocals,probe}.rs` (render and analyse vocals),
  `tools/glb-stats.mjs`, `tools/contact-sheet.mjs`, `tools/heads-tour.mjs`.
- Repository initialised and pushed to github.com/fareza777/creature-monster-voice (public).

### Verified, and how
- Vocals: `cargo run -p creature-lab --release --example vocals` prints a 20 ms envelope and f0
  track per specimen. The laugh now shows a distinct pulse per "ha" with gaps 15–25 dB down;
  growl is continuous; hiss for a child body went from peak 0.02 to 0.36.
- `cargo test -p creature-lab --release`: 13 passed. `npm run typecheck`: clean.
- Model budget from the Blender logs: each head 15.5–15.8k faces, total 31–34k, GLB 2.1–2.5 MB.
- Previews: Blender renders of every head (`out/k/sheet_*.png`), then the app on the emulator
  (`emulator-5580`, `tools/heads-tour.mjs`): all eight presets tested show their own head.
- On the phone (Xiaomi 2201117TY, Snapdragon 680), before the worklet fix: the idle live
  engine reported a load of 3–5× the audio thread's budget. Offline renders run at about 3×
  real time there (2.8 s of speech in 9.2 s, 4.1 s laugh in 12.8 s). After the fix one streamed
  laugh played with 0 underruns. Not re-verified on the phone after that: the user needed it.

### Bugs and issues found
- Root cause of choppy playback: the live engine ran in silence on the audio thread and starved
  clip playback on the phone. Fixed (sleep when idle).
- Renders are slower than real time on the Snapdragon 680, so long clips wait in "Incubating"
  before playback starts. SIMD128 did not help (desktop benchmark unchanged). Open.
- Headless Blender in a background PowerShell job with `*>` redirection exited without output;
  run `tools/build-models.mjs` in the foreground.
- The heads tour needs ~9 s per preset on the emulator, or the shot catches the previous head
  mid-swap.

### Status review (later the same day, no code changes)
- Nothing new to tick in `tasks.md`: 7.2 (docs) and 7.3 (demo video) stay open.
- Not yet verified by ear: the vocal changes were checked only by envelope/level analysis.
  Roar, moan, scream, snarl, chant and speech were not changed. A listening pass on the phone
  is next.
- Open polish items: the pumpkin's eyes read as yellow balls instead of candle light, the beast's
  muzzle is short, the robot's eyes are small, the ogre's cheeks are still lumpy, and the debug
  APK is ~32 MB with eight heads.

### Afternoon: no sound on the phone, model polish
- Bug: a clip rendered but nothing played. The AudioContext was `suspended` (peak of the clip
  0.50, so the audio itself was fine). It had been started without a touch, and nothing ever
  resumed it. Fix (`src/audio/audio.ts`, `src/platform/lifecycle.ts`): resume on every touch, on
  visibility, on `statechange` while in front, and before every playback; the lifecycle pause
  sets `audio.paused` so the app does not fight the background suspend.
- Verified on the phone with real `adb input tap`s on Laugh: context `running`, 0 underruns,
  4.5 s laugh.
- Render latency on the phone is still long (25 s for the 4.5 s laugh, 37 s right after launch
  while CMUdict loads). The phone was under memory pressure (64 MB free, 2.2 GB swap) and the
  WebView GPU/raster threads used ~60% CPU at rest. Now the 3D view draws once a second while
  incubating and at 30 fps at rest (60 while it speaks). Latency not re-measured after this. Open.
- Models: ogre jaw and cheeks slimmer, beast muzzle and ears longer with a dark nose pad and a
  darker crown, bigger robot eyes, softer patchwork hollows, matte horns, stronger cavity and
  occlusion contrast in the detail maps; the app shows the normal maps 1.5x stronger with a
  harder key light and less fill. The skull and patchwork heads no longer grow the visor.
  All eight rebuilt (2.1–2.5 MB each). Checked on the phone: installs and renders (skull).

## 2026-11-11 — Specimen fillet pass shipped to the device

### What changed
- `tools/blender/build_specimen.py`: the head sculpt now runs a morphological closing (dilate by
  `FILLET` = 0.07, voxel remesh, smooth, erode, remesh, smooth) before the skin noise. The creases
  between the primitive ellipsoids fill with soft fillets, so the bust reads as one form instead of
  stacked blobs.
- `public/models/specimen.glb` regenerated from the script (it was still the 11:20 build).
- Web bundle rebuilt, synced to Android, debug APK rebuilt and installed.
- `.kiro/specs/creature-voice-studio/tasks.md`: ticked phases 1 to 6 and 7.1, which were done but
  never ticked. 7.2, 7.3 and 7.4 stay open (see below).

### Verified, and how
- Model budget, from the Blender build log: head 28,937 faces (limit 30k), about 43.6k total
  (limit 45k), GLB 3.03 MB (limit 4 MB).
- Offline preview render: `.shots/fillet.png`.
- On device (Xiaomi 2201117TY, serial `69f664ea`): `node tools/looks.mjs .shots/looks3` captured
  the robot, alien, titan, x-ray and demon looks. The skin hues, horns, antennae and the `jawOpen`
  shape key (alien at jaw 60) all render correctly.
- `cargo test -p creature-lab --release`: 13 passed. `tools/wasm-check.mjs`: 0 imports, 56
  exports. Live engine + rack: 0.878 ms per 128-sample block (33% of budget).
- `npm run typecheck`: clean. `tools/check-licenses.mjs`: 15 runtime dependencies, all allowed.
- Not re-verified this session: that `crates/chimera` and `crates/chimera-wasm` are still
  byte-identical to upstream. There is no git repo or reference hash to compare against.

### Bugs and issues found
- Cheeks and jaw are still lumpy. The `cheek*` and `jaw*` ellipsoids are too large for a 0.07
  fillet to blend. Open.
- `npm`/`npx` fail in PowerShell because script execution is disabled (`npm.ps1`). Use
  `npm.cmd`/`npx.cmd`.
- `adb exec-out screencap -p > file.png` writes a broken file in Windows PowerShell 5 (it
  re-encodes the stream as text). Use `adb shell screencap -p /sdcard/x.png` and `adb pull`, or
  `tools/device.mjs`.
- `adb install` once reported "more than one device/emulator" while only one was listed. Pass
  `-s <serial>`.
- Another app (`com.f7developer.tapeback.debug`) and the MIUI side panel were in the foreground
  during capture. The demon shot landed on the DNA screen and the alien shot is partly covered.
  Retake them while the phone is otherwise idle.

### Still open
- 7.2: `docs/PROCESS.md` and the bug log do not exist yet. README, CONTRIBUTIONS and
  THIRD_PARTY_NOTICES do.
- 7.3: `tools/demo.mjs` exists, but no demo video has been recorded.
- 7.4: the workspace is not a git repository, so nothing has been published.
