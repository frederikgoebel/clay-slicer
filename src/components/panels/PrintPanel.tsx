import { useSettingsStore } from '../../store/settingsStore';
import {
  FLOOR_PATTERNS,
  INFILL_PATTERNS,
  MODES,
  PRINT_FIELDS as F,
  TOP_CURVES,
} from '../../domain/printLabels';
import { SelectField, Section, Toggle } from '../ui/controls';
import { Slider } from '../ui/Slider';

export function PrintPanel() {
  const print = useSettingsStore((s) => s.print);
  const setPrint = useSettingsStore((s) => s.setPrint);
  return (
    <>
      <Section title="Print" defaultOpen>
        <SelectField
          label={F.mode.label}
          value={print.mode}
          options={MODES}
          onChange={(mode) => setPrint({ mode })}
        />
        <Slider
          label={F.seamAngle.label}
          value={print.seamAngle}
          min={0}
          max={359}
          step={1}
          unit="°"
          hint="Where each revolution begins (hides the seam)"
          onChange={(seamAngle) => setPrint({ seamAngle })}
        />
        <Slider
          label={F.segLen.label}
          value={print.segLen}
          min={0.5}
          max={6}
          step={0.1}
          unit="mm"
          hint="Distance between G-code points. Smaller = smoother and a bigger file."
          onChange={(segLen) => setPrint({ segLen })}
        />
        <Toggle
          label={F.topFinish.label}
          checked={print.topFinish}
          onChange={(topFinish) => setPrint({ topFinish })}
        />
        <SelectField
          label={F.topCurves.label}
          value={print.topCurves}
          options={TOP_CURVES}
          onChange={(topCurves) => setPrint({ topCurves })}
        />
        {print.topCurves !== 'closed' && (
          <Slider
            label={F.topAngle.label}
            value={print.topAngle}
            min={5}
            max={80}
            step={1}
            unit={F.topAngle.unit}
            hint="Surfaces tilted up to this much from flat count as the top (the opening). With open lines they are not printed; with follow the top the layers are stretched to end flush with them."
            onChange={(topAngle) => setPrint({ topAngle })}
          />
        )}
      </Section>
      {print.mode === 'normal' && (
        <Section title="Walls and infill" defaultOpen>
          <Slider
            label={F.wallCount.label}
            value={print.wallCount}
            min={0}
            max={5}
            step={1}
            hint="Concentric wall loops around every outline. The outer one carries the textures. 0 = no walls, only infill (textures then have nothing to act on; needs infill above 0). Loops that would collapse (thin walls) are left out."
            onChange={(wallCount) => setPrint({ wallCount })}
          />
          <Slider
            label={F.infillDensity.label}
            value={print.infillDensity}
            min={0}
            max={100}
            step={1}
            unit={F.infillDensity.unit}
            hint="Lines inside the walls, as a share of the area (0 = hollow). Not used together with open top curves."
            onChange={(infillDensity) => setPrint({ infillDensity })}
          />
          {print.infillDensity > 0 && (
            <>
              <SelectField
                label={F.infillPattern.label}
                value={print.infillPattern}
                options={INFILL_PATTERNS}
                onChange={(infillPattern) => setPrint({ infillPattern })}
              />
              <Slider
                label={F.infillAngle.label}
                value={print.infillAngle}
                min={0}
                max={179}
                step={1}
                unit={F.infillAngle.unit}
                onChange={(infillAngle) => setPrint({ infillAngle })}
              />
              <Slider
                label={F.solidTop.label}
                value={print.solidTop}
                min={0}
                max={10}
                step={1}
                hint="The last layers below the top of the model are filled solid (100%). Only the very top of the model, not ceilings inside it."
                onChange={(solidTop) => setPrint({ solidTop })}
              />
            </>
          )}
        </Section>
      )}
      <Section title="Travel moves">
        <Slider
          label={F.retractDistance.label}
          value={print.retractDistance}
          min={0}
          max={10}
          step={0.5}
          unit={F.retractDistance.unit}
          hint="Clay pulled back (E axis) before a travel move and pushed forward again after it. 0 = off."
          onChange={(retractDistance) => setPrint({ retractDistance })}
        />
        {print.retractDistance > 0 && (
          <Slider
            label={F.retractSpeed.label}
            value={print.retractSpeed}
            min={2}
            max={60}
            step={1}
            unit={F.retractSpeed.unit}
            onChange={(retractSpeed) => setPrint({ retractSpeed })}
          />
        )}
        <Slider
          label={F.zHop.label}
          value={print.zHop}
          min={0}
          max={30}
          step={1}
          unit={F.zHop.unit}
          hint="The nozzle rises this much while it travels between lines or curves."
          onChange={(zHop) => setPrint({ zHop })}
        />
      </Section>
      <Section title="Floor">
        <Slider
          label={F.floorLayers.label}
          value={print.floorLayers}
          min={0}
          max={10}
          hint="0 = no floor (open bottom, the wall starts on the bed)"
          step={1}
          onChange={(floorLayers) => setPrint({ floorLayers })}
        />
        {print.floorLayers > 0 && (
          <SelectField
            label={F.floorPattern.label}
            value={print.floorPattern}
            options={FLOOR_PATTERNS}
            onChange={(floorPattern) => setPrint({ floorPattern })}
          />
        )}
        {print.floorLayers > 0 && print.floorPattern !== 'spiral' && (
          <Slider
            label={F.floorAngle.label}
            value={print.floorAngle}
            min={0}
            max={90}
            step={5}
            unit="°"
            onChange={(floorAngle) => setPrint({ floorAngle })}
          />
        )}
        <Slider
          label={F.floorSpacingPct.label}
          value={print.floorSpacingPct}
          min={50}
          max={200}
          step={1}
          unit={F.floorSpacingPct.unit}
          onChange={(floorSpacingPct) => setPrint({ floorSpacingPct })}
        />
        {print.floorLayers > 0 && (
          <Toggle
            label={F.floorBelow.label}
            checked={print.floorBelow}
            onChange={(floorBelow) => setPrint({ floorBelow })}
          />
        )}
        {print.floorLayers > 0 && (
          <Toggle
            label={F.pauseAfterFloor.label}
            checked={print.pauseAfterFloor}
            onChange={(pauseAfterFloor) => setPrint({ pauseAfterFloor })}
          />
        )}
        {print.floorLayers > 0 && print.pauseAfterFloor && (
          <>
            <Slider
              label={F.pauseSeconds.label}
              value={print.pauseSeconds}
              min={1}
              max={300}
              step={1}
              unit="s"
              onChange={(pauseSeconds) => setPrint({ pauseSeconds })}
            />
            <Slider
              label={F.pauseLift.label}
              value={print.pauseLift}
              min={0}
              max={800}
              step={10}
              unit="mm"
              hint="The nozzle moves up this far (limited by the build height), waits, and comes back"
              onChange={(pauseLift) => setPrint({ pauseLift })}
            />
          </>
        )}
      </Section>
    </>
  );
}
