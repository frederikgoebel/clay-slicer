import { create } from 'zustand';
import {
  MIN_FLOAT,
  panelsIn,
  useLayoutStore,
  type DockSide,
  type PanelId,
  type Place,
} from '../../store/layoutStore';

/** A panel being dragged (by its tab or its window title) and where the pointer is. */
interface DragState {
  id: PanelId | null;
  x: number;
  y: number;
  zone: DockSide | null;
}

export const useDragStore = create<DragState>()(() => ({ id: null, x: 0, y: 0, zone: null }));

const EDGE = 70;

/** Which dock the pointer would drop into: near a window edge, or over an existing dock. */
function zoneAt(x: number): DockSide | null {
  const { place, width } = useLayoutStore.getState();
  const leftEdge = panelsIn(place, 'left').length ? width.left : 0;
  const rightEdge = panelsIn(place, 'right').length ? width.right : 0;
  if (x < leftEdge + EDGE) return 'left';
  if (x > window.innerWidth - rightEdge - EDGE) return 'right';
  return null;
}

/**
 * Drag a panel. Below a small threshold nothing happens (so a click still selects the tab);
 * after it a ghost follows the pointer, and on release the panel docks left/right when dropped
 * near that side, or becomes a floating window at the drop position.
 */
export function startPanelDrag(id: PanelId, e: React.PointerEvent, grab = { x: 40, y: 14 }): void {
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;

  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
    moved = true;
    useDragStore.setState({ id, x: ev.clientX, y: ev.clientY, zone: zoneAt(ev.clientX) });
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    useDragStore.setState({ id: null, zone: null });
    if (!moved) return;
    const layout = useLayoutStore.getState();
    const zone = zoneAt(ev.clientX);
    const place: Place = zone ?? 'float';
    layout.setPlace(
      id,
      place,
      place === 'float'
        ? {
            x: Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - grab.x)),
            y: Math.max(52, Math.min(window.innerHeight - 60, ev.clientY - grab.y)),
            w: Math.max(MIN_FLOAT.w, layout.rect[id].w),
            h: Math.max(MIN_FLOAT.h, layout.rect[id].h),
          }
        : undefined,
    );
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
