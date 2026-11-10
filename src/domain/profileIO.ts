import {
  coerceProfile,
  PROFILE_KINDS,
  type ProfileKind,
  type ProfileLists,
  type ProfileMap,
} from './profiles';

export const PROFILE_FORMAT = 'clay-slicer-profiles';

export interface ProfileFile {
  format: typeof PROFILE_FORMAT;
  version: 1;
  profiles: Partial<{ [K in ProfileKind]: ProfileMap[K][] }>;
}

/** Serialise profiles (any mix of kinds) to a JSON string. */
export function exportProfiles(profiles: ProfileFile['profiles']): string {
  const file: ProfileFile = { format: PROFILE_FORMAT, version: 1, profiles };
  return JSON.stringify(file, null, 2);
}

/** Parse and validate a profile file. Throws a readable error when it is not one. */
export function parseProfiles(text: string): Partial<ProfileLists> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const file = raw as Partial<ProfileFile> | null;
  if (
    !file ||
    file.format !== PROFILE_FORMAT ||
    typeof file.profiles !== 'object' ||
    !file.profiles
  )
    throw new Error('Not a Clay Slicer profile file.');
  const out: Partial<ProfileLists> = {};
  for (const kind of PROFILE_KINDS) {
    const list = (file.profiles as Record<string, unknown>)[kind];
    if (Array.isArray(list))
      (out[kind] as ProfileMap[typeof kind][]) = list.map((p) => coerceProfile(kind, p));
  }
  return out;
}
