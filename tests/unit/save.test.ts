import { describe, expect, test } from 'vitest';
import {
  defaultBindings,
  findConflicts,
  keyLabel,
  sanitizeBindings,
  usesCtrl,
} from '../../src/input/bindings';
import {
  applyLayouts,
  defaultSave,
  emptyRecord,
  ghostKey,
  migrate,
  sanitizeSave,
  SAVE_VERSION,
} from '../../src/save/SaveSystem';
import { defaultSettings, motionProfile, sanitizeSettings } from '../../src/settings/settings';

describe('Evolve / Pure', () => {
  test('Evolve is the default mode; a broken value falls back to it', () => {
    expect(defaultSettings.gameMode).toBe('evolve');
    expect(sanitizeSettings({ gameMode: 'pure' }).gameMode).toBe('pure');
    expect(sanitizeSettings({ gameMode: 'cheat' }).gameMode).toBe('evolve');
  });
  test('Evolve bests load, repair and reset with the course layout', () => {
    const s = sanitizeSave({
      version: SAVE_VERSION,
      levels: { awakening: { best: 50, evolveBest: 30 }, x: { evolveBest: -4 } },
    });
    expect(s.levels.awakening.evolveBest).toBe(30);
    expect(s.levels.x.evolveBest).toBeNull();
    s.levels.awakening.layout = 1;
    applyLayouts(s, { awakening: 2 });
    expect(s.levels.awakening.evolveBest).toBeNull();
    expect(emptyRecord().evolveBest).toBeNull();
  });
});

describe('settings', () => {
  test('unknown keys are dropped and out-of-range values are clamped', () => {
    const s = sanitizeSettings({
      fov: 500,
      sensitivity: -3,
      volMaster: 'loud',
      preset: 'potato',
      hacked: true,
    });
    expect(s.fov).toBe(120);
    expect(s.sensitivity).toBe(0.1);
    expect(s.volMaster).toBe(defaultSettings.volMaster);
    expect(s.preset).toBe('auto');
    expect('hacked' in s).toBe(false);
  });

  test('reduce motion removes bob, shake and screen distortion', () => {
    const m = motionProfile({ ...defaultSettings, reduceMotion: true });
    expect(m.headBob).toBe(0);
    expect(m.shake).toBe(0);
    expect(m.screenFx).toBe(false);
    expect(m.roll).toBeLessThan(0.3);
    expect(motionProfile(defaultSettings).headBob).toBe(1);
  });

  test('master motion intensity scales every movement effect and keeps the individual sliders', () => {
    const half = motionProfile({ ...defaultSettings, motionIntensity: 0.5 });
    expect(half.headBob).toBeCloseTo(0.5);
    expect(half.roll).toBeCloseTo(0.5);
    expect(half.shake).toBeCloseTo(0.5);
    expect(half.speedFov).toBeCloseTo(0.5);
    expect(half.speedLines).toBeCloseTo(0.5);
    expect(half.armSway).toBeCloseTo(0.5);
    expect(half.landing).toBeCloseTo(0.5);
    // the individual sliders still apply on top of the master
    const fine = motionProfile({ ...defaultSettings, motionIntensity: 0.5, headBob: 0.5, armSway: 0.4 });
    expect(fine.headBob).toBeCloseTo(0.25);
    expect(fine.armSway).toBeCloseTo(0.2);
    // zero turns everything off, including screen distortion
    const off = motionProfile({ ...defaultSettings, motionIntensity: 0 });
    expect(
      off.headBob + off.roll + off.shake + off.speedFov + off.speedLines + off.armSway + off.landing,
    ).toBe(0);
    expect(off.screenFx).toBe(false);
    // above 100% is allowed
    expect(motionProfile({ ...defaultSettings, motionIntensity: 1.5 }).headBob).toBeCloseTo(1.5);
  });

  test('reduce motion still wins over a high master intensity', () => {
    const m = motionProfile({ ...defaultSettings, motionIntensity: 1.5, reduceMotion: true });
    expect(m.headBob).toBe(0);
    expect(m.shake).toBe(0);
    expect(m.screenFx).toBe(false);
    expect(m.armSway).toBeLessThan(0.6);
    expect(m.landing).toBeLessThan(0.7);
    expect(m.intensity).toBeLessThanOrEqual(0.4);
  });

  test('new motion settings are clamped and repaired from storage', () => {
    const s = sanitizeSettings({ motionIntensity: 9, armSway: -3 });
    expect(s.motionIntensity).toBe(1.5);
    expect(s.armSway).toBe(0);
    expect(sanitizeSettings({ motionIntensity: 'x' }).motionIntensity).toBe(1);
  });
});

describe('bindings', () => {
  test('slide defaults away from Ctrl (Ctrl+W closes the tab)', () => {
    expect(usesCtrl(defaultBindings)).toBe(false);
    expect(defaultBindings.slide).toContain('KeyC');
  });
  test('conflicts are detected', () => {
    expect(findConflicts(defaultBindings, 'Space', 'dash')).toEqual(['jump']);
    expect(findConflicts(defaultBindings, 'Space', 'jump')).toEqual([]);
  });
  test('broken bindings fall back to defaults', () => {
    const b = sanitizeBindings({ jump: 'Space', dash: ['KeyF'] });
    expect(b.jump).toEqual(defaultBindings.jump);
    expect(b.dash).toEqual(['KeyF']);
    expect(b.forward).toEqual(defaultBindings.forward);
  });
  test('key labels', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Space')).toBe('SPACE');
    expect(keyLabel(undefined)).toBe('—');
  });
});

describe('save data', () => {
  test('a version 1 save migrates forward without losing progress', () => {
    const v1 = {
      version: 1,
      settings: { fov: 100 },
      levels: {
        awakening: {
          best: 61.2,
          splits: [0, 9.5],
          medal: 2,
          collectibles: ['a1'],
          objectives: [],
          completions: 3,
        },
      },
      achievements: { awakened: 123 },
      equipped: { suit: 'aurora', trail: 'pulse', lines: 'classic' },
      totals: {
        runs: 3,
        deaths: 9,
        distance: 1500,
        dashes: 20,
        wallTime: 12,
        slideDistance: 80,
        playTime: 300,
        topSpeed: 24,
      },
    };
    const s = sanitizeSave(v1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.levels.awakening.best).toBe(61.2);
    expect(s.levels.awakening.medal).toBe(2);
    expect(s.equipped.suit).toBe('aurora');
    expect(s.equipped.hud).toBe('ion');
    expect(s.totals.longestWallChain).toBe(0);
    expect(s.settings.fov).toBe(100);
    expect(s.achievements.awakened).toBe(123);
  });

  test('migrate tags saves that have no version', () => {
    expect(migrate({}).version).toBe(SAVE_VERSION);
  });

  test('garbage input yields a clean default save', () => {
    for (const bad of [null, 42, 'x', [], { levels: 'nope', totals: null }]) {
      const s = sanitizeSave(bad);
      expect(s.version).toBe(SAVE_VERSION);
      expect(s.settings).toEqual(defaultSettings);
      expect(s.levels).toEqual({});
    }
  });

  test('corrupt level records are repaired', () => {
    const s = sanitizeSave({
      ...defaultSave(),
      levels: { x: { best: -5, medal: 99, splits: 'a', collectibles: [1, 'c'], completions: -2 } },
    });
    expect(s.levels.x).toEqual({
      best: null,
      splits: [],
      medal: 4,
      collectibles: ['c'],
      objectives: [],
      completions: 0,
      layout: 1,
      evolveBest: null,
    });
  });
});

describe('rebuilt courses (layout versions)', () => {
  const played = () => {
    const s = defaultSave();
    s.levels.momentum = {
      ...emptyRecord(),
      best: 45.2,
      splits: [10, 20],
      medal: 3,
      collectibles: ['m1', 'm2'],
      objectives: ['mo-clean'],
      completions: 7,
    };
    s.levels.awakening = { ...emptyRecord(), best: 40, medal: 3, completions: 2 };
    s.achievements['momentum-done'] = 123;
    return s;
  };

  test('records from before layouts existed load as layout 1', () => {
    const raw = played() as any;
    delete raw.levels.momentum.layout;
    expect(sanitizeSave(raw).levels.momentum.layout).toBe(1);
  });

  test('a rebuilt course loses its best time, splits and medal; the rest is kept', () => {
    const s = played();
    const reset = applyLayouts(s, { momentum: 2, awakening: 1 });
    expect(reset).toEqual(['momentum']);
    const r = s.levels.momentum;
    expect(r.best).toBeNull();
    expect(r.splits).toEqual([]);
    expect(r.medal).toBe(0);
    expect(r.layout).toBe(2);
    expect(r.collectibles).toEqual(['m1', 'm2']);
    expect(r.objectives).toEqual(['mo-clean']);
    expect(r.completions).toBe(7);
    expect(s.achievements['momentum-done']).toBe(123);
    // untouched courses keep everything
    expect(s.levels.awakening.best).toBe(40);
    expect(s.levels.awakening.medal).toBe(3);
  });

  test('it happens once: a best set on the new layout survives the next start-up', () => {
    const s = played();
    applyLayouts(s, { momentum: 2 });
    s.levels.momentum.best = 58.1;
    s.levels.momentum.medal = 3;
    const again = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(applyLayouts(again, { momentum: 2 })).toEqual([]);
    expect(again.levels.momentum.best).toBe(58.1);
  });

  test('ghosts are keyed per layout (unchanged courses keep their old key)', () => {
    expect(ghostKey('awakening')).toBe('awakening');
    expect(ghostKey('awakening', 1)).toBe('awakening');
    expect(ghostKey('momentum', 2)).toBe('momentum@2');
  });
});
