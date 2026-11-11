import { useState } from 'react';
import {
  circleSection,
  defaultShape,
  makeSection,
  MIN_GAP,
  MIN_VERTS,
  normalizeSections,
  regularPolygon,
  sectionCentre,
  sectionRadius,
  type ShapeSection,
} from '../../core/shape/shape';
import { useModelStore } from '../../store/modelStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Section, Toggle } from '../ui/controls';
import { Slider } from '../ui/Slider';
import { TopView } from './TopView';
import styles from './shape.module.css';

/**
 * Design tab: sections at different heights (each one an outline you draw in the top view)
 * that get lofted into the object. The section list adds/removes/moves sections; the top view
 * edits the selected section's vertices; the 3D view moves whole sections.
 */
export function ShapeEditor() {
  const shape = useModelStore((s) => s.shape);
  const update = useModelStore((s) => s.updateShape);
  const selIdx = useUiStore((s) => s.shapeSection);
  const select = useUiStore((s) => s.setShapeSection);
  const symX = useUiStore((s) => s.symX);
  const symY = useUiStore((s) => s.symY);
  const setSym = useUiStore((s) => s.setSym);
  const showHandles = useUiStore((s) => s.showHandles);
  const setShowHandles = useUiStore((s) => s.setShowHandles);
  const [applyAll, setApplyAll] = useState(false);
  if (!shape) return null;

  const secs = shape.sections;
  const sel = Math.min(selIdx, secs.length - 1);
  const cur = secs[sel];
  const setSections = (next: ShapeSection[]) =>
    update({ ...shape, sections: normalizeSections(next) });
  const patch = (i: number, p: Partial<ShapeSection>) =>
    setSections(secs.map((s, k) => (k === i ? { ...s, ...p } : s)));

  /** A new section halfway between i and i+1: the average outline when both are the same kind. */
  const insertAfter = (i: number) => {
    const a = secs[i];
    const b = secs[i + 1];
    const z = Math.round((a.z + b.z) / 2);
    if (z - a.z < MIN_GAP || b.z - z < MIN_GAP) return;
    const mid = (p: number, q: number) => (p + q) / 2;
    let made: ShapeSection;
    if (a.circle && b.circle) {
      made = circleSection(
        z,
        mid(a.circle.r, b.circle.r),
        mid(a.circle.cx, b.circle.cx),
        mid(a.circle.cy, b.circle.cy),
      );
    } else if (!a.circle && !b.circle && a.verts.length === b.verts.length) {
      made = makeSection(
        z,
        a.verts.map(([x, y], k): [number, number] => [
          mid(x, b.verts[k][0]),
          mid(y, b.verts[k][1]),
        ]),
        mid(a.corner, b.corner),
      );
    } else {
      made = { ...a, z };
    }
    setSections([...secs, { ...made, rot: mid(a.rot, b.rot) }]);
    select(i + 1);
  };

  const regular = (sides: number) => {
    const [cx, cy] = sectionCentre(cur);
    patch(sel, {
      verts: regularPolygon(sides, Math.max(5, sectionRadius(cur)), cx, cy),
      circle: null,
    });
  };

  const setCircle = (on: boolean) => {
    const [cx, cy] = sectionCentre(cur);
    const r = Math.max(5, sectionRadius(cur));
    patch(
      sel,
      on
        ? { circle: { cx, cy, r } }
        : { circle: null, verts: regularPolygon(12, r, cx, cy), corner: cur.corner },
    );
  };

  return (
    <Section title="Design" defaultOpen>
      <p className={styles.hint}>
        Add sections at different heights, shape each one in the top view, and they are lofted into
        the object. You can also drag the section spheres in the 3D view.
      </p>
      <div className={styles.nodes}>
        {secs
          .map((_, n) => secs.length - 1 - n)
          .map((i) => (
            <div key={i}>
              <div className={i === sel ? styles.rowOn : styles.row}>
                <button type="button" className={styles.pick} onClick={() => select(i)}>
                  P{i + 1}
                </button>
                <label className={styles.cell}>
                  <span>Z</span>
                  <input
                    type="number"
                    value={Math.round(secs[i].z * 10) / 10}
                    min={0}
                    disabled={i === 0}
                    onChange={(e) => {
                      const z = e.target.valueAsNumber;
                      if (Number.isFinite(z)) patch(i, { z });
                    }}
                  />
                </label>
                <span className={styles.count}>
                  {secs[i].circle ? 'circle' : `${secs[i].verts.length} pts`}
                </span>
                <button
                  type="button"
                  className={styles.x}
                  disabled={i === 0 || secs.length <= 2}
                  title={i === 0 ? 'The bottom section cannot be deleted' : 'Delete section'}
                  aria-label={`Delete section ${i + 1}`}
                  onClick={() => {
                    update({ ...shape, sections: secs.filter((_, k) => k !== i) });
                    select(Math.max(0, Math.min(sel, secs.length - 2)));
                  }}
                >
                  ×
                </button>
              </div>
              {i > 0 && (
                <button
                  type="button"
                  className={styles.plus}
                  title="Add a section between"
                  aria-label={`Insert section between ${i} and ${i + 1}`}
                  onClick={() => insertAfter(i - 1)}
                >
                  +
                </button>
              )}
            </div>
          ))}
      </div>
      <Toggle label="Show handles in 3D view" checked={showHandles} onChange={setShowHandles} />

      <div className={styles.group}>Section P{sel + 1}: top view</div>
      <TopView />
      {!cur.circle && (
        <>
          <Toggle label="Mirror X (left ↔ right)" checked={symX} onChange={(v) => setSym('x', v)} />
          <Toggle label="Mirror Y (top ↔ bottom)" checked={symY} onChange={(v) => setSym('y', v)} />
        </>
      )}
      <Toggle label="Perfect circle" checked={cur.circle !== null} onChange={setCircle} />
      {!cur.circle && (
        <>
          <Slider
            label="Points"
            value={cur.verts.length}
            min={MIN_VERTS}
            max={24}
            step={1}
            hint="Replaces this outline with a regular polygon. Then drag the points to make it free-form."
            onChange={regular}
          />
          <Slider
            label="Corner radius"
            value={cur.corner}
            min={0}
            max={80}
            step={1}
            unit="mm"
            onChange={(corner) =>
              applyAll ? setSections(secs.map((s) => ({ ...s, corner }))) : patch(sel, { corner })
            }
          />
          <Toggle
            label="Apply corner radius to all sections"
            checked={applyAll}
            onChange={setApplyAll}
          />
        </>
      )}
      {cur.circle && (
        <Slider
          label="Radius"
          value={cur.circle.r}
          min={1}
          max={300}
          step={1}
          unit="mm"
          onChange={(r) => patch(sel, { circle: { ...cur.circle!, r } })}
        />
      )}

      <Slider
        label="Layer rotation"
        value={cur.rot}
        min={-360}
        max={360}
        step={1}
        unit="°"
        hint="Turns this layer about its centre; the layers in between follow smoothly. Drag the ring in the 3D view for the same thing."
        onChange={(rot) => patch(sel, { rot })}
      />

      <div className={styles.group}>Whole shape</div>
      <Slider
        label="Twist"
        value={shape.twist}
        min={-360}
        max={360}
        step={5}
        unit="°"
        onChange={(twist) => update({ ...shape, twist })}
      />
      <div className={styles.rowBtns}>
        <Button
          small
          onClick={() =>
            setSections(
              secs.map((s) => {
                const [cx, cy] = sectionCentre(s);
                return s.circle
                  ? s
                  : { ...s, circle: { cx, cy, r: Math.max(5, sectionRadius(s)) } };
              }),
            )
          }
          title="Turn every section into a perfect circle"
        >
          All circles
        </Button>
        <Button
          small
          onClick={() => {
            update(defaultShape());
            select(0);
          }}
        >
          Reset design
        </Button>
      </div>
    </Section>
  );
}
