import { downloadGcode } from '../../actions/downloadGcode';
import { saveProject } from '../../actions/projectActions';
import { useState } from 'react';
import { redo, undo, useHistoryStore } from '../../store/historyStore';
import { HistoryDialog } from './HistoryDialog';
import { useSliceStore } from '../../store/sliceStore';
import { Logo } from './Logo';
import { Button } from '../ui/controls';
import styles from './layout.module.css';

export function TopBar() {
  const ready = useSliceStore((s) => s.result !== null);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const [showHistory, setShowHistory] = useState(false);
  return (
    <header className={styles.top}>
      <div className={styles.brand}>
        <Logo />
        Clay Slicer
      </div>
      <div className={styles.actions}>
        <Button disabled={!canUndo} onClick={undo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
          ↶ Undo
        </Button>
        <Button
          disabled={!canRedo}
          onClick={redo}
          title="Redo (Shift+Ctrl/Cmd+Z)"
          aria-label="Redo"
        >
          Redo ↷
        </Button>
        <Button onClick={() => setShowHistory(true)}>History</Button>
        <Button onClick={saveProject}>Save project</Button>
        <Button variant="primary" disabled={!ready} onClick={downloadGcode}>
          Download G-code
        </Button>
      </div>
      {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} />}
    </header>
  );
}
