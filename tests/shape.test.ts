import { describe, expect, it } from 'vitest';
import {
  coerceShape,
  defaultShape,
  makeSection,
  normalizeSections,
  regularPolygon,
  resampleClosed,
  rotationAt,
  sectionOutline,
  scaleSectionXY,
  circleSection,
  shapeMesh,
  translateSection,
  type ShapeSpec,
} from '../src/core/shape/shape';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { testSettings } from './helpers';

const square = (r: number, cx = 0, cy = 0) => regularPolygon(4, r, cx, cy, Math.PI / 4);

describe('lofted shape', () => {
  it('keeps sections ordered, the first at 0, with a gap', () => {
    const n = normalizeSections([
      makeSection(50, square(10)),
      makeSection(10, square(20)),
      makeSection(11, square(5)),
    ]);
    expect(n[0].z).toBe(0);
    expect(n[2].z - n[1].z).toBeGreaterThanOrEqual(2);
  });
  it('rounds corners without leaving the polygon and keeps sharp ones when radius is 0', () => {
    const sharp = sectionOutline({ verts: square(20), corner: 0 });
    expect(sharp.length).toBe(4);
    const round = sectionOutline({ verts: square(20), corner: 10 });
    expect(round.length).toBeGreaterThan(8);
    for (const [x, y] of round)
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(20.001);
    expect(
      Math.hypot(...round.reduce((m, p) => [Math.max(m[0], p[0]), Math.max(m[1], p[1])], [0, 0])),
    ).toBeLessThan(Math.hypot(20, 20));
  });
  it('resamples to a fixed count and keeps every vertex', () => {
    const ring = resampleClosed(square(20), 64);
    expect(ring.length).toBe(128);
    for (const [x, y] of square(20)) {
      const hit = Array.from({ length: 64 }, (_, i) =>
        Math.hypot(ring[2 * i] - x, ring[2 * i + 1] - y),
      );
      expect(Math.min(...hit)).toBeLessThan(1e-9);
    }
  });
  it('lofts a square into a triangle and a free-form blob, then slices it', () => {
    const spec: ShapeSpec = {
      twist: 0,
      sections: [
        makeSection(0, square(30)),
        makeSection(60, regularPolygon(3, 30, 10, 0)),
        makeSection(
          120,
          [
            [-30, -10],
            [0, -40],
            [35, -5],
            [20, 30],
            [-15, 25],
          ],
          5,
        ),
      ],
    };
    const r = runPipeline(shapeMesh(spec), testSettings());
    expect(r.stats.heightMm).toBeGreaterThan(115);
    expect(r.warnings.filter((w) => /No closed contour/.test(w))).toEqual([]);
  });
  it('is not rotary: a section moved sideways makes the path lean', () => {
    const spec = defaultShape();
    spec.sections[spec.sections.length - 1] = translateSection(
      spec.sections[spec.sections.length - 1],
      60,
      0,
    );
    const r = runPipeline(shapeMesh(spec), testSettings());
    let xTop = 0;
    for (let i = r.count - 40; i < r.count; i++) xTop += r.xyz[3 * i];
    expect(xTop / 40).toBeGreaterThan(30);
  });
  it('a stretched section changes the footprint', () => {
    const spec: ShapeSpec = {
      twist: 0,
      sections: [
        makeSection(
          0,
          regularPolygon(24, 30).map(([x, y]) => [x, y / 2] as [number, number]),
        ),
        makeSection(
          100,
          regularPolygon(24, 30).map(([x, y]) => [x, y / 2] as [number, number]),
        ),
      ],
    };
    const m = shapeMesh(spec);
    let xMax = 0;
    let yMax = 0;
    for (let i = 0; i < m.length; i += 3) {
      xMax = Math.max(xMax, Math.abs(m[i]));
      yMax = Math.max(yMax, Math.abs(m[i + 1]));
    }
    expect(yMax).toBeLessThan(xMax * 0.6);
  });
  it('survives a damaged project shape', () => {
    expect(
      coerceShape({ sections: [{ z: 'x', verts: 3 }] }).sections.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('a circle section is a true circle', () => {
    const c = circleSection(0, 30, 5, -4);
    const pts = sectionOutline(c);
    expect(pts.length).toBeGreaterThanOrEqual(128);
    for (const [x, y] of pts) expect(Math.hypot(x - 5, y + 4)).toBeCloseTo(30, 6);
  });
  it('moving and scaling keep a circle a circle', () => {
    const c = scaleSectionXY(translateSection(circleSection(0, 20), 10, 0), 2, 1.2);
    expect(c.circle).not.toBeNull();
    expect(c.circle?.cx).toBeCloseTo(10);
    expect(c.circle?.r).toBeCloseTo(40);
  });

  it('a layer rotation turns that layer and blends smoothly', () => {
    const spec: ShapeSpec = {
      twist: 0,
      sections: [makeSection(0, square(20)), makeSection(100, square(20))],
    };
    spec.sections[1] = { ...spec.sections[1], rot: 45 };
    const at = rotationAt(spec);
    expect(at(0)).toBeCloseTo(0);
    expect(at(100)).toBeCloseTo(Math.PI / 4);
    expect(at(50)).toBeGreaterThan(0);
    expect(at(50)).toBeLessThan(Math.PI / 4);
    const flat = shapeMesh({ ...spec, sections: spec.sections.map((s) => ({ ...s, rot: 0 })) });
    expect(Array.from(shapeMesh(spec))).not.toEqual(Array.from(flat));
  });
  it('keeps the layer rotation through projects', () => {
    const spec = defaultShape();
    spec.sections[1] = { ...spec.sections[1], rot: 30 };
    expect(coerceShape(JSON.parse(JSON.stringify(spec))).sections[1].rot).toBe(30);
  });
});
