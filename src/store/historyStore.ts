import { create } from 'zustand';
import { MASK_H, MASK_W } from '../core/textures/mask';
import type { ShapeSection } from '../core/shape/shape';
import type { Mask, TextureLayer } from '../core/types';
import { diffDocs, History, type Doc } from '../domain/history';
import type { PrintSettings } from '../domain/print';
import { describeChanges } from './changeLabels';
import { PROFILE_KINDS, type ProfileKind, type ProfileMap } from '../domain/profiles';
import { useMaskStore } from './maskStore';
import { useModelStore } from './modelStore';
import { useSettingsStore } from './settingsStore';

/**
 * Undo / redo for everything that defines the print: print settings, textures, profiles, painted
 * masks and the drawn shape. The stores are flattened into a key/value document; see
 * `domain/history.ts` for how steps are recorded and undone individually.
 */
const history = new History();

type MaskCache = { obj: Mask; version: number; copy: Uint8Array };
let maskCache = new Map<string, MaskCache>();

function maskCopies(): Map<string, Uint8Array> {
  const { masks, version } = useMaskStore.getState();
  const next = new Map<string, MaskCache>();
  const out = new Map<string, Uint8Array>();
  for (const [id, m] of Object.entries(masks)) {
    const c = maskCache.get(id);
    const hit = c && c.obj === m && c.version === version ? c : null;
    const entry = hit ?? { obj: m, version, copy: Uint8Array.from(m.data) };
    next.set(id, entry);
    out.set(id, entry.copy);
  }
  maskCache = next;
  return out;
}

const NOT_TRACKED = new Set(['id', 'mask', 'image', 'maskImage']);

function snapshot(): Doc {
  const d: Doc = new Map();
  const s = useSettingsStore.getState();
  for (const [k, v] of Object.entries(s.print)) d.set(`print.${k}`, v);
  d.set(
    'texOrder',
    s.textures.map((t) => t.id),
  );
  for (const t of s.textures)
    for (const [k, v] of Object.entries(t))
      if (!NOT_TRACKED.has(k)) d.set(`texture.${t.id}.${k}`, v);
  for (const kind of PROFILE_KINDS) {
    d.set(
      `profileOrder.${kind}`,
      s.profiles[kind].map((p) => p.id),
    );
    for (const p of s.profiles[kind]) d.set(`profile.${kind}.${p.id}`, p);
    d.set(`selected.${kind}`, s.selected[kind]);
  }
  const m = useModelStore.getState();
  if (m.shape) {
    d.set('shape.twist', m.shape.twist);
    d.set(
      'shape.order',
      m.shape.sections.map((s) => s.id),
    );
    for (const s of m.shape.sections) {
      d.set(`shape.sec.${s.id}.z`, s.z);
      d.set(`shape.sec.${s.id}.verts`, s.verts);
      d.set(`shape.sec.${s.id}.corner`, s.corner);
      d.set(`shape.sec.${s.id}.circle`, s.circle);
      d.set(`shape.sec.${s.id}.rot`, s.rot);
    }
  }
  for (const [id, copy] of maskCopies()) d.set(`mask.${id}`, copy);
  return d;
}

let prev: Doc = new Map();
let applying = false;

/** Push a document into the stores. */
function applyDoc(doc: Doc): void {
  applying = true;
  try {
    const old = useSettingsStore.getState();
    const print = { ...old.print } as Record<string, unknown>;
    for (const k of Object.keys(print)) {
      const key = `print.${k}`;
      if (doc.has(key)) print[k] = doc.get(key);
    }
    const ids = (doc.get('texOrder') as string[] | undefined) ?? [];
    const textures = ids.map((id) => {
      const t: Record<string, unknown> = { id, mask: null, image: null, maskImage: null };
      const pre = `texture.${id}.`;
      for (const [k, v] of doc) if (k.startsWith(pre)) t[k.slice(pre.length)] = v;
      return t as unknown as TextureLayer;
    });
    const profiles = { ...old.profiles };
    const selected = { ...old.selected };
    for (const kind of PROFILE_KINDS) {
      const order = (doc.get(`profileOrder.${kind}`) as string[] | undefined) ?? [];
      (profiles[kind] as ProfileMap[ProfileKind][]) = order
        .map((id) => doc.get(`profile.${kind}.${id}`) as ProfileMap[ProfileKind] | undefined)
        .filter((p): p is ProfileMap[ProfileKind] => p !== undefined);
      selected[kind] = (doc.get(`selected.${kind}`) as string | undefined) ?? selected[kind];
    }
    useSettingsStore.setState({
      print: print as unknown as PrintSettings,
      textures,
      profiles,
      selected,
    });

    const masks: Record<string, Mask> = {};
    for (const [k, v] of doc)
      if (k.startsWith('mask.') && v instanceof Uint8Array)
        masks[k.slice(5)] = { width: MASK_W, height: MASK_H, data: Uint8Array.from(v) };
    useMaskStore.getState().replaceAll(masks);

    const order = doc.get('shape.order') as string[] | undefined;
    const model = useModelStore.getState();
    if (order && model.source === 'design') {
      const sections = order.map((id): ShapeSection => ({
        id,
        z: doc.get(`shape.sec.${id}.z`) as number,
        verts: doc.get(`shape.sec.${id}.verts`) as ShapeSection['verts'],
        corner: doc.get(`shape.sec.${id}.corner`) as number,
        circle: (doc.get(`shape.sec.${id}.circle`) ?? null) as ShapeSection['circle'],
        rot: doc.get(`shape.sec.${id}.rot`) as number,
      }));
      model.updateShape({ sections, twist: (doc.get('shape.twist') as number | undefined) ?? 0 });
    }
  } finally {
    applying = false;
  }
  prev = snapshot();
}

// ---- view model for React ----
export interface HistoryItem {
  id: number;
  label: string;
  detail: string;
  icons: string[];
  t: number;
  active: boolean;
  overridden: boolean;
}

interface HistoryView {
  items: HistoryItem[];
  canUndo: boolean;
  canRedo: boolean;
}

export const useHistoryStore = create<HistoryView>()(() => ({
  items: [],
  canUndo: false,
  canRedo: false,
}));

function publish(): void {
  useHistoryStore.setState({
    items: history.entries.map((e) => ({
      id: e.id,
      label: e.label,
      detail: e.detail,
      icons: e.icons,
      t: e.t,
      active: e.active,
      overridden: history.isOverridden(e),
    })),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  });
}

let lastLoad = 0;

function changed(): void {
  if (applying) return;
  const load = useModelStore.getState().loadCount;
  if (load !== lastLoad) {
    // a different model (or a design just started): old shape steps no longer mean anything
    lastLoad = load;
    history.forget((k) => k.startsWith('shape.'));
    const snap = snapshot();
    for (const k of [...prev.keys()]) if (k.startsWith('shape.')) prev.delete(k);
    for (const [k, v] of snap) if (k.startsWith('shape.')) prev.set(k, v);
    publish();
  }
  const next = snapshot();
  const diff = diffDocs(prev, next);
  if (diff.size === 0) return;
  history.record(diff, (c) => describeChanges(c, next), Date.now());
  prev = next;
  publish();
}

function commit(result: Map<string, unknown> | null): void {
  if (!result) return;
  const doc = new Map(prev);
  for (const [k, v] of result) {
    if (v === undefined) doc.delete(k);
    else doc.set(k, v);
  }
  applyDoc(doc);
  publish();
}

export const undo = () => commit(history.undo());
export const redo = () => commit(history.redo());
/** Switch one step off (or back on) without touching the steps after it. */
export const toggleStep = (id: number) => commit(history.toggle(id));

let started = false;
/** Start recording changes. Call once at startup, after the stores are hydrated. */
export function startHistory(): void {
  if (started) return;
  started = true;
  prev = snapshot();
  lastLoad = useModelStore.getState().loadCount;
  useSettingsStore.subscribe(changed);
  useMaskStore.subscribe(changed);
  useModelStore.subscribe((s, p) => {
    if (s.shape !== p.shape || s.loadCount !== p.loadCount) changed();
  });
}
