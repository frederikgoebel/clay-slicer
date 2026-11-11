import { useState, type PointerEvent } from 'react';
import { sectionOutline, MIN_VERTS, type ShapeSection, type Vec } from '../../core/shape/shape';
import { dragSymmetric } from '../../core/shape/symmetry';
import { useActiveProfile } from '../../hooks/useProfiles';
import { useModelStore } from '../../store/modelStore';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui/controls';
import styles from './shape.module.css';

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
const niceCeil = (v: number, step: number) => Math.ceil(v / step) * step;
const path = (pts: Vec[]) =>
  pts.length
    ? 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(' L') + ' Z'
    : '';

/**
 * Top-down editor for the selected section: drag the points, click a "+" on an edge to add a
 * point, select a point and delete it. Neighbouring sections are drawn faintly for reference.
 */
export function TopView() {
  const shape = useModelStore((s) => s.shape);
  const update = useModelStore((s) => s.updateShape);
  const secIdx = useUiStore((s) => s.shapeSection);
  const vIdx = useUiStore((s) => s.shapeVertex);
  const setVertex = useUiStore((s) => s.setShapeVertex);
  const symX = useUiStore((s) => s.symX);
  const symY = useUiStore((s) => s.symY);
  const { buildDiameter } = useActiveProfile('printer');
  /** view half-size, frozen while a point is dragged so the point does not run from the cursor */
  const [frozen, setFrozen] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  if (!shape) return null;

  const secs = shape.sections;
  const si = Math.min(secIdx, secs.length - 1);
  const sec = secs[si];
  const vi = Math.min(vIdx, sec.verts.length - 1);
  let ext = 40;
  for (const s of secs) {
    if (s.circle)
      ext = Math.max(ext, Math.abs(s.circle.cx) + s.circle.r, Math.abs(s.circle.cy) + s.circle.r);
    else for (const [x, y] of s.verts) ext = Math.max(ext, Math.abs(x), Math.abs(y));
  }
  const R = frozen ?? niceCeil(ext * 1.3, 25);
  const handleR = R / 26;

  const setVerts = (verts: Vec[]) => {
    const next: ShapeSection[] = secs.map((s, k) => (k === si ? { ...s, verts } : s));
    update({ ...shape, sections: next });
  };

  const toMm = (e: PointerEvent): Vec | null => {
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, -p.y];
  };

  const move = (e: PointerEvent) => {
    if (dragging === null) return;
    const mm = toMm(e);
    if (!mm || !frozen) return;
    const lim = frozen * 0.98;
    if (sec.circle) {
      const c = sec.circle;
      const next =
        dragging === -1
          ? { ...c, cx: Math.round(mm[0]), cy: Math.round(mm[1]) }
          : {
              ...c,
              r: Math.min(lim, Math.max(1, Math.round(Math.hypot(mm[0] - c.cx, mm[1] - c.cy)))),
            };
      update({
        ...shape,
        sections: secs.map((s, k) => (k === si ? { ...s, circle: next } : s)),
      });
      return;
    }
    const to: Vec = [
      Math.max(-lim, Math.min(lim, Math.round(mm[0]))),
      Math.max(-lim, Math.min(lim, Math.round(mm[1]))),
    ];
    setVerts(
      dragSymmetric(sec.verts, dragging, to, { x: symX, y: symY }, Math.max(2, 0.04 * frozen)),
    );
  };

  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of sectionOutline(sec)) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const bbox = { w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };

  const neighbours = [secs[si - 1], secs[si + 1]].filter(Boolean);
  const gridStep = R > 150 ? 100 : R > 70 ? 50 : 25;
  const grid: number[] = [];
  for (let g = gridStep; g < R; g += gridStep) grid.push(g, -g);
  const n = sec.verts.length;

  return (
    <div>
      <svg
        ref={setSvg}
        className={styles.canvas}
        viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
        role="img"
        aria-label="Section top view"
        onPointerMove={move}
        onPointerUp={() => {
          setDragging(null);
          setFrozen(null);
        }}
        onPointerCancel={() => {
          setDragging(null);
          setFrozen(null);
        }}
      >
        {grid.map((g) => (
          <g key={g}>
            <line x1={g} x2={g} y1={-R} y2={R} className={styles.grid} />
            <line x1={-R} x2={R} y1={g} y2={g} className={styles.grid} />
          </g>
        ))}
        {grid.map((g) => (
          <g key={`t${g}`} className={styles.tick} fontSize={R / 20}>
            <text x={g} y={R / 14} textAnchor="middle">
              {g}
            </text>
            <text x={R / 70} y={-g + R / 60} textAnchor="start">
              {g}
            </text>
          </g>
        ))}
        <text x={R - R / 40} y={-R / 40} textAnchor="end" className={styles.tick} fontSize={R / 20}>
          mm
        </text>
        <line x1={-R} x2={R} y1={0} y2={0} className={styles.axis} />
        <line x1={0} x2={0} y1={-R} y2={R} className={styles.axis} />
        {buildDiameter / 2 < R && <circle r={buildDiameter / 2} className={styles.bed} />}
        {neighbours.map((s) => (
          <path key={s.z} d={path(sectionOutline(s))} className={styles.ghostShape} />
        ))}
        <path d={path(sectionOutline(sec))} className={styles.shape} />
        {sec.circle && (
          <>
            <circle
              cx={sec.circle.cx}
              cy={-sec.circle.cy}
              r={handleR}
              className={dragging === -1 ? styles.nodeOn : styles.node}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture(e.pointerId);
                setFrozen(R);
                setDragging(-1);
              }}
            />
            <circle
              cx={sec.circle.cx + sec.circle.r}
              cy={-sec.circle.cy}
              r={handleR}
              className={dragging === -2 ? styles.nodeOn : styles.node}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture(e.pointerId);
                setFrozen(R);
                setDragging(-2);
              }}
            />
          </>
        )}
        {!sec.circle && <path d={path(sec.verts)} className={styles.control} />}
        {!sec.circle &&
          sec.verts.map((v, i) => {
            const w = sec.verts[(i + 1) % n];
            const mx = (v[0] + w[0]) / 2;
            const my = (v[1] + w[1]) / 2;
            return (
              <g
                key={`m${i}`}
                className={styles.add}
                onClick={() => {
                  const verts = sec.verts.map((q): Vec => [...q]);
                  verts.splice(i + 1, 0, [Math.round(mx), Math.round(my)]);
                  setVerts(verts);
                  setVertex(i + 1);
                }}
              >
                <circle cx={mx} cy={-my} r={handleR * 0.75} />
                <path
                  d={`M${mx - handleR * 0.4},${-my} H${mx + handleR * 0.4} M${mx},${-my - handleR * 0.4} V${-my + handleR * 0.4}`}
                />
              </g>
            );
          })}
        {!sec.circle &&
          sec.verts.map((v, i) => (
            <circle
              key={i}
              cx={v[0]}
              cy={-v[1]}
              r={handleR}
              className={i === vi ? styles.nodeOn : styles.node}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture(e.pointerId);
                setFrozen(R);
                setDragging(i);
                setVertex(i);
              }}
            />
          ))}
      </svg>
      <p className={styles.measure}>
        {sec.circle ? (
          <>
            <strong>Ø {fmt(2 * sec.circle.r)} mm</strong> · centre {fmt(sec.circle.cx)},{' '}
            {fmt(sec.circle.cy)}
          </>
        ) : (
          <>
            <strong>
              {fmt(bbox.w)} × {fmt(bbox.d)} mm
            </strong>{' '}
            · centre {fmt(bbox.cx)}, {fmt(bbox.cy)}
          </>
        )}{' '}
        · height z = {fmt(sec.z)} mm
      </p>
      <div className={styles.rowBtns}>
        <Button
          small
          disabled={n <= MIN_VERTS || sec.circle !== null}
          onClick={() => {
            setVerts(sec.verts.filter((_, i) => i !== vi));
            setVertex(Math.max(0, vi - 1));
          }}
          title="Delete the selected point"
        >
          Delete point
        </Button>
      </div>
    </div>
  );
}
