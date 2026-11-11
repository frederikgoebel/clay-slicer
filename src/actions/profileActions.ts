import { exportProfiles, parseProfiles } from '../domain/profileIO';
import { PROFILE_KINDS, type ProfileKind } from '../domain/profiles';
import { activeProfile, useSettingsStore } from '../store/settingsStore';
import { useImageStore } from '../store/imageStore';
import { useMaskStore } from '../store/maskStore';
import { useModelStore } from '../store/modelStore';
import { safeName, saveBlob } from './files';

const JSON_TYPE = 'application/json';

/** Download the active profile of one kind. */
export function exportActiveProfile(kind: ProfileKind): void {
  const p = activeProfile(useSettingsStore.getState(), kind);
  saveBlob(exportProfiles({ [kind]: [p] }), `${kind}-${safeName(p.name)}.json`, JSON_TYPE);
}

/** Download all of the user's own profiles (built-ins ship with the app). */
export function exportAllProfiles(): void {
  const { profiles } = useSettingsStore.getState();
  const own = Object.fromEntries(
    PROFILE_KINDS.map((k) => [k, profiles[k].filter((p) => !p.builtin)]),
  );
  saveBlob(exportProfiles(own), 'clay-slicer-profiles.json', JSON_TYPE);
}

/** Import a profile file; the first imported profile of each kind becomes active. */
export async function importProfileFile(file: File): Promise<string> {
  try {
    const incoming = parseProfiles(await file.text());
    const maps = useSettingsStore.getState().importProfiles(incoming);
    let count = 0;
    for (const kind of PROFILE_KINDS) {
      const first = incoming[kind]?.[0];
      count += incoming[kind]?.length ?? 0;
      if (first && maps[kind])
        useSettingsStore.getState().selectProfile(kind, maps[kind][first.id]);
    }
    return count
      ? `Imported ${count} profile${count === 1 ? '' : 's'}.`
      : 'No profiles in that file.';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export const modelName = () => useModelStore.getState().name;

/** Back to a fresh setup: profiles, print settings, textures and their masks / decals. */
export function resetEverything(): void {
  const { textures, resetAll } = useSettingsStore.getState();
  for (const tex of textures) {
    useMaskStore.getState().clear(tex.id);
    useImageStore.getState().remove(tex.id);
    useImageStore.getState().remove(`${tex.id}~mask`);
  }
  resetAll();
}
