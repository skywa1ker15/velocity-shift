/**
 * Hazard fairness tests: objective checks that timed hazards are readable and passable.
 *
 * These use the real level data and the real entity code (`Mover.update` and its hit test). A
 * scripted runner crosses each hazard section at a constant pace and every possible arrival time
 * is tried, so the result is a pass *rate* and the longest pass *window* per pace, not one lucky
 * run. The movement-based checks at the bottom drive the real controller with sloppy timing.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { Blink, Mover, TELEGRAPH_TIME, type EntityCtx } from '../../src/entities/Entities';
import { Simulation } from '../../src/gameplay/Simulation';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { levelById, levels } from '../../src/levels/registry';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { SIM_DT } from '../../src/core/loop';
import { Driver } from './harness';

beforeAll(async () => {
  await initPhysics();
});

async function load(id: string) {
  const e = levelById(id)!;
  return new Simulation(e.meta, (await e.load()).build());
}

/** Lethal movers of a level whose path runs within `zRange` of the course. */
function lethalMovers(sim: Simulation, z0: number, z1: number) {
  return sim.entities.filter(
    (e): e is Mover =>
      e instanceof Mover && !!e.def.lethal && e.def.path.every((p) => p[2] >= z0 && p[2] <= z1),
  );
}

/**
 * Run a standing player straight down the lane (x, feetY) from z0 to z1 at a constant pace,
 * arriving at z0 at `t0`. Returns true if no lethal mover touches them.
 */
function crossing(
  sim: Simulation,
  movers: Mover[],
  x: number,
  feetY: number,
  z0: number,
  z1: number,
  pace: number,
  t0: number,
) {
  const pl = sim.player;
  let killed = false;
  const ctx: EntityCtx = {
    player: pl,
    time: t0,
    dt: SIM_DT,
    kill: () => (killed = true),
    signal: () => {},
  };
  for (let z = z0; z < z1 && !killed; z += pace * SIM_DT) {
    pl.pos.x = x;
    pl.pos.y = feetY;
    pl.pos.z = z;
    for (const m of movers) m.update(ctx, sim.physics);
    ctx.time += SIM_DT;
  }
  return !killed;
}

/** Pass rate (0..1) and longest contiguous pass window (s) over one full hazard cycle. */
function sweep(
  sim: Simulation,
  movers: Mover[],
  x: number,
  feetY: number,
  z0: number,
  z1: number,
  pace: number,
  cycle: number,
) {
  const step = 0.01;
  const n = Math.round(cycle / step);
  const ok: boolean[] = [];
  for (let i = 0; i < n; i++) ok.push(crossing(sim, movers, x, feetY, z0, z1, pace, 20 + i * step));
  let best = 0,
    run = 0;
  for (const v of [...ok, ...ok]) {
    run = v ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { rate: ok.filter(Boolean).length / n, window: Math.min(best, n) * step };
}

function cycleOf(m: Mover) {
  const d = m.def;
  const len = Math.hypot(...([0, 1, 2].map((k) => d.path[1][k] - d.path[0][k]) as [number, number, number]));
  return (2 * len) / d.speed + (d.pause ?? 0) + (d.rest ?? d.pause ?? 0);
}

describe.each([
  ['momentum', -20.5, 325, 370, 326, 368],
  ['core', 0, 135, 185, 136, 182],
] as const)('%s crusher hall', (id, G, m0, m1, z0, z1) => {
  const paces = [8, 9, 10, 11, 12];
  const results = new Map<number, { rate: number; window: number }>();

  beforeAll(async () => {
    const sim = await load(id);
    const movers = lethalMovers(sim, m0, m1);
    expect(movers).toHaveLength(3);
    const cycle = cycleOf(movers[0]);
    for (const v of paces) results.set(v, sweep(sim, movers, 0, G, z0, z1, v, cycle));
    console.log(
      `${id} crusher hall pass rate / longest window by pace: ` +
        paces
          .map(
            (v) =>
              `${v} m/s ${(results.get(v)!.rate * 100).toFixed(0)}% ${results.get(v)!.window.toFixed(2)}s`,
          )
          .join(', '),
    );
  });

  test('sprint pace (9-12 m/s) gets through on at least 35% of arrival times', () => {
    for (const v of [9, 10, 11, 12]) expect(results.get(v)!.rate).toBeGreaterThanOrEqual(0.35);
  });

  test('a slower 8 m/s run still has a real chance (at least 20%)', () => {
    expect(results.get(8)!.rate).toBeGreaterThanOrEqual(0.2);
  });

  test('at sprint pace the safe window is at least 0.35 s long (reactable, not frame-perfect)', () => {
    for (const v of [10, 11]) expect(results.get(v)!.window).toBeGreaterThanOrEqual(0.35);
  });

  test('it is still a challenge: no pace passes on more than 80% of arrival times', () => {
    for (const v of paces) expect(results.get(v)!.rate).toBeLessThanOrEqual(0.8);
  });
});

describe.each(levels.map((l) => [l.meta.id] as const))('telegraphs in %s', (id) => {
  test('every lethal mover that rests in a safe spot glows for at least 0.5 s before it moves', async () => {
    const sim = await load(id);
    const movers = sim.entities.filter(
      (e): e is Mover => e instanceof Mover && !!e.def.lethal && !!e.def.telegraph,
    );
    const ctx: EntityCtx = { player: sim.player, time: 0, dt: SIM_DT, kill: () => {}, signal: () => {} };
    sim.player.pos.y = -9999; // keep the player out of the way
    for (const m of movers) {
      let warnSince = -1;
      let leads = 0;
      for (let t = 0; t < 12; t += SIM_DT) {
        ctx.time = t;
        const wasAtRest = m.atRest;
        m.update(ctx, sim.physics);
        if (m.warn > 0 && warnSince < 0 && wasAtRest) warnSince = t;
        if (wasAtRest && !m.atRest) {
          expect(warnSince).toBeGreaterThanOrEqual(0);
          expect(t - warnSince).toBeGreaterThanOrEqual(Math.min(0.5, TELEGRAPH_TIME) - 1e-6);
          leads++;
          warnSince = -1;
        }
        if (m.atRest && m.warn === 0) warnSince = -1;
      }
      expect(leads).toBeGreaterThan(1);
    }
  });
});

describe('Momentum (Level 3) laser run with sloppy timing', () => {
  const F = -10.5;
  // the reference line's action points, from the level's bot route
  const plan: [number, 'j' | 's' | 'u'][] = [
    [128.3, 'j'],
    [139.5, 's'],
    [146.5, 'u'],
    [152.3, 'j'],
    [163.5, 's'],
    [170.5, 'u'],
  ];

  test.each([-0.15, -0.075, 0, 0.075, 0.15])(
    'a sprinting player who acts %s s early/late clears all four lasers',
    async (lag) => {
      const sim = await load('momentum');
      const d = new Driver(sim);
      sim.player.reset(0, F + 0.05, 112, Math.PI);
      d.settle();
      let k = 0;
      let deaths = 0;
      sim.events.on('death', () => deaths++);
      for (let i = 0; i < 120 * 8 && sim.player.pos.z < 172 && !deaths; i++) {
        const keys: Parameters<Driver['tick']>[0] = { moveZ: 1, sprint: true };
        // acting `lag` seconds late = acting `lag * speed` metres later along the lane
        if (k < plan.length && sim.player.pos.z >= plan[k][0] + lag * sim.player.speed) {
          const a = plan[k][1];
          if (a === 'j') keys.jump = true;
          if (a === 's') keys.slide = true;
          if (a === 'u') keys.slideHeld = false;
          k++;
        }
        d.tick(keys);
      }
      expect(deaths).toBe(0);
      expect(sim.player.pos.z).toBeGreaterThanOrEqual(172);
      expect(sim.player.speed).toBeGreaterThan(cfg.runSpeed); // momentum survives the sequence
    },
  );
});

/**
 * Blinking platforms at human paces. A runner crosses the tiles at a constant pace, arriving at
 * every possible moment of the cycle; the crossing fails if they are over a tile while it is not
 * solid. Air time over a tile counts as standing on it, so this is a pessimistic model (a real
 * player hops and touches each tile only briefly). Uses the real Blink entity code.
 */
function blinkSweep(sim: Simulation, tiles: Blink[], pace: number) {
  const z0 = Math.min(...tiles.map((b) => b.def.p[2] - b.def.s[2] / 2)) - 0.5;
  const z1 = Math.max(...tiles.map((b) => b.def.p[2] + b.def.s[2] / 2)) + 0.5;
  const period = tiles[0].def.onTime + tiles[0].def.offTime;
  const ctx: EntityCtx = { player: sim.player, time: 0, dt: SIM_DT, kill: () => {}, signal: () => {} };
  const step = 0.01;
  const n = Math.round(period / step);
  const ok: boolean[] = [];
  for (let i = 0; i < n; i++) {
    let pass = true;
    ctx.time = 20 + i * step;
    for (let z = z0; z < z1 && pass; z += pace * SIM_DT) {
      for (const b of tiles) {
        b.update(ctx, sim.physics);
        const over = Math.abs(z - b.def.p[2]) < b.def.s[2] / 2;
        if (over && !b.solid) pass = false;
      }
      ctx.time += SIM_DT;
    }
    ok.push(pass);
  }
  let best = 0,
    run = 0;
  for (const v of [...ok, ...ok]) {
    run = v ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { rate: ok.filter(Boolean).length / n, window: Math.min(best, n) * step };
}

describe.each(['momentum', 'faceted'])('blinking platforms in %s at human paces', (id) => {
  const paces = [7, 8, 9, 10, 11, 12];
  const res = new Map<number, { rate: number; window: number }>();
  beforeAll(async () => {
    const sim = await load(id);
    const tiles = sim.entities.filter((e): e is Blink => e instanceof Blink);
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    for (const v of paces) res.set(v, blinkSweep(sim, tiles, v));
    console.log(
      `${id} blink pass rate / window by pace: ` +
        paces
          .map((v) => `${v} m/s ${(res.get(v)!.rate * 100).toFixed(0)}% ${res.get(v)!.window.toFixed(2)}s`)
          .join(', '),
    );
  });
  test('every pace from a run (7 m/s) to a fast sprint has a reactable window of at least 0.35 s', () => {
    for (const v of paces) expect(res.get(v)!.window, `${v} m/s`).toBeGreaterThanOrEqual(0.35);
  });
  test('every pace gets through on at least 20% of arrival times', () => {
    for (const v of paces) expect(res.get(v)!.rate, `${v} m/s`).toBeGreaterThanOrEqual(0.2);
  });
  test('still a challenge: no pace passes on more than 80% of arrival times', () => {
    for (const v of paces) expect(res.get(v)!.rate, `${v} m/s`).toBeLessThanOrEqual(0.8);
  });
});

describe('Blockfall stepping blocks with sloppy timing (real controller)', () => {
  const jumps = [31.4, 39.3, 47.3, 55.3];
  async function cross(sprint: boolean, lag: number) {
    const sim = await load('blockfall');
    const d = new Driver(sim);
    sim.player.reset(0, 0.05, 20, Math.PI);
    d.settle();
    let k = 0,
      deaths = 0;
    sim.events.on('death', () => deaths++);
    for (let i = 0; i < 120 * 8 && !deaths && !(sim.player.pos.z > 62 && sim.player.grounded); i++) {
      const keys: Parameters<Driver['tick']>[0] = { moveZ: 1, sprint };
      // acting `lag` seconds late = acting `lag * speed` metres later along the lane
      if (k < jumps.length && sim.player.pos.z >= jumps[k] + lag * sim.player.speed) {
        keys.jump = true;
        k++;
      }
      d.tick(keys);
    }
    return deaths === 0 && sim.player.pos.z > 62;
  }
  test.each([-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15])(
    'a sprinting player jumping %s s off clears all three',
    async (lag) => {
      expect(await cross(true, lag)).toBe(true);
    },
  );
  test.each([-0.05, 0, 0.05, 0.1, 0.15])(
    'a running (7 m/s) player jumping %s s off clears all three',
    async (lag) => {
      expect(await cross(false, lag)).toBe(true);
    },
  );
});
