import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/core/toolpath/pipeline';
import { defaultShape } from '../src/core/shape/shape';
import { createMask } from '../src/core/textures/mask';
import { newTexture, DEFAULT_PRINT } from '../src/domain/print';
import { exportProfiles, parseProfiles } from '../src/domain/profileIO';
import { readProject, writeProject } from '../src/domain/project';
import { BUILTIN_PROFILES, mergeProfiles } from '../src/domain/profiles';
import { buildBeadMesh, RING } from '../src/components/viewport/beadGeometry';
import { cylinder, testSettings } from './helpers';

const active = {
  printer: BUILTIN_PROFILES.printer[0],
  nozzle: BUILTIN_PROFILES.nozzle[1],
  clay: BUILTIN_PROFILES.clay[0],
};

describe('project file', () => {
  it('round-trips model, profiles, textures and masks', () => {
    const tex = newTexture('ribs');
    const mask = createMask(0);
    mask.data[1234] = 200;
    const raw = cylinder(10, 20);
    const zip = writeProject({
      name: 'vase',
      raw,
      shape: { ...defaultShape(), twist: 30 },
      profiles: active,
      print: { ...DEFAULT_PRINT, scalePct: 80 },
      textures: [tex],
      masks: { [tex.id]: mask },
      images: { [tex.id]: { width: 2, height: 2, data: Uint8Array.from([1, 2, 3, 4]) } },
    });
    const back = readProject(zip);
    expect(back.name).toBe('vase');
    expect(back.shape?.twist).toBe(30);
    expect(back.shape?.sections.length).toBe(defaultShape().sections.length);
    expect(back.shape?.sections[1].verts.length).toBe(12);
    expect(back.raw?.length).toBe(raw.length);
    expect(back.print.scalePct).toBe(80);
    expect(back.textures[0].id).toBe(tex.id);
    expect(back.masks[tex.id].data[1234]).toBe(200);
    expect(Array.from(back.images[tex.id].data)).toEqual([1, 2, 3, 4]);
    expect(back.profiles.nozzle.extrusionRate).toBe(active.nozzle.extrusionRate);
    expect(back.profiles.nozzle.id).toBe(active.nozzle.id);
  });
  it('rejects things that are not projects', () => {
    expect(() => readProject(new Uint8Array([1, 2, 3]))).toThrow(/zip/);
  });
});

describe('profile files', () => {
  it('round-trips and validates', () => {
    const text = exportProfiles({ nozzle: [BUILTIN_PROFILES.nozzle[0]] });
    const back = parseProfiles(text);
    expect(back.nozzle?.[0].extrusionRate).toBe(BUILTIN_PROFILES.nozzle[0].extrusionRate);
    expect(back.nozzle?.[0].builtin).toBe(false);
    expect(() => parseProfiles('{"a":1}')).toThrow(/profile file/);
    expect(() => parseProfiles('nope')).toThrow(/JSON/);
  });
  it('falls back to defaults for bad fields', () => {
    const bad = JSON.stringify({
      format: 'clay-slicer-profiles',
      version: 1,
      profiles: { nozzle: [{ id: 'x', name: 'n', diameter: 'big', extrusionRate: 7 }] },
    });
    const n = parseProfiles(bad).nozzle![0];
    expect(typeof n.diameter).toBe('number');
    expect(n.extrusionRate).toBe(7);
  });
  it('never overwrites a different profile with the same id', () => {
    const a = BUILTIN_PROFILES.nozzle[0];
    const same = mergeProfiles([a], [{ ...a, builtin: false }]);
    expect(same.list.length).toBe(1);
    const changed = mergeProfiles([a], [{ ...a, builtin: false, extrusionRate: 99 }]);
    expect(changed.list.length).toBe(2);
    expect(changed.idMap[a.id]).not.toBe(a.id);
  });
});

describe('bead mesh', () => {
  const s = testSettings();
  const res = runPipeline(cylinder(), s);
  const bead = buildBeadMesh(res, s.layerHeight);
  const pos = bead.geometry.getAttribute('position');

  it('has one ring per point and a section as wide as the calculated bead', () => {
    expect(pos.count).toBe(res.count * RING);
    // wall point in the middle of the path: ring extent perpendicular to the path
    const i = Math.floor(res.count * 0.6);
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let k = 0; k < RING; k++) {
      zMin = Math.min(zMin, pos.getZ(i * RING + k));
      zMax = Math.max(zMax, pos.getZ(i * RING + k));
    }
    expect(zMax - zMin).toBeCloseTo(s.layerHeight, 1);
    expect(zMax).toBeCloseTo(res.xyz[3 * i + 2], 1);
  });
  it('faces outward (triangle normals agree with vertex normals)', () => {
    const idx = bead.geometry.index!;
    const nor = bead.geometry.getAttribute('normal');
    let agree = 0;
    const samples = 200;
    for (let q = 0; q < samples; q++) {
      const t = Math.floor(((q + 0.5) / samples) * (idx.count / 3));
      const [a, b, c] = [idx.getX(3 * t), idx.getX(3 * t + 1), idx.getX(3 * t + 2)];
      const e1 = [b, a].map((v) => [pos.getX(v), pos.getY(v), pos.getZ(v)]);
      const e2 = [c, a].map((v) => [pos.getX(v), pos.getY(v), pos.getZ(v)]);
      const u = e1[0].map((v, k) => v - e1[1][k]);
      const w = e2[0].map((v, k) => v - e2[1][k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const dot = n[0] * nor.getX(a) + n[1] * nor.getY(a) + n[2] * nor.getZ(a);
      if (dot > 0) agree++;
    }
    expect(agree).toBeGreaterThan(samples * 0.95);
  });
  it('clips by layer', () => {
    const half = bead.indexCountForPoints(Math.floor(res.count / 2));
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(bead.indexCountForPoints(res.count));
  });
});
