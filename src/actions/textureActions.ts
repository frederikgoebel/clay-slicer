import type { Mask, TextureLayer } from '../core/types';
import { uid } from '../domain/print';
import { useImageStore } from '../store/imageStore';
import { useMaskStore } from '../store/maskStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTextureClipboard, type TextureCopy } from '../store/textureClipboard';
import { maskImageKey } from './decalActions';

const cloneMask = (m: Mask | null | undefined): Mask | null =>
  m ? { width: m.width, height: m.height, data: Uint8Array.from(m.data) } : null;

/** A texture with its own copies of its pictures (nothing shared with the original). */
export function copyOf(id: string): TextureCopy | null {
  const layer = useSettingsStore.getState().textures.find((t) => t.id === id);
  if (!layer) return null;
  const images = useImageStore.getState().images;
  return {
    layer: structuredClone({ ...layer, mask: null, image: null, maskImage: null }),
    mask: cloneMask(useMaskStore.getState().masks[id]),
    image: cloneMask(images[id]),
    maskImage: cloneMask(images[maskImageKey(id)]),
  };
}

/** Put copies into the stack at `index` as new textures (new ids); returns their ids. */
export function insertCopies(items: TextureCopy[], index: number): string[] {
  const masks = { ...useMaskStore.getState().masks };
  const images = { ...useImageStore.getState().images };
  const layers: TextureLayer[] = items.map((c) => {
    const id = uid();
    const m = cloneMask(c.mask);
    if (m) masks[id] = m;
    const img = cloneMask(c.image);
    if (img) images[id] = img;
    const mi = cloneMask(c.maskImage);
    if (mi) images[maskImageKey(id)] = mi;
    return { ...structuredClone({ ...c.layer, mask: null, image: null, maskImage: null }), id };
  });
  useMaskStore.getState().replaceAll(masks);
  useImageStore.getState().replaceAll(images);
  useSettingsStore.getState().insertTextures(layers, index);
  return layers.map((l) => l.id);
}

const indexAfter = (id: string | null): number => {
  const textures = useSettingsStore.getState().textures;
  if (id === null) return textures.length;
  const i = textures.findIndex((t) => t.id === id);
  return i < 0 ? textures.length : i + 1;
};

/** A copy right after the original. */
export function duplicateTexture(id: string): void {
  const c = copyOf(id);
  if (c) insertCopies([c], indexAfter(id));
}

export function copyTexture(id: string): void {
  const c = copyOf(id);
  if (c) useTextureClipboard.getState().set([c]);
}

export function copyStack(): void {
  const ids = useSettingsStore.getState().textures.map((t) => t.id);
  const items = ids.map(copyOf).filter((c): c is TextureCopy => c !== null);
  if (items.length) useTextureClipboard.getState().set(items);
}

/** Paste what was copied after a texture (or at the end of the stack). */
export function pasteTextures(after: string | null = null): void {
  const items = useTextureClipboard.getState().items;
  if (items.length) insertCopies(items, indexAfter(after));
}
