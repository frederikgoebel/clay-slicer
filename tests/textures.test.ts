import { describe, expect, it } from 'vitest';
import { createMask, sampleMask, Stroke } from '../src/core/textures/mask';
import { radialOffset, type TexCtx } from '../src/core/textures/textures';
import { runPipeline } from '../src/core/toolpath/pipeline';
import type { Mask, TextureLayer } from '../src/core/types';
import { newTexture } from '../src/domain/print';
import { cylinder, testSettings } from './helpers';

const ctx = (o: Partial<TexCtx> = {}): TexCtx => ({
  z: 30,
  H: 60,
  t: 0.25,
  idx: 5,
  spacing: 1.5,
  zStart: 0,
  fadeIn: 0,
  u: 0.5,
  v: 0.5,
  ang: 0,
  rad: 20,
  ...o,
});
const tex = (type: TextureLayer['type'], o: Partial<TextureLayer> = {}): TextureLayer => ({
  ...newTexture(type),
  from: 0,
  to: 100,
  solid: 100,
  ...o,
});

describe('texture stacking', () => {
  const wave = tex('wave', { amplitude: 1, count: 4 });
  const ribs = tex('ribs', { amplitude: 2, count: 3 });
  it('adds layers by default', () => {
    const c = ctx();
    expect(radialOffset([wave, ribs], c)).toBeCloseTo(
      radialOffset([wave], c) + radialOffset([ribs], c),
    );
  });
  it('max keeps the higher of the two, replace overrides', () => {
    const c = ctx();
    const a = radialOffset([wave], c);
    const b = radialOffset([ribs], c);
    expect(radialOffset([wave, { ...ribs, blend: 'max' }], c)).toBeCloseTo(Math.max(a, b));
    expect(radialOffset([wave, { ...ribs, blend: 'replace' }], c)).toBeCloseTo(b);
  });
  it('a half-strength mask blends halfway', () => {
    const half: Mask = { width: 1, height: 1, data: Uint8Array.from([128]) };
    const c = ctx();
    const a = radialOffset([wave], c);
    const b = radialOffset([ribs], c);
    const got = radialOffset([wave, { ...ribs, blend: 'replace', mask: half }], c);
    expect(got).toBeCloseTo(a + (b - a) * (128 / 255), 3);
  });
});

describe('brush strokes', () => {
  const stamp = (s: Stroke, x: number, opacity = 1, hardness = 0.5) =>
    s.stamp(x, 0, 30, 60, { radius: 10, hardness, opacity, erase: false });
  it('fades toward the edge and respects opacity', () => {
    const m = createMask(0);
    stamp(new Stroke(m), 20, 0.5);
    const centre = sampleMask(m, 0.5, 0.5);
    const edge = sampleMask(m, 0.5 + 9 / 20 / (2 * Math.PI), 0.5);
    expect(centre).toBeCloseTo(0.5, 1);
    expect(edge).toBeLessThan(centre * 0.6);
  });
  it('does not pile up inside one stroke, but builds up across strokes', () => {
    const m = createMask(0);
    const s = new Stroke(m);
    for (let i = 0; i < 20; i++) stamp(s, 20, 0.4);
    expect(sampleMask(m, 0.5, 0.5)).toBeCloseTo(0.4, 1);
    stamp(new Stroke(m), 20, 0.4);
    expect(sampleMask(m, 0.5, 0.5)).toBeCloseTo(0.64, 1);
  });
  it('erases toward zero', () => {
    const m = createMask(255);
    new Stroke(m).stamp(20, 0, 30, 60, { radius: 10, hardness: 0.5, opacity: 0.5, erase: true });
    expect(sampleMask(m, 0.5, 0.5)).toBeCloseTo(0.5, 1);
  });
});

describe('decal', () => {
  it('raises the surface where the image is bright, and only inside its footprint', () => {
    // left half black, right half white
    const image: Mask = { width: 2, height: 1, data: Uint8Array.from([0, 255]) };
    const d = tex('decal', { amplitude: 2, angle: 0, zc: 30, width: 20, hgt: 20, image });
    expect(radialOffset([d], ctx({ ang: (0.2 / 20) * 5, z: 30 }))).toBeGreaterThan(1); // right half
    expect(radialOffset([d], ctx({ ang: -5 / 20, z: 30 }))).toBeCloseTo(0);
    expect(radialOffset([d], ctx({ ang: 0, z: 80 }))).toBe(0);
    expect(radialOffset([d], ctx({ ang: Math.PI, z: 30 }))).toBe(0);
    expect(radialOffset([{ ...d, invert: true }], ctx({ ang: -5 / 20 }))).toBeGreaterThan(1);
  });
  it('changes the print path only where it sits', () => {
    const image: Mask = { width: 1, height: 1, data: Uint8Array.from([255]) };
    const d = tex('decal', { amplitude: 3, angle: 0, zc: 30, width: 20, hgt: 20, image });
    const a = runPipeline(cylinder(), testSettings());
    const b = runPipeline(cylinder(), testSettings({ textures: [d] }));
    let max = 0;
    for (let i = 0; i < b.count; i++)
      max = Math.max(max, Math.hypot(b.xyz[3 * i], b.xyz[3 * i + 1]) - 20);
    expect(max).toBeGreaterThan(2.5);
    expect(b.stats.lengthMm).toBeGreaterThan(a.stats.lengthMm);
  });
});
