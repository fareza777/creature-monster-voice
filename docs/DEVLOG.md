# Dev log

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
