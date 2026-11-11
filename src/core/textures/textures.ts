import type { TextureLayer } from '../types';
import { curveAt } from './curve';
import { sampleImage, sampleMask } from './mask';
import { patternMask } from './noise';

export interface TexCtx {
  z: number;
  /** total printed height, mm (for the height-range masks) */
  H: number;
  /** position around the loop, 0..1 (wraps) */
  t: number;
  /** running index of the point along the wall path */
  idx: number;
  /** distance between points along the path, mm */
  spacing: number;
  /** z above which textures may start (top of floor) */
  zStart: number;
  fadeIn: number;
  /** layer height, mm */
  lh: number;
  /** angle around the vertical axis 0..1, and height / model height 0..1, for painted masks */
  u: number;
  v: number;
  /** angle (rad, atan2) and distance of the base point around the layer's centre, for decals */
  ang: number;
  rad: number;
  /** signed curvature of the contour here, 1/mm (convex +); only filled in for curvature masks */
  curv?: number;
}

const TAU = Math.PI * 2;

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** deterministic hash noise in [-1, 1] */
function hash(seed: number, n: number): number {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function valueNoise(seed: number, x: number): number {
  const xi = Math.floor(x);
  const t = smooth(x - xi);
  return hash(seed, xi) * (1 - t) + hash(seed, xi + 1) * t;
}

function tri(phase: number): number {
  return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
}

function heightMask(l: TextureLayer, z: number, H: number): number {
  const zf = (l.from / 100) * H;
  const zt = (l.to / 100) * H;
  if (z < zf || z > zt) return 0;
  // zero at `from`, eases in to full strength at `solidFrom`, holds until `solid`, eases out to
  // zero at `to` (older saves have no fade handles: both then sit on the ends = hard edges)
  const za = Math.min(zt, Math.max(zf, ((l.solidFrom ?? l.from) / 100) * H));
  const zs = Math.min(zt, Math.max(za, ((l.solid ?? l.to) / 100) * H));
  if (z < za) return za > zf ? smooth((z - zf) / (za - zf)) : 1;
  if (z <= zs || zt <= zs) return 1;
  return 1 - smooth((z - zs) / (zt - zs));
}

/** True when a texture uses a curvature mask, so callers know to compute the contour curvature. */
export const needsCurvature = (layers: TextureLayer[]): boolean =>
  layers.some((l) => l.enabled && l.maskPattern?.kind === 'curvature');

/** Painted mask times pattern mask (noise, stripes, image ...) at a point; 1 where there is none. */
function maskValue(l: TextureLayer, c: TexCtx): number {
  let m = l.mask ? sampleMask(l.mask, c.u, c.v) : 1;
  if (m > 0 && l.maskPattern)
    m *= patternMask(
      l.maskPattern,
      { ang: c.ang, rad: c.rad, z: c.z, H: c.H, u: c.u, v: c.v, curv: c.curv },
      l.maskImage,
    );
  return m;
}

const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);

/** Decal value 0..1 at this point (image placed on the surface, in mm); -1 outside the picture. */
function decalValue(l: TextureLayer, c: TexCtx): number {
  if (!l.image || l.width <= 0 || l.hgt <= 0) return -1;
  const s = wrapPi(c.ang - (l.angle * Math.PI) / 180) * c.rad;
  const dz = c.z - l.zc;
  const r = (-l.rot * Math.PI) / 180;
  const u = (s * Math.cos(r) - dz * Math.sin(r)) / l.width + 0.5;
  const v = (s * Math.sin(r) + dz * Math.cos(r)) / l.hgt + 0.5;
  if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
  const g = sampleImage(l.image, u, v);
  return l.invert ? 1 - g : g;
}

function blendInto(off: number, value: number, m: number, blend: TextureLayer['blend']): number {
  if (blend === 'max') return off + (Math.max(off, value) - off) * m;
  if (blend === 'replace') return off + (value - off) * m;
  return off + value * m;
}

/** Outdent 0..1: the height curve across the texture's range times the curve around the object. */
function ledgeValue(l: TextureLayer, c: TexCtx): number {
  const zf = (l.from / 100) * c.H;
  const zt = (l.to / 100) * c.H;
  if (zt <= zf) return 0;
  const n = Math.max(1, Math.round((zt - zf) / Math.max(l.wavelength, 0.1)));
  const s = Math.min(n - 1e-9, Math.max(0, ((c.z - zf) / (zt - zf)) * n));
  const k = Math.floor(s);
  const along = curveAt(l.curveV, s - k);
  // each repeat in height is turned a little further around the object
  const u = c.u + (k * (l.rotStep ?? 0)) / 360;
  const f = (u * Math.max(1, l.count)) % 1;
  return along * curveAt(l.curveA, f < 0 ? f + 1 : f);
}

/**
 * Sling 0..1: a triangular spike outward (the nozzle leaves the wall and comes back), in rows every
 * `wavelength` mm, `count` per row, each row turned by `rotStep` degrees, `layersDown` consecutive
 * layers drooping. `width` is its width along the wall in mm.
 */
function slingValue(l: TextureLayer, c: TexCtx): number {
  if (l.count < 1 || l.width <= 0) return 0;
  const down = Math.max(1, Math.round(l.layersDown ?? 1));
  const every = Math.max(down, l.wavelength > 0 ? Math.round(l.wavelength / c.lh) : 1);
  const layer = Math.floor(c.z / c.lh + 1e-6);
  if (layer % every >= down) return 0; // only the first `down` layers of each row droop
  const row = Math.floor(layer / every);
  const f = l.count * (c.t + (row * (l.rotStep ?? 0)) / 360);
  const arc = (f - Math.floor(f) - 0.5) * ((TAU * c.rad) / l.count);
  return Math.max(0, 1 - Math.abs(arc) / (l.width / 2));
}

/** Total radial offset (mm, along the outward normal) from all non-twist layers.
 * Layers are applied in list order like image layers: each one blends onto the result so far,
 * weighted by its height range and its (painted, grayscale) mask.
 */
export function radialOffset(layers: TextureLayer[], c: TexCtx): number {
  const gate = c.fadeIn > 0 ? smooth((c.z - c.zStart) / c.fadeIn) : c.z >= c.zStart ? 1 : 0;
  if (gate === 0) return 0;
  let off = 0;
  for (const l of layers) {
    if (!l.enabled || l.type === 'twist' || l.type === 'blobs') continue;
    let m = heightMask(l, c.z, c.H);
    if (m === 0) continue;
    m *= maskValue(l, c);
    if (m === 0) continue;
    if (l.type === 'ledge' || l.type === 'sling') {
      const value = l.amplitude * (l.type === 'ledge' ? ledgeValue(l, c) : slingValue(l, c));
      if (value === 0) continue;
      off = blendInto(off, value, m, l.blend);
      continue;
    }
    const phase = l.count * c.t + (l.wavelength > 0 ? c.z / l.wavelength : 0);
    let v = 0;
    switch (l.type) {
      case 'fuzzy': {
        const size = Math.max(l.wavelength, c.spacing);
        v =
          size <= c.spacing * 1.01
            ? hash(l.seed, c.idx)
            : valueNoise(l.seed, (c.idx * c.spacing) / size);
        break;
      }
      case 'wave':
        v = Math.sin(TAU * phase);
        break;
      case 'zigzag':
        v = tri(phase);
        break;
      case 'ribs':
        v = 2 * Math.sqrt(Math.abs(Math.sin(Math.PI * phase))) - 1;
        break;
      case 'decal':
        v = decalValue(l, c);
        if (v < 0) continue;
        break;
    }
    off = blendInto(off, l.amplitude * v, m, l.blend);
  }
  return off * gate;
}

/** Twist angle in radians at height z. */
export function twistAngle(layers: TextureLayer[], z: number, H: number): number {
  let a = 0;
  for (const l of layers) {
    if (!l.enabled || l.type !== 'twist') continue;
    const zf = (l.from / 100) * H;
    const zt = (l.to / 100) * H;
    const f = zt > zf ? Math.min(1, Math.max(0, (z - zf) / (zt - zf))) : 0;
    a += ((l.amplitude * Math.PI) / 180) * smooth(f);
  }
  return a;
}

/**
 * Seconds to stand still (while extruding) at this point, to build up a blob of clay.
 * Scaled by the fades and the painted mask.
 * Blobs sit in rows every `wavelength` mm (rounded to whole layers; 0 = every layer),
 * `count` per row, and alternate rows are shifted by half a spacing. A blob is placed at
 * the first point past each blob position; `dt` is the loop step between points.
 */
export function dwellSeconds(
  layers: TextureLayer[],
  c: TexCtx,
  layerHeight: number,
  dt: number,
): number {
  if (c.z < c.zStart) return 0;
  const gate = c.fadeIn > 0 ? smooth((c.z - c.zStart) / c.fadeIn) : 1;
  let total = 0;
  for (const l of layers) {
    if (!l.enabled || l.type !== 'blobs' || l.count < 1 || l.amplitude <= 0) continue;
    // the dwell time scales with everything that fades the effect: the height range and its
    // soft edges, the start fade-in, and the painted mask (a half-painted spot gets half the dwell)
    let m = heightMask(l, c.z, c.H) * gate;
    m *= maskValue(l, c);
    if (l.amplitude * m < 0.02) continue;
    const every = l.wavelength > 0 ? Math.max(1, Math.round(l.wavelength / layerHeight)) : 1;
    const layer = Math.floor(c.z / layerHeight + 1e-6);
    if (layer % every !== 0) continue;
    const off = 0.5 * ((layer / every) % 2);
    if (Math.floor(l.count * c.t + off) !== Math.floor(l.count * (c.t - dt) + off))
      total += l.amplitude * m;
  }
  return total;
}

/** How far the nozzle rises (mm) while standing still extruding a blob. */
export function blobLift(layers: TextureLayer[]): number {
  let lift = 0;
  for (const l of layers) if (l.enabled && l.type === 'blobs') lift = Math.max(lift, l.lift ?? 0);
  return lift;
}
