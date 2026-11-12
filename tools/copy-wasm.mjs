// Copies the release wasm build into src/engine (a gitignored build product).
import { copyFileSync, statSync } from "node:fs";
const from = "target/wasm32-unknown-unknown/release/creature_wasm.wasm";
const to = "src/engine/creature.wasm";
copyFileSync(from, to);
console.log(`copied ${from} -> ${to} (${(statSync(to).size / 1024).toFixed(0)} KiB)`);
