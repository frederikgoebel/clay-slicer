import { BufferAttribute, BufferGeometry } from 'three';
import { FEATURE_TRAVEL, type ToolpathResult } from '../../core/types';

/** Vertices per cross-section ring: two half-circles joined by flat top and bottom. */
const ARC_STEPS = 5;
export const RING = 2 * (ARC_STEPS + 1);

export interface BeadMesh {
  geometry: BufferGeometry;
  /** index count to draw for the first `points` path points (for layer clipping) */
  indexCountForPoints: (points: number) => number;
}

/**
 * Sweep the real bead cross-section (a stadium: width x layer height) along the toolpath.
 * Each path point gets one ring; consecutive points of an extruding move are joined with
 * quads, so travel moves leave gaps. The path z is the top of the layer, so the bead sits
 * between z - layerHeight and z. Width comes from the per-point estimate (speed-dependent).
 */
export function buildBeadMesh(res: ToolpathResult, layerHeight: number, uvPerMm = 0.2): BeadMesh {
  const n = res.count;
  const pos = new Float32Array(n * RING * 3);
  const nor = new Float32Array(n * RING * 3);
  const uv = new Float32Array(n * RING * 2);
  const { xyz } = res;
  const r = layerHeight / 2;

  // section outline in (side, up) with outward normals
  const sx: number[] = [];
  const sy: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  for (let k = 0; k <= ARC_STEPS; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / ARC_STEPS;
    sx.push(1);
    sy.push(0);
    nx.push(Math.cos(a));
    ny.push(Math.sin(a));
  }
  for (let k = 0; k <= ARC_STEPS; k++) {
    const a = Math.PI / 2 + (Math.PI * k) / ARC_STEPS;
    sx.push(-1);
    sy.push(0);
    nx.push(Math.cos(a));
    ny.push(Math.sin(a));
  }

  let arc = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = xyz[3 * b] - xyz[3 * a];
    let ty = xyz[3 * b + 1] - xyz[3 * a + 1];
    const tz = xyz[3 * b + 2] - xyz[3 * a + 2];
    // horizontal frame: side = t x Z flattened; the path is nearly horizontal everywhere
    const th = Math.hypot(tx, ty) || 1;
    tx /= th;
    ty /= th;
    const sideX = ty;
    const sideY = -tx;
    // tilt the "up" axis with the slope so steep climbs keep a round section
    const slope = tz / th;
    const upL = Math.hypot(1, slope);
    const upX = (-tx * slope) / upL;
    const upY = (-ty * slope) / upL;
    const upZ = 1 / upL;

    const half = Math.max(0, (res.width[i] - layerHeight) / 2);
    const cx = xyz[3 * i];
    const cy = xyz[3 * i + 1];
    const cz = xyz[3 * i + 2] - r;
    if (i > 0)
      arc += Math.hypot(cx - xyz[3 * i - 3], cy - xyz[3 * i - 2], xyz[3 * i + 2] - xyz[3 * i - 1]);

    for (let k = 0; k < RING; k++) {
      const side = sx[k] * half + nx[k] * r;
      const up = ny[k] * r;
      const o = (i * RING + k) * 3;
      pos[o] = cx + sideX * side + upX * up;
      pos[o + 1] = cy + sideY * side + upY * up;
      pos[o + 2] = cz + upZ * up;
      nor[o] = sideX * nx[k] + upX * ny[k];
      nor[o + 1] = sideY * nx[k] + upY * ny[k];
      nor[o + 2] = upZ * ny[k];
      const u = (i * RING + k) * 2;
      uv[u] = arc * uvPerMm;
      uv[u + 1] = k / RING;
    }
  }

  // quads between ring i-1 and ring i for every extruding move
  const cum = new Uint32Array(n + 1);
  let quads = 0;
  for (let i = 1; i < n; i++) {
    cum[i] = quads * 6;
    if (res.feature[i] !== FEATURE_TRAVEL) quads += RING;
  }
  cum[n] = quads * 6;
  const idx = new Uint32Array(quads * 6);
  let w = 0;
  for (let i = 1; i < n; i++) {
    if (res.feature[i] === FEATURE_TRAVEL) continue;
    const p = (i - 1) * RING;
    const q = i * RING;
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      idx[w++] = p + k;
      idx[w++] = q + k;
      idx[w++] = q + k2;
      idx[w++] = p + k;
      idx[w++] = q + k2;
      idx[w++] = p + k2;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();

  return {
    geometry,
    indexCountForPoints: (points) => cum[Math.min(n, Math.max(1, points))],
  };
}
