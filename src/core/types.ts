/**
 * Framework-free types shared by the slicing core, the worker and the UI.
 * Nothing in `src/core` may import from React, three.js or the stores.
 */

export type TextureType = 'fuzzy' | 'wave' | 'zigzag' | 'ribs' | 'twist' | 'blobs' | 'decal';

/** How a texture layer combines with the layers before it. */
export type BlendMode = 'add' | 'max' | 'replace';

/**
 * Painted texture influence in "unwrapped" model space:
 * x = angle around the vertical axis (0..width), y = height (0..height), values 0..255.
 */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface TextureLayer {
  id: string;
  type: TextureType;
  enabled: boolean;
  /** mm of radial offset (twist: total degrees; blobs: seconds of standing still per blob) */
  amplitude: number;
  /** repeats around the circumference (wave, zigzag, ribs, blobs) */
  count: number;
  /** vertical wavelength in mm (wave, zigzag; 0 = none). Fuzzy: feature size. Blobs: row spacing */
  wavelength: number;
  seed: number;
  /** height range the texture applies to, % of model height */
  from: number;
  to: number;
  /** height (% of model) up to which the texture is at full strength; it fades out from here to `to` */
  solid: number;
  /** add: sum with earlier layers; max: the higher of the two wins; replace: overrides them */
  blend: BlendMode;
  /** decal placement: centre angle around Z (deg, 0 = +X), centre height and size on the surface (mm), rotation (deg) */
  angle: number;
  zc: number;
  width: number;
  hgt: number;
  rot: number;
  /** decal: bright = engraved instead of raised */
  invert: boolean;
  /** decal image (grayscale, 0..255); lives in the image store, not persisted */
  image?: Mask | null;
  /** painted influence; null/undefined = everywhere. Lives in the mask store, not persisted. */
  mask?: Mask | null;
}

export type PrintMode = 'spiral' | 'layered';

/** Everything the pipeline needs, flattened from printer + nozzle + clay profiles + print settings. */
export interface SliceSettings {
  // printer
  buildDiameter: number;
  buildHeight: number;
  travelSpeed: number; // mm/s
  /** 0..1: how strongly bead width follows 1/speed (0 = ideal E-driven, 1 = pressure-fed) */
  flowFollowsSpeed: number;
  eDia: number; // mm, "filament" diameter that converts volume to E units
  primeE: number;
  startDwell: number; // ms
  tankCm3: number;
  startGcode: string;
  endGcode: string;
  // nozzle
  nozzle: number;
  layerHeight: number;
  /**
   * Volume of clay leaving the nozzle at the print speed, mm³/s (nozzle profile rate x clay flow
   * factor). The bead width is not an input: it follows from this, the speed and the layer height.
   */
  extrusionRate: number;
  // clay
  printSpeed: number; // mm/s
  minLayerTime: number; // s
  density: number; // g/cm3
  waterPct: number;
  overhangMax: number; // deg from vertical
  // print
  mode: PrintMode;
  segLen: number;
  seamAngle: number;
  topFinish: boolean;
  floorLayers: number;
  floorSpacingPct: number;
  floorPattern: FloorPattern;
  /** print the floor underneath the model instead of replacing its first layers */
  floorBelow: boolean;
  /** stop after the floor: lift the nozzle, wait, come back */
  pauseAfterFloor: boolean;
  pauseSeconds: number;
  /** how far the nozzle lifts during the pause, mm */
  pauseLift: number;
  /** direction of the first line layer for the line / grid patterns, degrees */
  floorAngle: number;
  textureFadeIn: number;
  textures: TextureLayer[];
}

export interface MeshTransform {
  scalePct: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  shrinkagePct: number;
}

export type FloorPattern = 'spiral' | 'insets' | 'lines' | 'grid';

export const FEATURE_TRAVEL = 0;
export const FEATURE_FLOOR = 1;
export const FEATURE_WALL = 2;
export const FEATURE_TOP = 3;

export interface ToolpathStats {
  lengthMm: number;
  timeS: number;
  volumeCm3: number;
  wetG: number;
  firedG: number;
  layers: number;
  heightMm: number;
  maxRadiusMm: number;
  maxOverhangDeg: number;
  maxOverhangZ: number;
  overhangPct: number;
  refillZ: number[];
  /** estimated bead width over all printed points, mm */
  widthMin: number;
  widthMax: number;
  widthAvg: number;
  sliceMs: number;
}

export interface ToolpathResult {
  count: number;
  /** x,y,z per point, bed coordinates, origin at the bed centre */
  xyz: Float32Array;
  feature: Uint8Array;
  /** mm/s of the move arriving at each point */
  speed: Float32Array;
  /** estimated bead width in mm of the move arriving at each point */
  width: Float32Array;
  /** overhang angle in degrees from vertical, outward only */
  overhang: Float32Array;
  /** seconds the nozzle stands still extruding at each point (blobs), 0 = moving */
  dwell: Float32Array;
  /** index of the point the pause after the floor comes before, -1 = no pause */
  pauseAt: number;
  stats: ToolpathStats;
  warnings: string[];
}
