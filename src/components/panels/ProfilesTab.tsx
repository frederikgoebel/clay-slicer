import { useId, useState } from 'react';
import { exportAllProfiles, importProfileFile } from '../../actions/profileActions';
import { PROFILE_KINDS, type ProfileKind } from '../../domain/profiles';
import { useActiveProfile, useBeadSummary } from '../../hooks/useProfiles';
import { useSettingsStore } from '../../store/settingsStore';
import { resetEverything } from '../../actions/profileActions';
import { confirmDialog } from '../../store/confirmStore';
import { useLayoutStore } from '../../store/layoutStore';
import { Button, Section } from '../ui/controls';
import { PrintPanel } from './PrintPanel';
import { ProfileDialog } from './ProfileDialog';
import styles from './panels.module.css';

const KIND_LABELS = [
  ['printer', 'Printer'],
  ['nozzle', 'Nozzle'],
  ['clay', 'Clay'],
] as const satisfies readonly (readonly [ProfileKind, string])[];

/** The three active profiles at a glance, with the bead width they add up to. */
function ActiveSetup({ onEdit }: { onEdit: (kind: ProfileKind) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const fileId = useId();
  const select = useSettingsStore((s) => s.selectProfile);
  const profiles = useSettingsStore((s) => s.profiles);
  const selected = useSettingsStore((s) => s.selected);
  const bead = useBeadSummary();
  const clayColor = useActiveProfile('clay').color;
  return (
    <Section title="Active setup" defaultOpen>
      {PROFILE_KINDS.map((kind) => (
        <label key={kind} className={styles.setupRow}>
          <span>
            {kind === 'clay' && (
              <i className={styles.swatch} style={{ background: clayColor }} aria-hidden="true" />
            )}
            {KIND_LABELS.find(([k]) => k === kind)?.[1]}
          </span>
          <select value={selected[kind]} onChange={(e) => select(kind, e.target.value)}>
            {profiles[kind].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.builtin ? '' : ' ★'}
              </option>
            ))}
          </select>
          <Button small onClick={() => onEdit(kind)} title={`Edit the ${kind} profile`}>
            Edit
          </Button>
        </label>
      ))}
      <dl className={styles.derived}>
        <dt>Line width</dt>
        <dd>
          <strong>{bead.width.toFixed(2)} mm</strong>
          <small> calculated</small>
        </dd>
        <dt>Extrusion</dt>
        <dd>
          {bead.rateCm3Min.toFixed(1)} cm³/min at {bead.speed} mm/s
        </dd>
        <dt>Layer height</dt>
        <dd>
          {bead.layerHeight} mm · nozzle {bead.nozzle} mm
        </dd>
      </dl>
      <div className={styles.profileActions}>
        <Button
          small
          onClick={exportAllProfiles}
          title="Save all the printer, nozzle and clay profiles you made as one JSON file"
        >
          Export profiles
        </Button>
        <label
          className={styles.fileBtn}
          htmlFor={fileId}
          title="Add profiles from a JSON file made by “Export profiles”"
        >
          Import profiles…
        </label>
        <input
          id={fileId}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importProfileFile(file).then(setMessage);
            e.target.value = '';
          }}
        />
      </div>
      {message && <p className={styles.hint}>{message}</p>}
      <p className={styles.hint}>
        Profiles are plain JSON files. The three profiles in use also travel inside every project
        you download, so a project opens with the same setup.
      </p>
    </Section>
  );
}

export function ProfilesTab() {
  const [editing, setEditing] = useState<ProfileKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const resetLayout = useLayoutStore((s) => s.reset);

  return (
    <>
      <ActiveSetup onEdit={setEditing} />
      {editing && <ProfileDialog kind={editing} onClose={() => setEditing(null)} />}
      <PrintPanel />
      <Section title="Reset">
        <div className={styles.profileActions}>
          <Button
            small
            onClick={() =>
              void confirmDialog({
                title: 'Reset everything?',
                message: [
                  'Your own profiles are removed, the print settings go back to the defaults, and all textures with their painted masks and decals are removed. The model is kept.',
                ],
                confirmLabel: 'Reset everything',
                danger: true,
              }).then((ok) => {
                if (!ok) return;
                resetEverything();
                setMessage('Everything is back to the defaults.');
              })
            }
            title="Built-in profiles only, default print settings, no textures"
          >
            Reset all
          </Button>
          <Button small onClick={resetLayout} title="Put the panels back where they started">
            Reset panel layout
          </Button>
        </div>
        {message && <p className={styles.hint}>{message}</p>}
        <p className={styles.hint}>
          “Reset all” removes your own profiles, restores the print settings and removes all
          textures with their painted masks and decals. The model is kept.
        </p>
      </Section>
    </>
  );
}
