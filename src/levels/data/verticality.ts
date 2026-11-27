/**
 * LEVEL 2 — VERTICALITY
 * Dusk among violet spires. The route climbs: ledge grabs, a wall-jump canyon, a turning
 * carousel, a lift past sliding shutters, weightless leaps inside a hollow spire, a long drop
 * onto moving ground and a last wall chain to the summit.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Base ledge =======================================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 0, 12, 14, { h: 3 }); // -7..7
  b.prompt(
    [0, 1.5, 0],
    [12, 4, 12],
    'jump',
    'Run and jump at tall ledges — you will catch the lip and vault up',
  );

  // ===== B. Giant steps (jump + vault) =========================================================
  b.plat(0, 2, 10, 10, 6, { h: 5, dress: false }); // 7..13
  b.plat(0, 4, 16, 10, 6, { h: 7, dress: false }); // 13..19
  b.plat(0, 6, 23, 10, 8, { h: 9 }); // 19..27
  for (const [y, z] of [
    [2, 7],
    [4, 13],
    [6, 19],
  ])
    b.strip([0, y - 0.02, z - 0.03], [9, 0.07, 0.07], 1);
  b.checkpoint(0, 6, 22);

  // ===== C. The canyon (wall-jump climb) =========================================================
  // two facing walls, no floor: every run + kick-off gains about two metres
  b.wall(-2.1, 3, 43.5, 0.8, 20, 41); // right wall 23..64 (starts on the last step), face x = -1.7
  b.wall(2.1, 3, 43.5, 0.8, 20, 41); // left wall, face x = 1.7
  b.prompt([0, 7.5, 23], [10, 4, 8], 'jump', 'Wall to wall: every run and kick-off carries you higher');
  b.plat(0, 15, 78, 8, 24, { h: 1 }); // exit ledge 66..90
  b.checkpoint(0, 15, 72);
  // hidden route: climb fast enough and a second, higher pair of walls continues above the ledge
  b.wall(-2.1, 18, 83, 0.8, 16, 34); // 66..100
  b.wall(2.1, 18, 83, 0.8, 16, 34);
  b.plat(0, 25.5, 115, 3.2, 28, { h: 0.7, mat: 'alt', dress: false }); // high beam 101..129
  b.strip([0, 25.52, 102], [2.6, 0.03, 0.2], 1);
  b.collectible('v1', 0, 27, 112);
  b.shortcut('ve-hidden', [0, 27.2, 115], [4, 3, 26], true);

  // ===== D. The carousel ============================================================================
  b.plat(0, 15, 105, 8, 8, { h: 20, mat: 'dark', dress: false }); // hub 101..109
  b.entity({
    type: 'rotator',
    p: [0, 14.5, 105],
    axis: [0, 1, 0],
    speed: 0.3,
    parts: [
      { p: [9.5, 0, 0], s: [7, 1, 7] },
      { p: [-9.5, 0, 0], s: [7, 1, 7] },
      { p: [0, 0, 9.5], s: [7, 1, 7] },
      { p: [0, 0, -9.5], s: [7, 1, 7] },
      { p: [0, -0.25, 0], s: [20, 0.3, 0.6], mat: 'accent' },
      { p: [0, -0.25, 0], s: [0.6, 0.3, 20], mat: 'accent' },
    ],
  });
  b.plat(0, 15, 125, 12, 10, { h: 1 }); // 120..130
  b.checkpoint(0, 15, 123);
  b.prompt(
    [0, 16.5, 85],
    [8, 4, 8],
    'jump',
    'The arms turn — step on as one arrives, cross the hub, step off the far side',
  );

  // ===== E. The lift and the shutters ==================================================================
  b.entity({
    type: 'mover',
    id: 'lift',
    s: [6, 1, 6],
    path: [
      [0, 14.5, 133.1],
      [0, 26.5, 133.1],
    ],
    speed: 4,
    pause: 1.6,
  }); // z 130.1..136.1
  b.plat(0, 27, 151.1, 8, 29.8); // 136.2..166
  // shutters: slabs that slide across the walkway (they block, they do not hurt)
  b.entity({
    type: 'mover',
    s: [7, 6, 1],
    path: [
      [-7.6, 30, 146],
      [0, 30, 146],
    ],
    speed: 4.5,
    pause: 1.1,
    mat: 'alt',
  });
  b.entity({
    type: 'mover',
    s: [7, 6, 1],
    path: [
      [7.6, 30, 154],
      [0, 30, 154],
    ],
    speed: 4.5,
    pause: 1.1,
    phase: 1.4,
    mat: 'alt',
  });
  b.decor('box', [-12.5, 30, 146], [3, 7, 1.6], 'dark');
  b.decor('box', [12.5, 30, 154], [3, 7, 1.6], 'dark');
  b.checkpoint(0, 27, 141);
  b.prompt(
    [0, 16.5, 126],
    [8, 4, 8],
    'forward',
    'Ride the lift — then slip past the shutters while they are open',
  );

  // ===== F. The hollow spire (low gravity) ===============================================================
  b.entity({ type: 'gravity', p: [0, 42, 194], s: [18, 50, 76], scale: 0.35 }); // z 156..232
  b.plat(0, 30.5, 180, 7, 6, { h: 0.8 }); // 177..183
  b.plat(0, 34, 197, 7, 6, { h: 0.8 }); // 194..200
  b.plat(0, 37.5, 214, 7, 6, { h: 0.8 }); // 211..217
  b.plat(0, 41, 234, 9, 12); // 228..240
  b.checkpoint(0, 27, 162);
  b.checkpoint(0, 41, 231);
  b.prompt(
    [0, 28.5, 162],
    [8, 4, 8],
    'jump',
    'Inside the spire you are almost weightless — hold jump and take long leaps',
  );
  b.collectible('v2', 0, 41, 197);

  // ===== G. The drop ============================================================================================
  b.entity({
    type: 'mover',
    s: [10, 1, 12],
    path: [
      [-5, 20.5, 252],
      [5, 20.5, 252],
    ],
    speed: 2.6,
    pause: 0.8,
  }); // z 246..258
  b.plat(0, 21, 266, 9, 12); // 260..272
  b.checkpoint(0, 21, 263);
  b.prompt([0, 42.5, 235], [9, 4, 8], 'forward', 'A long drop onto moving ground — steer in the air');

  // ===== H. Summit =================================================================================================
  b.wall(-3.0, 19, 277.5, 0.8, 12, 21); // 267..288
  b.wall(3.0, 19, 293, 0.8, 12, 14); // 286..300
  b.plat(0, 21, 308, 9, 12); // 302..314
  b.entity({ type: 'jumppad', p: [0, 21.6, 310], s: [4, 1.2, 4], v: [0, 22, 5] });
  b.plat(0, 28, 330, 14, 22); // 319..341
  b.finish(0, 28, 335, 10);
  b.collectible('v3', 0, 25.6, 291);

  scenery(b);
  b.bot(
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
    [0, 15, 72],
    [0, 15, 85, 'w2', 0.6],
    [0, 15, 89.5, 'j', 0.6],
    [0, 15, 95.5, undefined, 1.6],
    [0, 15, 97.8, 'j', 1],
    [0, 15, 104.5, 'w2', 0.6],
    [0, 15, 108.5, 'j', 0.6],
    [0, 15, 114.5, undefined, 1.6],
    [0, 15, 116.8, 'j', 1],
    [0, 15, 124],
    [0, 15, 128.5, 'w', 0.6],
    [0, 15, 133.1, 'w', 1.2],
    [0, 27, 133.3],
    [0, 27, 141],
    [0, 27, 165.5, 'j', 0.6],
    [0, 30.5, 180],
    [0, 30.5, 182.5, 'j', 0.6],
    [0, 34, 197],
    [0, 34, 199.5, 'j', 0.6],
    [0, 37.5, 214],
    [0, 37.5, 216.5, 'j', 0.6],
    [0, 41, 233],
    [0, 41, 239.6],
    [0, 21, 252, undefined, 2.5],
    [0, 21, 264],
    [-1.7, 21, 267],
    [-1.7, 21, 271.2, 'j', 0.8],
    [-2.2, 22, 278],
    [-2.2, 22, 284, 'wj'],
    [2.2, 22, 291],
    [2.2, 22, 297, 'wj'],
    [0, 21, 305],
    [0, 21, 310],
    [0, 28, 326],
    [0, 28, 335],
  );
  // ----- destructibles (Phase B): suspended panels and neon signs hung along the climb, in
  // reach of a running, aerial or wall-run slash
  b.breakable('panel', -1.5, 16.9, 129.4);
  b.breakable('sign', -1.5, 28.9, 156.1);
  b.breakable('panel', 1.7, 32.4, 185.1);
  b.breakable('sign', 1.7, 36.3, 202.7);
  b.breakable('panel', 1.7, 40.2, 220.3);
  b.breakable('panel', -1.5, 42.9, 236.7);
  b.breakable('sign', 1.6, 23.5, 268, { yaw: 0.19 });
  b.breakable('panel', -1.8, 22.9, 309.6, { yaw: 0.44 });
  return b.data;
}

function scenery(b: LevelBuilder) {
  // a forest of spires, their feet in the dark
  const spires = [
    [-34, 20, 12, 150],
    [38, 50, 14, 190],
    [-46, 95, 18, 230],
    [30, 120, 10, 170],
    [-30, 170, 12, 210],
    [44, 200, 16, 260],
    [-40, 250, 14, 200],
    [36, 290, 12, 240],
    [-36, 330, 16, 280],
    [48, 360, 14, 220],
  ];
  for (const [x, z, w, h] of spires) {
    b.monolith(x, -80, z, w, h, w, 'dark');
    b.monolith(x, -80 + h, z, w * 0.6, h * 0.22, w * 0.6, 'base');
    b.monolith(x, -80 + h * 1.22, z, w * 0.25, h * 0.2, w * 0.25, 'alt');
    b.strip([x + (x > 0 ? -w / 2 - 0.06 : w / 2 + 0.06), -80 + h * 0.55, z], [0.14, h * 0.8, 0.6], 1);
    b.strip([x, -80 + h * 0.55, z - w / 2 - 0.06], [0.6, h * 0.5, 0.14], 0.8);
  }
  b.monolith(-140, -120, 300, 46, 520, 46, 'dark');
  b.monolith(150, -120, 180, 40, 460, 40, 'dark');
  b.monolith(110, -120, 520, 56, 560, 50, 'dark');
  b.monolith(-100, -120, 600, 36, 440, 40, 'dark');
  b.ring(0, 60, 340, 30, 0.8, [1.57, 0, 0], [0, 0, 0.1], 'accent', 0.9);
  b.ring(0, 60, 340, 42, 1.4, [1.2, 0.3, 0], [0, 0, -0.05], 'alt', 0.2);
  b.ring(-20, 30, 120, 60, 1.3, [1.3, 0, 0.4], [0, 0, 0.03], 'base', 0.15);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    b.shard(
      side * (9 + ((i * 11) % 20)),
      4 + ((i * 9) % 44),
      -6 + i * 9.4,
      0.8 + (i % 4) * 0.5,
      i % 5 === 0 ? 'accent' : i % 2 ? 'alt' : 'glass',
      0.6,
    );
  }
  // vertical light beams
  for (const [x, z] of [
    [-12, 60],
    [12, 150],
    [-13, 230],
    [12, 320],
  ])
    b.decor('box', [x, 40, z], [0.25, 240, 0.25], 'accent', { glow: 0.7 });
}
