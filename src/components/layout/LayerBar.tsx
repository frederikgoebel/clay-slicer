import { useEffect } from 'react';
import { useSliceStore } from '../../store/sliceStore';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui/controls';
import styles from './layout.module.css';

/** Layer slider + playback. `layer === null` means "show everything". */
export function LayerBar() {
  const result = useSliceStore((s) => s.result);
  const layerHeight = useSliceStore((s) => s.usedSettings?.layerHeight ?? 1);
  const layer = useUiStore((s) => s.layer);
  const playing = useUiStore((s) => s.playing);
  const { setLayer, setPlaying } = useUiStore.getState();

  const max = result?.stats.layers ?? 0;
  const value = layer === null ? max : Math.min(layer, max);

  useEffect(() => {
    if (!playing || max === 0) return;
    let raf = 0;
    const step = () => {
      const cur = useUiStore.getState().layer ?? 0;
      const next = cur + Math.max(0.05, max / 600);
      if (next >= max) {
        useUiStore.setState({ layer: null, playing: false });
        return;
      }
      useUiStore.setState({ layer: next });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, max]);

  return (
    <div className={styles.layerbar}>
      <Button
        small
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={!result}
        onClick={() => {
          if (playing) return setPlaying(false);
          useUiStore.setState({ layer: layer === null || layer >= max ? 0 : layer, playing: true });
        }}
      >
        {playing ? '❚❚' : '▶'}
      </Button>
      <input
        type="range"
        aria-label="Layer"
        title="Show the print up to this layer. Drag to see how it was built up; all the way right shows everything."
        min={0}
        max={max}
        step={0.05}
        value={value}
        disabled={!result}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setLayer(v >= max ? null : v);
        }}
      />
      <span className={styles.layerLabel}>
        {result
          ? `layer ${Math.ceil(value)} / ${max} · z ${(value * layerHeight).toFixed(1)} mm`
          : '–'}
      </span>
    </div>
  );
}
