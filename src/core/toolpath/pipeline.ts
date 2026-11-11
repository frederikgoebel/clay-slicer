import type { SliceSettings, ToolpathResult } from '../types';
import { addFloor } from './floor';
import { PathBuilder } from './PathBuilder';
import { buildRings, floorBelowLayers, floorLayerCount } from './rings';
import { computeStats } from './stats';
import { verifyToolpath } from './verify';
import { addWall } from './wall';

/**
 * Mesh (print-size triangle soup, z up, bed centre at 0,0, bottom at z=0) -> toolpath.
 *
 *   slice -> outer contour per layer -> floor spiral -> wall spiral (+ textures)
 *   -> speeds / estimated bead widths -> statistics and sanity checks
 */
export function runPipeline(pos: Float32Array, s: SliceSettings): ToolpathResult {
  const t0 = performance.now();
  const set = buildRings(pos, s);
  const path = new PathBuilder(s);
  addFloor(path, set, s);
  if (s.pauseAfterFloor && floorLayerCount(s) > 0) path.pauseAt = path.count;
  addWall(path, set, s);

  const layers = set.layers + floorBelowLayers(s);
  const pauseS = path.pauseAt > 0 ? s.pauseSeconds : 0;
  const { stats, warnings } = computeStats(path, s, layers, performance.now() - t0, pauseS);
  const xyz = Float32Array.from(path.xyz);
  return {
    count: path.count,
    xyz,
    feature: Uint8Array.from(path.feature),
    speed: Float32Array.from(path.speed),
    width: Float32Array.from(path.width),
    overhang: Float32Array.from(path.overhang),
    dwell: Float32Array.from(path.dwell),
    pauseAt: path.pauseAt,
    stats,
    warnings: [...set.warnings, ...warnings, ...verifyToolpath(xyz, s)],
  };
}
