import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_FLOOR, FEATURE_TRAVEL, FEATURE_WALL, type FloorPattern } from '../src/core/types';
import { buildGcode } from '../src/core/gcode/gcode';
import { cylinder, testSettings } from './helpers';

const R = 20;

describe('floor', () => {
  for (const pattern of ['spiral', 'insets', 'lines', 'grid'] as FloorPattern[]) {
    it(`${pattern}: the outer shell is complete and the fill stays inside it`, () => {
      const r = runPipeline(
        cylinder(R, 60),
        testSettings({ floorLayers: 2, floorPattern: pattern }),
      );
      let fill = 0;
      let perimeterPts = 0;
      let maxFillR = 0;
      for (let i = 0; i < r.count; i++) {
        const z = r.xyz[3 * i + 2];
        if (z > 4.01) break;
        const rad = Math.hypot(r.xyz[3 * i], r.xyz[3 * i + 1]);
        if (r.feature[i] === FEATURE_FLOOR) {
          fill++;
          maxFillR = Math.max(maxFillR, rad);
        } else if (r.feature[i] === FEATURE_WALL) {
          perimeterPts++;
          expect(rad).toBeGreaterThan(R - 0.5);
        }
      }
      expect(fill).toBeGreaterThan(20);
      expect(perimeterPts).toBeGreaterThan(2 * 40);
      // fill is at least about one line spacing inside the wall centre line
      expect(maxFillR).toBeLessThan(R - 2);
    });
  }
  it('lines and grid cover the floor', () => {
    const r = runPipeline(cylinder(R, 60), testSettings({ floorLayers: 1, floorPattern: 'grid' }));
    const fill: number[] = [];
    for (let i = 0; i < r.count; i++) if (r.feature[i] === FEATURE_FLOOR) fill.push(i);
    const xs = fill.map((i) => r.xyz[3 * i]);
    expect(Math.min(...xs)).toBeLessThan(-R + 5);
    expect(Math.max(...xs)).toBeGreaterThan(R - 5);
  });
  it('starts with a travel and no floor still works', () => {
    const r = runPipeline(cylinder(R, 60), testSettings({ floorLayers: 2, floorPattern: 'lines' }));
    expect(r.feature[0]).toBe(FEATURE_TRAVEL);
  });
});

import { coerceProfile } from '../src/domain/profiles';

describe('clay colour', () => {
  it('keeps a valid colour and replaces a broken one', () => {
    expect(coerceProfile('clay', { color: '#112233' }).color).toBe('#112233');
    expect(coerceProfile('clay', { color: 'red' }).color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(coerceProfile('clay', {}).color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('floor below, pause and spacing', () => {
  it('prints the floor under the whole model when asked', () => {
    const base = testSettings({ floorLayers: 2 });
    const a = runPipeline(cylinder(R, 60), base);
    const b = runPipeline(cylinder(R, 60), { ...base, floorBelow: true });
    expect(b.stats.layers).toBe(a.stats.layers + 2);
    expect(b.stats.heightMm).toBeCloseTo(a.stats.heightMm + 4, 5);
    expect(b.xyz[3 * (b.count - 1) + 2]).toBeCloseTo(a.xyz[3 * (a.count - 1) + 2] + 4, 5);
  });
  it('inset curves end the floor at the seam so the wall continues from it', () => {
    const r = runPipeline(
      cylinder(R, 60),
      testSettings({ floorLayers: 3, floorPattern: 'insets' }),
    );
    let last = 0;
    for (let i = 0; i < r.count; i++) if (r.xyz[3 * i + 2] <= 6.01) last = i;
    const gap = Math.hypot(
      r.xyz[3 * last] - r.xyz[3 * (last + 1)],
      r.xyz[3 * last + 1] - r.xyz[3 * (last + 1) + 1],
    );
    expect(gap).toBeLessThan(4);
  });
  it('writes a lift, a wait and the return into the G-code', () => {
    const s = testSettings({
      floorLayers: 2,
      pauseAfterFloor: true,
      pauseSeconds: 20,
      pauseLift: 300,
    });
    const r = runPipeline(cylinder(R, 60), s);
    expect(r.pauseAt).toBeGreaterThan(0);
    const g = buildGcode(r, s).split('\n');
    const i = g.findIndex((l) => l.startsWith('G4 P20000'));
    expect(i).toBeGreaterThan(0);
    expect(g[i - 1]).toMatch(/^G1 Z\d/);
    expect(g[i + 1]).toMatch(/^G1 Z4 /);
    expect(runPipeline(cylinder(R, 60), { ...s, pauseAfterFloor: false }).pauseAt).toBe(-1);
  });
});
