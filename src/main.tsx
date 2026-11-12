/**
 * Boot: load the wasm engine first (the catalogs are read from it when UI modules load), then the
 * render worker, then the UI.
 */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./ui/styles.css";
import { initWasm } from "./engine/wasm.ts";

const boot = document.getElementById("boot")!;
const sub = boot.querySelector(".boot-sub")!;

async function main() {
  try {
    sub.textContent = "Compiling the vocal airway…";
    await initWasm();
    const [{ startRenderer }, { createRoot }, { App }, { initNative }] = await Promise.all([
      import("./engine/renderer.ts"),
      import("react-dom/client"),
      import("./ui/App.tsx"),
      import("./platform/lifecycle.ts"),
    ]);
    sub.textContent = "Waking the specimens…";
    startRenderer().catch((e) => console.error("renderer:", e));
    createRoot(document.getElementById("root")!).render(<App />);
    // automation hook for the ADB/DevTools test harness (tools/device.mjs, tools/mcp)
    const [{ useApp }, { audio }, renderer, lab, { PRESETS: presets }] = await Promise.all([import("./store/app.ts"), import("./audio/audio.ts"), import("./engine/renderer.ts"), import("./engine/lab.ts"), import("./store/presets.ts")]);
    (window as unknown as Record<string, unknown>).__cvs = { useApp, audio, renderer, lab, presets };
    await initNative();
    boot.classList.add("gone");
    setTimeout(() => boot.remove(), 600);
  } catch (e) {
    console.error(e);
    sub.textContent = `The lab failed to start: ${e instanceof Error ? e.message : e}`;
  }
}

main();
