---
inclusion: fileMatch
fileMatchPattern: ['src/three/**', 'tools/blender/**', 'public/models/**']
---

# The 3D Specimen

- The heads are **generated**, never hand-edited: `tools/blender/build_specimen.py` (pipeline),
  `tools/blender/kinds.py` (one parameter set + sculpt primitives per head: ogre, demon, alien,
  robot, beast, skull, pumpkin, frank) and `tools/blender/specimen_lib.py` (noise, primitives) run
  headless in Blender 4.5. `npm run model` (`node tools/build-models.mjs [kind ...]`) writes
  `public/models/<kind>.glb`. Change the scripts, not the GLBs. The `rebuild-specimen-model` hook
  regenerates them on save.
- Skin detail is displaced on a ~500k-face sculpt and baked onto a ~15k-triangle game mesh: a
  tangent-space normal map (2048²) and a neutral detail map (1024²) that the app tints with the
  DNA colour. UVs are charted on a smoothed proxy so the bake has a few large islands.
- Node names are an API used by `src/three/specimen.ts`: `Head` (shape keys `jawOpen`,
  `mouthWide`, `mouthRound`, `snarl`, `browDown`; materials `Skin`, `MouthInside`), `Teeth`
  (`jawOpen`, optional), `Tongue` (optional), `EyeL`/`EyeR` (materials `Sclera`, `Iris`,
  `Pupil`), optional static `Extras`, and the cosmetics `Horns`, `Tusks`, `Antennae`, `Visor`,
  `AnimalEars`, `Collar`. Head extras carry `pivot`, `jawAngle` and `kind`.
- A specimen wears `specimen.head` (DNA screen → Head), else the head of its dominant strand
  (`headFor()` in `src/three/heads.ts`). `HEADS` lists which cosmetics each head may grow and its
  default hide.
- Multi-material meshes load in three.js as a Group of primitives: always go through
  `meshesOf()`; morph influences must be copied to every primitive of the head.
- Budget for a Snapdragon 680: head ≤ 20k triangles, total ≤ 40k, each GLB ≤ 3 MB, pixel ratio
  ≤ 1.75, no shadow maps (the contact shadow is a texture), no post-processing.
- No anatomy diagrams (airway tube, vocal folds, lungs) on the stage: the specimen is the show.
- Night Lab rendering: ACES tone mapping, a dim `RoomEnvironment` through PMREM (generated
  in-app, no HDR download), a cool key light, an ultraviolet rim and a toxic-green rim, a low
  hemisphere fill. Obsidian plinth with brass trims; the voice-reactive ring and an additive glow
  pool on the floor take the iris colour. The canvas stays transparent: the CSS background is
  the night.
- Skin colour: `specimen.skin` (hex), else the head's own hide (skull, pumpkin, frank), else the
  leading creature strand's hue nudged toward the runner-up, softened by the human share. Never
  blend all five hues linearly (it turns grey).
- Preview a change with `node tools/build-models.mjs <kind> --preview out/k --fast` and look at
  `out/k/<kind>.png` and `<kind>_front.png` (`node tools/contact-sheet.mjs` tiles them).
