import { unzipSync, zipSync, strToU8 } from 'fflate';

export interface BundleInput {
  /** file name stem, already safe for a file system */
  stem: string;
  /** the project zip */
  project: Uint8Array;
  gcode: string | null;
  /** the model as a binary STL */
  stl: Uint8Array | null;
}

/** "Download all": project file, G-code and STL in one zip (stored, since the parts are compressed or text). */
export function buildBundle(b: BundleInput): Uint8Array {
  const files: Record<string, Uint8Array> = { [`${b.stem}.clayproject.zip`]: b.project };
  if (b.gcode) files[`${b.stem}.gcode`] = strToU8(b.gcode);
  if (b.stl) files[`${b.stem}.stl`] = b.stl;
  return zipSync(files, { level: 1 });
}

/** Every stored project in one zip, one `<name>.clayproject.zip` each (names made unique). */
export function bundleProjects(items: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const it of items) {
    let file = `${it.name}.clayproject.zip`;
    for (let n = 2; files[file]; n++) file = `${it.name}-${n}.clayproject.zip`;
    files[file] = it.bytes;
  }
  return zipSync(files, { level: 0 });
}

/**
 * The project files in an uploaded zip: the zip itself when it is a project, otherwise every
 * project zip inside it (a bundle from "download all projects", or "download all" of one project).
 * Returns an empty list when it is neither.
 */
export function splitProjects(bytes: Uint8Array): Uint8Array[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return [];
  }
  if (files['project.json']) return [bytes];
  return Object.entries(files)
    .filter(([name]) => /\.clayproject\.zip$/i.test(name))
    .map(([, b]) => b);
}
