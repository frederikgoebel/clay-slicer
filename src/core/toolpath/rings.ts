import { centroid, findSeam, normals, resample, signedArea } from '../geometry/contour';
import { meshHeight } from '../geometry/mesh';
import { sliceLayersFlagged, type FlaggedLoop } from '../geometry/slice';
import type { SliceSettings } from '../types';

/** One layer's outer contour, resampled to N points starting at the seam. */
export interface Ring {
  xy: Float64Array;
  nxy: Float64Array;
  cx: number;
  cy: number;
  perimeter: number;
  area: number;
  /** 1 = this point lies on an upward-facing (top) surface; only set when open top curves are asked for */
  cap: Uint8Array;
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
  /** every sliced loop per layer (outer contours and holes), for the standard layer mode */
  loops: FlaggedLoop[][];
}

export const floorLayerCount = (s: Pick<SliceSettings, 'floorLayers'>) =>
  Math.max(0, Math.round(s.floorLayers));

/** Floor layers that replace the model's first layers (0 when the floor is printed below it). */
export const floorInsideLayers = (s: Pick<SliceSettings, 'floorLayers' | 'floorBelow'>) =>
  s.floorBelow ? 0 : floorLayerCount(s);

/** Floor layers added underneath the model (0 when it replaces the first layers). */
export const floorBelowLayers = (s: Pick<SliceSettings, 'floorLayers' | 'floorBelow'>) =>
  s.floorBelow ? floorLayerCount(s) : 0;

/**
 * Slice the mesh and reduce every layer to a single, resampled outer contour.
 * Layer j is cut at z=(j+.5)h and printed at nozzle height (j+1)h.
 */
export function buildRings(pos: Float32Array, s: SliceSettings): RingSet {
  const warnings: string[] = [];
  const h = s.layerHeight;
  const F = floorInsideLayers(s);

  const zmax = meshHeight(pos);
  if (!(zmax > 0)) throw new Error('Model is empty.');
  let L = Math.ceil(zmax / h - 0.5 - 1e-9);
  if (L < F + 2) throw new Error('Model is too low for this layer height and floor thickness.');

  const capCos = s.topCurves !== 'closed' ? Math.cos((s.topAngle * Math.PI) / 180) : 2;
  const sliced = sliceLayersFlagged(pos, h, L, capCos);
  const normal = s.mode === 'normal';
  const outers: FlaggedLoop[] = [];
  let islandsAt = -1;
  let holesAt = -1;
  for (let j = 0; j < L; j++) {
    let best: FlaggedLoop | null = null;
    let bestArea = 0;
    let islands = 0;
    let holes = 0;
    for (const loop of sliced[j]) {
      const a = signedArea(loop.xy);
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
  if (islandsAt >= 0 && !normal)
    warnings.push(
      `Several separate parts from layer ${islandsAt + 1} up: only the largest one is printed.`,
    );
  if (holesAt >= 0 && !normal)
    warnings.push(
      `Inner walls/holes from layer ${holesAt + 1} up are ignored (single-wall print).`,
    );

  let pMax = 0;
  for (const { xy: o } of outers) {
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
  const rings = outers.map(({ xy: o, cap }): Ring => {
    const [cx, cy] = centroid(o);
    const r = resample(o, findSeam(o, cx, cy, seamRad), N, cap);
    return {
      xy: r.xy,
      nxy: normals(r.xy),
      cx,
      cy,
      perimeter: r.perimeter,
      area: signedArea(o),
      cap: r.flag,
    };
  });
  return { rings, N, layers: L, zmax, warnings, loops: sliced.slice(0, L) };
}
