import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJsonStorage } from './storage';

export type PanelId = 'profiles' | 'model' | 'textures';
export type DockSide = 'left' | 'right';
export type Place = DockSide | 'float';

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PANEL_ORDER: PanelId[] = ['profiles', 'model', 'textures'];
export const PANEL_TITLES: Record<PanelId, string> = {
  profiles: 'Print Setup',
  model: 'STL or Design',
  textures: 'Textures',
};
export const MIN_DOCK = 240;
export const MAX_DOCK = 760;
export const MIN_FLOAT = { w: 260, h: 160 };

interface LayoutState {
  place: Record<PanelId, Place>;
  rect: Record<PanelId, FloatRect>;
  /** the tab shown in each dock */
  active: Record<DockSide, PanelId | null>;
  width: Record<DockSide, number>;
  /** stacking order of floating windows (last = on top) */
  stack: PanelId[];
  /** Move a panel to a dock or into a floating window (optionally at a position). */
  setPlace: (id: PanelId, place: Place, rect?: Partial<FloatRect>) => void;
  /** Make sure a panel is visible: select its tab, or raise its window. */
  showPanel: (id: PanelId) => void;
  activate: (side: DockSide, id: PanelId) => void;
  setWidth: (side: DockSide, w: number) => void;
  setRect: (id: PanelId, rect: Partial<FloatRect>) => void;
  raise: (id: PanelId) => void;
  reset: () => void;
}

const defaultRect = (i: number): FloatRect => ({ x: 120 + i * 36, y: 90 + i * 36, w: 360, h: 520 });

const initial = () => ({
  place: { profiles: 'left', model: 'left', textures: 'left' } as Record<PanelId, Place>,
  rect: Object.fromEntries(PANEL_ORDER.map((id, i) => [id, defaultRect(i)])) as Record<
    PanelId,
    FloatRect
  >,
  active: { left: 'model', right: null } as Record<DockSide, PanelId | null>,
  width: { left: 340, right: 340 },
  stack: [] as PanelId[],
});

export const panelsIn = (place: Record<PanelId, Place>, side: Place): PanelId[] =>
  PANEL_ORDER.filter((id) => place[id] === side);

/** Keep each dock's active tab pointing at a panel that is actually docked there. */
function fixActive(
  place: Record<PanelId, Place>,
  active: Record<DockSide, PanelId | null>,
): Record<DockSide, PanelId | null> {
  const out = { ...active };
  for (const side of ['left', 'right'] as const) {
    const here = panelsIn(place, side);
    if (!out[side] || !here.includes(out[side] as PanelId)) out[side] = here[0] ?? null;
  }
  return out;
}

const clampW = (w: number) => Math.min(MAX_DOCK, Math.max(MIN_DOCK, Math.round(w)));

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...initial(),
      setPlace: (id, place, rect) =>
        set((s) => {
          const nextPlace = { ...s.place, [id]: place };
          const active = { ...s.active };
          if (place !== 'float') active[place] = id;
          return {
            place: nextPlace,
            active: fixActive(nextPlace, active),
            rect: rect ? { ...s.rect, [id]: { ...s.rect[id], ...rect } } : s.rect,
            stack:
              place === 'float'
                ? [...s.stack.filter((p) => p !== id), id]
                : s.stack.filter((p) => p !== id),
          };
        }),
      showPanel: (id) =>
        set((s) => {
          const place = s.place[id];
          if (place === 'float') return { stack: [...s.stack.filter((p) => p !== id), id] };
          return { active: { ...s.active, [place]: id } };
        }),
      activate: (side, id) => set((s) => ({ active: { ...s.active, [side]: id } })),
      setWidth: (side, w) => set((s) => ({ width: { ...s.width, [side]: clampW(w) } })),
      setRect: (id, rect) =>
        set((s) => ({ rect: { ...s.rect, [id]: { ...s.rect[id], ...rect } } })),
      raise: (id) => set((s) => ({ stack: [...s.stack.filter((p) => p !== id), id] })),
      reset: () => set(initial()),
    }),
    {
      name: 'clay-slicer-layout',
      version: 1,
      storage: safeJsonStorage(),
      partialize: (s) => ({
        place: s.place,
        rect: s.rect,
        active: s.active,
        width: s.width,
        stack: s.stack,
      }),
      // tolerate a layout saved by a different version: unknown panels are ignored, new ones default
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LayoutState>;
        const base = initial();
        const place = { ...base.place };
        const rect = { ...base.rect };
        for (const id of PANEL_ORDER) {
          const pl = p.place?.[id];
          if (pl === 'left' || pl === 'right' || pl === 'float') place[id] = pl;
          const r = p.rect?.[id];
          if (r && [r.x, r.y, r.w, r.h].every(Number.isFinite)) rect[id] = r;
        }
        return {
          ...current,
          place,
          rect,
          active: fixActive(place, { ...base.active, ...p.active }),
          width: { left: clampW(p.width?.left ?? 340), right: clampW(p.width?.right ?? 340) },
          stack: (p.stack ?? []).filter((id) => PANEL_ORDER.includes(id) && place[id] === 'float'),
        };
      },
    },
  ),
);

/** True while the "STL or Design" panel can be seen (active dock tab or floating window). */
export function useModelPanelVisible(): boolean {
  return useLayoutStore((s) => {
    const p = s.place.model;
    return p === 'float' ? true : s.active[p] === 'model';
  });
}
