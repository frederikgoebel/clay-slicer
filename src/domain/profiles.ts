import { cm3MinToMm3S } from '../core/toolpath/bead';
import type { MeshTransform, SliceSettings, TextureLayer } from '../core/types';
import { uid, type PrintSettings } from './print';

/**
 * A print setup is three independent profiles plus per-print settings:
 *   printer profile  - machine, extruder and G-code
 *   nozzle profile   - nozzle diameter, layer height and the extrusion rate through it
 *   clay profile     - clay body behaviour: speed, flow factor, shrinkage, limits
 * The bead (line) width is not stored anywhere: it is calculated from extrusion rate,
 * speed and layer height. Built-in profiles are read-only starting points; editing one
 * forks a user copy.
 */
export type ProfileKind = 'printer' | 'nozzle' | 'clay';

interface ProfileBase {
  id: string;
  name: string;
  builtin: boolean;
}

export interface PrinterProfile extends ProfileBase {
  buildDiameter: number;
  buildHeight: number;
  travelSpeed: number;
  /** 0..100 % */
  flowFollowsSpeedPct: number;
  eDia: number;
  primeE: number;
  startDwell: number;
  tankCm3: number;
  startGcode: string;
  endGcode: string;
}

export interface NozzleProfile extends ProfileBase {
  diameter: number;
  layerHeight: number;
  /** clay leaving the nozzle at the clay profile's print speed, cm³/min */
  extrusionRate: number;
}

export interface ClayProfile extends ProfileBase {
  /** display colour (#rrggbb): shown in the profile lists and on the model / print preview */
  color: string;
  printSpeed: number;
  /** multiplier on the nozzle's extrusion rate (stiffer/softer clay), % */
  flow: number;
  minLayerTime: number;
  density: number;
  waterPct: number;
  shrinkagePct: number;
  overhangMax: number;
}

export interface ProfileMap {
  printer: PrinterProfile;
  nozzle: NozzleProfile;
  clay: ClayProfile;
}

export type ProfileLists = { [K in ProfileKind]: ProfileMap[K][] };

export const PROFILE_KINDS: ProfileKind[] = ['printer', 'nozzle', 'clay'];

const START_GCODE = 'G21 ; mm\nG90 ; absolute XYZ\nM82 ; absolute extrusion\nG28 ; home\nG92 E0';
const END_GCODE = 'G91\nG1 Z10 F1500\nG90\nM84';
const WASP_END_GCODE = 'G28 X0 Y0 ; MOVE TO ORIGIN (HOME)';

const printer = (p: Omit<PrinterProfile, 'builtin'>): PrinterProfile => ({ ...p, builtin: true });
const nozzle = (p: Omit<NozzleProfile, 'builtin'>): NozzleProfile => ({ ...p, builtin: true });
const clay = (p: Omit<ClayProfile, 'builtin'>): ClayProfile => ({ ...p, builtin: true });

const PRINTER_BASE = {
  travelSpeed: 100,
  flowFollowsSpeedPct: 25,
  eDia: 4.5,
  primeE: 0,
  startDwell: 0,
  startGcode: START_GCODE,
  endGcode: END_GCODE,
};

/** Values are starting points: verify against your machine and calibrate on real prints. */
export const BUILTIN_PROFILES: ProfileLists = {
  printer: [
    printer({
      ...PRINTER_BASE,
      id: 'printer-wasp-4070',
      endGcode: WASP_END_GCODE,
      name: 'WASP Delta 4070 Pro Clay',
      buildDiameter: 400,
      buildHeight: 800,
      tankCm3: 3000,
    }),
    printer({
      ...PRINTER_BASE,
      id: 'printer-wasp-2040',
      endGcode: WASP_END_GCODE,
      name: 'WASP Delta 2040 Clay',
      buildDiameter: 200,
      buildHeight: 400,
      tankCm3: 3000,
    }),
    printer({
      ...PRINTER_BASE,
      id: 'printer-wasp-40100',
      endGcode: WASP_END_GCODE,
      name: 'WASP Delta 40100 Clay',
      buildDiameter: 400,
      buildHeight: 1000,
      tankCm3: 10000,
    }),
    printer({
      ...PRINTER_BASE,
      id: 'printer-generic',
      name: 'Generic clay delta',
      buildDiameter: 200,
      buildHeight: 300,
      tankCm3: 2000,
    }),
  ],
  // rates chosen so that, at 35 mm/s, the calculated bead is about 1.15-1.9x the layer height
  nozzle: [
    nozzle({ id: 'nozzle-2', name: '2 mm', diameter: 2, layerHeight: 1, extrusionRate: 4.4 }),
    nozzle({ id: 'nozzle-3', name: '3 mm', diameter: 3, layerHeight: 1.8, extrusionRate: 11.8 }),
    nozzle({ id: 'nozzle-4', name: '4 mm', diameter: 4, layerHeight: 2.4, extrusionRate: 20.5 }),
    nozzle({ id: 'nozzle-6', name: '6 mm', diameter: 6, layerHeight: 3.6, extrusionRate: 45.5 }),
  ],
  clay: [
    clay({
      id: 'clay-stoneware',
      color: '#a8957f',
      name: 'Stoneware',
      printSpeed: 35,
      flow: 100,
      minLayerTime: 0,
      density: 1.9,
      waterPct: 20,
      shrinkagePct: 12,
      overhangMax: 40,
    }),
  ],
};

export const DEFAULT_SELECTION: Record<ProfileKind, string> = {
  printer: 'printer-wasp-4070',
  nozzle: 'nozzle-2',
  clay: 'clay-stoneware',
};

/** Flatten the active profiles + print settings into what the slicing core needs. */
export function resolveSliceSettings(
  printer: PrinterProfile,
  nozzle: NozzleProfile,
  clay: ClayProfile,
  print: PrintSettings,
  textures: TextureLayer[],
): SliceSettings {
  return {
    buildDiameter: printer.buildDiameter,
    buildHeight: printer.buildHeight,
    travelSpeed: printer.travelSpeed,
    flowFollowsSpeed: printer.flowFollowsSpeedPct / 100,
    eDia: printer.eDia,
    primeE: printer.primeE,
    startDwell: printer.startDwell,
    tankCm3: printer.tankCm3,
    startGcode: printer.startGcode,
    endGcode: printer.endGcode,
    nozzle: nozzle.diameter,
    layerHeight: nozzle.layerHeight,
    extrusionRate: cm3MinToMm3S(nozzle.extrusionRate * (clay.flow / 100)),
    printSpeed: clay.printSpeed,
    minLayerTime: clay.minLayerTime,
    density: clay.density,
    waterPct: clay.waterPct,
    overhangMax: clay.overhangMax,
    mode: print.mode,
    segLen: print.segLen,
    seamAngle: print.seamAngle,
    topFinish: print.topFinish,
    topCurves: print.topCurves,
    topAngle: print.topAngle,
    wallCount: print.wallCount,
    infillDensity: print.infillDensity,
    infillPattern: print.infillPattern,
    infillAngle: print.infillAngle,
    solidTop: print.solidTop,
    retractDistance: print.retractDistance,
    retractSpeed: print.retractSpeed,
    zHop: print.zHop,
    floorLayers: print.floorLayers,
    floorSpacingPct: print.floorSpacingPct,
    floorBelow: print.floorBelow,
    pauseAfterFloor: print.pauseAfterFloor,
    pauseSeconds: print.pauseSeconds,
    pauseLift: print.pauseLift,
    floorPattern: print.floorPattern,
    floorAngle: print.floorAngle,
    textureFadeIn: print.textureFadeIn,
    textures,
  };
}

export function meshTransform(print: PrintSettings, clay: ClayProfile): MeshTransform {
  return {
    scalePct: print.scalePct,
    rotX: print.rotX,
    rotY: print.rotY,
    rotZ: print.rotZ,
    shrinkagePct: clay.shrinkagePct,
  };
}

export const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * Make an untrusted object (imported file) into a valid profile of the given kind:
 * every field falls back to the built-in default when missing or of the wrong type.
 */
export function coerceProfile<K extends ProfileKind>(kind: K, raw: unknown): ProfileMap[K] {
  const base = BUILTIN_PROFILES[kind][0] as ProfileMap[K];
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [key, def] of Object.entries(base)) {
    const v = src[key];
    if (typeof v === typeof def && (typeof v !== 'number' || Number.isFinite(v))) out[key] = v;
  }
  out.builtin = false;
  if (kind === 'clay' && !isHexColor(out.color)) out.color = (base as ClayProfile).color;
  if (typeof out.id !== 'string' || !out.id || src.id === undefined) out.id = uid();
  if (!(out.name as string).trim()) out.name = 'Imported profile';
  return out as unknown as ProfileMap[K];
}

const sameValues = (a: object, b: object) =>
  JSON.stringify({ ...a, builtin: false }) === JSON.stringify({ ...b, builtin: false });

/**
 * Add imported profiles to an existing list. A profile whose id and values already exist is
 * reused; one whose id exists with different values gets a new id so nothing is overwritten.
 * Returns the new list and a map from imported id to the id to use.
 */
export function mergeProfiles<K extends ProfileKind>(
  existing: ProfileMap[K][],
  incoming: ProfileMap[K][],
): { list: ProfileMap[K][]; idMap: Record<string, string> } {
  const list = [...existing];
  const idMap: Record<string, string> = {};
  for (const p of incoming) {
    const clash = list.find((e) => e.id === p.id);
    if (clash && sameValues(clash, p)) {
      idMap[p.id] = clash.id;
    } else if (clash) {
      const copy = { ...p, id: uid(), builtin: false, name: `${p.name} (imported)` };
      list.push(copy);
      idMap[p.id] = copy.id;
    } else {
      list.push({ ...p, builtin: false });
      idMap[p.id] = p.id;
    }
  }
  return { list, idMap };
}

/** What opening a project does with one of its profiles. */
export type ProfileAction =
  /** this profile is already in the list: nothing to do, just use it */
  | { kind: 'same'; id: string }
  /** a new profile: add it */
  | { kind: 'add' }
  /** a profile of the same name with other values: overwrite it */
  | { kind: 'replace'; id: string };

export function planProfile<K extends ProfileKind>(
  existing: ProfileMap[K][],
  p: ProfileMap[K],
): ProfileAction {
  const same = existing.find((e) => e.id === p.id && sameValues(e, p));
  if (same) return { kind: 'same', id: same.id };
  const twin = existing.find((e) => e.name === p.name && sameValues({ ...e, id: p.id }, p));
  if (twin) return { kind: 'same', id: twin.id };
  // built-in profiles are never overwritten
  const named = existing.find((e) => e.name === p.name && !e.builtin);
  if (named) return { kind: 'replace', id: named.id };
  return { kind: 'add' };
}

/** Carry out a plan: the new list and the id of the profile the project should use. */
export function applyProfilePlan<K extends ProfileKind>(
  existing: ProfileMap[K][],
  p: ProfileMap[K],
  action: ProfileAction,
): { list: ProfileMap[K][]; id: string } {
  if (action.kind === 'same') return { list: existing, id: action.id };
  if (action.kind === 'replace')
    return {
      list: existing.map((e) => (e.id === action.id ? { ...p, id: e.id, builtin: false } : e)),
      id: action.id,
    };
  const taken = existing.some((e) => e.id === p.id);
  const nameTaken = existing.some((e) => e.name === p.name);
  const copy = {
    ...p,
    id: taken ? uid() : p.id,
    builtin: false,
    name: nameTaken ? `${p.name} (project)` : p.name,
  };
  return { list: [...existing, copy], id: copy.id };
}
