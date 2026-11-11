import { toggleStep, useHistoryStore } from '../../store/historyStore';
import { StepIcon } from './StepIcon';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/controls';
import styles from './history.module.css';

const time = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** Every change since the page was opened. Any step can be switched off; later steps stay. */
export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const items = useHistoryStore((s) => s.items);
  return (
    <Modal title="Change history" onClose={onClose}>
      <p className={styles.note}>
        Take back any single step, even an old one: the changes made after it are kept. A step
        marked “replaced later” was changed again afterwards, so switching it off shows no
        difference until the later step is switched off too.
      </p>
      {items.length === 0 && <p className={styles.note}>Nothing changed yet.</p>}
      <ol className={styles.list} aria-label="Changes, newest first">
        {[...items].reverse().map((e) => (
          <li key={e.id} className={e.active ? styles.row : `${styles.row} ${styles.off}`}>
            <span className={styles.time}>{time(e.t)}</span>
            <span className={styles.icons}>
              {e.icons.map((k) => (
                <StepIcon key={k} kind={k} />
              ))}
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{e.label}</span>
              {e.detail && <span className={styles.detail}>{e.detail}</span>}
              {e.overridden && <span className={styles.badge}>replaced later</span>}
              {!e.active && <span className={styles.badge}>undone</span>}
            </span>
            <Button small onClick={() => toggleStep(e.id)}>
              {e.active ? 'Undo this' : 'Redo this'}
            </Button>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
