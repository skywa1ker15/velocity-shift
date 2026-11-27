/**
 * LEVEL 5 — INK FALLS
 * A brush-drawn gorge that only goes down. A bridge that gives way, terraces that drop a storey at
 * a time, a long ink chute, a wall chain over the void and a last failing bridge to the finish.
 * Home universe: Ink. Main line heads +Z down x = 0; a hidden ledge runs left of the chute.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const C = -22; // the gorge floor
const F = -30; // the pool at the bottom

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Lip of the falls + failing bridge ==============================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 22, 8, 20); // 12..32
  b.checkpoint(0, 0, 25);
  for (let i = 0; i < 5; i++)
    b.entity({ type: 'collapse', p: [0, -0.3, 35 + i * 6], s: [6, 0.6, 5.8], delay: 0.9 });
  b.collectible('i1', 0, 1.6, 47);
  b.prompt([0, 1.5, 26], [8, 4, 6], 'forward', 'The bridge gives way under you: keep running');

  // ===== B. Terraces ========================================================================
  b.plat(0, 0, 72, 8, 20); // 62..82
  b.checkpoint(0, 0, 66);
  b.plat(0, -4, 92, 8, 12); // 86..98
  b.plat(0, -8, 108, 8, 12); // 102..114
  b.plat(0, -12, 126, 8, 16); // 118..134
  b.checkpoint(0, -12, 121);
  b.prompt([0, 1.5, 76], [8, 4, 8], 'jump', 'Drop a storey at a time: jump each gap');

  // ===== C. The ink chute + hidden ledge ======================================================
  b.ramp([0, -12, 134], [0, C, 158], 8);
  b.plat(0, C, 176, 8, 36); // 158..194
  b.checkpoint(0, C, 162, Math.PI, [7, 6, 2]);
  b.solid({ p: [0, C + 1.05 + 0.6, 172], s: [9, 1.2, 1.4], mat: 'alt' });
  b.decor('box', [-4.8, C + 2.5, 172], [0.5, 5, 0.5], 'dark');
  b.decor('box', [4.8, C + 2.5, 172], [0.5, 5, 0.5], 'dark');
  // hidden: a narrow ledge left of the chute, for those who jump off the side
  b.plat(-7.5, -17, 151, 3, 26, { h: 0.6, mat: 'alt', dress: false }); // 138..164, x -9..-6
  b.ramp([-7.5, -17, 164], [-5, C, 180], 3);
  b.strip([-6, -11.9, 136], [0.06, 0.06, 2.4], 1);
  b.collectible('i2', -7.5, -15.6, 152);
  b.shortcut('if-hidden', [-7.5, -15.5, 151], [4, 3, 24], true);
  b.prompt([0, -10.5, 130], [8, 4, 6], 'slide', 'Slide the chute and stay low under the bar');

  // ===== D. Over the void (wall chain) ==========================================================
  b.wall(3.0, C - 2, 200, 0.8, 8, 22); // 189..211
  b.plat(0, C, 218.5, 10, 14); // 211.5..225.5
  b.checkpoint(0, C, 215);
  b.wall(-3.0, C - 2, 231, 0.8, 9, 21); // 220.5..241.5
  b.wall(3.0, C - 2, 246.5, 0.8, 9, 14); // 239.5..253.5
  b.plat(0, C, 263.5, 10, 16); // 255.5..271.5
  b.checkpoint(0, C, 259);
  b.prompt([0, C + 1.5, 186], [8, 4, 6], 'jump', 'Run the walls across the void: kick off to the next');

  // ===== E. The plunge and the last bridge ======================================================
  b.ramp([0, C, 271.5], [0, F, 295.5], 8);
  b.plat(0, F, 309.5, 8, 28); // 295.5..323.5
  b.checkpoint(0, F, 299, Math.PI, [7, 6, 2]);
  for (let i = 0; i < 5; i++)
    b.entity({ type: 'collapse', p: [0, F - 0.3, 326.5 + i * 6], s: [6, 0.6, 5.8], delay: 0.9 });
  b.collectible('i3', 0, F + 1.4, 339);
  b.prompt([0, F + 1.5, 324], [8, 4, 5], 'jump', 'The bridge is going: double jump the last gap');
  b.plat(0, F, 368, 12, 16); // 360..376
  b.finish(0, F, 370, 10);
  b.gate(0, F, 375.5, 10, 8);

  scenery(b);

  b.bot(
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
    [0, -12, 126],
    [0, -12, 134.5, 's'],
    [0, C, 160],
    [0, C, 178, 'u'],
    [0, C, 186],
    [1.7, C, 189.5],
    [1.7, C, 192.9, 'j', 0.8],
    [2.2, C + 1, 200.5],
    [2.2, C + 1, 206.5, 'wj'],
    [0, C, 216.5],
    [-1.7, C, 220.5],
    [-1.7, C, 224.7, 'j', 0.8],
    [-2.2, C + 1, 231.5],
    [-2.2, C + 1, 237.5, 'wj'],
    [2.2, C + 1, 244.5],
    [2.2, C + 1, 250.5, 'wj'],
    [0, C, 260.5],
    [0, C, 272, 's'],
    [0, F, 297.5],
    [0, F, 314.5, 'u'],
    [0, F, 322],
    [0, F, 340],
    [0, F, 352.2, 'jj', 0.8],
    [0, F, 365],
    [0, F, 370],
  );
  // ----- destructibles beside the line: the sword is never needed, but they answer it
  b.breakable('relic', 1.5, 0, 8);
  b.breakable('column', -1.5, 0, 20);
  b.breakable('relic', 1.5, 0, 70);
  b.breakable('column', -1.5, -12, 126);
  b.breakable('relic', 1.5, C, 165);
  b.breakable('column', -1.5, C, 180);
  b.breakable('relic', 1.5, C, 221);
  b.breakable('column', 1.5, C, 262);
  b.breakable('relic', -1.5, F, 305);
  b.breakable('column', 1.5, F, 318);
  b.breakable('relic', -1.5, F, 366);
  return b.data;
}

function scenery(b: LevelBuilder) {
  // gorge walls: tall brush-stroke cliffs either side, stepping down with the route
  for (let i = 0; i < 20; i++) {
    const z = -10 + i * 20;
    const top = 10 - i * 2;
    for (const side of [-1, 1]) {
      const x = side * (24 + ((i * 7) % 9));
      b.monolith(x, top - 120, z, 14 + (i % 3) * 6, 120, 18, i % 2 ? 'base' : 'alt');
    }
  }
  // the falls themselves: pale strips pouring off the left cliff
  for (let i = 0; i < 6; i++) b.strip([-17, -20, 40 + i * 55], [3, 60, 0.3], 0.5);
  for (let i = 0; i < 30; i++)
    b.shard(((i * 29) % 40) - 20, 6 - i * 1.2, i * 13, 0.8 + (i % 3) * 0.5, i % 5 ? 'base' : 'accent', 0.5);
}
