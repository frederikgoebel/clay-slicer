import type { ShapeSection } from '../core/shape/shape';
import type { TextureType } from '../core/types';
import type { Change, Description, Doc } from '../domain/history';
import { TEXTURE_NAMES } from '../domain/print';
import { PRINT_FIELDS, PRINT_VALUE_NAMES } from '../domain/printLabels';
import { BLENDS, FIELDS } from '../domain/textureFields';
import { CLAY_FIELDS, NOZZLE_FIELDS, PRINTER_FIELDS } from '../components/panels/profileFields';
import type { PrintSettings } from '../domain/print';
import type { ProfileKind } from '../domain/profiles';

/**
 * Names and values for the change list, taken from the same label tables the editor panels use,
 * so "Floor layers 2 → 5" reads exactly like the slider that was moved.
 */
const round = (n: number) => String(Math.round(n * 100) / 100);

export function fmt(v: unknown, unit?: string, names?: Record<string, string>): string {
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'number') {
    const n = round(v);
    if (!unit) return n;
    return unit.length === 1 && unit !== 's' ? `${n}${unit}` : `${n} ${unit}`;
  }
  if (typeof v === 'string') return names?.[v] ?? v;
  return v === undefined || v === null ? '–' : '…';
}

const arrow = (c: Change, unit?: string, names?: Record<string, string>) =>
  `${fmt(c.before, unit, names)} → ${fmt(c.after, unit, names)}`;

const KIND_NAMES: Record<ProfileKind, string> = {
  printer: 'Printer',
  nozzle: 'Nozzle',
  clay: 'Clay',
};
const PROFILE_DEFS = { printer: PRINTER_FIELDS, nozzle: NOZZLE_FIELDS, clay: CLAY_FIELDS } as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const meanOf = (a?: unknown) => {
  if (!(a instanceof Uint8Array) || a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
};

function describePrint(key: string, c: Change): Description {
  const k = key as keyof PrintSettings;
  const f = PRINT_FIELDS[k];
  return {
    label: f?.label ?? key,
    detail: arrow(c, f?.unit, PRINT_VALUE_NAMES[k]),
    icons: ['print'],
  };
}

function describeTexture(
  id: string,
  field: string,
  c: Change,
  next: Doc,
  prev: Map<string, Change>,
) {
  const type = (next.get(`texture.${id}.type`) ?? prev.get(`texture.${id}.type`)?.before) as
    TextureType | undefined;
  const name = type ? TEXTURE_NAMES[type] : 'Texture';
  let label: string;
  let detail: string;
  switch (field) {
    case 'enabled':
      label = 'Enabled';
      detail = arrow(c);
      break;
    case 'from':
    case 'to':
    case 'solidFrom':
    case 'solid':
      label = 'Height range';
      detail = `${
        { from: 'start', solidFrom: 'full from', solid: 'full until', to: 'end' }[field]
      } ${arrow(c, '%')}`;
      break;
    case 'blend':
      label = 'Blend';
      detail = arrow(c, undefined, Object.fromEntries(BLENDS));
      break;
    case 'invert':
      label = 'Invert';
      detail = arrow(c);
      break;
    case 'curveV':
      label = 'Outdent over height';
      detail = 'curve edited';
      break;
    case 'curveA':
      label = 'Outdent around';
      detail = 'curve edited';
      break;
    default: {
      const def = type ? FIELDS[type].find((f) => f.key === field) : undefined;
      label = def?.label ?? field;
      detail = arrow(c, def?.unit);
    }
  }
  return { label: `${name}: ${label}`, detail, icons: ['texture'] };
}

function describeShape(changes: Map<string, Change>, next: Doc): Description | null {
  const keys = [...changes.keys()].filter((k) => k.startsWith('shape.'));
  if (keys.length === 0) return null;
  const orderChange = changes.get('shape.order');
  const nameOf = (id: string) => {
    const order = ((next.get('shape.order') as string[] | undefined) ??
      (orderChange?.before as string[] | undefined) ??
      []) as string[];
    const i = order.indexOf(id);
    return i >= 0 ? `P${i + 1}` : 'Section';
  };
  if (orderChange) {
    const b = (orderChange.before as string[] | undefined) ?? [];
    const a = (orderChange.after as string[] | undefined) ?? [];
    if (a.length > b.length && b.length === 0)
      return { label: 'Start design', detail: '', icons: ['add'] };
    if (a.length > b.length)
      return {
        label: `Add section ${nameOf(a.find((x) => !b.includes(x)) ?? '')}`,
        detail: '',
        icons: ['add', 'move'],
      };
    if (a.length < b.length) {
      const gone = b.indexOf(b.find((x) => !a.includes(x)) ?? '');
      return { label: `Delete section P${gone + 1}`, detail: '', icons: ['remove'] };
    }
  }
  const ids = new Set<string>();
  for (const k of keys) {
    const m = /^shape\.sec\.([^.]+)\./.exec(k);
    if (m) ids.add(m[1]);
  }
  const twist = changes.get('shape.twist');
  if (ids.size === 0 && twist)
    return { label: 'Twist', detail: arrow(twist, '°'), icons: ['twist'] };
  const parts: string[] = [];
  const icons = new Set<string>();
  for (const id of ids) {
    const get = (f: string) => changes.get(`shape.sec.${id}.${f}`);
    const z = get('z');
    const verts = get('verts') as
      { before: [number, number][]; after: [number, number][] } | undefined;
    const circle = get('circle') as
      { before: ShapeSection['circle']; after: ShapeSection['circle'] } | undefined;
    const corner = get('corner');
    const rot = get('rot');
    if (z) {
      parts.push(`Z ${arrow(z, 'mm')}`);
      icons.add('height');
    }
    if (circle) {
      const b = circle.before;
      const a = circle.after;
      if (b && a) {
        if (b.cx !== a.cx || b.cy !== a.cy) {
          parts.push(`moved ${round(a.cx - b.cx)}, ${round(a.cy - b.cy)} mm`);
          icons.add('move');
        }
        if (b.r !== a.r) {
          parts.push(`Radius ${arrow({ before: b.r, after: a.r }, 'mm')}`);
          icons.add('scale');
        }
      } else {
        parts.push(`Perfect circle ${a ? 'on' : 'off'}`);
        icons.add('circle');
      }
    }
    if (verts && !(circle && circle.before && circle.after)) {
      const b = verts.before;
      const a = verts.after;
      if (b && a && b.length !== a.length) {
        parts.push(`Points ${b.length} → ${a.length}`);
        icons.add('points');
      } else if (b && a) {
        const cen = (v: [number, number][]) =>
          [
            v.reduce((s, p) => s + p[0], 0) / v.length,
            v.reduce((s, p) => s + p[1], 0) / v.length,
          ] as const;
        const [bx, by] = cen(b);
        const [ax, ay] = cen(a);
        const rad = (v: [number, number][], cx: number, cy: number) =>
          v.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / v.length;
        const rb = rad(b, bx, by);
        const ra = rad(a, ax, ay);
        const dx = ax - bx;
        const dy = ay - by;
        const scaled = rb > 0 && Math.abs(ra / rb - 1) > 0.002;
        const moved = Math.hypot(dx, dy) > 0.05;
        if (moved) {
          parts.push(`moved ${round(dx)}, ${round(dy)} mm`);
          icons.add('move');
        }
        if (scaled) {
          parts.push(`scaled ×${round(ra / rb)}`);
          icons.add('scale');
        }
        if (!moved && !scaled) {
          parts.push('points moved');
          icons.add('points');
        }
      }
    }
    if (corner) {
      parts.push(`Corner radius ${arrow(corner, 'mm')}`);
      icons.add('corner');
    }
    if (rot) {
      parts.push(`Layer rotation ${arrow(rot, '°')}`);
      icons.add('rotate');
    }
  }
  if (twist) {
    parts.push(`Twist ${arrow(twist, '°')}`);
    icons.add('twist');
  }
  const names = [...ids].map(nameOf);
  return {
    label:
      names.length === 1 ? names[0] : names.length > 1 ? `Layers ${names.join(', ')}` : 'Design',
    detail: parts.join(', '),
    icons: [...icons],
  };
}

function describeProfile(kind: ProfileKind, c: Change): Description {
  const before = c.before as Record<string, unknown> | undefined;
  const after = c.after as Record<string, unknown> | undefined;
  const icons = ['profile'];
  if (!before && after)
    return {
      label: `New ${kind} profile`,
      detail: String(after.name ?? ''),
      icons: ['profile', 'add'],
    };
  if (before && !after)
    return {
      label: `Delete ${kind} profile`,
      detail: String(before.name ?? ''),
      icons: ['profile', 'remove'],
    };
  const o = before ?? {};
  const n = after ?? {};
  const diff = Object.keys(n).filter((k) => !same(o[k], n[k]));
  const nm = String(n.name ?? '');
  if (diff.length === 1) {
    const k = diff[0];
    const def = (
      PROFILE_DEFS[kind] as readonly { key: string; label: string; unit?: string }[]
    ).find((f) => f.key === k);
    const label =
      def?.label ??
      { name: 'Name', color: 'Colour', startGcode: 'Start G-code', endGcode: 'End G-code' }[k] ??
      k;
    const detail =
      typeof n[k] === 'string' && String(n[k]).length > 24
        ? 'edited'
        : arrow({ before: o[k], after: n[k] }, def?.unit);
    return { label: `${KIND_NAMES[kind]} “${nm}”: ${label}`, detail, icons };
  }
  return { label: `${KIND_NAMES[kind]} “${nm}”`, detail: `${diff.length} settings changed`, icons };
}

function describeMask(id: string, c: Change, next: Doc, prev: Map<string, Change>): Description {
  const type = (next.get(`texture.${id}.type`) ?? prev.get(`texture.${id}.type`)?.before) as
    TextureType | undefined;
  const name = type ? TEXTURE_NAMES[type] : 'texture';
  let detail = 'painted';
  if (c.before === undefined) detail = 'mask started';
  else if (c.after === undefined) detail = 'applies everywhere again';
  else if (meanOf(c.after) < meanOf(c.before)) detail = 'erased';
  return { label: `Paint mask: ${name}`, detail, icons: ['brush'] };
}

/** Text and icons for one step, from the keys it changed. */
export function describeChanges(changes: Map<string, Change>, next: Doc): Description {
  const parts: Description[] = [];
  const order = changes.get('texOrder');
  if (order) {
    const b = (order.before as string[] | undefined) ?? [];
    const a = (order.after as string[] | undefined) ?? [];
    const typeOf = (id: string) => {
      const t = (next.get(`texture.${id}.type`) ?? changes.get(`texture.${id}.type`)?.before) as
        TextureType | undefined;
      return t ? TEXTURE_NAMES[t] : 'texture';
    };
    if (a.length > b.length)
      return {
        label: `Add texture: ${typeOf(a.find((x) => !b.includes(x)) ?? '')}`,
        detail: '',
        icons: ['texture', 'add'],
      };
    if (a.length < b.length)
      return {
        label: `Remove texture: ${typeOf(b.find((x) => !a.includes(x)) ?? '')}`,
        detail: '',
        icons: ['texture', 'remove'],
      };
    parts.push({ label: 'Reorder textures', detail: '', icons: ['texture', 'reorder'] });
  }
  const shape = describeShape(changes, next);
  if (shape) parts.push(shape);
  for (const [k, c] of changes) {
    if (k.startsWith('print.')) parts.push(describePrint(k.slice(6), c));
    else if (k.startsWith('texture.')) {
      const [, id, field] = k.split('.');
      parts.push(describeTexture(id, field, c, next, changes));
    } else if (k.startsWith('mask.')) parts.push(describeMask(k.slice(5), c, next, changes));
    else if (k.startsWith('selected.')) {
      const kind = k.slice(9) as ProfileKind;
      const p = next.get(`profile.${kind}.${String(c.after)}`) as { name?: string } | undefined;
      parts.push({
        label: KIND_NAMES[kind],
        detail: p?.name ?? String(c.after),
        icons: ['profile', 'select'],
      });
    } else if (k.startsWith('profile.')) {
      parts.push(describeProfile(k.split('.')[1] as ProfileKind, c));
    }
  }
  if (parts.length === 0)
    return { label: `Several changes (${changes.size})`, detail: '', icons: [] };
  if (parts.length === 1) return parts[0];
  const icons = [...new Set(parts.flatMap((p) => p.icons))];
  const allPrint = parts.every((p) => p.icons.includes('print'));
  if (allPrint)
    return {
      label: `${parts.length} print settings`,
      detail: parts.map((p) => p.label).join(', '),
      icons,
    };
  const sameTexture = parts.every(
    (p) => p.label.split(': ')[0] === parts[0].label.split(': ')[0] && p.icons.includes('texture'),
  );
  if (sameTexture)
    return {
      label: `${parts[0].label.split(': ')[0]}`,
      detail: [...new Set(parts.map((p) => p.label.split(': ')[1]))].join(', '),
      icons,
    };
  return { label: `${parts.length} changes`, detail: parts.map((p) => p.label).join(', '), icons };
}
