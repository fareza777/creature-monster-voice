#!/usr/bin/env node
/**
 * creature-adb — an MCP server for testing Creature Voice Studio on Android devices from Kiro.
 *
 * Tools: list devices, install the debug/release APK, launch, screenshot (returned as an image),
 * evaluate JavaScript inside the app's WebView (Chrome DevTools Protocol over ADB), collect
 * console logs and exceptions, navigate screens, run a timed render benchmark, and read
 * memory/CPU/frame stats. Every tool takes an optional `serial` (default: ADB_SERIAL, else the
 * first physical device).
 *
 * Run: node tools/mcp/adb-mcp.mjs   (configured in .kiro/settings/mcp.json)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url);
const pick = (serial) => {
  if (serial) process.env.ADB_SERIAL = serial;
};
// device.mjs reads ADB_SERIAL on every call
const dev = await import(new URL("tools/device.mjs", ROOT).href);

const text = (t) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 2) }] });
const serial = z.string().optional().describe("adb serial (default: ADB_SERIAL or the first physical device)");

const server = new McpServer({ name: "creature-adb", version: "1.0.0" });

server.registerTool("devices", { description: "List connected Android devices and emulators", inputSchema: {} }, async () =>
  text(execFileSync("adb", ["devices", "-l"], { encoding: "utf8" })),
);

server.registerTool(
  "install_app",
  { description: "Install (-r) an APK and launch Creature Voice Studio", inputSchema: { serial, apk: z.string().optional().describe("path; default the debug APK") } },
  async ({ serial: s, apk }) => {
    pick(s);
    const path = apk ?? new URL("android/app/build/outputs/apk/debug/app-debug.apk", ROOT).pathname.replace(/^\/(\w:)/, "$1");
    const out = dev.adb(["install", "-r", path]);
    dev.launch();
    return text(out.trim());
  },
);

server.registerTool("launch_app", { description: "Force-stop and relaunch the app", inputSchema: { serial } }, async ({ serial: s }) => {
  pick(s);
  dev.launch();
  return text("launched");
});

server.registerTool("screenshot", { description: "Capture the device screen as a PNG image", inputSchema: { serial } }, async ({ serial: s }) => {
  pick(s);
  const file = join(mkdtempSync(join(tmpdir(), "cvs-")), "shot.png");
  dev.screenshot(file);
  return { content: [{ type: "image", data: readFileSync(file).toString("base64"), mimeType: "image/png" }] };
});

server.registerTool(
  "eval_js",
  { description: "Evaluate JavaScript in the app WebView (promises are awaited). window.__cvs exposes { useApp, audio, renderer }.", inputSchema: { serial, expression: z.string() } },
  async ({ serial: s, expression }) => {
    pick(s);
    return text(await dev.evaluate(expression));
  },
);

server.registerTool(
  "console_logs",
  { description: "Collect console messages and uncaught exceptions from the WebView for N seconds", inputSchema: { serial, seconds: z.number().min(1).max(60).default(8) } },
  async ({ serial: s, seconds }) => {
    pick(s);
    return text((await dev.logs(seconds)).join("\n") || "(no messages)");
  },
);

server.registerTool(
  "go_screen",
  { description: "Navigate the app: lab | dna | speak | studio | library | about (studio tabs: sing | beat | sfx | morph)", inputSchema: { serial, screen: z.enum(["lab", "dna", "speak", "studio", "library", "about"]), tab: z.enum(["sing", "beat", "sfx", "morph"]).optional() } },
  async ({ serial: s, screen, tab }) => {
    pick(s);
    await dev.evaluate(`(()=>{const a=window.__cvs.useApp.getState(); a.go(${JSON.stringify(screen)}); ${tab ? `a.setStudioTab(${JSON.stringify(tab)});` : ""} return 1})()`);
    return text(`now on ${screen}${tab ? `/${tab}` : ""}`);
  },
);

server.registerTool(
  "render_benchmark",
  { description: "Render a line of speech in the app and report time-to-first-sound, total render time and audio length", inputSchema: { serial, text: z.string().default("Welcome to the monster laboratory."), lang: z.enum(["en", "id", "es", "ipa", "creature"]).default("en") } },
  async ({ serial: s, text: t, lang }) => {
    pick(s);
    const js = `(async()=>{const {useApp,audio}=window.__cvs; const t=performance.now(); let first=null; const iv=setInterval(()=>{ if(first===null && audio.playing) first=performance.now()-t; },20); const c=await useApp.getState().renderJob({kind:'speech',text:${JSON.stringify(t)},lang:${JSON.stringify(lang)}},'benchmark'); clearInterval(iv); return {firstSoundMs:Math.round(first ?? -1), renderMs:Math.round(performance.now()-t), audioSecs:+(c.meta.samples/48000).toFixed(2), realTimeRatio:+((performance.now()-t)/1000/(c.meta.samples/48000)).toFixed(2), transcription:c.meta.transcription}})()`;
    return text(await dev.evaluate(js, 180000));
  },
);

server.registerTool("perf_stats", { description: "Memory (dumpsys meminfo), CPU (top) and frame stats (gfxinfo) for the app", inputSchema: { serial } }, async ({ serial: s }) => {
  pick(s);
  return text(dev.perf());
});

server.registerTool(
  "tap",
  { description: "Tap the screen at device pixel coordinates", inputSchema: { serial, x: z.number(), y: z.number() } },
  async ({ serial: s, x, y }) => {
    pick(s);
    dev.adb(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
    return text(`tapped ${x},${y}`);
  },
);

await server.connect(new StdioServerTransport());
