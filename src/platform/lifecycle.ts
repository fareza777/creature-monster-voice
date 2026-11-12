/** Android lifecycle: hardware back button, pausing audio in the background, status bar. */
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNative } from "./native.ts";
import { audio } from "../audio/audio.ts";

/** Handle back: return true if consumed; otherwise the app exits. */
export function onBackButton(handler: () => boolean): () => void {
  if (!isNative) return () => undefined;
  const p = CapApp.addListener("backButton", () => {
    if (!handler()) CapApp.exitApp();
  });
  return () => {
    p.then((h) => h.remove());
  };
}

export async function initNative(): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#f6f4ef" });
  } catch {
    /* not available on every device */
  }
  CapApp.addListener("pause", () => {
    audio.paused = true;
    audio.stop(false);
    audio.ctx?.suspend().catch(() => undefined);
  });
  CapApp.addListener("resume", () => {
    audio.paused = false;
    audio.ctx?.resume().catch(() => undefined);
  });
  SplashScreen.hide().catch(() => undefined);
}
