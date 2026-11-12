/** IndexedDB storage for clips (PCM + anatomy track) and projects. Offline, on-device only. */
import type { Clip, RenderMeta } from "../engine/renderer.ts";
import type { Specimen } from "../engine/lab.ts";

const DB = "creature-voice-studio";
const VERSION = 1;

export interface ClipRecord {
  id: string;
  name: string;
  createdAt: number;
  meta: RenderMeta;
  pcm: ArrayBuffer;
  frames: ArrayBuffer;
  projectId?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  specimen: Specimen;
  /** per-studio settings (speak text, song notes, beat pattern, sfx params…) */
  studio: Record<string, unknown>;
  clipIds: string[];
}

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("clips")) db.createObjectStore("clips", { keyPath: "id" });
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveClip(c: Clip, projectId?: string): Promise<void> {
  const rec: ClipRecord = { id: c.id, name: c.name, createdAt: c.createdAt, meta: c.meta, pcm: c.pcm.slice().buffer, frames: c.frames.slice().buffer, projectId };
  await tx("clips", "readwrite", (s) => s.put(rec));
}

export function toClip(r: ClipRecord): Clip {
  return { id: r.id, name: r.name, createdAt: r.createdAt, meta: r.meta, pcm: new Float32Array(r.pcm), frames: new Float32Array(r.frames) };
}

export async function listClips(): Promise<ClipRecord[]> {
  const all = await tx<ClipRecord[]>("clips", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClip(id: string): Promise<Clip | null> {
  const r = await tx<ClipRecord | undefined>("clips", "readonly", (s) => s.get(id));
  return r ? toClip(r) : null;
}

export async function deleteClip(id: string): Promise<void> {
  await tx("clips", "readwrite", (s) => s.delete(id));
}

export async function renameClip(id: string, name: string): Promise<void> {
  const r = await tx<ClipRecord | undefined>("clips", "readonly", (s) => s.get(id));
  if (r) await tx("clips", "readwrite", (s) => s.put({ ...r, name }));
}

export async function saveProject(p: Project): Promise<void> {
  await tx("projects", "readwrite", (s) => s.put({ ...p, updatedAt: Date.now() }));
}

export async function listProjects(): Promise<Project[]> {
  const all = await tx<Project[]>("projects", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await tx("projects", "readwrite", (s) => s.delete(id));
}

/** Rough storage use, for the library header. */
export async function usage(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage ?? 0, quota: e.quota ?? 0 };
}
