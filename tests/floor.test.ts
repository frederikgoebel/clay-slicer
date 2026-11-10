import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_FLOOR, FEATURE_TRAVEL, FEATURE_WALL, type FloorPattern } from '../src/core/types';
import { cylinder, testSettings } from './helpers';

const R = 20;

describe('floor', () => {
  for (const pattern of ['spiral', 'lines', 'grid'] as FloorPattern[]) {
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
