import type { TextureLayer } from '../types';
import { sampleImage, sampleMask } from './mask';

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
  /** angle around the vertical axis 0..1, and height / model height 0..1, for painted masks */
  u: number;
  v: number;
  /** angle (rad, atan2) and distance of the base point around the layer's centre, for decals */
  ang: number;
  rad: number;
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
  const zs = Math.min(zt, Math.max(zf, ((l.solid ?? l.to) / 100) * H));
  // full strength from `from` up to `solid`, then eases out to zero at `to`
  if (z <= zs || zt <= zs) return 1;
  return 1 - smooth((z - zs) / (zt - zs));
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

/**
 * Total radial offset (mm, along the outward normal) from all non-twist layers.
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
    if (l.mask) {
      m *= sampleMask(l.mask, c.u, c.v);
      if (m === 0) continue;
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
    const value = l.amplitude * v;
    switch (l.blend) {
      case 'max':
        off += (Math.max(off, value) - off) * m;
        break;
      case 'replace':
        off += (value - off) * m;
        break;
      default:
        off += value * m;
    }
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
    if (l.mask) m *= sampleMask(l.mask, c.u, c.v);
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
