import { useAskStore } from '../../store/askStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/controls';
import styles from './history.module.css';

const KIND = { printer: 'Printer', nozzle: 'Nozzle', clay: 'Clay' } as const;

/** Asked when a project brings profiles that differ from the ones in this browser. */
export function ProjectProfilesDialog() {
  const pending = useAskStore((s) => s.pending);
  const answer = useAskStore((s) => s.answer);
  if (!pending) return null;
  return (
    <Modal title="Profiles in this project" onClose={() => answer('cancel')}>
      <p className={styles.note}>
        “{pending.project}” uses profiles you do not have, or that differ from yours:
      </p>
      <ul className={styles.note}>
        {pending.changes.map((c) => (
          <li key={c.kind}>
            {KIND[c.kind]} <strong>{c.name}</strong>:{' '}
            {c.action.kind === 'replace'
              ? 'you have one with this name but other values. Importing replaces it.'
              : 'not in your list. Importing adds it.'}
          </li>
        ))}
      </ul>
      <div className={styles.units}>
        <Button variant="primary" autoFocus onClick={() => answer('import')}>
          Import
        </Button>
        <Button onClick={() => answer('skip')}>Open, keep my current profiles</Button>
        <Button onClick={() => answer('cancel')}>Cancel</Button>
      </div>
    </Modal>
  );
}
