# Process and bug log

## Process

1. **Spec first.** Requirements (EARS), design and a phased task list were written in
   `.kiro/specs/creature-voice-studio/` before code. Kiro implemented the tasks phase by phase.
2. **Steering** kept the product, the tech rules, the DSP rules, the 3D pipeline and licensing
   in front of the agent (see [KIRO.md](KIRO.md)).
3. **Hooks** ran the Rust tests, the typecheck, the licence gate and the Blender model build on
   save, blocked signing secrets from git, and asked for a devlog entry at the end of every turn.
4. **Real-device loop.** The original `creature-adb` MCP server let Kiro install the app on a
   Redmi Note 11 (Snapdragon 680), tap, take screenshots, run JavaScript in the WebView and read
   performance stats. Fixes were verified on the phone where possible.
5. **Devlog.** Every session is logged in [DEVLOG.md](DEVLOG.md): what changed, what was
   verified and how, and the bugs found.

## Bug log

| Bug | Cause | Fix | Status |
|---|---|---|---|
| Choppy clip playback on the phone | The live engine kept running in silence on the audio thread (3-5x the block budget on the Snapdragon 680) | Worklet sleeps after 0.4 s of silence when nothing is scheduled | Fixed (0 underruns on one streamed laugh) |
| A clip rendered but nothing played | The AudioContext started without a touch and stayed `suspended` | Resume on every touch, on visibility, on `statechange` and before playback | Fixed, verified with `adb input tap` |
| Laugh and cackle sounded smeared | Effects filled the gaps between "ha" pulses | Expiratory pulses per "ha"; echo/reverb/drive capped for laughter | Fixed (checked by envelope analysis) |
| Growl stalled into silence | Trills in a rough, low voice | Growl no longer uses trills | Fixed |
| Hiss and groan too quiet | Level | +13 to +25 dB (hiss), +5 to +9 dB (groan) | Fixed |
| Every 3D model shipped twice | `?url` import of the GLBs | Load GLBs by path from `public/models` | Fixed |
| Thousands of UV sliver islands | Smart UV on the decimated mesh | Chart UVs on a smoothed proxy | Fixed |
| Lumpy cheeks/jaw on the heads | Primitive ellipsoids too large to blend | Fillet pass, slimmer jaw and cheeks | Improved |
| Long wait before playback on the phone | Renders run at ~3x real time on the Snapdragon 680; memory pressure | 3D view drops to 1 fps while incubating | Open |
| `npm` fails in PowerShell | Script execution disabled (`npm.ps1`) | Use `npm.cmd` / `npx.cmd` | Workaround |
| Broken PNG from `adb exec-out screencap > file` | PowerShell 5 re-encodes the stream | `screencap` to the phone, then `adb pull` | Workaround |
