import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteStoredProject,
  duplicateStoredProject,
  newProject,
  openStoredProject,
  saveNow,
  setProjectBackend,
} from '../src/actions/projectManager';
import { buildBundle, bundleProjects, splitProjects } from '../src/domain/bundle';
import { BUILTIN_PROFILES } from '../src/domain/profiles';
import { DEFAULT_PRINT } from '../src/domain/print';
import { writeProject } from '../src/domain/project';
import { newTexture } from '../src/domain/print';
import { memoryBackend } from '../src/domain/projectLibrary';
import { useAskStore } from '../src/store/askStore';
import { useImageStore } from '../src/store/imageStore';
import { useMaskStore } from '../src/store/maskStore';
import { useModelStore } from '../src/store/modelStore';
import { UNTITLED, useProjectStore } from '../src/store/projectStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { cylinder } from './helpers';

beforeEach(async () => {
  useModelStore.getState().clear(); // nothing left over from the previous test gets saved
  setProjectBackend(memoryBackend());
  useProjectStore.setState({ library: [] });
  await newProject();
});

const lib = () => useProjectStore.getState().library;

describe('projects in the browser', () => {
  it('saves a project with a model and lists it', async () => {
    await saveNow();
    expect(lib()).toHaveLength(0); // nothing to save yet
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    useProjectStore.getState().setName('My vase');
    await saveNow();
    expect(lib().map((m) => m.name)).toEqual(['My vase']);
    expect(useProjectStore.getState().status).toBe('saved');
  });

  it('new project saves the old one and starts empty, keeping print settings', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    useProjectStore.getState().setName('First');
    useSettingsStore.getState().setPrint({ wallCount: 3 });
    useSettingsStore.setState({ textures: [newTexture('ribs')] });
    const firstId = useProjectStore.getState().id;
    await newProject();
    expect(lib().map((m) => m.id)).toEqual([firstId]);
    expect(useProjectStore.getState().id).not.toBe(firstId);
    expect(useProjectStore.getState().name).toBe(UNTITLED);
    expect(useModelStore.getState().raw).toBeNull();
    expect(useSettingsStore.getState().textures).toHaveLength(0);
    expect(useSettingsStore.getState().print.wallCount).toBe(3);
  });

  it('opens a stored project without asking when its profiles are the same', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    useProjectStore.getState().setName('Vase');
    useSettingsStore.getState().setPrint({ wallCount: 4 });
    useSettingsStore.setState({ textures: [newTexture('ribs')] });
    const id = useProjectStore.getState().id;
    await newProject();
    useSettingsStore.getState().setPrint({ wallCount: 2 });
    await openStoredProject(id);
    expect(useAskStore.getState().pending).toBeNull();
    expect(useProjectStore.getState().id).toBe(id);
    expect(useSettingsStore.getState().print.wallCount).toBe(4);
    expect(useSettingsStore.getState().textures).toHaveLength(1);
    expect(useModelStore.getState().raw).not.toBeNull();
  });

  it('asks about profiles that differ: add new ones, replace same-named ones, or keep mine', async () => {
    const own = {
      ...BUILTIN_PROFILES.clay[0],
      id: 'mine',
      name: 'My clay',
      builtin: false,
      shrinkagePct: 6,
    };
    useSettingsStore.setState((s) => ({
      profiles: { ...s.profiles, clay: [...BUILTIN_PROFILES.clay, own] },
      selected: { ...s.selected, clay: 'mine' },
    }));
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    const id = useProjectStore.getState().id;
    await saveNow();
    const open = async (answer: 'import' | 'skip' | 'cancel') => {
      useModelStore.getState().clear(); // another project is open (nothing is saved over the stored one)
      await newProject();
      const p = openStoredProject(id);
      await vi.waitFor(() => expect(useAskStore.getState().pending).not.toBeNull());
      const changes = useAskStore.getState().pending!.changes;
      useAskStore.getState().answer(answer);
      await p;
      return changes;
    };
    // the user changes their clay of that name afterwards; the project still has the old values
    const edited = { ...own, shrinkagePct: 9 };
    useSettingsStore.setState((s) => ({
      profiles: { ...s.profiles, clay: [...BUILTIN_PROFILES.clay, edited] },
    }));
    const changes = await open('cancel');
    expect(changes.map((c) => [c.kind, c.action.kind])).toEqual([['clay', 'replace']]);
    expect(
      useSettingsStore.getState().profiles.clay.find((c) => c.id === 'mine')?.shrinkagePct,
    ).toBe(9);
    await open('skip');
    expect(
      useSettingsStore.getState().profiles.clay.find((c) => c.id === 'mine')?.shrinkagePct,
    ).toBe(9);
    await open('import');
    expect(
      useSettingsStore.getState().profiles.clay.find((c) => c.id === 'mine')?.shrinkagePct,
    ).toBe(6);
    expect(useSettingsStore.getState().selected.clay).toBe('mine');
    // a profile the browser has never seen is added
    useSettingsStore.setState((s) => ({
      profiles: { ...s.profiles, clay: BUILTIN_PROFILES.clay.slice() },
      selected: { ...s.selected, clay: BUILTIN_PROFILES.clay[0].id },
    }));
    const added = await open('import');
    expect(added.map((c) => [c.kind, c.action.kind])).toEqual([['clay', 'add']]);
    expect(useSettingsStore.getState().profiles.clay.some((c) => c.name === 'My clay')).toBe(true);
  });

  it('keeps masks and images with their project, and deletes', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    const tex = newTexture('ribs');
    useSettingsStore.setState({ textures: [tex] });
    useMaskStore.getState().ensure(tex.id, 0).data[5] = 99;
    const id = useProjectStore.getState().id;
    await saveNow();
    await newProject();
    expect(Object.keys(useMaskStore.getState().masks)).toHaveLength(0);
    expect(Object.keys(useImageStore.getState().images)).toHaveLength(0);
    await openStoredProject(id);
    expect(useMaskStore.getState().masks[tex.id].data[5]).toBe(99);
    await deleteStoredProject(id);
    expect(lib()).toHaveLength(0);
  });
});

describe('deleting projects', () => {
  it('deleting another project and opening a third one does not bring it back', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'a');
    useProjectStore.getState().setName('A');
    const a = useProjectStore.getState().id;
    await newProject();
    useModelStore.getState().setModel(cylinder(12, 20), 'b');
    useProjectStore.getState().setName('B');
    const b = useProjectStore.getState().id;
    await newProject();
    useModelStore.getState().setModel(cylinder(14, 20), 'c');
    useProjectStore.getState().setName('C');
    await saveNow();
    await deleteStoredProject(b);
    await openStoredProject(a);
    expect(
      lib()
        .map((m) => m.name)
        .sort(),
    ).toEqual(['A', 'C']);
  });

  it('deleting the open project returns to the empty start screen and stays deleted', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'a');
    useProjectStore.getState().setName('A');
    const a = useProjectStore.getState().id;
    await newProject();
    useModelStore.getState().setModel(cylinder(12, 20), 'b');
    useProjectStore.getState().setName('B');
    await saveNow();
    const b = useProjectStore.getState().id;
    await deleteStoredProject(b);
    expect(useModelStore.getState().raw).toBeNull();
    expect(useProjectStore.getState().id).not.toBe(b);
    await openStoredProject(a);
    await saveNow();
    expect(lib().map((m) => m.name)).toEqual(['A']);
  });
});

describe('download all', () => {
  it('bundles project, G-code and STL', () => {
    const files = unzipSync(
      buildBundle({
        stem: 'vase',
        project: new Uint8Array([1, 2, 3]),
        gcode: 'G1 X1',
        stl: new Uint8Array([4]),
      }),
    );
    expect(Object.keys(files).sort()).toEqual(['vase.clayproject.zip', 'vase.gcode', 'vase.stl']);
    expect(
      Object.keys(
        unzipSync(buildBundle({ stem: 'a', project: new Uint8Array([1]), gcode: null, stl: null })),
      ),
    ).toEqual(['a.clayproject.zip']);
  });
});

describe('upload and download all projects', () => {
  it('packs and splits project bundles', () => {
    const one = writeProject({
      name: 'a',
      raw: cylinder(10, 20),
      shape: null,
      profiles: {
        printer: BUILTIN_PROFILES.printer[0],
        nozzle: BUILTIN_PROFILES.nozzle[1],
        clay: BUILTIN_PROFILES.clay[0],
      },
      print: DEFAULT_PRINT,
      textures: [],
      masks: {},
      images: {},
    });
    expect(splitProjects(one)).toHaveLength(1);
    const all = bundleProjects([
      { name: 'x', bytes: one },
      { name: 'x', bytes: one },
    ]);
    expect(Object.keys(unzipSync(all)).sort()).toEqual([
      'x-2.clayproject.zip',
      'x.clayproject.zip',
    ]);
    expect(splitProjects(all)).toHaveLength(2);
    expect(splitProjects(new Uint8Array([1, 2, 3]))).toHaveLength(0);
    // "download all" of one project (project + G-code + STL) also splits to its project file
    const bundle = buildBundle({ stem: 'v', project: one, gcode: 'G1', stl: null });
    expect(splitProjects(bundle)).toHaveLength(1);
  });
});

describe('unique names and duplicates', () => {
  it('gives every new project its own name and duplicates under a new one', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    useProjectStore.getState().setName('Vase');
    const id = useProjectStore.getState().id;
    await saveNow();
    await newProject();
    expect(useProjectStore.getState().name).toBe(UNTITLED);
    // an unnamed project named after its model, which another project already uses
    useModelStore.getState().setModel(cylinder(10, 20), 'vase');
    useProjectStore.getState().setName('Vase 5');
    await duplicateStoredProject(id);
    await duplicateStoredProject(id);
    const names = useProjectStore
      .getState()
      .library.map((m) => m.name)
      .sort();
    expect(names).toEqual(['Vase', 'Vase copy', 'Vase copy 2']);
    expect(useProjectStore.getState().library.every((m) => m.icon)).toBe(true);
  });
});

describe('list order', () => {
  it('opening a project does not make it newer; only a save of a change does', async () => {
    useModelStore.getState().setModel(cylinder(10, 20), 'a');
    useProjectStore.getState().setName('A');
    const idA = useProjectStore.getState().id;
    await saveNow();
    await newProject();
    useModelStore.getState().setModel(cylinder(10, 20), 'b');
    useProjectStore.getState().setName('B');
    await saveNow();
    const idB = useProjectStore.getState().id;
    const stamp = (id: string) =>
      useProjectStore.getState().library.find((m) => m.id === id)!.updatedAt;
    const [a0, b0] = [stamp(idA), stamp(idB)];
    await new Promise((r) => setTimeout(r, 15));
    await openStoredProject(idA); // switching away from B saves nothing: B is unchanged
    await openStoredProject(idB);
    expect(stamp(idA)).toBe(a0);
    expect(stamp(idB)).toBe(b0);
    useProjectStore.getState().setStatus('dirty'); // an edit
    await new Promise((r) => setTimeout(r, 15));
    await openStoredProject(idA);
    expect(stamp(idB)).toBeGreaterThan(b0);
  });
});

describe('storage persistence', () => {
  it('asks the browser to keep the storage and records the answer', async () => {
    const { requestPersistence } = await import('../src/actions/projectManager');
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } });
    await requestPersistence();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().persisted).toBe(true);
    vi.unstubAllGlobals();
  });
  it('does nothing when the browser has no such API', async () => {
    const { requestPersistence } = await import('../src/actions/projectManager');
    useProjectStore.setState({ persisted: null });
    vi.stubGlobal('navigator', {});
    await requestPersistence();
    expect(useProjectStore.getState().persisted).toBeNull();
    vi.unstubAllGlobals();
  });
});
