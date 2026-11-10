import { CanvasTexture, SRGBColorSpace } from 'three';

let cached: CanvasTexture | null = null;

/**
 * Neutral grey "matcap": the shading of a sphere lit from the upper left with a soft rim.
 * Grey so the model's own colour (clay or overhang colours) comes through undistorted,
 * and view-dependent so the form reads clearly from every angle without scene lights.
 */
export function getMatcap(): CanvasTexture {
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;

  const body = g.createRadialGradient(
    size * 0.38,
    size * 0.3,
    size * 0.02,
    size * 0.5,
    size * 0.5,
    size * 0.55,
  );
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.3, '#ededed');
  body.addColorStop(0.65, '#b4b4b4');
  body.addColorStop(1, '#6e6e6e');
  g.fillStyle = body;
  g.fillRect(0, 0, size, size);

  const rim = g.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size * 0.5,
  );
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(255,255,255,0.22)');
  g.fillStyle = rim;
  g.fillRect(0, 0, size, size);

  cached = new CanvasTexture(canvas);
  cached.colorSpace = SRGBColorSpace;
  return cached;
}
