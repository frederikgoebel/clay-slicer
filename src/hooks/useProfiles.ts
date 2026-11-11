import { useMemo } from 'react';
import { nominalWidth, mm3SToCm3Min } from '../core/toolpath/bead';
import { DEFAULT_PRINT } from '../domain/print';
import { resolveSliceSettings, type ProfileKind, type ProfileMap } from '../domain/profiles';
import type { SliceSettings } from '../core/types';
import { activeProfile, useSettingsStore } from '../store/settingsStore';
import { useImageStore } from '../store/imageStore';
import { useMaskStore } from '../store/maskStore';

export function useActiveProfile<K extends ProfileKind>(kind: K): ProfileMap[K] {
  return useSettingsStore((s) => activeProfile(s, kind));
}

/**
 * Everything the slicer needs, as one memoised object.
 * Painted masks are attached to their textures here; they change identity only on `commit()`.
 */
export function useSliceSettings(): SliceSettings {
  const printer = useActiveProfile('printer');
  const nozzle = useActiveProfile('nozzle');
  const clay = useActiveProfile('clay');
  const print = useSettingsStore((s) => s.print);
  const textures = useSettingsStore((s) => s.textures);
  const masks = useMaskStore((s) => s.masks);
  const images = useImageStore((s) => s.images);
  const maskVersion = useMaskStore((s) => s.version);

  return useMemo(
    () =>
      resolveSliceSettings(
        printer,
        nozzle,
        clay,
        print,
        textures.map((t) => ({
          ...t,
          mask: masks[t.id] ?? null,
          image: images[t.id] ?? null,
          maskImage: images[`${t.id}~mask`] ?? null,
        })),
      ),
    // maskVersion: strokes mutate mask data in place, then bump the version
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printer, nozzle, clay, print, textures, masks, images, maskVersion],
  );
}

export interface BeadSummary {
  /** calculated bead width at the programmed print speed, mm */
  width: number;
  layerHeight: number;
  nozzle: number;
  /** effective extrusion rate after the clay flow factor, cm³/min */
  rateCm3Min: number;
  speed: number;
}

/** What the active nozzle + clay + printer add up to: the derived (not typed-in) bead width. */
export function useBeadSummary(): BeadSummary {
  const printer = useActiveProfile('printer');
  const nozzle = useActiveProfile('nozzle');
  const clay = useActiveProfile('clay');
  return useMemo(() => {
    const s = resolveSliceSettings(printer, nozzle, clay, DEFAULT_PRINT, []);
    return {
      width: nominalWidth(s),
      layerHeight: s.layerHeight,
      nozzle: s.nozzle,
      rateCm3Min: mm3SToCm3Min(s.extrusionRate),
      speed: s.printSpeed,
    };
  }, [printer, nozzle, clay]);
}
