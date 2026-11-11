import { describe, expect, it } from 'vitest';
import { diffDocs, History, type Doc } from '../src/domain/history';

const desc = () => ({ label: 'x', detail: '', icons: [] });
const doc = (o: Record<string, unknown>): Doc => new Map(Object.entries(o));

/** apply step results to a document, like the app does */
function apply(d: Doc, changed: Map<string, unknown> | null): Doc {
  const n = new Map(d);
  for (const [k, v] of changed ?? []) {
    if (v === undefined) n.delete(k);
    else n.set(k, v);
  }
  return n;
}

function setup() {
  const h = new History(200, 0); // no merging
  let d = doc({ a: 1, b: 1, c: 1 });
  const edit = (patch: Record<string, unknown>, t: number) => {
    const next = apply(d, new Map(Object.entries(patch)));
    h.record(diffDocs(d, next), desc, t);
    d = next;
  };
  return { h, edit, get: () => d, set: (x: Doc) => (d = x) };
}

describe('history', () => {
  it('undoes and redoes in order', () => {
    const s = setup();
    s.edit({ a: 2 }, 1);
    s.edit({ a: 3 }, 2);
    s.set(apply(s.get(), s.h.undo()));
    expect(s.get().get('a')).toBe(2);
    s.set(apply(s.get(), s.h.undo()));
    expect(s.get().get('a')).toBe(1);
    expect(s.h.canUndo).toBe(false);
    s.set(apply(s.get(), s.h.redo()));
    s.set(apply(s.get(), s.h.redo()));
    expect(s.get().get('a')).toBe(3);
    expect(s.h.canRedo).toBe(false);
  });

  it('undoes an older step and keeps the later ones', () => {
    const s = setup();
    s.edit({ a: 2 }, 1);
    s.edit({ b: 2 }, 2);
    s.edit({ c: 2 }, 3);
    const first = s.h.entries[0].id;
    s.set(apply(s.get(), s.h.toggle(first)));
    expect([...s.get().values()]).toEqual([1, 2, 2]);
    s.set(apply(s.get(), s.h.toggle(first)));
    expect([...s.get().values()]).toEqual([2, 2, 2]);
  });

  it('a later change to the same key wins over an older undone step', () => {
    const s = setup();
    s.edit({ a: 2 }, 1);
    s.edit({ a: 3 }, 2);
    const [e1, e2] = s.h.entries;
    expect(s.h.isOverridden(e1)).toBe(true);
    s.set(apply(s.get(), s.h.toggle(e1.id)));
    expect(s.get().get('a')).toBe(3);
    // undo the later one: falls back to the original, because step 1 is off
    s.set(apply(s.get(), s.h.toggle(e2.id)));
    expect(s.get().get('a')).toBe(1);
    s.set(apply(s.get(), s.h.toggle(e1.id)));
    expect(s.get().get('a')).toBe(2);
  });

  it('merges quick edits of the same key into one step', () => {
    const h = new History(200, 500);
    let d = doc({ a: 1 });
    for (let i = 2; i <= 6; i++) {
      const n = doc({ a: i });
      h.record(diffDocs(d, n), desc, i * 10);
      d = n;
    }
    expect(h.entries.length).toBe(1);
    expect(apply(d, h.undo()).get('a')).toBe(1);
  });

  it('keeps removed keys restorable', () => {
    const s = setup();
    s.edit({ a: undefined }, 1);
    expect(s.get().has('a')).toBe(false);
    s.set(apply(s.get(), s.h.undo()));
    expect(s.get().get('a')).toBe(1);
  });

  it('drops the oldest steps past the limit without losing the current state', () => {
    const h = new History(3, 0);
    let d = doc({ a: 0 });
    for (let i = 1; i <= 6; i++) {
      const n = doc({ a: i });
      h.record(diffDocs(d, n), desc, i);
      d = n;
    }
    expect(h.entries.length).toBe(3);
    for (let i = 0; i < 3; i++) d = apply(d, h.undo());
    expect(d.get('a')).toBe(3);
    expect(h.canUndo).toBe(false);
  });

  it('clears redo after a new edit', () => {
    const s = setup();
    s.edit({ a: 2 }, 1);
    s.set(apply(s.get(), s.h.undo()));
    s.edit({ b: 5 }, 2);
    expect(s.h.canRedo).toBe(false);
  });
});

describe('merged steps', () => {
  it('describes the whole merged step, not just its last edit', () => {
    const h = new History(200, 500);
    let d = doc({ a: 1 });
    const describe = (c: Map<string, { before: unknown; after: unknown }>) => {
      const x = c.get('a');
      return { label: 'a', detail: `${x?.before} → ${x?.after}`, icons: [] };
    };
    for (let i = 2; i <= 5; i++) {
      const n = doc({ a: i });
      h.record(diffDocs(d, n), describe, i);
      d = n;
    }
    expect(h.entries[0].detail).toBe('1 → 5');
  });
});

describe('forget', () => {
  it('drops the steps that only touched forgotten keys', () => {
    const h = new History(200, 0);
    h.record(diffDocs(doc({ 'shape.a': 1, b: 1 }), doc({ 'shape.a': 2, b: 1 })), desc, 1);
    h.record(diffDocs(doc({ 'shape.a': 2, b: 1 }), doc({ 'shape.a': 2, b: 2 })), desc, 2);
    h.forget((k) => k.startsWith('shape.'));
    expect(h.entries.length).toBe(1);
    expect(h.resolve('shape.a')).toBeUndefined();
  });
});
