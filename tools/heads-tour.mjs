// Loads presets one by one in the app and screenshots the Lab: node tools/heads-tour.mjs [outdir]
// (ADB_SERIAL picks the device.)
import { evaluate, screenshot } from "./device.mjs";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? ".shots/heads";
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = process.argv.length > 3 ? process.argv.slice(3) : ["swamp-ogre", "demon-lord", "zeta", "gamma-robot", "werebeast", "cyber-lich", "pumpkin-king", "human"];
await evaluate(`(()=>{window.__cvs.useApp.getState().go('lab'); return 1})()`);
for (const id of ids) {
  await evaluate(`(()=>{const s=window.__cvs.useApp.getState(); const p=window.__cvs.presets.find(x=>x.id==='${id}'); if(p) s.loadPreset(p); return !!p})()`);
  await wait(Number(process.env.TOUR_WAIT ?? 3500));
  screenshot(`${out}/${id}.png`);
  console.log(`${out}/${id}.png`);
}
