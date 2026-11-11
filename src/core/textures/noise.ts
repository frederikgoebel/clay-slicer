import { sampleMask } from './mask';
import type { Mask, MaskPattern, PatternKind } from '../types';

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---- 3D simplex noise (after Gustavson), seeded permutation table ----

const G3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];
const permCache = new Map<number, Uint8Array>();

function perm(seed: number): Uint8Array {
  const key = Math.round(seed);
  let p = permCache.get(key);
  if (p) return p;
  const base = Array.from({ length: 256 }, (_, i) => i);
  let s = (key * 2654435761 + 1013904223) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  if (permCache.size > 32) permCache.clear();
  permCache.set(key, p);
  return p;
}

/** Simplex noise, about -1..1. */
export function simplex3(x: number, y: number, z: number, seed = 0): number {
  const P = perm(seed);
  const F = 1 / 3;
  const G = 1 / 6;
  const s = (x + y + z) * F;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * G;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);
  let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
  if (x0 >= y0) {
    if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
    else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
  } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
  else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
  else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
  const corner = (xs: number, ys: number, zs: number, ii: number, jj: number, kk: number) => {
    let a = 0.6 - xs * xs - ys * ys - zs * zs;
    if (a < 0) return 0;
    const g = G3[P[(ii & 255) + P[(jj & 255) + P[kk & 255]]] % 12];
    a *= a;
    return a * a * (g[0] * xs + g[1] * ys + g[2] * zs);
  };
  const n =
    corner(x0, y0, z0, i, j, k) +
    corner(x0 - i1 + G, y0 - j1 + G, z0 - k1 + G, i + i1, j + j1, k + k1) +
    corner(x0 - i2 + 2 * G, y0 - j2 + 2 * G, z0 - k2 + 2 * G, i + i2, j + j2, k + k2) +
    corner(x0 - 1 + 3 * G, y0 - 1 + 3 * G, z0 - 1 + 3 * G, i + 1, j + 1, k + 1);
  return 32 * n;
}

/** Layered simplex noise (fractal), normalised to about -1..1. */
function fbm(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves: number,
  gain: number,
  shape: 'plain' | 'ridged' | 'billow',
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    let n = simplex3(x * f, y * f, z * f, seed + o * 17);
    if (shape === 'ridged') n = 1 - 2 * Math.abs(n);
    else if (shape === 'billow') n = 2 * Math.abs(n) - 1;
    sum += n * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// ---- 3D cellular (Worley) noise ----

const hash3 = (x: number, y: number, z: number, seed: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13) ^ Math.imul(seed + 1, 1274126177), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Distances to the nearest and second nearest feature point (cells of size 1). */
function worley(x: number, y: number, z: number, seed: number): [number, number] {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let f1 = 9;
  let f2 = 9;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const px = cx + hash3(cx, cy, cz, seed);
        const py = cy + hash3(cx, cy, cz, seed + 101);
        const pz = cz + hash3(cx, cy, cz, seed + 202);
        const d = Math.hypot(px - x, py - y, pz - z);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
  return [f1, f2];
}

// ---- the pattern mask ----

export const PATTERN_KINDS: readonly (readonly [PatternKind, string])[] = [
  ['simplex', 'Simplex noise'],
  ['billow', 'Billowy noise (soft lumps)'],
  ['ridged', 'Ridged noise (veins)'],
  ['cells', 'Cells (pebbles)'],
  ['cracks', 'Cracks (dried clay)'],
  ['stripes', 'Stripes'],
  ['checker', 'Checkerboard'],
  ['gradient', 'Gradient (bottom to top)'],
  ['curvature', 'Curvature (corners / flat areas)'],
  ['image', 'Image'],
];

export const DEFAULT_PATTERN: MaskPattern = {
  kind: 'simplex',
  scale: 20,
  detail: 3,
  stretch: 1,
  warp: 0,
  rotate: 0,
  coverage: 50,
  softness: 30,
  seed: 1,
  invert: false,
  curvature: 'either',
  tilesU: 1,
  tilesV: 1,
};

/** Where a mask is asked for: angle around the object, radius, height (mm), model height. */
export interface PatternCtx {
  ang: number;
  rad: number;
  z: number;
  H: number;
  /** angle 0..1 and height / model height 0..1 */
  u: number;
  v: number;
  /** signed curvature of the contour, 1/mm, convex positive */
  curv?: number;
}

/** Raw 0..1 value of the pattern before coverage / softness. */
function patternField(p: MaskPattern, c: PatternCtx, image: Mask | null | undefined): number {
  const scale = Math.max(0.5, p.scale);
  const sz = Math.max(0.05, p.stretch);
  const seed = p.seed;
  // position on the surface, as a point on a cylinder so the noise is seamless around the object
  const cx = Math.cos(c.ang) * c.rad;
  const cy = Math.sin(c.ang) * c.rad;
  let x = cx / scale;
  let y = cy / scale;
  let z = c.z / (scale * sz);
  if (p.warp > 0) {
    const w = (p.warp / 100) * 1.5;
    x += w * simplex3(x * 0.6 + 11.3, y * 0.6, z * 0.6, seed + 5);
    y += w * simplex3(x * 0.6, y * 0.6 + 7.1, z * 0.6, seed + 6);
    z += w * simplex3(x * 0.6, y * 0.6, z * 0.6 + 3.7, seed + 7);
  }
  const lift = (n: number) => Math.min(1, Math.max(0, 0.5 + 0.75 * n));
  switch (p.kind) {
    case 'simplex':
      return lift(fbm(x, y, z, seed, p.detail, 0.5, 'plain'));
    case 'billow':
      return lift(fbm(x, y, z, seed, p.detail, 0.5, 'billow'));
    case 'ridged':
      return lift(fbm(x, y, z, seed, p.detail, 0.5, 'ridged'));
    case 'cells': {
      const [f1] = worley(x, y, z, seed);
      return Math.min(1, Math.max(0, 1 - f1 * 1.3));
    }
    case 'cracks': {
      const [f1, f2] = worley(x, y, z, seed);
      return 1 - smooth(0, 0.35, f2 - f1);
    }
    case 'stripes':
    case 'checker': {
      // pattern axes turned by `rotate`; a whole number of repeats fits around the object
      const a = (p.rotate * Math.PI) / 180;
      const circ = TAU * Math.max(c.rad, 1);
      const around = Math.max(1, Math.round((circ * Math.abs(Math.cos(a))) / scale));
      const wob =
        p.warp > 0 ? 0.75 * (p.warp / 100) * simplex3(x * 0.5, y * 0.5, z * 0.5, seed + 9) : 0;
      const along = c.u * around * (Math.cos(a) < 0 ? -1 : 1);
      const up = c.z / (scale * sz);
      const ph = along + up * Math.sin(a) + wob;
      if (p.kind === 'stripes') return 0.5 + 0.5 * Math.sin(TAU * ph);
      const q = up * Math.cos(a) + wob;
      return (Math.floor(2 * ph) + Math.floor(2 * q)) % 2 === 0 ? 1 : 0;
    }
    case 'gradient': {
      // direction: 0 = bottom to top, 90 = from the +X side round to the opposite side (a rise and
      // fall rather than a jump, so there is no seam); negative turns it the other way round
      const a = (p.rotate * Math.PI) / 180;
      const side = Math.abs(2 * (c.u - 0.5)); // 0 at +X, 1 at -X
      const sum = Math.cos(a) + Math.abs(Math.sin(a));
      const t = (c.v * Math.cos(a) + (a < 0 ? 1 - side : side) * Math.abs(Math.sin(a))) / sum;
      const bend = p.warp > 0 ? 0.25 * (p.warp / 100) * fbm(x, y, z, seed, 2, 0.5, 'plain') : 0;
      return Math.min(1, Math.max(0, t + bend));
    }
    case 'curvature':
      return 1; // handled in patternMask
    case 'image': {
      if (!image) return 1;
      const tu = Math.max(1, Math.round(p.tilesU));
      const tv = Math.max(1, p.tilesV);
      const uu = (c.u * tu) % 1;
      const vv = (c.v * tv) % 1;
      return sampleMask(image, uu, 1 - vv);
    }
  }
}

/** Mask strength 0..1 of a pattern at a point. */
export function patternMask(p: MaskPattern, c: PatternCtx, image?: Mask | null): number {
  if (p.kind === 'curvature') {
    // sharper than `scale` mm radius: curvature x radius >= 1
    const k = c.curv ?? 0;
    const mode = p.curvature ?? 'either';
    const eff = mode === 'convex' ? k : mode === 'concave' ? -k : Math.abs(k);
    const half = (p.softness / 100) * 0.9 + 1e-3;
    const m = smooth(1 - half, 1 + half, Math.max(0, eff) * Math.max(0.5, p.scale));
    return p.invert ? 1 - m : m;
  }
  const v = patternField(p, c, image);
  let m: number;
  if (p.kind === 'image') m = v;
  else {
    const half = (p.softness / 100) * 0.5 + 1e-3;
    const thr = (1 - p.coverage / 100) * (1 + 2 * half) - half;
    m = smooth(thr - half, thr + half, v);
  }
  return p.invert ? 1 - m : m;
}
