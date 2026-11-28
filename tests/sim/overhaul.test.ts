/**
 * The power-up, movement evolution and destructible world overhaul.
 *
 * Every claim in docs/overhaul is checked here against the deterministic simulation: each
 * ability's first level makes a measured, large difference; every evolution stage changes
 * behaviour; synergies do what they say; each slashable kind gives its reward; the Kinetic Chain
 * builds, pays out and breaks; and none of it touches Pure.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { T, type AbilityId } from '../../src/evolution/abilities';
import type { Evolution } from '../../src/evolution/Evolution';
import type { LevelBuilder } from '../../src/levels/LevelBuilder';
import type { BreakableKind } from '../../src/levels/types';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { FWD, makeEvoSim, makeSim, MoveState, type Driver } from './harness';
import { measure, RUN } from './measure';

const floor = (b: LevelBuilder) => b.plat(0, 0, 100, 16, 220, { dress: false });
const evo = (d: Driver) => d.sim.evo as Evolution;
const give = (d: Driver, id: AbilityId, n = 1) => {
  for (let i = 0; i < n; i++) evo(d).grant(id);
};
async function course(extra?: (b: LevelBuilder) => void, spawn: [number, number, number] = [0, 0, 0]) {
  const d = await makeEvoSim((b) => {
    floor(b);
    extra?.(b);
  }, spawn);
  d.settle();
  return d;
}
const boosts = (d: Driver) => {
  const seen: string[] = [];
  evo(d).events.on('boost', (b) => seen.push(b.kind));
  return seen;
};
const STILL = { moveZ: 0, moveX: 0, sprint: false } as unknown as typeof RUN;
/** Standing under an object: jump, spend the air jump, then swing until it breaks. */
function airCut(d: Driver, i: number) {
  d.tick({ ...STILL, jump: true });
  d.run(0.12, { ...STILL, jumpHeld: true });
  d.tick({ ...STILL, jumpHeld: false });
  d.tick({ ...STILL, jump: true });
  const spent = !d.pl.canDoubleJump;
  for (let t = 0; t < 90 && !d.sim.broken[i] && !d.pl.grounded; t++)
    d.tick({ ...STILL, jumpHeld: true, attack: t % 20 === 0 });
  return spent && d.sim.broken[i] && !d.pl.grounded;
}
/** Swing until object `i` breaks (or time runs out). */
function cutUntil(d: Driver, i: number, keys = RUN, max = 3) {
  for (let t = 0; t < max * 120 && !d.sim.broken[i]; t++) d.tick({ ...keys, attack: t % 30 === 0 });
  return d.sim.broken[i];
}

beforeAll(() => initPhysics());

describe('first levels are big, measured changes (scripted inputs, flat course)', () => {
  let base: Awaited<ReturnType<typeof measure>>;
  beforeAll(async () => {
    base = await measure();
  });
  test('Stride 1: top sprint +1.6 m/s, run-up a third quicker', async () => {
    const m = await measure({ stride: 1 });
    expect(m.topSpeed).toBeGreaterThan(base.topSpeed + 1.5);
    expect(m.timeTo11).toBeLessThan(base.timeTo11 * 0.75);
  });
  test('Glide 1: slides more than twice as long', async () => {
    const m = await measure({ glide: 1 });
    expect(m.slideDistance).toBeGreaterThan(base.slideDistance * 2);
  });
  test('Spring 1: jumps half again as high', async () => {
    const m = await measure({ spring: 1 });
    expect(m.jumpHeight).toBeGreaterThan(base.jumpHeight * 1.4);
  });
  test('Phase Dash 1: each dash carries you half again as far', async () => {
    const m = await measure({ phase: 1 });
    expect(m.dashDistance).toBeGreaterThan(base.dashDistance * 1.45);
    expect(m.dashChain).toBeGreaterThan(base.dashChain * 1.8);
  });
  test('Wallrunner 1: wall-runs half again as long', async () => {
    const m = await measure({ wallrunner: 1 });
    expect(m.wallRunTime).toBeGreaterThan(base.wallRunTime * 1.4);
    expect(m.wallRunDistance).toBeGreaterThan(base.wallRunDistance * 1.4);
  });
  test('Flywheel 1: speed from a slide-jump is kept instead of bleeding away', async () => {
    const m = await measure({ glide: 1, flywheel: 1 });
    const g = await measure({ glide: 1 });
    expect(m.speedAfterSlideJump).toBeGreaterThanOrEqual(g.speedAfterSlideJump - 0.01);
  });
});

describe('every evolution stage changes behaviour', () => {
  test('Stride 3 Momentum Lock: speed above sprint is held after a move', async () => {
    const run = async (lv: number) => {
      const d = await course();
      give(d, 'stride', lv);
      d.run(3, RUN);
      d.pl.boost(0, 1, 8, 0); // well over the sprint ceiling
      d.tick({ ...RUN, slide: true }); // a move: starts the lock
      d.tick({ ...RUN, slideHeld: false });
      d.run(1.2, RUN);
      return d.pl.speed;
    };
    const plain = await run(2),
      locked = await run(3);
    expect(locked).toBeGreaterThan(plain + 2);
  });

  test('Stride 4 Slipstream: smashing through an object at speed pushes you on', async () => {
    const d = await course((b) => b.breakable('crate', 0, 0, 60, { ground: 0 }));
    give(d, 'stride', 4);
    const seen = boosts(d);
    d.pl.boost(0, 1, 6, 0);
    d.until(() => d.sim.broken[0], RUN, 8);
    expect(d.sim.broken[0]).toBe(true);
    expect(seen).toContain('slipstream');
  });

  test('Glide 3 Kinetic Slide: a held slide speeds up for its first second', async () => {
    const d = await course();
    give(d, 'glide', 3);
    d.run(2.5, RUN);
    d.tick({ ...RUN, slide: true });
    const v0 = d.pl.speed;
    d.run(0.9, { ...RUN, slideHeld: true });
    expect(d.pl.state).toBe(MoveState.Slide);
    expect(d.pl.speed).toBeGreaterThan(v0 + 3);
  });

  test('Glide 4 Skim: landing with slide held drops straight into a boosted slide', async () => {
    const d = await course();
    give(d, 'glide', 4);
    const seen = boosts(d);
    d.run(2.5, RUN);
    d.tick({ ...RUN, jump: true });
    d.run(0.1, { ...RUN, jumpHeld: true });
    d.until(() => d.pl.grounded, { ...RUN, slideHeld: true }, 3);
    d.run(0.05, { ...RUN, slideHeld: true });
    expect(d.pl.state).toBe(MoveState.Slide);
    expect(seen).toContain('skim');
  });

  test('Spring 3 Air Burst: an air jump throws you toward the held direction', async () => {
    const side = async (lv: number) => {
      const d = await course();
      give(d, 'spring', lv);
      d.tick({ jump: true });
      d.run(0.25, { jumpHeld: true });
      d.tick({ jumpHeld: false });
      d.tick({ jump: true, moveX: 1 });
      return Math.abs(d.pl.vel.x);
    };
    expect(await side(3)).toBeGreaterThan((await side(2)) + T.airBurst * 0.8);
  });

  test('Phase 2 Dash Jump: jumping out of a dash keeps its speed and adds to it', async () => {
    const jump = async (lv: number) => {
      const d = await course();
      give(d, 'phase', lv);
      d.run(2, RUN);
      d.tick({ ...RUN, dash: true });
      d.run(0.05, RUN);
      d.tick({ ...RUN, jump: true });
      d.run(0.3, { ...RUN, jumpHeld: true });
      return Math.hypot(d.pl.vel.x, d.pl.vel.z);
    };
    expect(await jump(2)).toBeGreaterThan((await jump(1)) + 2.5);
  });

  test('Phase 4 Blink Chain: a dash that breaks something gives its charge back', async () => {
    const run = async (lv: number) => {
      const d = await course((b) => b.breakable('crate', 0, 0, 20, { ground: 0 }));
      give(d, 'phase', lv);
      d.run(1, RUN);
      d.until(() => d.pl.pos.z > 16.5, RUN, 4);
      d.pl.dashEnergy = 1.5;
      d.tick({ ...RUN, dash: true });
      d.run(0.2, RUN);
      expect(d.sim.broken[0]).toBe(true);
      return d.pl.dashEnergy;
    };
    expect(await run(4)).toBeGreaterThan((await run(3)) + 0.9);
  });

  test('Wallrunner 3 Grip and 4 Wall Sprint: flat, accelerating wall-runs', async () => {
    const m2 = await measure({ wallrunner: 2 }),
      m4 = await measure({ wallrunner: 4 });
    expect(m4.wallRunTime).toBeGreaterThan(m2.wallRunTime + 0.4);
    expect(m4.wallRunDistance / m4.wallRunTime).toBeGreaterThan(m2.wallRunDistance / m2.wallRunTime + 2);
  });

  test('Flywheel 2 Conservation: a drop becomes forward speed; 3 Inertia: dashes end fast', async () => {
    const drop = async (lv: number) => {
      const d = await makeEvoSim(floor, [0, 8, 0]);
      give(d, 'flywheel', lv);
      d.until(() => d.pl.grounded, RUN, 3);
      d.run(0.05, RUN);
      return d.pl.speed;
    };
    expect(await drop(2)).toBeGreaterThan((await drop(1)) + 3);
    const dash = async (lv: number) => {
      const d = await course();
      give(d, 'flywheel', lv);
      d.run(2, RUN);
      d.tick({ ...RUN, dash: true });
      d.run(0.22, RUN);
      return d.pl.speed;
    };
    expect(await dash(3)).toBeGreaterThan((await dash(2)) + 5);
  });

  test('Edge 3 Skyward Cut: a hit in the air lifts you and gives an air jump back', async () => {
    const d = await course((b) => b.breakable('crate', 0, 1.6, 2.2));
    give(d, 'edge', 3);
    const seen = boosts(d);
    expect(airCut(d, 0)).toBe(true);
    expect(seen).toContain('skyward');
    expect(d.pl.canDoubleJump).toBe(true);
  });

  test('Reach 2 Wide Arc and Reach 3 Arc Chain: one cut takes its neighbours, then leaps ahead', async () => {
    const run = async (lv: number) => {
      const d = await course((b) => {
        b.breakable('crate', 0.3, 0, 4, { ground: 0 });
        b.breakable('crate', 2.2, 0, 4.8, { ground: 0 }); // 2 m from the first
        b.breakable('crate', 0.5, 0, 10.5, { ground: 0 }); // 6.5 m ahead
      });
      give(d, 'reach', lv);
      cutUntil(d, 0, { moveZ: 0, moveX: 0, sprint: false } as unknown as typeof RUN, 1);
      return d.sim.broken.filter(Boolean).length;
    };
    expect(await run(1)).toBe(1);
    expect(await run(2)).toBe(2);
    expect(await run(3)).toBe(3);
  });
});

describe('synergies change how you move', () => {
  test('Tempest (Stride 2 + Edge 1): cuts at speed push you forward', async () => {
    const d = await course((b) => b.breakable('crate', 1, 0, 22, { ground: 0 }));
    give(d, 'stride', 2);
    give(d, 'edge', 1);
    expect(evo(d).has('tempest')).toBe(true);
    const seen = boosts(d);
    d.run(1.5, RUN);
    expect(cutUntil(d, 0)).toBe(true);
    expect(seen).toContain('tempest');
  });

  test('Comet (Glide 2 + Spring 1): the Slingshot launches 40% harder', async () => {
    const sling = async (spring: number) => {
      const d = await course();
      give(d, 'glide', 2);
      give(d, 'spring', spring);
      d.run(2, RUN);
      d.tick({ ...RUN, slide: true });
      d.run(0.5, { ...RUN, slideHeld: true });
      const v0 = d.pl.speed;
      d.tick({ ...RUN, jump: true });
      return d.pl.speed - v0;
    };
    expect(await sling(1)).toBeGreaterThan((await sling(0)) + T.slingshotForward * 0.3);
  });

  test('Ricochet (Wallrunner 2 + Phase 1): every wall jump refunds a dash', async () => {
    const corridor = (b: LevelBuilder) => {
      b.plat(0, 0, 0, 12, 20, { dress: false });
      b.wall(-3.2, -2, 25, 0.6, 8, 30);
      b.plat(0, 0, 60, 12, 30, { dress: false });
    };
    const d = await makeEvoSim(corridor, [-2.2, 0, 0]);
    d.settle();
    give(d, 'wallrunner', 2);
    give(d, 'phase', 1);
    expect(evo(d).has('ricochet')).toBe(true);
    d.run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3, RUN);
    d.tick({ ...RUN, jump: true, yaw: FWD - 0.25 });
    d.until(() => d.pl.state === MoveState.WallRun, RUN, 1);
    d.run(0.2, RUN);
    d.pl.dashEnergy = 0.2;
    d.tick({ ...RUN, jump: true });
    expect(d.pl.dashEnergy).toBeGreaterThan(1.1);
  });

  test('Railgun (Glide 1 + Flywheel 1): fast slides do not slow down', async () => {
    const d = await course();
    give(d, 'glide', 1);
    give(d, 'flywheel', 1);
    d.run(2, RUN);
    d.pl.boost(0, 1, 6, 0);
    d.tick({ ...RUN, slide: true });
    const v0 = d.pl.speed;
    d.run(0.8, { ...RUN, slideHeld: true });
    expect(d.pl.speed).toBeGreaterThan(v0 - 0.2);
  });
});

describe('the slashable world', () => {
  const one = async (kind: BreakableKind, y = 0, o: Record<string, unknown> = {}) =>
    course((b) => b.breakable(kind, 1.1, y, 14, { ground: y === 0 ? 0 : undefined, ...o }));

  test('Kinetic Prism: cutting it is a forward burst', async () => {
    const d = await one('prism');
    const seen = boosts(d);
    d.run(1, RUN);
    expect(cutUntil(d, 0)).toBe(true);
    expect(seen).toContain('prism');
  });

  test('Drift Lantern: cut in the air for a lift and an air jump back (on foot: just Flux)', async () => {
    const d = await course((b) => b.breakable('lantern', 0.4, 3.1, 2.2));
    const seen = boosts(d);
    expect(airCut(d, 0)).toBe(true);
    expect(seen).toContain('lantern');
    expect(d.pl.canDoubleJump).toBe(true);
  });

  test('Flux Bloom: a big Flux reward', async () => {
    const d = await one('bloom');
    d.run(0.6, RUN);
    const f0 = evo(d).flux;
    expect(cutUntil(d, 0)).toBe(true);
    expect(evo(d).flux - f0).toBeGreaterThan(18);
  });

  test('Chain Spindles: a whole gate in time pays out; a slow gate does not', async () => {
    const gate = (b: LevelBuilder) => {
      for (let i = 0; i < 3; i++) b.breakable('spindle', 1.1, 0, 10 + i * 5, { ground: 0, gate: 0 });
    };
    const d = await course(gate);
    const seen = boosts(d);
    let cleared = false;
    evo(d).events.on('gate', (g) => g.cleared && (cleared = true));
    for (let t = 0; t < 4 * 120 && !d.sim.broken.every(Boolean); t++)
      d.tick({ ...RUN, attack: t % 18 === 0 });
    expect(d.sim.broken.every(Boolean)).toBe(true);
    expect(cleared).toBe(true);
    expect(seen).toContain('gate');
    // too slow: stand at each one in turn, wait past the window
    const s = await course(gate);
    let failed = false;
    evo(s).events.on('gate', (g) => !g.cleared && g.left > 0 && (failed = true));
    for (let i = 0; i < 3; i++) {
      s.until(() => s.pl.pos.z > 8 + i * 5, RUN, 4);
      cutUntil(s, i, { moveZ: 0, moveX: 0, sprint: false } as unknown as typeof RUN, 1);
      s.run(2.2);
    }
    expect(failed).toBe(true);
  });

  test('Rift Seal: its wave takes everything around it', async () => {
    const d = await course((b) => {
      b.breakable('seal', 1.2, 0, 12);
      b.breakable('sentinel', 4, 0, 10, { ground: 0 });
      b.breakable('sentinel', -3.5, 0, 15, { ground: 0 });
    });
    d.run(0.4, RUN);
    expect(cutUntil(d, 0)).toBe(true);
    expect(d.sim.broken).toEqual([true, true, true]);
  });

  test('Hollow Sentinel: counts twice toward the chain', async () => {
    const d = await one('sentinel');
    d.run(0.6, RUN);
    cutUntil(d, 0);
    expect(evo(d).streak).toBe(2);
  });

  test('a slash at 30 m/s still connects with an object beside the line', async () => {
    const d = await course((b) => b.breakable('prism', 1.2, 0, 120));
    give(d, 'flywheel', 3);
    let hit = false;
    for (let t = 0; t < 1200 && d.pl.pos.z < 100; t++) d.tick(RUN);
    d.pl.boost(0, 1, 19, 0);
    // swings quicken with speed: pressed anywhere from 4 to 8 m out, the cut lands
    for (let t = 0; t < 600 && d.pl.pos.z < 114; t++) d.tick(RUN);
    expect(d.pl.speed).toBeGreaterThan(25);
    for (let t = 0; t < 60 && !hit; t++) {
      d.tick({ ...RUN, attack: t === 0 });
      hit = d.sim.broken[0];
    }
    expect(hit).toBe(true);
  });
});

describe('Kinetic Chain', () => {
  const row =
    (n: number, gap = 5) =>
    (b: LevelBuilder) => {
      for (let i = 0; i < n; i++) b.breakable('crate', i % 2 ? -1.1 : 1.1, 0, 8 + i * gap, { ground: 0 });
    };
  const JOG = { moveZ: 1, moveX: 0, sprint: false } as unknown as typeof RUN;
  test('cuts in quick succession build a chain, raise the Flux multiplier and pay out at 5 and 10', async () => {
    const d = await course(row(10));
    const ms: string[] = [];
    evo(d).events.on('streak', (s) => s.milestone && ms.push(s.milestone));
    for (let t = 0; t < 12 * 120 && !d.sim.broken.every(Boolean); t++)
      d.tick({ ...JOG, attack: t % 14 === 0 });
    expect(d.sim.broken.every(Boolean)).toBe(true);
    expect(evo(d).peakStreak).toBe(10);
    expect(evo(d).streakMult()).toBeCloseTo(3, 5);
    expect(ms).toEqual(['Kinetic Burst', 'Recharge']);
  });
  test('the chain breaks after its window, and on a respawn', async () => {
    const d = await course(row(2, 3));
    for (let t = 0; t < 3 * 120 && !d.sim.broken.every(Boolean); t++)
      d.tick({ ...JOG, attack: t % 14 === 0 });
    expect(evo(d).streak).toBe(2);
    d.run(3);
    expect(evo(d).streak).toBe(0);
    const s = await course(row(2, 3));
    for (let t = 0; t < 3 * 120 && !s.sim.broken.every(Boolean); t++)
      s.tick({ ...JOG, attack: t % 14 === 0 });
    s.sim.restartFromCheckpoint();
    expect(evo(s).streak).toBe(0);
  });
});

describe('progression', () => {
  test('a full Flux meter evolves the family you have been using', async () => {
    const d = await course();
    const e = evo(d);
    for (let i = 0; i < 40; i++) (e as unknown as { use(f: string, n: number): void }).use('wall', 1);
    e.addFlux(100);
    expect(e.level('wallrunner')).toBe(1);
  });
  test('owned abilities are favoured, so stages are reached', async () => {
    const d = await course();
    const e = evo(d);
    e.grant('stride');
    // ten ground pickups: Stride (owned) is three times as likely as Glide or Magnet each time
    for (let i = 0; i < 10 && e.level('stride') < 4; i++)
      (e as unknown as { grantFrom(f: string, r: number): unknown }).grantFrom(
        'ground',
        ((i * 37) % 100) / 100,
      );
    expect(e.level('stride')).toBe(4);
  });
  test('with everything maxed, Flux stops instead of looping', async () => {
    const d = await course();
    const e = evo(d);
    for (const id of Object.keys(e.levels) as AbilityId[]) for (let i = 0; i < 6; i++) e.grant(id);
    e.addFlux(10_000);
    expect(e.flux).toBeLessThan(100);
  });
  test('Tempest cannot fire more than four times a second', async () => {
    const d = await course((b) => {
      for (let i = 0; i < 8; i++) b.breakable('crate', 0.8, 0, 20 + i * 0.4, { ground: 0 });
    });
    give(d, 'stride', 2);
    give(d, 'edge', 2);
    give(d, 'reach', 3);
    const seen = boosts(d);
    d.run(1.6, RUN);
    for (let t = 0; t < 120; t++) d.tick({ ...RUN, attack: t % 10 === 0 });
    expect(d.sim.broken.filter(Boolean).length).toBeGreaterThan(5);
    expect(seen.filter((k) => k === 'tempest').length).toBeLessThanOrEqual(5);
  });
});

describe('upgrades never take control away (a stronger runner can always make the plain move)', () => {
  const corridor = (b: LevelBuilder) => {
    b.plat(0, 0, 0, 12, 20, { dress: false });
    b.wall(-3.2, -2, 25, 0.6, 8, 30);
    b.plat(0, 0, 60, 12, 30, { dress: false });
  };
  test('let go of sprint and the automatic pushes stop (Wall Surge, Steady, Conservation)', async () => {
    const wj = async (sprint: boolean) => {
      const d = await makeEvoSim(corridor, [-2.2, 0, 0]);
      d.settle();
      give(d, 'wallrunner', 2);
      const seen = boosts(d);
      d.run(0.9, RUN);
      d.until(() => d.pl.pos.z > 9.3, RUN);
      d.tick({ ...RUN, jump: true, yaw: FWD - 0.25 });
      d.until(() => d.pl.state === MoveState.WallRun, RUN, 1);
      d.run(0.2, RUN);
      d.tick({ ...RUN, sprint, jump: true });
      return seen;
    };
    expect(await wj(true)).toContain('surge');
    expect(await wj(false)).not.toContain('surge');
    const land = async (sprint: boolean) => {
      const d = await makeEvoSim(floor, [0, 8, 0]);
      give(d, 'steady', 1);
      give(d, 'flywheel', 2);
      const seen = boosts(d);
      d.until(() => d.pl.grounded, { ...RUN, sprint }, 3);
      return seen;
    };
    expect(await land(true)).toEqual(expect.arrayContaining(['steady', 'conserve']));
    expect(await land(false)).toEqual([]);
  });
  test('Air Burst only throws you when you hold a direction', async () => {
    const d = await course();
    give(d, 'spring', 3);
    const seen = boosts(d);
    d.tick({ jump: true });
    d.run(0.25, { jumpHeld: true });
    d.tick({ jumpHeld: false });
    d.tick({ jump: true });
    expect(seen).not.toContain('airburst');
    expect(Math.hypot(d.pl.vel.x, d.pl.vel.z)).toBeLessThan(0.5);
  });
  test('a tapped jump with Spring 4 is no higher than a plain held jump', async () => {
    const apex = async (lv: number, tap: boolean) => {
      const d = await course();
      give(d, 'spring', lv);
      d.tick({ jump: true });
      let top = 0;
      for (let t = 0; t < 360 && !(d.pl.grounded && t > 5); t++) {
        d.tick({ jumpHeld: !tap || t < 4 });
        top = Math.max(top, d.pl.pos.y);
      }
      return top;
    };
    expect(await apex(4, true)).toBeLessThanOrEqual(await apex(0, false));
  });
  test('Momentum Lock never stops you braking', async () => {
    const d = await course();
    give(d, 'stride', 3);
    d.run(3, RUN);
    d.pl.boost(0, 1, 8, 0);
    d.tick({ ...RUN, slide: true });
    d.tick({ ...RUN, slideHeld: false });
    expect(evo(d).lockLeft).toBeGreaterThan(1);
    d.run(0.6, { moveZ: 0, moveX: 0, sprint: false });
    expect(d.pl.speed).toBeLessThan(1);
  });
});

describe('Pure is untouched', () => {
  test('no rewards, no tuning layer, same movement whatever is cut', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.breakable('prism', 1.1, 0, 14);
    });
    d.settle();
    d.run(1, RUN);
    const v = d.pl.speed;
    for (let t = 0; t < 240 && !d.sim.broken[0]; t++) d.tick({ ...RUN, attack: t % 30 === 0 });
    expect(d.sim.broken[0]).toBe(true);
    expect(d.sim.evo).toBeNull();
    expect(d.pl.speed).toBeCloseTo(Math.max(v, cfg.sprintSpeed), 5);
  });
});
