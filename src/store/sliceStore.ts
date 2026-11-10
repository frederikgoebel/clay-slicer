import { create } from 'zustand';
import type { SliceSettings, ToolpathResult } from '../core/types';

export type SliceStatus = 'idle' | 'busy' | 'ready' | 'error';

interface SliceState {
  status: SliceStatus;
  result: ToolpathResult | null;
  /** the exact settings the current result was computed with (used for G-code) */
  usedSettings: SliceSettings | null;
  error: string | null;
  start: () => void;
  succeed: (result: ToolpathResult, settings: SliceSettings) => void;
  fail: (message: string) => void;
  reset: () => void;
}

export const useSliceStore = create<SliceState>()((set) => ({
  status: 'idle',
  result: null,
  usedSettings: null,
  error: null,
  start: () => set({ status: 'busy' }),
  succeed: (result, usedSettings) => set({ status: 'ready', result, usedSettings, error: null }),
  fail: (error) => set({ status: 'error', result: null, usedSettings: null, error }),
  reset: () => set({ status: 'idle', result: null, usedSettings: null, error: null }),
}));
