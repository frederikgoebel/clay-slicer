import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { parseStl, writeStl } from '../core/io/stl';
import { coerceShape, type ShapeSpec } from '../core/shape/shape';
import { MASK_H, MASK_W } from '../core/textures/mask';
import type { Mask, TextureLayer } from '../core/types';
import type { SavedHistory } from './history';
import { DEFAULT_PRINT, newTexture, type PrintSettings } from './print';
import { coerceProfile, PROFILE_KINDS, type ProfileKind, type ProfileMap } from './profiles';

export const PROJECT_FORMAT = 'clay-slicer-project';

/** Everything that defines a print, independent of any UI state. */
export interface ProjectData {
  /** the project's name (file name, G-code name, title bar) */
  name: string;
  /** name of the model inside it; older files have none and use `name` */
  modelName?: string;
  raw: Float32Array | null;
  /** set when the model was drawn with the shape tool (raw is then just its mesh) */
  shape: ShapeSpec | null;
  /** The three active profiles (embedded in full so the project is self-contained). */
  profiles: { [K in ProfileKind]: ProfileMap[K] };
  print: PrintSettings;
  textures: TextureLayer[];
  masks: Record<string, Mask>;
  /** decal images by texture id, and mask pictures by `<id>~mask` */
  images: Record<string, Mask>;
  /** the undo history, when the file has one */
  history?: SavedHistory;
}

interface ProjectJson {
  format: typeof PROJECT_FORMAT;
  version: 1;
  name: string;
  modelName?: string;
  shape?: ShapeSpec;
  profiles: Record<ProfileKind, unknown>;
  print: PrintSettings;
  textures: TextureLayer[];
}

/** Pack a project into a zip: project.json, model.stl, masks/<textureId>.bin, profiles/*.json. */
export function writeProject(p: ProjectData): Uint8Array {
  const json: ProjectJson = {
    format: PROJECT_FORMAT,
    version: 1,
    name: p.name,
    ...(p.modelName ? { modelName: p.modelName } : {}),
    ...(p.shape ? { shape: p.shape } : {}),
    profiles: p.profiles,
    print: p.print,
    textures: p.textures,
  };
  const files: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify(json, null, 2)),
  };
  if (p.raw) files['model.stl'] = new Uint8Array(writeStl(p.raw));
  for (const kind of PROFILE_KINDS)
    files[`profiles/${kind}-${p.profiles[kind].id}.json`] = strToU8(
      JSON.stringify(p.profiles[kind], null, 2),
    );
  for (const t of p.textures) {
    const m = p.masks[t.id];
    if (m) files[`masks/${t.id}.bin`] = m.data;
  }
  for (const t of p.textures) {
    // decals/<id>.bin and maskimages/<id>.bin: width and height as uint16 LE, then the grayscale bytes
    for (const [key, dir] of [
      [t.id, 'decals'],
      [`${t.id}~mask`, 'maskimages'],
    ] as const) {
      const im = p.images[key];
      if (!im) continue;
      const buf = new Uint8Array(4 + im.data.length);
      new DataView(buf.buffer).setUint16(0, im.width, true);
      new DataView(buf.buffer).setUint16(2, im.height, true);
      buf.set(im.data, 4);
      files[`${dir}/${t.id}.bin`] = buf;
    }
  }
  if (p.history) {
    files['history.json'] = strToU8(JSON.stringify(p.history.json));
    p.history.blobs.forEach((b, i) => (files[`history/${i}.bin`] = b));
  }
  return zipSync(files, { level: 6 });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Read a project zip. Throws a readable error for anything that is not one. */
export function readProject(bytes: Uint8Array): ProjectData {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('Not a valid zip file.');
  }
  if (!files['project.json']) throw new Error('Not a Clay Slicer project (project.json missing).');
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(files['project.json']));
  } catch {
    throw new Error('project.json is damaged.');
  }
  if (!isObj(json) || json.format !== PROJECT_FORMAT) throw new Error('Not a Clay Slicer project.');

  const src = isObj(json.profiles) ? json.profiles : {};
  const profiles = {
    printer: coerceProfile('printer', src.printer),
    nozzle: coerceProfile('nozzle', src.nozzle),
    clay: coerceProfile('clay', src.clay),
  };
  // keep the stored ids so selecting the embedded profiles after import is deterministic
  for (const kind of PROFILE_KINDS) {
    const id = isObj(src[kind]) ? (src[kind] as Record<string, unknown>).id : undefined;
    if (typeof id === 'string') profiles[kind].id = id;
  }
  const textures = (Array.isArray(json.textures) ? (json.textures as TextureLayer[]) : []).map(
    (t) => ({ ...newTexture(t.type), ...t }),
  );
  const masks: Record<string, Mask> = {};
  for (const t of textures) {
    const d = files[`masks/${t.id}.bin`];
    if (d && d.length === MASK_W * MASK_H)
      masks[t.id] = { width: MASK_W, height: MASK_H, data: Uint8Array.from(d) };
  }
  return {
    images: readImages(files, textures),
    shape: isObj(json.shape) ? coerceShape(json.shape) : null,
    name: typeof json.name === 'string' ? json.name : 'project',
    modelName: typeof json.modelName === 'string' ? json.modelName : undefined,
    raw: files['model.stl'] ? parseStl(files['model.stl'].slice().buffer) : null,
    profiles,
    print: {
      ...DEFAULT_PRINT,
      ...(isObj(json.print) ? (json.print as Partial<PrintSettings>) : {}),
    },
    textures,
    masks,
    history: readHistory(files),
  };
}

function readHistory(files: Record<string, Uint8Array>): SavedHistory | undefined {
  if (!files['history.json']) return undefined;
  try {
    const blobs: Uint8Array[] = [];
    for (let i = 0; files[`history/${i}.bin`]; i++) blobs.push(files[`history/${i}.bin`]);
    return { json: JSON.parse(strFromU8(files['history.json'])), blobs };
  } catch {
    return undefined;
  }
}

function readImages(
  files: Record<string, Uint8Array>,
  textures: TextureLayer[],
): Record<string, Mask> {
  const images: Record<string, Mask> = {};
  for (const t of textures)
    for (const [key, dir] of [
      [t.id, 'decals'],
      [`${t.id}~mask`, 'maskimages'],
    ] as const) {
      const d = files[`${dir}/${t.id}.bin`];
      if (!d || d.length < 5) continue;
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      const w = dv.getUint16(0, true);
      const h = dv.getUint16(2, true);
      if (w > 0 && h > 0 && d.length === 4 + w * h)
        images[key] = { width: w, height: h, data: Uint8Array.from(d.subarray(4)) };
    }
  return images;
}
