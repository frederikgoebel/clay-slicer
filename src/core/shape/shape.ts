/**
 * Drawn shape: closed outlines ("sections") placed at different heights and lofted into a solid.
 * A section is a free polygon (any number of vertices, drawn in a top-down view) with an optional
 * corner radius. Sections are resampled to the same number of points, aligned, and blended along
 * the height with a monotone cubic, so the result is not limited to rotary shapes.
 */
export type Vec = [number, number];

export interface ShapeSection {
  /** height, mm (the first section is always at 0) */
  z: number;
  /** outline vertices in the XY plane (top view), closed polygon */
  verts: Vec[];
  /** fillet radius at every corner, mm (0 = sharp) */
  corner: number;
  /** when set the section is a perfect circle (verts are kept for switching back) */
  circle: { cx: number; cy: number; r: number } | null;
  /** this layer's rotation about its centre, degrees (blends smoothly between sections) */
  rot: number;
}

export interface ShapeSpec {
  sections: ShapeSection[];
  /** extra twist over the whole height, degrees */
  twist: number;
}

export const MIN_GAP = 2;
export const MIN_VERTS = 3;
/** points per resampled outline ring */
export const RING_POINTS = 256;

export function regularPolygon(sides: number, radius: number, cx = 0, cy = 0, rot = 0): Vec[] {
  const n = Math.max(MIN_VERTS, Math.round(sides));
  return Array.from({ length: n }, (_, i): Vec => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  });
}

export const makeSection = (
  z: number,
  verts: Vec[],
  corner = 0,
  circle: ShapeSection['circle'] = null,
  rot = 0,
): ShapeSection => ({
  z,
  verts: verts.map(([x, y]): Vec => [x, y]),
  corner,
  circle: circle ? { ...circle } : null,
  rot,
});

/** A perfect circle section. Its polygon (for switching to free-form) is a regular 12-gon. */
export const circleSection = (z: number, r: number, cx = 0, cy = 0): ShapeSection =>
  makeSection(z, regularPolygon(12, r, cx, cy), 0, { cx, cy, r });

/** Centre of a section: the circle's centre, or the mean of the polygon's vertices. */
export const sectionCentre = (
  s: Pick<ShapeSection, 'verts'> & { circle?: ShapeSection['circle'] },
): Vec => (s.circle ? [s.circle.cx, s.circle.cy] : centroidOf(s.verts));

export function translateSection(s: ShapeSection, dx: number, dy: number): ShapeSection {
  return {
    ...s,
    verts: s.verts.map(([x, y]): Vec => [x + dx, y + dy]),
    circle: s.circle ? { ...s.circle, cx: s.circle.cx + dx, cy: s.circle.cy + dy } : null,
  };
}

/** Scale a section about its own centre. */
export function scaleSection(s: ShapeSection, f: number): ShapeSection {
  const [cx, cy] = sectionCentre(s);
  return {
    ...s,
    verts: s.verts.map(([x, y]): Vec => [cx + (x - cx) * f, cy + (y - cy) * f]),
    circle: s.circle ? { ...s.circle, r: Math.max(0.5, s.circle.r * f) } : null,
  };
}

/** Scale a section about its centre by separate X and Y factors (circles scale evenly). */
export function scaleSectionXY(s: ShapeSection, fx: number, fy: number): ShapeSection {
  if (s.circle) return scaleSection(s, Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy);
  const [cx, cy] = sectionCentre(s);
  return {
    ...s,
    verts: s.verts.map(([x, y]): Vec => [cx + (x - cx) * fx, cy + (y - cy) * fy]),
  };
}

/** Mean distance of the outline from its centre (the radius a circle would need). */
export function sectionRadius(s: Pick<ShapeSection, 'verts' | 'circle'>): number {
  if (s.circle) return s.circle.r;
  const [cx, cy] = centroidOf(s.verts);
  return s.verts.reduce((m, v) => m + Math.hypot(v[0] - cx, v[1] - cy), 0) / s.verts.length;
}

export const defaultShape = (): ShapeSpec => ({
  sections: [
    circleSection(0, 40),
    circleSection(70, 56),
    circleSection(140, 44),
    circleSection(190, 38),
  ],
  twist: 0,
});

export const shapeHeight = (spec: ShapeSpec): number => spec.sections[spec.sections.length - 1].z;

/**
 * Rotation (radians) of the outline at height z: the whole-shape twist plus the per-section
 * rotations blended with a monotone spline.
 */
export function rotationAt(spec: ShapeSpec): (z: number) => number {
  const secs = normalizeSections(spec.sections);
  const H = secs[secs.length - 1].z || 1;
  const rot = secs.some((s) => s.rot !== 0)
    ? pchip(
        secs.map((s) => s.z),
        secs.map((s) => s.rot),
      )
    : () => 0;
  return (z) => ((spec.twist * (z / H) + rot(z)) * Math.PI) / 180;
}

/** Sections sorted by height, the first at z=0, with a minimum gap between them. */
export function normalizeSections(sections: ShapeSection[]): ShapeSection[] {
  const sorted = [...sections].sort((a, b) => a.z - b.z);
  const out: ShapeSection[] = [];
  for (const s of sorted)
    out.push({ ...s, z: out.length === 0 ? 0 : Math.max(s.z, out[out.length - 1].z + MIN_GAP) });
  return out;
}

export function centroidOf(verts: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const v of verts) {
    x += v[0];
    y += v[1];
  }
  return [x / verts.length, y / verts.length];
}

const signedArea = (v: Vec[]): number => {
  let a = 0;
  for (let i = 0; i < v.length; i++) {
    const [x0, y0] = v[i];
    const [x1, y1] = v[(i + 1) % v.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
};

function coerceCircle(raw: unknown): ShapeSection['circle'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return ok(c.cx) && ok(c.cy) && ok(c.r) && c.r > 0 ? { cx: c.cx, cy: c.cy, r: c.r } : null;
}

/** Make an untrusted object (project file) a valid shape. */
export function coerceShape(raw: unknown): ShapeSpec {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const secs = Array.isArray(src.sections)
    ? src.sections
        .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        .map((s) => {
          const verts = Array.isArray(s.verts)
            ? s.verts
                .filter((v): v is unknown[] => Array.isArray(v) && v.length >= 2)
                .map((v): Vec => [num(v[0], 0), num(v[1], 0)])
            : [];
          return verts.length >= MIN_VERTS
            ? makeSection(
                num(s.z, 0),
                verts,
                Math.max(0, num(s.corner, 0)),
                coerceCircle(s.circle),
                num(s.rot, 0),
              )
            : null;
        })
        .filter((s): s is ShapeSection => s !== null)
    : [];
  return {
    sections: secs.length >= 2 ? normalizeSections(secs) : defaultShape().sections,
    twist: num(src.twist, 0),
  };
}

/**
 * The closed outline of a section as a dense polyline, counter-clockwise, with every corner
 * replaced by a fillet arc of the section's corner radius (clamped to fit the adjacent edges).
 */
export function sectionOutline(
  sec: Pick<ShapeSection, 'verts' | 'corner'> & { circle?: ShapeSection['circle'] },
): Vec[] {
  if (sec.circle) {
    const { cx, cy, r } = sec.circle;
    return Array.from({ length: RING_POINTS }, (_, i): Vec => {
      const a = (i / RING_POINTS) * Math.PI * 2;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
  }
  let v = sec.verts;
  if (signedArea(v) < 0) v = [...v].reverse();
  if (sec.corner <= 0) return v;
  const n = v.length;
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p = v[(i + n - 1) % n];
    const c = v[i];
    const q = v[(i + 1) % n];
    const ux = p[0] - c[0];
    const uy = p[1] - c[1];
    const wx = q[0] - c[0];
    const wy = q[1] - c[1];
    const lu = Math.hypot(ux, uy);
    const lw = Math.hypot(wx, wy);
    if (lu < 1e-6 || lw < 1e-6) {
      out.push(c);
      continue;
    }
    const cos = Math.max(-1, Math.min(1, (ux * wx + uy * wy) / (lu * lw)));
    const theta = Math.acos(cos); // interior angle at the corner
    if (theta > Math.PI - 0.02 || theta < 0.02) {
      out.push(c);
      continue;
    }
    const tan = Math.tan(theta / 2);
    const t = Math.min(sec.corner / tan, 0.5 * Math.min(lu, lw));
    const rad = t * tan;
    const a: Vec = [c[0] + (ux / lu) * t, c[1] + (uy / lu) * t];
    const b: Vec = [c[0] + (wx / lw) * t, c[1] + (wy / lw) * t];
    // arc centre lies on the bisector at distance rad / sin(theta/2)
    let bx = ux / lu + wx / lw;
    let by = uy / lu + wy / lw;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl;
    by /= bl;
    const d = rad / Math.sin(theta / 2);
    const cx = c[0] + bx * d;
    const cy = c[1] + by * d;
    const a0 = Math.atan2(a[1] - cy, a[0] - cx);
    const a1raw = Math.atan2(b[1] - cy, b[0] - cx);
    let da = a1raw - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 16)));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (da * k) / steps;
      out.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
    }
  }
  return out;
}

/**
 * Resample a closed polyline to exactly `m` points. Every outline vertex is kept as a sample
 * (points are shared out over the edges by length), so sharp corners stay sharp.
 */
export function resampleClosed(poly: Vec[], m: number): Float64Array {
  const n = poly.length;
  const len: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    len.push(l);
    total += l;
  }
  const out = new Float64Array(2 * m);
  if (total < 1e-9) {
    for (let k = 0; k < m; k++) {
      out[2 * k] = poly[0][0];
      out[2 * k + 1] = poly[0][1];
    }
    return out;
  }
  if (n > m) {
    // more outline points than samples: plain even spacing along the outline
    let e = 0;
    let acc = 0;
    for (let k = 0; k < m; k++) {
      const target = (k / m) * total;
      while (e < n - 1 && acc + len[e] < target) acc += len[e++];
      const t = len[e] > 0 ? (target - acc) / len[e] : 0;
      const a = poly[e];
      const b = poly[(e + 1) % n];
      out[2 * k] = a[0] + (b[0] - a[0]) * t;
      out[2 * k + 1] = a[1] + (b[1] - a[1]) * t;
    }
    return out;
  }
  const cnt = len.map((l) => Math.max(1, Math.round((m * l) / total)));
  let sum = cnt.reduce((a, b) => a + b, 0);
  while (sum !== m) {
    let best = 0;
    for (let i = 1; i < n; i++)
      if (sum > m ? cnt[i] > cnt[best] : len[i] / cnt[i] > len[best] / cnt[best]) best = i;
    if (sum > m && cnt[best] <= 1) break;
    cnt[best] += sum > m ? -1 : 1;
    sum += sum > m ? -1 : 1;
  }
  let k = 0;
  for (let i = 0; i < n && k < m; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = 0; j < cnt[i] && k < m; j++, k++) {
      const t = j / cnt[i];
      out[2 * k] = a[0] + (b[0] - a[0]) * t;
      out[2 * k + 1] = a[1] + (b[1] - a[1]) * t;
    }
  }
  return out;
}

/** Rotate the ring's start so it lines up with `ref` (least squared distance). */
function alignRing(ring: Float64Array, ref: Float64Array): Float64Array {
  const m = ring.length / 2;
  let best = 0;
  let bestCost = Infinity;
  for (let s = 0; s < m; s++) {
    let cost = 0;
    for (let j = 0; j < m && cost < bestCost; j++) {
      const k = (j + s) % m;
      const dx = ring[2 * k] - ref[2 * j];
      const dy = ring[2 * k + 1] - ref[2 * j + 1];
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  if (best === 0) return ring;
  const out = new Float64Array(ring.length);
  for (let j = 0; j < m; j++) {
    const k = (j + best) % m;
    out[2 * j] = ring[2 * k];
    out[2 * j + 1] = ring[2 * k + 1];
  }
  return out;
}

/** Every section as an aligned ring of `m` points (the first section sets the start). */
export function sectionRings(sections: ShapeSection[], m = RING_POINTS): Float64Array[] {
  const rings: Float64Array[] = [];
  for (const s of sections) {
    const r = resampleClosed(sectionOutline(s), m);
    rings.push(rings.length ? alignRing(r, rings[rings.length - 1]) : r);
  }
  return rings;
}

/**
 * Monotone cubic (Fritsch-Carlson) interpolation of values over the section heights: smooth,
 * and it never overshoots between sections, so a bulge stays where you put it.
 */
export function pchip(zs: number[], vs: number[]): (z: number) => number {
  const n = zs.length;
  if (n === 1) return () => vs[0];
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(zs[i + 1] - zs[i]);
    d.push((vs[i + 1] - vs[i]) / h[i]);
  }
  const m: number[] = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (z) => {
    if (z <= zs[0]) return vs[0];
    if (z >= zs[n - 1]) return vs[n - 1];
    let i = 0;
    while (z > zs[i + 1]) i++;
    const t = (z - zs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * vs[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * vs[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

/** The lofted outline (ring of points, before twist) at any height. */
export function makeLoft(
  sections: ShapeSection[],
  m = RING_POINTS,
): { at: (z: number) => Float64Array; rings: Float64Array[] } {
  const rings = sectionRings(sections, m);
  const zs = sections.map((s) => s.z);
  const fns: ((z: number) => number)[] = [];
  for (let k = 0; k < 2 * m; k++)
    fns.push(
      pchip(
        zs,
        rings.map((r) => r[k]),
      ),
    );
  return {
    rings,
    at: (z) => {
      const out = new Float64Array(2 * m);
      for (let k = 0; k < 2 * m; k++) out[k] = fns[k](z);
      return out;
    },
  };
}

/** Closed solid as a triangle soup (outward CCW winding, same convention as the STL path). */
export function shapeMesh(spec: ShapeSpec): Float32Array {
  const sections = normalizeSections(spec.sections);
  const H = sections[sections.length - 1].z;
  const m = RING_POINTS;
  const loft = makeLoft(sections, m);
  const rings = Math.min(500, Math.max(40, Math.ceil(H / 2)));
  const angleAt = rotationAt({ ...spec, sections });

  // one twisted ring per height, reused by every quad
  const grid: Float64Array[] = [];
  const centre: Vec[] = [];
  for (let i = 0; i <= rings; i++) {
    const z = (i / rings) * H;
    const ring = loft.at(z);
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < m; k++) {
      cx += ring[2 * k];
      cy += ring[2 * k + 1];
    }
    cx /= m;
    cy /= m;
    const ang = angleAt(z);
    if (ang !== 0) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      for (let k = 0; k < m; k++) {
        const dx = ring[2 * k] - cx;
        const dy = ring[2 * k + 1] - cy;
        ring[2 * k] = cx + dx * c - dy * s;
        ring[2 * k + 1] = cy + dx * s + dy * c;
      }
    }
    grid.push(ring);
    centre.push([cx, cy]);
  }
  const P = (i: number, k: number): [number, number, number] => {
    const j = k % m;
    return [grid[i][2 * j], grid[i][2 * j + 1], (i / rings) * H];
  };
  const out: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c);
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < m; k++) {
      const a = P(i, k);
      const b = P(i, k + 1);
      const c = P(i + 1, k + 1);
      const d = P(i + 1, k);
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  const c0: [number, number, number] = [centre[0][0], centre[0][1], 0];
  const c1: [number, number, number] = [centre[rings][0], centre[rings][1], H];
  for (let k = 0; k < m; k++) {
    tri(c0, P(0, k + 1), P(0, k));
    tri(c1, P(rings, k), P(rings, k + 1));
  }
  return Float32Array.from(out);
}
