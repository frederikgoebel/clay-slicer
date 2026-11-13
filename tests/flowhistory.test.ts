import { describe, expect, it } from 'vitest';
import { buildGcode } from '../src/core/gcode/gcode';
import { flowFactor, hasFlow, type TexCtx } from '../src/core/textures/textures';
import { runPipeline } from '../src/core/toolpath/pipeline';
import type { TextureLayer } from '../src/core/types';
import { diffDocs, History } from '../src/domain/history';
import { newTexture } from '../src/domain/print';
import { readProject, writeProject } from '../src/domain/project';
import { BUILTIN_PROFILES } from '../src/domain/profiles';
import { DEFAULT_PRINT } from '../src/domain/print';
import { cylinder, testSettings } from './helpers';

const flowTex = (o: Partial<TextureLayer> = {}): TextureLayer => ({
  ...newTexture('flow'),
  from: 0,
  to: 100,
  solidFrom: 0,
  solid: 100,
  ...o,
});
const ctx = (o: Partial<TexCtx> = {}): TexCtx => ({
  z: 30,
  H: 60,
  t: 0.25,
  idx: 0,
  spacing: 1,
  zStart: 0,
  fadeIn: 0,
  lh: 2,
  u: 0.5,
  v: 0.5,
  ang: 0,
  rad: 20,
  ...o,
});

describe('flow texture', () => {
  it('is 1 without layers and follows the amplitude', () => {
    expect(flowFactor([], ctx())).toBe(1);
    expect(flowFactor([flowTex({ amplitude: 50 })], ctx())).toBeCloseTo(1.5);
    expect(flowFactor([flowTex({ amplitude: -40 })], ctx())).toBeCloseTo(0.6);
    expect(hasFlow([flowTex({ enabled: false })])).toBe(false);
  });
  it('alternates more and less when a count is set', () => {
    const l = flowTex({ amplitude: 30, count: 4 });
    const hi = flowFactor([l], ctx({ t: 1 / 16 }));
    const lo = flowFactor([l], ctx({ t: 3 / 16 }));
    expect(hi).toBeCloseTo(1.3);
    expect(lo).toBeCloseTo(0.7);
  });
  it('fattens the beads and scales the G-code extrusion', () => {
    const base = testSettings({ mode: 'spiral', textures: [] });
    const more = { ...base, textures: [flowTex({ amplitude: 50 })] };
    const a = runPipeline(cylinder(), base);
    const b = runPipeline(cylinder(), more);
    expect(Math.max(...b.flow)).toBeCloseTo(1.5);
    expect(b.stats.volumeCm3).toBeGreaterThan(a.stats.volumeCm3 * 1.2);
    const maxE = (g: string) =>
      Math.max(...[...g.matchAll(/ E(-?[\d.]+)/g)].map((m) => Number(m[1])));
    const ea = maxE(buildGcode(a, base));
    const eb = maxE(buildGcode(b, more));
    expect(eb).toBeGreaterThan(ea * 1.2);
  });
  it('does not move the wall', () => {
    const base = testSettings({ mode: 'spiral', textures: [] });
    const a = runPipeline(cylinder(), base);
    const b = runPipeline(cylinder(), { ...base, textures: [flowTex({ amplitude: 50 })] });
    expect(Array.from(b.xyz)).toEqual(Array.from(a.xyz));
  });
  it('works in standard layers too', () => {
    const s = testSettings({ mode: 'normal', textures: [flowTex({ amplitude: -50 })] });
    const r = runPipeline(cylinder(), s);
    expect(Math.min(...Array.from(r.flow).filter((f) => f > 0))).toBeCloseTo(0.5);
  });
});

describe('history in a file', () => {
  it('round-trips steps, masks and the undo state', () => {
    const h = new History(200, 0);
    const mask = Uint8Array.from([1, 2, 3]);
    h.record(
      diffDocs(
        new Map([['a', 1]]),
        new Map<string, unknown>([
          ['a', 2],
          ['mask.x', mask],
        ]),
      ),
      () => ({ label: 'one', detail: 'd', icons: ['i'] }),
      5,
    );
    h.record(
      diffDocs(new Map([['a', 2]]), new Map([['a', 3]])),
      () => ({ label: 'two', detail: '', icons: [] }),
      6,
    );
    h.undo();
    const g = new History();
    expect(g.restore(h.save())).toBe(true);
    expect(g.entries.map((e) => [e.label, e.active])).toEqual([
      ['one', true],
      ['two', false],
    ]);
    expect(g.resolve('a')).toBe(2);
    expect(g.resolve('mask.x')).toEqual(mask);
    expect(g.canRedo).toBe(true);
    const back = g.redo();
    expect(back?.get('a')).toBe(3);
  });
  it('survives the project zip and ignores damage', () => {
    const h = new History(200, 0);
    h.record(
      diffDocs(
        new Map([['a', 1]]),
        new Map<string, unknown>([
          ['a', 2],
          ['mask.x', Uint8Array.from([9])],
        ]),
      ),
      () => ({ label: 'step', detail: '', icons: [] }),
      1,
    );
    const profiles = {
      printer: BUILTIN_PROFILES.printer[0],
      nozzle: BUILTIN_PROFILES.nozzle[0],
      clay: BUILTIN_PROFILES.clay[0],
    };
    const bytes = writeProject({
      name: 'p',
      raw: cylinder(10, 20),
      shape: null,
      profiles,
      print: DEFAULT_PRINT,
      textures: [],
      masks: {},
      images: {},
      history: h.save(),
    });
    const back = readProject(bytes);
    const g = new History();
    expect(back.history && g.restore(back.history)).toBe(true);
    expect(g.entries[0].label).toBe('step');
    expect(g.resolve('mask.x')).toEqual(Uint8Array.from([9]));
    expect(new History().restore({ json: { entries: [{ changes: 5 }] }, blobs: [] })).toBe(false);
  });
});
