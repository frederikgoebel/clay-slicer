/** A graph editor curve: points (x, y) with x and y in 0..1, joined by straight lines. */
export type CurvePoint = [number, number];

export const FLAT_CURVE: CurvePoint[] = [
  [0, 1],
  [1, 1],
];

/** Value of the curve at x (clamped to the first / last point). */
export function curveAt(points: CurvePoint[] | undefined, x: number): number {
  if (!points || points.length === 0) return 1;
  if (points.length === 1 || x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
