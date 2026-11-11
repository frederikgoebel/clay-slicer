import { FEATURE_TRAVEL, type ToolpathResult } from '../../core/types';

/** Number of points before the first printed point above zLimit. */
export function pointsBelowZ(res: ToolpathResult, zLimit: number): number {
  // travel hops rise above the layer, so look at printed points only (linear scan)
  for (let i = 0; i < res.count; i++)
    if (res.feature[i] !== FEATURE_TRAVEL && res.xyz[3 * i + 2] > zLimit + 1e-6) return i;
  return res.count;
}

/** How many points to draw for the layer slider (null = all). */
export function visiblePointCount(
  res: ToolpathResult,
  layer: number | null,
  layerHeight: number,
): number {
  return layer === null ? res.count : pointsBelowZ(res, layer * layerHeight);
}
