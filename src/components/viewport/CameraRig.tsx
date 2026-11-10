import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Vector3 } from 'three';
import { meshHeight } from '../../core/geometry/mesh';
import { useModelStore } from '../../store/modelStore';

interface Controls {
  target: Vector3;
  update: () => void;
}

/** Re-frames the camera whenever a new model is loaded (not on every tweak). */
export function CameraRig({ mesh }: { mesh: Float32Array }) {
  const loadCount = useModelStore((s) => s.loadCount);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as Controls | null;
  const invalidate = useThree((s) => s.invalidate);
  const latest = useRef(mesh);
  useEffect(() => {
    latest.current = mesh;
  });

  useEffect(() => {
    if (!controls) return;
    const pos = latest.current;
    let r = 0;
    for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i], pos[i + 1]));
    const h = meshHeight(pos);
    const m = Math.max(r * 2, h, 40);
    controls.target.set(0, 0, h / 2);
    camera.position.set(m * 1.1, -m * 1.5, h / 2 + m * 0.8);
    controls.update();
    invalidate();
  }, [loadCount, controls, camera, invalidate]);

  return null;
}
