import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import styles from './viewport.module.css';

const SIZE = 56;

/** Face: outward normal n, text-up u and text-right r (world, Z up, front = -Y); r x u = n. */
const FACES = [
  { name: 'Top', n: [0, 0, 1], u: [0, 1, 0], r: [1, 0, 0] },
  { name: 'Bottom', n: [0, 0, -1], u: [0, 1, 0], r: [-1, 0, 0] },
  { name: 'Front', n: [0, -1, 0], u: [0, 0, 1], r: [1, 0, 0] },
  { name: 'Back', n: [0, 1, 0], u: [0, 0, 1], r: [-1, 0, 0] },
  { name: 'Right', n: [1, 0, 0], u: [0, 0, 1], r: [0, 1, 0] },
  { name: 'Left', n: [-1, 0, 0], u: [0, 0, 1], r: [0, -1, 0] },
] as const;

/** CSS matrix3d (column-major) with the given 3 columns and translation. */
const m3 = (a: readonly number[], b: readonly number[], c: readonly number[], t = [0, 0, 0]) =>
  `matrix3d(${a[0]},${a[1]},${a[2]},0,${b[0]},${b[1]},${b[2]},0,${c[0]},${c[1]},${c[2]},0,${t[0]},${t[1]},${t[2]},1)`;

const faceTransform = (f: (typeof FACES)[number]) =>
  m3(
    f.r,
    f.u.map((v) => -v),
    f.n,
    f.n.map((v) => (v * SIZE) / 2),
  );

let cube: HTMLElement | null = null;
let align: ((dir: Vector3) => void) | null = null;
let turn: ((dx: number, dy: number) => void) | null = null;

interface Controls {
  target: Vector3;
  update: () => void;
}

/** Lives inside the Canvas: keeps the CSS cube turned like the camera, and turns the camera on click. */
export function ViewCubeBridge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as Controls | null;
  const invalidate = useThree((s) => s.invalidate);

  const spin = () => {
    if (!cube) return;
    const e = camera.matrixWorldInverse.elements; // column-major; rows of the rotation = camera axes
    // CSS has y pointing down: flip the second row
    rot = [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
    drawHot();
    cube.style.transform = m3([e[0], -e[1], e[2]], [e[4], -e[5], e[6]], [e[8], -e[9], e[10]]);
  };
  useFrame(spin);
  useEffect(() => {
    camera.updateMatrixWorld();
    spin();
  });

  useEffect(() => {
    if (!controls) return;
    let raf = 0;
    align = (dir) => {
      cancelAnimationFrame(raf);
      const to = dir.clone().normalize();
      // looking straight along Z has no defined "up": lean a hair towards the front so the
      // front edge ends up at the bottom of the screen
      if (Math.abs(to.z) > 0.999) to.set(0, -0.0005, Math.sign(to.z)).normalize();
      const from = camera.position.clone().sub(controls.target);
      const dist = from.length();
      from.normalize();
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 280);
        const e = k * k * (3 - 2 * k);
        const v = from.clone().lerp(to, e).normalize();
        camera.position.copy(controls.target).addScaledVector(v, dist);
        camera.up.set(0, 0, 1);
        camera.lookAt(controls.target);
        controls.update();
        invalidate();
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    turn = (dx, dy) => {
      cancelAnimationFrame(raf);
      const v = camera.position.clone().sub(controls.target);
      const r = v.length();
      let azimuth = Math.atan2(v.y, v.x) - dx * 0.012;
      let polar = Math.acos(Math.min(1, Math.max(-1, v.z / r))) - dy * 0.012;
      polar = Math.min(Math.PI - 0.01, Math.max(0.01, polar));
      azimuth = ((azimuth + Math.PI) % (2 * Math.PI)) - Math.PI;
      camera.position.set(
        controls.target.x + r * Math.sin(polar) * Math.cos(azimuth),
        controls.target.y + r * Math.sin(polar) * Math.sin(azimuth),
        controls.target.z + r * Math.cos(polar),
      );
      camera.up.set(0, 0, 1);
      camera.lookAt(controls.target);
      controls.update();
      invalidate();
    };
    return () => {
      cancelAnimationFrame(raf);
      align = null;
      turn = null;
    };
  }, [camera, controls, invalidate]);

  return null;
}

/** Share of a face's width that counts as its edge (and, in a corner, both edges). */
const BAND = 0.24;

type Face = (typeof FACES)[number];

/** Direction of what is under the pointer on a face: the face, an edge or a corner. */
function zoneAt(f: Face, lx: number, ly: number) {
  const sx = lx < BAND ? -1 : lx > 1 - BAND ? 1 : 0; // along text-right
  const sy = ly < BAND ? 1 : ly > 1 - BAND ? -1 : 0; // along text-up (y is down)
  const dir = new Vector3(...f.n);
  dir.addScaledVector(new Vector3(...f.r), sx);
  dir.addScaledVector(new Vector3(...f.u), sy);
  return { dir, sx, sy };
}

const PERSPECTIVE = 260;

let hotPath: SVGPathElement | null = null;
let hotFace: SVGPathElement | null = null;
let hotDot: SVGCircleElement | null = null;
let hotDir: number[] | null = null;
/** columns of the camera rotation as set by the bridge (row-major 3x3 of matrixWorldInverse) */
let rot: number[] | null = null;

/** Cube point (world axes, +-SIZE/2) -> screen offset from the cube centre, like the CSS 3D transform. */
function project(w: readonly number[]): [number, number] {
  if (!rot) return [0, 0];
  const sx = rot[0] * w[0] + rot[1] * w[1] + rot[2] * w[2];
  const sy = -(rot[3] * w[0] + rot[4] * w[1] + rot[5] * w[2]); // CSS y points down
  const sz = rot[6] * w[0] + rot[7] * w[1] + rot[8] * w[2];
  const k = PERSPECTIVE / (PERSPECTIVE - sz);
  return [sx * k, sy * k];
}

/**
 * Draw the hovered face outline, edge or corner as a 2D line on top of the cube, from the
 * projected vertices themselves, so it sits exactly on the cube's edges.
 */
function drawHot(): void {
  if (!hotPath || !hotFace || !hotDot) return;
  const dir = hotDir;
  hotPath.setAttribute('d', '');
  hotFace.setAttribute('d', '');
  hotDot.setAttribute('r', '0');
  if (!dir || !rot) return;
  const h = SIZE / 2;
  const pt = (w: number[]) => project(w.map((v) => v * h));
  const seg = (a: number[], b: number[], from = 0, to = 1) => {
    const lerp = (t: number) => a.map((v, i) => v + (b[i] - v) * t);
    const [x1, y1] = pt(lerp(from));
    const [x2, y2] = pt(lerp(to));
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const nz = dir.filter((v) => v !== 0).length;
  if (nz === 1) {
    // face: tinted
    const k = dir.findIndex((v) => v !== 0);
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    const at = (a: number, b: number) => {
      const w = [0, 0, 0];
      w[k] = dir[k];
      w[i] = a;
      w[j] = b;
      return w;
    };
    const c = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
    hotFace.setAttribute(
      'd',
      c.map((q, n) => `${n ? 'L' : 'M'}${pt(q)[0].toFixed(2)} ${pt(q)[1].toFixed(2)}`).join('') +
        'Z',
    );
    return;
  } else if (nz === 2) {
    // edge: the line between its two end vertices
    const k = dir.findIndex((v) => v === 0);
    const a = [...dir];
    const b = [...dir];
    a[k] = -1;
    b[k] = 1;
    hotPath.setAttribute('d', seg(a, b));
    return;
  } else {
    // corner: a dot on the vertex
    const [x, y] = pt(dir);
    hotDot.setAttribute('cx', x.toFixed(2));
    hotDot.setAttribute('cy', y.toFixed(2));
    hotDot.setAttribute('r', '5');
    return;
  }
}

function setHot(dir: number[] | null): void {
  if (dir === hotDir || (dir && hotDir && dir.every((v, i) => v === hotDir?.[i]))) return;
  hotDir = dir;
  drawHot();
}

/** The small cube in the corner: drag to turn the view, click a face, edge or corner to look from there. */
export function ViewCube() {
  const down = (e: React.PointerEvent<HTMLButtonElement>, f: Face) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let last = start;
    let dragged = false;
    const dir = zoneAt(f, e.nativeEvent.offsetX / SIZE, e.nativeEvent.offsetY / SIZE).dir;
    const move = (m: PointerEvent) => {
      if (!dragged && Math.hypot(m.clientX - start.x, m.clientY - start.y) < 4) return;
      dragged = true;
      setHot(null);
      turn?.(m.clientX - last.x, m.clientY - last.y);
      last = { x: m.clientX, y: m.clientY };
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragged) align?.(dir);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
  };

  const over = (e: React.PointerEvent<HTMLButtonElement>, f: Face) => {
    if (e.buttons) return;
    const { dir } = zoneAt(f, e.nativeEvent.offsetX / SIZE, e.nativeEvent.offsetY / SIZE);
    setHot([dir.x, dir.y, dir.z].map((v) => Math.round(v)));
  };

  return (
    <div className={styles.cubeWrap} aria-label="View cube">
      <div className={styles.cubeScene} style={{ width: SIZE, height: SIZE }}>
        <div
          className={styles.cube}
          ref={(el) => {
            cube = el;
          }}
        >
          {FACES.map((f) => {
            return (
              <button
                key={f.name}
                type="button"
                className={styles.cubeFace}
                data-nohover
                style={{
                  width: SIZE,
                  height: SIZE,
                  left: -SIZE / 2,
                  top: -SIZE / 2,
                  transform: faceTransform(f),
                }}
                title={`${f.name} view (drag the cube to turn)`}
                onPointerDown={(e) => down(e, f)}
                onPointerMove={(e) => over(e, f)}
                onPointerLeave={() => setHot(null)}
                onClick={(e) => {
                  if (e.detail === 0) align?.(new Vector3(...f.n)); // keyboard
                }}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      </div>
      <svg
        className={styles.cubeHot}
        viewBox="-50 -50 100 100"
        width="100"
        height="100"
        aria-hidden="true"
      >
        <path
          ref={(el) => {
            hotFace = el;
          }}
          className={styles.hotFace}
        />
        <path
          ref={(el) => {
            hotPath = el;
          }}
          className={styles.hotLine}
        />
        <circle
          ref={(el) => {
            hotDot = el;
          }}
          className={styles.hotDot}
          r="0"
        />
      </svg>
    </div>
  );
}
