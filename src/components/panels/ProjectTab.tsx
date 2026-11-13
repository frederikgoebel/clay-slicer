import { useEffect, useId, useRef } from 'react';
import {
  deleteStoredProject,
  downloadAllProjects,
  downloadStoredProject,
  duplicateStoredProject,
  newProject,
  openProjectFile,
  openStoredProject,
  uploadProjects,
} from '../../actions/projectManager';
import { validIcon } from '../../domain/projectIcon';
import type { ProjectMeta } from '../../domain/projectLibrary';
import { useProjectStore } from '../../store/projectStore';
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

/** The project tab: one list of the projects kept in this browser, with new / open on top. */
export function ProjectTab() {
  const id = useProjectStore((s) => s.id);
  const library = useProjectStore((s) => s.library);
  const fileId = useId();
  const uploadId = useId();

  return (
    <div className={styles.projectTab}>
      <p className={styles.projectNote}>
        Projects are stored in this browser only. Download the ones you want to keep.
      </p>
      <div className={styles.projectMain}>
        <Button variant="primary" onClick={() => void newProject()}>
          New project
        </Button>
        <label
          className={styles.fileBtn}
          htmlFor={fileId}
          title="Open a project file. If it brings printer, nozzle or clay profiles you do not have, you are asked whether to import them."
        >
          Open file…
        </label>
        <input
          id={fileId}
          type="file"
          accept=".zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openProjectFile(file);
            e.target.value = '';
          }}
        />
      </div>
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
            title="Add project files, or a zip from “Download all”, to this list without opening them"
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
      {library.length === 0 && (
        <p className={styles.hint}>
          Nothing yet. A project appears here as soon as it has a model.
        </p>
      )}
      <ul className={styles.projectList}>
        {library.map((p) => (
          <li key={p.id} className={p.id === id ? styles.projectCurrent : undefined}>
            <div className={styles.projectHead}>
              <ProjectIcon icon={p.icon} />
              <div>
                <div className={styles.projectName}>
                  {p.name}
                  {p.id === id && <em> (open)</em>}
                </div>
                <div className={styles.projectMeta}>
                  {when(p.updatedAt)} · {kb(p.size)}
                </div>
              </div>
            </div>
            <div className={styles.profileActions}>
              <Button small disabled={p.id === id} onClick={() => void openStoredProject(p.id)}>
                Open
              </Button>
              <Button
                small
                title="Make a copy of this project under a new name"
                onClick={() => void duplicateStoredProject(p.id)}
              >
                Duplicate
              </Button>
              <Button small onClick={() => void downloadStoredProject(p.id)}>
                Download
              </Button>
              <Button
                small
                onClick={() => {
                  if (window.confirm(`Delete "${p.name}" from this browser?`))
                    void deleteStoredProject(p.id);
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
