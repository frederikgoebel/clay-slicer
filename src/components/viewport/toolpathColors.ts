import { Color } from 'three';
import { FEATURE_FLOOR, FEATURE_TOP, FEATURE_WALL, type ToolpathResult } from '../../core/types';
import type { ColorMode } from '../../store/uiStore';

const c = (hex: string) => new Color(hex);

const HEIGHT_LOW = c('#8a3f22');
const HEIGHT_HIGH = c('#f3be92');
const SPEED_SLOW = c('#e5594b');
const SPEED_FAST = c('#5aa9e6');
const WIDTH_THIN = c('#4a90d9');
const WIDTH_WIDE = c('#e8604c');
const FLOOR = c('#e0a63a');
const WALL = c('#d2693f');
const TOP = c('#ecdca0');
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
  for (let i = 1; i < n; i++) {
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
        tmp.copy(f === FLOOR_ID ? FLOOR : f === WALL_ID ? WALL : f === TOP_ID ? TOP : TRAVEL);
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
