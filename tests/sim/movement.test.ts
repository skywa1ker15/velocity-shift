/**
 * Headless movement tests: the real controller + physics driven by scripted input.
 * These are the Phase 2 exit gate (docs/TESTING.md).
 */
import { describe, expect, test } from 'vitest';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { FWD, makeSim, MoveState } from './harness';

const floor = (b: any) => b.plat(0, 0, 60, 40, 240, { dress: false });
const RUN = { moveZ: 1, sprint: true };

describe('ground movement', () => {
  test('accelerates through run speed up to sprint speed, with a ramp', async () => {
    const d = await makeSim(floor);
    d.settle().run(0.15, RUN);
    expect(d.pl.speed).toBeGreaterThan(6.5);
    expect(d.pl.speed).toBeLessThan(9);
    d.run(1.0);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed, 1);
    expect(d.pl.state).toBe(MoveState.Sprint);
  });

  test('stops quickly with no input', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    const t = d.until(() => d.pl.speed < 0.05, { moveZ: 0 });
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.3);
    expect(d.pl.state).toBe(MoveState.Idle);
  });

  test('walking without sprint tops out at run speed', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.5, { moveZ: 1, sprint: false });
    expect(d.pl.speed).toBeCloseTo(cfg.runSpeed, 1);
  });

  test('ground height is rock steady while running (no camera jitter source)', async () => {
    const d = await makeSim(floor);
    d.settle().run(0.5, RUN);
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 0; i < 240; i++) {
      d.tick();
      lo = Math.min(lo, d.pl.pos.y);
      hi = Math.max(hi, d.pl.pos.y);
    }
    expect(hi - lo).toBeLessThan(0.001);
  });

  test('small steps are climbed without losing speed', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.plat(0, 0.3, 20, 10, 6, { h: 0.3, dress: false });
    });
    d.settle().run(1.2, RUN);
    d.until(() => d.pl.pos.z > 19.5);
    expect(d.pl.pos.y).toBeGreaterThan(0.25);
    expect(d.pl.speed).toBeGreaterThan(9.5);
  });

  test('walls stop the player and never let them through', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.wall(0, 0, 10, 10, 4, 0.2);
    });
    d.settle().run(3, RUN);
    expect(d.pl.pos.z).toBeLessThan(10 - 0.1 - cfg.radius + 0.05);
    expect(d.pl.speed).toBeLessThan(0.5);
  });
});

describe('jumping', () => {
  test('jump apex and distance match the tuned arc', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    const z0 = d.pl.pos.z;
    let apex = 0;
    d.tick({ jump: true });
    const t = d.until(() => {
      apex = Math.max(apex, d.pl.pos.y);
      return d.pl.grounded;
    });
    expect(apex).toBeGreaterThan(1.3);
    expect(apex).toBeLessThan(1.65);
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(0.66);
    expect(d.pl.pos.z - z0).toBeGreaterThan(5.5);
  });

  test('releasing jump early gives a lower hop', async () => {
    const d = await makeSim(floor);
    d.settle();
    let apex = 0;
    d.tick({ jump: true });
    d.run(0.05, { jumpHeld: false });
    d.until(() => {
      apex = Math.max(apex, d.pl.pos.y);
      return d.pl.grounded;
    });
    expect(apex).toBeLessThan(1.0);
    expect(apex).toBeGreaterThan(0.3);
  });

  test('coyote time: a jump just after leaving a ledge is still a ground jump', async () => {
    const d = await makeSim((b) => b.plat(0, 0, 0, 10, 20, { dress: false }));
    d.settle().run(0.6, RUN);
    d.until(() => !d.pl.grounded);
    d.run(0.06);
    d.tick({ jump: true });
    expect(d.sim.stats.jumps).toBe(1);
    expect(d.sim.stats.doubleJumps).toBe(0);
    expect(d.pl.canDoubleJump).toBe(true);
    expect(d.pl.vel.y).toBeGreaterThan(8);
  });

  test('after coyote time the press becomes a double jump', async () => {
    const d = await makeSim((b) => b.plat(0, 0, 0, 10, 20, { dress: false }));
    d.settle().run(0.6, RUN);
    d.until(() => !d.pl.grounded);
    d.run(0.2);
    d.tick({ jump: true });
    expect(d.sim.stats.doubleJumps).toBe(1);
  });

  test('jump buffer: pressing just before landing jumps on landing and keeps speed (bunny hop)', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ jump: true });
    d.until(() => d.pl.vel.y < -11.5, { jumpHeld: false }); // just before touching down
    const speedBefore = d.pl.speed;
    d.tick({ jump: true });
    d.run(0.2);
    expect(d.sim.stats.jumps).toBe(2);
    expect(d.sim.stats.doubleJumps).toBe(0);
    expect(d.pl.speed).toBeGreaterThanOrEqual(speedBefore - 0.01);
  });

  test('double jump: one per airtime, higher than a single jump, refreshed on landing', async () => {
    const d = await makeSim(floor);
    d.settle();
    let apex = 0;
    d.tick({ jump: true });
    d.until(() => d.pl.vel.y < 0.5);
    d.tick({ jump: true });
    expect(d.pl.vel.y).toBeCloseTo(cfg.doubleJumpVelocity, 0);
    d.run(0.1);
    d.tick({ jump: true }); // third press does nothing
    d.until(() => {
      apex = Math.max(apex, d.pl.pos.y);
      return d.pl.grounded;
    });
    expect(d.sim.stats.doubleJumps).toBe(1);
    expect(apex).toBeGreaterThan(2.4);
    expect(d.pl.canDoubleJump).toBe(true);
  });

  test('double jump redirects momentum toward the input direction', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ jump: true });
    d.run(0.25);
    const before = d.pl.speed;
    d.tick({ jump: true, moveZ: 0, moveX: 1 }); // strafe: with yaw=PI, right is -X
    expect(d.pl.speed).toBeCloseTo(before, 1);
    expect(d.pl.vel.x).toBeLessThan(-3);
  });

  test('air control never reduces forward momentum', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ dash: true });
    d.run(0.16);
    d.tick({ jump: true });
    const s0 = d.pl.speed;
    d.run(0.3, { moveZ: 1 });
    expect(d.pl.speed).toBeGreaterThanOrEqual(s0 - 0.01);
  });

  test('ceilings stop upward motion', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.solid({ p: [0, 3.0, 0], s: [6, 0.5, 6], mat: 'base' });
    });
    d.settle();
    let apex = 0;
    d.tick({ jump: true });
    d.until(() => {
      apex = Math.max(apex, d.pl.pos.y);
      return d.pl.grounded;
    });
    expect(apex + cfg.standHeight).toBeLessThan(2.78);
  });
});

describe('slide', () => {
  test('entering from sprint boosts speed, lasts about 1.2 s and ~10 m on flat ground', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    const z0 = d.pl.pos.z;
    d.tick({ slide: true });
    expect(d.pl.state).toBe(MoveState.Slide);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed + cfg.slideBoost, 0);
    expect(d.pl.height).toBe(cfg.slideHeight);
    const t = d.until(() => d.pl.state !== MoveState.Slide);
    expect(t).toBeGreaterThan(1.0);
    expect(t).toBeLessThan(1.45);
    expect(d.pl.pos.z - z0).toBeGreaterThan(8.5);
    expect(d.pl.pos.z - z0).toBeLessThan(12);
    expect(d.pl.height).toBe(cfg.standHeight);
  });

  test('slide boost has a cooldown (no slide-spam speed exploit)', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ slide: true });
    d.run(0.1);
    d.run(0.05, { slideHeld: false });
    const s = d.pl.speed;
    d.tick({ slide: true });
    expect(d.pl.speed).toBeLessThanOrEqual(s + 0.01);
  });

  test('fits under a 1 m gap only while sliding, and cannot stand up underneath', async () => {
    const build = (b: any) => {
      floor(b);
      b.solid({ p: [0, 1.0 + 1.0, 20], s: [12, 2, 6], mat: 'base' }); // underside at y = 1.0, z 17..23
    };
    const a = await makeSim(build);
    a.settle().run(4, RUN);
    expect(a.pl.pos.z).toBeLessThan(17); // standing: blocked

    const d = await makeSim(build);
    d.settle().run(1.2, RUN);
    d.until(() => d.pl.pos.z > 13.5);
    d.tick({ slide: true });
    d.until(() => d.pl.pos.z > 20);
    d.run(0.05, { slideHeld: false }); // let go under the block
    expect(d.pl.height).toBe(cfg.slideHeight); // still low: no room to stand
    d.until(() => d.pl.pos.z > 23.6, RUN, 4);
    d.run(0.2);
    expect(d.pl.height).toBe(cfg.standHeight);
    expect(d.pl.pos.y).toBeLessThan(0.1);
    expect(d.pl.pos.y).toBeGreaterThan(-0.1);
  });

  test('sliding downhill gains speed', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, 10, 0, 12, 30, { dress: false });
        b.ramp([0, 10, 15], [0, 0, 45], 12);
        b.plat(0, 0, 75, 12, 60, { dress: false });
      },
      [0, 10, 0],
    );
    d.settle().run(1.2, RUN);
    d.until(() => d.pl.pos.z > 16);
    d.tick({ slide: true });
    const s0 = d.pl.speed;
    d.until(() => d.pl.pos.z > 43);
    expect(d.pl.state).toBe(MoveState.Slide);
    expect(d.pl.speed).toBeGreaterThan(s0 + 3);
    expect(d.pl.pos.y).toBeLessThan(1.5);
  });

  test('slide-jump keeps the slide speed', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ slide: true });
    d.run(0.1);
    const s = d.pl.speed;
    d.tick({ jump: true });
    d.run(0.05);
    expect(d.pl.state).toBe(MoveState.Air);
    expect(d.pl.speed).toBeGreaterThanOrEqual(s - 0.05);
    expect(d.pl.speed).toBeGreaterThan(cfg.sprintSpeed + 1);
  });
});

describe('dash', () => {
  test('covers ~4 m in 0.15 s, spends a charge and exits with momentum', async () => {
    const d = await makeSim(floor);
    d.settle().run(0.2, { moveZ: 1, sprint: false });
    const z0 = d.pl.pos.z;
    d.tick({ dash: true });
    expect(d.pl.state).toBe(MoveState.Dash);
    d.run(cfg.dashDuration);
    expect(d.pl.pos.z - z0).toBeGreaterThan(3.5);
    expect(d.pl.pos.z - z0).toBeLessThan(4.6);
    expect(d.pl.dashCharges).toBe(1);
    expect(d.pl.speed).toBeGreaterThanOrEqual(cfg.dashExitSpeed - 0.5);
  });

  test('two charges, recharging 1.2 s each', async () => {
    const d = await makeSim(floor);
    d.settle();
    d.tick({ dash: true });
    d.run(0.35);
    d.tick({ dash: true });
    d.run(0.35);
    expect(d.sim.stats.dashes).toBe(2);
    d.tick({ dash: true });
    d.run(0.2);
    expect(d.sim.stats.dashes).toBe(2); // empty
    d.run(1.3);
    expect(d.pl.dashCharges).toBeGreaterThanOrEqual(1);
  });

  test('air dash follows the look direction and suspends gravity', async () => {
    const d = await makeSim(floor);
    d.settle();
    d.tick({ jump: true });
    d.run(0.3);
    const y0 = d.pl.pos.y;
    d.tick({ dash: true, pitch: 0 });
    d.run(cfg.dashDuration - 0.02);
    expect(Math.abs(d.pl.pos.y - y0)).toBeLessThan(0.05);
  });

  test('never tunnels through a 0.2 m wall, from any start distance', async () => {
    for (const start of [0.5, 1.5, 2.5, 3.3, 3.9, 5]) {
      const d = await makeSim(
        (b) => {
          floor(b);
          b.wall(0, 0, 10, 12, 5, 0.2);
        },
        [0, 0, 10 - 0.1 - start],
      );
      d.settle();
      d.tick({ dash: true });
      d.run(0.5, RUN);
      expect(d.pl.pos.z).toBeLessThan(9.9);
    }
  });

  test('dash speed never exceeds the soft cap for long', async () => {
    const d = await makeSim(floor);
    d.settle().run(1, RUN);
    d.tick({ dash: true });
    d.run(1.0);
    expect(d.pl.speed).toBeLessThan(cfg.softSpeedCap);
  });
});

describe('wall-run', () => {
  // corridor: walls on both sides of a pit, floor before and after
  const corridor = (b: any) => {
    b.plat(0, 0, 0, 12, 20, { dress: false });
    b.wall(-3.2, -2, 25, 0.6, 8, 30); // right-hand wall when heading +Z
    b.plat(0, 0, 60, 12, 30, { dress: false });
  };

  test('attaches when jumping alongside a runnable wall and carries across a gap', async () => {
    const d = await makeSim(corridor, [-2.2, 0, 0]);
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    const t = d.until(() => d.pl.state === MoveState.WallRun, {}, 1);
    expect(t).toBeGreaterThan(0);
    expect(d.pl.wallSide).toBe(1);
    const z0 = d.pl.pos.z;
    const dur = d.until(() => d.pl.state !== MoveState.WallRun, {}, 4);
    expect(dur).toBeGreaterThan(1.0);
    expect(dur).toBeLessThanOrEqual(cfg.wallDurationMax + 0.05);
    expect(d.pl.pos.z - z0).toBeGreaterThan(10);
  });

  test('wall jump pushes away, keeps forward momentum and refreshes the double jump', async () => {
    const d = await makeSim(corridor, [-2.2, 0, 0]);
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    d.until(() => d.pl.state === MoveState.WallRun, {}, 1);
    d.run(0.4);
    const fwd = d.pl.vel.z;
    d.tick({ jump: true });
    expect(d.pl.state).toBe(MoveState.Air);
    expect(d.pl.vel.x).toBeGreaterThan(5); // away from the wall at -X
    expect(d.pl.vel.z).toBeGreaterThanOrEqual(fwd - 0.5);
    expect(d.pl.vel.y).toBeCloseTo(cfg.wallJumpUp, 0);
    expect(d.pl.canDoubleJump).toBe(true);
  });

  test('cannot re-attach to the same wall without touching ground or another wall', async () => {
    const d = await makeSim(corridor, [-2.2, 0, 0]);
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    d.until(() => d.pl.state === MoveState.WallRun, {}, 1);
    d.run(0.3);
    d.tick({ jump: true, yaw: FWD - 0.6 }); // jump off but steer straight back into it
    d.run(0.6);
    expect(d.sim.stats.wallRuns).toBe(1);
  });

  test('duration scales with speed', async () => {
    const slow = await makeSim(corridor, [-2.2, 0, 0]);
    slow.settle().run(0.9, RUN);
    slow.until(() => slow.pl.pos.z > 9.3);
    slow.tick({ jump: true, yaw: FWD - 0.25 });
    slow.until(() => slow.pl.state === MoveState.WallRun, {}, 1);
    const a = slow.pl.wallMax;

    const fast = await makeSim(corridor, [-2.2, 0, 0]);
    fast.settle().run(0.9, RUN);
    fast.until(() => fast.pl.pos.z > 5);
    fast.tick({ dash: true });
    fast.until(() => fast.pl.pos.z > 9.3);
    fast.tick({ jump: true, yaw: FWD - 0.25 });
    fast.until(() => fast.pl.state === MoveState.WallRun, {}, 1);
    expect(fast.pl.wallMax).toBeGreaterThan(a);
  });

  test('non-runnable walls are ignored', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, 0, 0, 12, 20, { dress: false });
        b.wall(-3.2, -2, 25, 0.6, 8, 30, { wallrun: false });
      },
      [-2.2, 0, 0],
    );
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    d.run(0.8);
    expect(d.sim.stats.wallRuns).toBe(0);
  });
});

describe('vault', () => {
  test('auto-vaults a waist-high obstacle and keeps at least 90% of speed', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.plat(0, 1.0, 12, 10, 1.2, { h: 1.0, dress: false });
    });
    d.settle().run(1.0, RUN);
    const speed = d.pl.speed;
    const t = d.until(() => d.pl.state === MoveState.Vault, {}, 2);
    expect(t).toBeGreaterThan(0);
    d.until(() => d.pl.state !== MoveState.Vault, {}, 1);
    expect(d.pl.pos.y).toBeGreaterThan(0.9);
    d.until(() => d.pl.pos.z > 14 && d.pl.grounded, {}, 2);
    expect(d.pl.speed).toBeGreaterThanOrEqual(speed * 0.9);
    expect(d.sim.stats.vaults).toBe(1);
  });

  test('does not vault walls that are too tall', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.plat(0, 1.6, 12, 10, 1.2, { h: 1.6, dress: false });
    });
    d.settle().run(2, RUN);
    expect(d.sim.stats.vaults).toBe(0);
    expect(d.pl.pos.z).toBeLessThan(11.5);
  });
});

describe('moving platforms', () => {
  test('carries the player and passes its velocity into a jump', async () => {
    const d = await makeSim(
      (b) => {
        b.entity({
          type: 'mover',
          s: [6, 1, 6],
          path: [
            [0, -0.5, 0],
            [30, -0.5, 0],
          ],
          speed: 5,
          mode: 'pingpong',
        });
      },
      [0, 0.2, 0],
    );
    d.settle();
    d.run(2.0);
    expect(d.pl.grounded).toBe(true);
    expect(d.pl.pos.x).toBeGreaterThan(4); // rode along without input
    const before = d.pl.platformVel.x;
    expect(before).toBeGreaterThan(2);
    d.tick({ jump: true });
    expect(d.pl.vel.x).toBeCloseTo(before, 0);
  });

  test('rides a rising platform without sinking in', async () => {
    const d = await makeSim(
      (b) => {
        b.entity({
          type: 'mover',
          s: [6, 1, 6],
          path: [
            [0, -0.5, 0],
            [0, 9.5, 0],
          ],
          speed: 4,
          mode: 'pingpong',
        });
      },
      [0, 0.2, 0],
    );
    d.settle();
    for (let i = 0; i < 600; i++) {
      d.tick();
      const top = d.sim.entities[0].p.y + 0.5;
      expect(d.pl.pos.y - top).toBeGreaterThan(-0.06);
      expect(d.pl.pos.y - top).toBeLessThan(0.2);
    }
  });
});

describe('determinism', () => {
  test('the same input stream reproduces the same run exactly', async () => {
    const run = async () => {
      const d = await makeSim(
        (b) => {
          floor(b);
          b.wall(-3.2, 0, 30, 0.6, 8, 20);
          b.plat(0, 1.0, 55, 10, 1.2, { h: 1.0, dress: false });
        },
        [-2.2, 0, 0],
      );
      d.settle().run(1.0, RUN);
      d.tick({ slide: true });
      d.run(0.3);
      d.tick({ dash: true });
      d.run(0.2);
      d.tick({ jump: true, yaw: FWD - 0.2 });
      d.run(0.5);
      d.tick({ jump: true });
      d.run(1.5, { yaw: FWD });
      return [d.pl.pos.x, d.pl.pos.y, d.pl.pos.z, d.pl.vel.x, d.pl.vel.y, d.pl.vel.z];
    };
    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
  });
});

describe('moving solids', () => {
  test('a sliding wall shoves the player instead of passing through, and never pushes them through the floor', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.entity({
        type: 'mover',
        s: [1, 4, 6],
        path: [
          [-6, 2, 0],
          [6, 2, 0],
        ],
        speed: 3,
        mode: 'pingpong',
      });
    });
    d.settle();
    let minY = 1,
      maxX = 0;
    for (let i = 0; i < 480; i++) {
      d.tick();
      minY = Math.min(minY, d.pl.pos.y);
      maxX = Math.max(maxX, d.pl.pos.x);
    }
    expect(minY).toBeGreaterThan(-0.05);
    expect(maxX).toBeGreaterThan(3); // carried along in front of the wall
    expect(d.sim.stats.deaths).toBe(0);
  });

  test('being pinned between a moving wall and a static wall is lethal (crush)', async () => {
    const d = await makeSim((b) => {
      floor(b);
      b.wall(3, 0, 0, 1, 4, 8, { wallrun: false });
      b.entity({
        type: 'mover',
        s: [1, 4, 6],
        path: [
          [-6, 2, 0],
          [2, 2, 0],
        ],
        speed: 3,
        mode: 'pingpong',
      });
    });
    d.settle();
    d.until(() => d.sim.stats.deaths > 0, {}, 6);
    expect(d.sim.stats.deaths).toBe(1);
  });
});
