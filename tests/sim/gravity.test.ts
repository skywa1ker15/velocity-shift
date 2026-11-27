/**
 * Phase G: gravity frames, fields, dynamic structures and launches, through the real simulation.
 * Small purpose-built worlds; every check runs the actual movement controller and physics.
 */
import { describe, expect, test } from 'vitest';
import { quatRotate, v3 } from '../../src/core/math';
import { MoveState } from '../../src/movement/types';
import type { FieldDef } from '../../src/levels/types';
import { Structure } from '../../src/entities/Entities';
import { makeSim, type Driver } from './harness';

const DEG = 180 / Math.PI;
const up = (d: Driver) => d.pl.upAxis(v3());
const angleTo = (a: { x: number; y: number; z: number }, b: [number, number, number]) => {
  const l = Math.hypot(...b);
  return Math.acos(Math.max(-1, Math.min(1, (a.x * b[0] + a.y * b[1] + a.z * b[2]) / l))) * DEG;
};
const field = (o: Partial<FieldDef> & Pick<FieldDef, 'p' | 's' | 'mode'>): FieldDef => ({
  type: 'field',
  ...o,
});

describe('gravity frame turns toward every direction, smoothly', () => {
  const dirs: [string, [number, number, number]][] = [
    ['+X (sideways)', [1, 0, 0]],
    ['-X (sideways)', [-1, 0, 0]],
    ['+Z (forward)', [0, 0, 1]],
    ['-Z (backward)', [0, 0, -1]],
    ['+Y (reverse)', [0, 1, 0]],
    ['diagonal', [1, -1, 1]],
  ];
  test.each(dirs)('%s: up converges to -gravity, never faster than the turn cap', async (_n, g) => {
    // open air: a huge field, no geometry nearby, weightless so the player just floats in place
    const d = await makeSim(
      (b) => b.entity(field({ p: [0, 0, 0], s: [400, 400, 400], mode: 'dir', dir: g, scale: 0 })),
      [0, 0, 0],
    );
    let last = up(d);
    let maxStep = 0;
    for (let i = 0; i < 180; i++) {
      d.tick({});
      const u = up(d);
      maxStep = Math.max(maxStep, angleTo(u, [last.x, last.y, last.z]));
      last = u;
    }
    expect(angleTo(up(d), [-g[0], -g[1], -g[2]])).toBeLessThan(1);
    // 4.2 rad/s cap = 0.035 rad (2.0°) per tick
    expect(maxStep).toBeLessThanOrEqual(2.01);
  });

  test('a 90° turn takes roughly 0.3–0.7 s, a 180° flip under 1 s', async () => {
    for (const [g, lo, hi] of [
      [[1, 0, 0], 0.3, 0.7],
      [[0, 1, 0], 0.5, 1.0],
    ] as [[number, number, number], number, number][]) {
      const d = await makeSim((b) =>
        b.entity(field({ p: [0, 0, 0], s: [400, 400, 400], mode: 'dir', dir: g, scale: 0 })),
      );
      const t = d.until(() => angleTo(up(d), [-g[0], -g[1], -g[2]]) < 2, {}, 3);
      expect(t).toBeGreaterThan(lo);
      expect(t).toBeLessThan(hi);
    }
  });

  test('a 180° flip rolls about the facing direction, so heading is kept', async () => {
    const d = await makeSim((b) =>
      b.entity(field({ p: [0, 0, 0], s: [400, 400, 400], mode: 'dir', dir: [0, 1, 0], scale: 0 })),
    );
    d.run(1.2);
    // still looking toward +Z: local forward (yaw = FWD) maps to world +Z
    const f = quatRotate(d.pl.frame, { x: -Math.sin(d.pl.yaw), y: 0, z: -Math.cos(d.pl.yaw) }, v3());
    expect(f.z).toBeGreaterThan(0.99);
  });
});

describe('walking on walls and ceilings', () => {
  test('sideways gravity: the player falls onto the wall, stands on it and runs along it', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 10, 12, 40);
      b.solid({ p: [6.5, 8, 10], s: [1, 16, 40], mat: 'base' }); // wall face at x = 6
      b.entity(field({ p: [0, 8, 10], s: [12, 16, 40], mode: 'dir', dir: [1, 0, 0] }));
    });
    expect(d.until(() => d.pl.grounded && d.pl.pos.x > 5.9, {}, 3)).toBeGreaterThan(0);
    expect(angleTo(up(d), [-1, 0, 0])).toBeLessThan(2);
    const z0 = d.pl.pos.z;
    d.run(1.0, { moveZ: 1, sprint: true });
    expect(d.pl.pos.z - z0).toBeGreaterThan(6); // ran forward along the wall
    expect(d.pl.grounded).toBe(true);
    expect(Math.abs(d.pl.pos.x - 6)).toBeLessThan(0.05); // feet on the wall face
    expect(d.pl.state === MoveState.Sprint || d.pl.state === MoveState.Run).toBe(true);
  });

  test('reverse gravity: the player lands on the ceiling, can jump off it and comes back', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 12, 12);
      b.solid({ p: [0, 6.5, 0], s: [12, 1, 12], mat: 'base' }); // ceiling underside at y = 6
      b.entity(field({ p: [0, 3, 0], s: [12, 6, 12], mode: 'dir', dir: [0, 1, 0] }));
    });
    expect(d.until(() => d.pl.grounded && d.pl.pos.y > 5.9, {}, 4)).toBeGreaterThan(0);
    d.tick({ jump: true });
    expect(d.pl.grounded).toBe(false);
    expect(d.pl.pos.y).toBeLessThan(6); // the jump goes "up" = toward the floor
    expect(d.until(() => d.pl.grounded && d.pl.pos.y > 5.9, {}, 3)).toBeGreaterThan(0);
  });

  test('diagonal gravity onto a 45° slab: stands on it', async () => {
    const d = await makeSim((b) => {
      b.plat(0, -20, 0, 4, 4); // out of the way
      b.solid({ p: [4, -4, 0], s: [1, 30, 30], r: [0, 0, -Math.PI / 4], mat: 'base' }); // a slab tilted 45°, facing the player
      b.entity(field({ p: [0, 0, 0], s: [60, 60, 60], mode: 'dir', dir: [1, -1, 0] }));
    });
    expect(d.until(() => d.pl.grounded, {}, 4)).toBeGreaterThan(0);
    expect(angleTo(up(d), [-1, 1, 0])).toBeLessThan(3);
  });
});

describe('momentum and special gravity', () => {
  test('turning the frame never changes momentum (zero-g, no input)', async () => {
    const d = await makeSim((b) =>
      b.entity(
        field({
          p: [0, 0, 0],
          s: [400, 400, 400],
          mode: 'spin',
          dir: [0, -1, 0],
          axis: [0, 0, 1],
          speed: 2,
          scale: 0,
        }),
      ),
    );
    d.pl.vel.x = 3;
    d.pl.vel.y = 1;
    d.pl.vel.z = 10;
    d.tick({});
    const v0 = [d.pl.vel.x, d.pl.vel.y, d.pl.vel.z];
    d.run(2);
    expect(d.pl.vel.x).toBeCloseTo(v0[0], 6);
    expect(d.pl.vel.y).toBeCloseTo(v0[1], 6);
    expect(d.pl.vel.z).toBeCloseTo(v0[2], 6);
  });

  test('low and heavy gravity change how far a fall goes in a second', async () => {
    const fall = async (scale: number) => {
      const d = await makeSim(
        (b) => b.entity(field({ p: [0, 0, 0], s: [400, 400, 400], mode: 'dir', dir: [0, -1, 0], scale })),
        [0, 100, 0],
      );
      d.run(1);
      return 100 - d.pl.pos.y;
    };
    const low = await fall(0.4),
      normal = await fall(1),
      heavy = await fall(1.8);
    expect(low).toBeLessThan(normal * 0.6);
    expect(heavy).toBeGreaterThan(normal * 1.3);
  });

  test('a gravity well pulls the player toward its centre', async () => {
    const d = await makeSim(
      (b) => b.entity(field({ p: [0, 0, 0], s: [80, 80, 80], mode: 'well', center: [0, 0, 20], scale: 1 })),
      [0, 0, 0],
    );
    d.run(1.2);
    expect(d.pl.pos.z).toBeGreaterThan(3);
  });

  test('an extreme fall (300 m, heavy gravity) lands on a thin slab: no tunnelling', async () => {
    const d = await makeSim(
      (b) => {
        b.solid({ p: [0, -0.15, 0], s: [6, 0.3, 6], mat: 'base' });
        b.entity(field({ p: [0, 150, 0], s: [20, 320, 20], mode: 'dir', dir: [0, -1, 0], scale: 3 }));
      },
      [0, 300, 0],
    );
    expect(d.until(() => d.pl.grounded, {}, 15)).toBeGreaterThan(0);
    expect(d.pl.pos.y).toBeGreaterThan(-0.05);
    expect(d.pl.pos.y).toBeLessThan(0.05);
  });

  test('an extreme fall onto a thin wall under sideways gravity: no tunnelling', async () => {
    const d = await makeSim(
      (b) => {
        b.solid({ p: [200, 0, 0], s: [0.3, 8, 8], mat: 'base' });
        b.entity(field({ p: [100, 0, 0], s: [220, 40, 40], mode: 'dir', dir: [1, 0, 0], scale: 3 }));
      },
      [0, 0, 0],
    );
    expect(d.until(() => d.pl.grounded, {}, 15)).toBeGreaterThan(0);
    expect(d.pl.pos.x).toBeGreaterThan(199.7);
    expect(d.pl.pos.x).toBeLessThan(199.9);
  });

  test('respawning resets gravity to normal', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 10, 10);
      b.entity(field({ p: [0, 200, 0], s: [10, 400, 10], mode: 'dir', dir: [0, 1, 0] }));
    });
    d.run(1.5);
    expect(angleTo(up(d), [0, -1, 0])).toBeLessThan(2);
    d.sim.restartFromCheckpoint();
    expect(d.pl.framed).toBe(false);
  });

  test('gravity sequences are deterministic', async () => {
    const run = async () => {
      const d = await makeSim((b) => {
        b.plat(0, 0, 10, 12, 40);
        b.solid({ p: [6.5, 8, 10], s: [1, 16, 40], mat: 'base' });
        b.entity(field({ p: [0, 8, 10], s: [12, 16, 40], mode: 'dir', dir: [1, 0, 0] }));
      });
      d.run(0.5);
      d.run(1.5, { moveZ: 1, sprint: true, jump: true });
      return [d.pl.pos.x, d.pl.pos.y, d.pl.pos.z, d.pl.frame.x, d.pl.frame.w];
    };
    expect(await run()).toEqual(await run());
  });

  test('leaving a field brings gravity back down; an upright frame folds back to identity', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 30, 12, 80);
      b.entity(field({ p: [0, 4, 6], s: [12, 8, 4], mode: 'dir', dir: [0, 0, 1], scale: 0.2 }));
    });
    d.run(3, { moveZ: 1, sprint: true });
    expect(d.pl.framed).toBe(false);
    expect(d.pl.grounded).toBe(true);
  });
});

describe('dynamic structures', () => {
  test('a turning platform carries its rider round with it', async () => {
    const d = await makeSim(
      (b) => {
        b.entity({
          type: 'structure',
          id: 'turn',
          p: [0, -0.5, 0],
          parts: [{ p: [0, 0, 0], s: [20, 1, 20] }],
          steps: [{ t: 2, rot: [0, 1, 0, 90], ease: 'linear' }],
        });
      },
      [5, 0, 0],
    );
    d.run(2.6);
    // a quarter turn about +Y takes (5,0,0) to (0,0,-5)
    expect(d.pl.pos.x).toBeCloseTo(0, 0);
    expect(d.pl.pos.z).toBeCloseTo(-5, 0);
    expect(d.pl.grounded).toBe(true);
  });

  test('a corridor rolling 90° with linked gravity keeps the player on its floor', async () => {
    const d = await makeSim(
      (b) => {
        b.entity({
          type: 'structure',
          id: 'tube',
          p: [0, 0, 0],
          parts: [
            { p: [0, -0.5, 10], s: [6, 1, 30] },
            { p: [3.5, 3, 10], s: [1, 8, 30] },
            { p: [-3.5, 3, 10], s: [1, 8, 30] },
          ],
          steps: [{ t: 2.5, rot: [0, 0, 1, 90] }],
        });
        b.entity(field({ p: [0, 3, 10], s: [6, 6, 30], mode: 'structure', link: 'tube' }));
      },
      [0, 0, 0],
    );
    let off = 0;
    for (let i = 0; i < 120 * 3.5; i++) {
      d.tick({});
      if (!d.pl.grounded) off++;
    }
    expect(off).toBeLessThan(12); // essentially never airborne while the floor turns
    expect(angleTo(up(d), [-1, 0, 0])).toBeLessThan(3); // the floor now faces -X
  });

  test('a structure that falls takes its collision with it, then it is gone', async () => {
    const d = await makeSim(
      (b) => {
        b.plat(0, -10, 0, 4, 4);
        b.entity({
          type: 'structure',
          id: 'bridge',
          on: 'go',
          p: [0, -0.5, 0],
          parts: [{ p: [0, 0, 0], s: [8, 1, 8] }],
          steps: [],
          fall: 2,
        });
        b.trigger([0, 1, 0], [8, 3, 8], 'go');
      },
      [0, 0, 0],
    );
    d.settle();
    const st = d.sim.entities.find((e) => e instanceof Structure) as Structure;
    // telegraphs first (fairness), then drops with the player on it
    d.run(0.5);
    expect(st.warn).toBeGreaterThan(0);
    expect(d.pl.grounded).toBe(true);
    d.run(3);
    expect(st.visible).toBe(false);
    // nothing left behind where it stood
    expect(
      d.sim.physics.raycast(0, 5, 0, 0, -1, 0, 7, { dist: 0, nx: 0, ny: 0, nz: 0, id: 0, wallrun: false }),
    ).toBe(false);
  });

  test('respawning replays a structure from its start', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 10, 10);
      b.entity({
        type: 'structure',
        id: 's',
        p: [0, 0, 30],
        parts: [{ p: [0, 0, 0], s: [4, 1, 4] }],
        steps: [{ t: 1, move: [0, 10, 0] }],
      });
    });
    d.run(2);
    const st = d.sim.entities.find((e) => e instanceof Structure)!;
    expect(st.p.y).toBeCloseTo(10, 3);
    d.sim.restartFromCheckpoint();
    expect(st.p.y).toBeCloseTo(0, 3);
  });
});

describe('launches', () => {
  test('an impulse ring works in mid-air and keeps sideways momentum', async () => {
    const d = await makeSim((b) => {
      b.plat(0, 0, 0, 10, 10);
      b.entity({ type: 'impulse', p: [0, 3, 0], s: [8, 2, 8], dir: [0, 1, 1], add: 4, min: 20 });
    });
    d.settle();
    d.pl.vel.x = 4;
    d.tick({ jump: true });
    const ring = d.sim.entities.find((e) => e.def.type === 'impulse')!;
    d.until(() => ring.warn > 0, {}, 2);
    const along = (d.pl.vel.y + d.pl.vel.z) / Math.SQRT2;
    expect(along).toBeGreaterThanOrEqual(19);
    expect(d.pl.vel.x).toBeGreaterThan(3);
  });

  test('a spring floor throws you higher the harder you land on it', async () => {
    const bounce = async (h: number) => {
      const d = await makeSim(
        (b) => {
          b.plat(0, 0, 0, 10, 10);
          b.entity({ type: 'jumppad', p: [0, 0.6, 0], s: [6, 1.2, 6], v: [0, 8, 0], spring: 0.9 });
        },
        [0, h, 0],
      );
      let top = -1e9;
      d.until(() => d.pl.upSpeed > 1, {}, 6);
      for (let i = 0; i < 400; i++) {
        d.tick({});
        top = Math.max(top, d.pl.pos.y);
      }
      return top;
    };
    expect(await bounce(20)).toBeGreaterThan((await bounce(2)) + 5);
  });
});

describe('walls of moving structures', () => {
  // Rapier's character controller could refuse every sliding step against a collider on a
  // kinematic body, freezing a player who ran or wall-ran along a structure's wall (found in
  // Faceted's tubes). Such a wall must behave like a static one.
  async function along(kind: 'static' | 'structure') {
    const d = await makeSim((b) => {
      b.plat(0, 0, 10, 4, 30); // -5..25
      if (kind === 'static') b.solid({ p: [2.5, 2, 40], s: [1, 4, 60], mat: 'alt', wallrun: true });
      else
        b.entity({
          type: 'structure',
          id: 'w',
          p: [0, 2, 40],
          steps: [],
          parts: [{ p: [2.5, 0, 0], s: [1, 4, 60], wallrun: true }],
        });
    });
    let ranAlong = 0,
      wallRun = 0;
    for (let i = 0; i < 120 * 4 && d.pl.pos.y > -3; i++) {
      const p = d.pl.pos;
      // drift into the wall from z 15, then jump at the deck's edge and wall-run
      d.tick({ moveZ: 1, sprint: true, moveX: p.z > 15 ? -0.3 : 0, jump: p.z > 24.4 && d.pl.grounded });
      if (d.pl.grounded && p.x > 1.6 && p.z > 18) ranAlong++;
      if (d.pl.state === MoveState.WallRun) wallRun = Math.max(wallRun, p.z);
    }
    return { ranAlong, wallRun };
  }
  test('running and wall-running along a structure wall go as far as along a static one', async () => {
    const st = await along('static');
    const mv = await along('structure');
    expect(st.ranAlong).toBeGreaterThan(20);
    expect(st.wallRun).toBeGreaterThan(33);
    expect(mv.ranAlong).toBeGreaterThan(st.ranAlong - 3);
    expect(mv.wallRun).toBeGreaterThan(st.wallRun - 1);
  });
});
