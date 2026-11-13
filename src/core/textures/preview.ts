import { meshHeight } from '../geometry/mesh';
import { buildRings, type RingSet } from '../toolpath/rings';
import type { SliceSettings } from '../types';

const ROWS = 64;
const cache = new WeakMap<Float32Array, RingSet | null>();

/** Coarse rings of the model, shared by all small previews; null if the model cannot be sliced. */
export function previewRings(
  mesh: Float32Array,
  s: SliceSettings,
): { set: RingSet; rowH: number } | null {
  const rowH = meshHeight(mesh) / ROWS;
  let set = cache.get(mesh);
  if (set === undefined) {
    try {
      set = buildRings(mesh, {
        ...s,
        textures: [],
        layerHeight: rowH,
        floorLayers: 0,
        floorBelow: false,
        mode: 'spiral',
        topCurves: 'closed',
        sampleMm: 3,
        seamAngle: 0,
      });
    } catch {
      set = null;
    }
    cache.set(mesh, set);
  }
  return set ? { set, rowH } : null;
}

export const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
