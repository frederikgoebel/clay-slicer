import { centroid, findSeam, normals, resample, signedArea } from '../geometry/contour';
import { meshHeight } from '../geometry/mesh';
import { sliceLayers } from '../geometry/slice';
import type { SliceSettings } from '../types';

/** One layer's outer contour, resampled to N points starting at the seam. */
export interface Ring {
  xy: Float64Array;
  nxy: Float64Array;
  cx: number;
  cy: number;
  perimeter: number;
  area: number;
}

export interface RingSet {
  rings: Ring[];
  /** points per ring (identical for all rings so they can be interpolated) */
  N: number;
  /** number of usable layers (may be fewer than the model height suggests) */
  layers: number;
  /** model height in mm */
  zmax: number;
  warnings: string[];
}

export const floorLayerCount = (s: Pick<SliceSettings, 'floorLayers'>) =>
  Math.max(0, Math.round(s.floorLayers));

/**
 * Slice the mesh and reduce every layer to a single, resampled outer contour.
 * Layer j is cut at z=(j+.5)h and printed at nozzle height (j+1)h.
 */
export function buildRings(pos: Float32Array, s: SliceSettings): RingSet {
  const warnings: string[] = [];
  const h = s.layerHeight;
  const F = floorLayerCount(s);

  const zmax = meshHeight(pos);
  if (!(zmax > 0)) throw new Error('Model is empty.');
  let L = Math.ceil(zmax / h - 0.5 - 1e-9);
  if (L < F + 2) throw new Error('Model is too low for this layer height and floor thickness.');

  const sliced = sliceLayers(pos, h, L);
  const outers: Float64Array[] = [];
  let islandsAt = -1;
  let holesAt = -1;
  for (let j = 0; j < L; j++) {
    let best: Float64Array | null = null;
    let bestArea = 0;
    let islands = 0;
    let holes = 0;
    for (const loop of sliced[j]) {
      const a = signedArea(loop);
      if (a > 1) {
        islands++;
        if (a > bestArea) {
          bestArea = a;
          best = loop;
        }
      } else if (a < -1) holes++;
    }
    if (!best) {
      warnings.push(
        `No closed contour at layer ${j + 1}; the print is cut off there (is the mesh watertight?).`,
      );
      L = j;
      break;
    }
    if (islands > 1 && islandsAt < 0) islandsAt = j;
    if (holes > 0 && holesAt < 0) holesAt = j;
    outers.push(best);
  }
  if (L < F + 2) throw new Error('Not enough valid layers to build a print.');
  if (islandsAt >= 0)
    warnings.push(
      `Several separate parts from layer ${islandsAt + 1} up: only the largest one is printed.`,
    );
  if (holesAt >= 0)
    warnings.push(
      `Inner walls/holes from layer ${holesAt + 1} up are ignored (single-wall print).`,
    );

  let pMax = 0;
  for (const o of outers) {
    const n = o.length / 2;
    let p = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      p += Math.hypot(o[2 * j] - o[2 * i], o[2 * j + 1] - o[2 * i + 1]);
    }
    pMax = Math.max(pMax, p);
  }
  const N = Math.min(4000, Math.max(32, Math.ceil(pMax / s.segLen)));
  const seamRad = (s.seamAngle * Math.PI) / 180;
  const rings = outers.map((o): Ring => {
    const [cx, cy] = centroid(o);
    const r = resample(o, findSeam(o, cx, cy, seamRad), N);
    return { xy: r.xy, nxy: normals(r.xy), cx, cy, perimeter: r.perimeter, area: signedArea(o) };
  });
  return { rings, N, layers: L, zmax, warnings };
}
