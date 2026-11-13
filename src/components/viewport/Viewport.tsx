import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, TOUCH } from 'three';
import { useUiStore } from '../../store/uiStore';
import { Bed } from './Bed';
import { CameraRig } from './CameraRig';
import { PrintPreview } from './PrintPreview';
import { ModelMesh } from './ModelMesh';
import { ShapeHandles } from './ShapeHandles';
import { Toolpath } from './Toolpath';
import { ViewCube, ViewCubeBridge } from './ViewCube';

// -1 = "no action" for OrbitControls (typed as MOUSE/TOUCH only because three's types are narrow)
const NONE = -1;

const ORBIT_MOUSE = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
const ORBIT_TOUCH = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
/** While painting, the left button/one finger paints; right button rotates. */
const PAINT_MOUSE = { LEFT: NONE as MOUSE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
const PAINT_TOUCH = { ONE: NONE as TOUCH, TWO: TOUCH.DOLLY_ROTATE };

export function Viewport({ mesh }: { mesh: Float32Array | null }) {
  const painting = useUiStore((s) => s.paint.textureId !== null);
  return (
    <>
      <Canvas
        flat
        shadows="soft"
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ antialias: true }}
        camera={{ fov: 40, near: 1, far: 6000, up: [0, 0, 1], position: [260, -320, 220] }}
      >
        <color attach="background" args={['#161311']} />
        <Bed />
        {mesh && <ModelMesh mesh={mesh} />}
        <ShapeHandles />
        <Toolpath />
        <PrintPreview />
        {mesh && <CameraRig mesh={mesh} />}
        <ViewCubeBridge />
        <OrbitControls
          makeDefault
          enableDamping
          mouseButtons={painting ? PAINT_MOUSE : ORBIT_MOUSE}
          touches={painting ? PAINT_TOUCH : ORBIT_TOUCH}
        />
      </Canvas>
      <ViewCube />
    </>
  );
}
