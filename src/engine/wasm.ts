/**
 * The Creature Voice Studio wasm module (CHIMERA engine + creature-lab) on the main thread.
 * One compiled module is shared with the render worker and the AudioWorklet, which instantiate
 * their own copies. The JSON interfaces (`chimera_call` upstream, `lab_call` ours) are
 * synchronous and only used for small, non-real-time work here.
 *
 * Loader adapted from CHIMERA (MIT) — src/wasm/chimera.ts
 */
import wasmUrl from "./creature.wasm?url";

type Fn = (...a: number[]) => number;
export type WasmExports = { memory: WebAssembly.Memory } & Record<string, Fn>;

let module: WebAssembly.Module | null = null;
let exports: WasmExports | null = null;
let loading: Promise<void> | null = null;

export function initWasm(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const res = await fetch(wasmUrl);
    if (!res.ok) throw new Error(`engine: HTTP ${res.status}`);
    const mod = await WebAssembly.compile(await res.arrayBuffer());
    if (WebAssembly.Module.imports(mod).length) throw new Error("engine: the wasm module must not have imports");
    exports = (await WebAssembly.instantiate(mod, {})).exports as unknown as WasmExports;
    module = mod;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export function wasmModule(): WebAssembly.Module {
  if (!module) throw new Error("engine not loaded");
  return module;
}

function x(): WasmExports {
  if (!exports) throw new Error("engine not loaded");
  return exports;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A JSON call through `entry` (`chimera_call` or `lab_call`) on any instance. */
export function jsonCall<T>(e: WasmExports, entry: "chimera" | "lab", fn: string, args: Record<string, unknown> = {}): T {
  const bytes = enc.encode(JSON.stringify({ fn, ...args }));
  const p = e.chimera_alloc(bytes.length);
  new Uint8Array(e.memory.buffer, p, bytes.length).set(bytes);
  const status = entry === "lab" ? e.lab_call(p, bytes.length) : e.chimera_call(p, bytes.length);
  e.chimera_free(p, bytes.length);
  const rp = entry === "lab" ? e.lab_result_ptr() : e.chimera_result_ptr();
  const rl = entry === "lab" ? e.lab_result_len() : e.chimera_result_len();
  const v = JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, rp, rl)));
  if (status !== 0) throw new Error(`${fn}: ${v.error}`);
  return v as T;
}

/** Upstream engine JSON call (catalog, planners). */
export function chimera<T>(fn: string, args: Record<string, unknown> = {}): T {
  return jsonCall<T>(x(), "chimera", fn, args);
}

/** Lab JSON call (designs, G2P previews, SFX presets). */
export function lab<T>(fn: string, args: Record<string, unknown> = {}): T {
  return jsonCall<T>(x(), "lab", fn, args);
}
