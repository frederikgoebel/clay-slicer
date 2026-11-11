import { describe, expect, it } from 'vitest';
import { dragSymmetric } from '../src/core/shape/symmetry';
import type { Vec } from '../src/core/shape/shape';

const sq: Vec[] = [
  [10, 10],
  [-10, 10],
  [-10, -10],
  [10, -10],
];
describe('symmetric dragging', () => {
  it('does nothing extra without symmetry', () => {
    expect(dragSymmetric(sq, 0, [20, 15], { x: false, y: false }, 2)[1]).toEqual([-10, 10]);
  });
  it('mirrors across X, Y and both', () => {
    const x = dragSymmetric(sq, 0, [20, 15], { x: true, y: false }, 2);
    expect(x[1]).toEqual([-20, 15]);
    expect(x[3]).toEqual([10, -10]);
    const b = dragSymmetric(sq, 0, [20, 15], { x: true, y: true }, 2);
    expect(b[1]).toEqual([-20, 15]);
    expect(b[3]).toEqual([20, -15]);
    expect(b[2]).toEqual([-20, -15]);
  });
  it('keeps on-axis vertices on the axis', () => {
    const v: Vec[] = [
      [0, 10],
      [10, 0],
      [0, -10],
      [-10, 0],
    ];
    const r = dragSymmetric(v, 0, [5, 20], { x: true, y: false }, 2);
    expect(r[0]).toEqual([0, 20]);
  });
});
