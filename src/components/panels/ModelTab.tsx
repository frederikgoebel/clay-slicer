import { useId } from 'react';
import { loadSample } from '../../actions/modelActions';
import { openFile } from '../../actions/projectActions';
import { SAMPLES } from '../../core/samples';
import { useModelStore, type ModelSource } from '../../store/modelStore';
import { Section, Segmented } from '../ui/controls';
import { ModelPanel } from './ModelPanel';
import { ShapeEditor } from './ShapeEditor';
import styles from './panels.module.css';

const SOURCES = [
  ['stl', 'STL'],
  ['design', 'Design'],
] as const satisfies readonly (readonly [ModelSource, string])[];

/** "STL or Design": choose what gets printed, then load an STL or draw a lofted shape. */
export function ModelTab() {
  const source = useModelStore((s) => s.source);
  const hasStl = useModelStore((s) => s.stl !== null);
  const setSource = useModelStore((s) => s.setSource);
  const name = useModelStore((s) => s.stl?.name);
  const fileId = useId();

  return (
    <>
      <Section title="Model source" defaultOpen>
        <Segmented label="Model source" value={source} options={SOURCES} onChange={setSource} />
        {source === 'stl' && (
          <div className={styles.editor}>
            <p className={styles.hint}>
              {hasStl ? `Loaded: ${name}.` : 'No STL loaded yet.'} Drop a file on the page, or:
            </p>
            <div className={styles.profileActions}>
              <label className={styles.fileBtn} htmlFor={fileId}>
                Open STL / project…
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
              <select
                aria-label="Sample model"
                value=""
                onChange={(e) => loadSample(e.target.value)}
              >
                <option value="">Sample model…</option>
                {Object.entries(SAMPLES).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Section>
      {source === 'design' && <ShapeEditor />}
      <ModelPanel />
    </>
  );
}
