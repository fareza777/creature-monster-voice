// Captures the specimen in several DNA looks. Usage: ADB_SERIAL=... node tools/looks.mjs [outdir]
import { adb, evaluate, screenshot, PKG } from "./device.mjs";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? ".shots/looks";
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = { monster: 0, alien: 0, robot: 0, human: 0, animal: 0, species: "none", female: 0, child: 0, pitch: 0, size: 0, rasp: 0, breath: 0, intensity: 1, reverb: -1, echo: 0, rate: 1 };
const looks = [
  ["robot", "Gamma Robot", { robot: 85, human: 15 }, false],
  ["alien", "Zeta Reticulan", { alien: 80, human: 20, pitch: 2 }, false],
  ["titan", "Tusk Titan", { monster: 40, animal: 50, human: 10, species: "elephant", size: -2 }, false],
  ["xray", "Tusk Titan", { monster: 40, animal: 50, human: 10, species: "elephant", size: -2 }, true],
  ["demon", "Demon Lord", { monster: 90, human: 10, size: -3, skin: "#b3122f" }, false],
];
// bring the app to the front without restarting it
adb(["shell", "am", "start", "-n", `${PKG}/.MainActivity`]);
await wait(2500);
await evaluate(`window.__cvs.useApp.getState().go('lab')`);
for (const [file, name, s, xray] of looks) {
  await evaluate(`(()=>{const st=window.__cvs.useApp.getState(); st.loadPreset({id:'look',name:${JSON.stringify(name)},tagline:'',emoji:'',specimen:${JSON.stringify({ ...base, ...s })}}); const b=document.querySelector('.toggle-xray'); if (b && b.classList.contains('on') !== ${xray}) b.click(); return 1})()`);
  await wait(3500);
  screenshot(`${out}/${file}.png`);
  console.log(`${out}/${file}.png`);
}
await evaluate(`(()=>{const b=document.querySelector('.toggle-xray'); if (b && b.classList.contains('on')) b.click(); return 1})()`);
