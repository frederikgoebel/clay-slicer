import type { SliceSettings } from '../types';

type BeadParams = Pick<
  SliceSettings,
  'extrusionRate' | 'layerHeight' | 'printSpeed' | 'flowFollowsSpeed'
>;

/** cm³/min <-> mm³/s (the UI uses cm³/min, the maths uses mm³/s). */
export const cm3MinToMm3S = (v: number) => (v * 1000) / 60;
export const mm3SToCm3Min = (v: number) => (v * 60) / 1000;

/** Cross-section of a bead: a rectangle with semicircular ends, mm². */
export function beadArea(width: number, height: number): number {
  const w = Math.max(width, height);
  return (w - height) * height + (Math.PI * height * height) / 4;
}

/** Inverse of beadArea: the width of a bead with the given area and layer height. */
export function widthFromArea(area: number, height: number): number {
  const round = (Math.PI * height * height) / 4;
  return area <= round ? height : (area - round) / height + height;
}

/** Bead cross-section at the programmed print speed: extrusion rate / speed, mm². */
export function nominalArea(s: BeadParams): number {
  return s.extrusionRate / Math.max(s.printSpeed, 0.1);
}

/** Calculated bead (line) width at the programmed print speed, mm. Not a user input. */
export function nominalWidth(s: BeadParams): number {
  return widthFromArea(nominalArea(s), s.layerHeight);
}

/**
 * Estimated real bead area at a given travel speed.
 *
 * The extrusion rate is calibrated for `printSpeed`. An ideal E-driven extruder lays the same
 * volume per mm at any speed (flowFollowsSpeed = 0); a pressure-fed one delivers a constant
 * volume per second, so a slower move gives a fatter bead (flowFollowsSpeed = 1).
 */
export function actualArea(s: BeadParams, speed: number): number {
  const ratio = s.printSpeed / Math.max(speed, 0.1);
  return nominalArea(s) * Math.pow(ratio, s.flowFollowsSpeed);
}

/** Estimated bead width (mm) from extrusion rate, layer height and travel speed. */
export function estimateWidth(s: BeadParams, speed: number): number {
  return widthFromArea(actualArea(s, speed), s.layerHeight);
}
