/**
 * LEVEL 9 — SHIFT POINT
 * The Dynamic World showcase (Phase G). Calm stretches separate the set-pieces:
 *   B  the Turning Hall: the building rolls 90° while you sprint through it (gravity follows its floor)
 *   C  the Wall Run: sideways gravity — the wall becomes the floor
 *   D  the Falling Bridge: sections drop behind you while a tower topples across the chasm
 *   E  Gravity Chaos: a slingshot ring through low gravity, then reverse gravity — run the ceiling
 *   E2 the reprise: down a chute to a second Falling Bridge and a second round of Gravity Chaos
 *   F  the carousel: a calm beat before the end
 *   G  the finale (everything the game has taught, at its biggest): the Barrel Roll, a tube that
 *      turns a full 360° while you sprint; the Grand Climb, a floor that curls up a 20 m face and
 *      over the summit; the Falling Summit, a bridge whose slabs all drop away under you; and the
 *      Last Slingshot, a ring that throws you into low gravity to float down to the finish
 * Home universe: Psyche. Every moving or falling element telegraphs first; collapses are timed to
 * fall behind a 7 m/s runner, not only a sprinter.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { arc, faceAt, floorAt, type Lane } from '../profile';
import { tube } from '../tubes';

const D = -4; // bridge deck
const E = -6; // after the slingshot
const H = 4; // after the ceiling run
const SU = H + 30; // the summit of the Grand Climb
const LP = SU - 22; // the Last Slingshot's platform

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Approach (calm) =================================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 30, 8, 36); // 12..48
  b.checkpoint(0, 0, 20);
  b.prompt([0, 1.5, 22], [8, 4, 8], 'forward', 'Glowing arrows show which way gravity will pull. Trust them');

  // ===== B. The Turning Hall ================================================================
  // a 52 m hall that rolls a quarter turn about the course's axis while you run through it;
  // its own gravity field keeps you on its floor all the way round
  const hall = { p: [0, 3, 74] as [number, number, number] };
  const ribs = [];
  for (let z = -24; z <= 24; z += 6)
    ribs.push({
      p: [0, 4.3, z] as [number, number, number],
      s: [8, 0.6, 1] as [number, number, number],
      mat: 'accent' as const,
    });
  b.entity({
    type: 'structure',
    id: 'hall',
    on: 'hall',
    p: hall.p,
    warn: 0.9,
    steps: [{ t: 2.4, rot: [0, 0, 1, 90] }],
    parts: [
      { p: [0, -3.5, 0], s: [6, 1, 52] },
      { p: [3.5, 0.5, 0], s: [1, 9, 52], mat: 'base' },
      { p: [-3.5, 0.5, 0], s: [1, 9, 52], mat: 'base' },
      ...ribs,
    ],
  });
  b.entity({ type: 'field', mode: 'structure', link: 'hall', p: [0, 0, 0], s: [6, 7, 52] });
  b.checkpoint(0, 0, 44);
  b.trigger([0, 1.5, 51], [6, 4, 3], 'hall');
  b.prompt(
    [0, 1.5, 44],
    [8, 4, 4],
    'forward',
    'The hall is turning. Keep running: its floor stays your floor',
  );

  // ===== C. The Wall Run =====================================================================
  b.plat(0, 0, 114, 8, 28); // 100..128 (meets the hall's end)
  b.checkpoint(0, 0, 106);
  b.checkpoint(0, 0, 123);
  b.solid({ p: [8, 2, 162], s: [1, 20, 70], mat: 'alt', wallrun: false }); // wall face at x = 7.5, z 127..197
  b.entity({ type: 'field', mode: 'dir', dir: [1, 0, 0], p: [3.5, 2, 162], s: [8, 20, 66] }); // z 129..195
  b.collectible('s1', 6.6, 0.4, 166);
  b.prompt(
    [0, 1.5, 116],
    [8, 4, 6],
    'forward',
    'Run off the edge: gravity turns sideways and the wall becomes the floor',
  );
  b.plat(4, D, 212, 12, 30); // 197..227, x -2..10
  b.checkpoint(4, D, 201);
  // hidden: wall-run the lit wall on the left, kick off and double jump onto the beam over the lane
  b.wall(-4.2, D - 1.2, 210.5, 0.8, 8, 15); // 203..218, face x = -3.8
  b.plat(2.2, D + 3.4, 225.5, 3, 12, { h: 0.6, mat: 'alt', dress: false }); // 219.5..231.5, x 0.7..3.7
  b.strip([-3.75, D + 0.1, 201.5], [0.06, 0.06, 2.4], 1);
  b.collectible('s3', 2.2, D + 4.7, 226);
  b.shortcut('sp-hidden', [2.2, D + 4.9, 225.5], [4, 3, 11], true);

  // ===== D. The Falling Bridge ================================================================
  // the sections collapse in turn behind you (timed for a 7 m/s run as well as a sprint) while a
  // tower ahead topples across the chasm and becomes the next bridge
  b.checkpoint(0, D, 215); // lined up with the bridge, with room to reach speed
  b.trigger([4, D + 1.5, 226], [12, 4, 2], 'bridge');
  // seven sections from the deck's edge to the fallen tower (no gaps); section i drops 1.4 + 0.86 i s
  // after the trigger, i.e. just behind a 7 m/s runner and well behind a sprinter
  for (let i = 0; i < 7; i++)
    b.entity({
      type: 'collapse',
      on: 'bridge',
      p: [0, D - 0.3, 230 + i * 6],
      s: [6, 0.6, 5.8],
      delay: 1.4 + 0.86 * i,
    });
  b.entity({
    type: 'structure',
    id: 'tower',
    on: 'bridge',
    p: [0, D - 2, 272],
    warn: 1.0,
    delay: 0.6,
    steps: [{ t: 1.6, rot: [1, 0, 0, 90], ease: 'in' }],
    parts: [
      { p: [0, 10, 0], s: [4, 20, 4] },
      { p: [0, 20.4, 0], s: [5, 0.8, 5], mat: 'accent' },
    ],
  });
  b.plat(0, D - 3, 272, 6, 6, { h: 30, mat: 'dark', dress: false }); // the tower's footing
  b.prompt([4, D + 1.5, 212], [12, 4, 8], 'forward', 'The bridge will not hold. Sprint, and watch the tower');
  b.plat(0, D, 305, 12, 22); // 294..316
  b.checkpoint(0, D, 298);

  // ===== E. Gravity Chaos ========================================================================
  // a slingshot ring throws you through a low-gravity gap...
  b.entity({ type: 'impulse', p: [0, D + 2, 324], s: [6, 6, 3], dir: [0, 1, 1], add: 4, min: 22 });
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 0.4, p: [0, D, 337], s: [14, 16, 40] }); // z 317..357
  b.plat(0, E, 366, 12, 24); // 354..378
  b.checkpoint(0, E, 358);
  b.prompt([0, D + 1.5, 306], [12, 4, 6], 'jump', 'Jump through the ring: low gravity carries you over');
  // ...then gravity reverses: fall UP onto the ceiling, run along it, drop back down when it ends
  b.solid({ p: [0, 14.5, 401], s: [10, 1, 42], mat: 'alt' }); // underside y = 14, z 380..422
  b.entity({ type: 'field', mode: 'dir', dir: [0, 1, 0], p: [0, 4, 401], s: [12, 22, 42] }); // z 380..422
  b.collectible('s2', 0, 13.0, 406);
  b.prompt([0, E + 1.5, 368], [12, 4, 6], 'forward', 'Up is down. Run off the end and keep going');
  b.plat(0, H, 440, 12, 28); // 426..454
  b.checkpoint(0, H, 430);

  // ===== E2. The reprise (the bridge and the chaos again, further out) ==========================
  // down a chute to the bridge deck, then a second Falling Bridge (section D, 260 m on) and a second
  // slingshot, low-gravity gap and ceiling run (section E, 260 m on)
  b.ramp([0, H, 454], [0, D, 470], 8);
  b.plat(0, D, 478.5, 12, 17); // 470..487
  b.checkpoint(0, D, 475);
  b.trigger([0, D + 1.5, 486], [12, 4, 2], 'bridge2');
  for (let i = 0; i < 7; i++)
    b.entity({
      type: 'collapse',
      on: 'bridge2',
      p: [0, D - 0.3, 490 + i * 6],
      s: [6, 0.6, 5.8],
      delay: 1.4 + 0.86 * i,
    });
  b.entity({
    type: 'structure',
    id: 'tower2',
    on: 'bridge2',
    p: [0, D - 2, 532],
    warn: 1.0,
    delay: 0.6,
    steps: [{ t: 1.6, rot: [1, 0, 0, 90], ease: 'in' }],
    parts: [
      { p: [0, 10, 0], s: [4, 20, 4] },
      { p: [0, 20.4, 0], s: [5, 0.8, 5], mat: 'accent' },
    ],
  });
  b.plat(0, D - 3, 532, 6, 6, { h: 30, mat: 'dark', dress: false });
  b.prompt([0, H + 1.5, 446], [12, 4, 6], 'slide', 'Not over yet. The bridge and the chaos, once more');
  b.plat(0, D, 565, 12, 22); // 554..576
  b.checkpoint(0, D, 558);
  b.entity({ type: 'impulse', p: [0, D + 2, 584], s: [6, 6, 3], dir: [0, 1, 1], add: 4, min: 22 });
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 0.4, p: [0, D, 597], s: [14, 16, 40] }); // z 577..617
  b.plat(0, E, 626, 12, 24); // 614..638
  b.checkpoint(0, E, 618);
  b.solid({ p: [0, 14.5, 661], s: [10, 1, 42], mat: 'alt' }); // underside y = 14, z 640..682
  b.entity({ type: 'field', mode: 'dir', dir: [0, 1, 0], p: [0, 4, 661], s: [12, 22, 42] });
  b.plat(0, H, 700, 12, 28); // 686..714
  b.checkpoint(0, H, 690);

  // ===== F. Carousel and finish (calm control after the chaos) =======================================
  b.plat(0, H, 728.5, 8, 8, { h: 20, mat: 'dark', dress: false }); // hub 724.5..732.5
  b.entity({
    type: 'rotator',
    p: [0, H - 0.5, 728.5],
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
  b.plat(0, H, 753.5, 16, 22); // 742.5..764.5
  b.checkpoint(0, H, 746);

  // ===== G. The finale =====================================================================
  // (1) the Barrel Roll: a full turn while you sprint, in two halves at a steady rate (each half
  // finishes well inside its tube even at a dash), upside down for a moment in between
  tube(b, H, 'barrel1', 764.5, 814.5, { steps: [{ t: 2.4, rot: [0, 0, 1, 180], ease: 'linear' }] });
  b.trigger([0, H + 2, 766], [4, 4, 2], 'barrel1');
  b.prompt([0, H + 1.5, 756], [16, 4, 8], 'forward', 'One full turn. Do not stop running');
  // the upside-down stretch between the halves: the same square section, gravity pulling up
  b.solid({ p: [0, H - 0.5, 822.25], s: [6, 1, 15.5], mat: 'base' });
  b.solid({ p: [0, H + 4.5, 822.25], s: [6, 1, 15.5], mat: 'base' });
  for (const x of [-2.5, 2.5]) b.solid({ p: [x, H + 2, 822.25], s: [1, 4, 15.5], mat: 'alt' });
  b.strip([0, H + 3.97, 822.25], [0.3, 0.06, 15], 1);
  b.entity({ type: 'field', mode: 'dir', dir: [0, 1, 0], p: [0, H + 2, 822.25], s: [4, 4, 15.5] }); // z 814.5..830
  b.checkpoint(0, H, 818);
  tube(b, H, 'barrel2', 830, 880, { r0: 180, steps: [{ t: 2.4, rot: [0, 0, 1, 180], ease: 'linear' }] });
  b.trigger([0, H + 2, 831.5], [4, 4, 2], 'barrel2');
  // (2) the Grand Climb: the floor curls up a 20 m face and over the summit
  const L: Lane = [-3, 3];
  floorAt(b, L, H, 880, 885.5);
  b.checkpoint(0, H, 882.5);
  arc(b, L, H + 5, 885.5, 5, 0, 90, 'inside');
  faceAt(b, L, 890.5, H + 5, H + 25, -1);
  arc(b, L, H + 25, 895.5, 5, -90, -180, 'outside');
  b.plat(0, SU, 900.5, 6, 10, { h: 32, mat: 'base' }); // the summit, z 895.5..905.5
  b.checkpoint(0, SU, 898.5);
  // (3) the Falling Summit: six slabs out from the summit all drop at once, far ones first, as you
  // top out, so the bridge becomes a stair falling away under you (every hop is down)
  b.trigger([0, SU + 1.5, 897], [6, 4, 2], 'summit'); // as you top out
  for (let i = 0; i < 6; i++) {
    const drop = 5 + 3 * i;
    b.entity({
      type: 'structure',
      id: `summit${i}`,
      on: 'summit',
      p: [0, SU, 909.5 + 8 * i],
      warn: 0.75,
      delay: 0.9 - 0.15 * i,
      steps: [{ t: drop / 6, move: [0, -drop, 0], ease: 'linear' }],
      parts: [
        { p: [0, -0.4, 0], s: [6, 0.8, 7] },
        { p: [0, 0.01, -3.1], s: [5.6, 0.02, 0.2], mat: 'accent' },
      ],
    });
  }
  b.prompt([0, SU + 1.5, 899.5], [6, 4, 4], 'forward', 'The summit is coming down. Run');
  // (4) the Last Slingshot: through the ring into low gravity and down to the finish
  b.plat(0, LP, 966.5, 12, 24); // 954.5..978.5
  b.checkpoint(0, LP, 958.5);
  b.entity({ type: 'impulse', p: [0, LP + 2, 974.5], s: [6, 6, 3], dir: [0, 1, 1], add: 4, min: 24 });
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 0.4, p: [0, 20, 1005.5], s: [16, 40, 60] }); // z 975.5..1035.5
  b.prompt([0, LP + 1.5, 963.5], [12, 4, 6], 'jump', 'Through the ring, and fly');
  b.plat(0, H, 1035.5, 20, 40); // 1015.5..1055.5
  b.finish(0, H, 1033.5, 14);
  b.gate(0, H, 1054.5, 10, 8);
  b.ring(0, H + 14, 1033.5, 16, 0.8, [0, 0, 0], [0, 0, 0.25], 'accent', 1);

  scenery(b);

  b.bot(
    [0, 0, 6],
    [0, 0, 40],
    // inside the hall: points on its rotation axis do not move as it turns
    [0, 3, 60, undefined, 3],
    [0, 3, 97, undefined, 3],
    [0, 0, 106, undefined, 2],
    [0, 0, 127],
    [7.5, 0, 150, undefined, 2],
    [7.5, 0, 190, undefined, 2],
    [4, D, 205, undefined, 2],
    [0, D, 222],
    [0, D, 232],
    [0, D, 262],
    [0, D, 280],
    [0, D, 300],
    [0, D, 315.2, 'j', 0.8],
    [0, E, 360, undefined, 3],
    [0, E, 376],
    [0, E, 379, undefined, 1.5],
    [0, 14, 400, undefined, 3],
    [0, 14, 421],
    [0, H, 436, undefined, 3],
    [0, H, 453],
    [0, H, 454.5, 's'],
    [0, D, 474, 'u'],
    [0, D, 482],
    [0, D, 492],
    [0, D, 522],
    [0, D, 540],
    [0, D, 560],
    [0, D, 575.2, 'j', 0.8],
    [0, E, 620, undefined, 3],
    [0, E, 636],
    [0, E, 639, undefined, 1.5],
    [0, 14, 660, undefined, 3],
    [0, 14, 681],
    [0, H, 696, undefined, 3],
    [0, H, 708.5, 'w2', 0.6],
    [0, H, 713, 'j', 0.6],
    [0, H, 719, undefined, 1.6],
    [0, H, 721.3, 'j', 1],
    [0, H, 728, 'w2', 0.6],
    [0, H, 732, 'j', 0.6],
    [0, H, 738, undefined, 1.6],
    [0, H, 740.3, 'j', 1],
    [0, H, 750],
    [0, H, 763],
    // inside the tubes: points on the axis do not move as they turn
    [0, H + 2, 780, undefined, 2.5],
    [0, H + 2, 828, undefined, 2.5],
    [0, H + 2, 877, undefined, 2.5],
    [0, H, 882.5, undefined, 2.5],
    [0, H + 1.5, 889, undefined, 2.5],
    [0, H + 15, 890.5, undefined, 2.5],
    [0, H + 28.5, 892, undefined, 2.5],
    [0, SU, 900.5, undefined, 2.5],
    [0, SU, 905.5],
    [0, SU - 6, 917.5, undefined, 30],
    [0, SU - 12, 933.5, undefined, 30],
    [0, SU - 18, 947.5, undefined, 30],
    [0, LP, 960.5, undefined, 3],
    [0, LP, 972.5],
    [0, H, 1027.5, undefined, 5],
    [0, H, 1033.5],
  );
  // destructibles beside the line
  b.breakable('relic', 2.6, 0, 8);
  b.breakable('column', -2.6, 0, 30);
  b.breakable('relic', 2.6, 0, 112);
  b.breakable('column', -2.6, 0, 120);
  b.breakable('relic', 8, D, 215);
  b.breakable('column', 9, D, 212);
  b.breakable('relic', 3, D, 312);
  b.breakable('column', -3, E, 370);
  b.breakable('relic', 3, H, 446);
  b.breakable('column', -3, D, 480);
  b.breakable('relic', 3, D, 572);
  b.breakable('column', -3, E, 630);
  b.breakable('relic', 3, H, 706);
  b.breakable('column', 4, H, 760);
  b.breakable('relic', -1.5, SU, 903);
  b.breakable('column', 1.5, LP, 965.5);
  b.breakable('relic', -3, H, 1043.5);
  return b.data;
}

function scenery(b: LevelBuilder) {
  // impossible architecture: towers hanging at angles, rings, floating slabs
  for (let i = 0; i < 37; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -10 + i * 30;
    b.decor('box', [side * (34 + (i % 3) * 10), 10 + (i % 4) * 8, z], [12, 50, 12], i % 3 ? 'base' : 'alt', {
      r: [0.4 * side, i * 0.3, 0.6 * side],
    });
  }
  for (let i = 0; i < 12; i++)
    b.ring(i % 2 ? 40 : -40, 30, 40 + i * 85, 26, 1, [1.2, i * 0.5, 0.3], [0.02, 0.03, 0], 'accent', 0.6);
  for (let i = 0; i < 82; i++)
    b.shard(
      ((i * 37) % 70) - 35,
      ((i * 11) % 40) - 10,
      i * 13,
      1 + (i % 3) * 0.7,
      i % 4 ? 'base' : 'accent',
      0.8,
    );
  b.monolith(-150, -120, 300, 50, 400, 50, 'dark');
  b.monolith(160, -120, 420, 50, 400, 50, 'dark');
  b.monolith(-160, -120, 820, 50, 400, 50, 'dark');
}
