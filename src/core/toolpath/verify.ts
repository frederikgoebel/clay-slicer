import { FEATURE_TRAVEL, type SliceSettings } from '../types';

/** Sanity checks on the final path, run before G-code download. */
export function verifyToolpath(
  xyz: Float32Array,
  s: Pick<SliceSettings, 'buildDiameter' | 'buildHeight'>,
  feature?: Uint8Array,
): string[] {
  const out: string[] = [];
  const R = s.buildDiameter / 2;
  let maxR = 0;
  let maxZ = 0;
  for (let i = 0; i < xyz.length; i += 3) {
    // travel hops may rise a little above the print; only the printed path is checked for height
    if (feature && feature[i / 3] === FEATURE_TRAVEL) continue;
    maxR = Math.max(maxR, Math.hypot(xyz[i], xyz[i + 1]));
    maxZ = Math.max(maxZ, xyz[i + 2]);
  }
  if (maxR > R)
    out.push(
      `Path leaves the build volume: radius ${maxR.toFixed(1)} mm > ${R} mm. Scale the model down or pick another printer.`,
    );
  if (maxZ > s.buildHeight)
    out.push(`Path is taller than the build volume: ${maxZ.toFixed(1)} mm > ${s.buildHeight} mm.`);
  return out;
}

/** Warnings that make downloading risky (shown in a confirm dialog). */
export const isBlockingWarning = (w: string) => /^Path (leaves|is taller)/.test(w);
