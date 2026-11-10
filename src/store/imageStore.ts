import { create } from 'zustand';
import type { Mask } from '../core/types';

/** Decal images (grayscale), one per decal texture. Large and binary, so not persisted. */
interface ImageState {
  images: Record<string, Mask>;
  set: (id: string, image: Mask) => void;
  remove: (id: string) => void;
  replaceAll: (images: Record<string, Mask>) => void;
}

export const useImageStore = create<ImageState>()((set) => ({
  images: {},
  set: (id, image) => set((s) => ({ images: { ...s.images, [id]: image } })),
  remove: (id) =>
    set((s) => {
      const images = { ...s.images };
      delete images[id];
      return { images };
    }),
  replaceAll: (images) => set({ images }),
}));
