import { useMemo } from 'react';
import { colorModesFor, thicknessRange } from '../viewport/toolpathColors';
import { useSliceStore } from '../../store/sliceStore';
import { useUiStore, type ColorMode, type ViewMode } from '../../store/uiStore';
import { Segmented } from '../ui/controls';
import styles from './layout.module.css';

const VIEWS = [
  ['model', 'Model'],
  ['layers', 'Layers'],
  ['preview', 'Print preview'],
] as const satisfies readonly (readonly [ViewMode, string])[];

const COLORS: readonly (readonly [ColorMode, string])[] = [
  ['height', 'Height'],
  ['feature', 'Floor / wall'],
  ['overhang', 'Overhang'],
  ['speed', 'Speed'],
  ['width', 'Bead width'],
  ['thickness', 'Layer height'],
];

export function ViewBar() {
  const storedView = useUiStore((s) => s.view);
  const painting = useUiStore((s) => s.paint.textureId !== null);
  const colorMode = useUiStore((s) => s.colorMode);
  const showBeads = useUiStore((s) => s.showBeads);
  const setShowBeads = useUiStore((s) => s.setShowBeads);
  const setView = useUiStore((s) => s.setView);
  const setColorMode = useUiStore((s) => s.setColorMode);
  const result = useSliceStore((s) => s.result);
  // while a mask is painted the viewport shows the print preview and the other views are locked
  const locked = painting && result !== null;
  const view = locked ? 'preview' : storedView;
  const modes = useMemo(() => (result ? colorModesFor(result) : []), [result]);
  const mode = modes.includes(colorMode) ? colorMode : 'height';
  const [t0, t1] = result ? thicknessRange(result) : [0, 0];
  return (
    <div className={styles.viewbar}>
      <Segmented
        label="View"
        value={view}
        options={VIEWS}
        onChange={setView}
        disabled={(v) => locked && v !== 'preview'}
      />
      {view === 'layers' && result && (
        <label className={styles.inline}>
          Colour
          <select value={mode} onChange={(e) => setColorMode(e.target.value as ColorMode)}>
            {COLORS.filter(([v]) => modes.includes(v)).map(([v, name]) => (
              <option key={v} value={v}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {view === 'layers' && result && (
        <label
          className={styles.inline}
          title="Draw every bead at its real width and layer height instead of thin lines"
        >
          <input
            type="checkbox"
            checked={showBeads}
            onChange={(e) => setShowBeads(e.target.checked)}
          />
          Bead size
        </label>
      )}
      {view === 'layers' && result && result.dwell.some((d) => d > 0) && (
        <span
          className={styles.inline}
          title="The nozzle stands still here, extruding a clay blob (see the texture's dwell time)"
        >
          <span className={styles.pauseDot} /> Pauses
        </span>
      )}
      {view === 'layers' && result && mode === 'thickness' && (
        <span className={styles.inline} title="blue = thinnest, yellow = thickest">
          {t0.toFixed(2)} – {t1.toFixed(2)} mm
        </span>
      )}
    </div>
  );
}
