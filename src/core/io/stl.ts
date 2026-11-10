import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

/** Parse a binary or ASCII STL into a triangle soup (9 floats per triangle). */
export function parseStl(buffer: ArrayBuffer): Float32Array {
  const geometry = new STLLoader().parse(buffer);
  const pos = geometry.getAttribute('position').array as Float32Array;
  geometry.dispose();
  if (pos.length < 9) throw new Error('The file contains no triangles.');
  return Float32Array.from(pos);
}

/** Write a triangle soup as binary STL (normals are computed from the winding). */
export function writeStl(tris: Float32Array): ArrayBuffer {
  const n = Math.floor(tris.length / 9);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const b = t * 9;
    const ux = tris[b + 3] - tris[b];
    const uy = tris[b + 4] - tris[b + 1];
    const uz = tris[b + 5] - tris[b + 2];
    const vx = tris[b + 6] - tris[b];
    const vy = tris[b + 7] - tris[b + 1];
    const vz = tris[b + 8] - tris[b + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / len, true);
    dv.setFloat32(o + 4, ny / len, true);
    dv.setFloat32(o + 8, nz / len, true);
    for (let i = 0; i < 9; i++) dv.setFloat32(o + 12 + i * 4, tris[b + i], true);
  }
  return buf;
}
