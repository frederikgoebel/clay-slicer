import { useId, useState } from 'react';
import styles from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** what the setting does: shown as a tooltip over the whole row (required for every slider) */
  hint: string;
  onChange: (value: number) => void;
}

const show = (v: number) => String(Number(v.toFixed(3)));

/** Labelled slider with an editable number box (the box may go beyond the slider range). */
export function Slider({ label, value, min, max, step, unit, hint, onChange }: SliderProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const v = parseFloat(draft);
    if (Number.isFinite(v)) onChange(v);
    setDraft(null);
  };

  return (
    <div className={styles.row} title={hint}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <span className={styles.value}>
        <input
          id={id}
          className={styles.num}
          type="number"
          step={step}
          value={draft ?? show(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className={styles.unit}>{unit}</span>
      </span>
      <input
        type="range"
        className={styles.range}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
