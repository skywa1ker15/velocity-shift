/** Performance rating: combo/air/wall scoring in the simulation, and the pure rating function. */
import { beforeAll, describe, expect, test } from 'vitest';
import { MoveState } from '../../src/movement/types';
import { COMBO_WINDOW, newStats } from '../../src/gameplay/Simulation';
import type { LevelBuilder } from '../../src/levels/LevelBuilder';
import { GRADE_AT, gradeOf, rate } from '../../src/progression/Rating';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { levels } from '../../src/levels/registry';
import { makeSim } from './harness';

beforeAll(() => initPhysics());

async function hurdleSim() {
  const d = await makeSim((b: LevelBuilder) => {
    b.plat(0, 0, 30, 10, 80);
    for (let i = 0; i < 6; i++) b.breakable(i % 2 ? 'core' : 'glass', 0, 0, 20 + i * 8);
  });
  d.settle();
  return d;
}

type D = Awaited<ReturnType<typeof hurdleSim>>;
/** Indices of breakables still intact (settling may have smashed one the runner stood in). */
const fresh = (d: D) =>
  d.sim.data.breakables.map((_, i) => i).filter((i) => !(d.sim as any).broken[i] && d.sim.breakPresent[i]);

describe('cut combos', () => {
  test('cuts inside the window chain; a pause breaks the chain; points grow with the chain', async () => {
    const d = await hurdleSim();
    expect(fresh(d).length).toBeGreaterThanOrEqual(3);
    const f = fresh(d);
    d.sim.cutObject(f[0], 'sword');
    const first = d.sim.stats.cutPoints;
    d.sim.stats.ticks += 36;
    d.sim.cutObject(f[1], 'sword');
    d.sim.stats.ticks += 36;
    d.sim.cutObject(f[2], 'sword');
    expect(d.sim.stats.bestCombo).toBe(3);
    expect(d.sim.stats.cutPoints).toBeGreaterThan(first * 3);
    // wait out the window: the next cut starts over, bestCombo keeps the record
    d.sim.stats.ticks += Math.round((COMBO_WINDOW + 0.3) * 120); // the run clock only advances once started
    if (f.length > 3) {
      d.sim.cutObject(f[3], 'sword');
      expect(d.sim.stats.bestCombo).toBe(3);
    }
  });

  test('body smashes score a fraction and never extend a combo', async () => {
    const d = await hurdleSim();
    const smashes0 = d.sim.stats.smashes;
    const f = fresh(d);
    d.sim.cutObject(f[0], 'body');
    d.sim.cutObject(f[1], 'body');
    expect(d.sim.stats.bestCombo).toBe(0);
    expect(d.sim.stats.smashes - smashes0).toBe(2);
    const smashPts = d.sim.stats.cutPoints;
    const e = await hurdleSim();
    const g = fresh(e);
    e.sim.cutObject(g[0], 'sword');
    e.sim.cutObject(g[1], 'sword');
    expect(e.sim.stats.cutPoints).toBeGreaterThan(smashPts * 3);
  });

  test('airborne cuts and wall-run cuts are counted and worth more', async () => {
    const ground = await hurdleSim();
    ground.sim.cutObject(fresh(ground)[0], 'sword');
    const air = await hurdleSim();
    air.pl.grounded = false;
    air.sim.cutObject(fresh(air)[0], 'sword');
    expect(air.sim.stats.airCuts).toBe(1);
    expect(air.sim.stats.cutPoints).toBeGreaterThan(ground.sim.stats.cutPoints);
    const wall = await hurdleSim();
    wall.pl.grounded = false;
    wall.pl.state = MoveState.WallRun;
    wall.sim.cutObject(fresh(wall)[0], 'sword');
    expect(wall.sim.stats.wallCuts).toBe(1);
    expect(wall.sim.stats.airCuts).toBe(0);
    expect(wall.sim.stats.cutPoints).toBeGreaterThan(air.sim.stats.cutPoints);
  });

  test('a respawn resets the running combo', async () => {
    const d = await hurdleSim();
    const f = fresh(d);
    d.sim.cutObject(f[0], 'sword');
    (d.sim as any).placeAtCheckpoint();
    d.sim.cutObject(f[1], 'sword');
    expect(d.sim.stats.bestCombo).toBe(1);
  });
});

describe('rating', () => {
  const entry = levels.find((l) => !l.meta.training)!;
  const meta = entry.meta;
  const data = { breakables: [], collectibles: [] } as any;
  const run = (over: Partial<ReturnType<typeof newStats>> = {}) => {
    const s = newStats();
    s.ticks = Math.round(meta.medals.platinum * 120);
    s.speedSum = 17 * s.ticks;
    s.longestWallChain = 4;
    return Object.assign(s, over);
  };

  test('is deterministic and bounded', () => {
    const a = rate(run(), meta, data, { done: 1, total: 2 });
    const b = rate(run(), meta, data, { done: 1, total: 2 });
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(1000);
  });

  test('a flawless platinum run is S; a slow, sloppy one is D', () => {
    const best = rate(run(), meta, data, { done: 3, total: 3 });
    expect(best.grade).toBe(4);
    expect(best.tips).toEqual([]);
    const worst = rate(
      run({ ticks: Math.round(meta.medals.bronze * 130), speedSum: 6 * meta.medals.bronze * 130, deaths: 9 }),
      meta,
      data,
      { done: 0, total: 3 },
    );
    expect(worst.grade).toBe(0);
    expect(worst.tips.length).toBeGreaterThan(0);
  });

  test('every part moves the score, in the right direction', () => {
    const base = rate(run(), meta, data, { done: 3, total: 3 }).score;
    expect(rate(run({ deaths: 1 }), meta, data, { done: 3, total: 3 }).score).toBeLessThan(base);
    expect(rate(run({ deaths: 4 }), meta, data, { done: 3, total: 3 }).score).toBeLessThan(
      rate(run({ deaths: 1 }), meta, data, { done: 3, total: 3 }).score,
    );
    expect(rate(run(), meta, data, { done: 0, total: 3 }).score).toBeLessThan(base);
    expect(rate(run({ ticks: run().ticks * 1.4 }), meta, data, { done: 3, total: 3 }).score).toBeLessThan(
      base,
    );
    expect(rate(run({ speedSum: 10 * run().ticks }), meta, data, { done: 3, total: 3 }).score).toBeLessThan(
      base,
    );
  });

  test('blade part rewards points and names the next thing to try', () => {
    const withBlades = { breakables: [{ kind: 'core' }, { kind: 'glass' }], collectibles: [] } as any;
    const none = rate(run(), meta, withBlades, { done: 3, total: 3 });
    const some = rate(run({ cutPoints: 300, cuts: 4, bestCombo: 4 }), meta, withBlades, {
      done: 3,
      total: 3,
    });
    expect(some.score).toBeGreaterThan(none.score);
    expect(none.tips.join(' ')).toMatch(/blade/i);
  });

  test('grade thresholds map scores to letters', () => {
    expect(gradeOf(0)).toBe(0);
    expect(gradeOf(GRADE_AT[2])).toBe(2);
    expect(gradeOf(GRADE_AT[2] - 1)).toBe(1);
    expect(gradeOf(1000)).toBe(4);
  });
});
