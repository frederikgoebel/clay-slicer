/** A small shaded picture of the model (what the preview shows), kept with the project in the list. */
export interface ProjectIcon {
  width: number;
  height: number;
  /** RGBA pixels, transparent background */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export const ICON_SIZE = 64;

/** An icon read back from storage, or undefined when it is missing or from an older format. */
export function validIcon(x: unknown): ProjectIcon | undefined {
  const i = (x ?? {}) as { width?: unknown; height?: unknown; rgba?: unknown };
  const { width, height, rgba } = i;
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    return undefined;
  if (!(rgba instanceof Uint8ClampedArray || rgba instanceof Uint8Array)) return undefined;
  if (rgba.length !== width * height * 4) return undefined;
  const pixels = new Uint8ClampedArray(new ArrayBuffer(rgba.length));
  pixels.set(rgba);
  return { width, height, rgba: pixels };
}
