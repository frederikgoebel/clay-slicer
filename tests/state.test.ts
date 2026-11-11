import { beforeEach, describe, expect, it } from 'vitest';
import { angleU, createMask, invertMask, sampleMask, stampBrush } from '../src/core/textures/mask';
import { BUILTIN_PROFILES, DEFAULT_SELECTION } from '../src/domain/profiles';
import { activeProfile, useSettingsStore } from '../src/store/settingsStore';

describe('painted masks', () => {
  it('stamps a round brush on the surface and erases it again', () => {
    const m = createMask(0);
    stampBrush(m, 30, 0, 50, 10, 100, false); // at angle 0 => u = 0.5
    expect(sampleMask(m, 0.5, 0.5)).toBeGreaterThan(0.95);
    expect(sampleMask(m, 0.5, 0.9)).toBe(0);
    expect(sampleMask(m, 0.0, 0.5)).toBe(0);
    stampBrush(m, 30, 0, 50, 10, 100, true);
    expect(sampleMask(m, 0.5, 0.5)).toBe(0);
  });

  it('wraps around the seam of the angle axis', () => {
    const m = createMask(0);
    stampBrush(m, -30, 0.001, 50, 10, 100, false); // atan2 ~ pi => u ~ 1.0 / 0.0
    expect(sampleMask(m, 0.999, 0.5)).toBeGreaterThan(0.8);
    expect(sampleMask(m, 0.001, 0.5)).toBeGreaterThan(0.8);
    expect(angleU(1, 0)).toBeCloseTo(0.5);
  });

  it('inverts', () => {
    const m = invertMask(createMask(0));
    expect(m.data[0]).toBe(255);
  });
});

describe('profile store', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      profiles: {
        printer: [...BUILTIN_PROFILES.printer],
        nozzle: [...BUILTIN_PROFILES.nozzle],
        clay: [...BUILTIN_PROFILES.clay],
      },
      selected: { ...DEFAULT_SELECTION },
    });
  });

  it('forks a built-in profile on first edit, then edits the copy', () => {
    const s = useSettingsStore.getState();
    s.patchProfile('clay', { printSpeed: 42 });
    let st = useSettingsStore.getState();
    const forked = activeProfile(st, 'clay');
    expect(forked.builtin).toBe(false);
    expect(forked.printSpeed).toBe(42);
    expect(st.profiles.clay.length).toBe(BUILTIN_PROFILES.clay.length + 1);
    // the built-in is untouched
    expect(BUILTIN_PROFILES.clay[0].printSpeed).toBe(35);

    st.patchProfile('clay', { flow: 110 });
    st = useSettingsStore.getState();
    expect(st.profiles.clay.length).toBe(BUILTIN_PROFILES.clay.length + 1);
    expect(activeProfile(st, 'clay').flow).toBe(110);
  });

  it('deletes only user profiles', () => {
    const s = useSettingsStore.getState();
    s.deleteProfile('nozzle'); // built-in: ignored
    expect(useSettingsStore.getState().profiles.nozzle.length).toBe(BUILTIN_PROFILES.nozzle.length);
    s.duplicateProfile('nozzle');
    expect(useSettingsStore.getState().profiles.nozzle.length).toBe(
      BUILTIN_PROFILES.nozzle.length + 1,
    );
    useSettingsStore.getState().deleteProfile('nozzle');
    const st = useSettingsStore.getState();
    expect(st.profiles.nozzle.length).toBe(BUILTIN_PROFILES.nozzle.length);
    expect(st.selected.nozzle).toBe(DEFAULT_SELECTION.nozzle);
  });
});

describe('settings migration', () => {
  it('turns a v1 nozzle line width into an extrusion rate', async () => {
    const { useSettingsStore } = await import('../src/store/settingsStore');
    const opts = useSettingsStore.persist.getOptions();
    const out = opts.migrate!(
      { profiles: { nozzle: [{ id: 'n', layerHeight: 2, lineWidth: 4 }] } },
      1,
    ) as { profiles: { nozzle: Record<string, number>[] } };
    // area(4,2) = 2*2 + pi = 7.14 mm2 at 30 mm/s = 214 mm3/s... = 12.9 cm3/min
    expect(out.profiles.nozzle[0].extrusionRate).toBeCloseTo(12.9, 1);
    expect(out.profiles.nozzle[0].lineWidth).toBeUndefined();
  });
});
