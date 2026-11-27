/**
 * Run planner: decides which universes a run visits, from a seed.
 *
 * Pure and deterministic: the same (level, seed, checkpoint count, library) always gives the same
 * plan, so a run can be reproduced and debugged. It is cosmetic only and lives outside the
 * simulation, so it can never change physics, timing or replays.
 *
 * Shape of a run: start in the level's home universe; some checkpoints open a shift to another
 * universe; the run keeps drifting back home so the level keeps its identity; and once in a while
 * an anomaly (a brief, unannounced visit somewhere else) interrupts.
 */
import { makeRng } from '../core/math';
import type { UniverseId } from './universes';

/** Transition kinds, in shader order. */
export const TRANSITIONS = ['portal', 'tear', 'glitch', 'drain', 'wave', 'pixel', 'collapse'] as const;
export type TransitionId = (typeof TRANSITIONS)[number];

export interface PlannedShift {
  /** Fires when this checkpoint (1-based index, as reported by the simulation) is reached. */
  checkpoint: number;
  to: UniverseId;
  transition: number;
}
export interface PlannedAnomaly {
  /** Fires this many seconds after the given checkpoint (0 = the start line). */
  checkpoint: number;
  delay: number;
  to: UniverseId;
  duration: number;
  transition: number;
}
export interface RunPlan {
  seed: number;
  home: UniverseId;
  shifts: PlannedShift[];
  anomalies: PlannedAnomaly[];
}

export function hashSeed(text: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function planRun(
  levelId: string,
  home: UniverseId,
  seed: number,
  checkpoints: number,
  library: readonly UniverseId[],
  transitions: number = TRANSITIONS.length,
): RunPlan {
  const rng = makeRng(hashSeed(levelId, seed));
  const others = library.filter((u) => u !== home);
  const plan: RunPlan = { seed, home, shifts: [], anomalies: [] };
  if (!others.length || checkpoints < 1) return plan;
  const pick = <T>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  // some universes arrive in character: corruption glitches in, the voxel world arrives in cubes
  const kind = (to?: UniverseId) => {
    const r = Math.floor(rng() * Math.max(1, transitions));
    if (to === 'corrupt' && transitions > 2) return 2;
    if (to === 'voxel' && transitions > 5 && r % 2 === 0) return 5;
    return r;
  };

  let current: UniverseId = home;
  let away = 0; // consecutive checkpoints spent away from home
  let sinceShift = 1;
  for (let cp = 1; cp <= checkpoints; cp++) {
    // the longer since the last shift, the likelier the next one
    const chance = current === home ? 0.34 + sinceShift * 0.22 : 0.45 + away * 0.25;
    if (rng() > chance) {
      sinceShift++;
      if (current !== home) away++;
      continue;
    }
    let to: UniverseId;
    if (current !== home && rng() < 0.55 + away * 0.2) to = home;
    else to = pick(others.filter((u) => u !== current).length ? others.filter((u) => u !== current) : others);
    if (to === current) continue;
    plan.shifts.push({ checkpoint: cp, to, transition: kind(to) });
    current = to;
    away = to === home ? 0 : 1;
    sinceShift = 1;
  }
  // a run with no shift at all is not a multiverse run: force one mid-course
  if (!plan.shifts.length) {
    plan.shifts.push({
      checkpoint: Math.max(1, Math.round(checkpoints / 2)),
      to: pick(others),
      transition: kind(),
    });
  }
  // anomalies: roughly one run in two gets one, a few get two
  const count = rng() < 0.5 ? 0 : rng() < 0.8 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const to = pick(library);
    plan.anomalies.push({
      checkpoint: Math.floor(rng() * (checkpoints + 1)),
      delay: 1.2 + rng() * 3.5,
      to,
      duration: 2.2 + rng() * 2.4,
      transition: kind(to),
    });
  }
  return plan;
}
