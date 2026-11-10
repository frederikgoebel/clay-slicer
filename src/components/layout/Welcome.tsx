import { useId } from 'react';
import { loadSample, newShape } from '../../actions/modelActions';
import { openFile } from '../../actions/projectActions';
import { SAMPLES } from '../../core/samples';
import { Button } from '../ui/controls';
import styles from './layout.module.css';

/** Shown in the middle of the viewport while nothing is loaded. */
export function Welcome() {
  const fileId = useId();
  return (
    <div className={styles.welcome} role="dialog" aria-label="Get started">
      <h2>Start a print</h2>
      <p className={styles.welcomeSub}>Everything runs in your browser.</p>
      <label className={`${styles.fileBtn} ${styles.welcomeBtn}`} htmlFor={fileId}>
        <strong>Open an STL or project…</strong>
        <small>or drop the file anywhere on the page</small>
      </label>
      <input
        id={fileId}
        type="file"
        accept=".stl,.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openFile(file);
          e.target.value = '';
        }}
      />
      <Button className={styles.welcomeBtn} onClick={newShape}>
        <strong>Draw a shape</strong>
        <small>loft sections into a vase, jar or bowl</small>
      </Button>
      <div className={styles.welcomeSamples}>
        <span>Or try a sample</span>
        <div>
          {Object.entries(SAMPLES).map(([key, s]) => (
            <Button key={key} small onClick={() => loadSample(key)}>
              {s.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
