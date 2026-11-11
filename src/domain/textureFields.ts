import type { BlendMode, TextureType } from '../core/types';

export interface TexField {
  key:
    | 'lift'
    | 'repeatV'
    | 'rotStep'
    | 'layersDown'
    | 'amplitude'
    | 'count'
    | 'wavelength'
    | 'seed'
    | 'angle'
    | 'zc'
    | 'width'
    | 'hgt'
    | 'rot';
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
}

const WAVE: TexField[] = [
  { key: 'amplitude', label: 'Amplitude', min: 0, max: 12, step: 0.1, unit: 'mm' },
  { key: 'count', label: 'Around', min: 0, max: 60, step: 1, unit: '×' },
  { key: 'wavelength', label: 'Vertical λ', min: 0, max: 120, step: 1, unit: 'mm' },
];

export const FIELDS: Record<TextureType, TexField[]> = {
  fuzzy: [
    { key: 'amplitude', label: 'Strength', min: 0, max: 3, step: 0.05, unit: 'mm' },
    { key: 'wavelength', label: 'Feature size', min: 0.5, max: 30, step: 0.5, unit: 'mm' },
    { key: 'seed', label: 'Seed', min: 1, max: 99, step: 1 },
  ],
  wave: WAVE,
  zigzag: WAVE,
  ribs: [
    { key: 'amplitude', label: 'Depth', min: 0, max: 8, step: 0.1, unit: 'mm' },
    { key: 'count', label: 'Ribs', min: 1, max: 80, step: 1, unit: '×' },
  ],
  blobs: [
    { key: 'amplitude', label: 'Dwell per blob', min: 0.1, max: 10, step: 0.1, unit: 's' },
    { key: 'count', label: 'Blobs per row', min: 1, max: 60, step: 1, unit: '×' },
    { key: 'wavelength', label: 'Row spacing', min: 0, max: 60, step: 1, unit: 'mm' },
    {
      key: 'lift',
      label: 'Lift while extruding',
      min: 0,
      max: 6,
      step: 0.1,
      unit: 'mm',
      hint: 'The nozzle rises slowly while it extrudes a blob, so the blob is not squeezed flat. 0 = stands still.',
    },
  ],
  ledge: [
    { key: 'amplitude', label: 'Max outdent', min: 0, max: 40, step: 0.5, unit: 'mm' },
    { key: 'count', label: 'Repeats around', min: 1, max: 100, step: 1, unit: '×' },
    { key: 'repeatV', label: 'Repeats in height', min: 1, max: 30, step: 1, unit: '×' },
    {
      key: 'rotStep',
      label: 'Rotate each repeat',
      min: -180,
      max: 180,
      step: 1,
      unit: '°',
      hint: 'Every repeat in height is turned this much further around the object',
    },
  ],
  sling: [
    { key: 'amplitude', label: 'Reach', min: 0, max: 60, step: 1, unit: 'mm' },
    { key: 'count', label: 'Slings per row', min: 1, max: 40, step: 1, unit: '×' },
    { key: 'wavelength', label: 'Row spacing', min: 1, max: 120, step: 1, unit: 'mm' },
    { key: 'width', label: 'Sling width', min: 2, max: 60, step: 1, unit: 'mm' },
    { key: 'layersDown', label: 'Layers that droop', min: 1, max: 30, step: 1, unit: '×' },
    {
      key: 'rotStep',
      label: 'Rotate each row',
      min: -180,
      max: 180,
      step: 1,
      unit: '°',
      hint: 'The next row of slings is turned this much around the object',
    },
  ],
  decal: [
    { key: 'amplitude', label: 'Relief', min: -6, max: 6, step: 0.1, unit: 'mm' },
    { key: 'angle', label: 'Around (centre)', min: -180, max: 180, step: 1, unit: '°' },
    { key: 'zc', label: 'Height (centre)', min: 0, max: 400, step: 1, unit: 'mm' },
    { key: 'width', label: 'Width', min: 5, max: 400, step: 1, unit: 'mm' },
    { key: 'hgt', label: 'Height', min: 5, max: 400, step: 1, unit: 'mm' },
    { key: 'rot', label: 'Rotation', min: -180, max: 180, step: 1, unit: '°' },
  ],
  twist: [{ key: 'amplitude', label: 'Total twist', min: -720, max: 720, step: 5, unit: '°' }],
};

export const BLENDS: readonly (readonly [BlendMode, string])[] = [
  ['add', 'Add (sum with layers above)'],
  ['max', 'Max (higher one wins)'],
  ['replace', 'Replace (overrides layers above)'],
];
