import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/** Tiny seeded PRNG so the grain looks the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Soft, tileable grain used as bump map: fine speckle plus a few larger blotches. */
export function createGrainTexture(size = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const rand = rng(7);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  const blot = (count: number, rMin: number, rMax: number, alpha: number) => {
    for (let i = 0; i < count; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = rMin + rand() * (rMax - rMin);
      const v = rand() > 0.5 ? 255 : 0;
      // draw at wrapped positions so the texture tiles
      for (const ox of [-size, 0, size])
        for (const oy of [-size, 0, size]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
          g.addColorStop(1, `rgba(${v},${v},${v},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
    }
  };
  blot(60, 14, 32, 0.18);
  blot(900, 1.5, 4, 0.35);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Matte, slightly gritty stoneware-clay look (leather-hard, not glazed). */
export function createClayMaterial(grain: Texture): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color('#a97555'),
    roughness: 0.92,
    metalness: 0,
    bumpMap: grain,
    bumpScale: 1.6,
    envMapIntensity: 0.9,
  });
}
