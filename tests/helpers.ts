import { beadArea } from '../src/core/toolpath/bead';
import type { SliceSettings } from '../src/core/types';
import { lathe } from '../src/core/samples';
import { DEFAULT_PRINT } from '../src/domain/print';
import { BUILTIN_PROFILES, resolveSliceSettings } from '../src/domain/profiles';

export const TEST_WIDTH = 4;

/** Settings from the built-in profiles, with small overrides for fast tests. */
export function testSettings(o: Partial<SliceSettings> = {}): SliceSettings {
  const s = resolveSliceSettings(
    BUILTIN_PROFILES.printer.find((p) => p.id === 'printer-wasp-2040') ??
      BUILTIN_PROFILES.printer[0],
    BUILTIN_PROFILES.nozzle[1],
    BUILTIN_PROFILES.clay[0],
    DEFAULT_PRINT,
    [],
  );
  return {
    ...s,
    layerHeight: 2,
    extrusionRate: beadArea(TEST_WIDTH, 2) * s.printSpeed,
    nozzle: 3,
    overhangMax: 25,
    floorSpacingPct: 90,
    segLen: 2,
    ...o,
  };
}

export const cylinder = (r = 20, h = 60) => lathe(() => r, h, 10, 128);

/** Closed mesh: cylinder with a slanted cut top (tilt degrees from horizontal), bottom at z=0. */
export function slantedCylinder(r = 20, h = 40, tiltDeg = 20, n = 96): Float32Array {
  const t = Math.tan((tiltDeg * Math.PI) / 180);
  const out: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c);
  const B = (i: number) => [
    r * Math.cos((2 * Math.PI * i) / n),
    r * Math.sin((2 * Math.PI * i) / n),
    0,
  ];
  const T = (i: number) => {
    const b = B(i);
    return [b[0], b[1], h + t * b[0]];
  };
  for (let i = 0; i < n; i++) {
    tri(B(i), B(i + 1), T(i + 1));
    tri(B(i), T(i + 1), T(i));
    tri([0, 0, h], T(i), T(i + 1));
    tri([0, 0, 0], B(i + 1), B(i));
  }
  return Float32Array.from(out);
}

/** Closed mesh: a tube (outer radius R, hole radius r), so every layer has two curves. */
export function tube(R = 24, r = 12, h = 40, n = 96): Float32Array {
  const out: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c);
  const P = (rad: number, i: number, z: number) => [
    rad * Math.cos((2 * Math.PI * i) / n),
    rad * Math.sin((2 * Math.PI * i) / n),
    z,
  ];
  for (let i = 0; i < n; i++) {
    tri(P(R, i, 0), P(R, i + 1, 0), P(R, i + 1, h));
    tri(P(R, i, 0), P(R, i + 1, h), P(R, i, h));
    tri(P(r, i, 0), P(r, i + 1, h), P(r, i + 1, 0));
    tri(P(r, i, 0), P(r, i, h), P(r, i + 1, h));
    tri(P(r, i, h), P(R, i, h), P(R, i + 1, h));
    tri(P(r, i, h), P(R, i + 1, h), P(r, i + 1, h));
    tri(P(r, i, 0), P(R, i, 0), P(R, i + 1, 0));
    tri(P(r, i, 0), P(R, i + 1, 0), P(r, i + 1, 0));
  }
  return Float32Array.from(out);
}
