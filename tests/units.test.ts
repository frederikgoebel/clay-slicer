import { describe, expect, it } from 'vitest';
import { guessUnits } from '../src/core/io/units';

describe('STL units', () => {
  const g = (x: number, y: number, z: number) => guessUnits({ x, y, z }, 400, 800);
  it('does not ask for a normal millimetre model', () => {
    expect(g(120, 120, 180).ask).toBe(false);
  });
  it('guesses metres for a 0.15 m object', () => {
    const r = g(0.15, 0.15, 0.2);
    expect(r.ask).toBe(true);
    expect(r.guess.id).toBe('m');
  });
  it('guesses inches for a 5 inch wide pot', () => {
    expect(g(5, 5, 7).guess.id).toBe('in');
  });
  it('offers scale-to-fit for something far too big', () => {
    const r = g(5000, 5000, 6000);
    expect(r.ask).toBe(true);
    expect(r.guess.id).toBe('fit');
    expect(r.guess.factor * 6000).toBeLessThanOrEqual(800);
  });
});
