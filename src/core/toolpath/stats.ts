import { FEATURE_TRAVEL, FEATURE_WALL, type SliceSettings, type ToolpathStats } from '../types';
import { beadArea, nominalWidth } from './bead';
import type { PathBuilder } from './PathBuilder';

/** Length, time, material, overhang and width statistics for a finished path. */
export function computeStats(
  p: PathBuilder,
  s: SliceSettings,
  layers: number,
  sliceMs: number,
  pauseS = 0,
): { stats: ToolpathStats; warnings: string[] } {
  const { xyz, feature, speed, width, overhang, dwell, thick } = p;
  const n = p.count;
  const h = s.layerHeight;
  let lengthMm = 0;
  let timeS = pauseS;
  let volMm3 = 0;
  let maxR = 0;
  let maxOh = 0;
  let maxOhZ = 0;
  let ohCount = 0;
  let wallCount = 0;
  let wMin = Infinity;
  let wMax = 0;
  let wSum = 0;
  let wN = 0;
  const refillZ: number[] = [];
  const tankMm3 = s.tankCm3 * 1000;

  for (let i = 0; i < n; i++) {
    maxR = Math.max(maxR, Math.hypot(xyz[3 * i], xyz[3 * i + 1]));
    if (feature[i] === FEATURE_WALL) {
      wallCount++;
      if (overhang[i] > maxOh) {
        maxOh = overhang[i];
        maxOhZ = xyz[3 * i + 2];
      }
      if (overhang[i] > s.overhangMax) ohCount++;
    }
    if (dwell[i] > 0) {
      // standing still while clay keeps coming out at the nominal rate
      timeS += dwell[i];
      volMm3 += s.extrusionRate * dwell[i];
    }
    if (i === 0) continue;
    if (feature[i] === FEATURE_TRAVEL) {
      timeS +=
        Math.hypot(
          xyz[3 * i] - xyz[3 * i - 3],
          xyz[3 * i + 1] - xyz[3 * i - 2],
          xyz[3 * i + 2] - xyz[3 * i - 1],
        ) / s.travelSpeed;
      continue;
    }
    const len = Math.hypot(
      xyz[3 * i] - xyz[3 * i - 3],
      xyz[3 * i + 1] - xyz[3 * i - 2],
      xyz[3 * i + 2] - xyz[3 * i - 1],
    );
    lengthMm += len;
    timeS += len / speed[i];
    const before = volMm3;
    volMm3 += len * beadArea(width[i], thick[i]);
    if (tankMm3 > 0 && Math.floor(volMm3 / tankMm3) > Math.floor(before / tankMm3))
      refillZ.push(xyz[3 * i + 2]);
    wMin = Math.min(wMin, width[i]);
    wMax = Math.max(wMax, width[i]);
    wSum += width[i];
    wN++;
  }

  const volumeCm3 = volMm3 / 1000;
  const wetG = volumeCm3 * s.density;
  const overhangPct = wallCount ? (100 * ohCount) / wallCount : 0;
  const warnings: string[] = [];
  if (maxOh > s.overhangMax)
    warnings.push(
      `Overhang: ${overhangPct.toFixed(1)}% of the wall is steeper than ${s.overhangMax}° (max ${maxOh.toFixed(0)}° near z=${maxOhZ.toFixed(0)} mm). Wet clay may slump or tear there.`,
    );
  const w = nominalWidth(s);
  if (w < h * 1.2)
    warnings.push(
      `Calculated bead width (${w.toFixed(1)} mm) is close to the layer height; beads may not bond well. Raise the extrusion rate or lower the speed.`,
    );
  if (w < s.nozzle * 0.8)
    warnings.push(
      `Calculated bead width (${w.toFixed(1)} mm) is well below the ${s.nozzle} mm nozzle. Raise the extrusion rate or lower the speed.`,
    );
  if (w > s.nozzle * 2.2)
    warnings.push(
      `Calculated bead width (${w.toFixed(1)} mm) is very wide for a ${s.nozzle} mm nozzle. Lower the extrusion rate or raise the speed.`,
    );

  return {
    warnings,
    stats: {
      lengthMm,
      timeS,
      volumeCm3,
      wetG,
      firedG: wetG * (1 - s.waterPct / 100),
      layers,
      heightMm: layers * h,
      maxRadiusMm: maxR,
      maxOverhangDeg: maxOh,
      maxOverhangZ: maxOhZ,
      overhangPct,
      refillZ,
      widthMin: wN ? wMin : 0,
      widthMax: wMax,
      widthAvg: wN ? wSum / wN : 0,
      sliceMs,
    },
  };
}
