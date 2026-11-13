import { beforeEach, describe, expect, it } from 'vitest';
import {
  copyStack,
  copyTexture,
  duplicateTexture,
  pasteTextures,
} from '../src/actions/textureActions';
import { maskImageKey } from '../src/actions/decalActions';
import { validIcon } from '../src/domain/projectIcon';
import { capitalize, uniqueName } from '../src/domain/names';
import { renderProjectIcon } from '../src/actions/projectManager';
import { BUILTIN_PROFILES } from '../src/domain/profiles';
import { DEFAULT_PRINT } from '../src/domain/print';
import { newTexture } from '../src/domain/print';
import { useImageStore } from '../src/store/imageStore';
import { useMaskStore } from '../src/store/maskStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTextureClipboard } from '../src/store/textureClipboard';
import { cylinder } from './helpers';

const stack = () => useSettingsStore.getState().textures;
let a: string;
let b: string;

beforeEach(() => {
  const ta = newTexture('ribs');
  const tb = newTexture('decal');
  a = ta.id;
  b = tb.id;
  useSettingsStore.setState({ textures: [ta, tb] });
  useMaskStore.getState().replaceAll({});
  useImageStore.getState().replaceAll({});
  useMaskStore.getState().ensure(a, 0).data[7] = 55;
  useImageStore.getState().set(b, { width: 2, height: 1, data: new Uint8Array([9, 8]) });
  useImageStore.getState().set(maskImageKey(a), { width: 1, height: 1, data: new Uint8Array([4]) });
  useTextureClipboard.getState().set([]);
});

describe('texture duplicate, copy and paste', () => {
  it('duplicates right after the original with its own copies of masks and pictures', () => {
    duplicateTexture(a);
    expect(stack().map((t) => t.type)).toEqual(['ribs', 'ribs', 'decal']);
    const copy = stack()[1];
    expect(copy.id).not.toBe(a);
    expect(useMaskStore.getState().masks[copy.id].data[7]).toBe(55);
    expect(useMaskStore.getState().masks[copy.id]).not.toBe(useMaskStore.getState().masks[a]);
    expect(useImageStore.getState().images[maskImageKey(copy.id)].data[0]).toBe(4);
    // editing the copy leaves the original alone
    useMaskStore.getState().masks[copy.id].data[7] = 1;
    expect(useMaskStore.getState().masks[a].data[7]).toBe(55);
  });

  it('copies one texture and pastes it below another, also into another project', () => {
    copyTexture(b);
    pasteTextures(a);
    expect(stack().map((t) => t.type)).toEqual(['ribs', 'decal', 'decal']);
    const pasted = stack()[1];
    expect(useImageStore.getState().images[pasted.id].data[1]).toBe(8);
    // another project: empty stack, the clipboard still holds the texture
    useSettingsStore.setState({ textures: [] });
    useMaskStore.getState().replaceAll({});
    useImageStore.getState().replaceAll({});
    pasteTextures();
    expect(stack().map((t) => t.type)).toEqual(['decal']);
    expect(useImageStore.getState().images[stack()[0].id].data[0]).toBe(9);
  });

  it('copies and pastes the whole stack in order', () => {
    copyStack();
    useSettingsStore.setState({ textures: [] });
    pasteTextures();
    expect(stack().map((t) => t.type)).toEqual(['ribs', 'decal']);
    expect(stack().map((t) => t.id)).not.toContain(a);
    expect(useMaskStore.getState().masks[stack()[0].id].data[7]).toBe(55);
  });
});

describe('names and icons', () => {
  it('makes names unique', () => {
    expect(uniqueName('Vase', ['Other'])).toBe('Vase');
    expect(uniqueName('Vase', ['vase'])).toBe('Vase 2');
    expect(uniqueName('Vase', ['Vase', 'Vase 2'])).toBe('Vase 3');
  });
  it('ignores icons from older formats instead of crashing on them', () => {
    expect(validIcon({ aspect: 2, r: [1, 1] })).toBeUndefined();
    expect(validIcon(undefined)).toBeUndefined();
    expect(validIcon({ width: 2, height: 1, rgba: new Uint8ClampedArray(3) })).toBeUndefined();
    const ok = validIcon({ width: 2, height: 1, rgba: new Uint8ClampedArray(8) });
    expect(ok?.width).toBe(2);
  });
  it('capitalises names', () => {
    expect(capitalize('tube')).toBe('Tube');
    expect(capitalize('')).toBe('');
  });
  it('renders a shaded picture of a model as the project icon', () => {
    const project = {
      name: 'a',
      raw: cylinder(10, 20),
      shape: null,
      profiles: {
        printer: BUILTIN_PROFILES.printer[0],
        nozzle: BUILTIN_PROFILES.nozzle[1],
        clay: BUILTIN_PROFILES.clay[0],
      },
      print: DEFAULT_PRINT,
      textures: [],
      masks: {},
      images: {},
    };
    const icon = renderProjectIcon(project)!;
    expect(icon.rgba).toHaveLength(icon.width * icon.height * 4);
    let solid = 0;
    for (let i = 3; i < icon.rgba.length; i += 4) if (icon.rgba[i] === 255) solid++;
    expect(solid).toBeGreaterThan(200);
    expect(solid).toBeLessThan(icon.width * icon.height);
    expect(renderProjectIcon({ ...project, raw: null })).toBeUndefined();
  });
});
