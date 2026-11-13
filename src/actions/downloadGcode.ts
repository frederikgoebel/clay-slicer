import { buildGcode } from '../core/gcode/gcode';
import { isBlockingWarning } from '../core/toolpath/verify';
import { useProjectStore } from '../store/projectStore';
import { useSliceStore } from '../store/sliceStore';
import { safeName, saveBlob } from './files';

/**
 * G-code for the latest slice, or null when there is none (or the person backs out of a
 * blocking warning).
 */
export function makeGcode(): string | null {
  const { result, usedSettings } = useSliceStore.getState();
  if (!result || !usedSettings) return null;
  const blocking = result.warnings.filter(isBlockingWarning);
  if (blocking.length && !window.confirm(`${blocking.join('\n')}\n\nDownload anyway?`)) return null;
  return buildGcode(result, usedSettings, useProjectStore.getState().name);
}

/** Build G-code from the latest slice and hand it to the browser as a file download. */
export function downloadGcode(): void {
  const gcode = makeGcode();
  if (gcode === null) return;
  saveBlob(gcode, `${safeName(useProjectStore.getState().name)}.gcode`, 'text/plain');
}
