/**
 * The projects kept in this browser: one zip (the same bytes as a downloaded project file) per
 * project, in IndexedDB. A backend interface keeps this testable and lets private windows
 * without IndexedDB fall back to memory (projects then live until the tab closes).
 */
import type { ProjectIcon } from './projectIcon';

export interface ProjectMeta {
  id: string;
  name: string;
  /** ms since epoch of the last save */
  updatedAt: number;
  /** bytes of the zip */
  size: number;
  /** small silhouette of the model */
  icon?: ProjectIcon;
}

export interface ProjectBackend {
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<Uint8Array | null>;
  put(meta: ProjectMeta, bytes: Uint8Array): Promise<void>;
  remove(id: string): Promise<void>;
}

export function memoryBackend(): ProjectBackend {
  const items = new Map<string, { meta: ProjectMeta; bytes: Uint8Array }>();
  return {
    list: async () => [...items.values()].map((i) => i.meta),
    get: async (id) => items.get(id)?.bytes ?? null,
    put: async (meta, bytes) => void items.set(meta.id, { meta, bytes }),
    remove: async (id) => void items.delete(id),
  };
}

const DB = 'clay-slicer-projects';
const STORE = 'projects';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB error'));
  });
}

export function indexedDbBackend(): ProjectBackend | null {
  if (typeof indexedDB === 'undefined') return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('IndexedDB is not available'));
    }));
  const store = async (mode: IDBTransactionMode) =>
    (await db()).transaction(STORE, mode).objectStore(STORE);
  type Row = ProjectMeta & { bytes: Uint8Array };
  return {
    async list() {
      const rows = (await request((await store('readonly')).getAll())) as Row[];
      return rows.map(({ id, name, updatedAt, size, icon }) => ({
        id,
        name,
        updatedAt,
        size,
        icon,
      }));
    },
    async get(id) {
      const row = (await request((await store('readonly')).get(id))) as Row | undefined;
      return row ? row.bytes : null;
    },
    async put(meta, bytes) {
      await request((await store('readwrite')).put({ ...meta, bytes }));
    },
    async remove(id) {
      await request((await store('readwrite')).delete(id));
    },
  };
}

/** IndexedDB when it works, otherwise memory. */
export function defaultBackend(): ProjectBackend {
  const idb = indexedDbBackend();
  if (!idb) return memoryBackend();
  const mem = memoryBackend();
  let broken = false;
  // if IndexedDB throws (blocked in a private window, say), switch to memory for good
  const guard =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>, g: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      if (broken) return g(...a);
      try {
        return await f(...a);
      } catch {
        broken = true;
        return g(...a);
      }
    };
  return {
    list: guard(idb.list, mem.list),
    get: guard(idb.get, mem.get),
    put: guard(idb.put, mem.put),
    remove: guard(idb.remove, mem.remove),
  };
}

export const newestFirst = (a: ProjectMeta, b: ProjectMeta) => b.updatedAt - a.updatedAt;
