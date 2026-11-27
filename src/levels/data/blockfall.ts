/**
 * LEVEL 7 — BLOCKFALL
 * A world built from blocks hanging in the sky. Precision over speed: hop a line of narrow blocks,
 * double jump and dash a long gap, wall-jump up a narrow canyon, run down a stair of crumbling
 * blocks and along a thin beam, and dash the last gap. Then the blocks start to turn under you
 * (Level 7, up/down rotation): floors curl up into walls and over edges, so you run straight up a
 * block's face and over its top (the Climb), off an edge and straight down a face (the Drop), and
 * up a wall onto a ceiling, running upside down back over the route before coming down the far side
 * (the Turnover); last, the climb, a jump and the drop back to back. Home universe: Voxel.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { arc, ceilingAt, faceAt, floorAt, type Lane } from '../profile';

const D = 1; // the low deck
const H = 10; // canyon exit ledge
const S = 5; // the lower run after the stair
const U = S + 16; // top of the Climb's block
const Y0 = S - 6; // the runway below the Drop
const C = Y0 + 16; // the Turnover's ceiling

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Stepping blocks ================================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 22, 8, 20); // 12..32
  b.checkpoint(0, 0, 20);
  b.plat(0, 0, 38, 3.5, 4.6, { h: 4, dress: false }); // 35.7..40.3
  b.plat(0, 0.5, 46, 3.5, 4.6, { h: 4, dress: false }); // 43.7..48.3
  b.plat(0, 1, 54, 3.5, 4.6, { h: 4, dress: false }); // 51.7..56.3
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
  b.plat(0, S, 248, 14, 24); // 236..260
  b.checkpoint(0, S, 240);

  // ===== F. The blocks turn (up/down rotation) ================================================
  // Every surface here is a floor. Curves (lit centre lines) carry gravity round with you, so a floor
  // curls up into a wall, a wall into a ceiling, an edge down into a face; your speed carries
  // through every turn. Lane A (x −3..3) goes in, lane B (x 3..9) comes out of the Turnover.
  const A: Lane = [-3, 3],
    B: Lane = [3, 9];
  // (1) the Climb: the floor curls up into a 6 m face; run straight up it and over the top
  floorAt(b, A, S, 260, 270);
  arc(b, A, S + 5, 270, 5, 0, 90, 'inside');
  faceAt(b, A, 275, S + 5, S + 11, -1);
  arc(b, A, S + 11, 280, 5, -90, -180, 'outside');
  b.plat(0, U, 290, 6, 20, { h: U - S + 2, mat: 'base' }); // the block's top, z 280..300
  b.prompt(
    [0, S + 1.5, 254],
    [14, 4, 8],
    'forward',
    'The floor curls up ahead. Keep running: the wall is your floor',
  );
  b.checkpoint(0, U, 284);
  // (2) the Drop: off the far edge, straight down the block's face and out along the ground
  arc(b, A, U - 5, 300, 5, 180, 90, 'outside');
  faceAt(b, A, 305, Y0 + 5, U - 5, 1);
  arc(b, A, Y0 + 5, 310, 5, -90, 0, 'inside');
  b.prompt([0, U + 1.5, 290], [6, 4, 6], 'forward', 'Over the edge and straight down. Keep running');
  floorAt(b, A, Y0, 310, 360); // the runway (lane A)
  b.checkpoint(0, Y0, 314);
  // (3) the Turnover: up a face, onto a ceiling, upside down back over the runway; cross to lane B
  // on the ceiling, down the far face and out along lane B. A wall between the lanes means the
  // only way into lane B is over the top.
  arc(b, A, Y0 + 5, 360, 5, 0, 90, 'inside');
  faceAt(b, A, 365, Y0 + 5, Y0 + 11, -1);
  arc(b, A, Y0 + 11, 360, 5, 90, 180, 'inside');
  ceilingAt(b, A, C, 335, 360);
  ceilingAt(b, B, C, 315, 350);
  b.solid({ p: [0, C - 0.6, 352], s: [6, 1.2, 1], mat: 'accent' }); // a hurdle hanging from the ceiling
  b.solid({ p: [6, C - 0.6, 330], s: [6, 1.2, 1], mat: 'accent' });
  arc(b, B, C - 5, 315, 5, 180, 270, 'inside');
  faceAt(b, B, 310, Y0 + 5, C - 5, 1);
  arc(b, B, Y0 + 5, 315, 5, -90, 0, 'inside');
  floorAt(b, B, Y0, 315, 395);
  b.solid({ p: [3, Y0 + 4, 337.5], s: [1, 10, 55], mat: 'dark' }); // between the lanes, z 310..365
  b.prompt(
    [0, Y0 + 1.5, 330],
    [6, 4, 8],
    'forward',
    'Up, over and upside down. Cross to the right on the ceiling',
  );
  b.collectible('k3', 6, C - 1.2, 340); // the third shard hangs on the ceiling, upside down
  b.checkpoint(6, Y0, 368);
  // (4) all of it at once: up a face, over the top, jump the gap, over the next edge and down
  arc(b, B, Y0 + 5, 395, 5, 0, 90, 'inside');
  faceAt(b, B, 400, Y0 + 5, Y0 + 11, -1);
  arc(b, B, Y0 + 11, 405, 5, -90, -180, 'outside');
  b.plat(6, Y0 + 16, 410, 6, 10, { h: 17, mat: 'base' }); // top, z 405..415
  b.checkpoint(6, Y0 + 16, 408);
  b.plat(6, Y0 + 16, 423.5, 6, 5, { h: 17, mat: 'base' }); // across the gap, z 421..426
  arc(b, B, Y0 + 11, 426, 5, 180, 90, 'outside');
  faceAt(b, B, 431, Y0 + 5, Y0 + 11, 1);
  arc(b, B, Y0 + 5, 436, 5, -90, 0, 'inside');
  b.plat(6, Y0, 455, 14, 38); // 436..474
  b.finish(6, Y0, 460, 12);
  b.gate(6, Y0, 473, 10, 8);

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
    [0, S, 262],
    [0, S + 1.5, 273.5, undefined, 2.5],
    [0, S + 8, 275, undefined, 2.5],
    [0, S + 14.5, 276.5, undefined, 2.5],
    [0, U, 286, undefined, 2.5],
    [0, U, 297],
    [0, U - 1.5, 303.5, undefined, 2.5],
    [0, Y0 + 10, 305, undefined, 2.5],
    [0, Y0 + 0.5, 306.5, undefined, 2.5],
    [0, Y0, 318, undefined, 2.5],
    [0, Y0, 357],
    [0, Y0 + 1.5, 363.5, undefined, 2.5],
    [0, Y0 + 8, 365, undefined, 2.5],
    [0, C - 1.5, 363.5, undefined, 2.5],
    [0, C, 356, undefined, 2.5],
    [0, C, 353.3, 'j', 0.8],
    [1.5, C, 345, undefined, 1.5],
    [6, C, 340, undefined, 1.5],
    [6, C, 331.3, 'j', 0.8],
    [6, C, 320, undefined, 2],
    [6, C - 1.5, 311.5, undefined, 2.5],
    [6, Y0 + 8, 310, undefined, 2.5],
    [6, Y0 + 0.5, 311.5, undefined, 2.5],
    [6, Y0, 325, undefined, 2.5],
    [6, Y0, 392],
    [6, Y0 + 1.5, 398.5, undefined, 2.5],
    [6, Y0 + 8, 400, undefined, 2.5],
    [6, Y0 + 14.5, 401.5, undefined, 2.5],
    [6, Y0 + 16, 410, undefined, 2.5],
    [6, Y0 + 16, 414.6, 'j', 0.8],
    [6, Y0 + 16, 424],
    [6, Y0 + 14.5, 429.5, undefined, 2.5],
    [6, Y0 + 8, 431, undefined, 2.5],
    [6, Y0 + 0.5, 432.5, undefined, 2.5],
    [6, Y0, 445, undefined, 2.5],
    [6, Y0, 460],
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
  b.breakable('crate', -1.5, U, 292);
  b.breakable('crate', 7.5, Y0, 380);
  b.breakable('energy', 8, Y0, 466, { scale: 0.7 });
  return b.data;
}

function scenery(b: LevelBuilder) {
  // floating block islands and stacked block towers
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (16 + ((i * 13) % 26));
    const y = -10 + ((i * 7) % 24);
    const z = -6 + i * 13;
    const s = 4 + (i % 4) * 2;
    b.decor('box', [x, y, z], [s, s, s], i % 3 ? 'base' : 'alt');
    b.decor('box', [x + side * s * 0.4, y - s, z + 1], [s * 0.6, s, s * 0.6], 'dark');
    if (i % 4 === 0) b.decor('box', [x, y + s * 0.9, z], [s * 0.5, s * 0.8, s * 0.5], 'accent');
  }
  for (let i = 0; i < 13; i++) b.monolith(i % 2 ? 70 : -70, -60, i * 40, 20, 120 + (i % 3) * 40, 20, 'dark');
}
