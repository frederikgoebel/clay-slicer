import { useEffect, type PointerEvent } from 'react';
import {
  MIN_FLOAT,
  PANEL_ORDER,
  PANEL_TITLES,
  useLayoutStore,
  type PanelId,
} from '../../store/layoutStore';
import { startPanelDrag, useDragStore } from './dragStore';
import { PANEL_CONTENT } from './panelDefs';
import styles from './dock.module.css';

function FloatingWindow({ id, z }: { id: PanelId; z: number }) {
  const rect = useLayoutStore((s) => s.rect[id]);
  const setRect = useLayoutStore((s) => s.setRect);
  const setPlace = useLayoutStore((s) => s.setPlace);
  const raise = useLayoutStore((s) => s.raise);
  const Content = PANEL_CONTENT[id];

  // keep the window reachable if the browser window got smaller
  const x = Math.max(0, Math.min(rect.x, window.innerWidth - 80));
  const y = Math.max(52, Math.min(rect.y, window.innerHeight - 40));

  const resize = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const { w, h } = rect;
    const move = (ev: globalThis.PointerEvent) =>
      setRect(id, {
        w: Math.max(MIN_FLOAT.w, w + ev.clientX - sx),
        h: Math.max(MIN_FLOAT.h, h + ev.clientY - sy),
      });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section
      className={styles.float}
      style={{ left: x, top: y, width: rect.w, height: rect.h, zIndex: 40 + z }}
      aria-label={PANEL_TITLES[id]}
      onPointerDown={() => raise(id)}
    >
      <header
        className={styles.floatTitle}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          startPanelDrag(id, e, { x: e.clientX - x, y: e.clientY - y });
        }}
      >
        <span>{PANEL_TITLES[id]}</span>
        <span className={styles.floatBtns}>
          <button
            type="button"
            title="Dock left"
            aria-label="Dock left"
            onClick={() => setPlace(id, 'left')}
          >
            ⇤
          </button>
          <button
            type="button"
            title="Dock right"
            aria-label="Dock right"
            onClick={() => setPlace(id, 'right')}
          >
            ⇥
          </button>
        </span>
      </header>
      <div className={styles.body}>
        <Content />
      </div>
      <div className={styles.corner} onPointerDown={resize} role="presentation" />
    </section>
  );
}

/** Floating windows plus the drop hints shown while a panel is being dragged. */
export function FloatingLayer() {
  const place = useLayoutStore((s) => s.place);
  const stack = useLayoutStore((s) => s.stack);
  const drag = useDragStore();

  // a floating panel that was never raised still needs a stacking slot
  const floating = PANEL_ORDER.filter((id) => place[id] === 'float');
  const order = [
    ...floating.filter((id) => !stack.includes(id)),
    ...stack.filter((id) => floating.includes(id)),
  ];

  useEffect(() => {
    if (!drag.id) return;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = '';
    };
  }, [drag.id]);

  return (
    <>
      {order.map((id, i) => (
        <FloatingWindow key={id} id={id} z={i} />
      ))}
      {drag.id && (
        <>
          <div
            className={`${styles.zone} ${styles.zoneLeft} ${drag.zone === 'left' ? styles.zoneOn : ''}`}
          >
            Dock left
          </div>
          <div
            className={`${styles.zone} ${styles.zoneRight} ${drag.zone === 'right' ? styles.zoneOn : ''}`}
          >
            Dock right
          </div>
          <div className={styles.ghost} style={{ left: drag.x + 12, top: drag.y + 12 }}>
            {PANEL_TITLES[drag.id]}
          </div>
        </>
      )}
    </>
  );
}
