import {
  centroid,
  curvatureAt,
  findSeam,
  normals,
  resample,
  signedArea,
} from '../geometry/contour';
import { angleU } from '../textures/mask';
import {
  blobLift,
  dwellSeconds,
  needsCurvature,
  radialOffset,
  twistAngle,
  type TexCtx,
} from '../textures/textures';
import { FEATURE_INFILL, FEATURE_WALL, type SliceSettings } from '../types';
import { infillSegments, linkInside, type Pt } from './infill';
import { nominalWidth } from './bead';
import type { PathBuilder } from './PathBuilder';
import { floorBelowLayers, floorInsideLayers, type RingSet } from './rings';
import { arcRuns, outsideRoute, pushTravel, TRAVEL_CLEAR } from './travel';

const MIN_SPEED = 5;

interface Curve {
  xy: Float64Array;
  nxy: Float64Array;
  cap: Uint8Array;
  perimeter: number;
  cx: number;
  cy: number;
  n: number;
  /** signed area of the original loop: > 0 outer wall, < 0 hole */
  area: number;
  /** an extra wall loop inside the first one: no textures, no top handling */
  inner?: boolean;
}

/**
 * "Standard layers": every closed curve of every layer (outer walls, inner walls of holes and
 * separate parts), printed one after the other. Between curves the nozzle travels (rising by the
 * Z hop, with retraction written to the G-code). With open top curves the stretches on a top
 * surface are left out and each remaining line is its own extrusion.
 */
export function addNormalWall(path: PathBuilder, set: RingSet, s: SliceSettings): void {
  const { loops, layers: L, zmax } = set;
  const h = s.layerHeight;
  const F = floorInsideLayers(s);
  const zOff = floorBelowLayers(s) * h;
  const H = L * h;
  const zStart = F * h;
  const textures = s.textures;
  const liftMm = blobLift(textures);
  const curved = needsCurvature(textures);
  const joinDist = 2.5 * nominalWidth(s);
  const seamRad = (s.seamAngle * Math.PI) / 180;
  const open = s.topCurves === 'open';
  let idx = 0;

  const curvesOf = (j: number): Curve[] => {
    const out: Curve[] = [];
    for (const loop of loops[j]) {
      if (Math.abs(signedArea(loop.xy)) <= 1) continue;
      const [cx, cy] = centroid(loop.xy);
      let per = 0;
      const m = loop.xy.length / 2;
      for (let i = 0; i < m; i++) {
        const q = (i + 1) % m;
        per += Math.hypot(loop.xy[2 * q] - loop.xy[2 * i], loop.xy[2 * q + 1] - loop.xy[2 * i + 1]);
      }
      const n = Math.min(4000, Math.max(8, Math.ceil(per / s.segLen)));
      const r = resample(loop.xy, findSeam(loop.xy, cx, cy, seamRad), n, loop.cap);
      out.push({
        xy: r.xy,
        nxy: normals(r.xy),
        cap: r.flag,
        perimeter: r.perimeter,
        cx,
        cy,
        n,
        area: signedArea(loop.xy),
      });
    }
    return out;
  };

  const speedOf = (len: number) =>
    s.minLayerTime > 0
      ? Math.min(s.printSpeed, Math.max(MIN_SPEED, len / s.minLayerTime))
      : s.printSpeed;

  const emit = (
    c: Curve,
    k: number,
    z: number,
    speed: number,
    travel: boolean,
    route?: [number, number][],
  ) => {
    const kk = k % c.n;
    const bx = c.xy[2 * kk];
    const by = c.xy[2 * kk + 1];
    const nx = c.nxy[2 * kk];
    const ny = c.nxy[2 * kk + 1];
    const zr = z - zOff;
    const ctx: TexCtx = {
      z: zr,
      H,
      t: k / c.n,
      idx,
      spacing: c.perimeter / c.n,
      zStart,
      fadeIn: s.textureFadeIn,
      lh: h,
      u: angleU(bx, by),
      v: zr / zmax,
      ang: Math.atan2(by - c.cy, bx - c.cx),
      rad: Math.hypot(bx - c.cx, by - c.cy),
      curv: curved ? curvatureAt(c.nxy, kk, c.n, c.perimeter) : 0,
    };
    const off = textures.length && !c.inner ? radialOffset(textures, ctx) : 0;
    let x = bx + nx * off;
    let y = by + ny * off;
    const tw = textures.length ? twistAngle(textures, zr, H) : 0;
    if (tw !== 0) {
      const dx = x - c.cx;
      const dy = y - c.cy;
      x = c.cx + dx * Math.cos(tw) - dy * Math.sin(tw);
      y = c.cy + dx * Math.sin(tw) + dy * Math.cos(tw);
    }
    idx++;
    if (travel) {
      pushTravel(path, s, x, y, z, route);
      return;
    }
    const dwell = textures.length && !c.inner ? dwellSeconds(textures, ctx, h, 1 / c.n) : 0;
    path.push(x, y, z, FEATURE_WALL, speed, 0, dwell, dwell > 0 ? liftMm : 0);
  };

  const w = nominalWidth(s);
  // without walls the infill is all there is, so it needs to be switched on
  const walls = Math.max(s.infillDensity > 0 && !open ? 0 : 1, Math.round(s.wallCount));
  const solidFrom = L - Math.max(0, Math.round(s.solidTop));
  // infill needs closed regions, so it is not combined with open top curves
  const infillOn = s.infillDensity > 0 && !open;

  /** the loop moved `d` into the material along its normals; null once it has collapsed */
  const insetCurve = (c: Curve, d: number): Curve | null => {
    const xy = new Float64Array(c.xy.length);
    for (let k = 0; k < c.n; k++) {
      xy[2 * k] = c.xy[2 * k] - c.nxy[2 * k] * d;
      xy[2 * k + 1] = c.xy[2 * k + 1] - c.nxy[2 * k + 1] * d;
    }
    const area = signedArea(xy);
    if (c.area > 0 && !(area > 2 * w * w && area < c.area)) return null;
    let per = 0;
    for (let k = 0; k < c.n; k++) {
      const q = (k + 1) % c.n;
      per += Math.hypot(xy[2 * q] - xy[2 * k], xy[2 * q + 1] - xy[2 * k + 1]);
    }
    return {
      xy,
      nxy: normals(xy),
      cap: new Uint8Array(c.n),
      perimeter: per,
      cx: c.cx,
      cy: c.cy,
      n: c.n,
      area,
      inner: true,
    };
  };

  /** the lines of a curve: its whole closed loop, or (open top) the stretches that are not top */
  const linesOf = (c: Curve): number[][] =>
    open && !c.inner ? arcRuns(c.cap, c.n) : [Array.from({ length: c.n + 1 }, (_, k) => k)];

  /** print a set of curves of one layer, always going to the nearest start next */
  const printCurves = (curves: Curve[], z: number) => {
    const todo: { c: Curve; runs: number[][] }[] = curves.map((c) => ({ c, runs: linesOf(c) }));
    let lastC: Curve | null = null;
    let lastK = 0;
    for (;;) {
      // nearest start of any remaining line (either end for open lines)
      const n = path.count - 1;
      const lx = n >= 0 ? path.xyz[3 * n] : 0;
      const ly = n >= 0 ? path.xyz[3 * n + 1] : 0;
      let best: { t: number; r: number; rev: boolean } | null = null;
      let bd = Infinity;
      todo.forEach((item, t) =>
        item.runs.forEach((run, r) => {
          const ends: [boolean, number][] = [[false, run[0]]];
          if (open) ends.push([true, run[run.length - 1]]);
          for (const [rev, k] of ends) {
            const d = Math.hypot(
              item.c.xy[2 * (k % item.c.n)] - lx,
              item.c.xy[2 * (k % item.c.n) + 1] - ly,
            );
            if (d < bd) {
              bd = d;
              best = { t, r, rev };
            }
          }
        }),
      );
      if (!best) break;
      const { t, r, rev } = best as { t: number; r: number; rev: boolean };
      const { c } = todo[t];
      const run = todo[t].runs.splice(r, 1)[0];
      if (rev) run.reverse();
      if (todo[t].runs.length === 0) todo.splice(t, 1);
      const speed = speedOf(c.perimeter);
      const needTravel = n < 0 || bd > joinDist;
      const route =
        needTravel && n >= 0 && lastC === c
          ? outsideRoute(c, c.n, lastK, run[0], TRAVEL_CLEAR)
          : undefined;
      run.forEach((k, m) => emit(c, k, z, speed, m === 0 && needTravel, route));
      lastC = c;
      lastK = run[run.length - 1] % c.n;
    }
  };

  /** infill lines inside the innermost wall loops; gaps larger than one line spacing are travels */
  const printInfill = (base: Curve[], j: number, z: number) => {
    const d = walls === 0 ? 0.5 * w : (walls - 0.1) * w;
    const polys: Pt[][] = [];
    for (const c of base) {
      const inset = d === 0 ? c : insetCurve(c, d);
      if (!inset) continue;
      const pts: Pt[] = [];
      for (let k = 0; k < c.n; k++) pts.push([inset.xy[2 * k], inset.xy[2 * k + 1]]);
      polys.push(pts);
    }
    if (!polys.length) return;
    const density = j >= solidFrom ? 100 : s.infillDensity;
    const { segs, spacing } = infillSegments(
      polys,
      s.infillPattern,
      density,
      w,
      s.infillAngle,
      j,
      z,
    );
    for (const [p, q] of segs) {
      const n = path.count - 1;
      const gap =
        n >= 0 ? Math.hypot(p[0] - path.xyz[3 * n], p[1] - path.xyz[3 * n + 1]) : Infinity;
      const last: Pt = [path.xyz[3 * n], path.xyz[3 * n + 1]];
      if (n >= 0 && gap < 1e-6 && path.feature[n] === FEATURE_INFILL) {
        // continues the previous line
      } else if (n < 0 || gap > 1.5 * spacing || !linkInside(last, p, polys))
        pushTravel(path, s, p[0], p[1], z);
      else path.push(p[0], p[1], z, FEATURE_INFILL, s.printSpeed);
      path.push(q[0], q[1], z, FEATURE_INFILL, s.printSpeed);
    }
  };

  for (let j = F; j < L; j++) {
    const z = (j + 1) * h + zOff;
    const base = curvesOf(j);
    if (walls > 0) printCurves(base, z);
    if (!open)
      for (let i = 1; i < walls; i++) {
        const wave = base.map((c) => insetCurve(c, i * w)).filter((c): c is Curve => c !== null);
        if (!wave.length) break;
        printCurves(wave, z);
      }
    if (infillOn) printInfill(base, j, z);
  }
}
