import { useLayoutStore } from '../store/layoutStore';
import { parseStl } from '../core/io/stl';
import { SAMPLES } from '../core/samples';
import { boundsOf, guessUnits, scaleMesh } from '../core/io/units';
import { activeProfile, useSettingsStore } from '../store/settingsStore';
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
  if (sample) useModelStore.getState().setModel(sample.make(), sample.slug);
}
