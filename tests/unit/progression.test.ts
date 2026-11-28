import { describe, expect, test } from 'vitest';
import { newStats } from '../../src/gameplay/Simulation';
import { levels } from '../../src/levels/registry';
import type { LevelData } from '../../src/levels/types';
import {
  achievements,
  SHARD_COUNT,
  checkAchievements,
  cosmeticFor,
  cosmetics,
  finishRun,
  isUnlocked,
  medalFor,
  nextTarget,
  objectiveDone,
} from '../../src/progression/Progression';
import { defaultSave, type SaveData } from '../../src/save/SaveSystem';

const medals = { bronze: 80, silver: 55, gold: 41, platinum: 35 };
const fakeSaveSystem = (data: SaveData) =>
  ({
    data,
    record: (id: string) =>
      (data.levels[id] ??= {
        best: null,
        splits: [],
        medal: 0,
        collectibles: [],
        objectives: [],
        completions: 0,
        layout: 1,
        evolveBest: null,
        bestScore: 0,
        bestCombo: 0,
      }),
    flush() {},
    save() {},
  }) as any;
const data = (): LevelData => ({
  breakables: [],
  solids: [],
  decor: [],
  entities: [],
  checkpoints: [],
  triggers: [],
  prompts: [],
  collectibles: [
    { id: 'a1', p: [0, 0, 0] },
    { id: 'a2', p: [0, 0, 0] },
    { id: 'a3', p: [0, 0, 0] },
  ],
  shortcuts: [{ id: 'aw-hidden', p: [0, 0, 0], s: [1, 1, 1], hidden: true }],
  finish: { p: [0, 0, 0], s: [1, 1, 1] },
  bot: [],
});
const run = (seconds: number, over: Partial<ReturnType<typeof newStats>> = {}) => ({
  ...newStats(),
  started: true,
  finished: true,
  ticks: seconds * 120,
  ...over,
});

describe('medals', () => {
  test('thresholds', () => {
    expect(medalFor(100, medals)).toBe(0);
    expect(medalFor(80, medals)).toBe(1);
    expect(medalFor(54.9, medals)).toBe(2);
    expect(medalFor(41, medals)).toBe(3);
    expect(medalFor(34.99, medals)).toBe(4);
  });
  test('next target climbs one tier at a time', () => {
    expect(nextTarget(0, medals)).toEqual({ tier: 1, time: 80 });
    expect(nextTarget(3, medals)).toEqual({ tier: 4, time: 35 });
    expect(nextTarget(4, medals)).toBeNull();
  });
});

describe('finishing a run', () => {
  const awakening = levels.find((l) => l.meta.id === 'awakening')!.meta;

  test('first clear records the time, medal, splits and collectibles', () => {
    const save = defaultSave();
    const r = finishRun(
      fakeSaveSystem(save),
      awakening,
      data(),
      run(50, { splits: [0, 10, 20], collected: ['a1'] }),
    );
    expect(r.isRecord).toBe(true);
    expect(r.previousBest).toBeNull();
    expect(r.medal).toBe(medalFor(50, awakening.medals));
    expect(save.levels.awakening.best).toBe(50);
    expect(save.levels.awakening.splits).toEqual([0, 10, 20]);
    expect(save.levels.awakening.collectibles).toEqual(['a1']);
    expect(save.levels.awakening.completions).toBe(1);
    expect(r.newAchievements.map((a) => a.id)).toContain('awakened');
    expect(r.nextLevelId).toBe('verticality');
  });

  test('an Evolve run never sets the medal, the Pure best or splits, and keeps its own best', () => {
    const save = defaultSave();
    const sys = fakeSaveSystem(save);
    finishRun(sys, awakening, data(), run(60, { splits: [0, 30] }));
    const evo = { pickups: 9, byKind: { glint: 7 }, peakTier: 3, stage: 2, abilities: [], synergies: [] };
    const r = finishRun(sys, awakening, data(), run(20, { splits: [0, 5] }), evo);
    expect(r.mode).toBe('evolve');
    expect(r.medal).toBe(0);
    expect(r.isRecord).toBe(false);
    expect(save.levels.awakening.best).toBe(60);
    expect(save.levels.awakening.splits).toEqual([0, 30]);
    expect(save.levels.awakening.medal).toBe(medalFor(60, awakening.medals));
    expect(save.levels.awakening.evolveBest).toBe(20);
    expect(r.evolve?.isRecord).toBe(true);
    const r2 = finishRun(sys, awakening, data(), run(25), evo);
    expect(r2.evolve?.isRecord).toBe(false);
    expect(r2.evolve?.previousBest).toBe(20);
    expect(save.levels.awakening.completions).toBe(3); // Evolve clears still unlock the next course
  });

  test('a slower run never overwrites the record or lowers the medal', () => {
    const save = defaultSave();
    const sys = fakeSaveSystem(save);
    finishRun(sys, awakening, data(), run(40));
    const medal = save.levels.awakening.medal;
    const r = finishRun(sys, awakening, data(), run(70));
    expect(r.isRecord).toBe(false);
    expect(save.levels.awakening.best).toBe(40);
    expect(save.levels.awakening.medal).toBe(medal);
    expect(save.levels.awakening.completions).toBe(2);
  });

  test('objectives are remembered once earned', () => {
    const save = defaultSave();
    const sys = fakeSaveSystem(save);
    const r1 = finishRun(sys, awakening, data(), run(60, { deaths: 0, shortcuts: ['aw-hidden'] }));
    expect(r1.objectives.find((o) => o.label.includes('without dying'))?.newly).toBe(true);
    expect(save.levels.awakening.objectives).toEqual(expect.arrayContaining(['aw-clean', 'aw-hidden']));
    const r2 = finishRun(sys, awakening, data(), run(60, { deaths: 4 }));
    const o = r2.objectives.find((x) => x.label.includes('without dying'))!;
    expect(o.done).toBe(false);
    expect(o.ever).toBe(true);
  });

  test('totals accumulate', () => {
    const save = defaultSave();
    finishRun(
      fakeSaveSystem(save),
      awakening,
      data(),
      run(60, { distance: 400, deaths: 2, topSpeed: 27, longestWallChain: 3 }),
    );
    expect(save.totals.runs).toBe(1);
    expect(save.totals.distance).toBe(400);
    expect(save.totals.deaths).toBe(2);
    expect(save.totals.topSpeed).toBe(27);
  });
});

describe('objectives', () => {
  test('each kind', () => {
    const d = data();
    expect(objectiveDone({ id: 'x', kind: 'noDeath', label: '' }, run(10, { deaths: 0 }), d, [])).toBe(true);
    expect(
      objectiveDone({ id: 'x', kind: 'maxDashes', value: 3, label: '' }, run(10, { dashes: 4 }), d, []),
    ).toBe(false);
    expect(
      objectiveDone(
        { id: 'x', kind: 'hiddenRoute', label: '' },
        run(10, { shortcuts: ['aw-hidden'] }),
        d,
        [],
      ),
    ).toBe(true);
    expect(objectiveDone({ id: 'x', kind: 'allCollectibles', label: '' }, run(10), d, ['a1', 'a2'])).toBe(
      false,
    );
    expect(
      objectiveDone({ id: 'x', kind: 'allCollectibles', label: '' }, run(10), d, ['a1', 'a2', 'a3']),
    ).toBe(true);
    expect(
      objectiveDone({ id: 'x', kind: 'wallTime', value: 12, label: '' }, run(10, { wallTime: 12.5 }), d, []),
    ).toBe(true);
  });
});

describe('achievements and cosmetics', () => {
  test('ids are unique and there are at least 20', () => {
    expect(new Set(achievements.map((a) => a.id)).size).toBe(achievements.length);
    expect(achievements.length).toBeGreaterThanOrEqual(20);
  });
  test('nothing unlocks on an empty save', () => {
    expect(checkAchievements(defaultSave(), null, null, null)).toEqual([]);
  });
  test('totals-based achievements unlock from career stats', () => {
    const s = defaultSave();
    s.totals.topSpeed = 31;
    s.totals.distance = 10001;
    const ids = checkAchievements(s, null, null, null).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['speed-demon', 'marathon']));
    expect(checkAchievements(s, null, null, null)).toEqual([]); // only once
  });
  test('locked cosmetics fall back to the default', () => {
    const s = defaultSave();
    s.equipped.suit = 'void';
    expect(cosmeticFor(s, 'suit').id).toBe('ion');
    s.achievements.shift = 1;
    expect(cosmeticFor(s, 'suit').id).toBe('void');
  });
  test('every cosmetic category has a default that is always unlocked', () => {
    for (const cat of ['suit', 'trail', 'lines', 'hud'] as const)
      expect(cosmetics.find((c) => c.category === cat)!.unlocked(defaultSave())).toBe(true);
  });
});

describe('level unlocks', () => {
  test('courses open in order; training and level 1 are always open', () => {
    const s = defaultSave();
    expect(isUnlocked(s, 'training')).toBe(true);
    expect(isUnlocked(s, 'awakening')).toBe(true);
    expect(isUnlocked(s, 'verticality')).toBe(false);
    s.levels.awakening = {
      best: 50,
      splits: [],
      medal: 2,
      collectibles: [],
      objectives: [],
      completions: 1,
      layout: 1,
      evolveBest: null,
      bestScore: 0,
      bestCombo: 0,
    };
    expect(isUnlocked(s, 'verticality')).toBe(true);
    expect(isUnlocked(s, 'momentum')).toBe(false);
    s.settings.unlockAll = true;
    expect(isUnlocked(s, 'momentum')).toBe(true);
  });
});

describe('course achievements (Phase F)', () => {
  const rec = (medal = 1) => ({
    best: 50,
    splits: [],
    medal,
    collectibles: [],
    objectives: [],
    completions: 1,
    layout: 1,
    evolveBest: null,
    bestScore: 0,
    bestCombo: 0,
  });
  test('the shard total counts every level, so "Every Last One" means every last one', () => {
    expect(SHARD_COUNT).toBe(levels.length * 3);
    const done = achievements.find((a) => a.id === 'completionist')!;
    expect(done.desc).toContain(String(SHARD_COUNT));
    const s = defaultSave();
    s.levels.awakening = {
      ...rec(),
      collectibles: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
    };
    expect(checkAchievements(s, null, null, null).some((a) => a.id === 'completionist')).toBe(false);
  });
  test('every course has a finish achievement, and finishing all of them earns Every World', () => {
    const s = defaultSave();
    for (const l of levels.filter((x) => !x.meta.training)) s.levels[l.meta.id] = rec();
    const ids = checkAchievements(s, null, null, null).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'awakened',
        'ascended',
        'unstoppable',
        'breakpoint-done',
        'inkfalls-done',
        'faceted-done',
        'blockfall-done',
        'core-done',
        'shiftpoint-done',
        'world-tour',
      ]),
    );
  });
  test('course feats need the run they describe on that course', () => {
    const meta = levels.find((l) => l.meta.id === 'breakpoint')!.meta;
    const run = { finished: true, deaths: 0, vaults: 5, ticks: 30 * 120 } as never;
    expect(checkAchievements(defaultSave(), run, meta, null).map((a) => a.id)).toContain('breakpoint-flow');
    const other = levels.find((l) => l.meta.id === 'inkfalls')!.meta;
    expect(checkAchievements(defaultSave(), run, other, null).map((a) => a.id)).not.toContain(
      'breakpoint-flow',
    );
    const sloppy = { finished: true, deaths: 1, vaults: 6, ticks: 30 * 120 } as never;
    expect(checkAchievements(defaultSave(), sloppy, meta, null).map((a) => a.id)).not.toContain(
      'breakpoint-flow',
    );
  });
});
