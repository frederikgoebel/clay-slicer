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

export const SAMPLES: Record<string, { name: string; slug: string; make: () => Float32Array }> = {
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
  jar: {
    name: 'Oval jar',
    slug: 'oval-jar',
    make: () => {
      const H = 120;
      return lathe((z) => 45 + 8 * Math.sin((Math.PI * z) / H), H, 100, 120, 1.35, 1);
    },
  },
};
