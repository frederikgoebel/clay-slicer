import { useRef, type PointerEvent } from 'react';
import {
  MIN_DOCK,
  PANEL_TITLES,
  panelsIn,
  useLayoutStore,
  type DockSide,
} from '../../store/layoutStore';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { startPanelDrag } from './dragStore';
import { PANEL_CONTENT } from './panelDefs';
import styles from './dock.module.css';

/**
 * A dock: a tab bar and the active panel, with a draggable edge to resize it.
 * Tabs can be dragged out to float the panel or into the other dock.
 */
export function Dock({ side }: { side: DockSide }) {
  const place = useLayoutStore((s) => s.place);
  const active = useLayoutStore((s) => s.active[side]);
  const width = useLayoutStore((s) => s.width[side]);
  const activate = useLayoutStore((s) => s.activate);
  const setWidth = useLayoutStore((s) => s.setWidth);
  const grab = useRef(0);

  const ids = panelsIn(place, side);
  if (ids.length === 0 || !active) return null;
  const Content = PANEL_CONTENT[active];

  const resize = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: globalThis.PointerEvent) =>
      setWidth(side, startW + (side === 'left' ? ev.clientX - startX : startX - ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const keyResize = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const dir = side === 'left' ? 1 : -1;
    if (e.key === 'ArrowRight') setWidth(side, width + step * dir);
    if (e.key === 'ArrowLeft') setWidth(side, width - step * dir);
  };

  return (
    <aside
      className={`${styles.dock} ${side === 'left' ? styles.left : styles.right}`}
      style={{ width }}
      aria-label={`${side} panel`}
    >
      <div className={styles.tabs} role="tablist">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === active}
            className={id === active ? styles.tabOn : styles.tab}
            title="Click to show. Drag to float it or move it to the other side."
            onClick={() => activate(side, id)}
            onPointerDown={(e) => {
              grab.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
              startPanelDrag(id, e, { x: grab.current, y: 14 });
            }}
          >
            {PANEL_TITLES[id]}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        <ErrorBoundary label={PANEL_TITLES[active]}>
          <Content />
        </ErrorBoundary>
      </div>
      <div
        className={`${styles.grip} ${side === 'left' ? styles.gripRight : styles.gripLeft}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${side} panel`}
        aria-valuenow={width}
        aria-valuemin={MIN_DOCK}
        tabIndex={0}
        onPointerDown={resize}
        onKeyDown={keyResize}
        onDoubleClick={() => setWidth(side, 340)}
        title="Drag to resize. Double-click to reset."
      />
    </aside>
  );
}
