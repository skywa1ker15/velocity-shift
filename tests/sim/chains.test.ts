/**
 * Movement chaining tests — every chain listed in docs/MOVEMENT.md must work as one continuous
 * physics system (momentum carried from state to state), driven here by scripted input.
 */
import { describe, expect, test } from 'vitest';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { FWD, makeSim, MoveState as S } from './harness';

const RUN = { moveZ: 1, sprint: true };
const floor = (b: any) => b.plat(0, 0, 100, 40, 320, { dress: false });

describe('movement chains', () => {
  test('1. sprint → slide → dash → double jump', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ slide: true });
    d.run(0.25);
    d.tick({ dash: true });
    d.run(cfg.dashDuration + 0.02, { slideHeld: false });
    d.tick({ jump: true });
    d.run(0.3);
    d.tick({ jump: true });
    d.run(0.1);
    expect(d.sawSequence(S.Sprint, S.Slide, S.Dash, S.Air)).toBe(true);
    expect(d.sim.stats.doubleJumps).toBe(1);
    expect(d.pl.speed).toBeGreaterThan(cfg.sprintSpeed + 1); // momentum survived the whole chain
  });

  test('2. sprint → wall run → wall jump → dash', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, 0, 0, 12, 20, { dress: false });
        b.wall(-3.2, -2, 25, 0.6, 8, 30);
        b.plat(4, 0, 60, 30, 60, { dress: false });
      },
      [-2.2, 0, 0],
    );
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    expect(d.until(() => d.pl.state === S.WallRun, {}, 1)).toBeGreaterThan(0);
    d.run(0.5, { yaw: FWD });
    d.tick({ jump: true });
    d.run(0.15);
    d.tick({ dash: true });
    expect(d.pl.state).toBe(S.Dash);
    d.run(0.3);
    expect(d.sawSequence(S.Sprint, S.Air, S.WallRun, S.Air, S.Dash, S.Air)).toBe(true);
    expect(d.pl.speed).toBeGreaterThanOrEqual(cfg.dashExitSpeed - 0.5);
  });

  test('3. slide downhill → jump → air dash → slide-landing', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, 10, 0, 12, 30, { dress: false });
        b.ramp([0, 10, 15], [0, 2, 39], 12);
        b.plat(0, 2, 49, 12, 20, { dress: false });
        b.plat(0, 0, 110, 14, 100, { dress: false });
      },
      [0, 10, 0],
    );
    d.settle().run(1.2, RUN);
    d.until(() => d.pl.pos.z > 16);
    d.tick({ slide: true });
    d.until(() => d.pl.pos.z > 40);
    const slideSpeed = d.pl.speed;
    expect(slideSpeed).toBeGreaterThan(cfg.sprintSpeed + 3);
    d.tick({ jump: true });
    d.run(0.2);
    d.tick({ dash: true });
    d.run(0.2);
    const t = d.until(() => d.pl.grounded, {}, 3); // slide key still held
    expect(t).toBeGreaterThan(0);
    d.run(0.05);
    expect(d.pl.state).toBe(S.Slide);
    expect(d.sawSequence(S.Slide, S.Air, S.Dash, S.Air, S.Slide)).toBe(true);
    expect(d.pl.speed).toBeGreaterThan(cfg.sprintSpeed);
  });

  test('4. wall run → double jump → vault → sprint', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, 0, 0, 12, 20, { dress: false });
        b.wall(-3.2, -2, 22, 0.6, 8, 24);
        // landing deck whose lip is slightly higher than the jump reaches cleanly → vault
        b.plat(1, 4.2, 50, 14, 40, { h: 6, dress: false });
      },
      [-2.2, 0, 0],
    );
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    expect(d.until(() => d.pl.state === S.WallRun, {}, 1)).toBeGreaterThan(0);
    d.until(() => d.pl.pos.z > 19.7, { yaw: FWD });
    d.tick({ jump: true }); // wall jump
    d.run(0.3);
    d.tick({ jump: true }); // double jump
    expect(d.until(() => d.pl.state === S.Vault, {}, 2)).toBeGreaterThan(0);
    d.until(() => d.pl.grounded && d.pl.state === S.Sprint, {}, 2);
    expect(d.sawSequence(S.WallRun, S.Air, S.Vault, S.Air, S.Sprint)).toBe(true);
    expect(d.sim.stats.doubleJumps).toBe(1);
    expect(d.pl.pos.y).toBeGreaterThan(4.1);
  });

  test('5. wall run → wall jump → opposite wall run → wall jump (corridor zig-zag)', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, 0, 0, 12, 20, { dress: false });
        b.wall(-3.2, -2, 22, 0.6, 9, 24); // right wall
        b.wall(3.2, -2, 34, 0.6, 9, 28); // left wall, further along
        b.plat(0, 0, 80, 20, 50, { dress: false });
      },
      [-2.2, 0, 0],
    );
    d.settle().run(0.9, RUN);
    d.until(() => d.pl.pos.z > 9.3);
    d.tick({ jump: true, yaw: FWD - 0.25 });
    expect(d.until(() => d.pl.state === S.WallRun, {}, 1)).toBeGreaterThan(0);
    expect(d.pl.wallSide).toBe(1);
    d.run(0.5, { yaw: FWD });
    d.tick({ jump: true });
    expect(d.until(() => d.pl.state === S.WallRun, {}, 1.5)).toBeGreaterThan(0);
    expect(d.pl.wallSide).toBe(-1);
    d.run(0.4);
    d.tick({ jump: true });
    d.run(0.1);
    expect(d.sim.stats.wallRuns).toBe(2);
    expect(d.sim.stats.wallJumps).toBe(2);
    expect(d.sim.stats.longestWallChain).toBe(2);
    expect(d.pl.vel.x).toBeLessThan(-4); // kicked off the left wall, back toward -X
  });

  test('6. dash → slide carries the dash momentum into the slide', async () => {
    const d = await makeSim(floor);
    d.settle().run(0.3, { moveZ: 1, sprint: false });
    d.tick({ dash: true });
    d.run(0.08);
    d.tick({ slide: true });
    expect(d.pl.state).toBe(S.Slide);
    expect(d.pl.speed).toBeGreaterThanOrEqual(cfg.dashExitSpeed);
    expect(d.sawSequence(S.Dash, S.Slide)).toBe(true);
  });

  test('7. slide → jump → land → slide (bunny-slide) holds speed above sprint', async () => {
    const d = await makeSim(floor);
    d.settle().run(1.2, RUN);
    d.tick({ slide: true });
    for (let hop = 0; hop < 4; hop++) {
      d.run(0.12);
      d.tick({ jump: true });
      d.until(() => d.pl.grounded, {}, 2);
      d.run(0.02);
      expect(d.pl.state).toBe(S.Slide);
    }
    expect(d.pl.speed).toBeGreaterThan(cfg.sprintSpeed);
    expect(d.pl.speed).toBeLessThan(cfg.softSpeedCap);
    expect(d.sim.stats.slides).toBeGreaterThanOrEqual(5);
  });
});

describe('terrain handling', () => {
  test('walks up a 30° ramp at speed and stays glued going back down', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 10, 20, { dress: false });
      b.ramp([0, 0, 10], [0, 6, 20.4], 10);
      b.plat(0, 6, 30.4, 10, 20, { dress: false });
    });
    d.settle().run(1.0, RUN);
    d.until(() => d.pl.pos.z > 24, {}, 6);
    expect(d.pl.pos.y).toBeCloseTo(6, 1);
    expect(d.pl.speed).toBeGreaterThan(10);
    // back down: must stay grounded the whole way
    let airTicks = 0;
    d.inp.yaw = 0;
    for (let i = 0; i < 300 && d.pl.pos.z > 6; i++) {
      d.tick(RUN);
      if (!d.pl.grounded) airTicks++;
    }
    expect(airTicks).toBeLessThan(3);
    expect(d.pl.pos.y).toBeLessThan(0.1);
  });

  test('slopes steeper than the limit cannot be stood on', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 10, 20, { dress: false });
      b.ramp([0, 0, 10], [0, 12, 16], 10); // ~63°
    });
    d.settle().run(3, RUN);
    expect(d.pl.pos.y).toBeLessThan(3);
  });

  test('a near-miss on a ledge is caught (step-up forgiveness) instead of bouncing off', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 10, 20, { dress: false });
      b.plat(0, 1.25, 22, 10, 14, { h: 3, dress: false });
    });
    d.settle().run(1.0, RUN);
    d.until(() => d.pl.pos.z > 10.2);
    d.tick({ jump: true });
    d.until(() => d.pl.grounded, {}, 2);
    d.run(0.1);
    expect(d.pl.pos.y).toBeCloseTo(1.25, 2);
    expect(d.pl.speed).toBeGreaterThan(9);
  });

  test('falling into the void kills and respawns at the checkpoint within 0.5 s', async () => {
    const d = await makeSim((b) => b.plat(0, 0, 0, 6, 6, { dress: false }));
    d.settle().run(0.2, RUN);
    d.until(() => d.sim.dead, RUN, 6);
    expect(d.sim.stats.deaths).toBe(1);
    const t = d.until(() => !d.sim.dead && d.pl.grounded, { moveZ: 0 }, 2);
    expect(t).toBeLessThan(0.5);
    expect(Math.hypot(d.pl.pos.x, d.pl.pos.z)).toBeLessThan(0.5);
  });
});
