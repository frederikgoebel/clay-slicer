import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, Mesh, type Vector3 } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { meshHeight } from '../../core/geometry/mesh';
import { Stroke } from '../../core/textures/mask';
import { useActiveProfile } from '../../hooks/useProfiles';
import { useSettingsStore } from '../../store/settingsStore';
import { useMaskStore } from '../../store/maskStore';
import { useUiStore } from '../../store/uiStore';
import { useEffectiveView } from './useEffectiveView';
import { getMatcap } from './matcap';
import { createFullMaskTexture, createMaskTexture, createModelMaterial } from './modelMaterial';

/** The matcap is fairly dark, so the clay colour is lifted a little before it is multiplied in. */
const BRIGHTEN = 1.25;
const CREASE_ANGLE = (40 * Math.PI) / 180; // smooth below 40°, keep sharp edges above

function uniformColors(length: number, hex: string): Float32Array {
  const col = new Color(hex); // linear
  const rgb = [col.r, col.g, col.b].map((v) => Math.min(1, v * BRIGHTEN));
  const c = new Float32Array(length);
  for (let i = 0; i < length; i += 3) c.set(rgb, i);
  return c;
}

/** The model: smooth-shaded matcap surface, overhang overlay and the mask painting surface. */
export function ModelMesh({ mesh }: { mesh: Float32Array }) {
  const invalidate = useThree((s) => s.invalidate);
  const showModel = useEffectiveView() === 'model';
  const paint = useUiStore((s) => s.paint);
  const mask = useMaskStore((s) => (paint.textureId ? s.masks[paint.textureId] : undefined));

  const paintTex = useSettingsStore((s) => s.textures.find((t) => t.id === paint.textureId));
  /** decals are positioned by clicking; every other texture is painted as a mask */
  const placing = paintTex?.type === 'decal';
  const painting = paint.textureId !== null && !placing;
  const interacting = paint.textureId !== null;
  const stroke = useRef<Stroke | null>(null);
  const height = useMemo(() => meshHeight(mesh), [mesh]);
  const clayColor = useActiveProfile('clay').color;

  // geometry: crease-aware smooth normals (non-indexed, so colours stay per triangle)
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(mesh.slice(), 3));
    const creased = toCreasedNormals(g, CREASE_ANGLE);
    creased.setAttribute('color', new BufferAttribute(uniformColors(mesh.length, clayColor), 3));
    return creased;
  }, [mesh, clayColor]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // material + painted-mask texture
  const fullMask = useMemo(() => createFullMaskTexture(), []);
  const { material, uniforms } = useMemo(
    () => createModelMaterial(getMatcap(), fullMask),
    [fullMask],
  );
  useEffect(
    () => () => {
      material.dispose();
      fullMask.dispose();
    },
    [material, fullMask],
  );
  const maskTexture = useMemo(() => (mask ? createMaskTexture(mask) : null), [mask]);
  useEffect(() => () => maskTexture?.dispose(), [maskTexture]);

  useEffect(() => {
    uniforms.uHeight.value = height;
    uniforms.uMaskOn.value = painting ? 1 : 0;
    uniforms.uMask.value = maskTexture ?? fullMask;
    invalidate();
  }, [uniforms, height, painting, maskTexture, fullMask, invalidate]);

  // ---- painting
  const cursor = useRef<Mesh>(null);
  const stroking = useRef(false);

  const stamp = (p: Vector3) => {
    const { textureId, erase, radius, hardness, opacity } = useUiStore.getState().paint;
    if (!textureId) return;
    if (placing) {
      useSettingsStore.getState().patchTexture(textureId, {
        angle: Math.round((Math.atan2(p.y, p.x) * 180) / Math.PI),
        zc: Math.round(p.z),
      });
      return;
    }
    const target = useMaskStore.getState().ensure(textureId, erase ? 255 : 0);
    stroke.current ??= new Stroke(target);
    stroke.current.stamp(p.x, p.y, p.z, height, {
      radius,
      hardness: hardness / 100,
      opacity: opacity / 100,
      erase,
    });
    const tex = useMaskStore.getState().masks[textureId];
    if (tex === target && maskTexture) maskTexture.needsUpdate = true;
    invalidate();
  };

  useEffect(() => {
    const end = () => {
      if (!stroking.current) return;
      stroking.current = false;
      stroke.current = null;
      useMaskStore.getState().commit();
    };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    stroking.current = true;
    stroke.current = null;
    stamp(e.point);
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const c = cursor.current;
    if (c) {
      c.visible = true;
      c.position.copy(e.point);
      c.scale.setScalar(
        placing ? Math.max(4, (paintTex?.width ?? 20) / 2) : useUiStore.getState().paint.radius,
      );
    }
    if (stroking.current) stamp(e.point);
    else invalidate();
  };
  const onOut = () => {
    if (cursor.current) cursor.current.visible = false;
    invalidate();
  };

  return (
    <>
      <mesh
        geometry={geometry}
        material={material}
        visible={showModel}
        onPointerDown={interacting ? onDown : undefined}
        onPointerMove={interacting ? onMove : undefined}
        onPointerOut={interacting ? onOut : undefined}
      />
      {interacting && (
        <mesh ref={cursor} visible={false} raycast={() => null}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial
            color={paint.erase ? '#ff7a6b' : '#5aa9ff'}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
