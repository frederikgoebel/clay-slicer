import { useEffect, useRef } from 'react';
import { meshHeight } from '../../core/geometry/mesh';
import { buildRings, type RingSet } from '../../core/toolpath/rings';
import { renderTextureThumb } from '../../core/textures/thumb';
import type { SliceSettings, TextureLayer } from '../../core/types';
import { useActiveProfile, useSliceSettings } from '../../hooks/useProfiles';
import { useImageStore } from '../../store/imageStore';
import { useMaskStore } from '../../store/maskStore';
import { useMeshStore } from '../../store/meshStore';
import styles from './panels.module.css';

const ROWS = 64;
const W = 112;
const H = 112;

const cache = new WeakMap<Float32Array, RingSet | null>();

/** Coarse rings of the model, shared by all thumbnails; null if the model cannot be sliced. */
function previewRings(mesh: Float32Array, s: SliceSettings): { set: RingSet; rowH: number } | null {
  const rowH = meshHeight(mesh) / ROWS;
  let set = cache.get(mesh);
  if (set === undefined) {
    try {
      set = buildRings(mesh, {
        ...s,
        textures: [],
        layerHeight: rowH,
        floorLayers: 0,
        floorBelow: false,
        mode: 'spiral',
        topCurves: 'closed',
        segLen: 3,
        seamAngle: 0,
      });
    } catch {
      set = null;
    }
    cache.set(mesh, set);
  }
  return set ? { set, rowH } : null;
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The model with only this texture applied, as a small picture. */
export function TextureThumb({ tex }: { tex: TextureLayer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mesh = useMeshStore((s) => s.mesh);
  const settings = useSliceSettings();
  const clay = useActiveProfile('clay');
  const mask = useMaskStore((s) => s.masks[tex.id]);
  const version = useMaskStore((s) => s.version);
  const image = useImageStore((s) => s.images[tex.id]);
  const { layerHeight, textureFadeIn } = settings;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const timer = setTimeout(() => {
      ctx.clearRect(0, 0, W, H);
      if (!mesh) return;
      const prev = previewRings(mesh, settings);
      if (!prev) return;
      const pixels = renderTextureThumb(
        prev.set,
        { ...tex, mask: mask ?? null, image: image ?? null },
        {
          width: W,
          height: H,
          rowH: prev.rowH,
          lh: layerHeight,
          fadeIn: textureFadeIn,
          color: hexRgb(clay.color),
        },
      );
      ctx.putImageData(new ImageData(pixels, W, H), 0, 0);
    }, 120);
    return () => clearTimeout(timer);
    // `settings` only feeds the one-off coarse slice; the values that matter are listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, tex, mask, image, version, layerHeight, textureFadeIn, clay.color]);

  return (
    <canvas
      ref={ref}
      className={tex.enabled ? styles.thumb : `${styles.thumb} ${styles.thumbOff}`}
      width={W}
      height={H}
      role="img"
      aria-label="Preview of this texture on the model"
    />
  );
}
