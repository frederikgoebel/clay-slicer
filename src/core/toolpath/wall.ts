import { angleU } from '../textures/mask';
import { dwellSeconds, radialOffset, twistAngle, type TexCtx } from '../textures/textures';
import { FEATURE_TOP, FEATURE_TRAVEL, FEATURE_WALL, type SliceSettings } from '../types';
import type { PathBuilder } from './PathBuilder';
import { floorLayerCount, type Ring, type RingSet } from './rings';

const MIN_SPEED = 5;

/** Wall: a continuous spiral (or stacked rings) with textures applied along the normals. */
export function addWall(path: PathBuilder, set: RingSet, s: SliceSettings): void {
  const { rings, N, layers: L, zmax } = set;
  const h = s.layerHeight;
  const F = floorLayerCount(s);
  const H = L * h;
  const zStart = F * h;
  const textures = s.textures;
  let idx = 0;

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

    const ctx: TexCtx = {
      z,
      H,
      t,
      idx,
      spacing: A.perimeter / N,
      zStart,
      fadeIn: s.textureFadeIn,
      u: angleU(bx, by),
      v: z / zmax,
      ang: Math.atan2(by - cy, bx - cx),
      rad: Math.hypot(bx - cx, by - cy),
    };
    const off = textures.length ? radialOffset(textures, ctx) : 0;
    let x = bx + nx * off;
    let y = by + ny * off;
    const tw = textures.length ? twistAngle(textures, z, H) : 0;
    if (tw !== 0) {
      const dx = x - cx;
      const dy = y - cy;
      const c = Math.cos(tw);
      const sn = Math.sin(tw);
      x = cx + dx * c - dy * sn;
      y = cy + dx * sn + dy * c;
    }
    let overhang = 0;
    if (prev && feature === FEATURE_WALL) {
      const out = (x - prev[2 * kk]) * nx + (y - prev[2 * kk + 1]) * ny;
      overhang = Math.max(0, (Math.atan2(out, h) * 180) / Math.PI);
    }
    cur[2 * kk] = x;
    cur[2 * kk + 1] = y;
    const dwell = textures.length ? dwellSeconds(textures, ctx, h, 1 / N) : 0;
    // without a floor the path starts here, with a travel to the first point
    path.push(x, y, z, path.count === 0 ? FEATURE_TRAVEL : feature, speed, overhang, dwell);
    idx++;
  };

  let prev: Float64Array | null = null;
  const scratch = () => new Float64Array(2 * N);

  if (s.mode === 'spiral') {
    const j0 = Math.max(F - 1, 0); // with no floor the spiral starts at the bed
    for (let r = 0; r < L - 1 - j0; r++) {
      const j = j0 + r;
      const A = rings[j];
      const B = rings[j + 1];
      const speed = ringSpeed((A.perimeter + B.perimeter) / 2);
      const cur = scratch();
      for (let k = 0; k < N; k++) {
        const f = k / N;
        point(A, B, f, k, (j + 1 + f) * h, f, speed, prev, cur, FEATURE_WALL);
      }
      prev = cur;
    }
    // closing point on the top contour, then an optional flat finishing ring
    const top = rings[L - 1];
    const speed = ringSpeed(top.perimeter);
    point(top, null, 0, 0, L * h, 0, speed, prev, scratch(), FEATURE_WALL);
    if (s.topFinish) {
      for (let k = 1; k <= N; k++)
        point(top, null, 0, k, L * h, k / N, speed, null, scratch(), FEATURE_TOP);
    }
  } else {
    for (let r = 0; r < L - F; r++) {
      const j = F + r;
      const A = rings[j];
      const speed = ringSpeed(A.perimeter);
      const cur = scratch();
      for (let k = 0; k <= N; k++)
        point(A, null, 0, k, (j + 1) * h, k / N, speed, prev, cur, FEATURE_WALL);
      prev = cur;
    }
  }
}
