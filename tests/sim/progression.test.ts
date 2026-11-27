/**
 * Mechanic progression: each course's Dynamic World set-pieces, played through the real
 * simulation from the checkpoint before them at several human paces (not only the autopilot's).
 * Every new mechanic must (a) actually happen — the geometry moves, gravity turns — and (b) be
 * survivable at a plain run as well as a sprint, with momentum carried through.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { Simulation } from '../../src/gameplay/Simulation';
import { levelById } from '../../src/levels/registry';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { Structure } from '../../src/entities/Entities';
import { Driver, type Keys } from './harness';

beforeAll(async () => {
  await initPhysics();
});

/** A course, respawned at the checkpoint nearest `z` (the timer keeps running, as in play). */
async function at(id: string, z: number) {
  const e = levelById(id)!;
  const sim = new Simulation(e.meta, (await e.load()).build());
  let best = 0;
  sim.data.checkpoints.forEach((c, i) => {
    if (Math.abs(c.p[2] - z) < Math.abs(sim.data.checkpoints[best].p[2] - z)) best = i;
  });
  sim.checkpoint = best;
  sim.restartFromCheckpoint();
  const d = new Driver(sim);
  let deaths = 0;
  sim.events.on('death', () => deaths++);
  return { sim, d, deaths: () => deaths };
}

interface Sample {
  z: number;
  y: number;
  x: number;
  up: { x: number; y: number; z: number };
  speed: number;
  grounded: boolean;
}

/** Hold `keys` until the player passes `zEnd` (or dies / times out); sample every tick. */
function hold(d: Driver, keys: Keys, zEnd: number, seconds = 30, onTick?: (s: Sample) => Keys | void) {
  const out: Sample[] = [];
  const n = seconds * 120;
  let first = true;
  for (let i = 0; i < n && d.pl.pos.z < zEnd && !d.sim.dead; i++) {
    const u = d.pl.upAxis();
    const s: Sample = {
      z: d.pl.pos.z,
      y: d.pl.pos.y,
      x: d.pl.pos.x,
      up: { x: u.x, y: u.y, z: u.z },
      speed: d.pl.speed,
      grounded: d.pl.grounded,
    };
    out.push(s);
    const extra = onTick?.(s) ?? {};
    d.tick({ ...keys, ...(first ? {} : { jump: false, dash: false, slide: undefined }), ...extra });
    first = false;
  }
  return out;
}

const RUN: Keys = { moveZ: 1, sprint: false };
const SPRINT: Keys = { moveZ: 1, sprint: true };

describe('Level 3, Momentum: the first Dynamic World act', () => {
  test('the turntable bridge swings into place ahead of a dashing sprinter from the crusher exit', async () => {
    const { sim, d, deaths } = await at('momentum', 374);
    const tt = sim.entities.find((e): e is Structure => e instanceof Structure && e.def.id === 'turntable')!;
    expect(tt).toBeDefined();
    let dashed = 0;
    const s = hold(d, SPRINT, 440, 20, (smp) => {
      // dash every time a charge is available: the fastest a player can get there
      if (smp.z > 380 && dashed < 3 && smp.grounded && d.pl.dashCharges > 0) {
        dashed++;
        return { dash: true };
      }
    });
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(440);
    // the span really turned: it is now lying along the course
    const crossing = s.filter((p) => p.z > 417 && p.z < 431);
    expect(crossing.length).toBeGreaterThan(0);
    for (const p of crossing) expect(p.y).toBeGreaterThan(-21.5);
    expect(Math.abs(tt.q.y)).toBeGreaterThan(0.69); // ≈ 90° about Y
  });

  test.each([
    ['slide', true],
    ['run', false],
  ])('the gravity chute leans gravity forward and feeds a %s', async (_n, slide) => {
    const { d, deaths } = await at('momentum', 437);
    const s = hold(d, SPRINT, 500, 20, (smp) =>
      slide && smp.z > 449.5 && smp.z < 451 ? { slide: true } : {},
    );
    expect(deaths()).toBe(0);
    const onChute = s.filter((p) => p.z > 455 && p.z < 485);
    // gravity leans 17° forward (the frame's up tips back), then rights itself after the chute
    expect(Math.min(...onChute.map((p) => p.up.y))).toBeLessThan(0.97);
    expect(Math.min(...onChute.map((p) => p.up.z))).toBeLessThan(-0.25);
    expect(s[s.length - 1].up.y).toBeGreaterThan(0.99);
    if (slide) expect(Math.max(...s.map((p) => p.speed))).toBeGreaterThan(22);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])(
    'the Roll: %s stays on the channel floor through the whole quarter turn, speed intact',
    async (_n, keys) => {
      const { d, deaths } = await at('momentum', 500);
      const s = hold(d, keys, 600, 30);
      expect(deaths()).toBe(0);
      expect(d.pl.pos.z).toBeGreaterThanOrEqual(600);
      const inside = s.filter((p) => p.z > 520 && p.z < 580);
      // the full quarter turn happens inside the channel: up ends pointing along +X
      expect(Math.max(...inside.map((p) => p.up.x))).toBeGreaterThan(0.99);
      const rolled = inside.filter((p) => p.up.x > 0.99);
      expect(rolled.length / 120).toBeGreaterThan(0.8); // well over half a second of running on the old wall
      // on the floor, not flung about: grounded nearly all the way through
      expect(inside.filter((p) => p.grounded).length / inside.length).toBeGreaterThan(0.9);
      // momentum: the roll itself costs no speed
      const before = s.find((p) => p.z > 520)!.speed;
      const mid = rolled[Math.floor(rolled.length / 2)].speed;
      expect(mid).toBeGreaterThanOrEqual(Math.min(before, keys.sprint ? 10.5 : 6.5) - 0.3);
      // and gravity is normal again on the deck after it
      expect(s[s.length - 1].up.y).toBeGreaterThan(0.99);
    },
  );
});

describe('Level 4, Breakpoint: the gravity blocks, one at a time', () => {
  const L = -8,
    R = 10,
    E = -6,
    F = -20,
    G = -24,
    U = -10;

  test.each([
    ['a sprint and one jump', SPRINT, false],
    ['a plain run with the double jump', RUN, true],
  ])('(1) light gravity: %s floats the 20 m gap', async (_n, keys, dbl) => {
    const { d, deaths } = await at('breakpoint', 276);
    let jumped = 0;
    const s = hold(d, keys, 334, 20, (p) => {
      if (jumped === 0 && p.z > 306.2) return (jumped++, { jump: true });
      if (dbl && jumped === 1 && !p.grounded && d.pl.vel.y < 0) return (jumped++, { jump: true });
    });
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(334);
    expect(Math.min(...s.filter((p) => p.z > 327).map((p) => p.y))).toBeGreaterThan(L - 0.5);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(2) the launch pad puts %s on the roof', async (_n, keys) => {
    const { d, deaths } = await at('breakpoint', 331);
    const s = hold(d, keys, 366, 20);
    expect(deaths()).toBe(0);
    expect(s[s.length - 1].y).toBeCloseTo(R, 0);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(3) %s off the roof falls 42 m and the spring throws it over the ledge', async (_n, keys) => {
    const { d, deaths } = await at('breakpoint', 358);
    const s = hold(d, keys, 430, 30);
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(430);
    expect(Math.min(...s.map((p) => p.y))).toBeLessThan(-30); // it really was the long way down
    expect(s[s.length - 1].y).toBeCloseTo(E, 0);
  });

  test.each([
    ['from a run', RUN],
    ['from a sprint', SPRINT],
  ])('(4) heavy gravity: a slide down the chute %s clears the gap', async (_n, keys) => {
    const { d, deaths } = await at('breakpoint', 424);
    const s = hold(d, keys, 500, 20, (p) => {
      if (p.z > 435.5 && p.z < 437) return { slide: true };
      if (p.z > 467 && p.z < 469) return { jump: p.grounded, slideHeld: false };
    });
    expect(deaths()).toBe(0);
    expect(Math.max(...s.map((p) => p.speed))).toBeGreaterThan(25);
    expect(s[s.length - 1].y).toBeCloseTo(F, 0);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])(
    '(5) sideways gravity: %s stepping off the edge lands on the billboard and back down',
    async (_n, keys) => {
      const { d, deaths } = await at('breakpoint', 502);
      const s = hold(d, keys, 585, 30);
      expect(deaths()).toBe(0);
      expect(d.pl.pos.z).toBeGreaterThanOrEqual(585);
      expect(s.some((p) => p.grounded && p.up.x < -0.99 && Math.abs(p.x - 7.5) < 0.1)).toBe(true);
      expect(s[s.length - 1].up.y).toBeGreaterThan(0.99);
      expect(s[s.length - 1].y).toBeCloseTo(G, 0);
    },
  );

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(6) reverse gravity: %s falls up onto the overpass, runs it and drops back', async (_n, keys) => {
    const { d, deaths } = await at('breakpoint', 580);
    const s = hold(d, keys, 668, 30);
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(668);
    const under = s.filter((p) => p.grounded && p.up.y < -0.99);
    expect(under.length / 120).toBeGreaterThan(2); // seconds of running upside down
    for (const p of under) expect(p.y).toBeCloseTo(U, 0);
    expect(s[s.length - 1].y).toBeCloseTo(G, 0);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(7) launch + light gravity: %s floats to the finish', async (_n, keys) => {
    const { sim, d, deaths } = await at('breakpoint', 664);
    hold(d, keys, 740, 20);
    expect(deaths()).toBe(0);
    expect(sim.stats.finished).toBe(true);
  });
});
