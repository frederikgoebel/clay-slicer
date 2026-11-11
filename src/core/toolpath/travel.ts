import { FEATURE_TRAVEL, type SliceSettings } from '../types';
import type { PathBuilder } from './PathBuilder';
import type { Ring } from './rings';

export type Pt2 = [number, number];

/** How far outside the wall the nozzle travels between open lines, mm. */
export const TRAVEL_CLEAR = 4;

/**
 * A travel move to (x, y, z): rise by the Z hop, follow `route` (points, already outside the
 * wall), come down on the target. The target itself is the last point and is a travel point.
 */
export function pushTravel(
  path: PathBuilder,
  s: Pick<SliceSettings, 'zHop' | 'travelSpeed' | 'buildHeight'>,
  x: number,
  y: number,
  z: number,
  route: Pt2[] = [],
): void {
  const v = s.travelSpeed;
  if (path.count > 0) {
    const n = path.count - 1;
    const lx = path.xyz[3 * n];
    const ly = path.xyz[3 * n + 1];
    const lz = path.xyz[3 * n + 2];
    const zUp = s.zHop > 0 ? Math.min(s.buildHeight, Math.max(lz, z) + s.zHop) : Math.max(lz, z);
    if (s.zHop > 0) path.push(lx, ly, zUp, FEATURE_TRAVEL, v);
    for (const [rx, ry] of route) path.push(rx, ry, zUp, FEATURE_TRAVEL, v);
    if (s.zHop > 0 || route.length) path.push(x, y, zUp, FEATURE_TRAVEL, v);
  }
  path.push(x, y, z, FEATURE_TRAVEL, v);
}

/**
 * Runs of points that are not on a top surface, as index lists around the ring (a ring without
 * any top points is one closed run 0..N). Rings that are all top give no runs.
 */
export function arcRuns(cap: Uint8Array, N: number): number[][] {
  let first = -1;
  let any = 0;
  for (let k = 0; k < N; k++)
    if (cap[k]) {
      any++;
      if (first < 0) first = k;
    }
  if (any < 2) return [Array.from({ length: N + 1 }, (_, k) => k)];
  if (any === N) return [];
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let m = 1; m <= N; m++) {
    const k = (first + m) % N;
    if (cap[k]) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push(k);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** True when the ring has a stretch of top surface worth leaving open. */
export const hasTop = (r: Ring): boolean => {
  let n = 0;
  for (let k = 0; k < r.cap.length; k++) if (r.cap[k] && ++n >= 2) return true;
  return false;
};

/**
 * Points along the ring pushed `clear` mm outward, from index a to index b, taking the direction
 * that does not cross the top surface (or else the shorter one).
 */
export function outsideRoute(
  r: Pick<Ring, 'xy' | 'nxy' | 'cap'>,
  N: number,
  a: number,
  b: number,
  clear: number,
): Pt2[] {
  const walk = (dir: 1 | -1) => {
    const idx: number[] = [];
    let crosses = false;
    for (let k = (a + dir + N) % N; ; k = (k + dir + N) % N) {
      if (r.cap[k]) crosses = true;
      idx.push(k);
      if (k === b % N || idx.length > N) break;
    }
    return { idx, crosses };
  };
  const f = walk(1);
  const g = walk(-1);
  let pick = f;
  if (f.crosses !== g.crosses) pick = f.crosses ? g : f;
  else if (g.idx.length < f.idx.length) pick = g;
  const step = Math.max(1, Math.ceil(pick.idx.length / 60));
  const out: Pt2[] = [];
  pick.idx.forEach((k, i) => {
    if (i % step === 0 || i === pick.idx.length - 1)
      out.push([r.xy[2 * k] + r.nxy[2 * k] * clear, r.xy[2 * k + 1] + r.nxy[2 * k + 1] * clear]);
  });
  return out;
}
