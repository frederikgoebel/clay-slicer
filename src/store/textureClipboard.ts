import { create } from 'zustand';
import type { Mask, TextureLayer } from '../core/types';

/** A texture with the pictures that belong to it (painted mask, decal, mask picture). */
export interface TextureCopy {
  layer: TextureLayer;
  mask: Mask | null;
  image: Mask | null;
  maskImage: Mask | null;
}

/** What "Copy" / "Copy stack" took: kept while the app is open, so it can be pasted into another project. */
interface ClipboardState {
  items: TextureCopy[];
  set: (items: TextureCopy[]) => void;
}

export const useTextureClipboard = create<ClipboardState>()((set) => ({
  items: [],
  set: (items) => set({ items }),
}));
