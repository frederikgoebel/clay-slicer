import { useEffect, useId, useRef } from 'react';
import {
  deleteStoredProject,
  downloadAllProjects,
  downloadStoredProject,
  duplicateStoredProject,
  newProject,
  openStoredProject,
  uploadProjects,
} from '../../actions/projectManager';
import { validIcon } from '../../domain/projectIcon';
import type { ProjectMeta } from '../../domain/projectLibrary';
import { confirmDialog } from '../../store/confirmStore';
import { useProjectStore } from '../../store/projectStore';
import { MenuButton } from '../ui/Menu';
import { Button } from '../ui/controls';
import styles from './panels.module.css';

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const kb = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;

/** The model as the preview shows it, or a plain box for projects saved before icons existed. */
function ProjectIcon({ icon: stored }: { icon: ProjectMeta['icon'] }) {
  const icon = validIcon(stored);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !icon) return;
    ctx.clearRect(0, 0, icon.width, icon.height);
    ctx.putImageData(new ImageData(icon.rgba, icon.width, icon.height), 0, 0);
  }, [icon]);
  if (!icon)
    return (
      <svg
        className={styles.projectIcon}
        viewBox="0 0 40 40"
        width="40"
        height="40"
        aria-hidden="true"
      >
        <rect
          x="11"
          y="6"
          width="18"
          height="28"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    );
  return (
    <canvas
      ref={ref}
      className={styles.projectIcon}
      width={icon.width}
      height={icon.height}
      aria-hidden="true"
    />
  );
}

/** The project tab: one list of the projects kept in this browser, with new on top. */
export function ProjectTab() {
  const id = useProjectStore((s) => s.id);
  const library = useProjectStore((s) => s.library);
  const persisted = useProjectStore((s) => s.persisted === true);
  const uploadId = useId();

  const askDelete = async (p: ProjectMeta) => {
    const ok = await confirmDialog({
      title: 'Delete project?',
      message: [
        `“${p.name}” will be removed from this browser.`,
        'This cannot be undone. Download it first if you want to keep it.',
      ],
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (ok) void deleteStoredProject(p.id);
  };

  return (
    <div className={styles.projectTab}>
      <Button variant="primary" className={styles.newProject} onClick={() => void newProject()}>
        New project
      </Button>
      <div className={styles.projectBar}>
        <h3>Your projects ({library.length})</h3>
        <span className={styles.projectBarActions}>
          <Button
            small
            disabled={library.length === 0}
            title="Download every project in this browser as one zip"
            onClick={() => void downloadAllProjects()}
          >
            Download all
          </Button>
          <label
            className={styles.fileBtnSmall}
            htmlFor={uploadId}
            title="Add project files, or a zip from “Download all”, to this list. Click a project in the list to open it."
          >
            Upload…
          </label>
          <input
            id={uploadId}
            type="file"
            accept=".zip"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) void uploadProjects(files);
              e.target.value = '';
            }}
          />
        </span>
      </div>
      <p className={styles.projectNote}>
        {persisted
          ? 'Projects are stored in this browser only, and the browser has promised to keep them. Download the ones you want to keep safe.'
          : 'Projects are stored in this browser only, and the browser may delete them if storage runs low. Download the ones you want to keep.'}
      </p>
      {library.length === 0 && (
        <p className={styles.hint}>
          Nothing yet. A project appears here as soon as it has a model.
        </p>
      )}
      <ul className={styles.projectList}>
        {library.map((p) => {
          const current = p.id === id;
          return (
            <li
              key={p.id}
              className={`${styles.projectCard} ${current ? styles.projectCurrent : ''}`}
              role="button"
              tabIndex={0}
              aria-current={current ? 'true' : undefined}
              title={current ? 'This project is open' : `Open “${p.name}”`}
              onClick={() => !current && void openStoredProject(p.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  if (!current) void openStoredProject(p.id);
                }
              }}
            >
              <ProjectIcon icon={p.icon} />
              <div className={styles.projectText}>
                <div className={styles.projectName}>
                  {p.name}
                  {current && <em> (open)</em>}
                </div>
                <div className={styles.projectMeta}>
                  {when(p.updatedAt)} · {kb(p.size)}
                </div>
              </div>
              <MenuButton
                label={`More actions for ${p.name}`}
                items={[
                  {
                    label: 'Duplicate',
                    title: 'Make a copy of this project under a new name',
                    onSelect: () => void duplicateStoredProject(p.id),
                  },
                  {
                    label: 'Download',
                    title: 'Save this project as a file',
                    onSelect: () => void downloadStoredProject(p.id),
                  },
                  { label: 'Delete', danger: true, onSelect: () => void askDelete(p) },
                ]}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
