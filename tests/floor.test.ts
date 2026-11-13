import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_FLOOR } from '../src/core/types';
import { testSettings } from './helpers';

/** Closed prism of a plus shape: a centre square (half width a) with four arms out to `len`. */
export function plusPrism(a = 8, len = 30, h = 20): Float32Array {
  const out: number[] = [];
  const quad = (p: number[][], flip: boolean) => {
    const [A, B, C, D] = flip ? [p[0], p[3], p[2], p[1]] : p;
    out.push(...A, ...B, ...C, ...A, ...C, ...D);
  };
  const rects: [number, number, number, number][] = [
    [-a, -a, a, a],
    [a, -a, len, a],
    [-len, -a, -a, a],
    [-a, a, a, len],
    [-a, -len, a, -a],
  ];
  for (const [x0, y0, x1, y1] of rects) {
    quad(
      [
        [x0, y0, 0],
        [x0, y1, 0],
        [x1, y1, 0],
        [x1, y0, 0],
      ],
      false,
    );
    quad(
      [
        [x0, y0, h],
        [x1, y0, h],
        [x1, y1, h],
        [x0, y1, h],
      ],
      false,
    );
  }
  // outer walls, one quad per outline edge (outline of the plus, counter-clockwise)
  const o: [number, number][] = [
    [a, -len],
    [a, -a],
    [len, -a],
    [len, a],
    [a, a],
    [a, len],
    [-a, len],
    [-a, a],
    [-len, a],
    [-len, -a],
    [-a, -a],
    [-a, -len],
  ];
  for (let i = 0; i < o.length; i++) {
    const [x0, y0] = o[i];
    const [x1, y1] = o[(i + 1) % o.length];
    quad(
      [
        [x0, y0, 0],
        [x1, y1, 0],
        [x1, y1, h],
        [x0, y0, h],
      ],
      false,
    );
  }
  return Float32Array.from(out);
}

const inPlus = (x: number, y: number, a: number, len: number, tol: number) =>
  Math.abs(x) <= len + tol &&
  Math.abs(y) <= len + tol &&
  (Math.abs(x) <= a + tol || Math.abs(y) <= a + tol);

describe('floor on a concave shape', () => {
  for (const pattern of ['insets', 'spiral', 'lines', 'grid'] as const) {
    it(`${pattern}: stays inside the plus and fills it`, () => {
      const a = 8;
      const len = 30;
      const s = testSettings({ floorLayers: 3, floorPattern: pattern, floorSpacingPct: 100 });
      const r = runPipeline(plusPrism(a, len), s);
      let n = 0;
      let outside = 0;
      for (let i = 0; i < r.count; i++) {
        if (r.feature[i] !== FEATURE_FLOOR) continue;
        n++;
        if (!inPlus(r.xyz[3 * i], r.xyz[3 * i + 1], a, len, 0.05)) outside++;
      }
      expect(n).toBeGreaterThan(40);
      expect(outside).toBe(0);
      expect(r.warnings.filter((w) => w.startsWith('Path leaves'))).toEqual([]);
    });
  }
});
