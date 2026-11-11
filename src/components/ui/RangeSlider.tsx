import { useRef, useState } from 'react';
import styles from './RangeSlider.module.css';

export interface RangeValue {
  /** texture is zero here and eases in up to `solidFrom` */
  from: number;
  solidFrom: number;
  /** full strength up to here, then easing out until `to` */
  solid: number;
  to: number;
}

type Key = keyof RangeValue;
const ORDER: Key[] = ['from', 'solidFrom', 'solid', 'to'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * One track, four handles. The tall outer handles are where the texture starts and ends (zero
 * strength); the round handles below mark where it reaches full strength and where it starts to
 * fade out. Values are % of the model height and keep their order.
 */
export function RangeSlider({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Key | null>(null);
  /** handle whose value is shown in a tooltip (while dragging or focused with the keyboard) */
  const [tip, setTip] = useState<Key | null>(null);
  const v: RangeValue = {
    from: value.from,
    to: value.to,
    solidFrom: clamp(value.solidFrom, value.from, value.to),
    solid: clamp(value.solid, value.from, value.to),
  };
  v.solid = Math.max(v.solid, v.solidFrom);

  const set = (key: Key, raw: number) => {
    const n = Math.round(clamp(raw, 0, 100));
    const next = { ...v };
    const i = ORDER.indexOf(key);
    next[key] = n;
    // handles push their neighbours so the order always holds
    for (let k = i + 1; k < 4; k++) next[ORDER[k]] = Math.max(next[ORDER[k]], n);
    for (let k = i - 1; k >= 0; k--) next[ORDER[k]] = Math.min(next[ORDER[k]], n);
    // a hard edge stays hard when its outer handle is dragged
    if (key === 'from' && v.solidFrom === value.from) next.solidFrom = n;
    if (key === 'to' && v.solid === value.to) next.solid = n;
    onChange(next);
  };

  const fromEvent = (e: React.PointerEvent) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || !drag.current) return;
    set(drag.current, ((e.clientX - r.left) / r.width) * 100);
  };

  const handle = (key: Key, label: string, round: boolean) => (
    <div
      key={key}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v[key]}
      className={`${styles.handle} ${round ? styles.fadeHandle : ''}`}
      style={{ left: `${v[key]}%` }}
      onPointerDown={(e) => {
        drag.current = key;
        setTip(key);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }}
      onPointerMove={(e) => drag.current === key && fromEvent(e)}
      onPointerUp={() => {
        drag.current = null;
        setTip(null);
      }}
      onBlur={() => setTip(null)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) {
          e.preventDefault();
          setTip(key);
          set(key, v[key] + d * (e.shiftKey ? 10 : 1));
        }
      }}
    />
  );

  return (
    <div
      className={styles.wrap}
      title="Tall handles: where the texture starts and ends. Round handles: where it reaches full strength and where it starts to fade out. Drag to see the value."
    >
      <div className={styles.name}>Height range</div>
      <div className={styles.track} ref={track}>
        <div className={styles.bar} />
        <div
          className={styles.fadeIn}
          style={{ left: `${v.from}%`, width: `${v.solidFrom - v.from}%` }}
        />
        <div
          className={styles.solid}
          style={{ left: `${v.solidFrom}%`, width: `${v.solid - v.solidFrom}%` }}
        />
        <div className={styles.fade} style={{ left: `${v.solid}%`, width: `${v.to - v.solid}%` }} />
        {handle('from', 'Texture starts at height', false)}
        {handle('to', 'Texture ends at height', false)}
        {handle('solidFrom', 'Texture reaches full strength at height', true)}
        {handle('solid', 'Texture starts to fade out at height', true)}
        {tip && (
          <div className={styles.tip} style={{ left: `${v[tip]}%` }} role="status">
            {v[tip]}%
          </div>
        )}
      </div>
    </div>
  );
}
