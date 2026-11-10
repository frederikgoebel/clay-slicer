import type { ReactNode } from 'react';
import { exportActiveProfile } from '../../actions/profileActions';
import type { ProfileKind, ProfileMap } from '../../domain/profiles';
import { useActiveProfile } from '../../hooks/useProfiles';
import { useSettingsStore } from '../../store/settingsStore';
import { Button } from '../ui/controls';
import { Slider } from '../ui/Slider';
import type { FieldDef } from './profileFields';
import styles from './panels.module.css';

interface Props<K extends ProfileKind> {
  kind: K;
  fields: FieldDef<ProfileMap[K]>[];
  /** extra controls below the numeric fields (G-code boxes, derived readouts) */
  children?: ReactNode;
}

/** Edit the active profile of one kind: name, copy / delete / export, and its values. */
export function ProfileEditor<K extends ProfileKind>({ kind, fields, children }: Props<K>) {
  const profiles = useSettingsStore((s) => s.profiles[kind]) as ProfileMap[K][];
  const active = useActiveProfile(kind);
  const select = useSettingsStore((s) => s.selectProfile);
  const patch = useSettingsStore((s) => s.patchProfile);
  const duplicate = useSettingsStore((s) => s.duplicateProfile);
  const remove = useSettingsStore((s) => s.deleteProfile);

  return (
    <div className={styles.editor}>
      <div className={styles.profileHead}>
        <select
          aria-label={`${kind} profile`}
          value={active.id}
          onChange={(e) => select(kind, e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.builtin ? '' : ' ★'}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.profileActions}>
        <Button small onClick={() => duplicate(kind)} title="Duplicate as your own profile">
          Copy
        </Button>
        <Button small onClick={() => exportActiveProfile(kind)} title="Download as a JSON file">
          Export
        </Button>
        <Button
          small
          disabled={active.builtin}
          onClick={() => remove(kind)}
          title={active.builtin ? 'Built-in profiles cannot be deleted' : 'Delete this profile'}
        >
          Delete
        </Button>
      </div>
      {active.builtin ? (
        <p className={styles.hint}>
          Built-in starting point. Changing a value saves your own copy.
        </p>
      ) : (
        <input
          type="text"
          aria-label="Profile name"
          value={active.name}
          onChange={(e) => patch(kind, { name: e.target.value } as never)}
        />
      )}
      {kind === 'clay' && (
        <label className={styles.colorRow}>
          <span>Colour</span>
          <input
            type="color"
            aria-label="Clay colour"
            value={(active as ProfileMap['clay']).color}
            onChange={(e) => patch(kind, { color: e.target.value } as never)}
          />
          <small>Shown on the model and in the print preview. Does not change the print.</small>
        </label>
      )}
      {(['gcode', 'analysis'] as const).map((usage) => {
        const list = fields.filter((f) => f.usage === usage);
        if (!list.length && !(usage === 'gcode' && children)) return null;
        return (
          <fieldset key={usage} className={styles.group}>
            <legend className={usage === 'gcode' ? styles.tagGcode : styles.tagAnalysis}>
              {usage === 'gcode' ? 'Used in the G-code' : 'Analysis only'}
            </legend>
            <p className={styles.groupNote}>
              {usage === 'gcode'
                ? 'These change the toolpath, speeds or extrusion that are written to the file.'
                : 'Only used for estimates, warnings and the preview. The G-code is the same without them.'}
            </p>
            {list.map((f) => (
              <Slider
                key={f.key}
                label={f.label}
                value={active[f.key] as number}
                min={f.min}
                max={f.max}
                step={f.step}
                unit={f.unit}
                hint={f.hint}
                onChange={(v) => patch(kind, { [f.key]: v } as never)}
              />
            ))}
            {usage === 'gcode' && children}
          </fieldset>
        );
      })}
    </div>
  );
}
