import { useLayoutStore } from '../store/layoutStore';
import { parseStl } from '../core/io/stl';
import { SAMPLES } from '../core/samples';
import { useModelStore } from '../store/modelStore';

export async function loadStlFile(file: File): Promise<void> {
  const { setModel, setError } = useModelStore.getState();
  try {
    setModel(parseStl(await file.arrayBuffer()), file.name.replace(/\.stl$/i, ''));
  } catch (err) {
    setError(`Could not read STL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Switch to the design tool (creates a default design the first time). */
export function newShape(): void {
  useModelStore.getState().setSource('design');
  useLayoutStore.getState().showPanel('model');
}

export function loadSample(key: string): void {
  const sample = SAMPLES[key];
  if (sample) useModelStore.getState().setModel(sample.make(), sample.slug);
}
