import type { InfillPattern } from '../types';

export type Pt = [number, number];

/**
 * Parallel scan lines through a set of polygons (even-odd, so holes are left empty), as segments
 * in scan order; every other scan line runs the other way so the nozzle zigzags.
 */
export function scanSegments(
  polys: Pt[][],
  spacing: number,
  angle: number,
  minLen: number,
): [Pt, Pt][] {
  const c = Math.cos(-angle);
  const sn = Math.sin(-angle);
  const rot = polys.map((p) => p.map(([x, y]): Pt => [x * c - y * sn, x * sn + y * c]));
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of rot)
    for (const [, y] of p) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const back = (x: number, y: number): Pt => [x * c + y * sn, -x * sn + y * c];
  const out: [Pt, Pt][] = [];
  let flip = false;
  for (let y = y0 + spacing / 2; y < y1; y += spacing) {
    const xs: number[] = [];
    for (const p of rot)
      for (let i = 0; i < p.length; i++) {
        const [ax, ay] = p[i];
        const [bx, by] = p[(i + 1) % p.length];
        if (ay <= y !== by <= y) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    xs.sort((a, b) => a - b);
    const segs: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2)
      if (xs[i + 1] - xs[i] > minLen) segs.push([xs[i], xs[i + 1]]);
    if (flip) segs.reverse();
    for (const [a, b] of segs) out.push(flip ? [back(b, y), back(a, y)] : [back(a, y), back(b, y)]);
    flip = !flip;
  }
  return out;
}

/**
 * Infill lines for one layer. `width` is the bead width and `density` the share of the area to
 * fill (percent). Lines turn 90 degrees each layer; grid and triangles use two or three
 * directions on every layer, with the spacing widened so the density stays the same.
 */
export function infillSegments(
  polys: Pt[][],
  pattern: InfillPattern,
  density: number,
  width: number,
  angleDeg: number,
  layer: number,
  z = 0,
): { segs: [Pt, Pt][]; spacing: number } {
  const share = Math.min(1, Math.max(0.02, density / 100));
  const base = (angleDeg * Math.PI) / 180;
  if (share >= 0.999 || pattern === 'lines') {
    const spacing = width / share;
    return {
      segs: scanSegments(polys, spacing, base + (layer % 2) * (Math.PI / 2), width * 0.5),
      spacing,
    };
  }
  if (pattern === 'gyroid') {
    const period = (GYROID_K * width) / share;
    return { segs: gyroidSegments(polys, period, z, width), spacing: period / 2 };
  }
  const dirs = pattern === 'grid' ? [0, Math.PI / 2] : [0, Math.PI / 3, (2 * Math.PI) / 3];
  const spacing = (width * dirs.length) / share;
  return {
    segs: dirs.flatMap((d) => scanSegments(polys, spacing, base + d, width * 0.5)),
    spacing,
  };
}

/** True when the straight link p -> q stays inside the polygons (even-odd): no edge crossed, middle inside. */
export function linkInside(p: Pt, q: Pt, polys: Pt[][]): boolean {
  const mx = (p[0] + q[0]) / 2;
  const my = (p[1] + q[1]) / 2;
  let inside = false;
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      // point in polygon for the middle
      if (a[1] <= my !== b[1] <= my && mx < a[0] + ((my - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
        inside = !inside;
      // proper crossing of the link with this edge
      const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
      if (Math.abs(d) < 1e-12) continue;
      const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d;
      const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return false;
    }
  return inside;
}

/** line length per area of a gyroid slice is about GYROID_K / period; calibrated in tests */
export const GYROID_K = 2.4;

function inPolys(x: number, y: number, polys: Pt[][]): boolean {
  let inside = false;
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a[1] <= y !== b[1] <= y && x < a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
        inside = !inside;
    }
  return inside;
}

/** Gyroid surface sin x cos y + sin y cos z + sin z cos x = 0 cut at height z. */
export function gyroidField(x: number, y: number, z: number, period: number): number {
  const k = (2 * Math.PI) / period;
  const a = x * k;
  const b = y * k;
  const c = z * k;
  return Math.sin(a) * Math.cos(b) + Math.sin(b) * Math.cos(c) + Math.sin(c) * Math.cos(a);
}

/**
 * The gyroid slice at height z inside the polygons: marching squares on a grid, the crossings
 * chained into continuous lines (so the nozzle follows a wave without lifting), cut where they
 * leave the polygons. Returned as short consecutive segments in print order.
 */
export function gyroidSegments(
  polys: Pt[][],
  period: number,
  z: number,
  width: number,
): [Pt, Pt][] {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of polys)
    for (const [x, y] of p) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  if (!(x1 > x0 && y1 > y0)) return [];
  // grid anchored at the origin so the pattern lines up from layer to layer
  const step = Math.max(0.6, Math.min(period / 14, 2.5));
  const i0 = Math.floor(x0 / step) - 1;
  const j0 = Math.floor(y0 / step) - 1;
  const nx = Math.ceil((x1 - x0) / step) + 3;
  const ny = Math.ceil((y1 - y0) / step) + 3;
  const f = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++)
      f[j * (nx + 1) + i] = gyroidField((i0 + i) * step, (j0 + j) * step, z, period);
  const F = (i: number, j: number) => f[j * (nx + 1) + i];
  // edge ids: horizontal edge from node (i,j) to (i+1,j) = 2*(j*(nx+1)+i); vertical to (i,j+1) = +1
  const hid = (i: number, j: number) => 2 * (j * (nx + 1) + i);
  const vid = (i: number, j: number) => 2 * (j * (nx + 1) + i) + 1;
  const pos = new Map<number, Pt>();
  const adj = new Map<number, number[]>();
  const cross = (
    id: number,
    ax: number,
    ay: number,
    fa: number,
    bx: number,
    by: number,
    fb: number,
  ) => {
    if (!pos.has(id)) {
      const t = fa / (fa - fb);
      pos.set(id, [(i0 + ax + t * (bx - ax)) * step, (j0 + ay + t * (by - ay)) * step]);
    }
  };
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const v = [F(i, j), F(i + 1, j), F(i + 1, j + 1), F(i, j + 1)];
      const s = v.map((q) => q > 0);
      const edges: number[] = [];
      if (s[0] !== s[1]) {
        edges.push(hid(i, j));
        cross(hid(i, j), i, j, v[0], i + 1, j, v[1]);
      }
      if (s[1] !== s[2]) {
        edges.push(vid(i + 1, j));
        cross(vid(i + 1, j), i + 1, j, v[1], i + 1, j + 1, v[2]);
      }
      if (s[3] !== s[2]) {
        edges.push(hid(i, j + 1));
        cross(hid(i, j + 1), i, j + 1, v[3], i + 1, j + 1, v[2]);
      }
      if (s[0] !== s[3]) {
        edges.push(vid(i, j));
        cross(vid(i, j), i, j, v[0], i, j + 1, v[3]);
      }
      if (edges.length === 2) link(edges[0], edges[1]);
      else if (edges.length === 4) {
        // saddle: join by the centre value
        const centre = (v[0] + v[1] + v[2] + v[3]) / 4 > 0;
        const [bot, right, top, left] = edges;
        if (centre === s[0]) {
          link(bot, right);
          link(top, left);
        } else {
          link(bot, left);
          link(top, right);
        }
      }
    }
  // trace chains
  const seen = new Set<number>();
  const chains: Pt[][] = [];
  const trace = (start: number) => {
    const ids = [start];
    seen.add(start);
    let cur = start;
    for (;;) {
      const nxt = (adj.get(cur) ?? []).find((q) => !seen.has(q));
      if (nxt === undefined) break;
      seen.add(nxt);
      ids.push(nxt);
      cur = nxt;
    }
    return ids;
  };
  for (const [id, nb] of adj)
    if (nb.length === 1 && !seen.has(id)) chains.push(trace(id).map((q) => pos.get(q)!));
  for (const id of adj.keys())
    if (!seen.has(id)) {
      const c = trace(id).map((q) => pos.get(q)!);
      c.push(c[0]);
      chains.push(c);
    }
  // cut to the polygons
  const runs: Pt[][] = [];
  for (const c of chains) {
    let run: Pt[] = [];
    for (const p of c) {
      if (inPolys(p[0], p[1], polys)) run.push(p);
      else {
        if (run.length > 1) runs.push(run);
        run = [];
      }
    }
    if (run.length > 1) runs.push(run);
  }
  const minLen = width * 0.5;
  const kept = runs
    .map((r) => simplify(r, 0.12))
    .filter((r) => {
      let l = 0;
      for (let i = 1; i < r.length; i++)
        l += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      return l > minLen;
    });
  // nearest-neighbour order, reversing a run when its far end is closer
  const out: [Pt, Pt][] = [];
  let at: Pt = kept.length ? kept[0][0] : [0, 0];
  const left = kept.slice();
  while (left.length) {
    let best = 0;
    let rev = false;
    let bd = Infinity;
    left.forEach((r, k) => {
      const a = Math.hypot(r[0][0] - at[0], r[0][1] - at[1]);
      const b = Math.hypot(r[r.length - 1][0] - at[0], r[r.length - 1][1] - at[1]);
      if (a < bd) [bd, best, rev] = [a, k, false];
      if (b < bd) [bd, best, rev] = [b, k, true];
    });
    const r = left.splice(best, 1)[0];
    if (rev) r.reverse();
    for (let i = 1; i < r.length; i++) out.push([r[i - 1], r[i]]);
    at = r[r.length - 1];
  }
  return out;
}

/** Douglas-Peucker: drops points that lie within `tol` mm of the straight line between the kept ones. */
function simplify(pts: Pt[], tol: number): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const dx = pts[b][0] - ax;
    const dy = pts[b][1] - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1;
    let fd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > fd) [fd, far] = [d, i];
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
