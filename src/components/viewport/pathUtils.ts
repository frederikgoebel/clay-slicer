import type { ToolpathResult } from '../../core/types';

/** Number of points at or below zLimit (the path rises monotonically, so binary search). */
export function pointsBelowZ(res: ToolpathResult, zLimit: number): number {
  let lo = 0;
  let hi = res.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (res.xyz[3 * mid + 2] <= zLimit + 1e-6) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** How many points to draw for the layer slider (null = all). */
export function visiblePointCount(
  res: ToolpathResult,
  layer: number | null,
  layerHeight: number,
): number {
  return layer === null ? res.count : pointsBelowZ(res, layer * layerHeight);
}
