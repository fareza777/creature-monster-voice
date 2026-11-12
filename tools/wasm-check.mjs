// Checks the built wasm: no imports, upstream + lab exports present, and times an offline render.
// Usage: node tools/wasm-check.mjs [path-to-wasm]
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "src/engine/creature.wasm";
const mod = await WebAssembly.compile(readFileSync(path));
const imports = WebAssembly.Module.imports(mod);
const exports = WebAssembly.Module.exports(mod).map((e) => e.name);
const need = ["engine_new", "engine_render", "engine_schedule", "engine_set_creature", "chimera_call", "chimera_alloc", "lab_call", "lab_rack_new", "lab_rack_process", "lab_input_f32", "lab_out_f32_ptr"];
const missing = need.filter((n) => !exports.includes(n));
console.log(`imports: ${imports.length}, exports: ${exports.length}, missing: ${missing.join(", ") || "none"}`);
if (imports.length || missing.length) process.exit(1);

const x = (await WebAssembly.instantiate(mod, {})).exports;
const enc = new TextEncoder(), dec = new TextDecoder();
function lab(fn, args = {}) {
  const b = enc.encode(JSON.stringify({ fn, ...args }));
  const p = x.chimera_alloc(b.length);
  new Uint8Array(x.memory.buffer, p, b.length).set(b);
  const st = x.lab_call(p, b.length);
  x.chimera_free(p, b.length);
  const v = JSON.parse(dec.decode(new Uint8Array(x.memory.buffer, x.lab_result_ptr(), x.lab_result_len())));
  if (st) throw new Error(`${fn}: ${v.error}`);
  return v;
}
const specimen = { monster: 0.6, human: 0.4, animal: 0 };
for (const [label, job, sp] of [
  ["speech en", { kind: "speech", text: "Welcome to the monster laboratory.", lang: "en" }, specimen],
  ["speech id + seal splice", { kind: "speech", text: "Selamat malam semua", lang: "id" }, { human: 0.5, animal: 0.5, species: "seal" }],
  ["vocal roar", { kind: "vocal", vocal: "roar", seed: 1 }, specimen],
]) {
  const t = performance.now();
  lab("renderStart", { request: { job, specimen: sp } });
  let r;
  do r = lab("renderStep", { samples: 24000 }); while (!r.done);
  const meta = lab("renderFinish");
  const ms = performance.now() - t;
  const secs = meta.samples / meta.sampleRate;
  console.log(`${label}: ${secs.toFixed(2)} s audio in ${ms.toFixed(0)} ms (${((ms / 1000 / secs) * 100).toFixed(0)}% of real time), ${meta.frames} frames — ${meta.transcription}`);
}
// live rack + engine cost per 128-sample block
const h = x.engine_new(48000);
const rack = x.lab_rack_new(48000);
const prm = new Float32Array(x.memory.buffer, x.lab_rack_params(rack), x.lab_rack_n_params());
const design = lab("design", { specimen });
const keys = lab("catalog").rackKeys;
keys.forEach((k, i) => (prm[i] = design.rack[k]));
x.lab_rack_commit(rack);
x.engine_set_gate(h, 1);
const N = 1500;
const t = performance.now();
for (let i = 0; i < N; i++) {
  const p = x.engine_render(h, 128);
  x.lab_rack_process(rack, p, 128);
}
const per = (performance.now() - t) / N;
console.log(`live engine+rack: ${per.toFixed(3)} ms per 128-sample block (${((per / (128 / 48)) * 100).toFixed(0)}% of budget)`);
