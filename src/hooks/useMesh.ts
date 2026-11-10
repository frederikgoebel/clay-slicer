import { useMemo } from 'react';
import { buildMesh } from '../core/geometry/mesh';
import { meshTransform } from '../domain/profiles';
import { useModelStore } from '../store/modelStore';
import { useSettingsStore } from '../store/settingsStore';
import { useActiveProfile } from './useProfiles';
import { useDebouncedValue } from './useDebouncedValue';

/** The print-size mesh: STL rotated, scaled (incl. shrinkage), dropped to the bed. */
export function useMesh(): Float32Array | null {
  const raw = useModelStore((s) => s.raw);
  const drawn = useModelStore((s) => s.source === 'design');
  const print = useSettingsStore((s) => s.print);
  const clay = useActiveProfile('clay');
  const transform = useDebouncedValue(meshTransform(print, clay), 90);
  return useMemo(() => (raw ? buildMesh(raw, transform, drawn) : null), [raw, transform, drawn]);
}
