import type { TextureLayer } from '../types';
import { curveAt, type CurvePoint } from './curve';
import { sampleImage, sampleMask } from './mask';
import { patternMask } from './noise';

export interface TexCtx {
  z: number;
  /** total printed height, mm (for the height-range masks) */
  H: number;
  /** position around the loop, 0..1 (wraps) */
  t: number;
  /** distance travelled along the wall path so far, mm (texture noise is measured in mm along it, so the point spacing does not matter) */
  arc: number;
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

/** Size of one noise cell of a fuzzy texture, mm (no wavelength: about the old point spacing). */
export const fuzzySize = (l: TextureLayer): number =>
  Math.max(0.5, l.wavelength > 0 ? l.wavelength : 1.5);

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

/** Centre of mass (0..1) of a curve's area, so an asymmetric profile is judged at its middle. */
const centroidCache = new WeakMap<object, number>();
function curveCentroid(points: CurvePoint[] | undefined): number {
  if (!points || points.length < 2) return 0.5;
  const hit = centroidCache.get(points);
  if (hit !== undefined) return hit;
  let sum = 0;
  let mom = 0;
  for (let i = 0; i < 64; i++) {
    const x = (i + 0.5) / 64;
    const y = Math.max(0, curveAt(points, x));
    sum += y;
    mom += y * x;
  }
  const c = sum > 1e-9 ? mom / sum : 0.5;
  centroidCache.set(points, c);
  return c;
}

/**
 * Outdent 0..1: the height curve across the texture's range times the curve around the object.
 * Also returns the middle of the outdent this point belongs to (one cell of the grid of repeats):
 * its height and its offset around the object, so the fades and the mask can be judged once for
 * the whole outdent instead of point by point.
 */
function ledgeCell(l: TextureLayer, c: TexCtx): { value: number; zc: number; du: number } | null {
  const zf = (l.from / 100) * c.H;
  const zt = (l.to / 100) * c.H;
  if (zt <= zf) return null;
  const n = Math.max(1, Math.round((zt - zf) / Math.max(l.wavelength, 0.1)));
  const s = Math.min(n - 1e-9, Math.max(0, ((c.z - zf) / (zt - zf)) * n));
  const k = Math.floor(s);
  const along = curveAt(l.curveV, s - k);
  // each repeat in height is turned a little further around the object
  const u = c.u + (k * (l.rotStep ?? 0)) / 360;
  const cnt = Math.max(1, l.count);
  const f = (u * cnt) % 1;
  const fr = f < 0 ? f + 1 : f;
  return {
    value: along * curveAt(l.curveA, fr),
    zc: zf + ((k + curveCentroid(l.curveV)) / n) * (zt - zf),
    du: (curveCentroid(l.curveA) - fr) / cnt,
  };
}

/** The point's context moved to the middle of its outdent. */
function atOutdentCentre(c: TexCtx, zc: number, du: number): TexCtx {
  const u = c.u + du;
  return {
    ...c,
    z: zc,
    u: u - Math.floor(u),
    v: c.z > 1e-9 ? (c.v * zc) / c.z : c.v,
    ang: c.ang + du * TAU,
    t: c.t + du,
  };
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
    if (!l.enabled || l.type === 'twist' || l.type === 'blobs' || l.type === 'flow') continue;
    if (l.type === 'ledge') {
      // an outdent is one piece: the height range, the fade-in and the mask are taken at its
      // middle, so the whole outdent gets the same strength instead of being cut up by them
      const cell = ledgeCell(l, c);
      if (!cell || cell.value === 0) continue;
      const cc = atOutdentCentre(c, cell.zc, cell.du);
      let m = heightMask(l, cc.z, cc.H);
      if (m === 0) continue;
      m *= maskValue(l, cc);
      if (m === 0) continue;
      const g = c.fadeIn > 0 ? smooth((cc.z - c.zStart) / c.fadeIn) : cc.z >= c.zStart ? 1 : 0;
      off = blendInto(off, l.amplitude * cell.value, m * (g / gate), l.blend);
      continue;
    }
    let m = heightMask(l, c.z, c.H);
    if (m === 0) continue;
    m *= maskValue(l, c);
    if (m === 0) continue;
    if (l.type === 'sling') {
      const value = l.amplitude * slingValue(l, c);
      if (value === 0) continue;
      off = blendInto(off, value, m, l.blend);
      continue;
    }
    const phase = l.count * c.t + (l.wavelength > 0 ? c.z / l.wavelength : 0);
    let v = 0;
    switch (l.type) {
      case 'fuzzy': {
        v = valueNoise(l.seed, c.arc / fuzzySize(l));
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

/**
 * Extrusion multiplier at this point (1 = unchanged) from the 'flow' layers: each adds
 * amplitude % (positive = more clay, negative = less) times its pattern, height range and masks.
 * The pattern is constant, or a sine around / up the object when `count` or `wavelength` is set.
 */
export function flowFactor(layers: TextureLayer[], c: TexCtx): number {
  if (c.z < c.zStart) return 1;
  const gate = c.fadeIn > 0 ? smooth((c.z - c.zStart) / c.fadeIn) : 1;
  let f = 1;
  for (const l of layers) {
    if (!l.enabled || l.type !== 'flow' || l.amplitude === 0) continue;
    let m = heightMask(l, c.z, c.H) * gate;
    if (m === 0) continue;
    m *= maskValue(l, c);
    if (m === 0) continue;
    const wavy = l.count > 0 || l.wavelength > 0;
    const v = wavy
      ? Math.sin(TAU * (l.count * c.t + (l.wavelength > 0 ? c.z / l.wavelength : 0)))
      : 1;
    f += (l.amplitude / 100) * v * m;
  }
  return Math.max(0.05, f);
}

/** True when any enabled layer changes the extrusion rate. */
export const hasFlow = (layers: TextureLayer[]): boolean =>
  layers.some((l) => l.enabled && l.type === 'flow' && l.amplitude !== 0);
