import type { FloorPattern, PrintMode } from '../../core/types';
import { useSettingsStore } from '../../store/settingsStore';
import { SelectField, Section, Toggle } from '../ui/controls';
import { Slider } from '../ui/Slider';

const MODES: readonly (readonly [PrintMode, string])[] = [
  ['spiral', 'Spiral (vase mode)'],
  ['layered', 'Layered rings'],
];

const FLOOR_PATTERNS: readonly (readonly [FloorPattern, string])[] = [
  ['spiral', 'Spiral'],
  ['lines', 'Lines (turn 90° each layer)'],
  ['grid', 'Grid (both directions each layer)'],
];

export function PrintPanel() {
  const print = useSettingsStore((s) => s.print);
  const setPrint = useSettingsStore((s) => s.setPrint);
  return (
    <>
      <Section title="Print" defaultOpen>
        <SelectField
          label="Mode"
          value={print.mode}
          options={MODES}
          onChange={(mode) => setPrint({ mode })}
        />
        <Slider
          label="Start angle"
          value={print.seamAngle}
          min={0}
          max={359}
          step={1}
          unit="°"
          hint="Where each revolution begins (hides the seam)"
          onChange={(seamAngle) => setPrint({ seamAngle })}
        />
        <Slider
          label="Path resolution"
          value={print.segLen}
          min={0.5}
          max={6}
          step={0.1}
          unit="mm"
          hint="Distance between G-code points. Smaller = smoother and a bigger file."
          onChange={(segLen) => setPrint({ segLen })}
        />
        <Toggle
          label="Flat finishing ring at the top"
          checked={print.topFinish}
          onChange={(topFinish) => setPrint({ topFinish })}
        />
      </Section>
      <Section title="Floor">
        <Slider
          label="Floor layers"
          value={print.floorLayers}
          min={0}
          max={10}
          hint="0 = no floor (open bottom, the wall starts on the bed)"
          step={1}
          onChange={(floorLayers) => setPrint({ floorLayers })}
        />
        {print.floorLayers > 0 && (
          <SelectField
            label="Pattern"
            value={print.floorPattern}
            options={FLOOR_PATTERNS}
            onChange={(floorPattern) => setPrint({ floorPattern })}
          />
        )}
        {print.floorLayers > 0 && print.floorPattern !== 'spiral' && (
          <Slider
            label="Line angle"
            value={print.floorAngle}
            min={0}
            max={90}
            step={5}
            unit="°"
            onChange={(floorAngle) => setPrint({ floorAngle })}
          />
        )}
        <Slider
          label="Line spacing"
          value={print.floorSpacingPct}
          min={50}
          max={130}
          step={1}
          unit="% of width"
          onChange={(floorSpacingPct) => setPrint({ floorSpacingPct })}
        />
      </Section>
    </>
  );
}
