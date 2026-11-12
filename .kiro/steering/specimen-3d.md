---
inclusion: fileMatch
fileMatchPattern: ['src/three/**', 'tools/blender/**', 'public/models/**']
---

# The 3D Specimen

- The model is **generated**, never hand-edited: `tools/blender/build_specimen.py` runs headless
  in Blender 4.5 (`npm run model`) and writes `public/models/specimen.glb`. Change the script, not
  the GLB. The `rebuild-specimen-model` hook regenerates it on save.
- Node names are an API used by `src/three/specimen.ts`: `Head` (shape keys `jawOpen`,
  `mouthWide`, `mouthRound`, `snarl`, `browDown`; materials `Skin`, `MouthInside`), `Teeth`
  (`jawOpen`), `Tongue`, `EyeL`/`EyeR` (materials `Sclera`, `Iris`, `Pupil`), and the cosmetics
  `Horns`, `Tusks`, `Antennae`, `Visor`, `AnimalEars`, `Collar`. Head extras carry `pivot` and
  `jawAngle` for the jaw hinge (glTF Y-up coordinates).
- Multi-material meshes load in three.js as a Group of primitives: always go through
  `meshesOf()`; morph influences must be copied to every primitive of the head.
- Budget for a Snapdragon 680: head ≤ 30k faces, total ≤ 45k, GLB ≤ 4 MB, pixel ratio ≤ 1.75,
  no shadow maps (the contact shadow is a texture), no post-processing.
- Light theme rendering: ACES tone mapping, `RoomEnvironment` through PMREM (generated in-app,
  no HDR download), key + two rims + hemisphere fill.
- Skin colour: leading creature strand's hue nudged toward the runner-up, softened by the human
  share; `specimen.skin` (hex) overrides. Never blend all five hues linearly (it turns grey).
- Preview a change with `blender -b --factory-startup --python tools/blender/build_specimen.py --
  out.glb preview.png <jaw 0..1> "Horns,Tusks"` and look at the PNG before shipping it.
