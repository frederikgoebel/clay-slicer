import { downloadGcode } from '../../actions/downloadGcode';
import { saveProject } from '../../actions/projectActions';
import { useSliceStore } from '../../store/sliceStore';
import { Logo } from './Logo';
import { Button } from '../ui/controls';
import styles from './layout.module.css';

export function TopBar() {
  const ready = useSliceStore((s) => s.result !== null);
  return (
    <header className={styles.top}>
      <div className={styles.brand}>
        <Logo />
        Clay Slicer
      </div>
      <div className={styles.actions}>
        <Button onClick={saveProject}>Save project</Button>
        <Button variant="primary" disabled={!ready} onClick={downloadGcode}>
          Download G-code
        </Button>
      </div>
    </header>
  );
}
