import type { CurvePoint } from '../core/textures/curve';
import type {
  FloorPattern,
  InfillPattern,
  PrintMode,
  TopCurves,
  TextureLayer,
  TextureType,
} from '../core/types';

/** Settings that belong to one print rather than to a machine, nozzle or clay. */
export interface PrintSettings {
  scalePct: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  mode: PrintMode;
  seamAngle: number;
  topFinish: boolean;
  topCurves: TopCurves;
  /** degrees from vertical below which a face counts as top surface */
  topAngle: number;
  /** Standard layers: wall loops, infill share in % (0 = none), pattern, angle, solid layers at the top */
  wallCount: number;
  infillDensity: number;
  infillPattern: InfillPattern;
  infillAngle: number;
  solidTop: number;
  /** mm the nozzle rises on travel moves */
  floorLayers: number;
  floorSpacingPct: number;
  floorPattern: FloorPattern;
  floorAngle: number;
  floorBelow: boolean;
  pauseAfterFloor: boolean;
  /** seconds */
  pauseSeconds: number;
  /** mm the nozzle lifts during the pause */
  pauseLift: number;
  textureFadeIn: number;
  /** distance between the points of the printed path, mm */
  segLen: number;
}

export const DEFAULT_PRINT: PrintSettings = {
  scalePct: 100,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  mode: 'spiral',
  seamAngle: 0,
  topFinish: true,
  topCurves: 'closed',
  topAngle: 35,
  wallCount: 1,
  infillDensity: 0,
  infillPattern: 'lines',
  infillAngle: 45,
  solidTop: 2,
  floorLayers: 2,
  floorSpacingPct: 140,
  floorPattern: 'spiral',
  floorAngle: 45,
  floorBelow: false,
  pauseAfterFloor: true,
  pauseSeconds: 20,
  pauseLift: 300,
  textureFadeIn: 6,
  segLen: 1,
};

/** Print settings from storage or a file: known keys only, missing ones at their defaults. */
export function cleanPrint(raw: unknown): PrintSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_PRINT };
  for (const [k, def] of Object.entries(DEFAULT_PRINT)) {
    if (typeof src[k] === typeof def) out[k] = src[k];
  }
  return out as unknown as PrintSettings;
}

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const TEXTURE_NAMES: Record<TextureType, string> = {
  fuzzy: 'Fuzzy skin',
  wave: 'Waves',
  zigzag: 'Zigzag',
  ribs: 'Ribs / fluting',
  twist: 'Twist',
  blobs: 'Clay blobs',
  ledge: 'Outdents',
  sling: 'Slings',
  flow: 'Flow',
  decal: 'Decal',
};

/** Outdent presets: out layer by layer, then back in slowly or in one go (bridging the gap). */
export const CLOSE_SLOWLY: CurvePoint[] = [
  [0, 0],
  [0.5, 1],
  [1, 0],
];
export const BRIDGE_BACK: CurvePoint[] = [
  [0, 0],
  [0.96, 1],
  [1, 0],
];
/** Outdent that goes out and stays out until the end of the range. */
export const STAY_OPEN: CurvePoint[] = [
  [0, 0],
  [0.6, 1],
  [1, 1],
];
export const ALL_AROUND: CurvePoint[] = [
  [0, 1],
  [1, 1],
];
export const ONE_SIDE: CurvePoint[] = [
  [0, 0],
  [0.35, 0],
  [0.5, 1],
  [0.65, 0],
  [1, 0],
];

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
    solidFrom: 0,
    solid: 100,
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
      return { ...base, amplitude: 1.5, count: 12, wavelength: 8, lift: 0 };
    case 'ledge':
      return {
        ...base,
        amplitude: 6,
        count: 1,
        from: 40,
        to: 60,
        solidFrom: 40,
        solid: 60,
        wavelength: 12,
        rotStep: 0,
        curveV: [...CLOSE_SLOWLY],
        curveA: [...ALL_AROUND],
      };
    case 'flow':
      return { ...base, amplitude: 40, count: 0, wavelength: 0 };
    case 'sling':
      return {
        ...base,
        amplitude: 15,
        count: 6,
        wavelength: 20,
        width: 10,
        layersDown: 1,
        rotStep: 15,
      };
  }
}
