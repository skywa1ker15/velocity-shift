/**
 * Performance rating. Pure: the same run always earns the same grade.
 *
 * A run is scored on five parts, each 0..1, and weighted into a 0..1000 score:
 *   Pace    how close the time is to the course's platinum time (Pure) / gold (Evolve, whose upgrades help)
 *   Blade   sword points against what the course's cuttable objects could give you
 *   Flow    average speed and wall-run chaining: did you keep momentum?
 *   Clean   deaths (each costs a lot, the first the most)
 *   Extras  optional objectives, shards and hidden routes found
 * Each part comes with a one-line tip, and the weakest part's tip is shown first.
 */
import type { LevelData, LevelMeta } from '../levels/types';
import type { RunStats } from '../gameplay/Simulation';
import { CUT_POINTS } from '../gameplay/Simulation';

export const GRADES = ['D', 'C', 'B', 'A', 'S'] as const;
export type Grade = (typeof GRADES)[number];
/** Score needed for each grade (index = grade). */
export const GRADE_AT = [0, 400, 600, 780, 900];

export interface RatingPart {
  id: 'pace' | 'blade' | 'flow' | 'clean' | 'extras';
  label: string;
  /** 0..1 */
  value: number;
  weight: number;
  tip: string;
}

export interface Rating {
  score: number;
  grade: number;
  parts: RatingPart[];
  /** Most useful things to work on, weakest first (at most 2). */
  tips: string[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const WEIGHTS = { pace: 300, blade: 200, flow: 200, clean: 150, extras: 150 };

/** What the blade could earn on this course (an upper bound; most players reach well under it). */
export function bladePotential(data: LevelData): number {
  let p = 0;
  for (const b of data.breakables) p += (CUT_POINTS[b.kind] ?? 40) * 1.6;
  return p;
}

export function rate(
  stats: RunStats,
  meta: LevelMeta,
  data: LevelData,
  extras: { done: number; total: number },
  evolve = false,
): Rating {
  const time = stats.ticks / 120;
  const target = evolve ? meta.medals.gold : meta.medals.platinum;
  const slow = meta.medals.bronze;
  const pace = clamp01((slow - time) / Math.max(1, slow - target));
  const pot = bladePotential(data);
  const blade = pot > 0 ? clamp01(stats.cutPoints / (pot * 0.55)) : 1;
  const avg = stats.speedSum / Math.max(1, stats.ticks);
  const flow = clamp01(0.75 * clamp01((avg - 9) / 8) + 0.25 * clamp01(stats.longestWallChain / 4));
  const clean = stats.deaths === 0 ? 1 : clamp01(0.75 - 0.15 * (stats.deaths - 1));
  const ex = extras.total > 0 ? clamp01(extras.done / extras.total) : 1;

  const tipBlade =
    stats.cuts === 0
      ? 'Draw the blade and cut the glass, cores and chains on the line.'
      : stats.bestCombo < 3
        ? 'Chain cuts within 1.6 s: each one in a row is worth 25% more.'
        : stats.airCuts + stats.wallCuts === 0
          ? 'Cuts made in the air or on a wall-run score extra.'
          : 'Leave fewer objects uncut: every one on the line is points.';
  const parts: RatingPart[] = [
    {
      id: 'pace',
      label: 'Pace',
      value: pace,
      weight: WEIGHTS.pace,
      tip: `Time: aim for ${target.toFixed(0)} s. Look for the hidden routes and carry speed through landings.`,
    },
    { id: 'blade', label: 'Blade', value: blade, weight: WEIGHTS.blade, tip: tipBlade },
    {
      id: 'flow',
      label: 'Flow',
      value: flow,
      weight: WEIGHTS.flow,
      tip: 'Keep your speed up: sprint on flat ground, chain wall-runs, and slide into landings.',
    },
    {
      id: 'clean',
      label: 'Clean',
      value: clean,
      weight: WEIGHTS.clean,
      tip: `${stats.deaths} death${stats.deaths === 1 ? '' : 's'}: a clean run is worth the most.`,
    },
    {
      id: 'extras',
      label: 'Extras',
      value: ex,
      weight: WEIGHTS.extras,
      tip: 'Optional objectives, shards and the hidden route are still open.',
    },
  ];
  const score = Math.round(parts.reduce((n, p) => n + p.value * p.weight, 0));
  const grade = gradeOf(score);
  const tips = parts
    .filter((p) => p.value < 0.85)
    .sort((a, b) => a.value * a.weight - a.weight - (b.value * b.weight - b.weight))
    .slice(0, 2)
    .map((p) => p.tip);
  return { score, grade, parts, tips };
}

/** Grade index for a stored score. */
export function gradeOf(score: number): number {
  let g = 0;
  for (let i = 0; i < GRADE_AT.length; i++) if (score >= GRADE_AT[i]) g = i;
  return g;
}
