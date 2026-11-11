import { create } from 'zustand';
import type { UnitGuess } from '../core/io/units';

/** A loaded STL waiting for the user to confirm its units. */
interface UnitsState {
  pending: {
    raw: Float32Array;
    name: string;
    guess: UnitGuess;
    dims: [number, number, number];
  } | null;
  ask: (p: NonNullable<UnitsState['pending']>) => void;
  clear: () => void;
}

export const useUnitsStore = create<UnitsState>()((set) => ({
  pending: null,
  ask: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
