import { runPipeline } from '../toolpath/pipeline';
import type { SliceSettings, ToolpathResult } from '../types';

export interface SliceRequest {
  id: number;
  pos: Float32Array;
  settings: SliceSettings;
}
export type SliceResponse = { id: number; result: ToolpathResult } | { id: number; error: string };

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<SliceRequest>) => {
  const { id, pos, settings } = e.data;
  try {
    const result = runPipeline(pos, settings);
    const reply: SliceResponse = { id, result };
    ctx.postMessage(reply, [
      result.xyz.buffer,
      result.feature.buffer,
      result.speed.buffer,
      result.width.buffer,
      result.overhang.buffer,
      result.dwell.buffer,
      result.lift.buffer,
      result.thick.buffer,
      result.flow.buffer,
    ]);
  } catch (err) {
    const reply: SliceResponse = { id, error: err instanceof Error ? err.message : String(err) };
    ctx.postMessage(reply);
  }
};
