import { useConfirmStore } from '../../store/confirmStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/controls';
import styles from './history.module.css';

/** The one place that asks yes / no questions (delete a project, download despite a warning...). */
export function ConfirmDialog() {
  const pending = useConfirmStore((s) => s.pending);
  const answer = useConfirmStore((s) => s.answer);
  if (!pending) return null;
  return (
    <Modal title={pending.title} onClose={() => answer(false)}>
      {pending.message.map((m) => (
        <p key={m} className={styles.confirmText}>
          {m}
        </p>
      ))}
      <div className={styles.units}>
        <Button
          variant={pending.danger ? 'danger' : 'primary'}
          autoFocus
          onClick={() => answer(true)}
        >
          {pending.confirmLabel ?? 'OK'}
        </Button>
        <Button onClick={() => answer(false)}>{pending.cancelLabel ?? 'Cancel'}</Button>
      </div>
    </Modal>
  );
}
