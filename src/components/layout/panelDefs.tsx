import type { ComponentType } from 'react';
import type { PanelId } from '../../store/layoutStore';
import { ModelTab } from '../panels/ModelTab';
import { ProjectTab } from '../panels/ProjectTab';
import { ProfilesTab } from '../panels/ProfilesTab';
import { TexturesPanel } from '../panels/TexturesPanel';

/** The content of every dockable panel. */
export const PANEL_CONTENT: Record<PanelId, ComponentType> = {
  project: ProjectTab,
  profiles: ProfilesTab,
  model: ModelTab,
  textures: TexturesPanel,
};
