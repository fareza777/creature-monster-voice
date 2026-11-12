// Screenshot tour: navigates the app through DevTools and captures each screen.
// Usage: ADB_SERIAL=emulator-5554 node tools/shots.mjs [outdir]
import { evaluate, screenshot } from "./device.mjs";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? ".shots/tour";
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [
  ["lab", "s.go('lab')"],
  ["dna", "s.go('dna')"],
  ["dna-scrolled", "document.querySelector('.content').scrollTop = 900"],
  ["speak", "s.go('speak')"],
  ["sing", "s.go('studio'); s.setStudioTab('sing')"],
  ["beat", "s.setStudioTab('beat')"],
  ["sfx", "s.setStudioTab('sfx')"],
  ["morph", "s.setStudioTab('morph')"],
  ["vault", "s.go('library')"],
  ["about", "s.go('about')"],
];
for (const [name, js] of steps) {
  await evaluate(`(()=>{const s=window.__cvs.useApp.getState(); ${js}; return 1})()`);
  await wait(1600);
  screenshot(`${out}/${name}.png`);
  console.log(`${out}/${name}.png`);
}
await evaluate(`window.__cvs.useApp.getState().go('lab')`);
