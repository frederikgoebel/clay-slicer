import { create } from 'zustand';

/** model: shaded STL; layers: unlit toolpath lines; preview: meshed clay beads. */
export type ViewMode = 'model' | 'layers' | 'preview';
export type ColorMode = 'height' | 'feature' | 'overhang' | 'speed' | 'width' | 'thickness';

interface PaintState {
  /** texture being painted, or null when the brush is off */
  textureId: string | null;
  erase: boolean;
  radius: number;
  /** 0..100: 0 = very soft edge, 100 = hard */
  hardness: number;
  /** 0..100: how strongly a stroke paints (like a grayscale brush) */
  opacity: number;
}

interface UiState {
  view: ViewMode;
  colorMode: ColorMode;
  /** layer shown up to (fractional); null = everything */
  layer: number | null;
  playing: boolean;
  /** selected node of the drawn shape (shared by the viewport handles and the panel) */
  shapeSection: number;
  shapeVertex: number;
  showHandles: boolean;
  paint: PaintState;
  /** texture cards that are folded up (by texture id) */
  collapsedTex: Record<string, boolean>;
  /** mirror edits of the section outline in the top view */
  symX: boolean;
  symY: boolean;
  setSym: (axis: 'x' | 'y', v: boolean) => void;

  setView: (v: ViewMode) => void;
  setColorMode: (v: ColorMode) => void;
  setLayer: (v: number | null) => void;
  setPlaying: (v: boolean) => void;
  setShapeSection: (i: number) => void;
  setShapeVertex: (i: number) => void;

  setShowHandles: (v: boolean) => void;
  setTexCollapsed: (id: string, collapsed: boolean) => void;
  /** Start/stop painting a texture. Painting needs the model visible. */
  setPaintTexture: (id: string | null) => void;
  patchPaint: (patch: Partial<Omit<PaintState, 'textureId'>>) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: 'model',
  colorMode: 'height',
  layer: null,
  playing: false,
  shapeSection: 0,
  shapeVertex: 0,
  showHandles: true,
  paint: { textureId: null, erase: false, radius: 12, hardness: 55, opacity: 100 },
  collapsedTex: {},
  symX: false,
  symY: false,
  setSym: (axis, v) => set(axis === 'x' ? { symX: v } : { symY: v }),

  setView: (view) => set({ view }),
  setColorMode: (colorMode) => set({ colorMode }),
  setLayer: (layer) => set({ layer, playing: false }),
  setPlaying: (playing) => set({ playing }),
  setShapeSection: (shapeSection) => set({ shapeSection, shapeVertex: 0 }),
  setShapeVertex: (shapeVertex) => set({ shapeVertex }),
  setShowHandles: (showHandles) => set({ showHandles }),
  setTexCollapsed: (id, collapsed) =>
    set((s) => ({ collapsedTex: { ...s.collapsedTex, [id]: collapsed } })),
  setPaintTexture: (textureId) =>
    set((s) => ({
      paint: { ...s.paint, textureId },
    })),
  patchPaint: (patch) => set((s) => ({ paint: { ...s.paint, ...patch } })),
}));
