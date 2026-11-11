import { useRef } from 'react';
import styles from './RangeSlider.module.css';

export interface RangeValue {
  from: number;
  /** full strength up to here, then fading out until `to` */
  solid: number;
  to: number;
}

type Key = keyof RangeValue;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * One track, three handles: where the texture starts, where it begins to fade out (round handle)
 * and where it ends. Values are % of the model height.
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
  const solid = clamp(value.solid, value.from, value.to);

  const set = (key: Key, raw: number) => {
    const v = Math.round(clamp(raw, 0, 100));
    const next = { ...value, solid };
    if (key === 'from') {
      next.from = Math.min(v, value.to);
      next.solid = Math.max(solid, next.from);
    } else if (key === 'to') {
      next.to = Math.max(v, value.from);
      next.solid = Math.min(solid, next.to);
      // pulling the end back keeps the fade length; pushing it out keeps "no fade" as no fade
      if (solid === value.to) next.solid = next.to;
    } else next.solid = clamp(v, value.from, value.to);
    onChange(next);
  };

  const fromEvent = (e: React.PointerEvent) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || !drag.current) return;
    set(drag.current, ((e.clientX - r.left) / r.width) * 100);
  };

  const handle = (key: Key, v: number, label: string, extra = '') => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={`${styles.handle} ${extra}`}
      style={{ left: `${v}%` }}
      onPointerDown={(e) => {
        drag.current = key;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }}
      onPointerMove={(e) => drag.current === key && fromEvent(e)}
      onPointerUp={() => (drag.current = null)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) {
          e.preventDefault();
          set(key, v + d * (e.shiftKey ? 10 : 1));
        }
      }}
    />
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span>Height range</span>
        <output>
          {value.from}% – {solid}% fade → {value.to}%
        </output>
      </div>
      <div className={styles.track} ref={track}>
        <div className={styles.bar} />
        <div
          className={styles.solid}
          style={{ left: `${value.from}%`, width: `${solid - value.from}%` }}
        />
        <div className={styles.fade} style={{ left: `${solid}%`, width: `${value.to - solid}%` }} />
        {handle('from', value.from, 'Texture starts at height')}
        {handle('to', value.to, 'Texture ends at height')}
        {handle('solid', solid, 'Texture starts to fade at height', styles.fadeHandle)}
      </div>
      <div className={styles.legend}>
        <span>start</span>
        <span>round handle = start of fade-out</span>
        <span>end</span>
      </div>
    </div>
  );
}
