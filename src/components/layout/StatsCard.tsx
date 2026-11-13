import { useState } from 'react';
import { isBlockingWarning } from '../../core/toolpath/verify';
import { useActiveProfile } from '../../hooks/useProfiles';
import { useSliceStore } from '../../store/sliceStore';
import styles from './layout.module.css';

const KEY = 'clay-slicer-estimates-collapsed';
const loadCollapsed = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

const LOW = 0.88;
const HIGH = 1.12;

const fmtTime = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
};
const fmtWeight = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);

interface Props {
  /** widest radius of the print-size mesh, mm */
  meshRadius: number;
}

export function StatsCard({ meshRadius }: Props) {
  const { status, result, usedSettings, error } = useSliceStore();
  const clay = useActiveProfile('clay');
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? '0' : '1');
      } catch {
        /* private window: the choice is just not remembered */
      }
      return !c;
    });

  if (status === 'error' && error) {
    return (
      <div className={styles.card}>
        <h3>Cannot slice</h3>
        <p className={`${styles.warn} ${styles.bad}`}>{error}</p>
      </div>
    );
  }
  if (!result || !usedSettings) return null;

  const st = result.stats;
  const shrink = 1 - clay.shrinkagePct / 100;
  const dia = meshRadius * 2;
  const rows: [string, string][] = [
    ['Printed size', `Ø${dia.toFixed(0)} × ${st.heightMm.toFixed(0)} mm (wet)`],
    ['After firing', `Ø${(dia * shrink).toFixed(0)} × ${(st.heightMm * shrink).toFixed(0)} mm`],
    ['Layers', `${st.layers} (${result.count.toLocaleString()} points)`],
    ['Path length', `${(st.lengthMm / 1000).toFixed(1)} m`],
    [
      'Print time',
      `${fmtTime(st.timeS)} (${fmtTime(st.timeS * LOW)} – ${fmtTime(st.timeS * HIGH)})`,
    ],
    [
      'Clay volume',
      `${st.volumeCm3.toFixed(0)} cm³ (${(st.volumeCm3 * LOW).toFixed(0)} – ${(st.volumeCm3 * HIGH).toFixed(0)})`,
    ],
    ['Wet weight', fmtWeight(st.wetG)],
    ['Fired weight', `≈ ${fmtWeight(st.firedG)}`],
    [
      'Bead width (est.)',
      st.widthMax - st.widthMin < 0.05
        ? `${st.widthAvg.toFixed(1)} mm`
        : `${st.widthMin.toFixed(1)} – ${st.widthMax.toFixed(1)} mm`,
    ],
    [
      'Tank refills',
      st.refillZ.length
        ? `${st.refillZ.length} (z ≈ ${st.refillZ.map((z) => z.toFixed(0)).join(', ')} mm)`
        : 'none',
    ],
    [
      'Max overhang',
      `${st.maxOverhangDeg.toFixed(0)}° (limit ${usedSettings.overhangMax}°${st.maxOverhangDeg > 0 ? `, z ${st.maxOverhangZ.toFixed(0)} mm` : ''})`,
    ],
  ];

  return (
    <div className={styles.card}>
      <h3>
        <button
          type="button"
          className={styles.cardToggle}
          aria-expanded={!collapsed}
          onClick={toggle}
          title={collapsed ? 'Show the estimates' : 'Hide the estimates'}
        >
          <span className={styles.chev}>{collapsed ? '▸' : '▾'}</span> Estimates
        </button>
        <small>{collapsed ? fmtTime(st.timeS) : `${st.sliceMs.toFixed(0)} ms`}</small>
      </h3>
      {!collapsed && (
        <dl>
          {rows.flatMap(([k, v]) => [<dt key={`${k}-k`}>{k}</dt>, <dd key={`${k}-v`}>{v}</dd>])}
        </dl>
      )}
      {result.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {result.warnings.map((w) => (
            <li key={w} className={`${styles.warn} ${isBlockingWarning(w) ? styles.bad : ''}`}>
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
