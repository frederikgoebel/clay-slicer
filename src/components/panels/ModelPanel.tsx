import { PRINT_FIELDS as F } from '../../domain/printLabels';
import { useModelStore } from '../../store/modelStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Section } from '../ui/controls';
import { Slider } from '../ui/Slider';

export function ModelPanel() {
  const drawn = useModelStore((s) => s.source === 'design');
  const print = useSettingsStore((s) => s.print);
  const setPrint = useSettingsStore((s) => s.setPrint);
  return (
    <Section title="Model" defaultOpen>
      <Slider
        label={F.scalePct.label}
        value={print.scalePct}
        min={10}
        max={400}
        step={1}
        unit="%"
        hint="Fired (final) size relative to the STL. Shrinkage compensation is added on top."
        onChange={(scalePct) => setPrint({ scalePct })}
      />
      {!drawn && (
        <>
          <Slider
            label={F.rotX.label}
            value={print.rotX}
            min={-180}
            max={180}
            step={1}
            unit="°"
            hint="Turns the model around the X axis before printing, in degrees."
            onChange={(rotX) => setPrint({ rotX })}
          />
          <Slider
            label={F.rotY.label}
            value={print.rotY}
            min={-180}
            max={180}
            step={1}
            unit="°"
            hint="Turns the model around the Y axis before printing, in degrees."
            onChange={(rotY) => setPrint({ rotY })}
          />
          <Slider
            label={F.rotZ.label}
            value={print.rotZ}
            min={-180}
            max={180}
            step={1}
            unit="°"
            hint="Turns the model around the vertical axis, in degrees. Changes where the start (seam) of each layer sits relative to the model."
            onChange={(rotZ) => setPrint({ rotZ })}
          />
        </>
      )}
    </Section>
  );
}
