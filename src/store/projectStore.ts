import { create } from 'zustand';
import { uid } from '../domain/print';
import type { ProjectMeta } from '../domain/projectLibrary';

export const UNTITLED = 'Untitled project';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'empty' | 'error';

/** Which project is open and how its autosave is doing. The project data itself lives in the other stores. */
interface ProjectState {
  id: string;
  name: string;
  /** true until the user types a name: the name then follows the model's name */
  autoNamed: boolean;
  status: SaveStatus;
  savedAt: number | null;
  /** the projects kept in this browser, newest first */
  library: ProjectMeta[];
  setName: (name: string, auto?: boolean) => void;
  setStatus: (status: SaveStatus, savedAt?: number) => void;
  setLibrary: (library: ProjectMeta[]) => void;
  /** Start a different project (new id) with the given name. */
  begin: (name: string, auto: boolean, id?: string) => void;
}

export const useProjectStore = create<ProjectState>()((set) => ({
  id: uid(),
  name: UNTITLED,
  autoNamed: true,
  status: 'empty',
  savedAt: null,
  library: [],
  setName: (name, auto = false) => set({ name, autoNamed: auto }),
  setStatus: (status, savedAt) => set((s) => ({ status, savedAt: savedAt ?? s.savedAt })),
  setLibrary: (library) => set({ library }),
  begin: (name, auto, id) =>
    set({ id: id ?? uid(), name, autoNamed: auto, status: 'empty', savedAt: null }),
}));
