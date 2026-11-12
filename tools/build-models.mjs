// Builds the specimen heads with Blender (tools/blender/build_specimen.py), two at a time.
//   node tools/build-models.mjs [kind ...] [--preview out/k] [--fast]
// Without kinds it builds them all into public/models/<kind>.glb.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const BLENDER = process.env.BLENDER ?? "C:/Blender/blender.exe";
const ALL = ["ogre", "demon", "alien", "robot", "beast", "skull", "pumpkin", "frank"];
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const pi = args.indexOf("--preview");
const previewDir = pi >= 0 ? args[pi + 1] : null;
const kinds = args.filter((a, i) => !a.startsWith("--") && !(pi >= 0 && i === pi + 1));
const todo = kinds.length ? kinds : ALL;
const outDir = previewDir ?? "public/models";
mkdirSync(outDir, { recursive: true });

function build(kind) {
  return new Promise((resolve) => {
    const t = Date.now();
    const a = ["-b", "--factory-startup", "--python", "tools/blender/build_specimen.py", "--", `${outDir}/${kind}.glb`];
    if (previewDir) a.push(`${previewDir}/${kind}.png`, "0.0", "none");
    a.push(`kind=${kind}`);
    if (flag("--fast")) a.push("fast=1");
    const p = spawn(BLENDER, a, { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    p.on("close", (code) => {
      const lines = log.split(/\r?\n/).filter((l) => /Head:|total:|exported|Error|Traceback|line \d/.test(l));
      console.log(`[${kind}] exit ${code} in ${((Date.now() - t) / 1000).toFixed(0)} s\n  ${lines.join("\n  ")}`);
      resolve(code);
    });
  });
}

const queue = [...todo];
let failed = 0;
await Promise.all(
  [0, 1].map(async () => {
    while (queue.length) if ((await build(queue.shift())) !== 0) failed++;
  }),
);
process.exit(failed ? 1 : 0);
