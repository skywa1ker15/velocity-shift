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
import { Collapse, Structure } from '../../src/entities/Entities';
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

const RUN: Keys = { moveZ: 1, moveX: 0, sprint: false };
const SPRINT: Keys = { moveZ: 1, moveX: 0, sprint: true };

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

describe('Level 5, Ink Falls: the gorge comes apart', () => {
  const C = -22,
    K = C - 25;

  test.each([
    ['a plain run', RUN, false],
    ['a dashing sprint', SPRINT, true],
  ])('(1) the pillar topples into a bridge ahead of %s', async (_n, keys, dash) => {
    const { d, deaths } = await at('inkfalls', 259);
    const s = hold(d, keys, 320, 20, (p) =>
      dash && p.z > 262 && d.pl.dashCharges > 0 ? { dash: true } : {},
    );
    expect(deaths()).toBe(0);
    const onBeam = s.filter((p) => p.z > 300 && p.z < 315);
    expect(onBeam.length).toBeGreaterThan(0);
    for (const p of onBeam) expect(p.y).toBeGreaterThan(C - 0.6);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(2) running into a brace brings the pillar down in time for %s: no stop', async (_n, keys) => {
    const { sim, d, deaths } = await at('inkfalls', 321);
    const s = hold(d, keys, 380, 20);
    expect(deaths()).toBe(0);
    const bi = sim.data.breakables.findIndex((b) => b.fires === 'pillar2' && b.p[0] === 0);
    expect(sim.broken[bi]).toBe(true);
    // never had to wait: still moving at speed across the gap
    expect(Math.min(...s.filter((p) => p.z > 345 && p.z < 370).map((p) => p.speed))).toBeGreaterThan(6);
  });

  test('(2) cutting a brace from the side fires the same event', async () => {
    const { sim, d } = await at('inkfalls', 321);
    const tower = sim.entities.find((e): e is Structure => e instanceof Structure && e.def.id === 'pillar2')!;
    const bi = sim.data.breakables.findIndex((b) => b.fires === 'pillar2' && b.p[0] > 3);
    (sim as unknown as { breakObject(i: number, by: string): void }).breakObject(bi, 'sword');
    d.run(3, {});
    expect(tower.stage).toBeGreaterThanOrEqual(2);
  });

  test('(2) slipping between the braces is never a soft-lock: wait at the edge and it falls', async () => {
    const { sim, d, deaths } = await at('inkfalls', 321);
    // run the gap between two braces, stop at the edge, wait, go
    hold(d, { moveZ: 1, moveX: 0, sprint: false }, 323, 5, () => ({ moveX: 0 }));
    d.pl.pos.x = 1.6;
    hold(d, RUN, 350.5, 10);
    expect(sim.broken.filter((b, i) => b && sim.data.breakables[i].fires).length).toBe(0);
    d.run(3, { moveZ: 0 });
    hold(d, RUN, 380, 10);
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(380);
  });

  test.each([
    ['a plain run', RUN, 0],
    ['a sprint', SPRINT, 0],
    ['a run after waiting for it to settle', RUN, 6],
  ])('(3) the Cascade: %s hops down the falling slabs, every step down', async (_n, keys, wait) => {
    const { d, deaths } = await at('inkfalls', 379);
    if (wait) {
      hold(d, RUN, 382, 5); // set it off
      d.run(wait, { moveZ: 0 });
    }
    const s = hold(d, keys, 462, 30);
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(462);
    expect(s[s.length - 1].y).toBeCloseTo(K, 0);
    // on the slabs the ground only ever steps down (never a climb)
    const g = s.filter((p) => p.grounded && p.z > 399 && p.z < 455).map((p) => p.y);
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeLessThanOrEqual(g[i - 1] + 0.05);
    expect(Math.min(...g)).toBeLessThan(C - 20);
  });
});

describe('Level 6, Faceted: the folds (left and right rotation)', () => {
  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(1) fold left: %s stays on the tube floor as it turns 90° left', async (_n, keys) => {
    const { d, deaths } = await at('faceted', 251);
    const s = hold(d, keys, 335, 30);
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(335);
    const end = s.filter((p) => p.z > 315);
    for (const p of end) expect(p.up.x).toBeLessThan(-0.99); // gravity now pulls toward +X
    expect(
      s.filter((p) => p.z > 276).filter((p) => p.grounded).length / s.filter((p) => p.z > 276).length,
    ).toBeGreaterThan(0.9);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(2) fold right through 180°: %s goes over the top to the other wall', async (_n, keys) => {
    const { d, deaths } = await at('faceted', 326);
    const s = hold(d, keys, 405, 30);
    expect(deaths()).toBe(0);
    expect(Math.min(...s.map((p) => p.up.y))).toBeLessThan(-0.9); // upside down on the way over
    for (const p of s.filter((q) => q.z > 396)) expect(p.up.x).toBeGreaterThan(0.99); // now pulls toward -X
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(3) the Crossing: %s jumps across twice, gravity flipping 180° each time', async (_n, keys) => {
    const { d, deaths } = await at('faceted', 406);
    let jumps = 0;
    const s = hold(d, keys, 465, 30, (p) => {
      if (p.grounded && ((jumps === 0 && p.z > 416.2) || (jumps === 1 && p.z > 440.2)))
        return (jumps++, { jump: true });
    });
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(465);
    expect(s.some((p) => p.grounded && p.z > 425 && p.z < 438 && p.x > 1.9 && p.up.x < -0.99)).toBe(true);
    expect(s.some((p) => p.grounded && p.z > 452 && p.x < -1.9 && p.up.x > 0.99)).toBe(true);
  });

  test('(3) a tapped jump (released at once, so cut short) still crosses both times', async () => {
    const { d, deaths } = await at('faceted', 406);
    let jumps = 0;
    hold(d, SPRINT, 465, 30, (p) => {
      if (p.grounded && ((jumps === 0 && p.z > 416.2) || (jumps === 1 && p.z > 440.2)))
        return (jumps++, { jump: true });
      return { jumpHeld: false };
    });
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(465);
  });

  test('(3) the gaps are real: no jump, no crossing', async () => {
    const { d, deaths } = await at('faceted', 406);
    hold(d, SPRINT, 430, 10);
    d.run(2, SPRINT);
    expect(deaths()).toBeGreaterThan(0);
  });

  test.each([
    ['a wall-run', true],
    ['a double jump', false],
  ])('(4) unfold, then %s over the floor gap and out over the falling tiles', async (_n, wallrun) => {
    const { sim, d, deaths } = await at('faceted', 462);
    let jumped = 0;
    hold(d, SPRINT, 590, 30, (p) => {
      if (p.z > 496 && p.z < 512 && wallrun) {
        const k: Keys = { moveX: p.z < 503 ? -0.6 : -0.15 };
        if (jumped === 0 && p.grounded && p.z > 502.3) return (jumped++, { ...k, jump: true });
        return k;
      }
      if (!wallrun && p.z > 502.8 && jumped === 0 && p.grounded) return (jumped++, { jump: true });
      if (!wallrun && jumped === 1 && !p.grounded && d.pl.vel.y < 0) return (jumped++, { jump: true });
    });
    expect(deaths()).toBe(0);
    expect(sim.stats.finished).toBe(true);
  });
});

describe('Level 7, Blockfall: the blocks turn (up/down rotation)', () => {
  const S = 5,
    U = 21,
    Y0 = -1,
    C = 15;

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(1) the Climb: %s runs up the curve, straight up the face and over the top', async (_n, keys) => {
    const { d, deaths } = await at('blockfall', 240);
    const s = hold(d, keys, 290, 20);
    expect(deaths()).toBe(0);
    const onFace = s.filter((p) => p.grounded && p.z > 274.9 && p.z < 275.1 && p.y > S + 6 && p.y < S + 10);
    expect(onFace.length).toBeGreaterThan(0);
    for (const p of onFace) expect(p.up.z).toBeLessThan(-0.99); // the face is the floor
    expect(s[s.length - 1].y).toBeCloseTo(U, 0);
    // the climb costs no speed
    if (keys.sprint) expect(Math.min(...onFace.map((p) => p.speed))).toBeGreaterThan(10.5);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('(2) the Drop: %s runs over the edge and straight down the face', async (_n, keys) => {
    const { d, deaths } = await at('blockfall', 284);
    const s = hold(d, keys, 320, 20);
    expect(deaths()).toBe(0);
    const onFace = s.filter((p) => p.grounded && Math.abs(p.z - 305) < 0.1 && p.y < U - 6 && p.y > Y0 + 6);
    expect(onFace.length).toBeGreaterThan(0);
    for (const p of onFace) expect(p.up.z).toBeGreaterThan(0.99);
    expect(s[s.length - 1].y).toBeCloseTo(Y0, 0);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])(
    '(3) the Turnover: %s goes up, onto the ceiling upside down, crosses lanes and comes out below',
    async (_n, keys) => {
      const { sim, d, deaths } = await at('blockfall', 314);
      // the main line's own route from the runway, driven at this pace
      const { Bot } = await import('../../src/gameplay/Bot');
      const bot = new Bot(sim);
      while (bot.index < sim.data.bot.length && sim.data.bot[bot.index].p[2] < 355) bot.index++;
      const s: Sample[] = [];
      for (let i = 0; i < 120 * 30 && !(d.pl.pos.x > 4.5 && d.pl.pos.z > 330 && d.pl.pos.y < Y0 + 0.2); i++) {
        const inp = bot.step();
        inp.sprint = !!keys.sprint;
        sim.tick(inp);
        const u = d.pl.upAxis();
        s.push({
          x: d.pl.pos.x,
          y: d.pl.pos.y,
          z: d.pl.pos.z,
          up: { x: u.x, y: u.y, z: u.z },
          speed: d.pl.speed,
          grounded: d.pl.grounded,
        });
      }
      expect(deaths()).toBe(0);
      const inverted = s.filter((p) => p.grounded && p.up.y < -0.99);
      expect(inverted.length / 120).toBeGreaterThan(2); // seconds running upside down
      for (const p of inverted) expect(p.y).toBeCloseTo(C, 0);
      expect(inverted.some((p) => p.x < 1.5) && inverted.some((p) => p.x > 4.5)).toBe(true); // crossed lanes up there
      expect(d.pl.pos.x).toBeGreaterThan(4.5); // out in lane B
    },
  );

  test('(3) the wall between the lanes: no way into lane B but over the top', async () => {
    const { d } = await at('blockfall', 314);
    hold(d, { moveZ: 1, moveX: 1, sprint: true }, 340, 6);
    hold(d, { moveZ: 1, moveX: -1, sprint: true }, 340, 2);
    expect(d.pl.pos.x).toBeLessThan(2.6);
  });

  test.each([
    ['a plain run with the double jump', RUN, true],
    ['a sprint', SPRINT, false],
  ])('(4) climb, jump, drop: %s reaches the finish', async (_n, keys, dbl) => {
    const { sim, d, deaths } = await at('blockfall', 368);
    let j = 0;
    hold(d, keys, 470, 30, (p) => {
      if (j === 0 && p.grounded && p.z > 414.4 && p.y > 14) return (j++, { jump: true });
      if (dbl && j === 1 && !p.grounded && d.pl.vel.y < 0) return (j++, { jump: true });
    });
    expect(deaths()).toBe(0);
    expect(sim.stats.finished).toBe(true);
  });
});

describe('Level 8, Corrupted Core: Meltdown (everything at once)', () => {
  const CE = 20,
    LD = -18,
    TP = -2,
    CP = -36;
  const collapses = (sim: Simulation, z0: number, z1: number) =>
    sim.entities.filter((e): e is Collapse => e instanceof Collapse && e.def.p[2] > z0 && e.def.p[2] < z1);

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])(
    'Breach: %s launches, runs the ceiling upside down as it collapses, and survives the 38 m fall',
    async (_n, keys) => {
      const { sim, d, deaths } = await at('core', 258);
      const panels = collapses(sim, 268, 317);
      expect(panels).toHaveLength(8);
      const gone = new Set<Collapse>();
      const s = hold(d, keys, 340, 20, () => {
        for (const p of panels) if (p.phase !== 0) gone.add(p);
      });
      expect(deaths()).toBe(0);
      const inverted = s.filter((p) => p.grounded && p.up.y < -0.99);
      expect(inverted.length / 120).toBeGreaterThan(1.5);
      for (const p of inverted) expect(p.y).toBeCloseTo(CE, 0);
      expect(gone.size).toBeGreaterThanOrEqual(6); // it came apart behind
      expect(Math.min(...s.map((p) => p.y))).toBeCloseTo(LD, 0);
    },
  );

  test('Breach: stopping on the ceiling is fatal (the destruction is real)', async () => {
    const { d, deaths } = await at('core', 258);
    hold(d, SPRINT, 285, 10);
    d.run(5, { moveZ: 0 });
    expect(deaths()).toBeGreaterThan(0);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('Twist & Climb: %s rides the tube left and back, then runs up the face and over', async (_n, keys) => {
    const { d, deaths } = await at('core', 358);
    const s = hold(d, keys, 442, 30);
    expect(deaths()).toBe(0);
    expect(s.some((p) => p.grounded && p.up.x < -0.99)).toBe(true); // rolled left
    expect(s.filter((p) => p.z > 415 && p.z < 425).every((p) => p.up.y > 0.95)).toBe(true); // and back
    expect(s.some((p) => p.grounded && p.up.z < -0.99 && p.y > LD + 6)).toBe(true); // up the face
    expect(s[s.length - 1].y).toBeCloseTo(TP, 0);
  });

  test.each([
    ['running into the braces', 0],
    ['slipping between them and waiting', 1.05],
  ])('Twist & Climb: the tower falls for %s', async (_n, x) => {
    const { sim, d, deaths } = await at('core', 440);
    d.pl.pos.x = x;
    hold(d, RUN, 459, 10);
    d.run(2.5, { moveZ: 0 });
    d.pl.pos.x = 0;
    hold(d, RUN, 486, 10);
    expect(deaths()).toBe(0);
    expect(d.pl.pos.z).toBeGreaterThanOrEqual(486);
    if (x === 0) expect(sim.broken.some((b, i) => b && sim.data.breakables[i].fires === 'tower')).toBe(true);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])(
    'the Core Plunge: %s drops 40 m, is thrown onto the wall, runs it as it falls away and reaches the core',
    async (_n, keys) => {
      const { sim, d, deaths } = await at('core', 500);
      const panels = collapses(sim, 540, 566);
      expect(panels).toHaveLength(4);
      const gone = new Set<Collapse>();
      const s = hold(d, keys, 605, 30, () => {
        for (const p of panels) if (p.phase !== 0) gone.add(p);
      });
      expect(deaths()).toBe(0);
      expect(sim.stats.finished).toBe(true);
      expect(Math.min(...s.map((p) => p.y))).toBeLessThan(-40);
      expect(s.some((p) => p.grounded && p.up.x < -0.99 && Math.abs(p.x - 6) < 0.15)).toBe(true);
      expect(gone.size).toBeGreaterThanOrEqual(3);
      expect(
        s.filter((p) => p.grounded && p.z > 590 && p.z < 600).every((p) => Math.abs(p.y - CP) < 0.5),
      ).toBe(true);
    },
  );
});

describe('Level 9, Shift Point: the finale', () => {
  const H = 4,
    SU = 34,
    LP = 12;

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('the Barrel Roll: %s stays on the floor through a full 360°', async (_n, keys) => {
    const { d, deaths } = await at('shiftpoint', 486);
    const s = hold(d, keys, 622, 30);
    expect(deaths()).toBe(0);
    const inside = s.filter((p) => p.z > 506 && p.z < 620);
    // every way up, in turn: sideways, upside down, the other side, upright again
    expect(inside.some((p) => p.up.x < -0.99)).toBe(true);
    expect(inside.some((p) => p.up.y < -0.99)).toBe(true);
    expect(inside.some((p) => p.up.x > 0.99)).toBe(true);
    expect(s[s.length - 1].up.y).toBeGreaterThan(0.99);
    expect(inside.filter((p) => p.grounded).length / inside.length).toBeGreaterThan(0.9);
  });

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])(
    'the Grand Climb and the Falling Summit: %s goes up 20 m, over, and down the falling stair',
    async (_n, keys) => {
      const { d, deaths } = await at('shiftpoint', 622.5);
      const s = hold(d, keys, 700, 30);
      expect(deaths()).toBe(0);
      expect(s.some((p) => p.grounded && p.up.z < -0.99 && p.y > H + 20)).toBe(true); // high on the face
      const stair = s.filter((p) => p.grounded && p.z > 646 && p.z < 692).map((p) => p.y);
      for (let i = 1; i < stair.length; i++) expect(stair[i]).toBeLessThanOrEqual(stair[i - 1] + 0.05);
      expect(Math.max(...stair)).toBeGreaterThan(SU - 1);
      expect(s[s.length - 1].y).toBeCloseTo(LP, 0);
    },
  );

  test.each([
    ['a plain run', RUN],
    ['a sprint', SPRINT],
  ])('the Last Slingshot: %s flies through the ring and floats down to the finish', async (_n, keys) => {
    const { sim, d, deaths } = await at('shiftpoint', 698.5);
    hold(d, keys, 790, 20);
    expect(deaths()).toBe(0);
    expect(sim.stats.finished).toBe(true);
  });
});
