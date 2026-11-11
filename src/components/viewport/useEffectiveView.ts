import { useSliceStore } from '../../store/sliceStore';
import { useUiStore, type ViewMode } from '../../store/uiStore';

/**
 * The view that is actually drawn: path views fall back to the model until a slice exists.
 * While painting you see the finished print (clay preview, updating live); the model underneath
 * stays invisible but still takes the brush.
 */
export function useEffectiveView(): ViewMode {
  const view = useUiStore((s) => s.view);
  const painting = useUiStore((s) => s.paint.textureId !== null);
  const hasPath = useSliceStore((s) => s.result !== null);
  if (!hasPath) return 'model';
  return painting ? 'preview' : view;
}
