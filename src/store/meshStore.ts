import { create } from 'zustand';

/** The print-size mesh, shared so small previews (texture thumbnails) can use it. */
export const useMeshStore = create<{ mesh: Float32Array | null }>()(() => ({ mesh: null }));
