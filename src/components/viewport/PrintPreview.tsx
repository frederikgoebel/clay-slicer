import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  DirectionalLight,
  Euler,
  InstancedMesh,
  Matrix4,
  PMREMGenerator,
  ShadowMaterial,
  SphereGeometry,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useActiveProfile } from '../../hooks/useProfiles';
import { useSliceStore } from '../../store/sliceStore';
import { useUiStore } from '../../store/uiStore';
import { buildBeadMesh } from './beadGeometry';
import { createClayMaterial, createGrainTexture } from './clayMaterial';
import { visiblePointCount } from './pathUtils';
import { useEffectiveView } from './useEffectiveView';

/** Soft studio light for the clay preview: image-based fill plus one shadow-casting key light. */
function StudioLighting({ radius }: { radius: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.3;
    scene.environmentRotation.x = Math.PI / 2; // the room is Y-up, this scene is Z-up
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      pmrem.dispose();
      invalidate();
    };
  }, [gl, scene, invalidate]);

  const reach = Math.max(radius * 1.6, 60);
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const camera = useThree((s) => s.camera);

  // The lights travel with the camera (around the vertical axis), so whatever you look at is lit.
  useFrame(() => {
    const a = Math.atan2(camera.position.y, camera.position.x);
    const place = (l: DirectionalLight | null, da: number, up: number, r: number) =>
      l?.position.set(Math.cos(a + da) * r, Math.sin(a + da) * r, up);
    place(key.current, 0.45, reach * 1.6, reach * 1.5);
    place(fill.current, -0.9, reach * 0.8, reach * 1.5);
    scene.environmentRotation.copy(
      new Euler().setFromRotationMatrix(
        new Matrix4()
          .makeRotationZ(a + Math.PI / 4)
          .multiply(new Matrix4().makeRotationX(Math.PI / 2)),
      ),
    );
  });

  return (
    <>
      <hemisphereLight args={['#fff4e8', '#3a2c24', 0.25]} position={[0, 0, 1]} />
      <directionalLight
        ref={fill}
        position={[-reach, -reach, reach]}
        intensity={1.1}
        color="#e9f0ff"
      />
      <directionalLight
        ref={key}
        position={[reach * 1.2, -reach * 1.4, reach * 2]}
        intensity={3}
        color="#fff1e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={reach * 8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.25}
      />
    </>
  );
}

/** The print as real geometry: every bead swept along the toolpath, lit like clay. */
export function PrintPreview() {
  const view = useEffectiveView();
  const result = useSliceStore((s) => s.result);
  const settings = useSliceStore((s) => s.usedSettings);
  const layer = useUiStore((s) => s.layer);
  const invalidate = useThree((s) => s.invalidate);
  const { buildDiameter } = useActiveProfile('printer');
  const clayColor = useActiveProfile('clay').color;
  const layerHeight = settings?.layerHeight ?? 1;

  const grain = useMemo(() => createGrainTexture(), []);
  const material = useMemo(() => createClayMaterial(grain), [grain]);
  useEffect(() => {
    material.color.set(clayColor);
    invalidate();
  }, [material, clayColor, invalidate]);
  const shadowCatcher = useMemo(() => new ShadowMaterial({ opacity: 0.35 }), []);
  useEffect(
    () => () => {
      material.dispose();
      grain.dispose();
      shadowCatcher.dispose();
    },
    [material, grain, shadowCatcher],
  );

  // clay blobs: a sphere of the extruded volume at every dwell point
  const blobs = useMemo(() => {
    if (!result || !settings || view !== 'preview') return null;
    const points: number[] = [];
    for (let i = 0; i < result.count; i++) if (result.dwell[i] > 0) points.push(i);
    if (!points.length) return null;
    const geo = new SphereGeometry(1, 20, 14);
    const mesh = new InstancedMesh(geo, material, points.length);
    const m = new Matrix4();
    points.forEach((i, n) => {
      const vol = settings.extrusionRate * result.dwell[i];
      const rad = Math.max(layerHeight / 2, Math.cbrt((3 * vol) / (4 * Math.PI)));
      const z = result.xyz[3 * i + 2] - layerHeight / 2 + 0.3 * (rad - layerHeight / 2);
      m.makeScale(rad, rad, rad).setPosition(result.xyz[3 * i], result.xyz[3 * i + 1], z);
      mesh.setMatrixAt(n, m);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { mesh, geo, points };
  }, [result, settings, view, material, layerHeight]);
  useEffect(
    () => () => {
      blobs?.geo.dispose();
      blobs?.mesh.dispose();
    },
    [blobs],
  );

  const bead = useMemo(
    () => (result && view === 'preview' ? buildBeadMesh(result, layerHeight) : null),
    [result, view, layerHeight],
  );
  useEffect(() => () => bead?.geometry.dispose(), [bead]);

  // layer slider: draw only the indices of the visible segments
  useEffect(() => {
    if (!bead || !result) return;
    bead.geometry.setDrawRange(
      0,
      bead.indexCountForPoints(visiblePointCount(result, layer, layerHeight)),
    );
    if (blobs) {
      const visible = visiblePointCount(result, layer, layerHeight);
      blobs.mesh.count = blobs.points.filter((i) => i < visible).length;
    }
    invalidate();
  }, [bead, blobs, result, layer, layerHeight, invalidate]);

  if (view !== 'preview' || !bead) return null;
  return (
    <>
      <StudioLighting radius={buildDiameter / 2} />
      <mesh
        geometry={bead.geometry}
        material={material}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      {blobs && <primitive object={blobs.mesh} />}
      <mesh position={[0, 0, 0.05]} receiveShadow material={shadowCatcher}>
        <circleGeometry args={[buildDiameter / 2, 96]} />
      </mesh>
    </>
  );
}
