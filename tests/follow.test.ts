import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_WALL } from '../src/core/types';
import { cylinder, slantedCylinder, testSettings } from './helpers';

const tilt = Math.tan((20 * Math.PI) / 180);

describe('follow the top (variable layer height)', () => {
  const mesh = slantedCylinder(20, 40, 20);
  const s = testSettings({ topCurves: 'follow', topAngle: 35, floorLayers: 1, topFinish: false });
  const r = runPipeline(mesh, s);
  const first = r.feature.findIndex((f) => f === FEATURE_WALL);

  it('tilts with the rim (it rises and falls around each turn) and ends on it', () => {
    let worst = 0;
    for (let i = first + 1; i < r.count; i++)
      worst = Math.min(worst, r.xyz[3 * i + 2] - r.xyz[3 * i - 1]);
    // going round, the path climbs and drops by the local rim slope, never by more than that
    expect(worst).toBeGreaterThan(-1.2);
    const n = r.count - 1;
    const x = r.xyz[3 * n];
    expect(r.xyz[3 * n + 2]).toBeCloseTo(40 + tilt * x, 0);
  });

  it('is one continuous line (no travel moves, no extra curves) and stays on the wall', () => {
    for (let i = first; i < r.count; i++) {
      expect(r.feature[i]).toBe(FEATURE_WALL);
      expect(Math.hypot(r.xyz[3 * i], r.xyz[3 * i + 1])).toBeGreaterThan(18);
      expect(Math.hypot(r.xyz[3 * i], r.xyz[3 * i + 1])).toBeLessThan(22);
    }
  });

  it('thinner layers where the rim is low, and less clay there', () => {
    let lo = Infinity;
    let hi = 0;
    for (let i = 1; i < r.count; i++) {
      lo = Math.min(lo, r.thick[i]);
      hi = Math.max(hi, r.thick[i]);
    }
    expect(hi).toBeLessThanOrEqual(2.001);
    expect(lo).toBeLessThan(hi * 0.85);
  });

  it('a flat top gives the usual constant layer height', () => {
    const flat = runPipeline(cylinder(20, 40), testSettings({ topCurves: 'follow' }));
    for (let i = 1; i < flat.count; i++) expect(flat.thick[i]).toBeCloseTo(2, 1);
    const last = flat.count - 1;
    expect(flat.xyz[3 * last + 2]).toBeCloseTo(40, 0);
  });

  it('layered mode makes rings that follow the rim', () => {
    const l = runPipeline(mesh, testSettings({ topCurves: 'follow', mode: 'layered' }));
    const n = l.count - 1;
    expect(l.xyz[3 * n + 2]).toBeCloseTo(40 + tilt * l.xyz[3 * n], 0);
  });
});
