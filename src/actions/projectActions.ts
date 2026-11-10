import { readProject, writeProject } from '../domain/project';
import { activeProfile, useSettingsStore } from '../store/settingsStore';
import { useImageStore } from '../store/imageStore';
import { useMaskStore } from '../store/maskStore';
import { useModelStore } from '../store/modelStore';
import { useUiStore } from '../store/uiStore';
import { loadStlFile } from './modelActions';
import { safeName, saveBlob } from './files';

/** Save model, active profiles, print settings, textures and painted masks as one zip. */
export function saveProject(): void {
  const settings = useSettingsStore.getState();
  const { raw, name, shape: drawn, source } = useModelStore.getState();
  const shape = source === 'design' ? drawn : null;
  const bytes = writeProject({
    name,
    raw,
    shape,
    profiles: {
      printer: activeProfile(settings, 'printer'),
      nozzle: activeProfile(settings, 'nozzle'),
      clay: activeProfile(settings, 'clay'),
    },
    print: settings.print,
    textures: settings.textures,
    masks: useMaskStore.getState().masks,
    images: useImageStore.getState().images,
  });
  saveBlob(
    bytes as Uint8Array<ArrayBuffer>,
    `${safeName(name)}.clayproject.zip`,
    'application/zip',
  );
}

export async function loadProjectFile(file: File): Promise<void> {
  const { setModel, setError } = useModelStore.getState();
  try {
    const p = readProject(new Uint8Array(await file.arrayBuffer()));
    useUiStore.getState().setPaintTexture(null);
    useSettingsStore.getState().loadProject(p.profiles, p.print, p.textures);
    useMaskStore.getState().replaceAll(p.masks);
    useImageStore.getState().replaceAll(p.images);
    if (p.shape) useModelStore.getState().setShape(p.shape, p.name);
    else if (p.raw) setModel(p.raw, p.name);
  } catch (err) {
    setError(`Could not open project: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Open an STL or a project zip, decided by the file name. */
export async function openFile(file: File): Promise<void> {
  if (/\.zip$/i.test(file.name)) await loadProjectFile(file);
  else await loadStlFile(file);
}
