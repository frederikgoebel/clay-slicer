import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  /** one paragraph per entry */
  message: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** red confirm button, for things that cannot be undone */
  danger?: boolean;
}

interface ConfirmState {
  pending: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  ask: (o: ConfirmOptions) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  pending: null,
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().pending?.resolve(false);
      set({ pending: { ...o, resolve } });
    }),
  answer: (ok) => {
    const p = get().pending;
    set({ pending: null });
    p?.resolve(ok);
  },
}));

/** Ask the person to confirm something, in a proper dialog (never the browser's own). */
export const confirmDialog = (o: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().ask(o);
