/** STL files carry no units. This guesses them from the size of the model. */
export interface UnitOption {
  id: 'mm' | 'cm' | 'in' | 'm' | 'fit';
  label: string;
  /** multiply the coordinates by this to get millimetres */
  factor: number;
}

export interface UnitGuess {
  /** the size looks wrong for the printer, so the user should be asked */
  ask: boolean;
  guess: UnitOption;
  /** size in mm of the largest dimension for each option */
  options: { option: UnitOption; size: number }[];
}

const FIXED: UnitOption[] = [
  { id: 'mm', label: 'Millimetres', factor: 1 },
  { id: 'cm', label: 'Centimetres', factor: 10 },
  { id: 'in', label: 'Inches', factor: 25.4 },
  { id: 'm', label: 'Metres', factor: 1000 },
];

export interface Bounds {
  x: number;
  y: number;
  z: number;
}

export function boundsOf(pos: Float32Array): Bounds {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) {
    const a = i % 3;
    if (pos[i] < lo[a]) lo[a] = pos[i];
    if (pos[i] > hi[a]) hi[a] = pos[i];
  }
  return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] };
}

/**
 * Ask when, taken as millimetres, the model is tiny (< 10 mm) or does not fit the printer.
 * The guess is the unit that gives a size near a typical pot (~120 mm) inside the build volume;
 * a model that is too big in every unit is offered a "scale to fit".
 */
export function guessUnits(b: Bounds, buildDiameter: number, buildHeight: number): UnitGuess {
  const xy = Math.max(b.x, b.y);
  const fits = (f: number) => xy * f <= buildDiameter && b.z * f <= buildHeight;
  const maxDim = Math.max(b.x, b.y, b.z);
  const fitFactor = Math.min(buildDiameter / xy, buildHeight / b.z) * 0.9;
  const fit: UnitOption = { id: 'fit', label: 'Scale to fit the printer', factor: fitFactor };
  const all = [...FIXED, fit];
  const options = all.map((option) => ({ option, size: maxDim * option.factor }));
  const ask = maxDim < 10 || !fits(1);
  let best: UnitOption = FIXED[0];
  let bestScore = Infinity;
  for (const o of FIXED) {
    const size = maxDim * o.factor;
    if (!fits(o.factor) || size < 20) continue;
    const score = Math.abs(Math.log(size / 120));
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (bestScore === Infinity) best = fit;
  return { ask, guess: best, options };
}

export function scaleMesh(pos: Float32Array, factor: number): Float32Array {
  if (factor === 1) return pos;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) out[i] = pos[i] * factor;
  return out;
}
