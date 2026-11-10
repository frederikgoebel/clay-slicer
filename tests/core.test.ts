import { describe, expect, it } from 'vitest';
import { buildGcode } from '../src/core/gcode/gcode';
import { signedArea } from '../src/core/geometry/contour';
import { buildMesh } from '../src/core/geometry/mesh';
import { sliceLayers } from '../src/core/geometry/slice';
import { lathe } from '../src/core/samples';
import { createMask } from '../src/core/textures/mask';
import {
  actualArea,
  beadArea,
  estimateWidth,
  nominalWidth,
  widthFromArea,
} from '../src/core/toolpath/bead';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { FEATURE_WALL } from '../src/core/types';
import { newTexture } from '../src/domain/print';
import { cylinder, TEST_WIDTH, testSettings } from './helpers';

describe('slicing', () => {
  it('cuts a cylinder into CCW loops with the right area', () => {
    for (const loops of sliceLayers(cylinder(), 2, 29)) {
      expect(loops.length).toBe(1);
      const ratio = signedArea(loops[0]) / (Math.PI * 400);
      expect(ratio).toBeGreaterThan(0.99);
      expect(ratio).toBeLessThan(1.001);
    }
  });
});

describe('bead model', () => {
  const s = testSettings();
  it('round-trips area and width', () => {
    expect(widthFromArea(beadArea(4, 2), 2)).toBeCloseTo(4);
    expect(widthFromArea(beadArea(6.5, 1.2), 1.2)).toBeCloseTo(6.5);
  });
  it('calculates the line width from extrusion rate, speed and layer height', () => {
    expect(nominalWidth(s)).toBeCloseTo(TEST_WIDTH);
    expect(estimateWidth({ ...s, flowFollowsSpeed: 0.5 }, s.printSpeed)).toBeCloseTo(TEST_WIDTH);
    expect(nominalWidth({ ...s, extrusionRate: s.extrusionRate * 1.2 })).toBeGreaterThan(
      TEST_WIDTH,
    );
    expect(nominalWidth({ ...s, printSpeed: s.printSpeed * 2 })).toBeLessThan(TEST_WIDTH);
    expect(nominalWidth({ ...s, layerHeight: 1 })).toBeGreaterThan(TEST_WIDTH);
  });
  it('widens when slower only for pressure-fed extruders', () => {
    const base = { ...s, flowFollowsSpeed: 0 };
    expect(estimateWidth(base, s.printSpeed / 2)).toBeCloseTo(TEST_WIDTH); // E-driven: no change
    expect(estimateWidth({ ...base, flowFollowsSpeed: 1 }, s.printSpeed / 2)).toBeGreaterThan(
      TEST_WIDTH * 1.4,
    );
    expect(actualArea({ ...base, flowFollowsSpeed: 1 }, s.printSpeed / 2)).toBeCloseTo(
      2 * actualArea(base, s.printSpeed),
    );
  });
});

describe('toolpath', () => {
  const s = testSettings();
  const res = runPipeline(cylinder(), s);

  it('stays on the cylinder and rises monotonically', () => {
    for (let i = 0; i < res.count; i++) {
      if (res.feature[i] === FEATURE_WALL)
        expect(Math.hypot(res.xyz[3 * i], res.xyz[3 * i + 1])).toBeCloseTo(20, 0);
      if (i > 0) expect(res.xyz[3 * i + 2]).toBeGreaterThanOrEqual(res.xyz[3 * i - 1] - 1e-6);
    }
    expect(res.stats.heightMm).toBeCloseTo(60, 0);
  });

  it('has per-point widths and sane material numbers', () => {
    expect(res.width.length).toBe(res.count);
    expect(res.stats.widthAvg).toBeCloseTo(TEST_WIDTH, 1);
    expect(res.warnings.filter((w) => w.startsWith('Path'))).toEqual([]);
    expect(res.stats.volumeCm3).toBeGreaterThan(20);
    expect(res.stats.wetG).toBeGreaterThan(res.stats.firedG);
    expect(res.stats.maxOverhangDeg).toBeLessThan(1);
  });

  it('slows small layers with min layer time and widens beads on pressure-fed setups', () => {
    const slow = runPipeline(cylinder(), testSettings({ minLayerTime: 60, flowFollowsSpeed: 1 }));
    expect(Math.min(...slow.speed.slice(-300))).toBeLessThan(s.printSpeed);
    expect(slow.stats.widthMax).toBeGreaterThan(TEST_WIDTH * 1.2);
  });

  it('flags overhangs on a flared shape', () => {
    const bowl = lathe((z) => 30 + z * 0.8, 40, 80, 96);
    const r = runPipeline(bowl, testSettings());
    expect(r.stats.maxOverhangDeg).toBeGreaterThan(30);
    expect(r.warnings.some((w) => w.startsWith('Overhang'))).toBe(true);
  });

  it('applies textures deterministically', () => {
    const t = testSettings({ textures: [newTexture('fuzzy'), newTexture('wave')] });
    const a = runPipeline(cylinder(), t);
    const b = runPipeline(cylinder(), t);
    expect(Array.from(a.xyz.slice(5000, 5030))).toEqual(Array.from(b.xyz.slice(5000, 5030)));
    const rs = Array.from({ length: a.count }, (_, i) =>
      Math.hypot(a.xyz[3 * i], a.xyz[3 * i + 1]),
    );
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(1);
  });

  it('only textures where the mask is painted', () => {
    const wave = { ...newTexture('wave'), count: 6, wavelength: 0, amplitude: 2, fade: 0 };
    const mask = createMask(0);
    // paint the +x half: u = angle / 2pi + 0.5, so u = 0.5 is +x and u in (0.25, 0.75) is x > 0
    for (let j = 0; j < mask.height; j++)
      for (let i = 0; i < mask.width; i++) {
        const u = (i + 0.5) / mask.width;
        if (u > 0.25 && u < 0.75) mask.data[j * mask.width + i] = 255;
      }
    const res = runPipeline(cylinder(), testSettings({ textures: [{ ...wave, mask }] }));
    let painted = 0;
    let unpainted = 0;
    for (let i = 0; i < res.count; i++) {
      if (res.feature[i] !== FEATURE_WALL || res.xyz[3 * i + 2] < 20) continue;
      const x = res.xyz[3 * i];
      const y = res.xyz[3 * i + 1];
      const dev = Math.abs(Math.hypot(x, y) - 20);
      if (x > 12) painted = Math.max(painted, dev);
      if (x < -12) unpainted = Math.max(unpainted, dev);
    }
    expect(painted).toBeGreaterThan(1);
    expect(unpainted).toBeLessThan(0.05);
  });

  it('layered mode produces rings', () => {
    const r = runPipeline(cylinder(), testSettings({ mode: 'layered' }));
    expect(r.count).toBeGreaterThan(100);
  });

  it('warns when the model does not fit the printer', () => {
    const r = runPipeline(cylinder(150, 60), testSettings({ segLen: 4 }));
    expect(r.warnings.some((w) => w.startsWith('Path leaves'))).toBe(true);
  });
});

describe('gcode', () => {
  it('emits monotonic absolute E and no retraction', () => {
    const s = testSettings();
    const g = buildGcode(runPipeline(cylinder(), s), s, 'cyl');
    const es = [...g.matchAll(/ E(-?\d+\.\d+)/g)].map((m) => parseFloat(m[1]));
    expect(es.length).toBeGreaterThan(1000);
    for (let i = 1; i < es.length; i++) expect(es[i]).toBeGreaterThanOrEqual(es[i - 1]);
    expect(g).toContain('G28');
    expect(g).toContain(';TYPE:FLOOR');
  });
});

describe('mesh transform', () => {
  it('drops to the bed, centres and applies shrinkage compensation', () => {
    const m = buildMesh(cylinder(20, 60), {
      scalePct: 100,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      shrinkagePct: 20,
    });
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < m.length; i += 3) {
      minZ = Math.min(minZ, m[i + 2]);
      maxZ = Math.max(maxZ, m[i + 2]);
      minX = Math.min(minX, m[i]);
      maxX = Math.max(maxX, m[i]);
    }
    expect(minZ).toBeCloseTo(0);
    expect(minX + maxX).toBeCloseTo(0);
    expect(maxZ).toBeCloseTo(75, 3); // 60 / (1 - 0.2)
  });
});

describe('no floor and blobs', () => {
  it('prints without a floor, starting at the bed with a travel', () => {
    const r = runPipeline(cylinder(), testSettings({ floorLayers: 0 }));
    expect(r.feature[0]).toBe(0);
    expect(Array.from(r.feature).filter((f) => f === 1).length).toBe(0);
    expect(r.xyz[2]).toBeCloseTo(2, 1);
    expect(r.stats.heightMm).toBeCloseTo(60, 0);
  });
  it('dwells at repeated points and adds time, clay and G-code', () => {
    const base = testSettings();
    const blob = { ...newTexture('blobs'), count: 10, amplitude: 2, wavelength: 6 };
    const s = testSettings({ textures: [blob] });
    const a = runPipeline(cylinder(), base);
    const b = runPipeline(cylinder(), s);
    const n = Array.from(b.dwell).filter((d) => d > 0).length;
    expect(n).toBeGreaterThan(50);
    expect(Array.from(a.dwell).every((d) => d === 0)).toBe(true);
    expect(b.stats.timeS).toBeGreaterThan(a.stats.timeS + n * 0.5);
    expect(b.stats.volumeCm3).toBeGreaterThan(a.stats.volumeCm3);
    const g = buildGcode(b, s);
    expect(g.split('\n').filter((l) => l.includes('; blob')).length).toBe(n);
  });
  it('scales the dwell with the painted mask and the start fade-in', () => {
    const blob = { ...newTexture('blobs'), count: 10, amplitude: 2, wavelength: 6, fade: 0 };
    const maxDwell = (mask: number, fadeIn = 0) => {
      const m = createMask(0);
      m.data.fill(mask);
      const r = runPipeline(
        cylinder(),
        testSettings({ textures: [{ ...blob, mask: m }], textureFadeIn: fadeIn }),
      );
      return Math.max(...Array.from(r.dwell));
    };
    const full = maxDwell(255);
    expect(full).toBeCloseTo(2, 1);
    expect(maxDwell(128)).toBeCloseTo(full / 2, 1);
    expect(maxDwell(255, 40)).toBeLessThan(full + 1e-9);
    const early = runPipeline(cylinder(), testSettings({ textures: [blob], textureFadeIn: 40 }));
    const firstLayers = Array.from(early.dwell).filter((d, i) => d > 0 && early.xyz[3 * i + 2] < 8);
    expect(Math.max(0, ...firstLayers)).toBeLessThan(1);
  });
});
