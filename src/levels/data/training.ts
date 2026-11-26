/**
 * TRAINING — the movement gym. One station per mechanic, in the order they are taught,
 * laid out in a straight line heading +Z. Also used by the automated bot test.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

export function build(): LevelData {
  const b = new LevelBuilder();
  const W = 9; // lane width

  // --- 0. start plaza -------------------------------------------------------------------
  b.spawnCheckpoint(0, 0, -3);
  b.plat(0, 0, 0, 16, 16);
  b.gate(0, 0, 7.4, 8, 5);
  b.prompt([0, 1.5, 0], [16, 4, 16], 'forward', 'Move with the movement keys — look with the mouse');

  // --- 1. sprint lane -------------------------------------------------------------------
  b.plat(0, 0, 23, W, 30);
  b.prompt([0, 1.5, 22], [W, 4, 26], 'sprint', 'Speed builds as you run — momentum is everything');
  for (let z = 12; z <= 36; z += 8) b.strip([0, 0.012, z], [1.2, 0.02, 0.18], 0.7);

  // --- 2. jump gaps ---------------------------------------------------------------------
  b.plat(0, 0, 47, W, 10); // 42..52
  b.plat(0, 0, 62, W, 11); // 56.5..67.5
  b.checkpoint(0, 0, 45);
  b.prompt([0, 1.5, 36], [W, 4, 6], 'jump', 'Jump the gap — hold longer to jump higher');

  // --- 3. slide under -------------------------------------------------------------------
  b.plat(0, 0, 82, W, 29); // 67.5..96.5
  b.solid({ p: [0, 1.05 + 0.9, 82], s: [W + 2, 1.8, 4], mat: 'alt' }); // underside at 1.05
  b.column(-W / 2 - 0.4, 0, 80.2, 6, 0.5, 'alt');
  b.column(W / 2 + 0.4, 0, 80.2, 6, 0.5, 'alt');
  b.strip([0, 1.02, 79.9], [W, 0.06, 0.12], 1);
  b.checkpoint(0, 0, 70);
  b.prompt(
    [0, 1.5, 72],
    [W, 4, 9],
    'slide',
    'Slide under the beam — sliding from a sprint gives a burst of speed',
  );
  b.collectible('t1', 0, 3.9, 82); // on top of the beam: a first reward for curiosity

  // --- 4. double jump -------------------------------------------------------------------
  b.plat(0, 1, 110, W, 11); // 104.5..115.5
  b.checkpoint(0, 1, 107);
  b.prompt([0, 1.5, 92], [W, 4, 8], 'jump', 'Too far for one jump — press jump again in mid-air');

  // --- 5. dash --------------------------------------------------------------------------
  b.plat(0, 1, 131, W, 13); // 124.5..137.5
  b.checkpoint(0, 1, 127);
  b.prompt([0, 2.5, 111], [W, 4, 8], 'dash', 'Jump, then dash at the top of the arc');

  // --- 6. wall-run ----------------------------------------------------------------------
  b.wall(-3.0, -1, 143.75, 0.8, 8, 21.5); // z 133..154.5 (starts on the deck), inner face at x = -2.6
  b.plat(0, 1, 163.5, 10, 17); // 155..172
  b.checkpoint(0, 1, 162);
  b.prompt(
    [0, 2.5, 132],
    [W, 4, 10],
    'jump',
    'Jump beside a lit wall and keep moving forward to run along it — jump again to kick off',
  );
  b.collectible('t2', -1.9, 5.2, 147); // high on the wall-run line

  // --- 7. wall-to-wall ------------------------------------------------------------------
  b.wall(-3.0, -1, 177.5, 0.8, 9, 21); // 167..188
  b.wall(3.0, -1, 193, 0.8, 9, 14); // 186..200
  b.plat(0, 1, 221, 10, 38); // 202..240
  b.checkpoint(0, 1, 206);
  b.prompt([0, 2.5, 168], [10, 4, 8], 'jump', 'Chain walls: run, kick off, catch the opposite wall');

  // --- 8. vault -------------------------------------------------------------------------
  b.plat(0, 2.0, 216, 10, 1.2, { h: 1.0, mat: 'alt', dress: false });
  b.plat(0, 2.2, 225, 10, 1.2, { h: 1.2, mat: 'alt', dress: false });
  b.prompt(
    [0, 2.5, 211],
    [10, 4, 8],
    'forward',
    'Run straight at waist-high blocks to vault them without losing speed',
  );

  // --- 9. slide chute + boost -----------------------------------------------------------
  b.ramp([0, 1, 240], [0, -7, 264], W);
  b.plat(0, -7, 279, W, 30); // 264..294
  b.entity({ type: 'boost', p: [0, -6.4, 272], s: [5, 1.2, 4], dir: [0, 0, 1], add: 6, min: 16 });
  b.checkpoint(0, 1, 236);
  b.prompt(
    [0, 2.5, 234],
    [10, 4, 10],
    'slide',
    'Slide down slopes to build speed — then jump or dash to carry it',
  );

  // --- 10. moving platform --------------------------------------------------------------
  b.entity({
    type: 'mover',
    s: [6, 1, 6],
    path: [
      [0, -7.5, 297.2],
      [0, -7.5, 310.8],
    ],
    speed: 4,
    pause: 1.2,
  });
  b.plat(0, -7, 320, 10, 12); // 314..326
  b.checkpoint(0, -7, 288);
  b.prompt(
    [0, -5.5, 289],
    [W, 4, 8],
    'forward',
    'Moving ground carries you — and adds its speed to your jump',
  );

  // --- 11. collapsing bridge → finish -----------------------------------------------------
  b.checkpoint(0, -7, 317);
  for (let i = 0; i < 3; i++)
    b.entity({ type: 'collapse', p: [0, -7.3, 329 + i * 6], s: [5, 0.6, 5.8], delay: 0.9 });
  b.plat(0, -7, 352, 14, 16); // 344..360
  b.prompt([0, -5.5, 321], [10, 4, 8], 'forward', 'Cracked ground falls away — keep moving');
  b.finish(0, -7, 355, 10);
  b.collectible('t3', 0, -5.2, 335);

  // --- scenery --------------------------------------------------------------------------
  for (let i = 0; i < 9; i++) {
    const z = -20 + i * 46;
    b.monolith(-38 - (i % 3) * 9, -60, z, 12, 120 + (i % 4) * 26, 12, 'dark');
    b.monolith(40 + ((i + 1) % 3) * 8, -70, z + 20, 10, 130 + (i % 3) * 30, 14, 'dark');
  }
  b.ring(0, 30, 120, 60, 1.2, [1.2, 0, 0.2], [0, 0, 0.05], 'alt', 0.3);
  b.ring(0, 12, 300, 44, 0.9, [1.45, 0.3, 0], [0, 0, -0.06], 'alt', 0.3);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    b.shard(
      side * (12 + ((i * 7) % 16)),
      4 + ((i * 5) % 14),
      i * 14 - 6,
      1.2 + (i % 3) * 0.7,
      i % 5 === 0 ? 'accent' : 'alt',
    );
  }
  for (let z = 20; z < 350; z += 30) {
    b.column(-W / 2 - 2.2, -30, z, 30 + ((z / 30) % 2) * 3, 0.7, 'dark');
    b.column(W / 2 + 2.2, -30, z + 15, 30, 0.7, 'dark');
  }

  // --- bot main line --------------------------------------------------------------------
  b.bot(
    [0, 0, 6],
    [0, 0, 37.2, 'j', 0.8],
    [0, 0, 46],
    [0, 0, 51.2, 'j', 0.8],
    [0, 0, 62],
    [0, 0, 74, 's'],
    [0, 0, 87, 'u'],
    [0, 0, 95.6, 'jj', 0.8],
    [0, 1, 108],
    [0, 1, 114.7, 'j+d', 0.8],
    [0, 1, 128],
    [-1.7, 1, 132],
    [-1.7, 1, 136.4, 'j', 0.8],
    [-2.2, 2, 144],
    [-2.2, 2, 150, 'wj'],
    [0, 1, 162],
    [-1.7, 1, 167],
    [-1.7, 1, 171.2, 'j', 0.8],
    [-2.2, 2, 178],
    [-2.2, 2, 184, 'wj'],
    [2.2, 2, 191],
    [2.2, 2, 197, 'wj'],
    [0, 1, 208],
    [0, 1, 213],
    [0, 2, 217.5],
    [0, 1, 221],
    [0, 2.2, 226.5],
    [0, 1, 233],
    [0, 1, 240.5, 's'],
    [0, -7, 268],
    [0, -7, 286, 'u'],
    [0, -7, 292.8, 'w', 0.7],
    [0, -7, 297.4, 'w', 0.9],
    [0, -7, 312.6, 'j', 1.2],
    [0, -7, 318],
    [0, -7, 330],
    [0, -7, 346],
    [0, -7, 356],
  );
  return b.data;
}
