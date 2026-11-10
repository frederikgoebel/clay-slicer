import type { FloorPattern, PrintMode, TextureLayer, TextureType } from '../core/types';

/** Settings that belong to one print rather than to a machine, nozzle or clay. */
export interface PrintSettings {
  scalePct: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  mode: PrintMode;
  segLen: number;
  seamAngle: number;
  topFinish: boolean;
  floorLayers: number;
  floorSpacingPct: number;
  floorPattern: FloorPattern;
  floorAngle: number;
  textureFadeIn: number;
}

export const DEFAULT_PRINT: PrintSettings = {
  scalePct: 100,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  mode: 'spiral',
  segLen: 1.5,
  seamAngle: 0,
  topFinish: true,
  floorLayers: 2,
  floorSpacingPct: 90,
  floorPattern: 'spiral',
  floorAngle: 45,
  textureFadeIn: 6,
};

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const TEXTURE_NAMES: Record<TextureType, string> = {
  fuzzy: 'Fuzzy skin',
  wave: 'Waves',
  zigzag: 'Zigzag',
  ribs: 'Ribs / fluting',
  twist: 'Twist',
  blobs: 'Clay blobs',
  decal: 'Decal (image)',
};

export function newTexture(type: TextureType): TextureLayer {
  const base: TextureLayer = {
    id: uid(),
    type,
    enabled: true,
    amplitude: 1,
    count: 8,
    wavelength: 0,
    seed: 1,
    from: 0,
    to: 100,
    fade: 10,
    blend: 'add',
    angle: 0,
    zc: 60,
    width: 60,
    hgt: 60,
    rot: 0,
    invert: false,
  };
  switch (type) {
    case 'fuzzy':
      return { ...base, amplitude: 0.6, wavelength: 2, count: 0 };
    case 'wave':
      return { ...base, amplitude: 1.5, count: 6, wavelength: 30 };
    case 'zigzag':
      return { ...base, amplitude: 1.5, count: 10 };
    case 'ribs':
      return { ...base, amplitude: 1, count: 24 };
    case 'twist':
      return { ...base, amplitude: 90, count: 0 };
    case 'decal':
      return { ...base, amplitude: 1.5 };
    case 'blobs':
      return { ...base, amplitude: 1.5, count: 12, wavelength: 8 };
  }
}
