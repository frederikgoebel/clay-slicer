export type Poly = [number, number][];

/** Line segments of the previous layer in a uniform grid, to find the nearest wall below a point. */
export class SegmentGrid {
  private cells = new Map<number, number[]>();
  private segs: number[] = [];

  constructor(
    polylines: Poly[],
    private readonly cell = 4,
  ) {
    for (const pl of polylines) for (let i = 0; i + 1 < pl.length; i++) this.add(pl[i], pl[i + 1]);
  }

  private key(i: number, j: number): number {
    return (i + 32768) * 65536 + (j + 32768);
  }

  private add(a: [number, number], b: [number, number]): void {
    const id = this.segs.length / 4;
    this.segs.push(a[0], a[1], b[0], b[1]);
    const c = this.cell;
    for (
      let i = Math.floor(Math.min(a[0], b[0]) / c);
      i <= Math.floor(Math.max(a[0], b[0]) / c);
      i++
    )
      for (
        let j = Math.floor(Math.min(a[1], b[1]) / c);
        j <= Math.floor(Math.max(a[1], b[1]) / c);
        j++
      ) {
        const k = this.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(id);
        else this.cells.set(k, [id]);
      }
  }

  /** The closest point of any segment within `maxDist` of (x, y), or null. */
  nearest(x: number, y: number, maxDist: number): [number, number] | null {
    const c = this.cell;
    const ci = Math.floor(x / c);
    const cj = Math.floor(y / c);
    const r = Math.ceil(maxDist / c);
    let best: [number, number] | null = null;
    let bd = maxDist * maxDist;
    const seen = new Set<number>();
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const id of list) {
          if (seen.has(id)) continue;
          seen.add(id);
          const ax = this.segs[4 * id];
          const ay = this.segs[4 * id + 1];
          const dx = this.segs[4 * id + 2] - ax;
          const dy = this.segs[4 * id + 3] - ay;
          const l2 = dx * dx + dy * dy;
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
          const qx = ax + t * dx;
          const qy = ay + t * dy;
          const d = (x - qx) ** 2 + (y - qy) ** 2;
          if (d < bd) {
            bd = d;
            best = [qx, qy];
          }
        }
      }
    return best;
  }
}

/**
 * Overhang angle in degrees of a wall point `(x, y)` with outward normal `(nx, ny)` (pointing away
 * from the material) over the layer below: how far the wall steps outward past the wall below,
 * seen against the layer height. 0 when there is nothing below within reach.
 */
export function overhangAngle(
  below: SegmentGrid | null,
  x: number,
  y: number,
  nx: number,
  ny: number,
  layerHeight: number,
): number {
  if (!below) return 0;
  // a step of this many layer heights is about 83 degrees: anything farther is another part
  const q = below.nearest(x, y, 8 * layerHeight);
  if (!q) return 0;
  const out = (x - q[0]) * nx + (y - q[1]) * ny;
  return Math.max(0, (Math.atan2(out, layerHeight) * 180) / Math.PI);
}
