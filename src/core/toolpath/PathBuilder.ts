import { estimateWidth } from './bead';
import type { SliceSettings } from '../types';

/** Collects toolpath points; converts to typed arrays at the end. */
export class PathBuilder {
  readonly xyz: number[] = [];
  readonly feature: number[] = [];
  readonly speed: number[] = [];
  readonly width: number[] = [];
  readonly overhang: number[] = [];
  readonly dwell: number[] = [];

  /** index of the first point after the floor, where an optional pause goes; -1 = none */
  pauseAt = -1;

  private lastSpeed = NaN;
  private lastWidth = 0;

  constructor(private readonly s: SliceSettings) {}

  get count(): number {
    return this.feature.length;
  }

  /** Estimated bead width at a speed (cached: speed is constant over a whole ring). */
  widthAt(speed: number): number {
    if (speed !== this.lastSpeed) {
      this.lastSpeed = speed;
      this.lastWidth = estimateWidth(this.s, speed);
    }
    return this.lastWidth;
  }

  push(
    x: number,
    y: number,
    z: number,
    feature: number,
    speed: number,
    overhang = 0,
    dwell = 0,
  ): void {
    this.xyz.push(x, y, z);
    this.feature.push(feature);
    this.speed.push(speed);
    this.width.push(this.widthAt(speed));
    this.overhang.push(overhang);
    this.dwell.push(dwell);
  }
}
