import { loadStlFile } from './modelActions';
import { openProjectFile } from './projectManager';

/** Open an STL (into the current project) or a project zip (as a project of its own), decided by the file name. */
export async function openFile(file: File): Promise<void> {
  if (/\.zip$/i.test(file.name)) await openProjectFile(file);
  else await loadStlFile(file);
}
