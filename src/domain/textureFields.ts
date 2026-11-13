import type { BlendMode, TextureType } from '../core/types';

export interface TexField {
  key:
    | 'lift'
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
  hint: string;
}

const WAVE: TexField[] = [
  {
    key: 'amplitude',
    label: 'Amplitude',
    min: 0,
    max: 12,
    step: 0.1,
    unit: 'mm',
    hint: 'How far the surface moves in and out, in mm (the height of the waves or teeth).',
  },
  {
    key: 'count',
    label: 'Around',
    min: 0,
    max: 60,
    step: 1,
    unit: '×',
    hint: 'How many repeats fit around the object. 0 = no variation around (only the vertical wavelength acts).',
  },
  {
    key: 'wavelength',
    label: 'Vertical λ',
    min: 0,
    max: 120,
    step: 1,
    unit: 'mm',
    hint: 'Height of one repeat going up, in mm. 0 = the pattern is straight up and down. Together with “Around” it makes spirals.',
  },
];

export const FIELDS: Record<TextureType, TexField[]> = {
  fuzzy: [
    {
      key: 'amplitude',
      label: 'Strength',
      min: 0,
      max: 3,
      step: 0.05,
      unit: 'mm',
      hint: 'How far the clay surface is pushed in and out at random, in mm.',
    },
    {
      key: 'wavelength',
      label: 'Feature size',
      min: 0.5,
      max: 30,
      step: 0.5,
      unit: 'mm',
      hint: 'Size of one bump of the noise along the wall, in mm. Small = fine grain, large = slow wobble. The result is the same at any path resolution.',
    },
    {
      key: 'seed',
      label: 'Seed',
      min: 1,
      max: 99,
      step: 1,
      hint: 'Another random pattern with the same settings.',
    },
  ],
  wave: WAVE,
  zigzag: WAVE,
  ribs: [
    {
      key: 'amplitude',
      label: 'Depth',
      min: 0,
      max: 8,
      step: 0.1,
      unit: 'mm',
      hint: 'How far the ribs stand out, in mm.',
    },
    {
      key: 'count',
      label: 'Ribs',
      min: 1,
      max: 80,
      step: 1,
      unit: '×',
      hint: 'How many ribs go around the object.',
    },
  ],
  blobs: [
    {
      key: 'amplitude',
      label: 'Dwell per blob',
      min: 0.1,
      max: 10,
      step: 0.1,
      unit: 's',
      hint: 'How many seconds the nozzle stands still extruding at each blob. More time = a bigger blob.',
    },
    {
      key: 'count',
      label: 'Blobs per row',
      min: 1,
      max: 60,
      step: 1,
      unit: '×',
      hint: 'How many blobs sit in each row around the object.',
    },
    {
      key: 'wavelength',
      label: 'Row spacing',
      min: 0,
      max: 60,
      step: 1,
      unit: 'mm',
      hint: 'Distance between rows going up, in mm (rounded to whole layers). 0 = a row on every layer.',
    },
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
    {
      key: 'amplitude',
      label: 'Max outdent',
      min: 0,
      max: 40,
      step: 0.5,
      unit: 'mm',
      hint: 'How far the widest part sticks out of the wall, in mm.',
    },
    {
      key: 'count',
      label: 'Repeats around',
      min: 1,
      max: 100,
      step: 1,
      unit: '×',
      hint: 'How many outdents go around the object.',
    },
    {
      key: 'wavelength',
      label: 'Outdent height',
      min: 1,
      max: 120,
      step: 1,
      unit: 'mm',
      hint: 'How tall each outdent is. The height range is split into outdents of about this height (a whole number of them fits the range).',
    },
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
    {
      key: 'amplitude',
      label: 'Reach',
      min: 0,
      max: 60,
      step: 1,
      unit: 'mm',
      hint: 'How far each sling hangs out from the wall, in mm.',
    },
    {
      key: 'count',
      label: 'Slings per row',
      min: 1,
      max: 40,
      step: 1,
      unit: '×',
      hint: 'How many slings sit in each row around the object.',
    },
    {
      key: 'wavelength',
      label: 'Row spacing',
      min: 1,
      max: 120,
      step: 1,
      unit: 'mm',
      hint: 'Distance between rows going up, in mm (rounded to whole layers). 0 = a row on every layer.',
    },
    {
      key: 'width',
      label: 'Sling width',
      min: 2,
      max: 60,
      step: 1,
      unit: 'mm',
      hint: 'Width of one sling along the wall, in mm.',
    },
    {
      key: 'layersDown',
      label: 'Layers that droop',
      min: 1,
      max: 30,
      step: 1,
      unit: '×',
      hint: 'How many layers in a row make the sling, so it hangs longer.',
    },
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
    {
      key: 'amplitude',
      label: 'Relief',
      min: -6,
      max: 6,
      step: 0.1,
      unit: 'mm',
      hint: "How far the picture's light areas stand out of the wall, in mm. Negative = they sink in.",
    },
    {
      key: 'angle',
      label: 'Around (centre)',
      min: -180,
      max: 180,
      step: 1,
      unit: '°',
      hint: "Where the picture's centre sits around the object, in degrees.",
    },
    {
      key: 'zc',
      label: 'Height (centre)',
      min: 0,
      max: 400,
      step: 1,
      unit: 'mm',
      hint: "Height of the picture's centre above the bed, in mm.",
    },
    {
      key: 'width',
      label: 'Width',
      min: 5,
      max: 400,
      step: 1,
      unit: 'mm',
      hint: 'Width of the picture on the wall, in mm.',
    },
    {
      key: 'hgt',
      label: 'Height',
      min: 5,
      max: 400,
      step: 1,
      unit: 'mm',
      hint: 'Height of the picture on the wall, in mm.',
    },
    {
      key: 'rot',
      label: 'Rotation',
      min: -180,
      max: 180,
      step: 1,
      unit: '°',
      hint: 'Turns the picture on the wall, in degrees.',
    },
  ],
  flow: [
    {
      key: 'amplitude',
      label: 'More / less clay',
      min: -90,
      max: 200,
      step: 1,
      unit: '%',
      hint: 'Change of the extrusion rate: +50 = half as much clay again, -50 = half as much. Wider beads where there is more, thinner where less. Combine with the pattern / paint mask to say where.',
    },
    {
      key: 'count',
      label: 'Alternate around',
      min: 0,
      max: 60,
      step: 1,
      unit: '×',
      hint: 'More then less this many times around the object (0 = no alternation)',
    },
    {
      key: 'wavelength',
      label: 'Alternate in height',
      min: 0,
      max: 120,
      step: 1,
      unit: 'mm',
      hint: 'More then less every this many mm of height (0 = no alternation)',
    },
  ],
  twist: [
    {
      key: 'amplitude',
      label: 'Total twist',
      min: -720,
      max: 720,
      step: 5,
      unit: '°',
      hint: 'How many degrees the whole shape is turned from the bottom of its height range to the top.',
    },
  ],
};

export const BLENDS: readonly (readonly [BlendMode, string])[] = [
  ['add', 'Add (sum with layers above)'],
  ['max', 'Max (higher one wins)'],
  ['replace', 'Replace (overrides layers above)'],
];
