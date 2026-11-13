import { describe, expect, it } from 'vitest';
import { DEFAULT_PATTERN, PATTERN_KINDS, patternMask } from '../src/core/textures/noise';
import { radialOffset, type TexCtx } from '../src/core/textures/textures';
import type { Mask, MaskPattern, PatternKind, TextureLayer } from '../src/core/types';
import { newTexture } from '../src/domain/print';

const at = (ang: number, z: number, rad = 20) => ({
  ang,
  rad,
  z,
  H: 60,
  u: ang / (2 * Math.PI) + 0.5,
  v: z / 60,
});
const pat = (o: Partial<MaskPattern>): MaskPattern => ({ ...DEFAULT_PATTERN, ...o });
const kinds = PATTERN_KINDS.map(([k]) => k).filter((k) => k !== 'image') as PatternKind[];
const sweep = (p: MaskPattern) => {
  const out: number[] = [];
  for (let i = 0; i < 40; i++)
    for (let j = 0; j < 20; j++)
      out.push(patternMask(p, at(-Math.PI + (i / 40) * 2 * Math.PI, j * 3)));
  return out;
};

describe('mask patterns', () => {
  it('stay within 0..1 and are repeatable for every kind', () => {
    for (const kind of kinds) {
      const a = sweep(pat({ kind }));
      expect(a.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(sweep(pat({ kind }))).toEqual(a);
    }
  });

  it('have both covered and empty areas at 50% coverage, and the seed changes noise', () => {
    for (const kind of ['simplex', 'billow', 'ridged', 'cells', 'cracks'] as const) {
      const a = sweep(pat({ kind, coverage: 50, scale: 12 }));
      expect(Math.max(...a)).toBeGreaterThan(0.9);
      expect(Math.min(...a)).toBeLessThan(0.1);
    }
    expect(sweep(pat({ seed: 1 }))).not.toEqual(sweep(pat({ seed: 2 })));
  });

  it('coverage grows the covered area; invert flips it', () => {
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const lo = mean(sweep(pat({ coverage: 20 })));
    const mid = mean(sweep(pat({ coverage: 50 })));
    const hi = mean(sweep(pat({ coverage: 80 })));
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
    expect(mean(sweep(pat({ coverage: 100 })))).toBeGreaterThan(0.99);
    expect(mean(sweep(pat({ coverage: 0 })))).toBeLessThan(0.01);
    const m = pat({ coverage: 30 });
    expect(mean(sweep({ ...m, invert: true }))).toBeCloseTo(1 - mean(sweep(m)), 5);
  });

  it('close seamlessly around the object', () => {
    for (const kind of [...kinds, 'image'] as PatternKind[]) {
      const image: Mask = { width: 2, height: 2, data: Uint8Array.from([0, 255, 255, 0]) };
      const p = pat({ kind, rotate: 30 });
      for (const z of [5, 31]) {
        const a = patternMask(p, at(-Math.PI + 1e-6, z), image);
        const b = patternMask(p, at(Math.PI - 1e-6, z), image);
        expect(Math.abs(a - b)).toBeLessThan(0.05);
      }
    }
  });

  it('gradient covers the top part of the model', () => {
    const p = pat({ kind: 'gradient', coverage: 30, softness: 0 });
    expect(patternMask(p, at(0, 55))).toBe(1);
    expect(patternMask(p, at(0, 10))).toBe(0);
  });

  it('image: bright = texture, upright, and it repeats', () => {
    const image: Mask = { width: 1, height: 2, data: Uint8Array.from([255, 0]) }; // top bright
    const p = pat({ kind: 'image' });
    expect(patternMask(p, at(0, 55), image)).toBeCloseTo(1, 1);
    expect(patternMask(p, at(0, 5), image)).toBeCloseTo(0, 1);
    const tiled = pat({ kind: 'image', tilesV: 2 });
    expect(patternMask(tiled, at(0, 25), image)).toBeCloseTo(1, 1); // top of the lower tile
    expect(patternMask({ ...p, invert: true }, at(0, 55), image)).toBeCloseTo(0, 1);
    expect(patternMask(p, at(0, 30), null)).toBe(1); // no picture yet: no effect
  });
});

describe('a pattern limits where a texture applies', () => {
  const base = (o: Partial<TextureLayer>): TextureLayer => ({
    ...newTexture('ribs'),
    amplitude: 2,
    count: 5,
    from: 0,
    to: 100,
    solidFrom: 0,
    solid: 100,
    ...o,
  });
  const c = (ang: number, z: number): TexCtx => ({
    t: 0.25,
    arc: 7.5,
    zStart: 0,
    fadeIn: 0,
    lh: 2,
    ...at(ang, z),
  });
  it('removes the texture where the pattern is empty, and multiplies with the painted mask', () => {
    const l = base({ maskPattern: pat({ kind: 'gradient', coverage: 30, softness: 0 }) });
    const free = base({});
    expect(radialOffset([l], c(0, 10))).toBe(0);
    expect(radialOffset([l], c(0, 55))).toBeCloseTo(radialOffset([free], c(0, 55)), 8);
    const painted = base({
      maskPattern: pat({ kind: 'gradient', coverage: 100 }),
      mask: { width: 1, height: 1, data: Uint8Array.from([0]) },
    });
    expect(radialOffset([painted], c(0, 55))).toBe(0);
  });
});

describe('curvature mask', () => {
  const cv = (o: Partial<MaskPattern>, curv: number) =>
    patternMask(pat({ kind: 'curvature', softness: 0, ...o }), { ...at(0, 10), curv });
  it('applies to convex, concave or both, by radius threshold', () => {
    // radius 10 mm vs threshold radius 20 mm: tighter, so applies
    expect(cv({ curvature: 'convex', scale: 20 }, 1 / 10)).toBe(1);
    expect(cv({ curvature: 'convex', scale: 20 }, -1 / 10)).toBe(0);
    expect(cv({ curvature: 'concave', scale: 20 }, -1 / 10)).toBe(1);
    expect(cv({ curvature: 'either', scale: 20 }, -1 / 10)).toBe(1);
    // flatter than the threshold radius: does not apply, and invert flips it
    expect(cv({ curvature: 'either', scale: 20 }, 1 / 50)).toBe(0);
    expect(cv({ curvature: 'either', scale: 20, invert: true }, 1 / 50)).toBe(1);
  });
});
