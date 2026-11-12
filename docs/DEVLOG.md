# Dev log

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
