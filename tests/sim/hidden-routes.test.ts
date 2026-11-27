/**
 * Hidden routes are real: for each course added in Phase E, the autopilot follows the hidden line
 * (instead of the main one) through the actual simulation and must reach the hidden-route zone and
 * pick up the shard placed there. Catches a hidden route that looks reachable but is not.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { Bot } from '../../src/gameplay/Bot';
import { Simulation } from '../../src/gameplay/Simulation';
import { levelById } from '../../src/levels/registry';
import type { BotPoint } from '../../src/levels/types';
import { initPhysics } from '../../src/physics/PhysicsWorld';

type P = [number, number, number, string?, number?];
const pt = ([x, y, z, act, r]: P): BotPoint => ({ p: [x, y, z], act, r });

/** level → [hidden shortcut id, shard on the hidden route, the line that takes it] */
const routes: Record<string, [string, string, P[]]> = {
  momentum: [
    'mo-hidden',
    'm1',
    [
      [0, 0, 2],
      [0, 0, 7.5, 's'],
      [0, -10, 40],
      [0, -10, 52, 'u'],
      [0, -10, 60.3, 'jj', 0.8],
      [0, -10, 80],
      [0.3, -10, 91.3, 'jj', 0.8],
      [2, -10.5, 106],
      [6.5, -10.5, 111],
      [6.5, -10.5, 114],
      [6.5, -4.5, 132, undefined, 3],
      [6.5, -4.5, 192],
    ],
  ],
  verticality: [
    've-hidden',
    'v1',
    [
      [0, 0, 2],
      [0, 0, 4.3, 'j', 0.6],
      [0, 2, 10],
      [0, 2, 10.4, 'j', 0.6],
      [0, 4, 16],
      [0, 4, 16.4, 'j', 0.6],
      [0, 6, 22],
      [-0.9, 6, 24],
      [-0.9, 6, 26.4, 'j', 0.6],
      [-1.33, 8.2, 34.4, 'wj', 0.5],
      [1.33, 10.2, 43, 'wj', 0.5],
      [-1.33, 12.2, 51.4, 'wj', 0.5],
      [1.33, 14.2, 59.5, 'wj', 0.5],
      [0, 15, 68, undefined, 1.5],
      [-0.9, 15, 70],
      [-0.9, 15, 72, 'jj', 0.6],
      [-1.33, 18.2, 78, 'wj', 0.5],
      [1.33, 20.2, 86.4, 'wj', 0.5],
      [-1.33, 22.2, 94.8, 'wj', 0.6],
      [-0.4, 24, 98, 'j', 2],
      [0, 25.5, 104, undefined, 2],
      [0, 25.5, 117],
    ],
  ],
  awakening: [
    'aw-hidden',
    'a1',
    [
      [0, 0, 6],
      [0, 0, 41.2, 'j', 0.8],
      [0, 0, 50],
      [0.5, 0, 53.8, 'j', 0.8],
      [2, 0.6, 63.5],
      [1.6, 0.6, 67.3, 'j', 0.8],
      [0, 1.2, 77],
      [-2, 1.2, 82],
      [-3.8, 1.2, 87.6, 'j', 0.8],
      [-5.5, 2.4, 92, undefined, 1.2],
      [-5.5, 2.4, 98, 'wj', 1.2],
      [-3, 4.2, 101, 'j', 1.5],
      [0, 4.6, 107],
      [0, 4.6, 112],
    ],
  ],
  breakpoint: [
    'bp-hidden',
    'b2',
    [
      [0, 0, 6],
      [0, 0, 18],
      [0, 0, 30],
      [0, 0, 38],
      [0, 0, 39.5, 's'],
      [0, 0, 45, 'u'],
      [0, 0, 47.2, 'j', 0.8],
      [0, 0, 56],
      [0, 0, 58.8, 'j', 0.8],
      [0, 0, 63.5, 's'],
      [0, 0, 69, 'u'],
      [0, 0, 73.2, 'j', 0.8],
      [-2, 0, 77],
      [-3.8, 0, 82.6, 'j', 0.8],
      [-5.5, 1.2, 87, undefined, 1.2],
      [-5.5, 1.2, 93, 'wj', 1.2],
      [-3, 3, 96, 'j', 1.5],
      [0, 3.4, 102],
      [0, 3.4, 106],
    ],
  ],
  inkfalls: [
    'if-hidden',
    'i2',
    [
      [0, 0, 6],
      [0, 0, 20],
      [0, 0, 45],
      [0, 0, 60],
      [0, 0, 70],
      [0, 0, 81.2, 'j', 0.8],
      [0, -4, 92],
      [0, -4, 97.2, 'j', 0.8],
      [0, -8, 108],
      [0, -8, 113.2, 'j', 0.8],
      [-2.5, -12, 126],
      [-3.4, -12.6, 135.5, 'j', 0.8],
      [-7.5, -17, 142, undefined, 1.5],
      [-7.5, -17, 156],
    ],
  ],
  faceted: [
    'fa-hidden',
    'f3',
    [
      [0, 0, 6],
      [0, 0, 30],
      [0, 0, 35.3, 'j', 0.8],
      [0, 0.3, 41.5, 'j', 1.2],
      [0, 0.9, 48.5, 'j', 1.2],
      [0, 1.4, 58],
      [0, 1.4, 67.5, 'w2', 0.6],
      [0, 1.4, 72, 'j', 0.6],
      [0, 1.4, 78, undefined, 1.6],
      [0, 1.4, 80.3, 'j', 1],
      [0, 1.4, 87, 'w2', 0.6],
      [0, 1.4, 91, 'j', 0.6],
      [0, 1.4, 97, undefined, 1.6],
      [0, 1.4, 99.3, 'j', 1],
      [0, 1.4, 106.5],
      [0, 1.4, 109, 'w2', 0.6],
      [0, 1.4, 111.8, 'j', 0.6],
      [0, 1.4, 118.5],
      [0, 1.4, 120.8, 'j', 0.6],
      [0, 1.4, 127.5],
      [0, 1.4, 129.8, 'j', 0.6],
      [0, 1.4, 136.5],
      [0, 1.4, 138.8, 'j', 0.6],
      [0, 1.4, 147],
      [0, 1.4, 152],
      [0, 3.4, 166, undefined, 2.5],
      [-2, 3.4, 168],
      [-3.8, 3.4, 170.6, 'j', 0.8],
      [-5.5, 4.6, 175, undefined, 1.2],
      [-5.5, 4.6, 180, 'wj', 1.2],
      [-3, 6.4, 183, 'j', 1.5],
      [0, 6.8, 189],
      [0, 6.8, 193],
    ],
  ],
  blockfall: [
    'bf-hidden',
    'k2',
    [
      [0, 0, 6],
      [0, 0, 28],
      [0, 0, 31.4, 'j', 0.8],
      [0, 0, 39.3, 'j', 0.6],
      [0, 0.5, 47.3, 'j', 0.6],
      [0, 1, 55.3, 'j', 0.6],
      [0, 1, 64],
      [0, 1, 69.2, 'jj+d', 0.8],
      [0, 1, 84],
      [-0.9, 1, 88],
      [-0.9, 1, 90.4, 'j', 0.6],
      [-1.33, 3.2, 98.4, 'wj', 0.5],
      [1.33, 5.2, 107, 'wj', 0.5],
      [-1.33, 7.2, 115.4, 'wj', 0.5],
      [1.33, 9.2, 123.5, 'wj', 0.5],
      [-1.33, 11.2, 131.6, 'wj', 0.5],
      [1.33, 13.2, 140, 'wj', 0.5],
      [-1.33, 15.2, 148.4, 'wj', 0.5],
      [1.33, 17.2, 156.8, 'wj', 0.5],
      [1.33, 19.2, 164.5, 'wj', 0.6],
      [0.4, 20.3, 167.5, 'j', 2],
      [0.6, 20.5, 174, undefined, 2],
      [0, 20.5, 186],
    ],
  ],
  core: [
    'co-hidden',
    'c1',
    [
      [0, 0, 6],
      [-2, 0, 14],
      [-3.8, 0, 22.6, 'j', 0.8],
      [-5.5, 1.2, 27, undefined, 1.2],
      [-5.5, 1.2, 33, 'wj', 1.2],
      [-3, 3, 36, 'j', 1.5],
      [0, 3.4, 42],
      [0, 3.4, 46],
    ],
  ],
};

beforeAll(async () => {
  await initPhysics();
});

describe.each(Object.entries(routes))('hidden route: %s', (id, [shortcut, shard, line]) => {
  test('the hidden line reaches the hidden zone and its shard', async () => {
    const entry = levelById(id)!;
    const data = (await entry.load()).build();
    data.bot = line.map(pt);
    const sim = new Simulation(entry.meta, data);
    const bot = new Bot(sim);
    let found = false;
    const got = new Set<string>();
    sim.events.on('shortcut', (s) => {
      if (s.id === shortcut && s.hidden) found = true;
    });
    sim.events.on('collect', (c) => got.add(c.id));
    const trace: string[] = [];
    let wp = -1;
    for (let t = 0; t < 60 * 120 && !(found && got.has(shard)) && sim.stats.deaths === 0; t++) {
      sim.tick(bot.step());
      const p = sim.player.pos;
      if (bot.index !== wp || t % 30 === 0)
        trace.push(
          `wp${bot.index} t${(t / 120).toFixed(2)} (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) ${sim.player.state}`,
        );
      wp = bot.index;
    }
    if (process.env.TRACE) (await import('fs')).writeFileSync(`/tmp/e/hid_${id}.log`, trace.join('\n'));
    expect(sim.stats.deaths).toBe(0);
    expect(found).toBe(true);
    expect(got.has(shard)).toBe(true);
  });
});
