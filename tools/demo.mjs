// Kiroween demo recorder: drives the app through DevTools while scrcpy records screen + audio.
// Usage: ADB_SERIAL=emulator-5554 node tools/demo.mjs [out.mp4]
// Needs the debug APK installed (WebView debugging) and scrcpy on PATH (or SCRCPY env).
import { spawn } from "node:child_process";
import { evaluate } from "./device.mjs";

const OUT = process.argv[2] ?? "release/kiroween-demo.mkv";
const SERIAL = process.env.ADB_SERIAL ?? "emulator-5554";
const SCRCPY = process.env.SCRCPY ?? "scrcpy";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (code) => evaluate(`(async()=>{const {useApp,audio}=window.__cvs; const S=()=>useApp.getState(); ${code}})()`, 180000);

const caption = (title, sub = "") =>
  js(`let c=document.getElementById('demo-cap'); if(!c){c=document.createElement('div'); c.id='demo-cap'; c.style.cssText='position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:60;padding:12px 16px;border-radius:18px;background:rgba(23,20,42,.88);color:#fff;font:600 15px Inter,system-ui;box-shadow:0 12px 30px rgba(0,0,0,.25);transition:opacity .3s;pointer-events:none'; document.body.appendChild(c);} c.innerHTML='<div style="font:700 17px Space Grotesk,Inter">'+${JSON.stringify(title)}+'</div><div style="opacity:.8;font-weight:500;font-size:13px;margin-top:2px">'+${JSON.stringify(sub)}+'</div>'; c.style.opacity=1; return 1`);
const hideCaption = () => js(`const c=document.getElementById('demo-cap'); if(c) c.style.opacity=0; return 1`);

/** Run a render and wait until its playback ends. */
const perform = async (job, name, extra = "") => {
  await js(`await S().renderJob(${JSON.stringify(job)}, ${JSON.stringify(name)}${extra ? ", " + extra : ""}); return 1`);
  await js(`for(let i=0;i<400 && audio.playing;i++) await new Promise(r=>setTimeout(r,50)); return 1`);
};
const load = (spec, name) => js(`S().loadPreset({id:'demo',name:${JSON.stringify(name)},tagline:'',emoji:'',specimen:${JSON.stringify(spec)}}); return 1`);
const base = { monster: 0, alien: 0, robot: 0, human: 0, animal: 0, species: "none", female: 0, child: 0, pitch: 0, size: 0, rasp: 0, breath: 0, intensity: 1, reverb: -1, echo: 0, rate: 1 };

async function main() {
  await js(`S().go('lab'); document.querySelector('.content')?.scrollTo(0,0); return 1`);
  await load({ ...base, human: 100 }, "Human Control");
  await wait(1500);
  const rec = spawn(SCRCPY, ["-s", SERIAL, `--record=${OUT}`, "--no-playback", "--no-window", "--audio-source=output", "--max-size=1080", "--video-bit-rate=8M", "--time-limit=178"], { stdio: "inherit" });
  await wait(2500);
  const t0 = Date.now();

  // 1. the costume idea
  await caption("Creature Voice Studio", "A costume for your voice · Kiroween 2026 · 100% offline");
  await wait(2500);
  await perform({ kind: "speech", text: "Hello. I am an ordinary human voice.", lang: "en" }, "Human");
  // 2. DNA splice → Pumpkin King
  await caption("Creature DNA Mixer", "Monster · Alien · Robot · Human · Animal");
  await js(`S().go('dna'); return 1`);
  for (const [m, a, h] of [[10, 0, 90], [20, 5, 75], [30, 10, 60], [35, 15, 50]]) {
    await js(`S().setSpecimen({monster:${m},alien:${a},human:${h}}); return 1`);
    await wait(500);
  }
  await load({ ...base, monster: 35, human: 50, alien: 15, echo: 0.25, size: -1, skin: "#e8590c" }, "Pumpkin King");
  await wait(1200);
  await perform({ kind: "speech", text: "Happy Kiroween! Welcome to the monster laboratory.", lang: "en" }, "Pumpkin King");
  // 3. Demon Lord roar
  await caption("Physical voice, real airway", "Rust CHIMERA engine → WebAssembly, then our DNA rack");
  await load({ ...base, monster: 90, human: 10, size: -3, reverb: 0.6, skin: "#b3122f" }, "Demon Lord");
  await wait(1200);
  await perform({ kind: "vocal", vocal: "roar", seed: 7 }, "Demon Lord roar");
  // 4. Robot + alien cosmetics
  await caption("Every strand changes the body", "visor and bolts for robot · antennae for alien");
  await load({ ...base, robot: 85, human: 15 }, "Gamma Robot");
  await wait(1400);
  await perform({ kind: "speech", text: "I am Gamma Robot. Resistance is futile.", lang: "en" }, "Gamma Robot");
  await load({ ...base, alien: 80, human: 20, pitch: 2 }, "Zeta Reticulan");
  await wait(1200);
  await perform({ kind: "speech", text: "Take me to your leader", lang: "creature", dialect: "insectoid" }, "Zeta");
  // 5. animal splice + X-ray anatomy
  await caption("Animal splice + X-ray voice anatomy", "a real elephant airway breathes with the words");
  await js(`S().go('lab'); return 1`);
  await load({ ...base, monster: 40, animal: 50, human: 10, species: "elephant", size: -2 }, "Tusk Titan");
  await wait(800);
  await js(`document.querySelector('.toggle-xray')?.click(); return 1`);
  await wait(800);
  await perform({ kind: "speech", text: "I never forget a voice.", lang: "en" }, "Tusk Titan");
  await js(`document.querySelector('.toggle-xray')?.click(); return 1`);
  // 6. multilingual
  await caption("Speaks five languages", "English · Indonesian · Spanish · IPA · Creature Tongue");
  await js(`S().go('speak'); return 1`);
  await load({ ...base, monster: 60, animal: 30, human: 10, species: "alligator", size: -1, rasp: 0.3 }, "Swamp Ogre");
  await wait(800);
  await perform({ kind: "speech", text: "Selamat malam, aku monster dari laboratorium.", lang: "id" }, "Ogre (Indonesian)");
  await perform({ kind: "speech", text: "Hola, soy el monstruo de la noche.", lang: "es" }, "Ogre (Spanish)");
  // 7. sing
  await caption("Singing Studio", "an original Kiroween song, sung by a goblin");
  await js(`S().go('studio'); S().setStudioTab('sing'); return 1`);
  await load({ ...base, monster: 30, human: 55, alien: 15, child: 1, pitch: 4, rasp: 0.5 }, "Goblin");
  await wait(800);
  await perform({ kind: "song", notes: [[57, 1], [60, 1], [64, 1], [62, 1], [60, 0.5], [57, 1.5], [57, 1], [60, 0.5], [64, 0.5], [67, 1], [65, 1], [64, 2]].map(([midi, beats]) => ({ midi, beats })), lyrics: "Rise from the lab tonight, glow in the pale moon light.", lang: "en", bpm: 112, vibrato: 35 }, "Goblin sings");
  // 8. beatbox + SFX
  await caption("Beatbox Maker + Sound FX Generator", "every drum is an articulatory gesture");
  await js(`S().setStudioTab('beat'); return 1`);
  await load({ ...base, robot: 40, monster: 40, animal: 20, species: "alligator", size: -2 }, "Mecha Dragon");
  await perform({ kind: "beat", pattern: "B . t . Pf . t . B . t B Pf . t tss", bpm: 104, swing: 0, bars: 2 }, "Mecha beat");
  await js(`S().setStudioTab('sfx'); return 1`);
  await perform({ kind: "sfx", params: await js(`return window.__cvs.lab.sfxPreset('laser', 3)`), dna: false }, "Laser");
  await perform({ kind: "vocal", vocal: "laugh", seed: 11 }, "Evil laugh");
  // 9. morph
  await caption("Voice Morphing", "human → demon within one sentence (or morph your own mic)");
  await js(`S().setStudioTab('morph'); return 1`);
  await perform({ kind: "speech", text: "I was human once. Now I am something else.", lang: "en" }, "Morph", `{ specimen: ${JSON.stringify({ ...base, human: 100 })}, morph: { to: ${JSON.stringify({ ...base, monster: 90, human: 10, size: -3, reverb: 0.6 })}, amount: 1, sweep: true } }`);
  // 10. vault + export
  await caption("Save, edit, export WAV / MP3, share", "made with Kiro · specs · steering · hooks · MCP");
  await js(`await S().keepClip(); S().go('library'); return 1`);
  await wait(3500);
  await js(`S().go('lab'); return 1`);
  await load({ ...base, monster: 35, human: 50, alien: 15, echo: 0.25, size: -1, skin: "#e8590c" }, "Pumpkin King");
  await caption("Creature Voice Studio", "by F7 Developer · built with Kiro · Happy Kiroween!");
  await perform({ kind: "vocal", vocal: "cackle", seed: 2 }, "Cackle");
  await wait(1500);
  await hideCaption();
  console.log(`scripted ${(Date.now() - t0) / 1000} s`);
  await wait(1000);
  // mkv survives an abrupt stop (Windows cannot send scrcpy a gentle SIGINT)
  rec.kill();
  await new Promise((r) => rec.on("exit", r));
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
