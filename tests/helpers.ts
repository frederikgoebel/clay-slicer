import { beadArea } from '../src/core/toolpath/bead';
import type { SliceSettings } from '../src/core/types';
import { lathe } from '../src/core/samples';
import { DEFAULT_PRINT } from '../src/domain/print';
import { BUILTIN_PROFILES, resolveSliceSettings } from '../src/domain/profiles';

export const TEST_WIDTH = 4;

/** Settings from the built-in profiles, with small overrides for fast tests. */
export function testSettings(o: Partial<SliceSettings> = {}): SliceSettings {
  const s = resolveSliceSettings(
    BUILTIN_PROFILES.printer[0],
    BUILTIN_PROFILES.nozzle[1],
    BUILTIN_PROFILES.clay[0],
    DEFAULT_PRINT,
    [],
  );
  return {
    ...s,
    layerHeight: 2,
    extrusionRate: beadArea(TEST_WIDTH, 2) * s.printSpeed,
    nozzle: 3,
    segLen: 2,
    ...o,
  };
}

export const cylinder = (r = 20, h = 60) => lathe(() => r, h, 10, 128);
