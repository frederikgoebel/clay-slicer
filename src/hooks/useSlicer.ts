import { useEffect } from 'react';
import { getSlicerClient } from '../core/worker/SlicerClient';
import type { SliceSettings } from '../core/types';
import { useSliceStore } from '../store/sliceStore';

const DEBOUNCE_MS = 220;

/** Re-slices (debounced, in a worker) whenever the mesh or any setting changes. */
export function useSlicer(mesh: Float32Array | null, settings: SliceSettings): void {
  useEffect(() => {
    const store = useSliceStore.getState();
    if (!mesh) {
      store.reset();
      return;
    }
    store.start();
    let cancelled = false;
    const timer = setTimeout(() => {
      getSlicerClient()
        .slice(mesh.slice(), settings)
        .then((result) => {
          if (!cancelled) useSliceStore.getState().succeed(result, settings);
        })
        .catch((err: unknown) => {
          if (!cancelled)
            useSliceStore.getState().fail(err instanceof Error ? err.message : String(err));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mesh, settings]);
}
