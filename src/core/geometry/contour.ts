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
    if (u >= 0 && u < 1 && s > 0 && s > bestS) {
      bestS = s;
      best = i;
      bestU = u;
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

/** Resample to N points uniformly by arc length, starting at the seam point. */
export function resample(
  p: Float64Array,
  seam: { i: number; u: number },
  N: number,
): { xy: Float64Array; perimeter: number } {
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
  let seg = 1;
  for (let k = 0; k < N; k++) {
    const d = (perimeter * k) / N;
    while (seg < m - 1 && cum[seg] < d) seg++;
    const span = cum[seg] - cum[seg - 1];
    const t = span > 1e-12 ? (d - cum[seg - 1]) / span : 0;
    out[2 * k] = px[seg - 1] + t * (px[seg] - px[seg - 1]);
    out[2 * k + 1] = py[seg - 1] + t * (py[seg] - py[seg - 1]);
  }
  return { xy: out, perimeter };
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
