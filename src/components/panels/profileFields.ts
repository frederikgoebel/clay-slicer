import type { ClayProfile, NozzleProfile, PrinterProfile } from '../../domain/profiles';

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T] & string;

export interface FieldDef<T> {
  key: NumericKeys<T>;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  /** `gcode`: changes the generated G-code. `analysis`: only estimates, warnings and the preview. */
  usage: 'gcode' | 'analysis';
}

export const PRINTER_FIELDS: FieldDef<PrinterProfile>[] = [
  {
    key: 'buildDiameter',
    usage: 'analysis',
    label: 'Bed Ø',
    min: 50,
    max: 1000,
    step: 1,
    unit: 'mm',
  },
  {
    key: 'buildHeight',
    usage: 'analysis',
    label: 'Max height',
    min: 50,
    max: 2000,
    step: 1,
    unit: 'mm',
  },
  {
    key: 'tankCm3',
    usage: 'analysis',
    label: 'Tank volume',
    min: 500,
    max: 60000,
    step: 100,
    unit: 'cm³',
  },
  {
    key: 'travelSpeed',
    usage: 'gcode',
    label: 'Travel speed',
    min: 10,
    max: 300,
    step: 5,
    unit: 'mm/s',
  },
  {
    key: 'flowFollowsSpeedPct',
    usage: 'analysis',
    label: 'Flow follows speed',
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
    hint: '0 = E-driven (same bead at any speed), 100 = pressure-fed (slower move = fatter bead). Used for the bead width estimate.',
  },
  {
    key: 'eDia',
    usage: 'gcode',
    label: 'E-axis Ø',
    min: 0.5,
    max: 10,
    step: 0.01,
    unit: 'mm',
    hint: 'Converts clay volume to E units. Calibrate on your machine.',
  },
  { key: 'primeE', usage: 'gcode', label: 'Prime', min: 0, max: 50, step: 0.5, unit: 'E' },
  {
    key: 'startDwell',
    usage: 'gcode',
    label: 'Start dwell',
    min: 0,
    max: 5000,
    step: 50,
    unit: 'ms',
  },
];

export const NOZZLE_FIELDS: FieldDef<NozzleProfile>[] = [
  {
    key: 'diameter',
    usage: 'analysis',
    label: 'Nozzle Ø',
    min: 0.5,
    max: 10,
    step: 0.1,
    unit: 'mm',
  },
  {
    key: 'extrusionRate',
    usage: 'gcode',
    label: 'Extrusion rate',
    min: 0.5,
    max: 200,
    step: 0.1,
    unit: 'cm³/min',
    hint: 'Clay leaving the nozzle at the print speed. The line width is calculated from this, the speed and the layer height.',
  },
  {
    key: 'layerHeight',
    usage: 'gcode',
    label: 'Layer height',
    min: 0.3,
    max: 6,
    step: 0.05,
    unit: 'mm',
  },
];

export const CLAY_FIELDS: FieldDef<ClayProfile>[] = [
  {
    key: 'printSpeed',
    usage: 'gcode',
    label: 'Print speed',
    min: 5,
    max: 150,
    step: 1,
    unit: 'mm/s',
  },
  {
    key: 'flow',
    usage: 'gcode',
    label: 'Flow factor',
    min: 20,
    max: 200,
    step: 1,
    unit: '%',
    hint: 'Multiplier on the nozzle extrusion rate (stiffer or softer clay).',
  },
  {
    key: 'minLayerTime',
    usage: 'gcode',
    label: 'Min layer time',
    min: 0,
    max: 120,
    step: 1,
    unit: 's',
    hint: 'Slows small layers so the clay below can firm up. 0 = off.',
  },
  {
    key: 'shrinkagePct',
    usage: 'gcode',
    label: 'Shrinkage',
    min: 0,
    max: 25,
    step: 0.5,
    unit: '%',
    hint: 'Drying + firing. The model is scaled up by 1/(1−s) before slicing.',
  },
  {
    key: 'overhangMax',
    usage: 'analysis',
    label: 'Max overhang',
    min: 5,
    max: 60,
    step: 1,
    unit: '°',
    hint: 'Angle from vertical this clay body tolerates',
  },
  {
    key: 'density',
    usage: 'analysis',
    label: 'Wet density',
    min: 1.2,
    max: 2.4,
    step: 0.05,
    unit: 'g/cm³',
  },
  {
    key: 'waterPct',
    usage: 'analysis',
    label: 'Water loss',
    min: 0,
    max: 40,
    step: 1,
    unit: '%',
    hint: 'Share of wet weight lost when fired (rough)',
  },
];
