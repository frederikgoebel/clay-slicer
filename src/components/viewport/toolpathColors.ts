import { Color } from 'three';
import {
  FEATURE_FLOOR,
  FEATURE_INFILL,
  FEATURE_TOP,
  FEATURE_WALL,
  type ToolpathResult,
} from '../../core/types';
import type { ColorMode } from '../../store/uiStore';

const c = (hex: string) => new Color(hex);

const HEIGHT_LOW = c('#8a3f22');
const HEIGHT_HIGH = c('#f3be92');
const SPEED_SLOW = c('#e5594b');
const SPEED_FAST = c('#5aa9e6');
const WIDTH_THIN = c('#4a90d9');
const WIDTH_WIDE = c('#e8604c');
const THICK_THIN = c('#4a90d9');
const THICK_THICK = c('#f0c23d');
const FLOOR = c('#e0a63a');
const WALL = c('#d2693f');
const TOP = c('#ecdca0');
const FILL = c('#7fa6c9');
const TRAVEL = c('#7d7d7d');
const OH_OK = c('#6dbf8c');
const OH_WARN = c('#f2b73f');
const OH_BAD = c('#e0473b');

/** Linear RGB colour for every point of the path (3 floats per point). */
export function pointColors(
  res: ToolpathResult,
  mode: ColorMode,
  layerHeight: number,
  overhangLimit: number,
): Float32Array {
  const n = res.count;
  const out = new Float32Array(n * 3);
  const tmp = new Color();

  let sMin = Infinity;
  let sMax = -Infinity;
  let wMin = Infinity;
  let wMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 1; i < n; i++) {
    tMin = Math.min(tMin, res.thick[i]);
    tMax = Math.max(tMax, res.thick[i]);
    sMin = Math.min(sMin, res.speed[i]);
    sMax = Math.max(sMax, res.speed[i]);
    wMin = Math.min(wMin, res.width[i]);
    wMax = Math.max(wMax, res.width[i]);
  }
  const norm = (v: number, lo: number, hi: number) => (hi - lo < 1e-6 ? 0.5 : (v - lo) / (hi - lo));
  const zMax = res.stats.heightMm || 1;

  for (let i = 0; i < n; i++) {
    switch (mode) {
      case 'height': {
        tmp.lerpColors(HEIGHT_LOW, HEIGHT_HIGH, res.xyz[3 * i + 2] / zMax);
        // alternate layers slightly so individual layer lines stay readable
        tmp.multiplyScalar(Math.floor(res.xyz[3 * i + 2] / layerHeight + 1e-6) % 2 ? 0.86 : 1);
        break;
      }
      case 'feature': {
        const f = res.feature[i];
        tmp.copy(
          f === FLOOR_ID
            ? FLOOR
            : f === WALL_ID
              ? WALL
              : f === TOP_ID
                ? TOP
                : f === FEATURE_INFILL
                  ? FILL
                  : TRAVEL,
        );
        break;
      }
      case 'overhang': {
        const r = res.overhang[i] / overhangLimit;
        tmp.copy(r >= 1 ? OH_BAD : r >= 0.6 ? OH_WARN : OH_OK);
        break;
      }
      case 'speed':
        tmp.lerpColors(SPEED_SLOW, SPEED_FAST, norm(res.speed[i], sMin, sMax));
        break;
      case 'width':
        tmp.lerpColors(WIDTH_THIN, WIDTH_WIDE, norm(res.width[i], wMin, wMax));
        break;
      case 'thickness':
        tmp.lerpColors(THICK_THIN, THICK_THICK, norm(res.thick[i], tMin, tMax));
        break;
    }
    out[3 * i] = tmp.r;
    out[3 * i + 1] = tmp.g;
    out[3 * i + 2] = tmp.b;
  }
  return out;
}

const FLOOR_ID = FEATURE_FLOOR;
const WALL_ID = FEATURE_WALL;
const TOP_ID = FEATURE_TOP;

const range = (a: ArrayLike<number>, n: number) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < n; i++) {
    lo = Math.min(lo, a[i]);
    hi = Math.max(hi, a[i]);
  }
  return [lo, hi] as const;
};

/** Layer thickness range (mm) of the printed path. */
export const thicknessRange = (res: ToolpathResult) => range(res.thick, res.count);

/**
 * Colour modes worth offering for this path: speed, bead width and layer height are left out
 * while they are the same everywhere (the whole path would be one colour).
 */
export function colorModesFor(res: ToolpathResult): ColorMode[] {
  const modes: ColorMode[] = ['height', 'feature', 'overhang'];
  const [s0, s1] = range(res.speed, res.count);
  if (s1 - s0 > 0.5) modes.push('speed');
  const [w0, w1] = range(res.width, res.count);
  if (w1 - w0 > 0.05) modes.push('width');
  const [t0, t1] = thicknessRange(res);
  if (t1 - t0 > 0.02) modes.push('thickness');
  return modes;
}
