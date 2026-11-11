import { describe, expect, it } from 'vitest';
import { createMask, sampleMask, Stroke } from '../src/core/textures/mask';
import { blobLift, radialOffset, type TexCtx } from '../src/core/textures/textures';
import { runPipeline } from '../src/core/toolpath/pipeline';
import type { Mask, TextureLayer } from '../src/core/types';
import { ONE_SIDE, BRIDGE_BACK, newTexture } from '../src/domain/print';
import { cylinder, testSettings } from './helpers';

const ctx = (o: Partial<TexCtx> = {}): TexCtx => ({
  z: 30,
  H: 60,
  t: 0.25,
  idx: 5,
  spacing: 1.5,
  zStart: 0,
  fadeIn: 0,
  lh: 2,
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
  solidFrom: 0,
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

describe('ledge, sling and blob lift', () => {
  it('outdent follows the height curve and the curve around the object', () => {
    const l = tex('ledge', { amplitude: 10, from: 0, to: 100, wavelength: 60, count: 1 });
    const at = (z: number, u = 0.5) => radialOffset([l], ctx({ z, H: 60, u }));
    expect(at(0)).toBeCloseTo(0, 5);
    expect(at(15)).toBeCloseTo(5, 5); // halfway up the ramp
    expect(at(30)).toBeCloseTo(10, 5); // peak
    expect(at(45)).toBeCloseTo(5, 5); // closing slowly
    const bridge = tex('ledge', { amplitude: 10, curveV: BRIDGE_BACK, wavelength: 60, count: 1 });
    expect(radialOffset([bridge], ctx({ z: 59.5, H: 60 }))).toBeLessThan(5);
    expect(radialOffset([bridge], ctx({ z: 55, H: 60 }))).toBeGreaterThan(8);
    const side = tex('ledge', { amplitude: 10, curveA: ONE_SIDE, wavelength: 60, count: 1 });
    expect(radialOffset([side], ctx({ z: 30, H: 60, u: 0.5 }))).toBeCloseTo(10, 5);
    expect(radialOffset([side], ctx({ z: 30, H: 60, u: 0.1 }))).toBeCloseTo(0, 5);
  });
  it('a sling is a spike on one layer per row', () => {
    const l = tex('sling', { amplitude: 12, count: 4, wavelength: 20, width: 10 });
    const at = (z: number, t: number) => radialOffset([l], ctx({ z, H: 60, t, rad: 20, lh: 2 }));
    expect(at(0, 0.125)).toBeCloseTo(12, 5); // centre of the first spike (t*4 = .5), row 0
    expect(at(0, 0.2)).toBe(0); // beside the spike
    expect(at(2, 0.125)).toBe(0); // other layer
  });
  it('splits the range into outdents of the given height and turns each repeat', () => {
    const l = tex('ledge', {
      amplitude: 10,
      from: 0,
      to: 100,
      count: 4,
      wavelength: 20,
      rotStep: 45,
    });
    const at = (z: number, u: number) => radialOffset([l], ctx({ z, H: 60, u }));
    expect(at(10, 0.5)).toBeCloseTo(10, 5); // peak of repeat 1 (z 0..20)
    expect(at(30, 0.5)).toBeCloseTo(10, 5); // peak of repeat 2
    expect(at(20, 0.5)).toBeCloseTo(0, 5); // between repeats it closes
    const side = { ...l, curveA: ONE_SIDE, rotStep: 90 }; // 90 deg = one period of 4 around
    expect(radialOffset([side], ctx({ z: 30, H: 60, u: 0.5 }))).toBeCloseTo(0, 5);
    expect(radialOffset([side], ctx({ z: 10, H: 60, u: 0.125 }))).toBeCloseTo(10, 5);
  });
  it('slings droop over several layers and each row turns', () => {
    const l = tex('sling', {
      amplitude: 12,
      count: 4,
      wavelength: 20,
      width: 10,
      layersDown: 3,
      rotStep: 45,
    });
    const at = (z: number, t: number) => radialOffset([l], ctx({ z, H: 60, t, rad: 20, lh: 2 }));
    expect(at(0, 0.125)).toBeCloseTo(12, 5);
    expect(at(4, 0.125)).toBeCloseTo(12, 5); // third layer still droops
    expect(at(6, 0.125)).toBe(0); // fourth does not
    expect(at(20, 0.125)).toBeCloseTo(0, 5); // next row is turned by 45 deg
    expect(at(20, 0.125 + 45 / 360)).toBeCloseTo(12, 5);
  });
  it('lifts the nozzle while a blob is made', () => {
    expect(blobLift([tex('blobs', { lift: 2.5 }), tex('wave')])).toBe(2.5);
    expect(blobLift([tex('blobs')])).toBe(0);
  });
});
