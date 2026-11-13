import { makeSection, type ShapeSection, type Vec, shapeMesh, type ShapeSpec } from './shape/shape';
import { FACETED_MASK_B64 } from './sampleData';
import type { PrintSettings } from '../domain/print';
import type { TextureLayer, TextureType } from './types';

/** Closed solid of revolution as a triangle soup (outward CCW winding). */
export function lathe(
  radius: (z: number) => number,
  height: number,
  rings = 120,
  segs = 96,
  ex = 1,
  ey = 1,
): Float32Array {
  const out: number[] = [];
  const P = (i: number, s: number): [number, number, number] => {
    const z = (i / rings) * height;
    const r = radius(z);
    const a = (s / segs) * Math.PI * 2;
    return [r * Math.cos(a) * ex, r * Math.sin(a) * ey, z];
  };
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c);
  for (let i = 0; i < rings; i++) {
    for (let s = 0; s < segs; s++) {
      const a = P(i, s),
        b = P(i, s + 1),
        c = P(i + 1, s + 1),
        d = P(i + 1, s);
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  const c0: [number, number, number] = [0, 0, 0];
  const c1: [number, number, number] = [0, 0, height];
  for (let s = 0; s < segs; s++) {
    tri(c0, P(0, s + 1), P(0, s));
    tri(c1, P(rings, s), P(rings, s + 1));
  }
  return Float32Array.from(out);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A sample that is a drawn shape with textures already on it. */
export interface DesignSample {
  shape: ShapeSpec;
  /** texture layers: a type and the settings that differ from a new layer of that type */
  textures: ({ type: TextureType } & Partial<TextureLayer>)[];
  /** print settings that go with it (top curves, path resolution ...) */
  print?: Partial<PrintSettings>;
  /** painted masks by texture index: zlib-compressed 256 x 256 bytes, base64 */
  masks?: Record<number, string>;
}

type SectionRow = [number, Vec[], ShapeSection['circle']];

/** Sections of the faceted vase: height, outline, perfect-circle data. */
const FACETED_SECTIONS: SectionRow[] = [
  [
    0,
    [
      [40, 0],
      [34.641, 20.0],
      [20.0, 34.641],
      [0.0, 40],
      [-20.0, 34.641],
      [-34.641, 20.0],
      [-40, 0.0],
      [-34.641, -20.0],
      [-20.0, -34.641],
      [-0.0, -40],
      [20.0, -34.641],
      [34.641, -20.0],
    ],
    { cx: 0, cy: 0, r: 40 },
  ],
  [
    70,
    [
      [56, 0],
      [48.4974, 28.0],
      [28.0, 48.4974],
      [0.0, 56],
      [-28.0, 48.4974],
      [-48.4974, 28.0],
      [-56, 0.0],
      [-48.4974, -28.0],
      [-28.0, -48.4974],
      [-0.0, -56],
      [28.0, -48.4974],
      [48.4974, -28.0],
    ],
    { cx: 0, cy: 0, r: 56 },
  ],
  [
    140,
    [
      [44, 0],
      [38.1051, 22.0],
      [22.0, 38.1051],
      [0.0, 44],
      [-22.0, 38.1051],
      [-38.1051, 22.0],
      [-44, 0.0],
      [-38.1051, -22.0],
      [-22.0, -38.1051],
      [-0.0, -44],
      [22.0, -38.1051],
      [38.1051, -22.0],
    ],
    { cx: 0, cy: 0, r: 44 },
  ],
  [
    190,
    [
      [38, 0],
      [32.909, 19.0],
      [19.0, 32.909],
      [0.0, 38],
      [-19.0, 32.909],
      [-32.909, 19.0],
      [-38, 0.0],
      [-32.909, -19.0],
      [-19.0, -32.909],
      [-0.0, -38],
      [19.0, -32.909],
      [32.909, -19.0],
    ],
    { cx: 0, cy: 0, r: 38 },
  ],
];

const FACETED_VASE: DesignSample = {
  shape: {
    twist: 0,
    sections: FACETED_SECTIONS.map(([z, verts, circle]) => makeSection(z, verts, 0, circle)),
  },
  print: { topCurves: 'open', topAngle: 35, segLen: 1 }, // the default angle and path resolution
  textures: [
    {
      type: 'blobs',
      enabled: true,
      amplitude: 0.9,
      count: 28,
      wavelength: 3,
      seed: 1,
      from: 0,
      to: 100,
      solidFrom: 0,
      solid: 100,
      blend: 'add',
      angle: 0,
      zc: 60,
      width: 60,
      hgt: 60,
      rot: 0,
      invert: false,
      lift: 0,
    },
    {
      type: 'ledge',
      enabled: true,
      amplitude: 13.5,
      count: 21,
      wavelength: 12,
      seed: 1,
      from: 0,
      to: 100,
      solidFrom: 52,
      solid: 100,
      blend: 'add',
      angle: 0,
      zc: 60,
      width: 60,
      hgt: 60,
      rot: 0,
      invert: false,
      rotStep: 9,
      curveV: [
        [0, 0],
        [0.21052780289330925, 0.15860047785670217],
        [0.4183184052893309, 0.44681217861173744],
        [1, 1],
      ],
      curveA: [
        [0, 0],
        [0.1251271473779385, 0],
        [0.2178599683544304, 0.11430310768476541],
        [0.2877380481464738, 0.4601013896633185],
        [0.383268111437613, 0.8648492488706797],
        [0.5, 1],
        [0.6228561539330923, 0.8724076812636534],
        [0.6976400033905967, 0.5602506188702218],
        [0.7560748191681735, 0.1941313055400669],
        [0.8436263844936709, 0],
        [1, 0],
      ],
      maskPattern: {
        kind: 'simplex',
        scale: 63,
        detail: 3,
        stretch: 1,
        warp: 0,
        rotate: 0,
        coverage: 50,
        softness: 91,
        seed: 1,
        invert: false,
        curvature: 'either',
        tilesU: 1,
        tilesV: 1,
      },
    },
  ],
  masks: { 0: FACETED_MASK_B64 },
};

export interface Sample {
  name: string;
  slug: string;
  make: () => Float32Array;
  design?: DesignSample;
}

export const SAMPLES: Record<string, Sample> = {
  vase: {
    name: 'Vase',
    slug: 'vase',
    make: () => {
      const H = 180;
      return lathe((z) => {
        const t = z / H;
        return 30 + 24 * Math.sin(Math.PI * Math.min(1, 1.12 * t)) + 8 * smooth(0.88, 1, t);
      }, H);
    },
  },
  bowl: {
    name: 'Bowl (steep overhangs)',
    slug: 'bowl',
    make: () => lathe((z) => 40 + 30 * Math.pow(z / 60, 1.4), 60),
  },
  faceted: {
    name: 'Faceted vase',
    slug: 'faceted-vase',
    make: () => shapeMesh(FACETED_VASE.shape),
    design: FACETED_VASE,
  },
};
