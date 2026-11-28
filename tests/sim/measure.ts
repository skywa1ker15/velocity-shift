/**
 * Movement measurements for Evolve: the same scripted inputs on the same test course, with and
 * without upgrades, so changes are measured (not guessed). Used by tests/sim/overhaul.test.ts and
 * the audit table in docs/overhaul.
 */
import type { LevelBuilder } from '../../src/levels/LevelBuilder';
import type { Evolution } from '../../src/evolution/Evolution';
import type { AbilityId } from '../../src/evolution/abilities';
import { makeEvoSim, MoveState, type Driver } from './harness';

export const RUN = { moveZ: 1, moveX: 0, sprint: true };
const course = (b: LevelBuilder) => {
  b.plat(0, 0, 100, 16, 220, { dress: false });
  b.wall(-4.2, -2, 330, 0.6, 9, 120);
  b.plat(0, 0, 260, 16, 60, { dress: false });
  b.plat(0, -40, 420, 200, 200, { dress: false }); // catch floor under the wall
};

export type Build = Partial<Record<AbilityId, number>>;
export async function sim(build: Build = {}, spawn: [number, number, number] = [0, 0, 0]) {
  const d = await makeEvoSim(course, spawn);
  const e = d.sim.evo as Evolution;
  for (const [id, n] of Object.entries(build)) for (let i = 0; i < (n ?? 0); i++) e.grant(id as AbilityId);
  d.settle();
  return d;
}

const horiz = (d: Driver) => Math.hypot(d.pl.vel.x, d.pl.vel.z);

export interface Measures {
  topSpeed: number;
  timeTo11: number;
  jumpHeight: number;
  airJumpsHeight: number;
  slideDistance: number;
  slideExitSpeed: number;
  slideJumpDistance: number;
  dashDistance: number;
  dashChain: number;
  wallRunTime: number;
  wallRunDistance: number;
  speedAfterSlideJump: number;
  [k: string]: number;
}

export async function measure(build: Build = {}): Promise<Measures> {
  const m = {} as Measures;
  // sprint: top speed after 5 s, time to 11 m/s from a stand
  {
    const d = await sim(build);
    let t11 = -1,
      top = 0;
    for (let i = 0; i < 600; i++) {
      d.tick(RUN);
      const s = horiz(d);
      top = Math.max(top, s);
      if (t11 < 0 && s >= 10.9) t11 = (i + 1) / 120;
    }
    m.topSpeed = top;
    m.timeTo11 = t11;
  }
  // standing jump height
  {
    const d = await sim(build);
    const y0 = d.pl.pos.y;
    let peak = y0;
    d.tick({ jump: true, jumpHeld: true });
    for (let i = 0; i < 240 && !(d.pl.grounded && i > 10); i++) {
      d.tick({ jumpHeld: true });
      peak = Math.max(peak, d.pl.pos.y);
    }
    m.jumpHeight = peak - y0;
  }
  // every air jump, pressed at each apex
  {
    const d = await sim(build);
    const y0 = d.pl.pos.y;
    let peak = y0;
    d.tick({ jump: true, jumpHeld: true });
    let released = false;
    for (let i = 0; i < 600 && !(d.pl.grounded && i > 10); i++) {
      // at each apex: let go for a tick, then press again
      if (d.pl.upSpeed < 0 && !released) {
        d.tick({ jumpHeld: false });
        released = true;
      } else if (released) {
        d.tick({ jump: true, jumpHeld: true });
        released = false;
        for (let k = 0; k < 6; k++) d.tick({ jumpHeld: true });
      } else d.tick({ jumpHeld: true });
      peak = Math.max(peak, d.pl.pos.y);
    }
    m.airJumpsHeight = peak - y0;
  }
  // slide from a full sprint: distance until the slide ends, speed when it ends
  {
    const d = await sim(build);
    d.run(3, RUN);
    const z0 = d.pl.pos.z;
    d.tick({ ...RUN, slide: true });
    let t = 0;
    while (d.pl.state === MoveState.Slide && t < 1200) {
      d.tick({ ...RUN, slideHeld: true });
      t++;
    }
    m.slideDistance = d.pl.pos.z - z0;
    m.slideExitSpeed = horiz(d);
  }
  // slide 0.6 s, then jump: horizontal distance of the jump, speed on landing
  {
    const d = await sim(build);
    d.run(3, RUN);
    d.tick({ ...RUN, slide: true });
    d.run(0.6, { ...RUN, slideHeld: true });
    const z0 = d.pl.pos.z;
    d.tick({ ...RUN, jump: true, slideHeld: false });
    d.until(() => d.pl.grounded, { ...RUN, jumpHeld: true, slideHeld: false }, 4);
    m.slideJumpDistance = d.pl.pos.z - z0;
    m.speedAfterSlideJump = horiz(d);
  }
  // one dash from a run: distance covered in 0.5 s from the press, minus a plain run's
  {
    const a = await sim(build);
    a.run(2, RUN);
    const za = a.pl.pos.z;
    a.tick({ ...RUN, dash: true });
    a.run(0.5, RUN);
    const b = await sim(build);
    b.run(2, RUN);
    const zb = b.pl.pos.z;
    b.run(0.5 + 1 / 120, RUN);
    m.dashDistance = a.pl.pos.z - za - (b.pl.pos.z - zb);
    // every charge back to back
    const c = await sim(build);
    c.run(2, RUN);
    const zc = c.pl.pos.z;
    for (let i = 0; i < 6; i++) {
      c.tick({ ...RUN, dash: true });
      c.run(0.32, RUN);
    }
    m.dashChain = c.pl.pos.z - zc - 6 * 0.33 * 11;
  }
  // wall-run: start at sprint speed along the long wall, hold forward
  {
    const d = await sim(build, [-3, 0, 250]);
    d.run(1.6, RUN);
    d.until(() => d.pl.pos.z > 272, RUN, 3);
    d.tick({ ...RUN, jump: true, yaw: Math.PI - 0.3 });
    d.until(() => d.pl.state === MoveState.WallRun, { ...RUN, yaw: Math.PI - 0.3 }, 1);
    const z0 = d.pl.pos.z;
    let n = 0;
    while (d.pl.state === MoveState.WallRun && n < 2400) {
      d.tick({ ...RUN, yaw: Math.PI - 0.15 });
      n++;
    }
    m.wallRunTime = n / 120;
    m.wallRunDistance = d.pl.pos.z - z0;
  }
  return m;
}
