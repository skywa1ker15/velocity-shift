/**
 * Evolve mode, through the real simulation: collectibles and how each is caught, the spawner,
 * every ability and its levels / caps / evolutions, Flow, the momentum links, synergies, the run
 * model (respawns keep upgrades, restarts do not) — and that Pure is untouched.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  ABILITIES,
  ABILITY_IDS,
  FLOW_TIERS,
  SYNERGIES,
  T,
  type AbilityId,
} from '../../src/evolution/abilities';
import { placeCollectibles, type CollectibleKind, type Placed } from '../../src/evolution/collectibles';
import type { Evolution } from '../../src/evolution/Evolution';
import { recordSlots, type Slot } from '../../src/evolution/slots';
import { Bot } from '../../src/gameplay/Bot';
import { Simulation } from '../../src/gameplay/Simulation';
import type { LevelBuilder } from '../../src/levels/LevelBuilder';
import { levels } from '../../src/levels/registry';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { FWD, makeEvoSim, makeSim, MoveState, type Driver } from './harness';

const RUN = { moveZ: 1, moveX: 0, sprint: true };
const floor = (b: LevelBuilder) => b.plat(0, 0, 100, 12, 220, { dress: false });
const evo = (d: Driver) => d.sim.evo as Evolution;
const put = (d: Driver, items: [CollectibleKind, number, number, number, Partial<Placed>?][]) =>
  evo(d).place(items.map(([kind, x, y, z, o]) => ({ kind, p: [x, y, z], u: [0, 1, 0], d: z, ...o })));
const give = (d: Driver, id: AbilityId, n = 1) => {
  for (let i = 0; i < n; i++) evo(d).grant(id);
};
async function flat() {
  const d = await makeEvoSim(floor);
  d.settle();
  return d;
}
const slotsOf = (id: string): Slot[] => JSON.parse(readFileSync(`src/evolution/slots/${id}.json`, 'utf8'));

beforeAll(() => initPhysics());

describe('Pure is the original game', () => {
  test('no evolution layer, shared tuning, neutral sword', async () => {
    const d = await makeSim(floor);
    expect(d.sim.evo).toBeNull();
    expect(d.pl.cfg).toBe(cfg);
    expect(d.pl.extraAirJumps).toBe(0);
    expect(d.sim.sword.attackSpeed).toBe(1);
    expect(d.sim.sword.reachAdd).toBe(0);
  });
  test('Evolve tunes its own layer and never the shared config', async () => {
    const d = await flat();
    give(d, 'stride', 5);
    d.run(0.1, RUN);
    expect(d.pl.cfg).not.toBe(cfg);
    expect(d.pl.cfg.sprintSpeed).toBeGreaterThan(cfg.sprintSpeed);
    expect(cfg.sprintSpeed).toBe(11);
  });
});

describe('slots and the spawner', () => {
  test.each(levels.map((l) => [l.meta.id, l] as const))(
    'slot file for %s is current (regenerated from the reference run)',
    async (id, entry) => {
      const sim = new Simulation(entry.meta, (await entry.load()).build());
      const bot = new Bot(sim);
      const fresh = recordSlots(sim, () => bot.step());
      expect(fresh).not.toBeNull();
      expect(JSON.parse(JSON.stringify(fresh))).toEqual(slotsOf(id));
    },
  );

  test.each(levels.filter((l) => l.meta.id !== 'training').map((l) => [l.meta.id, l] as const))(
    '%s: placement is seeded, varied, controlled and on the line',
    async (id, entry) => {
      const data = (await entry.load()).build();
      const slots = slotsOf(id);
      const a = placeCollectibles(slots, 1),
        b = placeCollectibles(slots, 1),
        c = placeCollectibles(slots, 2);
      expect(b).toEqual(a);
      expect(c).not.toEqual(a);
      const L = slots[slots.length - 1].d;
      const count = (k: CollectibleKind) => a.filter((x) => x.kind === k).length;
      expect(count('glint')).toBeGreaterThanOrEqual(4);
      const unc = a.filter((x) => ['undertow', 'skyknot', 'rift', 'glyph', 'vein'].includes(x.kind));
      expect(unc.length).toBeGreaterThanOrEqual(Math.min(3, slots.length));
      expect(unc.length).toBeLessThanOrEqual(Math.round(L / 62) + 1);
      expect(count('paradox')).toBeLessThanOrEqual(1);
      expect([0, 4]).toContain(count('echo'));
      // every piece sits in a slot whose recorded move catches it
      const okKinds: Record<CollectibleKind, string[]> = {
        glint: ['ground', 'slide', 'air', 'dash', 'wall'],
        undertow: ['slide', 'ground'],
        skyknot: ['air'],
        rift: ['ground', 'air'],
        glyph: ['cut'],
        vein: ['wall'],
        echo: ['ground', 'slide', 'air', 'dash', 'wall'],
        paradox: ['ground', 'slide', 'air', 'dash', 'wall'],
      };
      for (const x of a) {
        const s = slots.find((s) => s.p[0] === x.p[0] && s.p[1] === x.p[1] && s.p[2] === x.p[2]);
        expect(s, `${x.kind} at ${x.p}`).toBeDefined();
        expect(okKinds[x.kind]).toContain(s!.k);
        // away from checkpoints and hazards (slot rules)
        for (const cp of data.checkpoints)
          expect(Math.hypot(cp.p[0] - x.p[0], cp.p[1] + 0.9 - x.p[1], cp.p[2] - x.p[2])).toBeGreaterThan(3.9);
      }
      // uncommon pieces are spread out
      const ds = unc.map((x) => x.d).sort((p, q) => p - q);
      for (let i = 1; i < ds.length; i++) expect(ds[i] - ds[i - 1]).toBeGreaterThanOrEqual(12);
    },
  );
});

describe('collection methods: how you catch it is what it gives', () => {
  test('Glint: running through it gives Flux', async () => {
    const d = await flat();
    put(d, [['glint', 0, 0.9, 8]]);
    d.run(1.6, RUN);
    expect(evo(d).items[0].taken).toBe(true);
    expect(evo(d).flux).toBeGreaterThan(3);
  });

  test('Undertow: only a slide under it catches it', async () => {
    const run = await flat();
    put(run, [['undertow', 0, 0.35, 10]]);
    run.run(2, RUN);
    expect(evo(run).items[0].taken).toBe(false);
    const slide = await flat();
    put(slide, [['undertow', 0, 0.35, 10]]);
    slide.until(() => slide.pl.pos.z > 5, RUN);
    slide.tick({ ...RUN, slide: true });
    slide.run(1, { ...RUN, slideHeld: true });
    expect(evo(slide).items[0].taken).toBe(true);
    expect(evo(slide).totalLevels).toBe(1);
    expect(['stride', 'glide', 'magnet'].some((id) => evo(slide).level(id as AbilityId) === 1)).toBe(true);
  });

  test('Skyknot: only caught in the air', async () => {
    const run = await flat();
    put(run, [['skyknot', 0, 1.6, 10]]);
    run.run(2, RUN);
    expect(evo(run).items[0].taken).toBe(false);
    const jump = await flat();
    put(jump, [['skyknot', 0, 1.6, 10]]);
    jump.until(() => jump.pl.pos.z > 7, RUN);
    jump.tick({ ...RUN, jump: true });
    jump.run(1, RUN);
    expect(evo(jump).items[0].taken).toBe(true);
    expect(evo(jump).level('spring')).toBe(1);
  });

  test('Rift Mote: only a dash through it catches it', async () => {
    const run = await flat();
    put(run, [['rift', 0, 0.9, 10]]);
    run.run(2, RUN);
    expect(evo(run).items[0].taken).toBe(false);
    const dash = await flat();
    put(dash, [['rift', 0, 0.9, 10]]);
    dash.until(() => dash.pl.pos.z > 7.5, RUN);
    dash.tick({ ...RUN, dash: true });
    dash.run(0.6, RUN);
    expect(evo(dash).items[0].taken).toBe(true);
    expect(evo(dash).level('phase') + evo(dash).level('flywheel')).toBe(1);
  });

  test('Wall Vein: only caught while wall-running', async () => {
    const corridor = (b: LevelBuilder) => {
      b.plat(0, 0, 0, 12, 20, { dress: false });
      b.wall(-3.2, -2, 25, 0.6, 8, 30);
      b.plat(0, 0, 60, 12, 30, { dress: false });
    };
    const d = await makeEvoSim(corridor, [-2.2, 0, 0]);
    d.settle();
    d.run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3, RUN);
    d.tick({ ...RUN, jump: true, yaw: FWD - 0.25 });
    d.until(() => d.pl.state === MoveState.WallRun, RUN, 1);
    const p = d.pl.pos;
    put(d, [['vein', p.x, p.y + 0.9 + 0.6, p.z + 5]]);
    d.run(0.8, RUN);
    expect(evo(d).items[0].taken).toBe(true);
    expect(evo(d).level('wallrunner')).toBe(1);
    // the same spot reached on foot does not count
    const g = await flat();
    put(g, [['vein', 0, 0.9, 8]]);
    g.run(1.5, RUN);
    expect(evo(g).items[0].taken).toBe(false);
  });

  test('Fracture Glyph: only the blade breaks it', async () => {
    const run = await flat();
    put(run, [['glyph', 0, 1.2, 6]]);
    run.run(2, RUN);
    expect(evo(run).items[0].taken).toBe(false);
    const cut = await flat();
    put(cut, [['glyph', 0, 1.45, 2.2]]);
    cut.tick({ attack: true });
    cut.run(0.4);
    expect(evo(cut).items[0].taken).toBe(true);
    expect(['edge', 'reach', 'severance', 'siphon'].some((id) => evo(cut).level(id as AbilityId) === 1)).toBe(
      true,
    );
  });

  test('Echo Chain: four nodes in turn, each lit by the last; slow and it starts over', async () => {
    const d = await flat();
    put(
      d,
      [0, 1, 2, 3].map(
        (i) =>
          ['echo', 0, 0.9, 8 + 8 * i, { group: 0, order: i }] as [
            CollectibleKind,
            number,
            number,
            number,
            Partial<Placed>,
          ],
      ),
    );
    expect(evo(d).items.map((x) => x.live)).toEqual([true, false, false, false]);
    d.run(4, RUN);
    expect(evo(d).items.every((x) => x.taken)).toBe(true);
    expect(evo(d).totalLevels).toBe(1); // a survival / rare ability
    const late = await flat();
    put(late, [
      ['echo', 0, 0.9, 6, { group: 0, order: 0 }],
      ['echo', 0, 0.9, 90, { group: 0, order: 1 }],
      ['echo', 0, 0.9, 96, { group: 0, order: 2 }],
      ['echo', 0, 0.9, 102, { group: 0, order: 3 }],
    ]);
    let failed = false;
    evo(late).events.on('chain', (c) => c.failed && (failed = true));
    late.run(1.5, RUN);
    expect(evo(late).items[0].taken).toBe(true);
    late.run(5, { moveZ: 0 });
    expect(failed).toBe(true);
    expect(evo(late).items[0].taken).toBe(false);
    expect(evo(late).items[0].live).toBe(true);
  });

  test('Paradox Core: phases out below Flow tier 3, gives a mythic at tier 3+', async () => {
    const low = await flat();
    put(low, [['paradox', 0, 0.9, 8]]);
    let phased = 0;
    evo(low).events.on('phased', () => phased++);
    low.run(1.6, RUN);
    expect(phased).toBe(1);
    expect(evo(low).items[0].taken).toBe(false);
    const high = await flat();
    put(high, [['paradox', 0, 0.9, 8]]);
    const e = evo(high);
    e.flow = FLOW_TIERS[3] + 15;
    e.action('jump', 0);
    high.run(1.6, RUN);
    expect(e.items[0].taken).toBe(true);
    expect(e.level('overclock') + e.level('mirror') + e.level('chrono')).toBe(1);
  });

  test('Magnet pulls Glints in from beside the line', async () => {
    const none = await flat();
    put(none, [['glint', 2.6, 0.9, 8]]);
    none.run(1.6, RUN);
    expect(evo(none).items[0].taken).toBe(false);
    const mag = await flat();
    give(mag, 'magnet', 1);
    put(mag, [['glint', 2.6, 0.9, 8]]);
    mag.run(1.6, RUN);
    expect(evo(mag).items[0].taken).toBe(true);
  });

  test('a full Flux meter overflows into upgrades', async () => {
    const d = await flat();
    const e = evo(d);
    e.addFlux(100);
    expect(e.totalLevels).toBe(0);
    e.addFlux(61);
    expect(e.totalLevels).toBe(1);
  });
});

describe('abilities: levels, caps, diminishing returns, evolutions', () => {
  test('every ability stops at its cap', async () => {
    const d = await flat();
    for (const id of ABILITY_IDS) {
      for (let i = 0; i < ABILITIES[id].max; i++) expect(evo(d).grant(id)).toBe(true);
      expect(evo(d).grant(id)).toBe(false);
      expect(evo(d).level(id)).toBe(ABILITIES[id].max);
    }
  });

  test('each level adds no more than the one before (diminishing returns)', () => {
    const tables = Object.entries(T).filter(([, v]) => Array.isArray(v)) as unknown as [string, number[]][];
    expect(tables.length).toBeGreaterThan(15);
    for (const [name, t] of tables) {
      const steps = t.slice(1).map((v, i) => Math.abs(v - t[i]));
      for (let i = 1; i < steps.length; i++) expect(steps[i], name).toBeLessThanOrEqual(steps[i - 1] + 1e-9);
      expect(steps[0], name).toBeGreaterThan(0);
    }
  });

  test('Stride raises sprint speed; Overdrive adds more after 1.5 s of sprinting', async () => {
    const d = await flat();
    give(d, 'stride', 2);
    d.run(3, RUN);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed + T.strideSprint[2], 1);
    give(d, 'stride', 1);
    d.run(2.5, RUN);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed + T.strideSprint[3] + T.overdriveBonus, 1);
  });

  test('Glide: slides go further; the Charged Slide becomes the Slingshot', async () => {
    const dist = async (lv: number) => {
      const d = await flat();
      give(d, 'glide', lv);
      d.run(2, RUN);
      const z0 = d.pl.pos.z;
      d.tick({ ...RUN, slide: true });
      d.until(() => d.pl.state !== MoveState.Slide, { ...RUN, slideHeld: true }, 5);
      return d.pl.pos.z - z0;
    };
    expect(await dist(1)).toBeGreaterThan((await dist(0)) + 1);
    const d = await flat();
    give(d, 'glide', 3);
    let sling = 0;
    evo(d).events.on('boost', (b) => b.kind === 'slingshot' && sling++);
    d.run(2, RUN);
    d.tick({ ...RUN, slide: true });
    d.run(0.6, { ...RUN, slideHeld: true });
    const before = d.pl.speed;
    d.tick({ ...RUN, slideHeld: true, jump: true });
    expect(sling).toBe(1);
    expect(d.pl.speed).toBeGreaterThan(before + T.slingshotForward - 0.5);
  });

  test('Spring: higher jumps, a Triple Jump at level 2, Hover at level 5', async () => {
    const apex = async (lv: number) => {
      const d = await flat();
      give(d, 'spring', lv);
      d.tick({ jump: true });
      let top = 0;
      d.until(() => ((top = Math.max(top, d.pl.pos.y)), d.pl.grounded), { jumpHeld: true }, 3);
      return top;
    };
    expect(await apex(1)).toBeGreaterThan((await apex(0)) + 0.1);
    expect(await apex(5)).toBeGreaterThan((await apex(0)) + 0.35);
    const d = await flat();
    give(d, 'spring', 2);
    d.tick({ jump: true });
    d.run(0.2, { jumpHeld: true });
    d.tick({ jump: true });
    d.run(0.2, { jumpHeld: true });
    d.tick({ jump: true });
    expect(d.sim.stats.doubleJumps).toBe(2);
    expect(d.pl.vel.y).toBeGreaterThan(cfg.doubleJumpVelocity);
    d.run(0.2, { jumpHeld: true });
    d.tick({ jump: true });
    expect(d.sim.stats.doubleJumps).toBe(2); // only one extra
    const fall = async (lv: number) => {
      const t = await makeEvoSim((b) => b.plat(0, 0, 0, 12, 12, { dress: false }), [0, 30, 0]);
      give(t, 'spring', lv);
      t.run(0.6, { jumpHeld: true });
      return t.pl.vel.y;
    };
    expect(await fall(5)).toBeGreaterThan((await fall(4)) + 4);
  });

  test('Phase Dash: faster dashes, a third charge at level 2, phasing through beams at level 4', async () => {
    const d = await flat();
    give(d, 'phase', 2);
    d.run(1, RUN);
    expect(d.pl.dashCharges).toBe(3);
    for (let i = 0; i < 3; i++) {
      d.tick({ ...RUN, dash: true });
      d.run(0.32, RUN);
    }
    expect(d.sim.stats.dashes).toBe(3);
    const beam = (b: LevelBuilder) => {
      floor(b);
      b.entity({ type: 'hazard', p: [0, 1, 12], s: [12, 3, 0.4] });
    };
    for (const [lv, dies] of [
      [3, true],
      [4, false],
    ] as const) {
      const t = await makeEvoSim(beam);
      t.settle();
      give(t, 'phase', lv);
      t.until(() => t.pl.pos.z > 9.5, RUN);
      t.tick({ ...RUN, dash: true });
      t.run(0.4, RUN);
      expect(t.sim.stats.deaths > 0, `phase ${lv}`).toBe(dies);
    }
  });

  test('Wallrunner: longer wall-runs; Wall Surge throws you forward off the wall', async () => {
    const corridor = (b: LevelBuilder) => {
      b.plat(0, 0, 0, 12, 20, { dress: false });
      b.wall(-3.2, -2, 25, 0.6, 8, 30);
      b.plat(0, 0, 60, 12, 30, { dress: false });
    };
    const run = async (lv: number) => {
      const d = await makeEvoSim(corridor, [-2.2, 0, 0]);
      d.settle();
      give(d, 'wallrunner', lv);
      d.run(0.9, RUN);
      d.until(() => d.pl.pos.z > 9.3, RUN);
      d.tick({ ...RUN, jump: true, yaw: FWD - 0.25 });
      d.until(() => d.pl.state === MoveState.WallRun, RUN, 1);
      return d;
    };
    expect((await run(4)).pl.wallMax).toBeGreaterThan((await run(0)).pl.wallMax + 0.3);
    const plain = await run(2),
      surge = await run(3);
    for (const d of [plain, surge]) {
      d.run(0.3, RUN);
      d.tick({ ...RUN, jump: true });
    }
    expect(surge.pl.speed).toBeGreaterThan(plain.pl.speed + T.wallSurge - 0.6);
  });

  test('Flywheel: a higher speed ceiling and slower-fading overspeed', async () => {
    const coast = async (lv: number) => {
      const d = await makeEvoSim((b) => b.plat(0, 0, 0, 12, 12, { dress: false }), [0, 60, 0]);
      give(d, 'flywheel', lv);
      d.pl.vel.z = 48;
      d.run(1.5);
      return d.pl.speed;
    };
    const base = await coast(0),
      top = await coast(4);
    expect(top).toBeGreaterThan(base + 2);
    expect(top).toBeLessThan(cfg.softSpeedCap + T.flyCap[4] + 8);
  });

  test('Edge swings faster; Reach cuts further; Mirror Edge further still', async () => {
    const windowAt = async (lv: number) => {
      const d = await flat();
      give(d, 'edge', lv);
      d.tick({ attack: true });
      return d.until(() => d.sim.sword.cutting, {}, 1);
    };
    expect(await windowAt(4)).toBeLessThan((await windowAt(0)) * 0.85);
    const far = async (lv: number) => {
      const d = await makeEvoSim((b) => {
        floor(b);
        b.breakable('target', 0, 0, 3.75);
      });
      d.settle();
      give(d, 'reach', lv);
      d.tick({ attack: true });
      d.run(0.5);
      return d.sim.broken[0];
    };
    expect(await far(0)).toBe(false);
    expect(await far(3)).toBe(true);
  });

  test('Edge 3 Crescent cuts ahead; Severance 3 finisher cuts all around; Siphon pays Flux', async () => {
    const make = (z: number) =>
      makeEvoSim((b) => {
        floor(b);
        b.breakable('crate', 0, 0, z);
      });
    const c = await make(5.5);
    c.settle();
    give(c, 'edge', 3);
    c.tick({ attack: true });
    c.run(0.4);
    expect(c.sim.broken[0]).toBe(true);
    const s = await make(-3);
    s.settle();
    give(s, 'severance', 3);
    give(s, 'siphon', 1);
    s.tick({ sword: true });
    s.run(0.3);
    for (let i = 0; i < 90; i++) s.tick({ attack: i % 12 === 0 });
    expect(s.sim.broken[0]).toBe(true); // behind the runner: only the shockwave reaches it
    expect(evo(s).flux).toBeGreaterThanOrEqual(T.siphonFlux[1]);
  });

  test('Aegis absorbs a lethal hit, then recharges; level 3 also catches a fall', async () => {
    const beam = (b: LevelBuilder) => {
      floor(b);
      b.entity({ type: 'hazard', p: [0, 1, 12], s: [12, 3, 0.4] });
    };
    const none = await makeEvoSim(beam);
    none.settle();
    none.run(2.5, RUN);
    expect(none.sim.stats.deaths).toBe(1);
    const d = await makeEvoSim(beam);
    d.settle();
    give(d, 'aegis', 1);
    d.run(2.5, RUN);
    expect(d.sim.stats.deaths).toBe(0);
    expect(evo(d).aegisReady).toBe(false);
    d.run(T.aegisRecharge[1] + 0.2, { moveZ: 0 });
    expect(evo(d).aegisReady).toBe(true);
    const v = await makeEvoSim((b) => b.plat(0, 0, 0, 8, 30, { dress: false }));
    v.settle();
    give(v, 'aegis', 3);
    let caught = 0;
    evo(v).events.on('aegis', (a) => a.kind === 'void' && caught++);
    v.until(() => caught > 0 || v.sim.stats.deaths > 0, RUN, 8); // off the far edge into the void
    expect(caught).toBe(1);
    expect(v.sim.stats.deaths).toBe(0);
    expect(v.pl.pos.y).toBeGreaterThan(-1);
    v.until(() => v.sim.stats.deaths > 0, RUN, 8);
    expect(v.sim.stats.deaths).toBe(1); // only once
    expect(caught).toBe(1);
  });

  test('Reflex slows the world just before a hazard', async () => {
    const d = await makeEvoSim((b) => {
      floor(b);
      b.entity({ type: 'hazard', p: [0, 1, 14], s: [12, 3, 0.4] });
    });
    d.settle();
    give(d, 'reflex', 1);
    let at = -1;
    evo(d).events.on('reflex', () => (at = d.pl.pos.z));
    d.run(3, RUN);
    expect(at).toBeGreaterThan(8);
    expect(at).toBeLessThan(14);
  });

  test('Steady gives speed back on landing; level 2 Shockwave Landing breaks things', async () => {
    const d = await makeEvoSim(
      (b) => {
        b.plat(0, 0, 0, 12, 12, { dress: false });
        b.breakable('crate', 2.5, 0, 0);
      },
      [0, 12, 0],
    );
    give(d, 'steady', 2);
    let land = 0;
    evo(d).events.on('shockwave', (s) => s.kind === 'land' && land++);
    d.until(() => d.pl.grounded, {}, 3);
    expect(land).toBe(1);
    expect(d.sim.broken[0]).toBe(true);
  });

  test('Timeslip: Surge spends Flux and slows the world (not the runner)', async () => {
    const mk = () =>
      makeEvoSim((b) => {
        floor(b);
        b.entity({
          type: 'mover',
          s: [2, 1, 2],
          path: [
            [6, 3, 20],
            [6, 3, 60],
          ],
          speed: 4,
          pause: 0,
        });
      });
    const n = await mk();
    n.settle();
    const ms = n.sim.entities[0] as unknown as { p: { z: number } };
    const z0 = ms.p.z;
    n.run(1, RUN);
    const normal = ms.p.z - z0;
    const d = await mk();
    d.settle();
    give(d, 'timeslip', 1);
    d.tick({ surge: true }); // no Flux yet: nothing
    expect(evo(d).surgeLeft).toBe(0);
    evo(d).addFlux(40);
    const m = d.sim.entities[0] as unknown as { p: { z: number } };
    const m0 = m.p.z;
    d.tick({ ...RUN, surge: true });
    expect(evo(d).surgeLeft).toBeGreaterThan(0);
    expect(evo(d).flux).toBeCloseTo(10, 0);
    d.run(1, RUN);
    expect(m.p.z - m0).toBeCloseTo(normal * T.timeslipScale[1], 0);
    expect(d.pl.speed).toBeGreaterThan(9); // the runner keeps full speed
  });

  test('mythics: Overclock keeps Flow, Chrono Heart makes Surge free at tier 3', async () => {
    const d = await flat();
    give(d, 'overclock');
    d.run(3, { moveZ: 0 });
    expect(evo(d).flowTier).toBe(2);
    const c = await flat();
    give(c, 'timeslip');
    give(c, 'chrono');
    evo(c).flow = FLOW_TIERS[3];
    evo(c).action('dash', 0);
    c.tick({ surge: true });
    expect(evo(c).surgeLeft).toBeGreaterThan(T.timeslipTime[1]);
    expect(evo(c).flux).toBe(0);
  });
});

describe('Flow and the momentum links', () => {
  test('varied actions build Flow tiers faster than repeating one; it drains when you stop', async () => {
    const d = await flat();
    const e = evo(d);
    for (const k of ['jump', 'slide', 'dash', 'wall', 'vault']) e.action(k, 10);
    const varied = e.flow;
    const r = await flat();
    for (let i = 0; i < 5; i++) evo(r).action('jump', 10);
    expect(varied).toBeGreaterThan(evo(r).flow * 1.5);
    expect(e.flowTier).toBeGreaterThanOrEqual(2);
    d.run(4, { moveZ: 0 });
    expect(e.flowTier).toBe(0);
  });

  test('Flow raises sprint speed by tier', async () => {
    const d = await flat();
    const e = evo(d);
    d.run(2, RUN);
    e.flow = FLOW_TIERS[2];
    e.action('jump', 0);
    d.run(0.8, RUN);
    expect(e.flowTier).toBe(2);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed + 0.6, 1);
  });

  test('jumping out of a slide launches harder than a plain jump', async () => {
    const d = await flat();
    d.run(2, RUN);
    d.tick({ ...RUN, slide: true });
    d.run(0.2, { ...RUN, slideHeld: true });
    const s = d.pl.speed;
    d.tick({ ...RUN, slideHeld: true, jump: true });
    expect(d.pl.speed).toBeGreaterThan(s + 0.8);
  });

  test('a slash straight out of a dash extends it', async () => {
    const d = await flat();
    let ext = 0;
    evo(d).events.on('boost', (b) => b.kind === 'dashcut' && ext++);
    d.run(1.5, RUN);
    d.tick({ ...RUN, dash: true });
    d.until(() => d.pl.state !== MoveState.Dash, RUN, 1);
    d.tick({ ...RUN, attack: true });
    d.until(() => ext > 0, RUN, 0.3);
    expect(ext).toBe(1);
  });
});

describe('synergies', () => {
  test('each unlocks exactly when both abilities reach their levels, and is announced', async () => {
    for (const s of SYNERGIES) {
      const d = await flat();
      const got: string[] = [];
      evo(d).events.on('synergy', (x) => got.push(x.id));
      for (const [id, lv] of s.needs.slice(0, -1)) give(d, id, lv);
      const [lastId, lastLv] = s.needs[s.needs.length - 1];
      give(d, lastId, lastLv - 1);
      expect(got, s.id).not.toContain(s.id);
      give(d, lastId, 1);
      expect(got, s.id).toContain(s.id);
    }
  });

  test('Phantom Cut: dashing through a breakable cuts it', async () => {
    const d = await makeEvoSim((b) => {
      floor(b);
      b.breakable('crate', 0.8, 0, 12);
    });
    d.settle();
    give(d, 'phase', 2);
    give(d, 'edge', 2);
    d.until(() => d.pl.pos.z > 9, RUN);
    d.tick({ ...RUN, dash: true });
    d.run(0.4, RUN);
    expect(d.sim.broken[0]).toBe(true);
    expect(d.sim.stats.cuts).toBe(1);
  });

  test('Skybreaker: slide in the air slams down with a shockwave', async () => {
    const d = await makeEvoSim((b) => b.plat(0, 0, 0, 12, 12, { dress: false }), [0, 12, 0]);
    give(d, 'spring', 2);
    give(d, 'phase', 2);
    let slam = 0;
    evo(d).events.on('shockwave', (s) => s.kind === 'slam' && slam++);
    d.run(0.1);
    d.tick({ slide: true });
    expect(d.pl.vel.y).toBeLessThan(-29);
    d.until(() => d.pl.grounded, {}, 2);
    expect(slam).toBe(1);
  });

  test('Railgun: fast slides barely slow; Dynamo: wall-running charges Flux', async () => {
    const d = await flat();
    give(d, 'glide', 2);
    give(d, 'flywheel', 2);
    d.run(1, RUN);
    d.pl.vel.z = 20;
    d.tick({ ...RUN, slide: true });
    d.run(0.5, { ...RUN, slideHeld: true });
    expect(d.pl.speed).toBeGreaterThan(19);
  });

  test('Dynamo: wall-running charges Flux and the dash', async () => {
    const corridor = (b: LevelBuilder) => {
      b.plat(0, 0, 0, 12, 20, { dress: false });
      b.wall(-3.2, -2, 25, 0.6, 8, 30);
      b.plat(0, 0, 60, 12, 30, { dress: false });
    };
    const d = await makeEvoSim(corridor, [-2.2, 0, 0]);
    d.settle();
    give(d, 'wallrunner', 2);
    give(d, 'siphon', 1);
    d.run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3, RUN);
    d.tick({ ...RUN, jump: true, yaw: FWD - 0.25 });
    d.until(() => d.pl.state === MoveState.WallRun, RUN, 1);
    const f0 = evo(d).flux;
    d.run(0.8, RUN);
    expect(evo(d).flux - f0).toBeGreaterThan(3);
  });

  test('Updraft turns speed into height; Skybreaker aims air dashes steeply up', async () => {
    const d = await flat();
    give(d, 'spring', 2);
    give(d, 'flywheel', 2);
    let up = 0;
    evo(d).events.on('boost', (b) => b.kind === 'updraft' && up++);
    d.run(1, RUN);
    d.pl.vel.z = 20;
    d.tick({ ...RUN, jump: true });
    expect(up).toBe(1);
    expect(d.pl.vel.y).toBeGreaterThan(cfg.jumpVelocity + T.springJump[2] + 0.5);
    const s = await flat();
    give(s, 'spring', 2);
    give(s, 'phase', 2);
    s.tick({ jump: true });
    s.run(0.1, { jumpHeld: true });
    s.tick({ dash: true, pitch: 1.2 });
    s.run(0.05, { pitch: 1.2 });
    expect(s.pl.vel.y).toBeGreaterThan(cfg.dashSpeed * Math.sin(cfg.dashMaxPitchDeg * (Math.PI / 180)) + 3);
  });

  test('Steady gives speed back after a landing', async () => {
    const land = async (lv: number) => {
      const d = await flat();
      give(d, 'steady', lv);
      d.run(1.5, RUN);
      d.tick({ ...RUN, jump: true });
      d.until(() => d.pl.grounded, RUN, 2);
      return d.pl.speed;
    };
    expect(await land(1)).toBeGreaterThan((await land(0)) + 0.6);
  });

  test('Guardian Tempo: the shield breaking slows time for free', async () => {
    const d = await makeEvoSim((b) => {
      floor(b);
      b.entity({ type: 'hazard', p: [0, 1, 12], s: [12, 3, 0.4] });
    });
    d.settle();
    give(d, 'aegis');
    give(d, 'reflex');
    evo(d).reflexCd = 99; // its own trigger is on cooldown
    let reflex = 0;
    evo(d).events.on('reflex', () => reflex++);
    d.run(2.5, RUN);
    expect(d.sim.stats.deaths).toBe(0);
    expect(reflex).toBe(1);
  });
});

describe('the run', () => {
  test('a checkpoint respawn keeps upgrades and Flux; a restart starts the run over', async () => {
    const d = await flat();
    give(d, 'stride', 2);
    evo(d).addFlux(20);
    evo(d).action('jump', 30);
    d.sim.kill('test');
    d.run(0.4);
    expect(evo(d).level('stride')).toBe(2);
    expect(evo(d).flux).toBeGreaterThan(10);
    expect(evo(d).flow).toBe(0);
    d.sim.restart();
    expect(evo(d).totalLevels).toBe(0);
    expect(evo(d).flux).toBe(0);
  });

  test('restarts reseed the layout; the same seed replays exactly', async () => {
    const e = levels.find((l) => l.meta.id === 'awakening')!;
    const data = (await e.load()).build();
    const slots = slotsOf('awakening');
    const a = new Simulation(e.meta, data, { evolve: { seed: 99, slots } });
    const first = a.evo!.items.map((x) => x.p.join());
    a.restart();
    expect(a.evo!.items.map((x) => x.p.join())).not.toEqual(first);
    const run = () => {
      const s = new Simulation(e.meta, data, { evolve: { seed: 5, slots } });
      const bot = new Bot(s);
      for (let t = 0; t < 120 * 30; t++) s.tick(bot.step());
      return [s.player.pos.x, s.player.pos.y, s.player.pos.z, s.evo!.flux, s.evo!.totalLevels];
    };
    expect(run()).toEqual(run());
  });

  test('a fully evolved runner still cannot pass through a wall at top speed', async () => {
    const d = await makeEvoSim((b) => {
      b.plat(0, 0, 20, 12, 60, { dress: false });
      b.solid({ p: [0, 2, 30], s: [12, 6, 0.6], mat: 'base' });
    });
    d.settle();
    for (const id of ['flywheel', 'phase', 'stride', 'overclock'] as AbilityId[])
      give(d, id, ABILITIES[id].max);
    d.pl.vel.z = 46;
    for (let i = 0; i < 120; i++) {
      d.tick({ ...RUN, dash: i % 40 === 0 });
      expect(d.pl.pos.z).toBeLessThan(30);
    }
  });
});
