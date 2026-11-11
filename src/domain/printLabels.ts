import type { FloorPattern, InfillPattern, PrintMode, TopCurves } from '../core/types';
import type { PrintSettings } from './print';

/** The names the editor shows for the print settings; the change history uses the same ones. */
export interface PrintFieldLabel {
  label: string;
  unit?: string;
}

export const PRINT_FIELDS: Record<keyof PrintSettings, PrintFieldLabel> = {
  mode: { label: 'Mode' },
  seamAngle: { label: 'Start angle', unit: '°' },
  segLen: { label: 'Path resolution', unit: 'mm' },
  topFinish: { label: 'Flat finishing ring at the top' },
  topCurves: { label: 'Non-planar top' },
  topAngle: { label: 'Top surface tilt', unit: '°' },
  wallCount: { label: 'Wall loops' },
  infillDensity: { label: 'Infill', unit: '%' },
  infillPattern: { label: 'Infill pattern' },
  infillAngle: { label: 'Infill angle', unit: '°' },
  solidTop: { label: 'Solid top layers' },
  retractDistance: { label: 'Retraction', unit: 'mm' },
  retractSpeed: { label: 'Retraction speed', unit: 'mm/s' },
  zHop: { label: 'Z hop on travel moves', unit: 'mm' },
  floorLayers: { label: 'Floor layers' },
  floorPattern: { label: 'Pattern' },
  floorAngle: { label: 'Line angle', unit: '°' },
  floorSpacingPct: { label: 'Line spacing', unit: '% of width' },
  floorBelow: { label: 'Print the floor below the model' },
  pauseAfterFloor: { label: 'Pause after the floor' },
  pauseSeconds: { label: 'Dwell time', unit: 's' },
  pauseLift: { label: 'Lift during pause', unit: 'mm' },
  textureFadeIn: { label: 'Fade-in above floor', unit: 'mm' },
  scalePct: { label: 'Scale', unit: '%' },
  rotX: { label: 'Rotate X', unit: '°' },
  rotY: { label: 'Rotate Y', unit: '°' },
  rotZ: { label: 'Rotate Z', unit: '°' },
};

export const MODES: readonly (readonly [PrintMode, string])[] = [
  ['spiral', 'Spiral (vase mode)'],
  ['layered', 'Layered rings'],
  ['normal', 'Standard layers (all curves, travel + retraction)'],
];

export const TOP_CURVES: readonly (readonly [TopCurves, string])[] = [
  ['closed', 'Close the curves (as sliced)'],
  ['open', 'Open lines, travel on the outside'],
  ['follow', 'Follow the top (layer height varies)'],
];

export const INFILL_PATTERNS: readonly (readonly [InfillPattern, string])[] = [
  ['lines', 'Lines (turn 90° each layer)'],
  ['grid', 'Grid'],
  ['triangles', 'Triangles'],
  ['gyroid', 'Gyroid (waves, shifts each layer)'],
];

export const FLOOR_PATTERNS: readonly (readonly [FloorPattern, string])[] = [
  ['spiral', 'Spiral'],
  ['insets', 'Inset curves (concentric)'],
  ['lines', 'Lines (turn 90° each layer)'],
  ['grid', 'Grid (both directions each layer)'],
];

/** Display names of option values, by setting. */
export const PRINT_VALUE_NAMES: Partial<Record<keyof PrintSettings, Record<string, string>>> = {
  mode: Object.fromEntries(MODES),
  topCurves: Object.fromEntries(TOP_CURVES),
  floorPattern: Object.fromEntries(FLOOR_PATTERNS),
  infillPattern: Object.fromEntries(INFILL_PATTERNS),
};
