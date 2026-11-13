import ClipperLib from 'clipper-lib';
import { FEATURE_FLOOR, FEATURE_TRAVEL, FEATURE_WALL, type SliceSettings } from '../types';
import { nominalWidth } from './bead';
import type { PathBuilder } from './PathBuilder';
import { floorLayerCount, type RingSet } from './rings';

type Pt = [number, number];

/**
 * Floor. Every floor layer is a closed outer loop on the model's contour (so the outer shell is
 * complete from the first layer) plus a fill that sits one line spacing inside it:
 *
 *  - spiral: one continuous spiral per layer; layers alternate in/out so the last one ends at the
 *    seam, exactly where the wall starts
 *  - insets: concentric loops following the contour, same in/out alternation as the spiral
 *  - lines:  parallel lines, turning 90 degrees on every layer
 *  - grid:   lines in both directions on every layer
 *
 * Moves that would cross open space between two fills are written as travels (no clay).
 */
export function addFloor(path: PathBuilder, set: RingSet, s: SliceSettings): void {
  const F = floorLayerCount(s);
  if (F === 0) return;
  const spacing = (nominalWidth(s) * s.floorSpacingPct) / 100;

  /** push a run of points; a first point far from the previous one becomes a travel move */
  const run = (pts: Pt[], z: number, feature: number) => {
    pts.forEach(([x, y], i) => {
      let f = feature;
      let speed = s.printSpeed;
      if (path.count === 0) f = FEATURE_TRAVEL;
      else if (i === 0) {
        const n = path.count - 1;
        const gap = Math.hypot(x - path.xyz[3 * n], y - path.xyz[3 * n + 1]);
        if (gap > spacing * 2.5) {
          f = FEATURE_TRAVEL;
          speed = s.travelSpeed;
        }
      }
      path.push(x, y, z, f, speed);
    });
  };

  let warnedSpiral = false;
  for (let j = 0; j < F; j++) {
    const ring = s.floorBelow ? set.rings[0] : set.rings[j];
    const z = (j + 1) * s.layerHeight;
    const perimeter: Pt[] = [];
    for (let k = 0; k <= set.N; k++) {
      const m = k % set.N;
      perimeter.push([ring.xy[2 * m], ring.xy[2 * m + 1]]);
    }
    const offsets = new FloorOffsets(perimeter.slice(0, set.N));
    const inner = offsets.at(spacing);

    let pattern = s.floorPattern;
    if (pattern === 'spiral' && !spiralFits(perimeter, inner)) {
      pattern = 'insets';
      if (!warnedSpiral) {
        set.warnings.push(
          'Floor: the spiral pattern needs a nearly round or convex shape; concentric inset curves were used instead.',
        );
        warnedSpiral = true;
      }
    }

    if (pattern === 'insets') {
      const fromTop = F - 1 - j;
      const loops = insetLoops(offsets, spacing);
      if (fromTop % 2 === 0) {
        // inside out: innermost loops first, ending on the outer contour at the seam
        for (let i = loops.length - 1; i >= 0; i--)
          for (const l of orderLoops(loops[i], path)) run(l, z, FEATURE_FLOOR);
        run(perimeter, z, FEATURE_WALL);
      } else {
        run(perimeter, z, FEATURE_WALL);
        for (const level of loops)
          for (const l of orderLoops(level, path)) run(l, z, FEATURE_FLOOR);
      }
    } else if (pattern === 'spiral') {
      const fromTop = F - 1 - j;
      const fill = spiralFill(startAt(inner[0], perimeter[0]), spacing, fromTop % 2 === 0);
      if (fromTop % 2 === 0) {
        run(fill, z, FEATURE_FLOOR);
        run(perimeter, z, FEATURE_WALL);
      } else {
        run(perimeter, z, FEATURE_WALL);
        run(fill, z, FEATURE_FLOOR);
      }
    } else {
      const base = (s.floorAngle * Math.PI) / 180;
      const turn = pattern === 'lines' ? (j % 2) * (Math.PI / 2) : 0;
      let fill = lineFill(inner, spacing, base + turn);
      if (pattern === 'grid') fill = fill.concat(lineFill(inner, spacing, base + Math.PI / 2));
      // one run per line: a jump across empty space (between arms) becomes a travel
      for (const seg of fill) run(seg, z, FEATURE_FLOOR);
      run(perimeter, z, FEATURE_WALL);
    }
  }
}

const SCALE = 1000; // clipper works on integers: micrometres

/**
 * Polygon offsetting of one floor outline (clipper). Moving a contour inward point by point
 * along its normals folds over itself in concave corners and collapses in narrow arms; a real
 * offset trims those, splits the area into several loops where it has to, and rounds the
 * inner corners.
 */
class FloorOffsets {
  private readonly poly: { X: number; Y: number }[];
  constructor(outline: Pt[]) {
    this.poly = outline.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
  }
  /** Loops (closed polygons, first point not repeated) at `d` mm inside the outline. */
  at(d: number): Pt[][] {
    const co = new ClipperLib.ClipperOffset(2, 0.02 * SCALE);
    co.AddPath(this.poly, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const out: { X: number; Y: number }[][] = [];
    co.Execute(out, -d * SCALE);
    return out
      .map((p) => p.map((q): Pt => [q.X / SCALE, q.Y / SCALE]))
      .map((p) => (area(p) < 0 ? p.reverse() : p)) // all counter-clockwise, like the walls
      .filter((p) => p.length > 2 && Math.abs(area(p)) > d * d * 0.25);
  }
}

/** The spiral scales the outline about its centre: only right for shapes that are nearly convex. */
function spiralFits(outline: Pt[], inner: Pt[][]): boolean {
  if (inner.length !== 1) return false;
  const a = Math.abs(area(outline));
  const hull = Math.abs(area(convexHull(outline)));
  return a > 0.96 * hull;
}

function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** All concentric levels: level i holds the loops at i line spacings inside the contour. */
function insetLoops(offsets: FloorOffsets, spacing: number): Pt[][][] {
  const levels: Pt[][][] = [];
  for (let i = 1; i < 600; i++) {
    const loops = offsets.at(spacing * i);
    if (!loops.length) break;
    levels.push(loops);
  }
  return levels;
}

/**
 * Close every loop and start it at the point nearest to where the nozzle is, loops taken
 * nearest first, so the joins between loops are short.
 */
function orderLoops(loops: Pt[][], path: PathBuilder): Pt[][] {
  const left = loops.slice();
  const out: Pt[][] = [];
  let x = path.count ? path.xyz[3 * (path.count - 1)] : 0;
  let y = path.count ? path.xyz[3 * (path.count - 1) + 1] : 0;
  while (left.length) {
    let bi = 0;
    let bk = 0;
    let bd = Infinity;
    left.forEach((l, i) =>
      l.forEach(([px, py], k) => {
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
          bk = k;
        }
      }),
    );
    const l = left.splice(bi, 1)[0];
    const rot = l.slice(bk).concat(l.slice(0, bk));
    rot.push(rot[0]);
    out.push(rot);
    [x, y] = rot[0];
  }
  return out;
}

const area = (p: Pt[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
};

/** The loop rotated so it starts at the point nearest to `to` (the seam). */
function startAt(loop: Pt[], to: Pt): Pt[] {
  let bk = 0;
  let bd = Infinity;
  loop.forEach(([x, y], k) => {
    const d = (x - to[0]) ** 2 + (y - to[1]) ** 2;
    if (d < bd) {
      bd = d;
      bk = k;
    }
  });
  return loop.slice(bk).concat(loop.slice(0, bk));
}

/** Spiral from the inset ring (starting at its first point = the seam) to the centre, or the reverse. */
function spiralFill(inner: Pt[], spacing: number, outward: boolean): Pt[] {
  const N = inner.length;
  const a = area(inner);
  if (!(a > spacing * spacing)) return [];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of inner) {
    cx += x;
    cy += y;
  }
  cx /= N;
  cy /= N;
  const rEff = Math.sqrt(a / Math.PI);
  const revs = Math.max(1, Math.ceil(rEff / spacing));
  const s0 = Math.max(0.002, (0.5 * spacing) / rEff);
  const total = revs * N;
  const pts: Pt[] = [];
  for (let q = 0; q <= total; q++) {
    const m = outward ? q : total - q;
    const scale = s0 + (1 - s0) * (m / total);
    const [px, py] = inner[m % N];
    pts.push([cx + (px - cx) * scale, cy + (py - cy) * scale]);
  }
  return pts;
}

/** Parallel lines through the polygon at `angle`, joined end to end in a zigzag. */
function lineFill(polys: Pt[][], spacing: number, angle: number): Pt[][] {
  if (!polys.length) return [];
  const c = Math.cos(-angle);
  const sn = Math.sin(-angle);
  // rotate so the lines run along x
  const rs = polys.map((poly) => poly.map(([x, y]): Pt => [x * c - y * sn, x * sn + y * c]));
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const r of rs)
    for (const [, y] of r) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const out: Pt[][] = [];
  const back = (x: number, y: number): Pt => [x * c + y * sn, -x * sn + y * c];
  let flip = false;
  for (let y = y0 + spacing / 2; y < y1; y += spacing) {
    const xs: number[] = [];
    for (const r of rs)
      for (let i = 0; i < r.length; i++) {
        const [ax, ay] = r[i];
        const [bx, by] = r[(i + 1) % r.length];
        if (ay <= y !== by <= y) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    xs.sort((p, q) => p - q);
    const segs: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) segs.push([xs[i], xs[i + 1]]);
    if (flip) segs.reverse();
    for (const [a, b] of segs) {
      const [p, q] = flip ? [b, a] : [a, b];
      out.push([back(p, y), back(q, y)]);
    }
    flip = !flip;
  }
  return out;
}
