import { describe, expect, it } from 'vitest';
import { patternMask, DEFAULT_PATTERN } from '../src/core/textures/noise';
import { infillSegments } from '../src/core/toolpath/infill';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_INFILL, FEATURE_WALL } from '../src/core/types';
import { cylinder, testSettings, tube } from './helpers';

const base = { mode: 'normal' as const, floorLayers: 1, topCurves: 'closed' as const };
const count = (r: ReturnType<typeof runPipeline>, f: number) =>
  Array.from(r.feature).filter((x) => x === f).length;
const lengthOf = (r: ReturnType<typeof runPipeline>, f: number) => {
  let l = 0;
  for (let i = 1; i < r.count; i++)
    if (r.feature[i] === f && r.feature[i - 1] !== 0)
      l += Math.hypot(r.xyz[3 * i] - r.xyz[3 * i - 3], r.xyz[3 * i + 1] - r.xyz[3 * i - 2]);
  return l;
};

describe('standard layers: walls and infill', () => {
  const mesh = tube(24, 12, 30);
  it('has no infill when the density is 0', () => {
    expect(
      count(runPipeline(mesh, testSettings({ ...base, infillDensity: 0 })), FEATURE_INFILL),
    ).toBe(0);
  });

  it('fills between the walls, never inside the hole, and more density means more clay', () => {
    const a = runPipeline(mesh, testSettings({ ...base, infillDensity: 20, solidTop: 0 }));
    const b = runPipeline(mesh, testSettings({ ...base, infillDensity: 50, solidTop: 0 }));
    expect(count(a, FEATURE_INFILL)).toBeGreaterThan(50);
    for (let i = 0; i < a.count; i++)
      if (a.feature[i] === FEATURE_INFILL) {
        const r = Math.hypot(a.xyz[3 * i], a.xyz[3 * i + 1]);
        expect(r).toBeGreaterThan(12);
        expect(r).toBeLessThan(24);
      }
    expect(lengthOf(b, FEATURE_INFILL)).toBeGreaterThan(lengthOf(a, FEATURE_INFILL) * 1.8);
    expect(b.stats.volumeCm3).toBeGreaterThan(a.stats.volumeCm3);
  });

  it('density is roughly the share of the area that is filled', () => {
    const s = testSettings({ ...base, infillDensity: 30, solidTop: 0, wallCount: 1 });
    const r = runPipeline(cylinder(30, 30), s);
    const width = 4; // test bead width
    // mid-height layers only: the area inside the wall times the density
    const zs = new Set<number>();
    for (let i = 1; i < r.count; i++) if (r.feature[i] === FEATURE_INFILL) zs.add(r.xyz[3 * i + 2]);
    const len = lengthOf(r, FEATURE_INFILL) / zs.size;
    const area = Math.PI * (30 - 0.9 * width) ** 2;
    expect((len * width) / area).toBeGreaterThan(0.2);
    expect((len * width) / area).toBeLessThan(0.45);
  });

  it('prints extra wall loops and solid layers at the top', () => {
    const one = runPipeline(mesh, testSettings({ ...base, wallCount: 1 }));
    const three = runPipeline(mesh, testSettings({ ...base, wallCount: 3 }));
    expect(count(three, FEATURE_WALL)).toBeGreaterThan(count(one, FEATURE_WALL) * 2);
    const solid = runPipeline(mesh, testSettings({ ...base, infillDensity: 10, solidTop: 2 }));
    const none = runPipeline(mesh, testSettings({ ...base, infillDensity: 10, solidTop: 0 }));
    expect(lengthOf(solid, FEATURE_INFILL)).toBeGreaterThan(lengthOf(none, FEATURE_INFILL) * 1.5);
  });

  it('grid and triangles run in several directions', () => {
    for (const infillPattern of ['grid', 'triangles'] as const) {
      const r = runPipeline(
        cylinder(25, 20),
        testSettings({ ...base, infillDensity: 25, infillPattern }),
      );
      expect(count(r, FEATURE_INFILL)).toBeGreaterThan(30);
    }
  });
});

describe('gradient direction', () => {
  const at = (u: number, z: number) => ({ ang: 0, rad: 20, z, H: 60, u, v: z / 60 });
  const grad = (rotate: number) => ({
    ...DEFAULT_PATTERN,
    kind: 'gradient' as const,
    rotate,
    coverage: 100,
    softness: 100,
  });
  it('0 follows height, 90 follows the angle around (no jump at the seam)', () => {
    const up = { ...grad(0), coverage: 50, softness: 0 };
    expect(patternMask(up, at(0.3, 50))).toBe(1);
    expect(patternMask(up, at(0.3, 10))).toBe(0);
    const side = { ...grad(90), coverage: 50, softness: 0 };
    expect(patternMask(side, at(0.5, 5))).toBe(0); // +X side: start
    expect(patternMask(side, at(0.05, 5))).toBe(1); // far side
    expect(patternMask(side, at(0.05, 55))).toBe(1); // height does not matter at 90
    expect(patternMask({ ...side, rotate: -90 }, at(0.5, 5))).toBe(1);
    // seam at u = 0 and u = 1 is the same place
    expect(patternMask(side, at(0.0001, 5))).toBeCloseTo(patternMask(side, at(0.9999, 5)), 1);
  });
});

describe('gyroid infill', () => {
  const sq: [number, number][] = [
    [-60, -60],
    [60, -60],
    [60, 60],
    [-60, 60],
  ];
  const len = (z: number, density: number) => {
    const { segs } = infillSegments([sq], 'gyroid', density, 2, 0, 0, z);
    let l = 0;
    for (const [a, b] of segs) l += Math.hypot(a[0] - b[0], a[1] - b[1]);
    return { l, segs };
  };
  it('has the requested density and changes with height', () => {
    for (const z of [0, 4, 9]) {
      const share = (len(z, 20).l * 2) / (120 * 120);
      expect(share).toBeGreaterThan(0.14);
      expect(share).toBeLessThan(0.27);
    }
    expect(len(0, 20).segs).not.toEqual(len(5, 20).segs);
  });
  it('stays inside the outline and is mostly continuous', () => {
    const { segs } = len(3, 20);
    for (const [a, b] of segs)
      for (const p of [a, b]) expect(Math.abs(p[0])).toBeLessThanOrEqual(60.01);
    let joined = 0;
    for (let i = 1; i < segs.length; i++)
      if (Math.hypot(segs[i][0][0] - segs[i - 1][1][0], segs[i][0][1] - segs[i - 1][1][1]) < 1e-9)
        joined++;
    expect(joined / segs.length).toBeGreaterThan(0.9);
  });
  it('prints through the pipeline', () => {
    const r = runPipeline(
      cylinder(30, 20),
      testSettings({ mode: 'normal', wallCount: 1, infillDensity: 20, infillPattern: 'gyroid' }),
    );
    expect(r.feature.includes(FEATURE_INFILL)).toBe(true);
  });
});

describe('no walls and infill scale', () => {
  const run = (o: object) =>
    runPipeline(cylinder(30, 20), testSettings({ mode: 'normal', infillDensity: 20, ...o }));
  it('wallCount 0 prints only infill (after the floor), and still walls without infill', () => {
    const r = run({ wallCount: 0 });
    const after = r.feature.slice(r.feature.indexOf(FEATURE_INFILL));
    expect(after.includes(FEATURE_WALL)).toBe(false);
    expect(after.includes(FEATURE_INFILL)).toBe(true);
    expect(run({ wallCount: 0, infillDensity: 0 }).feature.includes(FEATURE_WALL)).toBe(true);
  });
});
