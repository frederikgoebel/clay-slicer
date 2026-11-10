import { useEffect, useMemo } from 'react';
import { openFile } from './actions/projectActions';
import styles from './components/layout/layout.module.css';
import { LayerBar } from './components/layout/LayerBar';
import { Welcome } from './components/layout/Welcome';
import { Dock } from './components/layout/Dock';
import { FloatingLayer } from './components/layout/FloatingLayer';
import { StatsCard } from './components/layout/StatsCard';
import { TopBar } from './components/layout/TopBar';
import { ViewBar } from './components/layout/ViewBar';
import { Viewport } from './components/viewport/Viewport';
import { useMesh } from './hooks/useMesh';
import { useSliceSettings } from './hooks/useProfiles';
import { useSlicer } from './hooks/useSlicer';
import { useModelStore } from './store/modelStore';
import { useSliceStore } from './store/sliceStore';
import { useUiStore } from './store/uiStore';

export default function App() {
  const mesh = useMesh();
  const settings = useSliceSettings();
  useSlicer(mesh, settings);

  const modelError = useModelStore((s) => s.error);
  const busy = useSliceStore((s) => s.status === 'busy');
  const paintId = useUiStore((s) => s.paint.textureId);

  const meshRadius = useMemo(() => {
    let r = 0;
    if (mesh)
      for (let i = 0; i < mesh.length; i += 3) r = Math.max(r, Math.hypot(mesh[i], mesh[i + 1]));
    return r;
  }, [mesh]);

  // drag & drop an STL anywhere on the page
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) void openFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={styles.app}>
      <TopBar />
      <div className={styles.layout}>
        <Dock side="left" />
        <main className={styles.main}>
          <div className={styles.viewport}>
            <Viewport mesh={mesh} />
          </div>
          <ViewBar />
          {paintId && <div className={styles.paintBadge}>Painting mask: drag on the model</div>}
          <StatsCard meshRadius={meshRadius} />
          {busy && <div className={styles.badge}>Slicing…</div>}
          {modelError && (
            <div className={`${styles.card} ${styles.warn} ${styles.bad}`}>{modelError}</div>
          )}
          {!mesh && <Welcome />}
          <LayerBar />
        </main>
        <Dock side="right" />
      </div>
      <FloatingLayer />
    </div>
  );
}
