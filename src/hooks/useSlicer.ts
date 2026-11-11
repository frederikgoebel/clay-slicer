import { useEffect } from 'react';
import { getSlicerClient } from '../core/worker/SlicerClient';
import type { SliceSettings } from '../core/types';
import { useSliceStore } from '../store/sliceStore';
import { useUiStore } from '../store/uiStore';

const DEBOUNCE_MS = 220;
const PAINT_DEBOUNCE_MS = 30;

interface Job {
  mesh: Float32Array;
  settings: SliceSettings;
  isCurrent: () => boolean;
}

let busy = false;
let queued: Job | null = null;

/** One slice at a time; while one runs, only the newest waiting request is kept. */
function submit(job: Job): void {
  if (busy) {
    queued = job;
    return;
  }
  busy = true;
  void getSlicerClient()
    .slice(job.mesh.slice(), job.settings)
    .then((result) => {
      if (job.isCurrent()) useSliceStore.getState().succeed(result, job.settings);
    })
    .catch((err: unknown) => {
      if (job.isCurrent())
        useSliceStore.getState().fail(err instanceof Error ? err.message : String(err));
    })
    .finally(() => {
      busy = false;
      const next = queued;
      queued = null;
      if (next?.isCurrent()) submit(next);
    });
}

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
    const delay = useUiStore.getState().paint.textureId ? PAINT_DEBOUNCE_MS : DEBOUNCE_MS;
    const timer = setTimeout(() => submit({ mesh, settings, isCurrent: () => !cancelled }), delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mesh, settings]);
}
