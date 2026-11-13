/** 2D closed-loop helpers. Loops are flat [x0,y0,x1,y1,...], implicitly closed. */

export function signedArea(p: Float64Array): number {
  const n = p.length / 2;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return a / 2;
}

export function centroid(p: Float64Array): [number, number] {
  const n = p.length / 2;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const c = p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
    a += c;
    cx += (p[2 * i] + p[2 * j]) * c;
    cy += (p[2 * i + 1] + p[2 * j + 1]) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += p[2 * i];
      sy += p[2 * i + 1];
    }
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

const SEAM_EPS = 1e-9;

/** Point where a ray from (cx,cy) at `ang` radians leaves the loop (outermost hit). */
export function findSeam(
  p: Float64Array,
  cx: number,
  cy: number,
  ang: number,
): { i: number; u: number } {
  const n = p.length / 2;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let best = -1;
  let bestU = 0;
  let bestS = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = p[2 * j] - p[2 * i];
    const ey = p[2 * j + 1] - p[2 * i + 1];
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const wx = p[2 * i] - cx;
    const wy = p[2 * i + 1] - cy;
    const s = (wx * ey - wy * ex) / denom;
    const u = (wx * dy - wy * dx) / denom;
    // a small tolerance: a ray that goes exactly through a vertex must not slip between the two edges
    if (u >= -SEAM_EPS && u < 1 + SEAM_EPS && s > 0 && s > bestS + 1e-9) {
      bestS = s;
      best = i;
      bestU = Math.min(1 - 1e-12, Math.max(0, u));
    }
  }
  if (best >= 0) return { i: best, u: bestU };
  // centroid outside the loop (e.g. C-shape): vertex furthest along the ray
  let bi = 0;
  let bd = -Infinity;
  for (let i = 0; i < n; i++) {
    const d = (p[2 * i] - cx) * dx + (p[2 * i + 1] - cy) * dy;
    if (d > bd) {
      bd = d;
      bi = i;
    }
  }
  return { i: bi, u: 0 };
}

/** A vertex that turns the outline by more than this (about 25 degrees) counts as a sharp corner. */
const CORNER_COS = Math.cos((25 * Math.PI) / 180);

/** Resample to N points uniformly by arc length, starting at the seam point. */
export function resample(
  p: Float64Array,
  seam: { i: number; u: number },
  N: number,
  flags?: Uint8Array,
): { xy: Float64Array; perimeter: number; flag: Uint8Array } {
  const n = p.length / 2;
  const { i, u } = seam;
  const j = (i + 1) % n;
  const sx = p[2 * i] + u * (p[2 * j] - p[2 * i]);
  const sy = p[2 * i + 1] + u * (p[2 * j + 1] - p[2 * i + 1]);
  // polyline: S, p[i+1] ... p[i], S
  const m = n + 2;
  const px = new Float64Array(m);
  const py = new Float64Array(m);
  px[0] = sx;
  py[0] = sy;
  for (let k = 0; k < n; k++) {
    const idx = (i + 1 + k) % n;
    px[k + 1] = p[2 * idx];
    py[k + 1] = p[2 * idx + 1];
  }
  px[m - 1] = sx;
  py[m - 1] = sy;
  const cum = new Float64Array(m);
  for (let k = 1; k < m; k++)
    cum[k] = cum[k - 1] + Math.hypot(px[k] - px[k - 1], py[k] - py[k - 1]);
  const perimeter = cum[m - 1];
  const out = new Float64Array(2 * N);
  const flag = new Uint8Array(N);
  let seg = 1;
  for (let k = 0; k < N; k++) {
    const d = (perimeter * k) / N;
    while (seg < m - 1 && cum[seg] < d) seg++;
    const span = cum[seg] - cum[seg - 1];
    const t = span > 1e-12 ? (d - cum[seg - 1]) / span : 0;
    out[2 * k] = px[seg - 1] + t * (px[seg] - px[seg - 1]);
    out[2 * k + 1] = py[seg - 1] + t * (py[seg] - py[seg - 1]);
    // polyline segment `seg` lies on original segment i (first and last piece) or i + seg - 1
    if (flags) flag[k] = flags[seg === 1 || seg === n + 1 ? i : (i + seg - 1) % n];
  }
  // Keep sharp corners: a uniform sampling cuts them off (by up to half a step), so the sample
  // nearest to each corner vertex is moved onto it. The point count stays the same.
  // Sharp corners: the sample nearest to a corner moves onto it. Only real polygon corners count
  // (both edges at least half a step long, so the noise of a dense outline is left alone) and
  // each sample is used once and never moves past its neighbours, so a snap cannot fold the path.
  const step = perimeter / N;
  let last = -1;
  for (let k = 1; k < m - 1; k++) {
    const ax = px[k] - px[k - 1];
    const ay = py[k] - py[k - 1];
    const bx = px[k + 1] - px[k];
    const by = py[k + 1] - py[k];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 0.5 * step || lb < 0.5 * step) continue;
    const cos = (ax * bx + ay * by) / (la * lb);
    if (cos > CORNER_COS) continue;
    const q = Math.round((cum[k] / perimeter) * N);
    if (q <= last || q >= N) continue;
    last = q;
    out[2 * q] = px[k];
    out[2 * q + 1] = py[k];
    if (flags) flag[q] = flags[(i + k) % n];
  }
  return { xy: out, perimeter, flag };
}

/** Outward unit normals for a counter-clockwise loop. */
export function normals(xy: Float64Array): Float64Array {
  const n = xy.length / 2;
  const out = new Float64Array(xy.length);
  for (let k = 0; k < n; k++) {
    const a = (k + n - 1) % n;
    const b = (k + 1) % n;
    const tx = xy[2 * b] - xy[2 * a];
    const ty = xy[2 * b + 1] - xy[2 * a + 1];
    const l = Math.hypot(tx, ty) || 1;
    out[2 * k] = ty / l;
    out[2 * k + 1] = -tx / l;
  }
  return out;
}

/**
 * Signed curvature (1/mm) of a closed loop at point k, from the turn of its normals over a window
 * of `win` points on each side. Positive = convex (bulging out of the material), negative =
 * concave. `perimeter` is the loop length, so spacing between points is perimeter / n.
 */
export function curvatureAt(
  nxy: Float64Array,
  k: number,
  n: number,
  perimeter: number,
  win = 2,
): number {
  const a = (k - win + n * 4) % n;
  const b = (k + win) % n;
  let d = Math.atan2(nxy[2 * b + 1], nxy[2 * b]) - Math.atan2(nxy[2 * a + 1], nxy[2 * a]);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const arc = (perimeter * 2 * win) / n;
  return arc > 0 ? d / arc : 0;
}
