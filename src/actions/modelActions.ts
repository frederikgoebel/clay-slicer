import { unzlibSync } from 'fflate';
import { MASK_H, MASK_W } from '../core/textures/mask';
import type { Mask } from '../core/types';
import { useMaskStore } from '../store/maskStore';
import { useLayoutStore } from '../store/layoutStore';
import { parseStl } from '../core/io/stl';
import { SAMPLES } from '../core/samples';
import { boundsOf, guessUnits, scaleMesh } from '../core/io/units';
import { activeProfile, useSettingsStore } from '../store/settingsStore';
import { newTexture, uid } from '../domain/print';
import { useUnitsStore } from '../store/unitsStore';
import { useModelStore } from '../store/modelStore';

export async function loadStlFile(file: File): Promise<void> {
  const { setModel, setError } = useModelStore.getState();
  try {
    const raw = parseStl(await file.arrayBuffer());
    const name = file.name.replace(/\.stl$/i, '');
    const printer = activeProfile(useSettingsStore.getState(), 'printer');
    const b = boundsOf(raw);
    const guess = guessUnits(b, printer.buildDiameter, printer.buildHeight);
    // not plausible in millimetres: ask which units the file uses, suggesting the likeliest
    if (guess.ask) useUnitsStore.getState().ask({ raw, name, guess, dims: [b.x, b.y, b.z] });
    else setModel(raw, name);
  } catch (err) {
    setError(`Could not read STL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Switch to the design tool (creates a default design the first time). */
export function newShape(): void {
  useModelStore.getState().setSource('design');
  useLayoutStore.getState().showPanel('model');
}

/** The user picked the units of a pending STL. */
export function confirmUnits(factor: number): void {
  const p = useUnitsStore.getState().pending;
  if (!p) return;
  useUnitsStore.getState().clear();
  useModelStore.getState().setModel(scaleMesh(p.raw, factor), p.name);
}

export function loadSample(key: string): void {
  const sample = SAMPLES[key];
  if (!sample) return;
  if (!sample.design) {
    useModelStore.getState().setModel(sample.make(), sample.slug);
    return;
  }
  // a drawn shape: the textures come with it
  useModelStore.getState().setShape(sample.design.shape, sample.slug);
  const textures = sample.design.textures.map((t) => ({ ...newTexture(t.type), ...t, id: uid() }));
  useSettingsStore.setState((s) => ({
    textures,
    print: { ...s.print, ...sample.design?.print },
  }));
  // painted masks that belong to the sample
  const masks: Record<string, Mask> = {};
  for (const [index, b64] of Object.entries(sample.design.masks ?? {})) {
    const id = textures[Number(index)]?.id;
    const data = unzlibSync(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
    if (id && data.length === MASK_W * MASK_H) masks[id] = { width: MASK_W, height: MASK_H, data };
  }
  useMaskStore.getState().replaceAll(masks);
}
