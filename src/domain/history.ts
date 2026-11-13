/**
 * Change history that allows undoing any single step, not only the latest one.
 *
 * The document is a flat map of keys to values. Every step records, per key it touched, the value
 * before and after. Whether a step is applied is just a flag: the value of a key is the `after` of
 * the newest applied step that touched it, or its original value when none is applied. So undoing
 * an old step leaves all later steps in place (they still win for the keys they changed), and a
 * step can be re-applied the same way.
 */
export type Doc = Map<string, unknown>;

export interface Change {
  before: unknown;
  after: unknown;
}

/** How a step is shown in the list. `icons` names what kind of change it was. */
export interface Description {
  label: string;
  detail: string;
  icons: string[];
}

export interface HistoryEntry extends Description {
  id: number;
  /** ms timestamp of the last edit merged into this step */
  t: number;
  changes: Map<string, Change>;
  active: boolean;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Keys whose value differs between two documents. */
export function diffDocs(prev: Doc, next: Doc): Map<string, Change> {
  const out = new Map<string, Change>();
  for (const [k, v] of next)
    if (!sameValue(prev.get(k), v)) out.set(k, { before: prev.get(k), after: v });
  for (const [k, v] of prev) if (!next.has(k)) out.set(k, { before: v, after: undefined });
  return out;
}

/** A history as plain JSON plus the binary values (painted masks) it refers to by index. */
export interface SavedHistory {
  json: unknown;
  blobs: Uint8Array[];
}

type Packed = { u: 1 } | { b: number } | { j: unknown };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export class History {
  entries: HistoryEntry[] = [];
  /** steps taken back with Undo, newest last (what Redo re-applies) */
  private redoStack: number[] = [];
  /** values of keys when no remaining step touches them (filled when old steps are dropped) */
  private base = new Map<string, unknown>();
  private nextId = 1;

  constructor(
    private readonly limit = 200,
    private readonly mergeMs = 700,
  ) {}

  /** Drop every step (a different project is being worked on). */
  clear(): void {
    this.entries = [];
    this.redoStack = [];
    this.base = new Map();
  }

  /**
   * Record a step. Quick successive edits of the same keys (a slider drag, one brush stroke)
   * are merged into one step. Returns false when nothing was recorded.
   */
  record(
    changes: Map<string, Change>,
    describe: (changes: Map<string, Change>) => Description,
    now: number,
  ): boolean {
    if (changes.size === 0) return false;
    this.redoStack = [];
    const last = this.entries[this.entries.length - 1];
    if (
      last?.active &&
      now - last.t < this.mergeMs &&
      last.changes.size === changes.size &&
      [...changes.keys()].every((k) => last.changes.has(k))
    ) {
      for (const [k, c] of changes) (last.changes.get(k) as Change).after = c.after;
      last.t = now;
      if ([...last.changes.values()].every((c) => sameValue(c.before, c.after))) this.entries.pop();
      else Object.assign(last, describe(last.changes)); // the text covers the whole merged step
      return true;
    }
    this.entries.push({ id: this.nextId++, t: now, ...describe(changes), changes, active: true });
    while (this.entries.length > this.limit) this.dropOldest();
    return true;
  }

  private dropOldest(): void {
    const e = this.entries.shift();
    if (!e) return;
    for (const [k, c] of e.changes) {
      if (e.active) this.base.set(k, c.after);
      else if (!this.base.has(k)) this.base.set(k, c.before);
    }
  }

  /** Forget everything about some keys (their meaning changed, e.g. a different model was loaded). */
  forget(match: (key: string) => boolean): void {
    for (const e of this.entries)
      for (const k of [...e.changes.keys()]) if (match(k)) e.changes.delete(k);
    this.entries = this.entries.filter((e) => e.changes.size > 0);
    for (const k of [...this.base.keys()]) if (match(k)) this.base.delete(k);
    this.redoStack = this.redoStack.filter((id) => this.entries.some((e) => e.id === id));
  }

  /** The value a key has with the current set of applied steps. */
  resolve(key: string): unknown {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.active && e.changes.has(key)) return (e.changes.get(key) as Change).after;
    }
    if (this.base.has(key)) return this.base.get(key);
    for (const e of this.entries)
      if (e.changes.has(key)) return (e.changes.get(key) as Change).before;
    return undefined;
  }

  /** Flip one step on or off. Returns the keys that now have a different value. */
  toggle(id: number): Map<string, unknown> | null {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return null;
    const old = new Map<string, unknown>();
    for (const k of e.changes.keys()) old.set(k, this.resolve(k));
    e.active = !e.active;
    const out = new Map<string, unknown>();
    for (const k of e.changes.keys()) {
      const v = this.resolve(k);
      if (!sameValue(v, old.get(k))) out.set(k, v);
    }
    return out;
  }

  get canUndo(): boolean {
    return this.entries.some((e) => e.active);
  }

  get canRedo(): boolean {
    return this.redoStack.some((id) => this.entries.some((e) => e.id === id && !e.active));
  }

  /** Take back the newest applied step. */
  undo(): Map<string, unknown> | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (!this.entries[i].active) continue;
      this.redoStack.push(this.entries[i].id);
      return this.toggle(this.entries[i].id) ?? new Map();
    }
    return null;
  }

  redo(): Map<string, unknown> | null {
    while (this.redoStack.length) {
      const id = this.redoStack.pop() as number;
      const e = this.entries.find((x) => x.id === id);
      if (e && !e.active) return this.toggle(id) ?? new Map();
    }
    return null;
  }

  /** True when every key of an applied step has been changed again by a later applied step. */
  isOverridden(e: HistoryEntry): boolean {
    if (!e.active) return false;
    const idx = this.entries.indexOf(e);
    return [...e.changes.keys()].every((k) =>
      this.entries.slice(idx + 1).some((o) => o.active && o.changes.has(k)),
    );
  }

  /** Everything needed to bring this history back later (keeps blobs shared between steps once). */
  save(): SavedHistory {
    const blobs: Uint8Array[] = [];
    const seen = new Map<Uint8Array, number>();
    const pack = (v: unknown): Packed => {
      if (v === undefined) return { u: 1 };
      if (v instanceof Uint8Array) {
        let i = seen.get(v);
        if (i === undefined) {
          i = blobs.length;
          blobs.push(v);
          seen.set(v, i);
        }
        return { b: i };
      }
      return { j: v };
    };
    return {
      blobs,
      json: {
        nextId: this.nextId,
        redo: this.redoStack,
        base: [...this.base].map(([k, v]) => [k, pack(v)]),
        entries: this.entries.map((e) => ({
          id: e.id,
          t: e.t,
          label: e.label,
          detail: e.detail,
          icons: e.icons,
          active: e.active,
          changes: [...e.changes].map(([k, c]) => [k, pack(c.before), pack(c.after)]),
        })),
      },
    };
  }

  /** Replace this history with a saved one. Returns false (and leaves it empty) when it is damaged. */
  restore(saved: SavedHistory): boolean {
    this.clear();
    try {
      const j = saved.json;
      if (!isObj(j) || !Array.isArray(j.entries)) return false;
      const unpack = (p: unknown): unknown => {
        if (!isObj(p)) throw new Error('bad value');
        if ('u' in p) return undefined;
        if ('b' in p) {
          const blob = saved.blobs[p.b as number];
          if (!blob) throw new Error('missing blob');
          return Uint8Array.from(blob);
        }
        return p.j;
      };
      const entries: HistoryEntry[] = [];
      for (const raw of j.entries as unknown[]) {
        if (!isObj(raw) || !Array.isArray(raw.changes)) throw new Error('bad step');
        const changes = new Map<string, Change>();
        for (const c of raw.changes as unknown[][])
          changes.set(String(c[0]), { before: unpack(c[1]), after: unpack(c[2]) });
        entries.push({
          id: Number(raw.id),
          t: Number(raw.t) || 0,
          label: String(raw.label ?? ''),
          detail: String(raw.detail ?? ''),
          icons: Array.isArray(raw.icons) ? raw.icons.map(String) : [],
          active: raw.active !== false,
          changes,
        });
      }
      const base = new Map<string, unknown>();
      if (Array.isArray(j.base))
        for (const b of j.base as unknown[][]) base.set(String(b[0]), unpack(b[1]));
      this.entries = entries;
      this.base = base;
      this.redoStack = Array.isArray(j.redo) ? (j.redo as unknown[]).map(Number) : [];
      this.nextId = Math.max(Number(j.nextId) || 1, ...entries.map((e) => e.id + 1));
      return true;
    } catch {
      this.clear();
      return false;
    }
  }
}
