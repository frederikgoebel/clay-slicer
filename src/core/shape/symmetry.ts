import type { Vec } from './shape';

export interface Symmetry {
  /** mirror left <-> right (x becomes -x) */
  x: boolean;
  /** mirror top <-> bottom (y becomes -y) */
  y: boolean;
}

/**
 * Move vertex `i` of an outline to `to` and keep it symmetric: the vertices that were mirror
 * images of it (nearest vertex to the mirrored start position, within `tol`) follow. A vertex
 * that sits on a mirror axis stays on it.
 */
export function dragSymmetric(
  verts: readonly Vec[],
  i: number,
  to: Vec,
  sym: Symmetry,
  tol: number,
): Vec[] {
  const out = verts.map((v): Vec => [v[0], v[1]]);
  const start = verts[i];
  const ops: Vec[] = [];
  if (sym.x) ops.push([-1, 1]);
  if (sym.y) ops.push([1, -1]);
  if (sym.x && sym.y) ops.push([-1, -1]);
  let p: Vec = [to[0], to[1]];
  const used = new Set<number>([i]);
  const partners: [number, Vec][] = [];
  for (const [sx, sy] of ops) {
    const mx = sx * start[0];
    const my = sy * start[1];
    if (Math.hypot(mx - start[0], my - start[1]) < tol) {
      // lies on this mirror's axis: stay on it
      p = [sx < 0 ? 0 : p[0], sy < 0 ? 0 : p[1]];
      continue;
    }
    let best = -1;
    let bd = tol;
    verts.forEach((v, j) => {
      const d = Math.hypot(v[0] - mx, v[1] - my);
      if (!used.has(j) && d < bd) {
        bd = d;
        best = j;
      }
    });
    if (best >= 0) {
      used.add(best);
      partners.push([best, [sx, sy]]);
    }
  }
  out[i] = p;
  for (const [j, [sx, sy]] of partners) out[j] = [sx * p[0], sy * p[1]];
  return out;
}
