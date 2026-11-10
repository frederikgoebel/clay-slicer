import { create } from 'zustand';
import { createMask, invertMask } from '../core/textures/mask';
import type { Mask } from '../core/types';

/**
 * Painted texture masks, kept out of the persisted settings (they are large and binary).
 * Brush strokes mutate `data` in place for speed; `commit()` then bumps `version`
 * so the slicer re-runs once per stroke instead of once per stamp.
 */
interface MaskState {
  masks: Record<string, Mask>;
  version: number;
  /** Get the mask for a texture, creating it (filled with `fill`) when missing. */
  ensure: (id: string, fill: number) => Mask;
  /** Back to "texture applies everywhere". */
  clear: (id: string) => void;
  fill: (id: string) => void;
  invert: (id: string) => void;
  /** Replace all masks (project load). */
  replaceAll: (masks: Record<string, Mask>) => void;
  commit: () => void;
}

export const useMaskStore = create<MaskState>()((set, get) => ({
  masks: {},
  version: 0,
  ensure: (id, fill) => {
    const existing = get().masks[id];
    if (existing) return existing;
    const mask = createMask(fill);
    set((s) => ({ masks: { ...s.masks, [id]: mask } }));
    return mask;
  },
  clear: (id) =>
    set((s) => {
      const masks = { ...s.masks };
      delete masks[id];
      return { masks, version: s.version + 1 };
    }),
  fill: (id) =>
    set((s) => ({ masks: { ...s.masks, [id]: createMask(255) }, version: s.version + 1 })),
  invert: (id) =>
    set((s) => ({
      masks: { ...s.masks, [id]: invertMask(s.masks[id] ?? createMask(255)) },
      version: s.version + 1,
    })),
  replaceAll: (masks) => set((s) => ({ masks, version: s.version + 1 })),
  commit: () => set((s) => ({ version: s.version + 1 })),
}));
