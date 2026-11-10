import type { SliceSettings, ToolpathResult } from '../types';
import type { SliceRequest, SliceResponse } from './slicer.worker';

/** Promise-based wrapper around the slicing worker. */
export class SlicerClient {
  private worker = new Worker(new URL('./slicer.worker.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  private pending = new Map<
    number,
    { resolve: (r: ToolpathResult) => void; reject: (e: Error) => void }
  >();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<SliceResponse>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if ('error' in m) p.reject(new Error(m.error));
      else p.resolve(m.result);
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(`Worker error: ${e.message}`));
      this.pending.clear();
    };
  }

  /** Takes ownership of `pos` (its buffer is transferred to the worker). */
  slice(pos: Float32Array, settings: SliceSettings): Promise<ToolpathResult> {
    const id = ++this.seq;
    const req: SliceRequest = { id, pos, settings };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(req, [pos.buffer]);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

let shared: SlicerClient | null = null;
export const getSlicerClient = (): SlicerClient => (shared ??= new SlicerClient());
