/**
 * Plane slicing of a triangle soup (Float32Array, 9 floats per triangle).
 * Returns, per layer, directed closed loops (flat [x0,y0,x1,y1,...]).
 * Outer contours are counter-clockwise (positive area), holes clockwise.
 *
 * Layer j is cut at z = (j + 0.5) * h. A vertex exactly on the plane counts as
 * "below" (symbolic perturbation), so manifold meshes always give closed loops.
 */
const Q = 1000; // quantisation (micrometres) for matching segment end points
const OFF = 4194304;

function key(x: number, y: number): number {
  return (Math.round(x * Q) + OFF) * 8388608 + (Math.round(y * Q) + OFF);
}

export function sliceLayers(pos: Float32Array, h: number, nLayers: number): Float64Array[][] {
  const nt = pos.length / 9;
  const buckets: number[][] = Array.from({ length: nLayers }, () => []);
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const z0 = pos[o + 2];
    const z1 = pos[o + 5];
    const z2 = pos[o + 8];
    const zmin = Math.min(z0, z1, z2);
    const zmax = Math.max(z0, z1, z2);
    if (zmax === zmin) continue;
    const j0 = Math.max(0, Math.ceil(zmin / h - 0.5));
    const j1 = Math.min(nLayers - 1, Math.floor(zmax / h - 0.5));
    for (let j = j0; j <= j1; j++) buckets[j].push(t);
  }
  return buckets.map((tris, j) => sliceOne(pos, tris, (j + 0.5) * h));
}

function sliceOne(pos: Float32Array, tris: number[], z: number): Float64Array[] {
  const sx0: number[] = [];
  const sy0: number[] = [];
  const sx1: number[] = [];
  const sy1: number[] = [];
  const k0: number[] = [];
  const k1: number[] = [];
  const vx = [0, 0, 0];
  const vy = [0, 0, 0];
  const vz = [0, 0, 0];
  const up = [false, false, false];
  const pts = [0, 0, 0, 0];

  for (const t of tris) {
    const o = t * 9;
    for (let i = 0; i < 3; i++) {
      vx[i] = pos[o + i * 3];
      vy[i] = pos[o + i * 3 + 1];
      vz[i] = pos[o + i * 3 + 2];
      up[i] = vz[i] > z;
    }
    const nUp = (up[0] ? 1 : 0) + (up[1] ? 1 : 0) + (up[2] ? 1 : 0);
    if (nUp === 0 || nUp === 3) continue;

    let n = 0;
    for (let e = 0; e < 3; e++) {
      const a = e;
      const b = (e + 1) % 3;
      if (up[a] === up[b]) continue;
      // canonical endpoint order so neighbouring triangles compute identical points
      let p = a;
      let q = b;
      if (
        vx[p] > vx[q] ||
        (vx[p] === vx[q] && (vy[p] > vy[q] || (vy[p] === vy[q] && vz[p] > vz[q])))
      ) {
        p = b;
        q = a;
      }
      const tt = (z - vz[p]) / (vz[q] - vz[p]);
      pts[n * 2] = vx[p] + tt * (vx[q] - vx[p]);
      pts[n * 2 + 1] = vy[p] + tt * (vy[q] - vy[p]);
      n++;
    }
    if (n !== 2) continue;

    // triangle normal (xy part). Direction with interior on the left is (-ny, nx).
    const e1x = vx[1] - vx[0];
    const e1y = vy[1] - vy[0];
    const e1z = vz[1] - vz[0];
    const e2x = vx[2] - vx[0];
    const e2y = vy[2] - vy[0];
    const e2z = vz[2] - vz[0];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    let [px, py, qx, qy] = pts;
    if ((qx - px) * -ny + (qy - py) * nx < 0) [px, py, qx, qy] = [qx, qy, px, py];
    const ka = key(px, py);
    const kb = key(qx, qy);
    if (ka === kb) continue;
    sx0.push(px);
    sy0.push(py);
    sx1.push(qx);
    sy1.push(qy);
    k0.push(ka);
    k1.push(kb);
  }

  const n = k0.length;
  const startMap = new Map<number, number>();
  for (let i = 0; i < n; i++) startMap.set(k0[i], i);
  const used = new Uint8Array(n);
  const loops: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const loop: number[] = [];
    const startKey = k0[i];
    let cur = i;
    let closed = false;
    for (;;) {
      used[cur] = 1;
      loop.push(sx0[cur], sy0[cur]);
      const nk = k1[cur];
      if (nk === startKey) {
        closed = true;
        break;
      }
      const nxt = startMap.get(nk);
      if (nxt === undefined || used[nxt]) break;
      cur = nxt;
    }
    if (closed && loop.length >= 6) loops.push(Float64Array.from(loop));
  }
  return loops;
}
