import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { ToolpathResult } from '../../core/types';
import { useSliceStore } from '../../store/sliceStore';
import { useUiStore, type ColorMode } from '../../store/uiStore';
import { visiblePointCount } from './pathUtils';
import { useEffectiveView } from './useEffectiveView';
import { pointColors } from './toolpathColors';

/** Crisp, unlit screen-space lines (px). */
const LINE_PX = 1.5;

/** One batch of unlit, screen-space lines: crisp at any zoom and not affected by lighting. */
function buildLines(
  res: ToolpathResult,
  mode: ColorMode,
  layerHeight: number,
  overhangLimit: number,
): { object: LineSegments2; material: LineMaterial } {
  const colors = pointColors(res, mode, layerHeight, overhangLimit);
  const segments = res.count - 1;
  const pos = new Float32Array(segments * 6);
  const col = new Float32Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < 3; k++) {
      pos[6 * i + k] = res.xyz[3 * i + k];
      pos[6 * i + 3 + k] = res.xyz[3 * (i + 1) + k];
      col[6 * i + k] = col[6 * i + 3 + k] = colors[3 * (i + 1) + k];
    }
  }
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(pos);
  geometry.setColors(col);
  const material = new LineMaterial({
    vertexColors: true,
    linewidth: LINE_PX,
    alphaToCoverage: true,
  });
  const object = new LineSegments2(geometry, material);
  object.frustumCulled = false;
  return { object, material };
}

export function Toolpath() {
  const { invalidate, size } = useThree();
  const result = useSliceStore((s) => s.result);
  const settings = useSliceStore((s) => s.usedSettings);
  const view = useEffectiveView();
  const mode = useUiStore((s) => s.colorMode);
  const layer = useUiStore((s) => s.layer);

  const layerHeight = settings?.layerHeight ?? 1;
  const overhangLimit = settings?.overhangMax ?? 25;

  const lines = useMemo(
    () => (result ? buildLines(result, mode, layerHeight, overhangLimit) : null),
    [result, mode, layerHeight, overhangLimit],
  );

  useEffect(
    () => () => {
      lines?.object.geometry.dispose();
      lines?.material.dispose();
    },
    [lines],
  );

  useEffect(() => {
    lines?.material.resolution.set(size.width, size.height);
    invalidate();
  }, [lines, size, invalidate]);

  // layer clipping: only draw segments that end at or below the chosen height
  useEffect(() => {
    if (!result || !lines) return;
    const points = visiblePointCount(result, layer, layerHeight);
    (lines.object.geometry as LineSegmentsGeometry).instanceCount = Math.max(0, points - 1);
    invalidate();
  }, [lines, result, layer, layerHeight, invalidate]);

  if (view !== 'layers' || !lines) return null;
  return <primitive object={lines.object} />;
}
