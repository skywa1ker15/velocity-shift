/**
 * LEVEL 7 — BLOCKFALL
 * A world built from blocks hanging in the sky. Precision over speed: hop a line of narrow blocks,
 * double jump and dash a long gap, wall-jump up a narrow canyon, run down a stair of crumbling
 * blocks and along a thin beam, then one last dash to the finish. Home universe: Voxel.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const D = 1; // the low deck
const H = 10; // canyon exit ledge
const S = 5; // the lower run after the stair

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Stepping blocks ================================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 22, 8, 20); // 12..32
  b.checkpoint(0, 0, 20);
  b.plat(0, 0, 38, 3.5, 4, { h: 4, dress: false }); // 36..40
  b.plat(0, 0.5, 46, 3.5, 4, { h: 4, dress: false }); // 44..48
  b.plat(0, 1, 54, 3.5, 4, { h: 4, dress: false }); // 52..56
  b.plat(0, D, 65, 8, 10); // 60..70
  b.checkpoint(0, D, 63);
  b.prompt([0, 1.5, 26], [8, 4, 8], 'jump', 'Small blocks: land in the middle, jump from the edge');

  // ===== B. The long gap =====================================================================
  b.collectible('k1', 0, D + 2.5, 74.5);
  b.ring(0, D + 3, 74.5, 5.5, 0.4, [0, 0, 0], [0, 0, 0.3], 'accent', 1);
  b.plat(0, D, 85, 8, 12); // 79..91
  b.checkpoint(0, D, 82);
  b.prompt([0, D + 1.5, 63], [8, 4, 6], 'dash', 'Jump, jump again, then dash across');

  // ===== C. The canyon (wall-jump climb) + hidden upper walls ===================================
  b.wall(-2.1, D - 3, 107.5, 0.8, 20, 41); // 87..128, face x = -1.7
  b.wall(2.1, D - 3, 107.5, 0.8, 20, 41); // face x = 1.7
  b.plat(0, H, 142, 8, 24, { h: 1 }); // 130..154
  b.checkpoint(0, H, 136);
  // hidden: the canyon walls carry on above the ledge; keep kicking instead of stepping off
  b.wall(-2.1, H, 148, 0.8, 20, 40); // 128..168
  b.wall(2.1, H, 148, 0.8, 20, 40);
  b.plat(0, H + 10.5, 183, 4, 28, { h: 0.7, mat: 'alt', dress: false }); // 169..197
  b.strip([0, H + 10.52, 170], [2.6, 0.03, 0.2], 1);
  b.collectible('k2', 0, H + 12, 184);
  b.shortcut('bf-hidden', [0, H + 12.2, 183], [4, 3, 26], true);
  b.prompt([0, D + 1.5, 84], [8, 4, 6], 'jump', 'Wall to wall: run, kick off, catch the other side');

  // ===== D. The crumbling stair ===============================================================
  [9, 8, 7, 6].forEach((y, i) =>
    b.entity({ type: 'collapse', p: [0, y - 0.4, 159 + i * 6], s: [5, 0.8, 5], delay: 0.8, mat: 'alt' }),
  );
  b.plat(0, S, 192, 8, 16); // 184..200
  b.checkpoint(0, S, 187);
  b.prompt([0, H + 1.5, 148], [8, 4, 6], 'forward', 'The stair crumbles behind you: do not stop');

  // ===== E. The thin beam and the last gap ======================================================
  b.plat(0, S, 213, 1.6, 26, { mat: 'alt' }); // 200..226
  b.checkpoint(0, S, 203);
  b.collectible('k3', 0, S + 2.2, 231);
  b.plat(0, S, 248, 14, 24); // 236..260
  b.finish(0, S, 252, 12);
  b.gate(0, S, 259.5, 10, 8);

  scenery(b);

  b.bot(
    [0, 0, 6],
    [0, 0, 28],
    [0, 0, 31.4, 'j', 0.8],
    [0, 0, 39.3, 'j', 0.6],
    [0, 0.5, 47.3, 'j', 0.6],
    [0, D, 55.3, 'j', 0.6],
    [0, D, 64],
    [0, D, 69.2, 'jj+d', 0.8],
    [0, D, 84],
    [-0.9, D, 88],
    [-0.9, D, 90.4, 'j', 0.6],
    [-1.33, D + 2.2, 98.4, 'wj', 0.5],
    [1.33, D + 4.2, 107, 'wj', 0.5],
    [-1.33, D + 6.2, 115.4, 'wj', 0.5],
    [1.33, D + 8.2, 123.5, 'wj', 0.5],
    [0, H, 136],
    [0, H, 153.3, 'j', 0.8],
    [0, 9, 159],
    [0, 8, 165],
    [0, 7, 171],
    [0, 6, 177],
    [0, 6, 179, 'j', 0.8],
    [0, S, 192],
    [0, S, 210],
    [0, S, 225.2, 'jj+d', 0.8],
    [0, S, 244],
    [0, S, 252],
  );
  // ----- destructibles beside the line: the sword is never needed, but they answer it
  b.breakable('crate', 1.5, 0, 8);
  b.breakable('energy', -2.7, 0, 26, { scale: 0.7 });
  b.breakable('crate', 1.5, D, 67.5);
  b.breakable('energy', -2.7, D, 86, { scale: 0.7 });
  b.breakable('energy', -2.7, S, 190, { scale: 0.7 });
  b.breakable('crate', 1.5, S, 196);
  b.breakable('energy', -2.7, S, 244, { scale: 0.7 });
  b.breakable('crate', 1.5, S, 250);
  b.breakable('energy', -2.7, S, 256, { scale: 0.7 });
  return b.data;
}

function scenery(b: LevelBuilder) {
  // floating block islands and stacked block towers
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (16 + ((i * 13) % 26));
    const y = -10 + ((i * 7) % 24);
    const z = -6 + i * 13;
    const s = 4 + (i % 4) * 2;
    b.decor('box', [x, y, z], [s, s, s], i % 3 ? 'base' : 'alt');
    b.decor('box', [x + side * s * 0.4, y - s, z + 1], [s * 0.6, s, s * 0.6], 'dark');
    if (i % 4 === 0) b.decor('box', [x, y + s * 0.9, z], [s * 0.5, s * 0.8, s * 0.5], 'accent');
  }
  for (let i = 0; i < 8; i++) b.monolith(i % 2 ? 70 : -70, -60, i * 40, 20, 120 + (i % 3) * 40, 20, 'dark');
}
