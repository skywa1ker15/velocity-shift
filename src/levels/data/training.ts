/**
 * TRAINING — the movement gym. One station per mechanic, in the order they are taught,
 * laid out in a straight line heading +Z. Also used by the automated bot test.
 * The second half is the Evolve gym: one station per way of catching a collectible (run through,
 * slide under, in the air, dash through, cut, along a wall, a chain in turn), then Flow and Surge.
 * The stations are real obstacles in Pure too; their collectibles appear only in Evolve.
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
  b.prompt(
    [0, 1.5, 22],
    [W, 4, 26],
    'sprint',
    'Hold Sprint for a burst of speed: it drains the stamina bar, which refills when you let go',
  );
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
  b.prompt([0, -5.5, 321], [10, 4, 8], 'forward', 'Cracked ground falls away — keep moving');
  b.collectible('t3', 0, -5.2, 335);

  // ===== the Evolve gym ===================================================================
  const Y = -7;
  // --- 12. Glints: run through them -------------------------------------------------------
  b.plat(0, Y, 372, 14, 56); // 344..400
  b.checkpoint(0, Y, 362);
  for (let z = 366; z <= 382; z += 4) b.evoItem('glint', 0, Y + 0.9, z);
  b.prompt(
    [0, Y + 1.5, 362],
    [14, 4, 6],
    'forward',
    'Evolve: run through Glints for Flux. A full meter becomes an upgrade',
  );
  // --- 13. Undertow: slide under the low arch -----------------------------------------------
  b.solid({ p: [0, Y + 1.05 + 0.6, 392], s: [14, 1.2, 1.4], mat: 'alt' });
  b.strip([0, Y + 1.02, 391.18], [13, 0.05, 0.05], 0.9);
  b.evoItem('undertow', 0, Y + 0.35, 392);
  b.prompt(
    [0, Y + 1.5, 385],
    [14, 4, 4],
    'slide',
    'Slide under the arch. A ring hung low (Undertow) is caught only by sliding',
  );
  // --- 14. Skyknot: caught only in the air ---------------------------------------------------
  b.plat(0, Y, 426, W, 40); // 406..446
  b.evoItem('skyknot', 0, Y + 1.5, 402);
  b.prompt(
    [0, Y + 1.5, 396],
    [14, 4, 3],
    'jump',
    'Jump the gap. A knot in the air (Skyknot) is caught only airborne',
  );
  b.checkpoint(0, Y, 410);
  // --- 15. Rift Mote: only a dash catches it -------------------------------------------------
  b.evoItem('rift', 0, Y + 0.9, 425);
  b.prompt([0, Y + 1.5, 414], [W, 4, 6], 'dash', 'Dash through the Rift Mote: only a dash catches it');
  // --- 16. Fracture Glyph: cut it ------------------------------------------------------------
  b.evoItem('glyph', 1.3, Y + 1.45, 438);
  b.prompt([0, Y + 1.5, 430], [W, 4, 5], 'attack', 'Cut the Fracture Glyph with the sword');
  // --- 17. Wall Vein: touch it while wall-running ---------------------------------------------
  b.wall(3.0, Y - 2, 453, 0.8, 8, 22); // 442..464, wall on the left
  b.evoItem('vein', 2.2, Y + 3.2, 455);
  b.prompt([0, Y + 1.5, 438], [W, 4, 4], 'jump', 'Wall-run the wall. Its Vein is caught only on the wall');
  // --- 18. Echo Chain: four nodes in turn ------------------------------------------------------
  b.plat(0, Y, 492, W, 56); // 464..520
  b.checkpoint(0, Y, 468);
  [478, 485, 492, 499].forEach((z, i) =>
    b.evoItem('echo', [0, 0.7, -0.7, 0][i], Y + 0.9, z, { group: 0, order: i }),
  );
  b.prompt(
    [0, Y + 1.5, 470],
    [W, 4, 4],
    'forward',
    'Echo Chain: catch four nodes in turn, before each one fades',
  );
  // --- 19. Flow: chain different moves; a Paradox Core needs Flow tier 3 ------------------------
  b.solid({ p: [0, Y + 1.05 + 0.7, 508], s: [W, 1.4, 1.6], mat: 'alt' }); // slide
  b.solid({ p: [0, Y + 0.4, 515], s: [W - 0.4, 0.8, 0.6], mat: 'alt' }); // jump
  b.plat(0, Y, 536, W, 24); // 524..548 (a gap to jump at 520..524)
  b.solid({ p: [0, Y + 1.05 + 0.7, 530], s: [W, 1.4, 1.6], mat: 'alt' }); // slide
  b.evoItem('paradox', 0, Y + 0.9, 544);
  b.prompt(
    [0, Y + 1.5, 503],
    [W, 4, 4],
    'slide',
    'Chain different moves to build Flow. At tier 3 a Paradox Core can be held',
  );
  b.checkpoint(0, Y, 546);
  // --- 20. Surge: shutters that slide across (Timeslip slows them) ------------------------------
  b.plat(0, Y, 580, W, 64); // 548..612
  for (const [z, x0, ph] of [
    [566, -7.6, 0],
    [578, 7.6, 1.4],
    [590, -7.6, 0.7],
  ] as const)
    b.entity({
      type: 'mover',
      s: [7, 6, 1],
      path: [
        [x0, Y + 3, z],
        [0, Y + 3, z],
      ],
      speed: 4.5,
      pause: 1.1,
      phase: ph,
      mat: 'alt',
    });
  b.prompt(
    [0, Y + 1.5, 553],
    [W, 4, 6],
    'surge',
    'With Timeslip, Surge spends Flux to slow the world, never you',
  );
  // --- 21. down to the finish -----------------------------------------------------------------
  b.checkpoint(0, Y, 606);
  b.ramp([0, Y, 612], [0, Y - 6, 636], W);
  b.plat(0, Y - 6, 670, 14, 68); // 636..704
  b.entity({ type: 'boost', p: [0, Y - 5.4, 646], s: [5, 1.2, 4], dir: [0, 0, 1], add: 6, min: 16 });
  b.checkpoint(0, Y - 6, 660);
  b.finish(0, Y - 6, 696, 12);
  b.gate(0, Y - 6, 703, 12, 8);

  // --- scenery --------------------------------------------------------------------------
  for (let i = 0; i < 17; i++) {
    const z = -20 + i * 46;
    b.monolith(-38 - (i % 3) * 9, -60, z, 12, 120 + (i % 4) * 26, 12, 'dark');
    b.monolith(40 + ((i + 1) % 3) * 8, -70, z + 20, 10, 130 + (i % 3) * 30, 14, 'dark');
  }
  b.ring(0, 30, 120, 60, 1.2, [1.2, 0, 0.2], [0, 0, 0.05], 'alt', 0.3);
  b.ring(0, 12, 300, 44, 0.9, [1.45, 0.3, 0], [0, 0, -0.06], 'alt', 0.3);
  b.ring(0, 20, 560, 52, 1.1, [1.3, -0.2, 0.1], [0, 0, 0.05], 'alt', 0.3);
  for (let i = 0; i < 52; i++) {
    const side = i % 2 ? 1 : -1;
    b.shard(
      side * (12 + ((i * 7) % 16)),
      4 + ((i * 5) % 14),
      i * 14 - 6,
      1.2 + (i % 3) * 0.7,
      i % 5 === 0 ? 'accent' : 'alt',
    );
  }
  for (let z = 20; z < 700; z += 30) {
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
    [0, -7, 386],
    [0, -7, 389.4, 's'],
    [0, -7, 395, 'u'],
    [0, -7, 399.2, 'j', 0.8],
    [0, -7, 412],
    [0, -7, 421.5, 'd'],
    [0, -7, 436],
    [1.7, -7, 442],
    [1.7, -7, 444.9, 'j', 0.8],
    [2.2, -6, 452],
    [2.2, -6, 459.5, 'wj'],
    [0, -7, 472],
    [0, -7, 478],
    [0.7, -7, 485],
    [-0.7, -7, 492],
    [0, -7, 499],
    [0, -7, 505.4, 's'],
    [0, -7, 511, 'u'],
    [0, -7, 513.8, 'j', 0.6],
    [0, -7, 519.4, 'j', 0.8],
    [0, -7, 527.4, 's'],
    [0, -7, 534, 'u'],
    [0, -7, 548],
    [0, -7, 612.5, 's'],
    [0, -13, 640, 'u'],
    [0, -13, 696],
  );
  // ----- destructibles (Phase B): practice targets, barriers and crates beside the line. They
  // never collide and never block it: slash them on the move, or just run through.
  b.breakable('target', -1.5, 0, 3.4);
  b.breakable('target', 1.5, 0, 20.9);
  b.breakable('barrier', -1.6, 0, 50.6);
  b.prompt(
    [0, 1.5, 48.5],
    [W, 4, 9],
    'attack',
    'Slash on the run: the sword draws itself. Optional: running through works too',
  );
  b.breakable('crate', -1.5, 0, 92.4);
  b.breakable('target', 1.5, 1, 112);
  b.breakable('crate', 0.4, 1, 134.1, { yaw: -0.35 });
  b.breakable('barrier', 1.7, 1, 210, { yaw: 0.69 });
  b.breakable('crate', 1.5, -7, 324.6);
  b.breakable('target', -1.5, -7, 344.4);
  b.breakable('barrier', -1.6, -7, 418, { yaw: 0.2 });
  b.breakable('crate', 1.5, -7, 476);
  b.breakable('target', -1.5, -7, 560);
  b.breakable('crate', 1.5, -13, 680);
  // ----- the slashable world, one of each (rewards in Evolve): a Drift Lantern up beside the
  // Skyknot jump, then a run of them on the last plaza before the finish
  b.breakable('lantern', 1.4, Y + 2.6, 399);
  b.breakable('bloom', -1.3, Y, 375, { ground: Y });
  b.prompt(
    [0, Y - 6 + 1.5, 663],
    [12, 4, 3],
    'attack',
    'Evolve: Prisms push you on, a Spindle gate cut in time recharges you, a Rift Seal takes everything near it',
  );
  b.breakable('prism', 1.3, Y - 6, 666);
  for (const [i, z] of [670, 674, 678].entries())
    b.breakable('spindle', i % 2 ? -1.2 : 1.2, Y - 6, z, { ground: Y - 6, gate: 0 });
  b.breakable('seal', -1.4, Y - 6, 686);
  b.breakable('sentinel', -3.6, Y - 6, 683, { ground: Y - 6 });
  b.breakable('sentinel', 3.4, Y - 6, 688, { ground: Y - 6 });
  return b.data;
}
