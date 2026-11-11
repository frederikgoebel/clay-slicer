import type { Mask } from '../core/types';
import { useImageStore } from '../store/imageStore';
import { useModelStore } from '../store/modelStore';

const MAX_SIDE = 512;

/**
 * Turn a picture into a grayscale decal (or mask picture, with a different `key`): luminance x alpha, scaled to at most 512 px.
 * Bright = raised (or engraved with "Invert"), so a white drawing on black works as is.
 */
/** The image-store key of a texture's mask picture (the decal picture uses the plain id). */
export const maskImageKey = (textureId: string) => `${textureId}~mask`;

export async function loadDecalImage(
  textureId: string,
  file: File,
  key = textureId,
): Promise<void> {
  try {
    const bitmap = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const lum = 0.2126 * rgba[4 * i] + 0.7152 * rgba[4 * i + 1] + 0.0722 * rgba[4 * i + 2];
      data[i] = Math.round((lum * rgba[4 * i + 3]) / 255);
    }
    const image: Mask = { width: w, height: h, data };
    useImageStore.getState().set(key, image);
  } catch (err) {
    useModelStore
      .getState()
      .setError(`Could not read image: ${err instanceof Error ? err.message : String(err)}`);
  }
}
