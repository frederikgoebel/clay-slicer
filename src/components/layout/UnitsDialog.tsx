import { confirmUnits } from '../../actions/modelActions';
import { useUnitsStore } from '../../store/unitsStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/controls';
import styles from './history.module.css';

const mm = (v: number) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

/** Shown when a loaded STL is implausibly small or big in millimetres. */
export function UnitsDialog() {
  const pending = useUnitsStore((s) => s.pending);
  if (!pending) return null;
  const { guess, dims } = pending;
  const tiny = Math.max(...dims) < 10;
  return (
    <Modal title="Which units is this model in?" onClose={() => confirmUnits(guess.guess.factor)}>
      <p className={styles.note}>
        “{pending.name}” measures {dims.map((d) => mm(d)).join(' × ')} in the file&rsquo;s own
        units. STL files do not store units, and in millimetres this would be{' '}
        {tiny ? 'tiny' : 'too big for the printer'}. My guess:{' '}
        <strong>{guess.guess.label.toLowerCase()}</strong>. Pick one, or press Enter to use the
        guess.
      </p>
      <div className={styles.units}>
        {guess.options.map(({ option, size }) => (
          <Button
            key={option.id}
            variant={option.id === guess.guess.id ? 'primary' : 'default'}
            autoFocus={option.id === guess.guess.id}
            onClick={() => confirmUnits(option.factor)}
          >
            {option.label}
            <span className={styles.size}>
              → largest side {mm(size)} mm
              {option.id === 'fit' ? ` (×${Math.round(option.factor * 1000) / 1000})` : ''}
            </span>
          </Button>
        ))}
      </div>
    </Modal>
  );
}
