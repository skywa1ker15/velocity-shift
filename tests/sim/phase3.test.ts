/**
 * Phase 3: the Difficulty Director, the section library, mechanisms and the temporary effects
 * the active-effects HUD lists.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { Director, DIMS, RATE } from '../../src/gameplay/Director';
import { Simulation } from '../../src/gameplay/Simulation';
import { Bot } from '../../src/gameplay/Bot';
import { Course } from '../../src/levels/sections';
import type { Evolution } from '../../src/evolution/Evolution';
import { levels } from '../../src/levels/registry';
import type { LevelBuilder } from '../../src/levels/LevelBuilder';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { makeEvoSim, makeSim, type Driver } from './harness';

const RUN = { moveZ: 1, moveX: 0, sprint: true };
const STILL = { moveZ: 0, moveX: 0, sprint: false };
beforeAll(() => initPhysics());

/** A small course built from sections (with its own bot line). */
async function sections(build: (c: Course) => void, evolve = false) {
  let course!: Course;
  const make = (b: LevelBuilder) => {
    course = new Course(b, [0, 0, 0], { id: 't', level: 9 });
    build(course);
    b.bot(...course.bot);
  };
  const d = evolve ? await makeEvoSim(make) : await makeSim(make);
  d.settle();
  return d;
}
const runBot = (d: Driver, seconds = 60) => {
  const bot = new Bot(d.sim);
  for (let k = 0; k < seconds * 120 && d.sim.stats.deaths === 0; k++) {
    d.sim.tick(bot.step());
    if (bot.index >= d.sim.data.bot.length) break;
  }
  return bot;
};

describe('Difficulty Director', () => {
  test('eight independent dimensions, capped by how far into the course you are', async () => {
    const d = await sections((c) => c.runway());
    const dir = d.sim.director;
    expect(DIMS).toHaveLength(8);
    const early = dir.targets(0),
      late = dir.targets(1);
    for (const k of DIMS) {
      expect(early[k], k).toBeLessThanOrEqual(0.45 + 1e-9);
      expect(late[k], k).toBeGreaterThanOrEqual(early[k]);
    }
  });

  test('upgrades raise traversal, ability and density; deaths ease every gameplay dimension', async () => {
    const d = await sections((c) => c.runway(), true);
    const dir = d.sim.director,
      evo = d.sim.evo as Evolution;
    const before = dir.targets(0.6);
    for (const id of [
      'stride',
      'stride',
      'spring',
      'spring',
      'phase',
      'wallrunner',
      'edge',
      'edge',
      'reach',
    ] as const)
      evo.grant(id);
    const after = dir.targets(0.6);
    expect(after.traversal).toBeGreaterThan(before.traversal + 0.05);
    expect(after.ability).toBeGreaterThan(before.ability + 0.05);
    expect(after.density).toBeGreaterThan(before.density + 0.03);
    for (let i = 0; i < 3; i++) dir.onDeath(d.sim.time);
    const struggling = dir.targets(0.6);
    for (const k of DIMS) if (k !== 'visual') expect(struggling[k], k).toBeLessThan(after[k] + 1e-9);
    expect(struggling.traversal).toBeLessThan(after.traversal - 0.2);
  });

  test('no spikes: a dimension moves at most RATE per second', async () => {
    const d = await sections((c) => {
      c.runway();
      c.runway();
    }, true);
    const evo = d.sim.evo as Evolution;
    for (let i = 0; i < 12; i++) evo.grant((['stride', 'spring', 'phase', 'glide'] as const)[i % 4]);
    const dir = d.sim.director;
    let prev = { ...dir.dims };
    for (let t = 0; t < 4 * 120; t++) {
      d.tick(RUN);
      if (t % 30 === 29) {
        for (const k of DIMS)
          expect(Math.abs(dir.dims[k] - prev[k]), k).toBeLessThanOrEqual(RATE * 0.25 + 1e-9);
        prev = { ...dir.dims };
      }
    }
  });

  test('an encounter is decided before it can be seen, and its variants exist only at its tier', async () => {
    const d = await sections((c) => {
      c.runway(80);
      c.hurdles(3);
    });
    const dir = d.sim.director;
    const enc = d.sim.data.encounters!.find((e) => e.kind === 'hurdles')!;
    expect(dir.tiers.has(enc.id)).toBe(false);
    d.until(() => dir.tiers.has(enc.id), RUN, 20);
    expect(Math.hypot(enc.p[2] - d.pl.pos.z)).toBeGreaterThan(60);
    const lasers = d.sim.entities.filter((e) => e.def.enc === enc.id);
    const tier = dir.tiers.get(enc.id)!;
    for (const e of lasers) {
      const [lo, hi] = e.def.tiers!;
      expect(e.present).toBe(tier >= lo && tier <= hi);
    }
  });

  test('forced tiers: tier 2 adds the lasers, tier 0 has none; absent hazards cannot kill', async () => {
    const at = async (t: number) => {
      const d = await sections((c) => c.hurdles(3));
      d.sim.director.forced = t;
      d.sim.restart();
      d.settle();
      return d;
    };
    const t0 = await at(0),
      t2 = await at(2);
    const count = (d: Driver) => d.sim.entities.filter((e) => e.def.type === 'hazard' && e.present).length;
    t0.until(() => t0.sim.director.tiers.size > 0, STILL, 1);
    t2.until(() => t2.sim.director.tiers.size > 0, STILL, 1);
    expect(count(t0)).toBe(0);
    expect(count(t2)).toBe(6);
    // standing up inside a tier-0 laser's place: nothing happens
    const z = t0.sim.data.entities.find((e) => e.type === 'hazard')!;
    const p = (z as { p: [number, number, number] }).p;
    t0.pl.reset(p[0], p[1] - 0.3, p[2], Math.PI);
    t0.run(0.5, STILL);
    expect(t0.sim.stats.deaths).toBe(0);
  });

  test('dying in an encounter eases it next time; after a set piece the next is held back', async () => {
    const d = await sections((c) => {
      c.runway();
      c.hurdles(2);
    });
    const dir = d.sim.director;
    const enc = d.sim.data.encounters![1];
    (dir as unknown as { dims: Record<string, number> }).dims.obstacle = 1;
    (dir as unknown as { dims: Record<string, number> }).dims.reaction = 1;
    expect(dir.decide(enc)).toBe(2);
    (dir as unknown as { current: string }).current = enc.id;
    dir.onDeath(d.sim.time);
    expect(dir.decide(enc)).toBe(1);
    // recovery
    const d2 = await sections((c) => {
      c.finale();
      c.hurdles(2);
    });
    const dir2 = d2.sim.director;
    for (const k of DIMS) (dir2 as unknown as { dims: Record<string, number> }).dims[k] = 1;
    const [fin, next] = d2.sim.data.encounters!;
    expect(fin.intense).toBe(true);
    dir2.decide(fin);
    expect(dir2.decide(next)).toBe(next.max - 1);
  });

  test('the same inputs give the same course (deterministic)', async () => {
    const run = async () => {
      const d = await sections((c) => {
        c.runway();
        c.hurdles(3);
        c.gaps();
        c.collapseRun();
      });
      runBot(d, 40);
      return JSON.stringify(d.sim.director.state());
    };
    expect(await run()).toBe(await run());
  });
});

describe('sections', () => {
  test('every section is crossed by its own line at tier 0 and at tier 2', async () => {
    for (const t of [0, 2])
      for (const name of [
        'runway',
        'hurdles',
        'gaps',
        'collapseRun',
        'wallChain',
        'doubleGap',
        'stairs',
        'chute',
        'drawbridge',
        'laserGate',
        'climbOver',
        'roll',
      ] as const) {
        const d = await sections((c) => {
          c.runway(30);
          (c[name] as () => void).call(c);
          c.runway(30);
        });
        d.sim.director.forced = t;
        d.sim.restart();
        d.settle();
        const bot = runBot(d, 60);
        expect(d.sim.stats.deaths, `${name} tier ${t}`).toBe(0);
        expect(bot.index, `${name} tier ${t}`).toBe(d.sim.data.bot.length);
      }
  }, 240000);
});

describe('mechanisms', () => {
  test('glass bypass: sealed until the glass is cut; then the clear lane opens', async () => {
    const d = await sections((c) => c.hurdles(2));
    const glass = d.sim.data.breakables.findIndex((b) => b.kind === 'glass');
    const g = d.sim.data.breakables[glass];
    // walk into the sealed entrance: stopped
    d.pl.reset(g.p[0], g.p[1] + 0.05, g.p[2] - 3, Math.PI);
    d.run(1.2, RUN);
    expect(d.pl.pos.z).toBeLessThan(g.p[2]);
    // cut it: the way is open
    d.sim.cutObject(glass, 'sword');
    d.run(0.4, STILL);
    d.run(1.2, RUN);
    expect(d.pl.pos.z).toBeGreaterThan(g.p[2] + 3);
  });

  test('conduit: cutting it powers the laser gate down for the attempt; a respawn powers it up', async () => {
    const d = await sections((c) => c.laserGate());
    const gate = () => d.sim.entities.filter((e) => e.def.off && e.present);
    d.run(0.3, STILL);
    expect(gate().length).toBe(1);
    const conduit = d.sim.data.breakables.findIndex((b) => b.kind === 'conduit');
    d.sim.cutObject(conduit, 'sword');
    expect(gate().length).toBe(0);
    d.sim.kill('test');
    d.run(0.5, STILL);
    expect(gate().length).toBe(1);
  });

  test('drawbridge chains: cutting one lowers the bridge at once', async () => {
    const d = await sections((c) => c.drawbridge());
    const chain = d.sim.data.breakables.findIndex((b) => b.kind === 'chain');
    let fired = '';
    d.sim.events.on('event', (e) => (fired = e.name));
    d.sim.cutObject(chain, 'sword');
    expect(fired.startsWith('ev-')).toBe(true);
  });

  test('energy core (Evolve): Overcharge for 8 s, listed with its countdown, then gone and undone', async () => {
    const d = await sections((c) => c.runway(), true);
    const evo = d.sim.evo as Evolution;
    d.sim.director.forced = 2;
    d.sim.restart();
    d.settle();
    d.until(() => d.sim.director.tiers.size > 0, STILL, 1);
    const core = d.sim.data.breakables.findIndex((b) => b.kind === 'core');
    expect(d.sim.breakPresent[core]).toBe(true);
    d.sim.cutObject(core, 'sword');
    const fx = evo.effects().find((e) => e.id === 'overcharge')!;
    expect(fx.max).toBe(8);
    expect(fx.left).toBeCloseTo(8, 1);
    expect(d.pl.freeSprint).toBe(false); // applied from the next tick
    d.run(0.1, STILL);
    expect(d.pl.freeSprint).toBe(true);
    d.run(8, STILL);
    expect(evo.effects().some((e) => e.id === 'overcharge')).toBe(false);
    expect(d.pl.freeSprint).toBe(false);
  });

  test('several temporary effects at once each keep their own clock', async () => {
    const d = await sections((c) => c.runway(), true);
    const evo = d.sim.evo as Evolution;
    for (let i = 0; i < 3; i++) evo.grant('stride');
    evo.grant('timeslip');
    evo.flux = 60;
    d.run(1, RUN);
    evo.overcharge(5);
    d.tick({ ...RUN, slide: true } as typeof RUN); // a move: Momentum Lock
    d.tick({ ...RUN, surge: true } as typeof RUN);
    const ids = evo.effects().map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['overcharge', 'lock', 'surge']));
    const left = Object.fromEntries(evo.effects().map((e) => [e.id, e.left]));
    d.run(1, RUN);
    const left2 = Object.fromEntries(evo.effects().map((e) => [e.id, e.left]));
    expect(left.overcharge - left2.overcharge).toBeCloseTo(1, 1);
    expect(left.surge - left2.surge).toBeCloseTo(1, 1);
    d.run(6, STILL);
    expect(evo.effects().filter((e) => e.max > 0)).toEqual([]);
    expect(d.pl.cfg.overspeedDecay).toBeGreaterThan(0); // lock undone
  });

  test('permanent upgrades never show a countdown: only real temporary effects are listed', async () => {
    const d = await sections((c) => c.runway(), true);
    const evo = d.sim.evo as Evolution;
    for (const id of ['stride', 'spring', 'endurance', 'phase', 'reach', 'edge'] as const) evo.grant(id);
    d.run(0.5, STILL);
    expect(evo.effects()).toEqual([]);
    expect(evo.hud().effects).toEqual([]);
  });

  test('Pure: mechanisms work, cores give nothing', async () => {
    const d = await sections((c) => c.runway());
    d.sim.director.forced = 2;
    d.sim.restart();
    d.settle();
    d.until(() => d.sim.director.tiers.size > 0, STILL, 1);
    const core = d.sim.data.breakables.findIndex((b) => b.kind === 'core');
    d.sim.cutObject(core, 'sword');
    d.run(0.2, STILL);
    expect(d.pl.freeSprint).toBe(false);
    expect(d.pl.cfg.staminaMax).toBe(cfg.staminaMax);
  });
});

describe('the courses', () => {
  // reference-run distances before Phase 3 (docs/phase3/AUDIT.md)
  const before: Record<string, number> = {
    awakening: 865,
    verticality: 718,
    momentum: 1164,
    breakpoint: 861,
    inkfalls: 833,
    faceted: 601,
    blockfall: 663,
    core: 742,
    shiftpoint: 1123,
  };
  test('every course is at least 1.7x longer, and the line clears every encounter at its hardest tier', async () => {
    for (const l of levels.filter((x) => !x.meta.training)) {
      const data = (await l.load()).build();
      const sim = new Simulation(l.meta, data);
      sim.director.forced = 2;
      sim.restart();
      const bot = new Bot(sim);
      for (let k = 0; k < 260 * 120 && !sim.stats.finished && sim.stats.deaths === 0; k++)
        sim.tick(bot.step());
      expect(sim.stats.finished, l.meta.id).toBe(true);
      expect(sim.stats.deaths, l.meta.id).toBe(0);
      expect(sim.stats.distance, l.meta.id).toBeGreaterThan(before[l.meta.id] * 1.7);
      expect((data.encounters ?? []).length, l.meta.id).toBeGreaterThanOrEqual(5);
      sim.dispose();
    }
  }, 900000);

  test('the Director escalates through a course in Pure (the reference run)', async () => {
    const l = levels.find((x) => x.meta.id === 'awakening')!;
    const data = (await l.load()).build();
    const sim = new Simulation(l.meta, data);
    const bot = new Bot(sim);
    for (let k = 0; k < 260 * 120 && !sim.stats.finished; k++) sim.tick(bot.step());
    const tiers = sim.director.state().tiers.map((t) => t.tier);
    expect(tiers[0]).toBe(0);
    expect(tiers[tiers.length - 1]).toBeGreaterThan(tiers[0]);
    expect(Math.max(...tiers.slice(0, 3))).toBeLessThanOrEqual(1);
  }, 300000);
});

test('Director is constructed for every simulation (both modes)', async () => {
  const d = await makeSim((b) => b.plat(0, 0, 0, 10, 10));
  expect(d.sim.director).toBeInstanceOf(Director);
});
