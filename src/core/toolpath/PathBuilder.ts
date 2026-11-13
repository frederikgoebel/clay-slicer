import { actualArea, estimateWidth, widthFromArea } from './bead';
import type { SliceSettings } from '../types';

/** Collects toolpath points; converts to typed arrays at the end. */
export class PathBuilder {
  readonly xyz: number[] = [];
  readonly feature: number[] = [];
  readonly speed: number[] = [];
  readonly width: number[] = [];
  readonly overhang: number[] = [];
  readonly dwell: number[] = [];
  readonly lift: number[] = [];
  readonly thick: number[] = [];
  readonly flow: number[] = [];

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
    lift = 0,
    thick = this.s.layerHeight,
    flow = 1,
  ): void {
    this.xyz.push(x, y, z);
    this.feature.push(feature);
    this.speed.push(speed);
    this.width.push(
      flow === 1
        ? this.widthAt(speed)
        : widthFromArea(actualArea(this.s, speed) * flow, this.s.layerHeight),
    );
    this.overhang.push(overhang);
    this.dwell.push(dwell);
    this.lift.push(lift);
    this.thick.push(thick);
    this.flow.push(flow);
  }
}
