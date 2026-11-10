import type { Mask } from '../types';

export const MASK_W = 256;
export const MASK_H = 256;
const TAU = Math.PI * 2;

export function createMask(fill: number): Mask {
  return { width: MASK_W, height: MASK_H, data: new Uint8Array(MASK_W * MASK_H).fill(fill) };
}

export function cloneMask(m: Mask): Mask {
  return { ...m, data: m.data.slice() };
}

export function invertMask(m: Mask): Mask {
  const out = cloneMask(m);
  for (let i = 0; i < out.data.length; i++) out.data[i] = 255 - out.data[i];
  return out;
}

/** Angle in 0..1 around the vertical axis for a point (x, y). */
export function angleU(x: number, y: number): number {
  return Math.atan2(y, x) / TAU + 0.5;
}

/** Bilinear sample, u wraps around, v is clamped. Returns 0..1. */
export function sampleMask(m: Mask, u: number, v: number): number {
  const { width: W, height: H, data } = m;
  const fx = u * W - 0.5;
  const fy = Math.min(H - 1, Math.max(0, v * H - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % W) + W) % W;
  const xb = (xa + 1) % W;
  const ya = y0;
  const yb = Math.min(H - 1, y0 + 1);
  const top = data[ya * W + xa] * (1 - tx) + data[ya * W + xb] * tx;
  const bottom = data[yb * W + xa] * (1 - tx) + data[yb * W + xb] * tx;
  return (top * (1 - ty) + bottom * ty) / 255;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Brush {
  /** radius on the surface, mm */
  radius: number;
  /** 0 = very soft, 1 = hard edge */
  hardness: number;
  /** 0..1: how far a stroke pushes the mask toward painted / erased */
  opacity: number;
  erase: boolean;
}

/**
 * One brush stroke, painted like a grayscale image. Overlapping stamps within a stroke do not
 * add up: each pixel keeps the strongest brush coverage it received (soft edge x opacity), and
 * the result is the mask as it was before the stroke, pushed toward 255 (paint) or 0 (erase)
 * by that coverage. A new stroke can build on top of the previous ones.
 */
export class Stroke {
  private readonly base: Uint8Array;
  private readonly cover: Float32Array;

  constructor(private readonly mask: Mask) {
    this.base = mask.data.slice();
    this.cover = new Float32Array(mask.data.length);
  }

  /** Stamp at a model-space point; the brush is measured on the surface (arc length, mm up). */
  stamp(x: number, y: number, z: number, modelHeight: number, brush: Brush): void {
    const { width: W, height: H, data } = this.mask;
    const { radius, erase } = brush;
    const r = Math.max(Math.hypot(x, y), 1);
    const cu = angleU(x, y) * W;
    const cv = (z / modelHeight) * H;
    const rv = (radius / modelHeight) * H;
    const ru = Math.min(W / 2, (radius / r / TAU) * W);
    const edge = Math.min(0.98, Math.max(0, brush.hardness));
    const j0 = Math.max(0, Math.floor(cv - rv - 1));
    const j1 = Math.min(H - 1, Math.ceil(cv + rv + 1));
    const i0 = Math.floor(cu - ru - 1);
    const i1 = Math.ceil(cu + ru + 1);
    for (let j = j0; j <= j1; j++) {
      const dz = ((j + 0.5 - cv) / H) * modelHeight;
      for (let i = i0; i <= i1; i++) {
        const dArc = ((i + 0.5 - cu) / W) * TAU * r;
        const dist = Math.hypot(dArc, dz);
        if (dist >= radius) continue;
        const strength = (1 - smoothstep(edge, 1, dist / radius)) * brush.opacity;
        const idx = j * W + (((i % W) + W) % W);
        if (strength <= this.cover[idx]) continue;
        this.cover[idx] = strength;
        const b = this.base[idx];
        data[idx] = Math.round(b + ((erase ? 0 : 255) - b) * strength);
      }
    }
  }
}

/** One-off hard-ish stamp (kept for tests and simple callers). */
export function stampBrush(
  m: Mask,
  x: number,
  y: number,
  z: number,
  radius: number,
  modelHeight: number,
  erase: boolean,
): void {
  new Stroke(m).stamp(x, y, z, modelHeight, { radius, hardness: 0.55, opacity: 1, erase });
}

/** Bilinear sample of an image at (u, v) in 0..1 (v up); 0 outside the picture. Returns 0..1. */
export function sampleImage(m: Mask, u: number, v: number): number {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const { width: W, height: H, data } = m;
  const fx = Math.min(W - 1, Math.max(0, u * W - 0.5));
  const fy = Math.min(H - 1, Math.max(0, (1 - v) * H - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = data[y0 * W + x0] * (1 - tx) + data[y0 * W + x1] * tx;
  const bottom = data[y1 * W + x0] * (1 - tx) + data[y1 * W + x1] * tx;
  return (top * (1 - ty) + bottom * ty) / 255;
}
