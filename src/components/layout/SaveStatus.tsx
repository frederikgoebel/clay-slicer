import { useProjectStore } from '../../store/projectStore';

const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { timeStyle: 'short' });

/** "Saved 12:34", "Saving…" and so on. */
export function useSaveStatusText(): string {
  const status = useProjectStore((s) => s.status);
  const savedAt = useProjectStore((s) => s.savedAt);
  const last = savedAt ? `last saved ${time(savedAt)}` : '';
  switch (status) {
    case 'saving':
      return last ? `Saving… (${last})` : 'Saving…';
    case 'dirty':
      return last ? `Unsaved changes (${last})` : 'Unsaved changes';
    case 'error':
      return last ? `Could not save in this browser (${last})` : 'Could not save in this browser';
    case 'empty':
      return 'Saved once there is a model';
    default:
      return savedAt ? `Saved ${time(savedAt)}` : 'Saved';
  }
}

export function SaveStatusText() {
  return <>{useSaveStatusText()}</>;
}
