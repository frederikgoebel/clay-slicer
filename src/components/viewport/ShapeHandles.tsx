import { Html, Line } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Plane, Raycaster, Vector2, Vector3, type Group, type Ray } from 'three';
import { meshScale } from '../../core/geometry/mesh';
import {
  MIN_GAP,
  resampleClosed,
  rotationAt,
  scaleSectionXY,
  sectionCentre,
  sectionOutline,
  translateSection,
  type ShapeSection,
  type Vec,
} from '../../core/shape/shape';
import { useActiveProfile } from '../../hooks/useProfiles';
import { useModelPanelVisible } from '../../store/layoutStore';
import { useModelStore } from '../../store/modelStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { useEffectiveView } from './useEffectiveView';
import styles from './viewport.module.css';

/** Handle size in screen terms: grows with camera distance. */
const SCREEN_SCALE = 0.0022;
const LOOP_POINTS = 96;
const ORANGE = '#ff8a4c';
const PALE = '#f3e1d2';
const AXIS = { x: '#e5484d', y: '#3fb950', z: '#4c8dff' } as const;

const round05 = (v: number) => Math.round(v * 2) / 2;
const deg = (r: number) => (r * 180) / Math.PI;

const world = new Vector3();

/** Keeps its children the same size on screen. */
function Screen({
  position,
  children,
}: {
  position: [number, number, number];
  children: ReactNode;
}) {
  const g = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (g.current) {
      g.current.getWorldPosition(world);
      g.current.scale.setScalar(camera.position.distanceTo(world) * SCREEN_SCALE);
    }
  });
  return (
    <group ref={g} position={position}>
      {children}
    </group>
  );
}

/** Pointer ray -> drag: disables the orbit controls while a handle is held. */
function useDrag() {
  const { camera, gl, controls, invalidate } = useThree();
  return (onMove: (ray: Ray, ev: PointerEvent) => void, onEnd?: () => void) => {
    const ctl = controls as { enabled: boolean } | null;
    if (ctl) ctl.enabled = false;
    const raycaster = new Raycaster();
    const move = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new Vector2(
          ((ev.clientX - r.left) / r.width) * 2 - 1,
          -((ev.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      onMove(raycaster.ray, ev);
      invalidate();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (ctl) ctl.enabled = true;
      document.body.style.cursor = '';
      onEnd?.();
      invalidate();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}

/** Where the ray crosses the horizontal plane at height z. */
function onPlane(ray: Ray, z: number): Vector3 | null {
  return ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), new Vector3());
}

/** Parameter along the line origin + t * dir that is closest to the ray. */
function onAxis(ray: Ray, origin: Vector3, dir: Vector3): number | null {
  const w = origin.clone().sub(ray.origin);
  const b = dir.dot(ray.direction);
  const d = dir.dot(w);
  const e = ray.direction.dot(w);
  const den = 1 - b * b;
  if (den < 1e-4) return null;
  return (b * e - d) / den;
}

const hover = (on: boolean, cursor = 'pointer') => {
  document.body.style.cursor = on ? cursor : '';
};

/** One arrow of the move gizmo: a shaft and a cone along +Y of its own frame. */
function Arrow({
  rotation,
  color,
  hot,
  onDown,
  onHover,
}: {
  rotation: [number, number, number];
  color: string;
  hot: boolean;
  onDown: (e: ThreeEvent<PointerEvent>) => void;
  onHover: (on: boolean) => void;
}) {
  const c = hot ? '#ffffff' : color;
  return (
    <group
      rotation={rotation}
      onPointerDown={onDown}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
    >
      <mesh position={[0, 13, 0]} renderOrder={21}>
        <cylinderGeometry args={[0.55, 0.55, 20, 10]} />
        <meshBasicMaterial color={c} depthTest={false} transparent />
      </mesh>
      <mesh position={[0, 29, 0]} renderOrder={21}>
        <coneGeometry args={[2.4, 8, 16]} />
        <meshBasicMaterial color={c} depthTest={false} transparent />
      </mesh>
      {/* generous invisible hit area */}
      <mesh position={[0, 20, 0]}>
        <cylinderGeometry args={[3.6, 3.6, 36, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  );
}

type HandleId = 'px' | 'mx' | 'py' | 'my' | 'c1' | 'c2' | 'c3' | 'c4';
const HANDLES: Record<HandleId, [number, number]> = {
  px: [1, 0],
  mx: [-1, 0],
  py: [0, 1],
  my: [0, -1],
  c1: [1, 1],
  c2: [-1, 1],
  c3: [-1, -1],
  c4: [1, -1],
};

/**
 * The gizmo of the selected section, in one piece:
 *  - arrows move it along X, Y and Z (the centre dot moves it freely on its plane)
 *  - small squares scale it: the sides stretch one axis (Shift keeps proportions), corners scale evenly
 *  - the ring turns this layer; the layers in between follow smoothly
 */
function Gizmo({
  sec,
  k,
  ang,
  zRange,
  onChange,
}: {
  sec: ShapeSection;
  k: number;
  ang: number;
  zRange: [number, number];
  onChange: (next: ShapeSection) => void;
}) {
  const drag = useDrag();
  const [hot, setHot] = useState<string | null>(null);
  const [readout, setReadout] = useState<string | null>(null);

  const [cx, cy] = sectionCentre(sec);
  const centre = new Vector3(cx * k, cy * k, sec.z * k);
  let hx = 1;
  let hy = 1;
  for (const [x, y] of sectionOutline(sec)) {
    hx = Math.max(hx, Math.abs(x - cx));
    hy = Math.max(hy, Math.abs(y - cy));
  }
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const toWorld = (dx: number, dy: number): [number, number, number] => [
    (cx + dx * cos - dy * sin) * k,
    (cy + dx * sin + dy * cos) * k,
    sec.z * k,
  ];
  const ringR = Math.hypot(hx, hy) + 6;
  const canMoveZ = zRange[1] > zRange[0];

  const down = (
    id: string,
    e: ThreeEvent<PointerEvent>,
    start: () => ((ray: Ray, ev: PointerEvent) => void) | null,
  ) => {
    e.stopPropagation();
    const onMove = start();
    if (!onMove) return;
    setHot(id);
    drag(onMove, () => {
      setHot(null);
      setReadout(null);
    });
  };

  /** move along a world axis */
  const moveAxis = (id: 'x' | 'y' | 'z', e: ThreeEvent<PointerEvent>) =>
    down(id, e, () => {
      const dir = new Vector3(id === 'x' ? 1 : 0, id === 'y' ? 1 : 0, id === 'z' ? 1 : 0);
      const t0 = onAxis(e.ray, centre, dir);
      if (t0 === null) return null;
      const start = sec;
      return (ray) => {
        const t = onAxis(ray, centre, dir);
        if (t === null) return;
        const d = Math.round((t - t0) / k);
        const next =
          id === 'z'
            ? { ...start, z: Math.min(zRange[1], Math.max(zRange[0], start.z + d)) }
            : translateSection(start, id === 'x' ? d : 0, id === 'y' ? d : 0);
        onChange(next);
        const [nx, ny] = sectionCentre(next);
        setReadout(`x ${Math.round(nx)}  y ${Math.round(ny)}  z ${Math.round(next.z)} mm`);
      };
    });

  /** move freely on the section's plane */
  const movePlane = (e: ThreeEvent<PointerEvent>) =>
    down('plane', e, () => {
      const p0 = onPlane(e.ray, centre.z);
      if (!p0) return null;
      const start = sec;
      return (ray) => {
        const p = onPlane(ray, centre.z);
        if (!p) return;
        const next = translateSection(
          start,
          Math.round((p.x - p0.x) / k),
          Math.round((p.y - p0.y) / k),
        );
        onChange(next);
        const [nx, ny] = sectionCentre(next);
        setReadout(`x ${Math.round(nx)}  y ${Math.round(ny)} mm`);
      };
    });

  const scale = (id: HandleId, e: ThreeEvent<PointerEvent>) =>
    down(id, e, () => {
      const [ux, uy] = HANDLES[id];
      const d0x = ux * hx;
      const d0y = uy * hy;
      const start = sec;
      const local = (ray: Ray): [number, number] | null => {
        const p = onPlane(ray, centre.z);
        if (!p) return null;
        const dx = p.x / k - cx;
        const dy = p.y / k - cy;
        return [dx * cos + dy * sin, -dx * sin + dy * cos];
      };
      return (ray, ev) => {
        const p = local(ray);
        if (!p) return;
        let fx = 1;
        let fy = 1;
        if (ux !== 0 && uy !== 0) fx = fy = Math.hypot(p[0], p[1]) / Math.hypot(d0x, d0y);
        else if (ux !== 0) fx = p[0] / d0x;
        else fy = p[1] / d0y;
        if (ev.shiftKey && (ux === 0 || uy === 0)) fx = fy = ux !== 0 ? fx : fy;
        fx = Math.min(20, Math.max(0.05, fx));
        fy = Math.min(20, Math.max(0.05, fy));
        const next = scaleSectionXY(start, fx, fy);
        onChange({
          ...next,
          verts: next.verts.map(([x, y]): Vec => [round05(x), round05(y)]),
          circle: next.circle
            ? { cx: next.circle.cx, cy: next.circle.cy, r: Math.max(1, round05(next.circle.r)) }
            : null,
        });
        setReadout(`${Math.round(2 * hx * fx)} × ${Math.round(2 * hy * fy)} mm`);
      };
    });

  const rotate = (e: ThreeEvent<PointerEvent>) =>
    down('ring', e, () => {
      const angleOf = (ray: Ray): number | null => {
        const p = onPlane(ray, centre.z);
        return p ? Math.atan2(p.y - centre.y, p.x - centre.x) : null;
      };
      let prev = angleOf(e.ray);
      if (prev === null) return null;
      let total = 0;
      const start = sec;
      return (ray, ev) => {
        const a = angleOf(ray);
        if (a === null || prev === null) return;
        let d = a - prev;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        total += d;
        prev = a;
        const step = ev.shiftKey ? 15 : 1;
        const rot = Math.round((start.rot + deg(total)) / step) * step;
        onChange({ ...start, rot });
        setReadout(`${rot}°`);
      };
    });

  const ring = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([Math.cos(a) * ringR * k, Math.sin(a) * ringR * k, 0]);
    }
    return pts;
  }, [ringR, k]);
  const box = [HANDLES.c1, HANDLES.c2, HANDLES.c3, HANDLES.c4, HANDLES.c1].map(([ux, uy]) => {
    const w = toWorld(ux * hx, uy * hy);
    return [w[0] - centre.x, w[1] - centre.y, 0] as [number, number, number];
  });
  const knob = [Math.cos(ang) * ringR * k, Math.sin(ang) * ringR * k, 0] as [
    number,
    number,
    number,
  ];

  return (
    <group position={centre}>
      {/* rotation ring */}
      <Line
        points={ring}
        color={hot === 'ring' ? '#ffffff' : '#7fb8ff'}
        lineWidth={hot === 'ring' ? 3 : 1.5}
        depthTest={false}
        renderOrder={19}
      />
      <mesh
        renderOrder={18}
        onPointerDown={rotate}
        onPointerOver={() => {
          setHot('ring');
          hover(true, 'grab');
        }}
        onPointerOut={() => {
          setHot((h) => (h === 'ring' ? null : h));
          hover(false);
        }}
      >
        <torusGeometry args={[ringR * k, Math.max(2.5, ringR * k * 0.035), 8, 96]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      <Screen position={knob}>
        <mesh
          renderOrder={22}
          onPointerDown={rotate}
          onPointerOver={() => hover(true, 'grab')}
          onPointerOut={() => hover(false)}
        >
          <sphereGeometry args={[2.6, 16, 12]} />
          <meshBasicMaterial color="#7fb8ff" depthTest={false} transparent />
        </mesh>
      </Screen>

      {/* scale frame and squares */}
      <Line
        points={box}
        color={ORANGE}
        lineWidth={1}
        dashed
        dashSize={3}
        gapSize={2}
        depthTest={false}
        renderOrder={19}
      />
      {(Object.keys(HANDLES) as HandleId[]).map((id) => {
        const w = toWorld(HANDLES[id][0] * hx, HANDLES[id][1] * hy);
        return (
          <Screen key={id} position={[w[0] - centre.x, w[1] - centre.y, 0]}>
            <mesh
              renderOrder={22}
              onPointerDown={(e) => scale(id, e)}
              onPointerOver={() => {
                setHot(id);
                hover(true, id.startsWith('c') ? 'nwse-resize' : 'ew-resize');
              }}
              onPointerOut={() => {
                setHot((h) => (h === id ? null : h));
                hover(false);
              }}
            >
              <boxGeometry args={[4.2, 4.2, 4.2]} />
              <meshBasicMaterial color={hot === id ? ORANGE : PALE} depthTest={false} transparent />
            </mesh>
          </Screen>
        );
      })}

      {/* move: arrows and the centre dot */}
      <Screen position={[0, 0, 0]}>
        <Arrow
          rotation={[0, 0, -Math.PI / 2]}
          color={AXIS.x}
          hot={hot === 'x'}
          onDown={(e) => moveAxis('x', e)}
          onHover={(on) => {
            setHot(on ? 'x' : null);
            hover(on, 'grab');
          }}
        />
        <Arrow
          rotation={[0, 0, 0]}
          color={AXIS.y}
          hot={hot === 'y'}
          onDown={(e) => moveAxis('y', e)}
          onHover={(on) => {
            setHot(on ? 'y' : null);
            hover(on, 'grab');
          }}
        />
        {canMoveZ && (
          <Arrow
            rotation={[Math.PI / 2, 0, 0]}
            color={AXIS.z}
            hot={hot === 'z'}
            onDown={(e) => moveAxis('z', e)}
            onHover={(on) => {
              setHot(on ? 'z' : null);
              hover(on, 'grab');
            }}
          />
        )}
        <mesh
          renderOrder={23}
          onPointerDown={movePlane}
          onPointerOver={() => {
            setHot('plane');
            hover(true, 'move');
          }}
          onPointerOut={() => {
            setHot(null);
            hover(false);
          }}
        >
          <sphereGeometry args={[3.4, 20, 14]} />
          <meshBasicMaterial
            color={hot === 'plane' ? '#ffffff' : ORANGE}
            depthTest={false}
            transparent
          />
        </mesh>
      </Screen>

      {readout && (
        <Html position={[0, 0, 0]} center className={styles.readout} zIndexRange={[10, 0]}>
          {readout}
        </Html>
      )}
    </group>
  );
}

/**
 * The design's sections in the 3D view: each section's outline as a loop with a sphere at its
 * centre (click to select). The selected section carries the gizmo.
 */
export function ShapeHandles() {
  const shape = useModelStore((s) => s.shape);
  const designing = useModelStore((s) => s.source === 'design');
  const panelVisible = useModelPanelVisible();
  const selected = useUiStore((s) => s.shapeSection);
  const show = useUiStore((s) => s.showHandles);
  const inPreview = useUiStore((s) => s.handlesInPreview);
  const view = useEffectiveView();
  const scalePct = useSettingsStore((s) => s.print.scalePct);
  const shrinkagePct = useActiveProfile('clay').shrinkagePct;
  const k = meshScale({ scalePct, shrinkagePct });
  const invalidate = useThree((s) => s.invalidate);

  const angleAt = useMemo(() => (shape ? rotationAt(shape) : () => 0), [shape]);

  const loops = useMemo(() => {
    if (!shape) return [];
    return shape.sections.map((sec) => {
      const ring = resampleClosed(sectionOutline(sec), LOOP_POINTS);
      let cx = 0;
      let cy = 0;
      for (let j = 0; j < LOOP_POINTS; j++) {
        cx += ring[2 * j];
        cy += ring[2 * j + 1];
      }
      cx /= LOOP_POINTS;
      cy /= LOOP_POINTS;
      const ang = angleAt(sec.z);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const pts: [number, number, number][] = [];
      for (let j = 0; j <= LOOP_POINTS; j++) {
        const m = j % LOOP_POINTS;
        const dx = ring[2 * m] - cx;
        const dy = ring[2 * m + 1] - cy;
        pts.push([(cx + dx * c - dy * s) * k, (cy + dx * s + dy * c) * k, sec.z * k]);
      }
      return pts;
    });
  }, [shape, k, angleAt]);

  if (!shape || !designing || !show || !panelVisible || (view !== 'model' && !inPreview))
    return null;

  const sel = Math.min(selected, shape.sections.length - 1);
  const secs = shape.sections;

  const commit = (i: number, next: ShapeSection) => {
    const cur = useModelStore.getState().shape;
    if (!cur) return;
    useModelStore.getState().updateShape({
      ...cur,
      sections: cur.sections.map((s, n) => (n === i ? next : s)),
    });
    invalidate();
  };

  const lo = sel > 0 ? secs[sel - 1].z + MIN_GAP : 0;
  const hi = sel === secs.length - 1 ? Infinity : secs[sel + 1].z - MIN_GAP;
  const zRange: [number, number] = sel === 0 ? [0, 0] : [lo, hi];

  return (
    <group>
      {loops.map((pts, i) => (
        <Line
          key={`l${i}`}
          points={pts}
          color={i === sel ? ORANGE : '#5aa9ff'}
          lineWidth={i === sel ? 2 : 1}
          depthTest={false}
          renderOrder={19}
        />
      ))}
      {secs.map((s, i) => {
        if (i === sel) return null;
        const [cx, cy] = sectionCentre(s);
        return (
          <Screen key={`h${i}`} position={[cx * k, cy * k, s.z * k]}>
            <mesh
              renderOrder={20}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                useUiStore.getState().setShapeSection(i);
              }}
              onPointerOver={() => hover(true)}
              onPointerOut={() => hover(false)}
            >
              <sphereGeometry args={[3.2, 20, 14]} />
              <meshBasicMaterial color={PALE} depthTest={false} transparent />
            </mesh>
          </Screen>
        );
      })}
      <Gizmo
        key={sel}
        sec={secs[sel]}
        k={k}
        ang={angleAt(secs[sel].z)}
        zRange={zRange}
        onChange={(next) => commit(sel, next)}
      />
    </group>
  );
}
