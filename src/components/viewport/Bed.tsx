import { useEffect, useMemo } from 'react';
import { BufferGeometry, Vector3 } from 'three';
import { useActiveProfile } from '../../hooks/useProfiles';
import { BedRuler } from './BedRuler';

function circle(radius: number, z: number): BufferGeometry {
  const pts: Vector3[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    pts.push(new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z));
  }
  return new BufferGeometry().setFromPoints(pts);
}

/** Cylindrical delta build volume: bed disc, grid, and outline rings. */
export function Bed() {
  const { buildDiameter, buildHeight } = useActiveProfile('printer');
  const r = buildDiameter / 2;
  const floorRing = useMemo(() => circle(r, 0), [r]);
  const topRing = useMemo(() => circle(r, buildHeight), [r, buildHeight]);
  const posts = useMemo(() => {
    const pts: Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      pts.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, buildHeight));
    }
    return new BufferGeometry().setFromPoints(pts);
  }, [r, buildHeight]);
  useEffect(
    () => () => {
      floorRing.dispose();
      topRing.dispose();
      posts.dispose();
    },
    [floorRing, topRing, posts],
  );

  return (
    <group>
      <mesh position={[0, 0, -0.2]}>
        <circleGeometry args={[r, 96]} />
        <meshBasicMaterial color="#26211d" />
      </mesh>
      <gridHelper
        args={[buildDiameter, Math.max(2, Math.round(buildDiameter / 20)), '#4a3d34', '#302822']}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <lineLoop geometry={floorRing}>
        <lineBasicMaterial color="#8a6a55" />
      </lineLoop>
      <lineLoop geometry={topRing}>
        <lineBasicMaterial color="#3d332c" />
      </lineLoop>
      <BedRuler />
      <lineSegments geometry={posts}>
        <lineBasicMaterial color="#332a24" />
      </lineSegments>
    </group>
  );
}
