# Requirements — Creature Voice Studio: Monster Voice Laboratory

Format: EARS ("WHEN … THE SYSTEM SHALL …"). Every requirement maps to tasks in `tasks.md`.

## R1 Offline physical voice engine
- R1.1 THE SYSTEM SHALL synthesise every voice with the CHIMERA Rust/WASM airway model, with no
  network access and no audio samples bundled.
- R1.2 WHEN the app starts THE SYSTEM SHALL load the WASM module once, compile it, and share the
  compiled module with the AudioWorklet and the render worker.
- R1.3 THE SYSTEM SHALL run the AudioContext at 48 kHz with `latencyHint: "interactive"`.
- R1.4 IF the engine traps THEN THE SYSTEM SHALL show a recoverable error and rebuild the node.

## R2 Creature DNA Mixer
- R2.1 THE SYSTEM SHALL expose five DNA strands — Monster, Alien, Robot, Human, Animal — each
  0–100 %, normalised so the shares sum to 100 %.
- R2.2 WHEN DNA changes THE SYSTEM SHALL map it to (a) the voice source (pitch, pressure,
  tension, fry, roughness, breathiness, vibrato, body size) and (b) a Rust effect rack
  (formant/pitch shift, sub-octave, growl, ring modulator, bit-crusher, metallic comb, flanger,
  vocoder, animal trill, reverb, limiter) within one animation frame.
- R2.3 WHEN Animal > 0 and a species is chosen THE SYSTEM SHALL splice the species' physical
  airway (songbird, seal, alligator, elephant) into offline renders, its breath following the
  human voice's envelope.
- R2.4 THE SYSTEM SHALL provide a live "Hold to Incubate" pad that voices the current specimen
  in real time, with vowel control by dragging.
- R2.5 THE SYSTEM SHALL let the user save a specimen as a character preset.

## R3 Interactive 3D Voice Anatomy
- R3.1 THE SYSTEM SHALL render a Three.js hologram with lungs, trachea, vocal folds, pharynx and
  oral tube, nasal cavity/velum, tongue, jaw and lips.
- R3.2 WHILE audio plays (live or rendered) THE SYSTEM SHALL animate the tube radii from the area
  function, the jaw/lips/tongue/velum from articulator telemetry, the folds from glottal area and
  the lungs from lung pressure, at ≥ 30 fps on a Snapdragon 680 class device.
- R3.3 THE SYSTEM SHALL support one-finger orbit, pinch zoom and tap-to-inspect organ labels.
- R3.4 THE SYSTEM SHALL morph the head's look with the DNA (horns, fangs, antenna, visor).

## R4 Text-to-Voice
- R4.1 THE SYSTEM SHALL speak English (CMUdict + letter-to-sound), Indonesian, Spanish, raw IPA,
  and Creature Tongue (deterministic alien language from any text).
- R4.2 THE SYSTEM SHALL offer rate, pitch, intonation (statement/question/flat) and character.
- R4.3 WHEN the user taps Speak THE SYSTEM SHALL render offline in a worker, play the result with
  synced anatomy and highlight the phoneme being spoken.

## R5 Singing Studio
- R5.1 THE SYSTEM SHALL provide a step piano-roll (notes, lengths, lyric syllables), tempo,
  vibrato, demo songs, and render/playback/export through the DNA rack.

## R6 Beatbox Maker
- R6.1 THE SYSTEM SHALL provide pads for every engine beat sound with live, low-latency hits.
- R6.2 THE SYSTEM SHALL provide a 16-step × multi-sound sequencer, BPM, swing, presets, live loop
  playback and offline export of N bars.

## R7 Sound FX Generator
- R7.1 THE SYSTEM SHALL generate procedural SFX in Rust for at least 12 categories, with
  parameter sliders, Randomise and Mutate, deterministic from a seed.
- R7.2 THE SYSTEM SHALL generate creature roars/growls from the physical voice + rack.

## R8 Voice Morphing
- R8.1 THE SYSTEM SHALL morph between two characters (A↔B slider) by interpolating source,
  body, DNA and rack parameters, for rendered speech.
- R8.2 WHEN microphone permission is granted THE SYSTEM SHALL record the user's voice and process
  it through the rack (offline, exportable) and offer live monitoring with headphones.

## R9 Editor, projects and export
- R9.1 THE SYSTEM SHALL edit clips: trim, fade in/out, gain, normalise, reverse, speed, echo,
  re-apply DNA, with undo.
- R9.2 THE SYSTEM SHALL save projects (settings + clips) locally and list, rename, duplicate and
  delete them.
- R9.3 THE SYSTEM SHALL export WAV (16-bit 48 kHz) and MP3 (128 kbps) to the device's Documents
  folder and open the Android share sheet.

## R10 UX, performance, quality
- R10.1 THE SYSTEM SHALL use a futuristic monster-lab theme: holograms, particles, glow, glitch
  transitions, haptics, 44 dp touch targets, safe-area aware layout, portrait first.
- R10.2 Cold start to interactive SHALL be < 4 s on the test device; UI SHALL stay ≥ 30 fps.
- R10.3 All UI text SHALL be English.
- R10.4 THE SYSTEM SHALL show licences/attribution in an About screen.

## R11 Release and Kiroween deliverables
- R11.1 Signed release APK and AAB targeting the current Google Play API level.
- R11.2 Tested via ADB on a physical Android device; bugs found are fixed and logged.
- R11.3 A demo video under 3 minutes and its script.
- R11.4 Public repo documents original contributions, process, Kiro usage and licences.
