import { create } from 'zustand';
import type { ProfileAction, ProfileKind } from '../domain/profiles';

export interface ProfileChange {
  kind: ProfileKind;
  name: string;
  action: Exclude<ProfileAction, { kind: 'same' }>;
}

export type ProfileChoice = 'import' | 'skip' | 'cancel';

/** A project that was opened with profiles this browser does not have yet: waiting for the person's answer. */
interface AskState {
  pending: {
    project: string;
    changes: ProfileChange[];
    resolve: (c: ProfileChoice) => void;
  } | null;
  ask: (project: string, changes: ProfileChange[]) => Promise<ProfileChoice>;
  answer: (c: ProfileChoice) => void;
}

export const useAskStore = create<AskState>()((set, get) => ({
  pending: null,
  ask: (project, changes) =>
    new Promise<ProfileChoice>((resolve) => {
      get().pending?.resolve('cancel');
      set({ pending: { project, changes, resolve } });
    }),
  answer: (c) => {
    const p = get().pending;
    set({ pending: null });
    p?.resolve(c);
  },
}));
