/**
 * Native bridges (Capacitor): haptics, saving exports to Documents and the share sheet, status
 * bar and back button. Every call degrades gracefully on the web build.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const isNative = Capacitor.isNativePlatform();

let hapticsOn = true;
export function setHaptics(on: boolean): void {
  hapticsOn = on;
}

export function haptic(kind: "light" | "medium" | "heavy" | "success" | "warning" = "light"): void {
  if (!hapticsOn) return;
  if (!isNative) {
    navigator.vibrate?.(kind === "heavy" ? 30 : kind === "medium" ? 18 : 8);
    return;
  }
  if (kind === "success" || kind === "warning") Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning }).catch(() => undefined);
  else Haptics.impact({ style: kind === "heavy" ? ImpactStyle.Heavy : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => undefined);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

export function safeName(name: string): string {
  return (name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "specimen").slice(0, 60);
}

/** Save an export to Documents/CreatureVoiceStudio and offer the share sheet. Returns where it went. */
export async function saveExport(bytes: Uint8Array, filename: string, mime: string, share = true): Promise<string> {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return `Downloads/${filename}`;
  }
  const path = `CreatureVoiceStudio/${filename}`;
  const data = toBase64(bytes);
  let uri: string;
  try {
    const r = await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
    uri = r.uri;
  } catch {
    // scoped storage refused Documents: keep a copy in the app's cache, still shareable
    const r = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    uri = r.uri;
  }
  if (share) {
    try {
      await Share.share({ title: filename, text: "Made with Creature Voice Studio", files: [uri], dialogTitle: "Share your specimen" });
    } catch {
      /* the user closed the sheet */
    }
  }
  return `Documents/${path}`;
}
