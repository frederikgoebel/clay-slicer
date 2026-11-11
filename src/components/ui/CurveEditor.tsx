import { useRef, useState } from 'react';
import type { CurvePoint } from '../../core/textures/curve';
import styles from './CurveEditor.module.css';

const W = 240;
const H = 92;
const PAD = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Small graph editor: drag the points, click on the graph to add one, double-click a point to
 * remove it. The first and last point keep x = 0 and x = 1. x and y are 0..1.
 */
export function CurveEditor({
  label,
  points,
  onChange,
  xLabel,
  yLabel,
  presets,
}: {
  label: string;
  points: CurvePoint[];
  onChange: (p: CurvePoint[]) => void;
  xLabel: string;
  yLabel: string;
  presets?: readonly (readonly [string, CurvePoint[]])[];
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const px = (x: number) => PAD + x * (W - 2 * PAD);
  const py = (y: number) => H - PAD - y * (H - 2 * PAD);

  const toData = (e: React.PointerEvent): CurvePoint => {
    const r = (svg.current as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return [clamp01((x - PAD) / (W - 2 * PAD)), clamp01((H - PAD - y) / (H - 2 * PAD))];
  };

  const move = (i: number, e: React.PointerEvent) => {
    const [x, y] = toData(e);
    const last = points.length - 1;
    const lo = i === 0 ? 0 : points[i - 1][0] + 0.005;
    const hi = i === last ? 1 : points[i + 1][0] - 0.005;
    const nx = i === 0 ? 0 : i === last ? 1 : Math.min(hi, Math.max(lo, x));
    onChange(points.map((p, k): CurvePoint => (k === i ? [nx, y] : p)));
  };

  const add = (e: React.PointerEvent) => {
    const [x, y] = toData(e);
    if (x <= 0.01 || x >= 0.99) return;
    const i = points.findIndex((p) => p[0] > x);
    if (i < 0) return;
    const next = [...points];
    next.splice(i, 0, [x, y]);
    onChange(next);
    setDrag(i);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span>{label}</span>
        <span className={styles.presets}>
          {presets?.map(([name, p]) => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(p.map((q): CurvePoint => [...q]))}
            >
              {name}
            </button>
          ))}
        </span>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={`${label} graph`}
        onPointerDown={add}
        onPointerMove={(e) => drag !== null && move(drag, e)}
        onPointerUp={() => setDrag(null)}
      >
        <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} className={styles.frame} />
        <line x1={PAD} x2={W - PAD} y1={py(0.5)} y2={py(0.5)} className={styles.grid} />
        <line x1={px(0.5)} x2={px(0.5)} y1={PAD} y2={H - PAD} className={styles.grid} />
        <polyline
          className={styles.line}
          points={points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}
        />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={px(x)}
            cy={py(y)}
            r={5}
            className={styles.dot}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDrag(i);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onDoubleClick={() => {
              if (i > 0 && i < points.length - 1) onChange(points.filter((_, k) => k !== i));
            }}
          />
        ))}
      </svg>
      <div className={styles.axes}>
        <span>{xLabel} →</span>
        <span>↑ {yLabel}</span>
      </div>
    </div>
  );
}
