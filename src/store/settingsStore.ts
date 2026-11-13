import { create } from 'zustand';
import { beadArea, mm3SToCm3Min } from '../core/toolpath/bead';
import { persist } from 'zustand/middleware';
import type { TextureLayer, TextureType } from '../core/types';
import { DEFAULT_PRINT, newTexture, uid, type PrintSettings } from '../domain/print';
import {
  BUILTIN_PROFILES,
  DEFAULT_SELECTION,
  PROFILE_KINDS,
  isHexColor,
  applyProfilePlan,
  mergeProfiles,
  planProfile,
  type ProfileKind,
  type ProfileLists,
  type ProfileMap,
} from '../domain/profiles';
import { safeJsonStorage } from './storage';

type Editable<K extends ProfileKind> = Partial<Omit<ProfileMap[K], 'id' | 'builtin'>>;

interface SettingsState {
  profiles: ProfileLists;
  selected: Record<ProfileKind, string>;
  print: PrintSettings;
  textures: TextureLayer[];

  setPrint: (patch: Partial<PrintSettings>) => void;
  selectProfile: (kind: ProfileKind, id: string) => void;
  /** Edit the active profile. Editing a built-in forks it into a user copy first. */
  patchProfile: <K extends ProfileKind>(kind: K, patch: Editable<K>) => void;
  duplicateProfile: (kind: ProfileKind) => void;
  deleteProfile: (kind: ProfileKind) => void;
  addTexture: (type: TextureType) => string;
  patchTexture: (id: string, patch: Partial<Omit<TextureLayer, 'id' | 'type'>>) => void;
  removeTexture: (id: string) => void;
  /** Insert ready-made layers (new ids) at a position in the stack. */
  insertTextures: (layers: TextureLayer[], index: number) => void;
  /** Move a texture up (-1) or down (+1) in the layer order. */
  moveTexture: (id: string, dir: -1 | 1) => void;
  /** put a texture at this position in the list (0 = applied first) */
  moveTextureTo: (id: string, index: number) => void;
  resetPrint: () => void;
  /** Back to a fresh install: built-in profiles only, default print settings, no textures. */
  resetAll: () => void;
  /** Merge imported profiles into the lists; returns the id each imported profile ended up with. */
  importProfiles: (incoming: Partial<ProfileLists>) => {
    [K in ProfileKind]?: Record<string, string>;
  };
  /** Apply a loaded project: embed its profiles, select them, replace print settings + textures. */
  loadProject: (
    profiles: { [K in ProfileKind]: ProfileMap[K] },
    print: PrintSettings,
    textures: TextureLayer[],
    /** 'import': add or replace the profiles that differ (see planProfile); 'skip': keep the current selection */
    mode?: 'import' | 'skip',
  ) => void;
}

const freshProfiles = (): ProfileLists => ({
  printer: [...BUILTIN_PROFILES.printer],
  nozzle: [...BUILTIN_PROFILES.nozzle],
  clay: [...BUILTIN_PROFILES.clay],
});

/** Pure helper (also used by tests): the profile list entry that is currently selected. */
export function activeProfile<K extends ProfileKind>(
  s: Pick<SettingsState, 'profiles' | 'selected'>,
  kind: K,
): ProfileMap[K] {
  const list = s.profiles[kind] as ProfileMap[K][];
  return list.find((p) => p.id === s.selected[kind]) ?? list[0];
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profiles: freshProfiles(),
      selected: { ...DEFAULT_SELECTION },
      print: { ...DEFAULT_PRINT },
      textures: [],

      setPrint: (patch) => set((s) => ({ print: { ...s.print, ...patch } })),

      selectProfile: (kind, id) => set((s) => ({ selected: { ...s.selected, [kind]: id } })),

      patchProfile: (kind, patch) =>
        set((s) => {
          const list = s.profiles[kind] as ProfileMap[typeof kind][];
          const cur = activeProfile(s, kind);
          if (cur.builtin) {
            const copy = {
              ...cur,
              ...patch,
              id: uid(),
              builtin: false,
              name: patch.name ?? `${cur.name} (edited)`,
            };
            return {
              profiles: { ...s.profiles, [kind]: [...list, copy] },
              selected: { ...s.selected, [kind]: copy.id },
            };
          }
          return {
            profiles: {
              ...s.profiles,
              [kind]: list.map((p) => (p.id === cur.id ? { ...p, ...patch } : p)),
            },
          };
        }),

      duplicateProfile: (kind) =>
        set((s) => {
          const cur = activeProfile(s, kind);
          const copy = { ...cur, id: uid(), builtin: false, name: `${cur.name} copy` };
          const list = s.profiles[kind] as ProfileMap[typeof kind][];
          return {
            profiles: { ...s.profiles, [kind]: [...list, copy] },
            selected: { ...s.selected, [kind]: copy.id },
          };
        }),

      deleteProfile: (kind) =>
        set((s) => {
          const cur = activeProfile(s, kind);
          if (cur.builtin) return s;
          const list = (s.profiles[kind] as ProfileMap[typeof kind][]).filter(
            (p) => p.id !== cur.id,
          );
          return {
            profiles: { ...s.profiles, [kind]: list },
            selected: { ...s.selected, [kind]: DEFAULT_SELECTION[kind] },
          };
        }),

      addTexture: (type) => {
        const t = newTexture(type);
        set((s) => ({ textures: [...s.textures, t] }));
        return t.id;
      },
      patchTexture: (id, patch) =>
        set((s) => ({ textures: s.textures.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      insertTextures: (layers, index) =>
        set((s) => {
          const textures = [...s.textures];
          textures.splice(Math.max(0, Math.min(textures.length, index)), 0, ...layers);
          return { textures };
        }),
      removeTexture: (id) => set((s) => ({ textures: s.textures.filter((t) => t.id !== id) })),
      moveTexture: (id, dir) =>
        set((s) => {
          const i = s.textures.findIndex((t) => t.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.textures.length) return s;
          const textures = [...s.textures];
          [textures[i], textures[j]] = [textures[j], textures[i]];
          return { textures };
        }),
      moveTextureTo: (id, index) =>
        set((s) => {
          const i = s.textures.findIndex((t) => t.id === id);
          const j = Math.max(0, Math.min(s.textures.length - 1, index));
          if (i < 0 || i === j) return s;
          const textures = [...s.textures];
          const [t] = textures.splice(i, 1);
          textures.splice(j, 0, t);
          return { textures };
        }),
      resetPrint: () => set({ print: { ...DEFAULT_PRINT }, textures: [] }),
      resetAll: () =>
        set({
          profiles: freshProfiles(),
          selected: { ...DEFAULT_SELECTION },
          print: { ...DEFAULT_PRINT },
          textures: [],
        }),
      importProfiles: (incoming) => {
        const maps: { [K in ProfileKind]?: Record<string, string> } = {};
        set((s) => {
          const profiles = { ...s.profiles };
          for (const kind of PROFILE_KINDS) {
            const inc = incoming[kind];
            if (!inc?.length) continue;
            const { list, idMap } = mergeProfiles(
              profiles[kind] as ProfileMap[typeof kind][],
              inc as ProfileMap[typeof kind][],
            );
            (profiles[kind] as ProfileMap[typeof kind][]) = list;
            maps[kind] = idMap;
          }
          return { profiles };
        });
        return maps;
      },
      loadProject: (embedded, print, textures, mode = 'import') =>
        set((s) => {
          const profiles = { ...s.profiles };
          const selected = { ...s.selected };
          for (const kind of mode === 'skip' ? [] : PROFILE_KINDS) {
            const list = profiles[kind] as ProfileMap[typeof kind][];
            const p = embedded[kind] as ProfileMap[typeof kind];
            const done = applyProfilePlan(list, p, planProfile(list, p));
            (profiles[kind] as ProfileMap[typeof kind][]) = done.list;
            selected[kind] = done.id;
          }
          return { profiles, selected, print: { ...DEFAULT_PRINT, ...print }, textures };
        }),
    }),
    {
      name: 'clay-slicer-v2',
      version: 2,
      // v1 nozzle profiles stored a line width; v2 stores the extrusion rate it implies at 30 mm/s.
      migrate: (old) => {
        const o = (old ?? {}) as { profiles?: { nozzle?: Record<string, unknown>[] } };
        for (const n of o.profiles?.nozzle ?? []) {
          if (typeof n.lineWidth === 'number' && typeof n.extrusionRate !== 'number') {
            const h = typeof n.layerHeight === 'number' ? n.layerHeight : 1.8;
            n.extrusionRate = Math.round(mm3SToCm3Min(beadArea(n.lineWidth, h) * 30) * 10) / 10;
          }
          delete n.lineWidth;
        }
        return o as never;
      },
      storage: safeJsonStorage(),
      // Built-in profiles come from code so updates reach everyone; only user profiles persist.
      partialize: (s) => ({
        profiles: {
          printer: s.profiles.printer.filter((p) => !p.builtin),
          nozzle: s.profiles.nozzle.filter((p) => !p.builtin),
          clay: s.profiles.clay.filter((p) => !p.builtin),
        },
        selected: s.selected,
        print: s.print,
        textures: s.textures,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const profiles = freshProfiles();
        for (const kind of PROFILE_KINDS) {
          (profiles[kind] as ProfileMap[typeof kind][]).push(
            ...((p.profiles?.[kind] ?? []) as ProfileMap[typeof kind][]),
          );
        }
        // clay profiles saved before colours existed
        profiles.clay = profiles.clay.map((c) => ({
          ...c,
          color: isHexColor(c.color) ? c.color : BUILTIN_PROFILES.clay[0].color,
        }));
        const selected = { ...DEFAULT_SELECTION, ...p.selected };
        for (const kind of PROFILE_KINDS) {
          if (!profiles[kind].some((x) => x.id === selected[kind])) {
            selected[kind] = DEFAULT_SELECTION[kind];
          }
        }
        return {
          ...current,
          profiles,
          selected,
          print: { ...DEFAULT_PRINT, ...p.print },
          textures: (p.textures ?? []).map((t) => ({ ...newTexture(t.type), ...t })),
        };
      },
    },
  ),
);
