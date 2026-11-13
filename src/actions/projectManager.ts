import { bundleProjects, splitProjects } from '../domain/bundle';
import { readProject, writeProject, type ProjectData } from '../domain/project';
import {
  defaultBackend,
  newestFirst,
  type ProjectBackend,
  type ProjectMeta,
} from '../domain/projectLibrary';
import { capitalize, uniqueName } from '../domain/names';
import { uid } from '../domain/print';
import { ICON_SIZE, validIcon, type ProjectIcon } from '../domain/projectIcon';
import { resolveSliceSettings } from '../domain/profiles';
import { hexRgb, previewRings } from '../core/textures/preview';
import { renderTextureThumb } from '../core/textures/thumb';
import { useAskStore, type ProfileChange, type ProfileChoice } from '../store/askStore';
import { PROFILE_KINDS, planProfile, type ProfileMap } from '../domain/profiles';
import { exportHistory, importHistory, resetHistory } from '../store/historyStore';
import { useImageStore } from '../store/imageStore';
import { useMaskStore } from '../store/maskStore';
import { useModelStore } from '../store/modelStore';
import { UNTITLED, useProjectStore } from '../store/projectStore';
import { activeProfile, useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { safeName, saveBlob } from './files';

/**
 * Ask the browser not to clear this site's storage when space runs low (the projects live in
 * IndexedDB). Chrome decides by itself (installed app, bookmark, use), Firefox asks the person.
 */
let persistAsked = false;
export async function requestPersistence(): Promise<void> {
  try {
    const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!st?.persist) return;
    let ok = st.persisted ? await st.persisted() : false;
    if (!ok && !persistAsked) {
      persistAsked = true;
      ok = await st.persist();
    }
    useProjectStore.getState().setPersisted(ok);
  } catch {
    /* not supported: the note in the project list stays cautious */
  }
}

let backend: ProjectBackend | null = null;
const lib = (): ProjectBackend => (backend ??= defaultBackend());
/** Tests swap the storage. */
export function setProjectBackend(b: ProjectBackend | null): void {
  backend = b;
}

const LAST_KEY = 'clay-slicer-last-project';
const remember = (id: string) => {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* private window: nothing to remember */
  }
};
const lastId = (): string | null => {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};

/** Names of the stored projects other than the open one. */
const otherNames = (): string[] => {
  const { id, library } = useProjectStore.getState();
  return library.filter((m) => m.id !== id).map((m) => m.name);
};

/** The small picture of a project for the list: the model with its textures, shaded like the preview. */
export function renderProjectIcon(p: ProjectData): ProjectIcon | undefined {
  if (!p.raw) return undefined;
  try {
    const textures = p.textures.map((t) => ({
      ...t,
      mask: p.masks[t.id] ?? null,
      image: p.images[t.id] ?? null,
      maskImage: p.images[`${t.id}~mask`] ?? null,
    }));
    const { printer, nozzle, clay } = p.profiles;
    const s = resolveSliceSettings(printer, nozzle, clay, p.print, textures);
    const prev = previewRings(p.raw, s);
    if (!prev) return undefined;
    const rgba = renderTextureThumb(prev.set, textures, {
      width: ICON_SIZE,
      height: ICON_SIZE,
      rowH: prev.rowH,
      lh: s.layerHeight,
      fadeIn: s.textureFadeIn,
      color: hexRgb(clay.color),
    });
    return { width: ICON_SIZE, height: ICON_SIZE, rgba };
  } catch {
    return undefined;
  }
}

/** True while a project is being put into the stores, so that does not count as an edit. */
let loading = false;

/** Everything of the open project, as it would be written to a file. */
export function collectProject(): ProjectData {
  const settings = useSettingsStore.getState();
  const { raw, name: modelName, shape: drawn, source } = useModelStore.getState();
  return {
    name: useProjectStore.getState().name,
    modelName,
    raw,
    shape: source === 'design' ? drawn : null,
    profiles: {
      printer: activeProfile(settings, 'printer'),
      nozzle: activeProfile(settings, 'nozzle'),
      clay: activeProfile(settings, 'clay'),
    },
    print: settings.print,
    textures: settings.textures,
    masks: useMaskStore.getState().masks,
    images: useImageStore.getState().images,
    history: exportHistory(),
  };
}

/** Profiles of a project that this browser does not have yet (or has with other values). */
function profileChanges(p: ProjectData): ProfileChange[] {
  const s = useSettingsStore.getState();
  const out: ProfileChange[] = [];
  for (const kind of PROFILE_KINDS) {
    const list = s.profiles[kind] as ProfileMap[typeof kind][];
    const profile = p.profiles[kind] as ProfileMap[typeof kind];
    const action = planProfile(list, profile);
    if (action.kind !== 'same') out.push({ kind, name: profile.name, action });
  }
  return out;
}

/** Same profiles: nothing to ask. Otherwise let the person decide. */
async function chooseProfiles(p: ProjectData): Promise<ProfileChoice> {
  const changes = profileChanges(p);
  return changes.length ? useAskStore.getState().ask(p.name, changes) : 'import';
}

/** Put a project into the stores (and forget the undo history). */
function applyProject(p: ProjectData, mode: 'import' | 'skip'): void {
  loading = true;
  try {
    useUiStore.getState().setPaintTexture(null);
    useSettingsStore.getState().loadProject(p.profiles, p.print, p.textures, mode);
    useMaskStore.getState().replaceAll(p.masks);
    useImageStore.getState().replaceAll(p.images);
    const model = p.modelName ?? p.name;
    if (p.shape) useModelStore.getState().setShape(p.shape, model);
    else if (p.raw) useModelStore.getState().setModel(p.raw, model);
    else useModelStore.getState().clear();
    resetHistory();
    if (p.history) importHistory(p.history);
  } finally {
    loading = false;
  }
}

// ---- saving ----
let queue: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;

async function refreshLibrary(): Promise<void> {
  try {
    const list = (await lib().list()).map((m) => ({ ...m, icon: validIcon(m.icon) }));
    useProjectStore.getState().setLibrary(list.sort(newestFirst));
  } catch {
    /* the list stays as it was */
  }
}

async function writeCurrent(): Promise<void> {
  const ps = useProjectStore.getState();
  if (!useModelStore.getState().raw) {
    ps.setStatus('empty');
    return;
  }
  ps.setStatus('saving');
  try {
    const project = collectProject();
    const bytes = writeProject(project);
    const meta: ProjectMeta = {
      id: ps.id,
      name: ps.name,
      updatedAt: Date.now(),
      size: bytes.length,
      icon: renderProjectIcon(project),
    };
    await lib().put(meta, bytes);
    remember(ps.id);
    void requestPersistence(); // the first saved project is the reason to ask
    // a change made while writing leaves the project dirty again
    if (useProjectStore.getState().id === ps.id && !timer)
      useProjectStore.getState().setStatus('saved', meta.updatedAt);
    await refreshLibrary();
  } catch {
    useProjectStore.getState().setStatus('error');
  }
}

/** Save the open project now (waits for a save that is already running). */
export function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  queue = queue.then(writeCurrent);
  return queue;
}

function scheduleSave(): void {
  if (loading) return;
  if (useModelStore.getState().raw) useProjectStore.getState().setStatus('dirty');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void saveNow();
  }, 1500);
}

let autosaving = false;
/** Save on every change, after a short pause. Call once at startup. */
export function startAutosave(): void {
  if (autosaving) return;
  autosaving = true;
  useSettingsStore.subscribe(scheduleSave);
  useMaskStore.subscribe(scheduleSave);
  useImageStore.subscribe(scheduleSave);
  useModelStore.subscribe((s, p) => {
    if (loading) return;
    const ps = useProjectStore.getState();
    // until the person names the project, it carries the name of its model
    if (ps.autoNamed && s.raw) {
      const wanted = uniqueName(capitalize(s.name), otherNames());
      if (wanted !== ps.name) ps.setName(wanted, true);
    }
    if (s.raw !== p.raw || s.shape !== p.shape) scheduleSave();
  });
  useProjectStore.subscribe((s, p) => {
    if (s.name !== p.name && s.id === p.id) scheduleSave();
  });
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

// ---- opening, creating ----

/** Save what is open, so switching to another project loses nothing. */
const flush = () =>
  // only when something changed since the last save, so opening a project never makes it "newer"
  useModelStore.getState().raw && useProjectStore.getState().status !== 'saved'
    ? saveNow()
    : Promise.resolve();

/** Replace what is open by an empty project (nothing is saved here). */
function startEmptyProject(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  loading = true;
  try {
    useProjectStore.getState().begin(
      uniqueName(
        UNTITLED,
        useProjectStore.getState().library.map((m) => m.name),
      ),
      true,
    );
    useUiStore.getState().setPaintTexture(null);
    useSettingsStore.setState({ textures: [] });
    useMaskStore.getState().replaceAll({});
    useImageStore.getState().replaceAll({});
    useModelStore.getState().clear();
    resetHistory();
  } finally {
    loading = false;
  }
  remember(useProjectStore.getState().id);
}

/** A new empty project. The old one is saved first; printer, nozzle, clay and print settings carry over. */
export async function newProject(): Promise<void> {
  await flush();
  startEmptyProject();
}

/** Open a project kept in this browser. The open one is saved first. */
export async function openStoredProject(id: string): Promise<void> {
  const { setError } = useModelStore.getState();
  try {
    const bytes = await lib().get(id);
    if (!bytes) throw new Error('The project is no longer stored in this browser.');
    const p = readProject(bytes);
    const choice = await chooseProfiles(p);
    if (choice === 'cancel') return;
    await flush();
    useProjectStore.getState().begin(p.name, false, id);
    applyProject(p, choice);
    useProjectStore
      .getState()
      .setStatus('saved', useProjectStore.getState().library.find((m) => m.id === id)?.updatedAt);
    remember(id);
  } catch (err) {
    setError(`Could not open project: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Open a project file as a new project in the library. */
export async function openProjectFile(file: File): Promise<void> {
  const { setError } = useModelStore.getState();
  try {
    const p = readProject(new Uint8Array(await file.arrayBuffer()));
    const choice = await chooseProfiles(p);
    if (choice === 'cancel') return;
    await flush();
    useProjectStore.getState().begin(
      uniqueName(
        p.name,
        useProjectStore.getState().library.map((m) => m.name),
      ),
      false,
    );
    applyProject(p, choice);
    await saveNow();
  } catch (err) {
    setError(`Could not open project: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function deleteStoredProject(id: string): Promise<void> {
  const open = useProjectStore.getState().id === id;
  if (open) {
    // the open project is gone: drop pending saves and go back to the empty start screen,
    // otherwise the next save (or switching projects) would write it back
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await queue;
  }
  await lib().remove(id);
  if (open) startEmptyProject();
  await refreshLibrary();
}

export async function downloadStoredProject(id: string): Promise<void> {
  const bytes = await lib().get(id);
  const meta = useProjectStore.getState().library.find((m) => m.id === id);
  if (bytes && meta)
    saveBlob(
      bytes as Uint8Array<ArrayBuffer>,
      `${safeName(meta.name)}.clayproject.zip`,
      'application/zip',
    );
}

/** At startup: list the library and reopen the project that was open last. */
export async function restoreLastProject(): Promise<void> {
  await refreshLibrary();
  if (useProjectStore.getState().library.length) void requestPersistence();
  const id = lastId();
  if (
    id &&
    useProjectStore.getState().library.some((m) => m.id === id) &&
    !useModelStore.getState().raw
  )
    await openStoredProject(id);
}

// ---- downloads ----

export function downloadProject(): void {
  const name = useProjectStore.getState().name;
  saveBlob(
    writeProject(collectProject()) as Uint8Array<ArrayBuffer>,
    `${safeName(name)}.clayproject.zip`,
    'application/zip',
  );
}

/** Every project kept in this browser as one zip. */
export async function downloadAllProjects(): Promise<void> {
  await flush();
  const items: { name: string; bytes: Uint8Array }[] = [];
  for (const m of useProjectStore.getState().library) {
    const bytes = await lib().get(m.id);
    if (bytes) items.push({ name: safeName(m.name), bytes });
  }
  if (!items.length) return;
  saveBlob(
    bundleProjects(items) as Uint8Array<ArrayBuffer>,
    'clay-projects.zip',
    'application/zip',
  );
}

/**
 * Add project files (single projects, or bundles from "download all projects") to this browser's
 * list without opening them. Returns how many were added.
 */
export async function uploadProjects(files: File[]): Promise<number> {
  let added = 0;
  const taken: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      const parts = splitProjects(new Uint8Array(await file.arrayBuffer()));
      if (!parts.length) throw new Error('no project inside');
      for (const part of parts) {
        const p = readProject(part);
        const name = uniqueName(p.name, [
          ...useProjectStore.getState().library.map((m) => m.name),
          ...taken,
        ]);
        taken.push(name);
        const bytes = name === p.name ? part : writeProject({ ...p, name });
        const icon = renderProjectIcon(p);
        await lib().put(
          { id: uid(), name, updatedAt: Date.now(), size: bytes.length, icon },
          bytes,
        );
        added++;
      }
    } catch {
      failed.push(file.name);
    }
  }
  await refreshLibrary();
  if (failed.length) useModelStore.getState().setError(`Could not add: ${failed.join(', ')}`);
  return added;
}

/** Fix the open project's name once typing is done: not empty, and not the name of another project. */
export function commitProjectName(): void {
  const ps = useProjectStore.getState();
  const wanted = uniqueName(ps.name.trim() || UNTITLED, otherNames());
  if (wanted !== ps.name) ps.setName(wanted, ps.autoNamed && !ps.name.trim());
}

/** A copy of a stored project under a new name; it is not opened. */
export async function duplicateStoredProject(id: string): Promise<void> {
  if (id === useProjectStore.getState().id) await flush();
  const bytes = await lib().get(id);
  const meta = useProjectStore.getState().library.find((m) => m.id === id);
  if (!bytes || !meta) return;
  const p = readProject(bytes);
  const name = uniqueName(
    `${p.name} copy`,
    useProjectStore.getState().library.map((m) => m.name),
  );
  const copy = writeProject({ ...p, name });
  await lib().put({ ...meta, id: uid(), name, updatedAt: Date.now(), size: copy.length }, copy);
  await refreshLibrary();
}
