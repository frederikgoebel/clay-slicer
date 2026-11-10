import { buildGcode } from '../core/gcode/gcode';
import { isBlockingWarning } from '../core/toolpath/verify';
import { useModelStore } from '../store/modelStore';
import { useSliceStore } from '../store/sliceStore';

/** Build G-code from the latest slice and hand it to the browser as a file download. */
export function downloadGcode(): void {
  const { result, usedSettings } = useSliceStore.getState();
  if (!result || !usedSettings) return;
  const blocking = result.warnings.filter(isBlockingWarning);
  if (blocking.length && !window.confirm(`${blocking.join('\n')}\n\nDownload anyway?`)) return;

  const name = useModelStore.getState().name;
  const gcode = buildGcode(result, usedSettings, name);
  const url = URL.createObjectURL(new Blob([gcode], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.gcode`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
