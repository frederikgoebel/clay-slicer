import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** localStorage when available (private windows / tests may block it), otherwise in memory. */
function pickStorage(): StateStorage {
  try {
    const probe = '__clay_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}

export const safeJsonStorage = <T>() => createJSONStorage<T>(pickStorage);
