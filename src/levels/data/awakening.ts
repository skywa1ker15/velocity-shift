/**
 * LEVEL 1 — THE AWAKENING
 * Dawn above a sea of clouds. Pale marble ruins teach every move in order:
 * run → jump → slide → double jump → moving ground → dash → wall-run → wall chain; then a second
 * half practises them together at the same gentle pace (sunlit terraces, a colonnade of arches and
 * rails, garden bridges, twin aqueducts and a halo stair) before the descent and the finale.
 * Main line heads +Z down the centre lane (x = 0). One hidden high route, one air shortcut.
 */
import { LevelBuilder } from '../LevelBuilder';
import { Course } from '../sections';
import type { LevelData } from '../types';

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Threshold ====================================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 27, 7, 30); // 12..42
  b.gate(0, 0, 11.6, 8.5, 6);
  for (let z = -6; z <= 10; z += 4) {
    b.column(-6.2, 0, z, 7, 0.45);
    b.column(6.2, 0, z, 7, 0.45);
  }
  b.prompt([0, 1.5, 0], [14, 4, 14], 'forward', 'Move with the movement keys — look with the mouse');
  b.prompt([0, 1.5, 24], [7, 4, 20], 'sprint', 'Keep running — speed builds, and momentum is everything');

  // ===== B. Broken causeway (jumps) ========================================================
  b.plat(0, 0, 50, 7, 9); // 45.5..54.5
  b.plat(2, 0.6, 63.5, 7, 9); // 59..68
  b.plat(0, 1.2, 77, 8, 10); // 72..82
  b.checkpoint(0, 1.2, 75);
  b.prompt([0, 1.5, 38.5], [7, 4, 7], 'jump', 'Jump the gap — hold the key longer to jump higher');

  // ===== C. Fallen pillars (slide) + hidden wall route =====================================
  b.plat(0, 1.2, 100, 8, 36); // 82..118
  for (const z of [95, 107]) {
    b.solid({ p: [0, 1.2 + 1.05 + 0.7, z], s: [11, 1.4, 1.6], mat: 'alt' }); // underside 1.05 m above the deck
    b.decor('pillar', [-6.4, 2.6, z + 0.3], [1.5, 3.4, 1.5], 'alt', { r: [0, 0, 1.25] });
    b.decor('pillar', [6.6, 2.2, z - 0.2], [1.5, 2.8, 1.5], 'alt', { r: [0.2, 0, -1.3] });
    b.strip([0, 2.22, z - 0.82], [8, 0.05, 0.05], 0.9);
  }
  b.prompt(
    [0, 2.7, 87],
    [8, 4, 8],
    'slide',
    'Slide under the fallen pillars — a slide from a sprint gives a burst of speed',
  );
  // hidden route: a lit wall just off the right-hand edge leads up to a beam above the lane
  b.wall(-6.2, 0, 93.5, 0.8, 8, 15); // 86..101, face at x = -5.8
  b.plat(0, 4.6, 110, 3, 14, { h: 0.6, mat: 'alt', dress: false }); // 103..117
  b.strip([-5.75, 1.3, 84.6], [0.06, 0.06, 2.4], 1); // a light leak pointing at the wall
  b.strip([-4.6, 1.215, 84.6], [1.6, 0.02, 0.12], 0.8);
  b.collectible('a1', 0, 5.9, 111);
  b.shortcut('aw-hidden', [0, 6.1, 110], [4, 3, 13], true);

  // ===== D. First double jump ================================================================
  b.plat(0, 2.2, 132, 9, 11); // 126.5..137.5
  b.checkpoint(0, 2.2, 129);
  b.prompt([0, 2.7, 113], [8, 4, 9], 'jump', 'Too far for one jump — press jump again in mid-air');

  // ===== E. Drifting stones (moving ground) ====================================================
  b.entity({
    type: 'mover',
    s: [5, 1, 4.5],
    path: [
      [0, 1.5, 143],
      [0, 2.5, 143],
    ],
    speed: 0.7,
    pause: 0.4,
  });
  b.entity({
    type: 'mover',
    s: [5, 1, 4.5],
    path: [
      [0, 3.1, 150],
      [0, 2.1, 150],
    ],
    speed: 0.7,
    pause: 0.4,
  });
  b.plat(0, 3.6, 163, 10, 15); // 155.5..170.5
  b.checkpoint(0, 3.6, 158);
  b.prompt([0, 3.7, 133], [9, 4, 8], 'jump', 'The stones drift — jump when they are close');

  // ===== F. The halo (dash) =====================================================================
  b.plat(0, 3.6, 187, 9, 13); // 180.5..193.5
  b.ring(0, 6.2, 175.5, 8.5, 0.55, [0, 0, 0], [0, 0, 0.12], 'alt', 0.25);
  b.ring(0, 6.2, 175.5, 10.2, 0.2, [0, 0, 0], [0, 0, -0.2], 'accent', 1);
  b.collectible('a2', 0, 7.0, 175.5);
  b.checkpoint(0, 3.6, 183);
  b.prompt([0, 5.1, 165], [10, 4, 9], 'dash', 'Jump, jump again, then dash through the halo');

  // ===== G. The aqueduct (first wall-run, wall on the left) ========================================
  b.wall(3.0, 1.6, 199.5, 0.8, 8, 22); // 188.5..210.5 (starts on the deck), face at x = 2.6
  b.plat(0, 3.6, 218, 10, 14); // 211..225
  b.checkpoint(0, 3.6, 214);
  b.prompt(
    [0, 5.1, 188],
    [9, 4, 9],
    'jump',
    'Jump beside the lit wall and keep moving forward to run along it — jump again to kick off',
  );

  // ===== H. Wall to wall ============================================================================
  b.wall(-3.0, 1.6, 230.5, 0.8, 9, 21); // 220..241
  b.wall(3.0, 1.6, 246, 0.8, 9, 14); // 239..253
  b.plat(0, 3.6, 263, 10, 16); // 255..271
  b.checkpoint(0, 3.6, 258);
  b.prompt([0, 5.1, 220], [10, 4, 9], 'jump', 'Chain the walls: run, kick off, catch the next one');

  // ===== K. Sunlit terraces (a breather, then three easy steps up) ==========================
  b.plat(0, 3.6, 287, 16, 32); // 271..303, wide and open
  b.plat(0, 4.2, 307, 8, 8); // 303..311
  b.checkpoint(0, 4.2, 306);
  b.plat(0, 4.8, 318, 8, 8); // 314..322
  b.plat(0, 5.4, 329, 8, 8); // 325..333
  b.prompt([0, 5.1, 280], [16, 4, 14], 'jump', 'A wide terrace: catch your breath, then step up');
  // ===== L. The colonnade (slide the arches, jump the rails, in rhythm) =========================
  const Y = 5.4;
  b.plat(0, Y, 376, 8, 86); // 333..419
  b.checkpoint(0, Y, 360);
  for (const z of [366, 388, 408]) {
    b.solid({ p: [0, Y + 1.05 + 0.7, z], s: [9, 1.4, 1.6], mat: 'alt' }); // an arch: slide under
    b.strip([0, Y + 1.02, z - 0.82], [8, 0.05, 0.05], 0.9);
  }
  for (const z of [377, 398]) b.solid({ p: [0, Y + 0.4, z], s: [7.6, 0.8, 0.6], mat: 'alt' }); // a rail: jump it
  for (let z = 336; z <= 416; z += 8) {
    b.column(-5.4, Y, z, 7, 0.45);
    b.column(5.4, Y, z, 7, 0.45);
  }
  b.prompt([0, Y + 1.5, 352], [8, 4, 8], 'slide', 'Find the rhythm: slide the arches, jump the rails');
  b.checkpoint(0, Y, 416);
  // ===== M. Garden bridges (drifting stones, then a double-jump gap) ==============================
  b.entity({
    type: 'mover',
    s: [5, 1, 4.5],
    path: [
      [0, Y - 1.4, 424],
      [0, Y - 0.4, 424],
    ],
    speed: 0.7,
    pause: 0.4,
  });
  b.entity({
    type: 'mover',
    s: [5, 1, 4.5],
    path: [
      [0, Y - 0.2, 431],
      [0, Y - 1.2, 431],
    ],
    speed: 0.7,
    pause: 0.4,
  });
  b.plat(0, Y, 444, 10, 16); // 436..452
  b.checkpoint(0, Y, 443);
  b.plat(0, Y, 469, 10, 14); // 462..476: ten metres across
  b.prompt([0, Y + 1.5, 448], [10, 4, 6], 'jump', 'Too far for one jump: jump again in mid-air');
  // ===== N. Twin aqueducts (one wall each side, then three in a row) ================================
  // each wall starts on the deck you leave and ends where the next deck begins, as at the aqueduct
  b.wall(3.0, Y - 2, 483, 0.8, 8, 22); // 472..494, wall on the left
  b.plat(0, Y, 503, 10, 18); // 494..512
  b.checkpoint(0, Y, 503);
  b.wall(-3.0, Y - 2, 519, 0.8, 8, 22); // 508..530, wall on the right
  b.plat(0, Y, 539, 10, 18); // 530..548
  b.checkpoint(0, Y, 539);
  b.wall(3.0, Y - 2, 552, 0.8, 9, 16); // 544..560
  b.wall(-3.0, Y - 2, 566, 0.8, 9, 16); // 558..574
  b.wall(3.0, Y - 2, 580, 0.8, 9, 16); // 572..588
  b.plat(0, Y, 600, 10, 24); // 588..612
  b.checkpoint(0, Y, 599);
  b.prompt([0, Y + 1.5, 470], [10, 4, 6], 'jump', 'One wall, then the other. Then three in a row');
  // ===== O. The halo stair (dash a gap, then down to the descent) ====================================
  b.ring(0, Y + 2.6, 617, 7.5, 0.5, [0, 0, 0], [0, 0, 0.12], 'alt', 0.25);
  b.ring(0, Y + 2.6, 617, 9, 0.2, [0, 0, 0], [0, 0, -0.2], 'accent', 1);
  b.plat(0, Y, 631, 10, 18); // 622..640 (ten metres across, as at the first halo)
  b.plat(0, 4.8, 645, 10, 10); // 640..650
  b.plat(0, 4.2, 655, 10, 10); // 650..660
  b.plat(0, 3.6, 665.5, 10, 11); // 660..671
  b.checkpoint(0, 3.6, 664);
  b.prompt([0, Y + 1.5, 606], [10, 4, 6], 'dash', 'Jump, jump again, then dash through the halo');

  // ===== I. The descent (slide chute, door that opens ahead) ===========================================
  b.ramp([0, 3.6, 671], [0, -4.4, 695], 8);
  b.plat(0, -4.4, 709, 8, 28); // 695..723
  b.trigger([0, -2.4, 698], [8, 6, 4], 'door');
  b.entity({
    type: 'mover',
    id: 'door',
    on: 'door',
    s: [7.6, 7, 1],
    path: [
      [0, -0.9, 719],
      [0, 6.3, 719],
    ],
    speed: 6.5,
    mode: 'once',
    mat: 'alt',
  });
  b.gate(0, -4.4, 719, 8.6, 7.4);
  b.prompt(
    [0, 3.6 + 1.5, 665],
    [10, 4, 10],
    'slide',
    'Slide down the slope to build speed — the gate opens as you come',
  );
  b.shortcut('aw-air', [0, 3.5, 687], [10, 6, 10]);
  b.checkpoint(0, -4.4, 721.6, Math.PI, [7, 6, 2]);

  // ===== J. Finale: collapsing bridge, low beam, gap, last wall ==========================================
  for (let i = 0; i < 5; i++)
    b.entity({ type: 'collapse', p: [0, -4.7, 726 + i * 6], s: [6, 0.6, 5.8], delay: 0.9 });
  b.solid({ p: [0, -4.4 + 1.05 + 0.6, 741], s: [9, 1.2, 1.4], mat: 'alt' });
  b.decor('box', [-4.6, 1.2, 741], [0.5, 9, 0.5], 'alt');
  b.decor('box', [4.6, 1.2, 741], [0.5, 9, 0.5], 'alt');
  b.decor('box', [0, 5.9, 741], [11, 0.8, 1.2], 'alt');
  b.collectible('a3', 0, -1.2, 741);
  b.prompt([0, -2.9, 722], [8, 4, 5], 'forward', 'The bridge is failing — do not stop');
  b.plat(0, -4.4, 766, 8, 13); // 759.5..772.5
  b.checkpoint(0, -4.4, 762);
  b.wall(3.0, -6.4, 778.25, 0.8, 9, 22.5); // 767..789.5
  b.plat(0, -2.4, 801, 16, 26); // 788..814
  b.gate(0, -2.4, 813.5, 10, 8);
  for (let z = 792; z <= 812; z += 5) {
    b.column(-7.2, -2.4, z, 8, 0.5);
    b.column(7.2, -2.4, z, 8, 0.5);
  }

  // ===== Phase 3: the course goes on (section library + Difficulty Director) =================
  const ext = new Course(b, [0, -2.4, 814], { id: 'awa', level: 1 });
  ext.runway();
  ext.hurdles();
  ext.gaps();
  ext.drawbridge();
  ext.wallChain();
  ext.stairs(4, 0.6);
  ext.chute(6);
  ext.collapseRun();
  ext.laserGate();
  ext.doubleGap();
  ext.runway(50);
  ext.hurdles(4);
  ext.gaps(5);
  const { finishZ } = ext.finale();
  ext.finish(finishZ);

  scenery(b);

  // ===== bot main line =========================================================================
  b.bot(
    [0, 0, 6],
    [0, 0, 41.2, 'j', 0.8],
    [0, 0, 50],
    [0.5, 0, 53.8, 'j', 0.8],
    [2, 0.6, 63.5],
    [1.6, 0.6, 67.3, 'j', 0.8],
    [0, 1.2, 77],
    [0, 1.2, 88, 's'],
    [0, 1.2, 97.6, 'u'],
    [0, 1.2, 102.4, 's'],
    [0, 1.2, 110, 'u'],
    [0, 1.2, 117.2, 'jj', 0.8],
    [0, 2.2, 131],
    [0, 2.2, 136.8, 'j', 0.8],
    [0, 2.5, 143, 'j', 1.2],
    [0, 3.1, 150, 'j', 1.2],
    [0, 3.6, 160],
    [0, 3.6, 169.8, 'jj+d', 0.8],
    [0, 3.6, 186],
    [1.7, 3.6, 189],
    [1.7, 3.6, 192.4, 'j', 0.8],
    [2.2, 4.6, 200],
    [2.2, 4.6, 206, 'wj'],
    [0, 3.6, 216],
    [-1.7, 3.6, 220],
    [-1.7, 3.6, 224.2, 'j', 0.8],
    [-2.2, 4.6, 231],
    [-2.2, 4.6, 237, 'wj'],
    [2.2, 4.6, 244],
    [2.2, 4.6, 250, 'wj'],
    [0, 3.6, 260],
    [0, 3.6, 300],
    [0, 3.6, 302.4, 'j', 0.8],
    [0, 4.2, 310.6, 'j', 0.8],
    [0, 4.8, 321.6, 'j', 0.8],
    [0, 5.4, 340],
    [0, 5.4, 363.4, 's'],
    [0, 5.4, 370, 'u'],
    [0, 5.4, 375.2, 'j', 0.6],
    [0, 5.4, 385.4, 's'],
    [0, 5.4, 392, 'u'],
    [0, 5.4, 396.2, 'j', 0.6],
    [0, 5.4, 405.4, 's'],
    [0, 5.4, 412, 'u'],
    [0, 5.4, 418.6, 'j', 0.8],
    [0, 4.4, 424, 'j', 1.2],
    [0, 4.6, 431, 'j', 1.2],
    [0, 5.4, 446],
    [0, 5.4, 451.4, 'jj', 0.8],
    [0, 5.4, 466],
    [1.7, 5.4, 472],
    [1.7, 5.4, 474.9, 'j', 0.8],
    [2.2, 6.4, 482],
    [2.2, 6.4, 489.5, 'wj'],
    [0, 5.4, 500],
    [-1.7, 5.4, 508],
    [-1.7, 5.4, 510.9, 'j', 0.8],
    [-2.2, 6.4, 518],
    [-2.2, 6.4, 525.5, 'wj'],
    [0, 5.4, 536],
    [1.7, 5.4, 544],
    [1.7, 5.4, 546.9, 'j', 0.8],
    [2.2, 6.4, 551],
    [2.2, 6.4, 557, 'wj'],
    [-2.2, 6.4, 565],
    [-2.2, 6.4, 571, 'wj'],
    [2.2, 6.4, 579],
    [2.2, 6.4, 585, 'wj'],
    [0, 5.4, 602],
    [0, 5.4, 611.2, 'jj+d', 0.8],
    [0, 5.4, 632],
    [0, 5.4, 639.6],
    [0, 4.8, 649.6],
    [0, 4.2, 659.6],
    [0, 3.6, 668],
    [0, 3.6, 671.5, 's'],
    [0, -4.4, 697],
    [0, -4.4, 714, 'u'],
    [0, -4.4, 722],
    [0, -4.4, 733],
    [0, -4.4, 737.6, 's'],
    [0, -4.4, 744, 'u'],
    [0, -4.4, 752.2, 'jj', 0.8],
    [0, -4.4, 764],
    [1.7, -4.4, 768],
    [1.7, -4.4, 771.4, 'j', 0.8],
    [2.2, -3.4, 779],
    [2.2, -3.4, 785, 'wj'],
    [0, -2.4, 796],
    [0, -2.4, 808],
  );
  b.bot(...ext.bot);
  // ----- destructibles (Phase B): fragile marble columns that slide apart, and floating relics
  // that answer the blade
  b.breakable('column', 1.5, 0, 19.9);
  b.breakable('column', -1.5, 0, 37.5);
  b.breakable('relic', 3.1, 0.6, 67.1);
  b.breakable('column', -1.45, 1.2, 85.5);
  b.breakable('column', -1.5, 2.2, 134.4);
  b.breakable('relic', 1.5, 3.6, 162.9);
  b.breakable('column', 0.36, 3.6, 189.7, { yaw: 0.45 });
  b.breakable('column', -1.5, -4.4, 732.7);
  b.breakable('column', 1.5, -4.4, 750.9);
  b.breakable('relic', 1.56, -2.4, 796, { yaw: 0.3 });
  b.breakable('column', 1.5, 3.6, 290);
  b.breakable('relic', -1.5, 5.4, 346);
  b.breakable('column', 1.5, 5.4, 449);
  b.breakable('relic', -1.5, 5.4, 609);
  return b.data;
}

/** Everything that is not gameplay: the scale and atmosphere of the place. */
function scenery(b: LevelBuilder) {
  // colossal marble monoliths marching beside the route, their bases lost in the clouds
  const mono = [
    [-46, 30, 16, 150, 18],
    [52, 70, 20, 190, 16],
    [-64, 130, 24, 230, 22],
    [44, 170, 14, 140, 14],
    [-40, 215, 18, 170, 20],
    [60, 260, 26, 250, 24],
    [-58, 320, 20, 200, 18],
    [46, 370, 16, 160, 20],
    [-44, 420, 22, 220, 22],
    [58, 450, 18, 180, 16],
    [-52, 500, 20, 200, 18],
    [50, 560, 22, 220, 20],
    [-60, 620, 18, 180, 16],
    [56, 690, 24, 240, 22],
    [-46, 760, 20, 200, 18],
    [52, 830, 16, 170, 16],
  ];
  for (const [x, z, w, h, d] of mono) {
    b.monolith(x, -90, z, w, h, d, 'alt');
    b.monolith(x + (x > 0 ? 4 : -4), -90 + h * 0.72, z + 3, w * 0.55, h * 0.4, d * 0.55, 'base'); // stepped crown
    b.strip([x + (x > 0 ? -w / 2 - 0.05 : w / 2 + 0.05), -90 + h * 0.5, z], [0.12, h * 0.6, 0.5], 0.9);
  }
  // far megastructures on the horizon
  b.monolith(-150, -120, 260, 40, 420, 40, 'dark');
  b.monolith(170, -120, 380, 50, 480, 46, 'dark');
  b.monolith(-120, -120, 560, 60, 520, 50, 'dark');
  b.monolith(90, -120, 640, 36, 400, 36, 'dark');

  // great rings turning slowly in the dawn light
  b.ring(-30, 46, 240, 70, 1.6, [1.3, 0.2, 0.3], [0, 0, 0.03], 'base', 0.15);
  b.ring(40, 20, 430, 52, 1.2, [1.1, -0.4, 0], [0, 0, -0.04], 'base', 0.15);
  b.ring(0, 70, 620, 110, 2.4, [1.5, 0, 0.5], [0, 0, 0.02], 'alt', 0.1);

  // floating fragments of the ruin
  for (let i = 0; i < 82; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (10 + ((i * 13) % 22));
    const y = -6 + ((i * 7) % 22);
    const z = -10 + i * 10.5;
    b.shard(
      x,
      y,
      z,
      0.9 + (i % 4) * 0.6,
      i % 6 === 0 ? 'accent' : i % 3 ? 'base' : 'alt',
      0.5 + (i % 3) * 0.3,
    );
  }
  // broken islands with a column or two still standing
  const isles = [
    [-17, -3, 60, 9],
    [16, 2, 105, 8],
    [-18, 6, 160, 10],
    [18, 0, 235, 9],
    [-16, -8, 300, 10],
    [17, -6, 350, 8],
    [-17, 2, 430, 9],
    [16, -4, 520, 10],
    [-18, 0, 610, 8],
    [17, -6, 700, 9],
  ];
  for (const [x, y, z, s] of isles) {
    b.decor('box', [x, y - 1, z], [s, 2, s * 0.8], 'base');
    b.decor('box', [x, y - 3.2, z], [s * 0.6, 2.6, s * 0.5], 'dark');
    b.decor('box', [x, y - 6, z], [s * 0.22, 3, s * 0.2], 'alt');
    b.column(x - s * 0.25, y, z, 5 + (z % 3), 0.45);
    b.decor('pillar', [x + s * 0.22, y + 0.7, z + 1], [0.9, 3.4, 0.9], 'base', { r: [0, 0.3, 1.45] });
  }
  // colonnade along the first causeway
  for (let z = 14; z <= 40; z += 6.5) {
    b.column(-5.2, -14, z, 13, 0.5);
    b.column(5.2, -14, z, 13, 0.5);
  }
}
