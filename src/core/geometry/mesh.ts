import type { MeshTransform } from '../types';

/**
 * Raw STL triangle soup -> print-size triangle soup:
 * rotate (XYZ degrees), scale (user scale + shrinkage compensation),
 * drop to z=0 and centre the bounding box on the bed centre.
 */
/** Uniform factor from drawn/STL size to print size (user scale and shrinkage compensation). */
export const meshScale = (t: Pick<MeshTransform, 'scalePct' | 'shrinkagePct'>): number =>
  t.scalePct / 100 / Math.max(0.5, 1 - t.shrinkagePct / 100);

/**
 * With `keepPosition` (drawn shapes) the rotation is skipped and the model is only scaled, so
 * the shape tool's handles stay exactly on the surface while you drag them.
 */
export function buildMesh(raw: Float32Array, t: MeshTransform, keepPosition = false): Float32Array {
  if (keepPosition) {
    const k = meshScale(t);
    return raw.map((v) => v * k);
  }
  const d = Math.PI / 180;
  const [cx, sx] = [Math.cos(t.rotX * d), Math.sin(t.rotX * d)];
  const [cy, sy] = [Math.cos(t.rotY * d), Math.sin(t.rotY * d)];
  const [cz, sz] = [Math.cos(t.rotZ * d), Math.sin(t.rotZ * d)];
  // R = Rz * Ry * Rx
  const m00 = cz * cy,
    m01 = cz * sy * sx - sz * cx,
    m02 = cz * sy * cx + sz * sx;
  const m10 = sz * cy,
    m11 = sz * sy * sx + cz * cx,
    m12 = sz * sy * cx - cz * sx;
  const m20 = -sy,
    m21 = cy * sx,
    m22 = cy * cx;
  const k = meshScale(t);

  const out = new Float32Array(raw.length);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity;
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i],
      y = raw[i + 1],
      z = raw[i + 2];
    const X = (m00 * x + m01 * y + m02 * z) * k;
    const Y = (m10 * x + m11 * y + m12 * z) * k;
    const Z = (m20 * x + m21 * y + m22 * z) * k;
    out[i] = X;
    out[i + 1] = Y;
    out[i + 2] = Z;
    if (X < minX) minX = X;
    if (X > maxX) maxX = X;
    if (Y < minY) minY = Y;
    if (Y > maxY) maxY = Y;
    if (Z < minZ) minZ = Z;
  }
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= ox;
    out[i + 1] -= oy;
    out[i + 2] -= minZ;
  }
  return out;
}

export function meshHeight(pos: Float32Array): number {
  let z = 0;
  for (let i = 2; i < pos.length; i += 3) z = Math.max(z, pos[i]);
  return z;
}
