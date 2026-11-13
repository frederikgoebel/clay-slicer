import { downloadGcode } from '../../actions/downloadGcode';
import { useState } from 'react';
import { commitProjectName } from '../../actions/projectManager';
import { useProjectStore } from '../../store/projectStore';
import { useSaveStatusText } from './SaveStatus';
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
  const name = useProjectStore((s) => s.name);
  const setName = useProjectStore((s) => s.setName);
  const saveText = useSaveStatusText();
  const [showHistory, setShowHistory] = useState(false);
  return (
    <header className={styles.top}>
      <div className={styles.brand}>
        <Logo />
        <span className={styles.brandText}>Clay Slicer</span>
      </div>
      <div className={styles.projectTitle}>
        <input
          className={styles.projectInput}
          size={Math.min(40, Math.max(10, name.length + 1))}
          title="Project name (click to rename)"
          value={name}
          aria-label="Project name"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitProjectName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <small className={styles.saveText}>{saveText}</small>
      </div>
      <div className={styles.actions}>
        <div className={styles.actionGroup}>
          <Button disabled={!canUndo} onClick={undo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
            ↶
          </Button>
          <Button
            disabled={!canRedo}
            onClick={redo}
            title="Redo (Shift+Ctrl/Cmd+Z)"
            aria-label="Redo"
          >
            ↷
          </Button>
          <Button
            onClick={() => setShowHistory(true)}
            title="Every step, each one can be switched off"
          >
            History
          </Button>
        </div>
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => void downloadGcode()}
          title="Download the G-code for the printer"
          aria-label="Download G-code"
        >
          <span className={styles.lbl}>Download</span>G-code
        </Button>
      </div>
      {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} />}
    </header>
  );
}
