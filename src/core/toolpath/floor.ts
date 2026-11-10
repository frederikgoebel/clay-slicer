import { FEATURE_FLOOR, FEATURE_TRAVEL, FEATURE_WALL, type SliceSettings } from '../types';
import { nominalWidth } from './bead';
import type { PathBuilder } from './PathBuilder';
import { floorLayerCount, type Ring, type RingSet } from './rings';

type Pt = [number, number];

/**
 * Floor. Every floor layer is a closed outer loop on the model's contour (so the outer shell is
 * complete from the first layer) plus a fill that sits one line spacing inside it:
 *
 *  - spiral: one continuous spiral per layer; layers alternate in/out so the last one ends at the
 *    seam, exactly where the wall starts
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

  for (let j = 0; j < F; j++) {
    const ring = set.rings[j];
    const z = (j + 1) * s.layerHeight;
    const perimeter: Pt[] = [];
    for (let k = 0; k <= set.N; k++) {
      const m = k % set.N;
      perimeter.push([ring.xy[2 * m], ring.xy[2 * m + 1]]);
    }
    const inner = insetRing(ring, set.N, spacing);

    if (s.floorPattern === 'spiral') {
      const fromTop = F - 1 - j;
      const fill = spiralFill(inner, set.N, spacing, fromTop % 2 === 0);
      if (fromTop % 2 === 0) {
        run(fill, z, FEATURE_FLOOR);
        run(perimeter, z, FEATURE_WALL);
      } else {
        run(perimeter, z, FEATURE_WALL);
        run(fill, z, FEATURE_FLOOR);
      }
    } else {
      const base = (s.floorAngle * Math.PI) / 180;
      const turn = s.floorPattern === 'lines' ? (j % 2) * (Math.PI / 2) : 0;
      let fill = lineFill(inner, spacing, base + turn);
      if (s.floorPattern === 'grid')
        fill = fill.concat(lineFill(inner, spacing, base + Math.PI / 2));
      run(fill, z, FEATURE_FLOOR);
      run(perimeter, z, FEATURE_WALL);
    }
  }
}

/** The ring moved inward by `d` along its normals. */
function insetRing(r: Ring, N: number, d: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < N; k++)
    out.push([r.xy[2 * k] - r.nxy[2 * k] * d, r.xy[2 * k + 1] - r.nxy[2 * k + 1] * d]);
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

/** Spiral from the inset ring (starting at its first point = the seam) to the centre, or the reverse. */
function spiralFill(inner: Pt[], N: number, spacing: number, outward: boolean): Pt[] {
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
function lineFill(poly: Pt[], spacing: number, angle: number): Pt[] {
  if (!(area(poly) > spacing * spacing)) return [];
  const c = Math.cos(-angle);
  const sn = Math.sin(-angle);
  // rotate so the lines run along x
  const r = poly.map(([x, y]): Pt => [x * c - y * sn, x * sn + y * c]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of r) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const out: Pt[] = [];
  const back = (x: number, y: number): Pt => [x * c + y * sn, -x * sn + y * c];
  let flip = false;
  for (let y = y0 + spacing / 2; y < y1; y += spacing) {
    const xs: number[] = [];
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
      out.push(back(p, y), back(q, y));
    }
    flip = !flip;
  }
  return out;
}
