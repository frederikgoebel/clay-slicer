import { angleU } from '../textures/mask';
import {
  dwellSeconds,
  needsCurvature,
  flowFactor,
  radialOffset,
  twistAngle,
  type TexCtx,
} from '../textures/textures';
import { FEATURE_TOP, FEATURE_TRAVEL, FEATURE_WALL, type SliceSettings } from '../types';
import { blobLift } from '../textures/textures';
import type { PathBuilder } from './PathBuilder';
import { floorBelowLayers, floorInsideLayers, type Ring, type RingSet } from './rings';

const TAU = 2 * Math.PI;
const MIN_SPEED = 5;

/**
 * Wall radius per angle for one planar ring: the outermost crossing of a ray from (cx, cy) with a
 * wall segment (top-surface segments are skipped). NaN where the ring has no wall at that angle.
 */
function polarProfile(A: Ring, N: number, M: number, cx: number, cy: number): Float64Array {
  const out = new Float64Array(M).fill(NaN);
  const step = TAU / M;
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    if (A.cap[k] && A.cap[k2]) continue;
    const x1 = A.xy[2 * k] - cx;
    const y1 = A.xy[2 * k + 1] - cy;
    const dx = A.xy[2 * k2] - A.xy[2 * k];
    const dy = A.xy[2 * k2 + 1] - A.xy[2 * k + 1];
    const a1 = Math.atan2(y1, x1);
    let d = Math.atan2(y1 + dy, x1 + dx) - a1;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    if (Math.abs(d) > 0.9 * Math.PI) continue; // passes the centre: not a wall seen from it
    const lo = Math.min(a1, a1 + d);
    const hi = Math.max(a1, a1 + d);
    for (let b = Math.ceil(lo / step); b <= Math.floor(hi / step); b++) {
      const th = b * step;
      const ux = Math.cos(th);
      const uy = Math.sin(th);
      const den = ux * dy - uy * dx;
      if (Math.abs(den) < 1e-12) continue;
      const r = (x1 * dy - y1 * dx) / den;
      const u = (x1 * uy - y1 * ux) / den;
      if (r <= 0 || u < -1e-6 || u > 1 + 1e-6) continue;
      const bi = ((b % M) + M) % M;
      if (!(out[bi] >= r)) out[bi] = r;
    }
  }
  return out;
}

/** Fill NaN gaps in a circular array by linear interpolation from the nearest values. */
function fillCircular(v: ArrayLike<number> & { [i: number]: number }, M: number): boolean {
  let any = false;
  for (let i = 0; i < M; i++) if (!Number.isNaN(v[i])) any = true;
  if (!any) return false;
  for (let i = 0; i < M; i++) {
    if (!Number.isNaN(v[i])) continue;
    let a = 1;
    while (Number.isNaN(v[(i - a + M) % M])) a++;
    let b = 1;
    while (Number.isNaN(v[(i + b) % M])) b++;
    const va = v[(i - a + M) % M];
    const vb = v[(i + b) % M];
    v[i] = va + ((vb - va) * a) / (a + b);
  }
  return true;
}

/**
 * Height of the top (rim) of the wall at every angle. Where the planar cut for layer j hits the
 * wall/top-surface junction, the rim height there is known exactly; the rest is interpolated
 * around the circle. Returns null when the wall is as tall as the model all the way round.
 */
function rimHeights(
  rings: Ring[],
  wall: Float64Array[],
  N: number,
  M: number,
  cx: number,
  cy: number,
  h: number,
  zmax: number,
): Float64Array | null {
  const L = rings.length;
  const samples: [number, number][] = [];
  for (let j = 0; j < L; j++) {
    const A = rings[j];
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      if (!!A.cap[k] === !!A.cap[k2]) continue;
      const w = A.cap[k] ? k2 : k; // the wall point of the junction
      const a = Math.atan2(A.xy[2 * w + 1] - cy, A.xy[2 * w] - cx);
      samples.push([((a % TAU) + TAU) % TAU, (j + 0.5) * h]);
    }
  }
  if (!samples.length) return null;
  // the highest point: the middle of the angles where the wall still exists in the last ring
  const lastRing = wall[L - 1];
  const peak: number[] = [];
  for (let b = 0; b < M; b++) if (!Number.isNaN(lastRing[b])) peak.push(b);
  if (peak.length && peak.length < M) {
    // circular middle of the run
    let start = peak[0];
    for (const b of peak) if (Number.isNaN(lastRing[(b - 1 + M) % M])) start = b;
    samples.push([((start + peak.length / 2) * TAU) / M, zmax]);
  }
  samples.sort((a, b) => a[0] - b[0]);
  const T = new Float64Array(M);
  const n = samples.length;
  for (let b = 0; b < M; b++) {
    const th = (b * TAU) / M;
    let i = samples.findIndex((s) => s[0] > th);
    if (i < 0) i = 0;
    const next = samples[i];
    const prev = samples[(i - 1 + n) % n];
    let span = next[0] - prev[0];
    let into = th - prev[0];
    if (span <= 0) span += TAU;
    if (into < 0) into += TAU;
    T[b] = span < 1e-9 ? next[1] : prev[1] + ((next[1] - prev[1]) * into) / span;
  }
  return T;
}

/**
 * Wall with a layer height that varies around the object ("follow the top"). The layer surfaces
 * are stretched between the floor and the local top: surface f (0..1) lies at
 * z = zStart + f * (top(angle) - zStart). Where the top is lower the layers are thinner, and the
 * last turn runs exactly along the rim, so a slanted or wavy top is one continuous line.
 * The clay per mm follows the local thickness. (Idea: variable-thickness / curved-layer slicing,
 * e.g. CurviSlicer and QuickCurve; here the slicing surface is a simple height field.)
 */
export function addVariableWall(path: PathBuilder, set: RingSet, s: SliceSettings): string[] {
  const { rings, N, layers: L, zmax } = set;
  const warnings: string[] = [];
  const h = s.layerHeight;
  const F = floorInsideLayers(s);
  const zOff = floorBelowLayers(s) * h;
  const j0 = Math.max(F - 1, 0);
  const zs = (j0 + 1) * h;
  const M = N;
  const step = TAU / M;

  let cx = 0;
  let cy = 0;
  for (const A of rings) {
    cx += A.cx / L;
    cy += A.cy / L;
  }
  const wall = rings.map((A) => polarProfile(A, N, M, cx, cy));
  const T = rimHeights(rings, wall, N, M, cx, cy, h, zmax) ?? new Float64Array(M).fill(zmax);

  // radius table without gaps: along height first, then around
  const R = wall.map((w) => Float64Array.from(w));
  let gaps = false;
  for (let b = 0; b < M; b++) {
    let last = NaN;
    for (let j = 0; j < L; j++) {
      if (Number.isNaN(R[j][b])) R[j][b] = last;
      else last = R[j][b];
    }
    for (let j = L - 1, next = NaN; j >= 0; j--) {
      if (Number.isNaN(R[j][b])) R[j][b] = next;
      else next = R[j][b];
    }
    if (Number.isNaN(R[0][b])) gaps = true;
  }
  if (gaps) {
    for (let j = 0; j < L; j++) if (!fillCircular(R[j], M)) throw new Error('No wall found.');
    warnings.push(
      'Some angles have no wall in the slice; they were filled in from their neighbours.',
    );
  }

  let tMax = 0;
  for (let b = 0; b < M; b++) tMax = Math.max(tMax, T[b]);
  const Ln = Math.max(2, Math.ceil((tMax - zs) / h - 1e-9));
  let thMin = Infinity;
  for (let b = 0; b < M; b++) thMin = Math.min(thMin, (T[b] - zs) / Ln);
  if (thMin < 0.4 * h)
    warnings.push(
      `Follow the top: layers get as thin as ${thMin.toFixed(2)} mm where the rim is lowest (set ${h} mm). Very thin layers are hard to print; use a smaller height difference or the open-lines option.`,
    );

  const H = zmax;
  const textures = s.textures;
  const liftMm = blobLift(textures);
  const dir = (b: number) => [Math.cos(b * step), Math.sin(b * step)] as const;
  const radius = (b: number, zr: number): number => {
    const u = Math.min(L - 1, Math.max(0, zr / h - 0.5));
    const j = Math.min(L - 2, Math.floor(u));
    const w = u - j;
    return R[j][b] * (1 - w) + R[j + 1][b] * w;
  };
  const ringSpeed = (zr: number) => {
    if (s.minLayerTime <= 0) return s.printSpeed;
    const j = Math.min(L - 1, Math.max(0, Math.round(zr / h - 0.5)));
    return Math.min(s.printSpeed, Math.max(MIN_SPEED, rings[j].perimeter / s.minLayerTime));
  };

  // curvature of the wall outline at every bin and ring, from the polar radius r(angle)
  const curved = needsCurvature(textures);
  const K = curved
    ? R.map((r) => {
        const out = new Float64Array(M);
        for (let b = 0; b < M; b++) {
          const at = (i: number) => r[(i + M * 4) % M];
          const d1 = (at(b + 2) - at(b - 2)) / (4 * step);
          const d2 = (at(b + 2) - 2 * at(b) + at(b - 2)) / (4 * step * step);
          out[b] = (r[b] * r[b] + 2 * d1 * d1 - r[b] * d2) / Math.pow(r[b] * r[b] + d1 * d1, 1.5);
        }
        return out;
      })
    : null;
  const curvatureAtZ = (b: number, zr: number): number => {
    if (!K) return 0;
    const u = Math.min(L - 1, Math.max(0, zr / h - 0.5));
    const j = Math.min(L - 2, Math.floor(u));
    return K[j][b] * (1 - (u - j)) + K[j + 1][b] * (u - j);
  };
  const prev = new Float64Array(2 * M).fill(NaN);
  let arc = 0;
  const point = (b: number, f: number, t: number, feature: number, useOverhang: boolean) => {
    const bb = ((b % M) + M) % M;
    const top = T[bb];
    const th = (top - zs) / Ln;
    const zr = zs + f * (top - zs);
    const [nx, ny] = dir(bb);
    const r = radius(bb, zr);
    const bx = cx + nx * r;
    const by = cy + ny * r;
    const ctx: TexCtx = {
      z: zr,
      H,
      t,
      arc,
      zStart: F * h,
      fadeIn: s.textureFadeIn,
      lh: th,
      u: angleU(bx, by),
      v: zr / zmax,
      ang: bb * step,
      rad: r,
      curv: curvatureAtZ(bb, zr),
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
    if (useOverhang && feature === FEATURE_WALL && !Number.isNaN(prev[2 * bb])) {
      const out = (x - prev[2 * bb]) * nx + (y - prev[2 * bb + 1]) * ny;
      overhang = Math.max(0, (Math.atan2(out, th) * 180) / Math.PI);
    }
    prev[2 * bb] = x;
    prev[2 * bb + 1] = y;
    const dwell = textures.length ? dwellSeconds(textures, ctx, th, 1 / N) : 0;
    path.push(
      x,
      y,
      zr + zOff,
      path.count === 0 ? FEATURE_TRAVEL : feature,
      ringSpeed(zr),
      overhang,
      dwell,
      dwell > 0 ? liftMm : 0,
      th,
      textures.length ? flowFactor(textures, ctx) : 1,
    );
    arc += (TAU * r) / M;
  };

  // the path starts where the seam is (angle of the first ring's first point)
  const A0 = rings[j0];
  const a0 = ((Math.atan2(A0.xy[1] - cy, A0.xy[0] - cx) % TAU) + TAU) % TAU;
  const b0 = Math.round(a0 / step) % M;

  if (s.mode === 'spiral') {
    for (let k = 0; k < Ln; k++)
      for (let i = 0; i < N; i++) {
        const f = (k + i / N) / Ln;
        point(b0 + i, f, i / N, FEATURE_WALL, true);
      }
    point(b0, 1, 0, FEATURE_WALL, true);
    if (s.topFinish) for (let i = 1; i <= N; i++) point(b0 + i, 1, i / N, FEATURE_TOP, false);
  } else {
    for (let k = 0; k < Ln; k++) {
      const f = (k + 1) / Ln;
      for (let i = 0; i <= N; i++) point(b0 + i, f, i / N, FEATURE_WALL, true);
    }
  }
  return warnings;
}
