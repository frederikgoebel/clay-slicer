import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { sampleStep } from '../src/core/toolpath/sampling';
import { FEATURE_WALL, type TextureLayer } from '../src/core/types';
import { newTexture } from '../src/domain/print';
import { cylinder, testSettings } from './helpers';

const wallPoints = (r: ReturnType<typeof runPipeline>) => {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < r.count; i++)
    if (r.feature[i] === FEATURE_WALL) pts.push([r.xyz[3 * i], r.xyz[3 * i + 1], r.xyz[3 * i + 2]]);
  return pts;
};

const tex = (o: Partial<TextureLayer>): TextureLayer => ({
  ...newTexture('fuzzy'),
  from: 0,
  to: 100,
  solidFrom: 0,
  solid: 100,
  ...o,
});

describe('path sampling', () => {
  it('draws textures by distance, whatever the internal sampling', () => {
    const settings = (step: number) =>
      testSettings({
        mode: 'spiral',
        sampleMm: step,
        textures: [tex({ type: 'wave', amplitude: 1.5, count: 12, wavelength: 20 })],
      });
    const radii = (step: number) => {
      const r = runPipeline(cylinder(), settings(step));
      const rs = wallPoints(r).map(([x, y]) => Math.hypot(x, y));
      return { max: Math.max(...rs), min: Math.min(...rs), n: rs.length };
    };
    const fine = radii(0.25);
    const coarse = radii(0.6);
    expect(Math.abs(fine.max - coarse.max)).toBeLessThan(0.1);
    expect(Math.abs(fine.min - coarse.min)).toBeLessThan(0.1);
  });

  it('gives fuzzy noise the same shape at any sampling', () => {
    const run = (step: number) =>
      runPipeline(
        cylinder(),
        testSettings({
          mode: 'spiral',
          sampleMm: step,
          textures: [tex({ type: 'fuzzy', amplitude: 1, wavelength: 4 })],
        }),
      );
    const bins = (r: ReturnType<typeof run>) => {
      // mean radius per 10-degree sector over the whole wall
      const sum = new Float64Array(36);
      const cnt = new Float64Array(36);
      for (const [x, y] of wallPoints(r)) {
        const b = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 36) % 36;
        sum[b] += Math.hypot(x, y);
        cnt[b]++;
      }
      return Array.from(sum, (v, i) => v / Math.max(1, cnt[i]));
    };
    const a = bins(run(0.25));
    const b = bins(run(0.5));
    const diff = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    expect(diff).toBeLessThan(0.15);
  });

  it('uses the path resolution as point spacing', () => {
    const fine = runPipeline(cylinder(), testSettings({ segLen: 0.5 }));
    const coarse = runPipeline(cylinder(), testSettings({ segLen: 2 }));
    expect(fine.count).toBeGreaterThan(coarse.count * 2.5);
    expect(sampleStep(testSettings({ segLen: 1.5 }), 100)).toBe(1.5);
  });
});

describe('corner preservation', () => {
  it('keeps every corner of a square exactly when resampling', async () => {
    const { resample } = await import('../src/core/geometry/contour');
    const sq = Float64Array.from([-10, -10, 10, -10, 10, 10, -10, 10]);
    const r = resample(sq, { i: 0, u: 0.37 }, 97, undefined);
    for (const [cx, cy] of [
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ]) {
      let best = Infinity;
      for (let k = 0; k < 97; k++)
        best = Math.min(best, Math.hypot(r.xy[2 * k] - cx, r.xy[2 * k + 1] - cy));
      expect(best).toBeLessThan(1e-9);
    }
  });
});

describe('curvature masks', () => {
  it('put blobs only at the corners of a box, not along flat sides', async () => {
    const { DEFAULT_PATTERN } = await import('../src/core/textures/noise');
    const w = 40;
    const h = 30;
    const o: number[] = [];
    const q = (a: number[], b: number[], c: number[], d: number[]) =>
      o.push(...a, ...b, ...c, ...a, ...c, ...d);
    const P = (i: number, j: number, k: number) => [
      i ? w / 2 : -w / 2,
      j ? w / 2 : -w / 2,
      k ? h : 0,
    ];
    q(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0));
    q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1));
    q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1));
    q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1));
    q(P(1, 1, 0), P(0, 1, 0), P(0, 1, 1), P(1, 1, 1));
    q(P(0, 1, 0), P(0, 0, 0), P(0, 0, 1), P(0, 1, 1));
    const blob = {
      ...newTexture('blobs'),
      count: 60,
      amplitude: 1,
      wavelength: 0,
      maskPattern: {
        ...DEFAULT_PATTERN,
        kind: 'curvature' as const,
        scale: 20,
        curvature: 'convex' as const,
        softness: 20,
      },
    };
    const r = runPipeline(Float32Array.from(o), testSettings({ textures: [blob] }));
    let n = 0;
    let far = 0;
    for (let i = 0; i < r.count; i++) {
      if (r.dwell[i] <= 0) continue;
      n++;
      // distance to the nearest vertical edge (corner) of the square outline
      const d = Math.hypot(Math.abs(r.xyz[3 * i]) - w / 2, Math.abs(r.xyz[3 * i + 1]) - w / 2);
      if (d > 12) far++;
    }
    expect(n).toBeGreaterThan(10);
    expect(far).toBe(0);
  });
});

describe('seam', () => {
  it('finds the outline when the seam ray goes exactly through vertices', async () => {
    const { findSeam } = await import('../src/core/geometry/contour');
    // a diamond (vertices on the axes) and a star notch on the ray: never jump to another place
    const a = 17.7 + 1 / 3;
    const diamond = Float64Array.from([a, 0, 0, a, -a, 0, 0, -a]);
    const { i, u } = findSeam(diamond, 0, 0, 0);
    const j = (i + 1) % 4;
    const x = diamond[2 * i] + u * (diamond[2 * j] - diamond[2 * i]);
    const y = diamond[2 * i + 1] + u * (diamond[2 * j + 1] - diamond[2 * i + 1]);
    expect(Math.hypot(x - a, y)).toBeLessThan(1e-6);
    const notch = Float64Array.from([22, 0, 8, 12, 0, 21, -8, 12, -22, 0, -8, -12, 0, -21, 8, -12]);
    for (const shift of [0, 1e-13, -1e-13, 1e-9]) {
      const q = notch.map((v, k) => (k % 2 ? v + shift : v));
      const s2 = findSeam(q, 0, 0, 0);
      const k2 = (s2.i + 1) % 8;
      const px = q[2 * s2.i] + s2.u * (q[2 * k2] - q[2 * s2.i]);
      expect(Math.abs(px - 22)).toBeLessThan(1e-3);
    }
  });
});
