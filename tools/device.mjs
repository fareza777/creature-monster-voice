// Device test helper (ADB + Chrome DevTools Protocol into the app's WebView).
//
//   node tools/device.mjs install [apk]      install (-r) and launch
//   node tools/device.mjs launch             (re)start the app
//   node tools/device.mjs eval "<js>"        evaluate JS in the WebView (awaits promises), print JSON
//   node tools/device.mjs shot out.png       screenshot
//   node tools/device.mjs tap x y            tap at device pixels
//   node tools/device.mjs logs [seconds]     console messages + exceptions for N seconds
//   node tools/device.mjs perf               memory, CPU and frame stats for the app
//
// Env: ADB_SERIAL selects the device (default: first physical device).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export const PKG = "com.f7developer.creaturevoicestudio";

function serial() {
  if (process.env.ADB_SERIAL) return process.env.ADB_SERIAL;
  const out = execFileSync("adb", ["devices"], { encoding: "utf8" });
  const devs = out.split("\n").slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p[1] === "device").map((p) => p[0]);
  return devs.find((d) => !d.startsWith("emulator")) ?? devs[0];
}

export function adb(args, opts = {}) {
  return execFileSync("adb", ["-s", serial(), ...args], { encoding: opts.binary ? undefined : "utf8", maxBuffer: 64 << 20, ...opts });
}

export function launch() {
  adb(["shell", "am", "force-stop", PKG]);
  adb(["shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`]);
}

async function devtoolsTarget() {
  const pid = adb(["shell", "pidof", PKG]).trim();
  if (!pid) throw new Error("app not running");
  const unix = adb(["shell", "cat", "/proc/net/unix"]);
  const sock = unix.split("\n").map((l) => l.trim().split(/\s+/).pop()).find((s) => s && s.includes(`webview_devtools_remote_${pid}`));
  if (!sock) throw new Error("no WebView devtools socket (debug build?)");
  adb(["forward", "tcp:9333", `localabstract:${sock.replace(/^@/, "")}`]);
  const list = await (await fetch("http://127.0.0.1:9333/json")).json();
  const page = list.find((t) => t.type === "page") ?? list[0];
  return page.webSocketDebuggerUrl;
}

export async function cdp(method, params = {}, { listen } = {}) {
  const url = await devtoolsTarget();
  const ws = new WebSocket(url);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method && listen) listen(m);
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const res = await send(method, params);
  return { res, send, close: () => ws.close() };
}

export async function evaluate(expression, timeoutMs = 120000) {
  const { res, close } = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
  close();
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text);
  return res.result?.result?.value;
}

export function screenshot(file) {
  const png = adb(["exec-out", "screencap", "-p"], { binary: true });
  writeFileSync(file, png);
  return file;
}

export async function logs(seconds = 10) {
  const lines = [];
  const { send, close } = await cdp("Runtime.enable", {}, {
    listen: (m) => {
      if (m.method === "Runtime.consoleAPICalled") lines.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
      if (m.method === "Runtime.exceptionThrown") lines.push(`[exception] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    },
  });
  await send("Log.enable");
  await new Promise((r) => setTimeout(r, seconds * 1000));
  close();
  return lines;
}

export function perf() {
  const mem = adb(["shell", "dumpsys", "meminfo", PKG]).split("\n").filter((l) => /TOTAL|Native Heap|Graphics/.test(l)).join("\n");
  const pid = adb(["shell", "pidof", PKG]).trim();
  const top = adb(["shell", "top", "-b", "-n", "1", "-p", pid]).split("\n").slice(-2).join("\n");
  const gfx = adb(["shell", "dumpsys", "gfxinfo", PKG]).split("\n").filter((l) => /Total frames|Janky|percentile/.test(l)).join("\n");
  return `${mem}\n${top}\n${gfx}`;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const [cmd, ...a] = process.argv.slice(2);
  try {
    if (cmd === "install") {
      console.log(adb(["install", "-r", a[0] ?? "android/app/build/outputs/apk/debug/app-debug.apk"]).trim());
      launch();
    } else if (cmd === "launch") launch();
    else if (cmd === "eval") console.log(JSON.stringify(await evaluate(a.join(" ")), null, 1));
    else if (cmd === "shot") console.log(screenshot(a[0] ?? "shot.png"));
    else if (cmd === "tap") adb(["shell", "input", "tap", a[0], a[1]]);
    else if (cmd === "logs") console.log((await logs(+(a[0] ?? 10))).join("\n"));
    else if (cmd === "perf") console.log(perf());
    else console.log("commands: install launch eval shot tap logs perf");
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
