import { useTexturesPanelVisible } from './store/layoutStore';
import { useEffect, useMemo } from 'react';
import { openFile } from './actions/projectActions';
import { restoreLastProject, startAutosave } from './actions/projectManager';
import styles from './components/layout/layout.module.css';
import { LayerBar } from './components/layout/LayerBar';
import { ConfirmDialog } from './components/layout/ConfirmDialog';
import { ProjectProfilesDialog } from './components/layout/ProjectProfilesDialog';
import { UnitsDialog } from './components/layout/UnitsDialog';
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
import { useMeshStore } from './store/meshStore';
import { useModelStore } from './store/modelStore';
import { redo, startHistory, undo } from './store/historyStore';
import { useSliceStore } from './store/sliceStore';
import { useUnitsStore } from './store/unitsStore';
import { useUiStore } from './store/uiStore';

export default function App() {
  const mesh = useMesh();
  const settings = useSliceSettings();
  useSlicer(mesh, settings);
  useEffect(() => useMeshStore.setState({ mesh }), [mesh]);

  const modelError = useModelStore((s) => s.error);
  const busy = useSliceStore((s) => s.status === 'busy');
  const unitsPending = useUnitsStore((s) => s.pending !== null);
  const paintId = useUiStore((s) => s.paint.textureId);
  const texturesVisible = useTexturesPanelVisible();
  // painting belongs to the Textures panel: leave it when another panel takes its place
  useEffect(() => {
    if (!texturesVisible) useUiStore.getState().setPaintTexture(null);
  }, [texturesVisible]);

  const meshRadius = useMemo(() => {
    let r = 0;
    if (mesh)
      for (let i = 0; i < mesh.length; i += 3) r = Math.max(r, Math.hypot(mesh[i], mesh[i + 1]));
    return r;
  }, [mesh]);

  // reopen the project that was open last, then save every change
  useEffect(() => {
    startAutosave();
    void restoreLastProject();
  }, []);

  // undo / redo: record changes from the start, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z (or Ctrl+Y)
  useEffect(() => {
    startHistory();
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || t?.tagName === 'TEXTAREA') return;
      if (t instanceof HTMLInputElement && ['text', 'search', 'email'].includes(t.type)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

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
          {!mesh && !unitsPending && <Welcome />}
          <UnitsDialog />
          <ProjectProfilesDialog />
          <ConfirmDialog />
          <LayerBar />
        </main>
        <Dock side="right" />
      </div>
      <FloatingLayer />
    </div>
  );
}
