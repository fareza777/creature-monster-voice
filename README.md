# Creature Voice Studio — Monster Voice Laboratory

**An offline monster-voice lab for Android by F7 Developer, built with Kiro for Kiroween 2026
(Costume Contest).** Your voice puts on a costume: splice Monster, Alien, Robot, Human and Animal
DNA into a *physically simulated* voice, then watch a rendered 3D specimen speak, sing and roar it
in real time.

- 🧬 **Creature DNA Mixer**: five strands blend into one specimen. The DNA drives the vocal folds
  and lungs of a physical voice model, a Rust effect rack, and splices in a real *animal airway*
  (songbird, seal, alligator, elephant) that breathes with your specimen's words.
- 👹 **3D Specimens**: eight sculpted heads (ogre, demon, alien, robot, beast, skull, pumpkin,
  patchwork), procedurally modelled in Blender with baked normal and detail maps and rendered
  with PBR materials in a dark "Night Lab" studio. Their jaw, lips and tongue follow the engine's
  articulators; the hide and the horns, antennae, visor or collar follow the DNA. Each preset
  wears its own head, or the head follows the dominant strand.
- 🗣️ **Text-to-Voice** in English, Indonesian, Spanish, raw IPA, and **Creature Tongue** (a
  deterministic alien language with three dialects).
- 🎤 **Singing Studio**, 🥁 **Beatbox Maker** (live pads + 16-step sequencer), ⚗️ **Sound FX
  Generator** (18 synth categories, 10 physical creature vocals, animal calls).
- 🎙️ **Voice Morphing**: transform between two characters mid-sentence, or morph your own
  microphone recording.
- ✂️ Clip editor, 🫙 project vault, WAV/MP3 export to Documents and the share sheet.
- 100% offline: no INTERNET permission, no accounts, no ads, no paid APIs, no samples.

## Try it

- **Android 7.0+** (minSdk 24, targetSdk 36). Download the signed APK from
  [Releases](https://github.com/fareza777/creature-monster-voice/releases), allow installing
  from your browser or file manager, and open **Creature Voice Studio**.
- No account, no network: the app has no INTERNET permission. The microphone is used only to
  record your own voice for Voice Morphing.
- Quick tour: **Lab** → tap *Roar*, *Laugh*, *Moan* or *Scream*. **DNA** → pick a specimen or
  drag the five strands, then *Splice*. **Speak** → type a line and choose English, Indonesian,
  Spanish, IPA or Creature Tongue. **Studio** → Sing, Beatbox, SFX, Morph. **Vault** → your clips
  and projects, export WAV/MP3 or share.

## The costume (Kiroween 2026: Costume Contest)

The costume is for your voice, and the interface is the dressing room:

- **The specimen is the readout.** The head on the pedestal speaks with the engine: its jaw,
  lips and tongue move from the articulator telemetry of the voice you hear, its eyes blink and
  follow your finger, and the pedestal ring glows with the level. The Lab shows the live pitch,
  jaw opening and whether the nasal port is open or sealed.
- **Splicing changes the creature you see.** The DNA strands grow horns, antennae, a visor or a
  collar and recolour the hide as you drag them; each preset (Swamp Ogre, Demon Lord, Zeta Reticulan,
  Gamma Robot, Werebeast, Pumpkin King, Cyber Lich, ...) wears its own sculpted head.
- **A Night Lab interface.** Near-black glass lit by ultraviolet and toxic green, and the colours
  mean something: toxic green is what is live (readouts, active tabs, *Splice*, playback
  progress, the incubator while a voice renders), ultraviolet is what you chose. DNA sliders glow
  in their strand's colour, and the plinth's ring and floor glow pulse with the voice.
- **Lab language instead of settings.** *Splice*, *Incubate*, *Specimen*, *Vault*: the mad-lab
  vocabulary is the navigation.

## How it works

```
React UI ── JSON ──▶ creature.wasm (UI instance)       planning, G2P previews, designs
   │
   ├── Render worker ─▶ creature.wasm                 offline renders: CHIMERA engine + DNA rack
   │                     streams PCM + 60 fps telemetry  + animal splice → WAV / MP3
   │
   └── AudioWorklet ──▶ creature.wasm                 live voice (Incubate pad, beatbox) +
                                                         mic morph monitor, 48 kHz
3D Specimen (three.js) ◀── telemetry frames (jaw, lips, tongue, level)
```

One wasm module (Rust, no imports) is compiled once and instantiated on all three threads. Long
renders stream to the speaker as soon as the rest is sure to arrive in time, so playback starts
before rendering ends. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Build

Requirements: Rust (`wasm32-unknown-unknown`), Node 22+, JDK 21, Android SDK 36, optionally
Blender 4.5 (only to regenerate the 3D model).

```sh
npm install
npm run wasm          # Rust → src/engine/creature.wasm
npm test              # creature-lab tests + wasm export/benchmark check
npm run build         # typecheck + Vite build
npx cap sync android
cd android && ./gradlew assembleDebug                 # debug APK
cd android && ./gradlew bundleRelease assembleRelease # signed release (needs android/keystore.properties)
npm run model         # regenerate public/models/<kind>.glb with Blender (headless)
```

Release signing reads `android/keystore.properties` (gitignored):
`storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

## Kiro

This project was specified, built and tested with Kiro: a spec (requirements → design → tasks),
steering for product/tech/structure/DSP/3D/licensing, hooks (tests, typecheck, licence gate,
model rebuild, secret guard, spec reminder) and an original MCP server that drives Android
devices over ADB + DevTools. See [docs/KIRO.md](docs/KIRO.md) and [`.kiro/`](.kiro/).

## Credits and licences

Creature Voice Studio is MIT (© 2026 F7 Developer). It builds on the **CHIMERA** physical voice
engine by Jameson Hodge (MIT, github.com/jamesondh/chimera-vocal-synth), vendored unchanged in
`crates/chimera` and `crates/chimera-wasm`. What is original here versus inherited is listed in
[CONTRIBUTIONS.md](CONTRIBUTIONS.md); all third-party licences are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
