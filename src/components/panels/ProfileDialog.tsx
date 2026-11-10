import type { ProfileKind } from '../../domain/profiles';
import { useActiveProfile, useBeadSummary } from '../../hooks/useProfiles';
import { useSettingsStore } from '../../store/settingsStore';
import { Modal } from '../ui/Modal';
import { TextAreaField } from '../ui/controls';
import { CLAY_FIELDS, NOZZLE_FIELDS, PRINTER_FIELDS } from './profileFields';
import { ProfileEditor } from './ProfileEditor';
import styles from './panels.module.css';

const TITLES: Record<ProfileKind, string> = {
  printer: 'Edit printer profile',
  nozzle: 'Edit nozzle profile',
  clay: 'Edit clay profile',
};

/** The profile editor as a popup, opened from "Edit" next to the profile in the setup. */
export function ProfileDialog({ kind, onClose }: { kind: ProfileKind; onClose: () => void }) {
  const printer = useActiveProfile('printer');
  const patch = useSettingsStore((s) => s.patchProfile);
  const bead = useBeadSummary();
  return (
    <Modal title={TITLES[kind]} onClose={onClose}>
      {kind === 'printer' && (
        <ProfileEditor kind="printer" fields={PRINTER_FIELDS}>
          <TextAreaField
            label="Start G-code"
            value={printer.startGcode}
            onChange={(startGcode) => patch('printer', { startGcode })}
          />
          <TextAreaField
            label="End G-code"
            value={printer.endGcode}
            onChange={(endGcode) => patch('printer', { endGcode })}
          />
        </ProfileEditor>
      )}
      {kind === 'nozzle' && (
        <ProfileEditor kind="nozzle" fields={NOZZLE_FIELDS}>
          <p className={styles.callout}>
            Calculated line width: <strong>{bead.width.toFixed(2)} mm</strong> (extrusion rate ÷
            speed, spread over the layer height).
          </p>
        </ProfileEditor>
      )}
      {kind === 'clay' && <ProfileEditor kind="clay" fields={CLAY_FIELDS} />}
    </Modal>
  );
}
