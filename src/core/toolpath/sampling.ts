import type { SliceSettings } from '../types';

/** Most points one ring is sampled with (keeps huge models in memory). */
const MAX_POINTS = 6000;

/** Distance between the points of the path: the "Path resolution" setting (`sampleMm` overrides it). */
export function sampleStep(s: SliceSettings, _minPerimeter?: number): number {
  return Math.max(0.05, s.sampleMm ?? s.segLen);
}

/** Number of sample points around a loop of this perimeter. */
export const pointsFor = (perimeter: number, step: number): number =>
  Math.min(MAX_POINTS, Math.max(32, Math.ceil(perimeter / step)));
