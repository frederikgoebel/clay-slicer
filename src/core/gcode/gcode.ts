import { mm3SToCm3Min, nominalArea, nominalWidth } from '../toolpath/bead';
import {
  FEATURE_FLOOR,
  FEATURE_TOP,
  FEATURE_TRAVEL,
  FEATURE_WALL,
  type SliceSettings,
  type ToolpathResult,
} from '../types';

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString();

const FEATURE_NAME: Record<number, string> = {
  [FEATURE_TRAVEL]: 'TRAVEL',
  [FEATURE_FLOOR]: 'FLOOR',
  [FEATURE_WALL]: 'WALL',
  [FEATURE_TOP]: 'TOP',
};

/**
 * Marlin/RepRap-style G-code. Clay is pushed by the E axis (absolute extrusion);
 * E per mm = programmed bead volume per mm / area of an imaginary filament of diameter eDia.
 * No retraction, no z-hop.
 */
export function buildGcode(r: ToolpathResult, s: SliceSettings, name = 'model'): string {
  const filamentArea = Math.PI * (s.eDia / 2) ** 2;
  const ePerMm = nominalArea(s) / filamentArea;
  const st = r.stats;
  const vars = {
    nozzle: s.nozzle,
    lineWidth: fmt(nominalWidth(s)),
    layerHeight: s.layerHeight,
    bedDiameter: s.buildDiameter,
    height: fmt(st.heightMm),
  };

  const out: string[] = [
    '; Clay Slicer G-code',
    `; model: ${name}`,
    `; mode: ${s.mode}, nozzle ${s.nozzle} mm, layer ${s.layerHeight} mm, calculated line width ${nominalWidth(s).toFixed(2)} mm`,
    `; speed ${s.printSpeed} mm/s, extrusion ${mm3SToCm3Min(s.extrusionRate).toFixed(1)} cm3/min, E-diameter ${s.eDia} mm (calibrate!)`,
    `; path ${(st.lengthMm / 1000).toFixed(2)} m, est. time ${Math.round(st.timeS / 60)} min`,
    `; clay ${st.volumeCm3.toFixed(0)} cm3 (~${(st.wetG / 1000).toFixed(2)} kg wet)`,
    `; height ${fmt(st.heightMm)} mm, layers ${st.layers}`,
    '; UNTESTED ON HARDWARE: do a dry run without clay before printing.',
    fill(s.startGcode, vars),
  ];

  const { xyz } = r;
  const travelF = Math.round(s.travelSpeed * 60);
  const z0 = xyz[2];
  out.push(`G1 Z${fmt(z0 + 5)} F${travelF} ; clear`);
  out.push(`G0 X${fmt(xyz[0])} Y${fmt(xyz[1])} F${travelF}`);
  out.push(`G1 Z${fmt(z0)} F1500`);
  let e = 0;
  out.push('G92 E0');
  if (s.primeE > 0) {
    e += s.primeE;
    out.push(`G1 E${fmt(e)} F300 ; prime`);
  }
  if (s.startDwell > 0) out.push(`G4 P${Math.round(s.startDwell)} ; wait for flow`);

  let lastF = -1;
  let lastFeature = -1;
  for (let i = 1; i < r.count; i++) {
    const f = r.feature[i];
    if (f !== lastFeature) {
      out.push(`;TYPE:${FEATURE_NAME[f] ?? 'WALL'}`);
      lastFeature = f;
    }
    const x = xyz[3 * i];
    const y = xyz[3 * i + 1];
    const z = xyz[3 * i + 2];
    const F = Math.round(r.speed[i] * 60);
    const fPart = Math.abs(F - lastF) > F * 0.01 ? ` F${F}` : '';
    if (fPart) lastF = F;
    if (f === FEATURE_TRAVEL) {
      out.push(`G0 X${fmt(x)} Y${fmt(y)} Z${fmt(z)}${fPart}`);
    } else {
      const len = Math.hypot(x - xyz[3 * i - 3], y - xyz[3 * i - 2], z - xyz[3 * i - 1]);
      e += len * ePerMm;
      out.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(z)} E${e.toFixed(4)}${fPart}`);
    }
    if (r.dwell[i] > 0) {
      // stand still and keep pushing clay: extrude the volume the nominal flow delivers in that time
      e += (s.extrusionRate * r.dwell[i]) / filamentArea;
      const eFeed = Math.round((s.extrusionRate / filamentArea) * 60);
      out.push(`G1 E${e.toFixed(4)} F${eFeed} ; blob ${fmt(r.dwell[i])} s`);
      lastF = -1;
    }
  }
  out.push(fill(s.endGcode, vars));
  return out.join('\n') + '\n';
}
