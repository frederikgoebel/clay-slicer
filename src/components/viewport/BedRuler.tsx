import { Html } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Vector3 } from 'three';
import { useActiveProfile } from '../../hooks/useProfiles';
import styles from './viewport.module.css';

/** A readable tick spacing for a bed of this size. */
export function niceStep(extent: number): number {
  if (extent <= 150) return 20;
  if (extent <= 300) return 50;
  if (extent <= 600) return 100;
  return 200;
}

/**
 * Measurements on the build plate: tick marks and labels in mm along the X and Y axes through the
 * centre, the bed diameter, and a height scale on one post of the build volume.
 */
export function BedRuler() {
  const { buildDiameter, buildHeight } = useActiveProfile('printer');
  const r = buildDiameter / 2;
  const step = niceStep(buildDiameter);

  const ticks = useMemo(() => {
    const along: number[] = [];
    for (let v = step; v < r - step / 4; v += step) along.push(v, -v);
    const heights: number[] = [];
    for (let v = step; v <= buildHeight; v += step) heights.push(v);
    return { along, heights };
  }, [r, step, buildHeight]);

  const geometry = useMemo(() => {
    const pts: Vector3[] = [];
    const tick = Math.max(1.5, r / 60);
    pts.push(new Vector3(-r, 0, 0.1), new Vector3(r, 0, 0.1));
    pts.push(new Vector3(0, -r, 0.1), new Vector3(0, r, 0.1));
    for (const v of ticks.along) {
      pts.push(new Vector3(v, -tick, 0.1), new Vector3(v, tick, 0.1));
      pts.push(new Vector3(-tick, v, 0.1), new Vector3(tick, v, 0.1));
    }
    // height scale on the far post
    pts.push(new Vector3(0, r, 0), new Vector3(0, r, buildHeight));
    for (const v of ticks.heights) pts.push(new Vector3(-tick, r, v), new Vector3(tick, r, v));
    return new BufferGeometry().setFromPoints(pts);
  }, [r, buildHeight, ticks]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const off = Math.max(5, r / 28);
  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#8a6a55" transparent opacity={0.8} />
      </lineSegments>
      {ticks.along.map((v) => (
        <group key={v}>
          <Html position={[v, -off, 0]} center className={styles.ruler} zIndexRange={[5, 0]}>
            {v}
          </Html>
          <Html position={[-off, v, 0]} center className={styles.ruler} zIndexRange={[5, 0]}>
            {v}
          </Html>
        </group>
      ))}
      <Html
        position={[r + off * 2.2, 0, 0]}
        center
        className={styles.rulerAxis}
        zIndexRange={[5, 0]}
      >
        X mm
      </Html>
      <Html
        position={[0, -r - off * 2.2, 0]}
        center
        className={styles.rulerAxis}
        zIndexRange={[5, 0]}
      >
        Ø {buildDiameter} mm
      </Html>
      <Html
        position={[0, r + off * 2.2, 0]}
        center
        className={styles.rulerAxis}
        zIndexRange={[5, 0]}
      >
        Y mm
      </Html>
      {ticks.heights.map((v) => (
        <Html
          key={`z${v}`}
          position={[off * 1.6, r, v]}
          center
          className={styles.ruler}
          zIndexRange={[5, 0]}
        >
          {v}
        </Html>
      ))}
    </group>
  );
}
