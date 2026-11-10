import { create } from 'zustand';
import { defaultShape, shapeMesh, type ShapeSpec } from '../core/shape/shape';

export type ModelSource = 'stl' | 'design';

interface ModelState {
  /** Which model is being printed: the loaded STL or the drawn design. */
  source: ModelSource;
  /** Triangle soup that gets sliced (the STL, or the design's mesh). Untransformed. */
  raw: Float32Array | null;
  name: string;
  /** The loaded STL, kept while you work on the design (and the other way round). */
  stl: { raw: Float32Array; name: string } | null;
  /** The drawn design (lofted sections). */
  shape: ShapeSpec | null;
  /** Bumped on every load so the camera can re-frame. */
  loadCount: number;
  error: string | null;
  setModel: (raw: Float32Array, name: string) => void;
  /** Start (or load) a design; re-frames the camera. */
  setShape: (shape: ShapeSpec, name?: string) => void;
  /** Edit the design; keeps the camera where it is. */
  updateShape: (shape: ShapeSpec) => void;
  /** Switch between the STL and the design (creating a default design the first time). */
  setSource: (source: ModelSource) => void;
  setError: (message: string | null) => void;
}

export const useModelStore = create<ModelState>()((set) => ({
  source: 'stl',
  raw: null,
  name: 'model',
  stl: null,
  shape: null,
  loadCount: 0,
  error: null,
  setModel: (raw, name) =>
    set((s) => ({
      source: 'stl',
      raw,
      name,
      stl: { raw, name },
      loadCount: s.loadCount + 1,
      error: null,
    })),
  setShape: (shape, name = 'design') =>
    set((s) => ({
      source: 'design',
      raw: shapeMesh(shape),
      name,
      shape,
      loadCount: s.loadCount + 1,
      error: null,
    })),
  updateShape: (shape) => set({ raw: shapeMesh(shape), shape }),
  setSource: (source) =>
    set((s) => {
      if (source === s.source) return s;
      if (source === 'design') {
        const shape = s.shape ?? defaultShape();
        return { source, shape, raw: shapeMesh(shape), name: 'design', loadCount: s.loadCount + 1 };
      }
      return {
        source,
        raw: s.stl?.raw ?? null,
        name: s.stl?.name ?? 'model',
        loadCount: s.loadCount + 1,
      };
    }),
  setError: (error) => set({ error }),
}));
