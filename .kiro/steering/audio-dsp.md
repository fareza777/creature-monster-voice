---
inclusion: fileMatch
fileMatchPattern: ['crates/creature-lab/**', 'src/worklet/**', 'src/audio/**', 'src/workers/**']
---

# Audio and DSP rules

- Real-time paths (`Rack::process`, worklet `process()`) never allocate, lock, or log.
- Every effect is stable for any sample rate 16–96 kHz; delay lines are sized from the max
  sample rate at construction.
- The output stage is always: DC blocker → soft clipper → look-ahead-free peak limiter at -1 dBFS.
- Parameters are smoothed (one-pole, ~20 ms) to avoid zipper noise.
- DNA weights are normalised (sum = 1). Human weight = dry signal share.
- Offline renders record telemetry at 60 frames/s so playback can animate the 3D anatomy in sync.
- Exports: WAV 16-bit PCM mono 48 kHz; MP3 128 kbps mono via lamejs in the render worker.
- Test every new effect in `crates/creature-lab/tests/` for finiteness (no NaN/Inf) and level
  (peak ≤ 1.0) on a 2 s render.
