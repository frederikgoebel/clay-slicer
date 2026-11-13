import { describe, expect, it } from 'vitest';
import { buildRings } from '../src/core/toolpath/rings';
import { renderTextureThumb } from '../src/core/textures/thumb';
import { newTexture } from '../src/domain/print';
import { useSettingsStore } from '../src/store/settingsStore';
import { cylinder, testSettings } from './helpers';

const opts = {
  width: 40,
  height: 40,
  rowH: 1,
  lh: 1,
  fadeIn: 0,
  color: [200, 180, 160] as [number, number, number],
};

describe('texture thumbnails', () => {
  const mesh = cylinder(20, 40);
  const set = buildRings(mesh, testSettings({ layerHeight: 1, floorLayers: 0 }));
  const pixels = (type: Parameters<typeof newTexture>[0]) =>
    renderTextureThumb(set, { ...newTexture(type), enabled: true }, opts);
  const covered = (a: Uint8ClampedArray) => a.filter((_, i) => i % 4 === 3 && a[i] > 0).length;

  it('draws the model and a texture changes the picture', () => {
    const wave = pixels('wave');
    expect(covered(wave)).toBeGreaterThan(200);
    const ribs = pixels('ribs');
    expect(Array.from(wave)).not.toEqual(Array.from(ribs));
  });

  it('draws every texture type without errors', () => {
    for (const type of [
      'fuzzy',
      'wave',
      'zigzag',
      'ribs',
      'twist',
      'blobs',
      'ledge',
      'sling',
    ] as const)
      expect(covered(pixels(type))).toBeGreaterThan(100);
  });
});

describe('moveTextureTo', () => {
  it('puts a texture at a position in the list', () => {
    const st = useSettingsStore.getState();
    st.resetPrint();
    const a = st.addTexture('wave');
    const b = st.addTexture('ribs');
    const c = st.addTexture('fuzzy');
    useSettingsStore.getState().moveTextureTo(c, 0);
    expect(useSettingsStore.getState().textures.map((t) => t.id)).toEqual([c, a, b]);
    useSettingsStore.getState().moveTextureTo(c, 2);
    expect(useSettingsStore.getState().textures.map((t) => t.id)).toEqual([a, b, c]);
  });
});
