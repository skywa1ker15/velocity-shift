/**
 * Progression: medals, optional objectives, achievements and cosmetic unlocks.
 * Everything is earned by playing — there is no currency and no monetisation.
 */
import type { RunStats } from '../gameplay/Simulation';
import { levels } from '../levels/registry';
import type { LevelData, LevelMeta, MedalTimes, ObjectiveDef } from '../levels/types';
import type { SaveData, SaveSystem } from '../save/SaveSystem';

export const MEDALS = ['none', 'bronze', 'silver', 'gold', 'shift'] as const;
export const MEDAL_LABELS = ['—', 'BRONZE', 'SILVER', 'GOLD', 'SHIFT'];

export function medalFor(time: number, m: MedalTimes): number {
  if (time <= m.platinum) return 4;
  if (time <= m.gold) return 3;
  if (time <= m.silver) return 2;
  if (time <= m.bronze) return 1;
  return 0;
}

/** The next medal time to beat (the hidden top tier is only revealed once gold is earned). */
export function nextTarget(medal: number, m: MedalTimes): { tier: number; time: number } | null {
  if (medal >= 4) return null;
  const tier = medal + 1;
  return { tier, time: [0, m.bronze, m.silver, m.gold, m.platinum][tier] };
}

// ----- objectives ------------------------------------------------------------------------
export function objectiveDone(
  o: ObjectiveDef,
  stats: RunStats,
  data: LevelData,
  ownedCollectibles: string[],
): boolean {
  switch (o.kind) {
    case 'noDeath':
      return stats.deaths === 0;
    case 'maxDashes':
      return stats.dashes <= (o.value ?? 0);
    case 'hiddenRoute':
      return data.shortcuts.some((s) => s.hidden && stats.shortcuts.includes(s.id));
    case 'allCollectibles':
      return data.collectibles.every((c) => ownedCollectibles.includes(c.id));
    case 'underTime':
      return stats.ticks / 120 <= (o.value ?? 0);
    case 'noSlide':
      return stats.slides === 0;
    case 'wallTime':
      return stats.wallTime >= (o.value ?? 0);
  }
}

// ----- achievements ----------------------------------------------------------------------
interface AchCtx {
  save: SaveData;
  stats: RunStats | null; // the run that just finished (null when checking outside a run)
  meta: LevelMeta | null;
  data: LevelData | null;
  medal: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test(c: AchCtx): boolean;
}

const courses = () => levels.filter((l) => !l.meta.training);
const finished = (s: SaveData, id: string) => (s.levels[id]?.completions ?? 0) > 0;
const medalOf = (s: SaveData, id: string) => s.levels[id]?.medal ?? 0;
const totalShards = (s: SaveData) => Object.values(s.levels).reduce((n, r) => n + r.collectibles.length, 0);
/** Every shard in the game: three per level, training included (grows as courses are added). */
export const SHARD_COUNT = levels.length * 3;
/** The run just finished on this course, cleanly or not. */
const ranCourse = (c: AchCtx, id: string) => !!c.stats && c.meta?.id === id && c.stats.finished;

export const achievements: AchievementDef[] = [
  {
    id: 'first-steps',
    name: 'First Steps',
    desc: 'Finish Training.',
    test: (c) => finished(c.save, 'training'),
  },
  {
    id: 'awakened',
    name: 'Awakened',
    desc: 'Finish The Awakening.',
    test: (c) => finished(c.save, 'awakening'),
  },
  {
    id: 'ascended',
    name: 'Ascended',
    desc: 'Finish Verticality.',
    test: (c) => finished(c.save, 'verticality'),
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    desc: 'Finish Momentum.',
    test: (c) => finished(c.save, 'momentum'),
  },
  // ----- the Phase E courses: finishing each, and one feat that is each course's own identity
  {
    id: 'breakpoint-done',
    name: 'Off the Page',
    desc: 'Finish Breakpoint.',
    test: (c) => finished(c.save, 'breakpoint'),
  },
  {
    id: 'breakpoint-flow',
    name: 'Clean Lines',
    desc: 'Finish Breakpoint with 5 vaults and no deaths.',
    test: (c) => ranCourse(c, 'breakpoint') && c.stats!.vaults >= 5 && c.stats!.deaths === 0,
  },
  {
    id: 'inkfalls-done',
    name: 'All the Way Down',
    desc: 'Finish Ink Falls.',
    test: (c) => finished(c.save, 'inkfalls'),
  },
  {
    id: 'inkfalls-void',
    name: 'Over the Void',
    desc: 'Finish Ink Falls without dying.',
    test: (c) => ranCourse(c, 'inkfalls') && c.stats!.deaths === 0,
  },
  {
    id: 'faceted-done',
    name: 'Unfolded',
    desc: 'Finish Faceted.',
    test: (c) => finished(c.save, 'faceted'),
  },
  {
    id: 'faceted-clockwork',
    name: 'Clockwork',
    desc: 'Finish Faceted without dying, in under 40 seconds.',
    test: (c) => ranCourse(c, 'faceted') && c.stats!.deaths === 0 && c.stats!.ticks / 120 < 40,
  },
  {
    id: 'blockfall-done',
    name: 'Solid Ground',
    desc: 'Finish Blockfall.',
    test: (c) => finished(c.save, 'blockfall'),
  },
  {
    id: 'blockfall-precise',
    name: 'Pixel Perfect',
    desc: 'Finish Blockfall without dying.',
    test: (c) => ranCourse(c, 'blockfall') && c.stats!.deaths === 0,
  },
  {
    id: 'core-done',
    name: 'Core Breach',
    desc: 'Finish Corrupted Core.',
    test: (c) => finished(c.save, 'core'),
  },
  {
    id: 'core-gold',
    name: 'Clean Shutdown',
    desc: 'Earn gold on Corrupted Core.',
    test: (c) => medalOf(c.save, 'core') >= 3,
  },
  {
    id: 'shiftpoint-done',
    name: 'Shift Happens',
    desc: 'Finish Shift Point.',
    test: (c) => finished(c.save, 'shiftpoint'),
  },
  {
    id: 'shiftpoint-clean',
    name: 'Which Way Is Up',
    desc: 'Finish Shift Point without dying.',
    test: (c) => ranCourse(c, 'shiftpoint') && c.stats!.deaths === 0,
  },
  {
    id: 'world-tour',
    name: 'Every World',
    desc: 'Finish every course.',
    test: (c) => courses().every((l) => finished(c.save, l.meta.id)),
  },
  {
    id: 'podium',
    name: 'Podium',
    desc: 'Earn a medal on every course.',
    test: (c) => courses().every((l) => medalOf(c.save, l.meta.id) >= 1),
  },
  {
    id: 'gold-rush',
    name: 'Gold Rush',
    desc: 'Earn a gold medal.',
    test: (c) => courses().some((l) => medalOf(c.save, l.meta.id) >= 3),
  },
  {
    id: 'all-gold',
    name: 'Midas Line',
    desc: 'Earn gold on every course.',
    test: (c) => courses().every((l) => medalOf(c.save, l.meta.id) >= 3),
  },
  {
    id: 'shift',
    name: 'Velocity: Shift',
    desc: 'Beat a hidden Shift time.',
    test: (c) => courses().some((l) => medalOf(c.save, l.meta.id) >= 4),
  },
  {
    id: 'deathless',
    name: 'Untouched',
    desc: 'Finish a course without dying.',
    test: (c) => !!c.stats && !!c.meta && !c.meta.training && c.stats.finished && c.stats.deaths === 0,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    desc: 'Reach 30 m/s.',
    test: (c) => c.save.totals.topSpeed >= 30,
  },
  {
    id: 'wall-crawler',
    name: 'Wall Crawler',
    desc: 'Chain 4 wall-runs without touching the ground.',
    test: (c) => c.save.totals.longestWallChain >= 4,
  },
  {
    id: 'long-slide',
    name: 'Frictionless',
    desc: 'Slide 100 m in a single run.',
    test: (c) => !!c.stats && c.stats.slideDistance >= 100,
  },
  {
    id: 'air-time',
    name: 'Weightless',
    desc: 'Spend 25 seconds airborne in a single run.',
    test: (c) => !!c.stats && c.stats.airTime >= 25,
  },
  {
    id: 'frugal',
    name: 'Pure Momentum',
    desc: 'Finish a course using 3 dashes or fewer.',
    test: (c) => !!c.stats && !!c.meta && !c.meta.training && c.stats.finished && c.stats.dashes <= 3,
  },
  {
    id: 'pathfinder',
    name: 'Pathfinder',
    desc: 'Find a hidden route.',
    test: (c) => Object.values(c.save.levels).some((r) => r.objectives.some((o) => o.endsWith('-hidden'))),
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    desc: 'Find the hidden route on every course.',
    test: (c) =>
      courses().every((l) => c.save.levels[l.meta.id]?.objectives.some((o) => o.endsWith('-hidden'))),
  },
  { id: 'collector', name: 'Shard Hunter', desc: 'Collect 6 shards.', test: (c) => totalShards(c.save) >= 6 },
  {
    id: 'completionist',
    name: 'Every Last One',
    desc: `Collect all ${SHARD_COUNT} shards.`,
    test: (c) => totalShards(c.save) >= SHARD_COUNT,
  },
  {
    id: 'objectives',
    name: 'Overachiever',
    desc: 'Complete every optional objective.',
    test: (c) =>
      levels.every((l) =>
        l.meta.objectives.every((o) => c.save.levels[l.meta.id]?.objectives.includes(o.id)),
      ),
  },
  {
    id: 'marathon',
    name: 'Marathon',
    desc: 'Travel 10 km in total.',
    test: (c) => c.save.totals.distance >= 10000,
  },
  {
    id: 'persistent',
    name: 'Again.',
    desc: 'Fall 50 times. Get up 50 times.',
    test: (c) => c.save.totals.deaths >= 50,
  },
  {
    id: 'vaulter',
    name: 'Up and Over',
    desc: 'Vault 4 obstacles in a single run.',
    test: (c) => !!c.stats && c.stats.vaults >= 4,
  },
];

// ----- cosmetics -------------------------------------------------------------------------
export type CosmeticCategory = 'suit' | 'trail' | 'lines' | 'hud';
export interface CosmeticDef {
  id: string;
  category: CosmeticCategory;
  name: string;
  color: number;
  /** Trail style index (0 ring, 1 double ring, 2 starburst). */
  style?: number;
  how: string;
  unlocked(s: SaveData): boolean;
}

const has = (s: SaveData, a: string) => !!s.achievements[a];

export const cosmetics: CosmeticDef[] = [
  // suit accent colour (gloves, forearm, shins)
  { id: 'ion', category: 'suit', name: 'Ion', color: 0xff9a3c, how: 'Default', unlocked: () => true },
  {
    id: 'aurora',
    category: 'suit',
    name: 'Aurora',
    color: 0x38e0c8,
    how: 'Finish The Awakening',
    unlocked: (s) => has(s, 'awakened'),
  },
  {
    id: 'pulse',
    category: 'suit',
    name: 'Pulse',
    color: 0xff3fa8,
    how: 'Finish Verticality',
    unlocked: (s) => has(s, 'ascended'),
  },
  {
    id: 'glacier',
    category: 'suit',
    name: 'Glacier',
    color: 0x7fd8ff,
    how: 'Finish Momentum',
    unlocked: (s) => has(s, 'unstoppable'),
  },
  {
    id: 'midas',
    category: 'suit',
    name: 'Midas',
    color: 0xffd24a,
    how: 'Earn gold on every course',
    unlocked: (s) => has(s, 'all-gold'),
  },
  {
    id: 'void',
    category: 'suit',
    name: 'Void',
    color: 0xb48cff,
    how: 'Beat a hidden Shift time',
    unlocked: (s) => has(s, 'shift'),
  },
  // dash / jump burst style
  {
    id: 'pulse',
    category: 'trail',
    name: 'Pulse Ring',
    color: 0xffffff,
    style: 0,
    how: 'Default',
    unlocked: () => true,
  },
  {
    id: 'echo',
    category: 'trail',
    name: 'Echo',
    color: 0xffffff,
    style: 1,
    how: 'Collect 6 shards',
    unlocked: (s) => has(s, 'collector'),
  },
  {
    id: 'nova',
    category: 'trail',
    name: 'Nova',
    color: 0xffffff,
    style: 2,
    how: 'Chain 4 wall-runs',
    unlocked: (s) => has(s, 'wall-crawler'),
  },
  // speed-line colour
  {
    id: 'classic',
    category: 'lines',
    name: 'Slipstream',
    color: 0,
    how: 'Default (matches the level)',
    unlocked: () => true,
  },
  {
    id: 'ember',
    category: 'lines',
    name: 'Ember',
    color: 0xff7a3c,
    how: 'Reach 30 m/s',
    unlocked: (s) => has(s, 'speed-demon'),
  },
  {
    id: 'spectral',
    category: 'lines',
    name: 'Spectral',
    color: 0xb48cff,
    how: 'Finish a course without dying',
    unlocked: (s) => has(s, 'deathless'),
  },
  // HUD theme
  { id: 'ion', category: 'hud', name: 'Ion', color: 0xff9a3c, how: 'Default', unlocked: () => true },
  {
    id: 'mono',
    category: 'hud',
    name: 'Mono',
    color: 0xf2f4f8,
    how: 'Earn a medal on every course',
    unlocked: (s) => has(s, 'podium'),
  },
  {
    id: 'neon',
    category: 'hud',
    name: 'Neon',
    color: 0x21e4ff,
    how: 'Earn a gold medal',
    unlocked: (s) => has(s, 'gold-rush'),
  },
];

export function cosmeticFor(s: SaveData, category: CosmeticCategory): CosmeticDef {
  const id = s.equipped[category];
  const c = cosmetics.find((x) => x.category === category && x.id === id);
  return c && c.unlocked(s) ? c : cosmetics.find((x) => x.category === category)!;
}

// ----- finishing a run ----------------------------------------------------------------------
export interface ResultsData {
  levelId: string;
  time: number;
  previousBest: number | null;
  isRecord: boolean;
  medal: number;
  previousMedal: number;
  splits: number[];
  bestSplits: number[];
  stats: RunStats;
  objectives: { label: string; done: boolean; newly: boolean; ever: boolean }[];
  collectiblesOwned: number;
  collectiblesTotal: number;
  newAchievements: AchievementDef[];
  newCosmetics: CosmeticDef[];
  nextLevelId: string | null;
}

/** Unlock any achievements whose condition now holds. Returns the newly unlocked ones. */
export function checkAchievements(
  save: SaveData,
  stats: RunStats | null,
  meta: LevelMeta | null,
  data: LevelData | null,
  medal = 0,
): AchievementDef[] {
  const out: AchievementDef[] = [];
  // two passes: some achievements depend on others unlocked in the same sweep
  for (let pass = 0; pass < 2; pass++) {
    for (const a of achievements) {
      if (save.achievements[a.id]) continue;
      let ok: boolean;
      try {
        ok = a.test({ save, stats, meta, data, medal });
      } catch {
        ok = false;
      }
      if (ok) {
        save.achievements[a.id] = Date.now();
        out.push(a);
      }
    }
  }
  return out;
}

/** Fold a run's totals into the save (called on finish and when abandoning a run). */
export function addTotals(save: SaveData, stats: RunStats) {
  const t = save.totals;
  t.runs++;
  t.deaths += stats.deaths;
  t.distance += stats.distance;
  t.dashes += stats.dashes;
  t.wallTime += stats.wallTime;
  t.slideDistance += stats.slideDistance;
  t.playTime += stats.ticks / 120;
  t.topSpeed = Math.max(t.topSpeed, stats.topSpeed);
  t.longestWallChain = Math.max(t.longestWallChain, stats.longestWallChain);
}

export function finishRun(
  saveSys: SaveSystem,
  meta: LevelMeta,
  data: LevelData,
  stats: RunStats,
): ResultsData {
  const save = saveSys.data;
  const rec = saveSys.record(meta.id);
  const time = stats.ticks / 120;
  const unlockedBefore = new Set(
    cosmetics.filter((c) => c.unlocked(save)).map((c) => c.category + ':' + c.id),
  );

  const previousBest = rec.best;
  const previousMedal = rec.medal;
  const bestSplits = rec.splits.slice();
  const isRecord = previousBest === null || time < previousBest;
  const medal = medalFor(time, meta.medals);
  if (isRecord) {
    rec.best = time;
    rec.splits = stats.splits.slice();
  }
  rec.medal = Math.max(rec.medal, medal);
  rec.completions++;
  for (const id of stats.collected) if (!rec.collectibles.includes(id)) rec.collectibles.push(id);

  const objectives = meta.objectives.map((o) => {
    const done = objectiveDone(o, stats, data, rec.collectibles);
    const ever = rec.objectives.includes(o.id);
    if (done && !ever) rec.objectives.push(o.id);
    return { label: o.label, done, newly: done && !ever, ever: ever || done };
  });

  addTotals(save, stats);
  const newAchievements = checkAchievements(save, stats, meta, data, medal);
  const newCosmetics = cosmetics.filter(
    (c) => c.unlocked(save) && !unlockedBefore.has(c.category + ':' + c.id),
  );
  saveSys.flush();

  const idx = levels.findIndex((l) => l.meta.id === meta.id);
  const next = levels[idx + 1];
  return {
    levelId: meta.id,
    time,
    previousBest,
    isRecord,
    medal,
    previousMedal,
    splits: stats.splits.slice(),
    bestSplits,
    stats,
    objectives,
    collectiblesOwned: rec.collectibles.length,
    collectiblesTotal: data.collectibles.length,
    newAchievements,
    newCosmetics,
    nextLevelId: next ? next.meta.id : null,
  };
}

/** A level is playable once the one before it has been finished (or "unlock all" is on). */
export function isUnlocked(save: SaveData, levelId: string): boolean {
  if (save.settings.unlockAll) return true;
  const idx = levels.findIndex((l) => l.meta.id === levelId);
  if (idx <= 1) return true; // Training and Level 1 are always open
  return (save.levels[levels[idx - 1].meta.id]?.completions ?? 0) > 0;
}
