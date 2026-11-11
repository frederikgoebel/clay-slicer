import { curvatureAt } from '../geometry/contour';
import { angleU } from '../textures/mask';
import {
  blobLift,
  dwellSeconds,
  needsCurvature,
  radialOffset,
  twistAngle,
  type TexCtx,
} from '../textures/textures';
import { FEATURE_TOP, FEATURE_TRAVEL, FEATURE_WALL, type SliceSettings } from '../types';
import { nominalWidth } from './bead';
import type { PathBuilder } from './PathBuilder';
import { arcRuns, hasTop, outsideRoute, pushTravel, TRAVEL_CLEAR, type Pt2 } from './travel';
import { floorBelowLayers, floorInsideLayers, type Ring, type RingSet } from './rings';

const MIN_SPEED = 5;

/** Wall: a continuous spiral (or stacked rings) with textures applied along the normals. */
export function addWall(path: PathBuilder, set: RingSet, s: SliceSettings): void {
  const { rings, N, layers: L, zmax } = set;
  const h = s.layerHeight;
  const F = floorInsideLayers(s);
  /** a floor printed below the model lifts the whole wall */
  const zOff = floorBelowLayers(s) * h;
  const H = L * h;
  const zStart = F * h;
  const textures = s.textures;
  let idx = 0;
  const liftMm = blobLift(textures);
  const curved = needsCurvature(textures);

  const ringSpeed = (len: number) =>
    s.minLayerTime > 0
      ? Math.min(s.printSpeed, Math.max(MIN_SPEED, len / s.minLayerTime))
      : s.printSpeed;

  /** Add one wall point; writes its final xy into `cur` so the next ring can measure overhang. */
  const point = (
    A: Ring,
    B: Ring | null,
    f: number,
    k: number,
    z: number,
    t: number,
    speed: number,
    prev: Float64Array | null,
    cur: Float64Array,
    feature: number,
    /** arrive here with a travel move (hop, optional outside route) instead of extruding */
    travel = false,
    route?: Pt2[],
  ) => {
    const kk = k % N;
    let bx = A.xy[2 * kk];
    let by = A.xy[2 * kk + 1];
    let nx = A.nxy[2 * kk];
    let ny = A.nxy[2 * kk + 1];
    let cx = A.cx;
    let cy = A.cy;
    if (B && f > 0) {
      bx += (B.xy[2 * kk] - bx) * f;
      by += (B.xy[2 * kk + 1] - by) * f;
      nx += (B.nxy[2 * kk] - nx) * f;
      ny += (B.nxy[2 * kk + 1] - ny) * f;
      cx += (B.cx - cx) * f;
      cy += (B.cy - cy) * f;
    }
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;

    const zr = z - zOff; // height within the model
    const ctx: TexCtx = {
      z: zr,
      H,
      t,
      idx,
      spacing: A.perimeter / N,
      zStart,
      fadeIn: s.textureFadeIn,
      lh: h,
      u: angleU(bx, by),
      v: zr / zmax,
      ang: Math.atan2(by - cy, bx - cx),
      rad: Math.hypot(bx - cx, by - cy),
      curv: curved ? curvatureAt(A.nxy, kk, N, A.perimeter) : 0,
    };
    const off = textures.length ? radialOffset(textures, ctx) : 0;
    let x = bx + nx * off;
    let y = by + ny * off;
    const tw = textures.length ? twistAngle(textures, zr, H) : 0;
    if (tw !== 0) {
      const dx = x - cx;
      const dy = y - cy;
      const c = Math.cos(tw);
      const sn = Math.sin(tw);
      x = cx + dx * c - dy * sn;
      y = cy + dx * sn + dy * c;
    }
    let overhang = 0;
    if (prev && feature === FEATURE_WALL && !Number.isNaN(prev[2 * kk])) {
      const out = (x - prev[2 * kk]) * nx + (y - prev[2 * kk + 1]) * ny;
      overhang = Math.max(0, (Math.atan2(out, h) * 180) / Math.PI);
    }
    cur[2 * kk] = x;
    cur[2 * kk + 1] = y;
    const dwell = textures.length ? dwellSeconds(textures, ctx, h, 1 / N) : 0;
    // without a floor the path starts here, with a travel to the first point
    const lift = dwell > 0 ? liftMm : 0;
    if (travel) {
      pushTravel(path, s, x, y, z, route);
      idx++;
      return;
    }
    path.push(x, y, z, path.count === 0 ? FEATURE_TRAVEL : feature, speed, overhang, dwell, lift);
    idx++;
  };

  let prev: Float64Array | null = null;
  const scratch = () => new Float64Array(2 * N).fill(NaN);

  const open = s.topCurves === 'open';
  const joinDist = 2.5 * nominalWidth(s);
  let lastK = 0;

  /**
   * One layer as open lines: the stretches of the contour that are not top surface. Every line is
   * a separate extrusion; the moves between them rise by the Z hop and run outside the wall.
   */
  const emitArcs = (j: number) => {
    const A = rings[j];
    const z = (j + 1) * h + zOff;
    const speed = ringSpeed(A.perimeter);
    const cur = scratch();
    const left = arcRuns(A.cap, N);
    while (left.length) {
      const n = path.count - 1;
      const lx = n >= 0 ? path.xyz[3 * n] : A.xy[0];
      const ly = n >= 0 ? path.xyz[3 * n + 1] : A.xy[1];
      let bi = 0;
      let rev = false;
      let bd = Infinity;
      left.forEach((run, i) => {
        for (const [r, k] of [
          [false, run[0]],
          [true, run[run.length - 1]],
        ] as const) {
          const d = Math.hypot(A.xy[2 * k] - lx, A.xy[2 * k + 1] - ly);
          if (d < bd) {
            bd = d;
            bi = i;
            rev = r;
          }
        }
      });
      const run = left.splice(bi, 1)[0];
      if (rev) run.reverse();
      const needTravel = n < 0 || bd > joinDist;
      const route =
        needTravel && n >= 0 ? outsideRoute(A, N, lastK, run[0], TRAVEL_CLEAR) : undefined;
      run.forEach((k, m) => {
        point(
          A,
          null,
          0,
          k,
          z,
          k / N,
          speed,
          prev,
          cur,
          FEATURE_WALL,
          m === 0 && needTravel,
          route,
        );
      });
      lastK = run[run.length - 1] % N;
    }
    prev = cur;
  };

  if (s.mode === 'spiral') {
    const j0 = Math.max(F - 1, 0); // with no floor the spiral starts at the bed
    // with open top curves the spiral runs up to the first layer that has a top surface; from
    // there on each layer is printed as open lines
    let capFrom = -1;
    if (open)
      for (let j = j0; j < L; j++)
        if (hasTop(rings[j])) {
          capFrom = j;
          break;
        }
    const jEnd = capFrom >= 0 ? Math.max(capFrom, j0) : L - 1;
    for (let j = j0; j < jEnd; j++) {
      const A = rings[j];
      const B = rings[j + 1];
      const speed = ringSpeed((A.perimeter + B.perimeter) / 2);
      const cur = scratch();
      for (let k = 0; k < N; k++) {
        const f = k / N;
        point(A, B, f, k, (j + 1 + f) * h + zOff, f, speed, prev, cur, FEATURE_WALL);
      }
      prev = cur;
    }
    if (capFrom >= 0) {
      for (let j = jEnd; j < L; j++) emitArcs(j);
      return;
    }
    // closing point on the top contour, then an optional flat finishing ring
    const top = rings[L - 1];
    const speed = ringSpeed(top.perimeter);
    point(top, null, 0, 0, L * h + zOff, 0, speed, prev, scratch(), FEATURE_WALL);
    if (s.topFinish) {
      for (let k = 1; k <= N; k++)
        point(top, null, 0, k, L * h + zOff, k / N, speed, null, scratch(), FEATURE_TOP);
    }
  } else {
    for (let r = 0; r < L - F; r++) {
      const j = F + r;
      if (open) {
        emitArcs(j);
        continue;
      }
      const A = rings[j];
      const speed = ringSpeed(A.perimeter);
      const cur = scratch();
      for (let k = 0; k <= N; k++)
        point(A, null, 0, k, (j + 1) * h + zOff, k / N, speed, prev, cur, FEATURE_WALL);
      prev = cur;
    }
  }
}
