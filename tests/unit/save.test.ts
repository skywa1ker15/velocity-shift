import { describe, expect, test } from 'vitest';
import {
  defaultBindings,
  findConflicts,
  keyLabel,
  sanitizeBindings,
  usesCtrl,
} from '../../src/input/bindings';
import { defaultSave, migrate, sanitizeSave, SAVE_VERSION } from '../../src/save/SaveSystem';
import { defaultSettings, motionProfile, sanitizeSettings } from '../../src/settings/settings';

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
    });
  });
});
