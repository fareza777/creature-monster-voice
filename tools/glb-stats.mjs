// Print where the bytes of a GLB go (images vs geometry per mesh): node tools/glb-stats.mjs file.glb
import { readFileSync } from "node:fs";

const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
const views = gltf.bufferViews;
const acc = gltf.accessors;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const img of gltf.images ?? []) console.log("image", img.name, img.mimeType, kb(views[img.bufferView].byteLength));
const viewBytes = (a) => (acc[a].bufferView !== undefined ? views[acc[a].bufferView].byteLength : 0) + (acc[a].sparse ? views[acc[a].sparse.indices.bufferView].byteLength + views[acc[a].sparse.values.bufferView].byteLength : 0);
for (const m of gltf.meshes) {
  let base = 0, morph = 0;
  for (const p of m.primitives) {
    for (const a of Object.values(p.attributes)) base += viewBytes(a);
    if (p.indices !== undefined) base += viewBytes(p.indices);
    for (const t of p.targets ?? []) for (const a of Object.values(t)) morph += viewBytes(a);
  }
  console.log("mesh", m.name, "geometry", kb(base), "morphs", kb(morph));
}
console.log("total", kb(buf.length));
