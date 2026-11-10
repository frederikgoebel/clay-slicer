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
];

export function ViewBar() {
  const view = useUiStore((s) => s.view);
  const colorMode = useUiStore((s) => s.colorMode);
  const setView = useUiStore((s) => s.setView);
  const setColorMode = useUiStore((s) => s.setColorMode);
  const hasPath = useSliceStore((s) => s.result !== null);
  return (
    <div className={styles.viewbar}>
      <Segmented label="View" value={view} options={VIEWS} onChange={setView} />
      {view === 'layers' && hasPath && (
        <label className={styles.inline}>
          Colour
          <select value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)}>
            {COLORS.map(([v, name]) => (
              <option key={v} value={v}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
