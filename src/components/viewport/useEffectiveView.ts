import { useSliceStore } from '../../store/sliceStore';
import { useUiStore, type ViewMode } from '../../store/uiStore';

/**
 * The view that is actually drawn: path views fall back to the model until a slice exists,
 * and painting always shows the model (you paint on the surface).
 */
export function useEffectiveView(): ViewMode {
  const view = useUiStore((s) => s.view);
  const painting = useUiStore((s) => s.paint.textureId !== null);
  const hasPath = useSliceStore((s) => s.result !== null);
  return painting || !hasPath ? 'model' : view;
}
