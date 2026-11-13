import type { RingSet } from '../toolpath/rings';
import type { TextureLayer } from '../types';
import { angleU } from './mask';
import { curvatureAt } from '../geometry/contour';
import { dwellSeconds, needsCurvature, radialOffset, twistAngle, type TexCtx } from './textures';

export interface ThumbOptions {
  /** pixel size of the picture */
  width: number;
  height: number;
  /** height of one preview row, mm (the rings were sliced with this layer height) */
  rowH: number;
  /** the real layer height, mm (blob and sling spacing is counted in layers) */
  lh: number;
  fadeIn: number;
  /** clay colour, 0..255 */
  color: [number, number, number];
}

const LIGHT = (() => {
  const v = [-0.5, -0.7, 0.55];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

/** Blob bumps: where this texture would stand still and build up clay, as mm of outward bump. */
function blobBumps(set: RingSet, l: TextureLayer, o: ThumbOptions, H: number): Float32Array {
  const { rings, N, layers: L, zmax } = set;
  const bump = new Float32Array(L * N);
  if (l.count < 1 || l.amplitude <= 0) return bump;
  const every = l.wavelength > 0 ? Math.max(1, Math.round(l.wavelength / o.lh)) : 1;
  const step = every * o.lh;
  for (let m = 0; m * step < H; m++) {
    const z = m * step;
    const j = Math.min(L - 1, Math.max(0, Math.round(z / o.rowH - 0.5)));
    const shift = 0.5 * (m % 2);
    for (let n = 0; n <= l.count; n++) {
      const tb = (n - shift) / l.count;
      if (tb < 0 || tb >= 1) continue;
      const k = Math.round(tb * N) % N;
      const A = rings[j];
      const ctx: TexCtx = {
        z,
        H,
        t: tb + 1e-7,
        arc: 0,
        zStart: 0,
        fadeIn: o.fadeIn,
        lh: o.lh,
        u: angleU(A.xy[2 * k], A.xy[2 * k + 1]),
        v: z / zmax,
        ang: 0,
        rad: 0,
        curv: needsCurvature([l]) ? curvatureAt(A.nxy, k, N, A.perimeter) : 0,
      };
      const d = dwellSeconds([l], ctx, o.lh, 1e-3);
      if (d <= 0) continue;
      const mm = Math.min(4, 1 + 0.4 * d);
      for (let dj = -1; dj <= 1; dj++)
        for (let dk = -1; dk <= 1; dk++) {
          const jj = j + dj;
          if (jj < 0 || jj >= L) continue;
          const w = (dk === 0 ? 1 : 0.5) * (dj === 0 ? 1 : 0.5);
          const idx = jj * N + ((k + dk + N) % N);
          bump[idx] = Math.max(bump[idx], mm * w);
        }
    }
  }
  return bump;
}

/**
 * A small picture of the model with only this one texture applied (or with all the given ones, as a project icon): a front view of the wall,
 * lit from the upper left. `set` holds coarse rings of the model (see previewRings).
 * Returns RGBA pixels (transparent background).
 */
export function renderTextureThumb(
  set: RingSet,
  layer: TextureLayer | TextureLayer[],
  o: ThumbOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const { rings, N, layers: L } = set;
  const H = L * o.rowH;
  const only: TextureLayer[] = Array.isArray(layer)
    ? layer.filter((l) => l.enabled)
    : [{ ...layer, enabled: true }];
  const curved = needsCurvature(only);
  const blobs = only.filter((l) => l.type === 'blobs').map((l) => blobBumps(set, l, o, H));

  // displaced wall points
  const P = new Float64Array(L * N * 3);
  for (let j = 0; j < L; j++) {
    const A = rings[j];
    const z = (j + 0.5) * o.rowH;
    const tw = twistAngle(only, z, H);
    const cs = Math.cos(tw);
    const sn = Math.sin(tw);
    for (let k = 0; k < N; k++) {
      const bx = A.xy[2 * k];
      const by = A.xy[2 * k + 1];
      const ctx: TexCtx = {
        z,
        H,
        t: k / N,
        arc: (j * N + k) * (A.perimeter / N),
        zStart: 0,
        fadeIn: o.fadeIn,
        lh: o.lh,
        u: angleU(bx, by),
        v: z / set.zmax,
        ang: Math.atan2(by - A.cy, bx - A.cx),
        rad: Math.hypot(bx - A.cx, by - A.cy),
        curv: curved ? curvatureAt(A.nxy, k, N, A.perimeter) : 0,
      };
      let off = radialOffset(only, ctx);
      for (const b of blobs) off += b[j * N + k];
      let x = bx + A.nxy[2 * k] * off;
      let y = by + A.nxy[2 * k + 1] * off;
      if (tw !== 0) {
        const dx = x - A.cx;
        const dy = y - A.cy;
        x = A.cx + dx * cs - dy * sn;
        y = A.cy + dx * sn + dy * cs;
      }
      const p = 3 * (j * N + k);
      P[p] = x;
      P[p + 1] = y;
      P[p + 2] = z;
    }
  }

  // shading per vertex from the displaced surface
  const shade = new Float32Array(L * N);
  const at = (j: number, k: number) => 3 * (Math.min(L - 1, Math.max(0, j)) * N + ((k + N) % N));
  for (let j = 0; j < L; j++) {
    const A = rings[j];
    for (let k = 0; k < N; k++) {
      const a = at(j, k + 1);
      const b = at(j, k - 1);
      const c = at(j + 1, k);
      const d = at(j - 1, k);
      const tk = [P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]];
      const tj = [P[c] - P[d], P[c + 1] - P[d + 1], P[c + 2] - P[d + 2]];
      let n = [
        tk[1] * tj[2] - tk[2] * tj[1],
        tk[2] * tj[0] - tk[0] * tj[2],
        tk[0] * tj[1] - tk[1] * tj[0],
      ];
      const p = at(j, k);
      if (n[0] * (P[p] - A.cx) + n[1] * (P[p + 1] - A.cy) < 0) n = n.map((v) => -v);
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      const lam = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len;
      shade[j * N + k] = 0.3 + 0.75 * Math.max(0, lam);
    }
  }

  // fit the picture
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < L * N; i++) {
    minX = Math.min(minX, P[3 * i]);
    maxX = Math.max(maxX, P[3 * i]);
  }
  const pad = 2;
  const scale = Math.min((o.width - 2 * pad) / (maxX - minX || 1), (o.height - 2 * pad) / H);
  const ox = (o.width - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (o.height + H * scale) / 2;
  const px = (i: number) => P[3 * i] * scale + ox;
  const py = (i: number) => oy - P[3 * i + 2] * scale;

  const out = new Uint8ClampedArray(new ArrayBuffer(o.width * o.height * 4));
  const depth = new Float32Array(o.width * o.height).fill(Infinity);
  const tri = (a: number, b: number, c: number) => {
    const x0 = px(a);
    const y0 = py(a);
    const x1 = px(b);
    const y1 = py(b);
    const x2 = px(c);
    const y2 = py(c);
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-9) return;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const xb = Math.min(o.width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const yb = Math.min(o.height - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const fx = x + 0.5;
        const fy = y + 0.5;
        const w0 = ((y1 - y2) * (fx - x2) + (x2 - x1) * (fy - y2)) / den;
        const w1 = ((y2 - y0) * (fx - x2) + (x0 - x2) * (fy - y2)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const z = w0 * P[3 * a + 1] + w1 * P[3 * b + 1] + w2 * P[3 * c + 1];
        const pi = y * o.width + x;
        if (z >= depth[pi]) continue;
        depth[pi] = z;
        const s = w0 * shade[a] + w1 * shade[b] + w2 * shade[c];
        out[4 * pi] = o.color[0] * s;
        out[4 * pi + 1] = o.color[1] * s;
        out[4 * pi + 2] = o.color[2] * s;
        out[4 * pi + 3] = 255;
      }
  };
  for (let j = 0; j < L - 1; j++)
    for (let k = 0; k < N; k++) {
      const a = j * N + k;
      const b = j * N + ((k + 1) % N);
      const c = (j + 1) * N + k;
      const d = (j + 1) * N + ((k + 1) % N);
      tri(a, b, c);
      tri(b, d, c);
    }
  return out;
}
