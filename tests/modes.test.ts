import { describe, expect, it } from 'vitest';
import { buildGcode } from '../src/core/gcode/gcode';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_TRAVEL, FEATURE_WALL } from '../src/core/types';
import { slantedCylinder, testSettings, tube } from './helpers';

const R = 20;

function radii(r: ReturnType<typeof runPipeline>, zMin: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.count; i++)
    if (r.feature[i] === FEATURE_WALL && r.xyz[3 * i + 2] > zMin)
      out.push(Math.hypot(r.xyz[3 * i], r.xyz[3 * i + 1]));
  return out;
}

describe('non-planar top', () => {
  const mesh = slantedCylinder(R, 40, 20);
  it('closed curves keep the cut face as part of every top layer', () => {
    const r = runPipeline(mesh, testSettings({ topCurves: 'closed', floorLayers: 1 }));
    expect(Math.min(...radii(r, 36))).toBeLessThan(R - 8);
    expect(r.feature.filter((f) => f === FEATURE_TRAVEL).length).toBeLessThanOrEqual(3);
  });
  for (const mode of ['spiral', 'layered', 'normal'] as const) {
    it(`${mode}: open lines stay on the wall and are joined by travel moves`, () => {
      const s = testSettings({ topCurves: 'open', mode, floorLayers: 1, topAngle: 35 });
      const r = runPipeline(mesh, s);
      expect(Math.min(...radii(r, 36))).toBeGreaterThan(R - 1.5);
      expect(r.feature.filter((f) => f === FEATURE_TRAVEL).length).toBeGreaterThan(5);
      // the hop keeps the nozzle above the print while travelling
      const g = buildGcode(r, s);
      expect(g).toContain('; retract');
      expect(g).toContain('; unretract');
      expect(g.match(/; retract/g)?.length).toBe(g.match(/; unretract/g)?.length);
    });
  }
  it('a flat-topped vase is unchanged by open lines', () => {
    const flat = slantedCylinder(R, 40, 0);
    const a = runPipeline(flat, testSettings({ topCurves: 'closed' }));
    const b = runPipeline(flat, testSettings({ topCurves: 'open' }));
    expect(b.count).toBe(a.count);
  });
});

describe('standard layers', () => {
  const mesh = tube(24, 12, 40);
  it('prints the outer wall and the inner wall of a hole, with travel and retraction', () => {
    const s = testSettings({ mode: 'normal', floorLayers: 0 });
    const r = runPipeline(mesh, s);
    const rad = radii(r, 10);
    expect(rad.some((x) => Math.abs(x - 24) < 0.6)).toBe(true);
    expect(rad.some((x) => Math.abs(x - 12) < 0.6)).toBe(true);
    expect(r.feature.filter((f) => f === FEATURE_TRAVEL).length).toBeGreaterThan(10);
    const g = buildGcode(r, s);
    expect(g).toContain('; retract');
    // the retraction is undone before printing again
    expect(g.match(/; retract/g)?.length).toBe(g.match(/; unretract/g)?.length);
  });
  it('spiral mode ignores the hole', () => {
    const r = runPipeline(mesh, testSettings({ mode: 'spiral', floorLayers: 0 }));
    expect(Math.min(...radii(r, 10))).toBeGreaterThan(20);
    expect(r.warnings.some((w) => /Inner walls/.test(w))).toBe(true);
  });
  it('travel hops do not trigger the build height warning', () => {
    const s = testSettings({ mode: 'normal', floorLayers: 0, zHop: 30 });
    const r = runPipeline(mesh, { ...s, buildHeight: 45 });
    expect(r.warnings.some((w) => /taller/.test(w))).toBe(false);
  });
});
