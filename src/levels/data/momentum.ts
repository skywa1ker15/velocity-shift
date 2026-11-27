/**
 * LEVEL 3 — MOMENTUM
 * Night in a chrome canyon. Everything here rewards carrying speed: chutes, boost pads,
 * high-speed gaps, a laser run, a splitting chute that drops one lane, blinking platforms,
 * a crusher hall, then the canyon itself starts to move (the first Dynamic World course): a bridge
 * that swings into place ahead of you, a chute whose gravity tilts forward to pull you along, and
 * a channel that rolls a quarter turn while you sprint through it. Then the long final line.
 * A narrow high rail skips a quarter of the course.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

export function build(): LevelData {
  const b = new LevelBuilder();
  const F = -10.5; // laser deck height
  const G = -20.5; // lower deck height

  // ===== A. Launch chute ====================================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 0, 10, 14); // -7..7
  b.ramp([0, 0, 7], [0, -10, 37], 9);
  b.plat(0, -10, 49, 9, 24); // 37..61
  b.entity({ type: 'boost', p: [0, -9.4, 45], s: [6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 21 });
  b.prompt([0, 1.5, 0], [10, 4, 12], 'slide', 'Slide down the chute and never let go of your speed');
  b.prompt([0, -8.5, 50], [9, 4, 16], 'jump', 'Fast enough? Then a single jump will carry you');

  // ===== B. Speed gaps ========================================================================
  b.plat(0, -10, 82, 9, 20); // 72..92
  b.plat(2, F, 110, 9, 18); // 101..119
  b.checkpoint(0, -10, 78);

  // hidden route: a launcher off the left edge throws you onto a narrow rail high above the course
  b.plat(6.5, F, 113, 3, 8, { dress: false, mat: 'alt' });
  b.entity({ type: 'jumppad', p: [6.5, F + 0.6, 114], s: [2.6, 1.2, 3], v: [0, 20, 6] });
  b.plat(6.5, -4.5, 188, 2.2, 124, { h: 0.5, mat: 'alt', dress: false }); // rail 126..250
  b.strip([6.5, -4.48, 188], [0.12, 0.03, 122], 1);
  b.entity({ type: 'boost', p: [6.5, -3.9, 150], s: [2.2, 1.2, 4], dir: [0, 0, 1], add: 6, min: 22 });
  b.collectible('m1', 6.5, -3.2, 190);
  b.shortcut('mo-hidden', [6.5, -3.4, 190], [3, 3, 110], true);

  // ===== C. Laser run ===========================================================================
  b.plat(0, F, 150, 9, 62); // 119..181
  b.checkpoint(0, F, 123);
  for (const z of [131, 155]) b.entity({ type: 'hazard', p: [0, F + 0.35, z], s: [9, 0.5, 0.35] }); // jump these
  for (const z of [143, 167]) b.entity({ type: 'hazard', p: [0, F + 1.75, z], s: [9, 1.4, 0.35] }); // slide under these
  for (const z of [131, 143, 155, 167]) {
    b.decor('box', [-4.7, F + 1.6, z], [0.4, 3.2, 0.6], 'dark');
    b.decor('box', [4.7, F + 1.6, z], [0.4, 3.2, 0.6], 'dark');
  }
  // a beam that sweeps across the lane: pass on the side it has just left
  b.entity({
    type: 'mover',
    s: [0.5, 4, 0.5],
    path: [
      [-4, F + 2, 175],
      [4, F + 2, 175],
    ],
    speed: 6,
    pause: 0.5,
    lethal: true,
    ghost: true,
  });
  b.prompt(
    [0, F + 1.5, 123],
    [9, 4, 7],
    'jump',
    'Low beams: jump. High beams: slide. Anything striped and glowing is lethal',
  );
  b.collectible('m2', 0, F + 4.4, 143);

  // ===== D. The split chute =========================================================================
  b.ramp([0, F, 181], [0, G, 211], 9);
  b.checkpoint(0, F, 178, Math.PI, [9, 6, 2]);
  b.trigger([0, F - 3, 193], [9, 8, 4], 'split');
  // left lane (x = +4 when heading +Z) falls away; the right lane holds
  for (let i = 0; i < 4; i++)
    b.entity({
      type: 'collapse',
      on: 'split',
      p: [2.6, G - 0.3, 216 + i * 10],
      s: [4.6, 0.6, 9.8],
      delay: 0.8,
    });
  b.plat(-2.6, G, 231, 4.6, 40, { dress: false }); // right lane 211..251
  b.entity({ type: 'boost', p: [-2.6, G + 0.6, 226], s: [3.6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 20 });
  b.plat(0, G, 262, 10, 22); // 251..273
  b.checkpoint(0, G, 256);
  b.prompt(
    [0, F + 1.5, 176],
    [9, 4, 6],
    'slide',
    'The chute splits — one lane is about to fall. Watch for the flicker',
  );

  // ===== E. Blinking platforms =========================================================================
  // A wave: each tile switches on 1.0 s after the one before (a 9 m/s wave, between run and sprint
  // pace) and stays solid 2.4 s, so a 7 m/s run has a real window as well as a sprint
  // (tests/sim/hazards.test.ts measures pass rate and window per pace). Phases put the reference
  // line mid-window.
  [
    [279, 1.4],
    [288, 0.4],
    [297, 2.6],
    [306, 1.6],
  ].forEach(([z, phase]) =>
    b.entity({ type: 'blink', p: [0, G - 0.5, z], s: [6, 1, 6], onTime: 2.4, offTime: 0.8, phase }),
  );
  b.plat(0, G, 346, 9, 70); // 311..381
  b.checkpoint(0, G, 315);
  b.prompt(
    [0, G + 1.5, 266],
    [10, 4, 10],
    'forward',
    'These platforms fade in and out — go when the one ahead is solid',
  );

  // ===== F. Crusher hall ====================================================================================
  // Three crushers on a "green wave": each rests up for 1.5 s (glowing and rattling for the last
  // 0.75 s), slams down in 0.37 s and stays down for 0.7 s. Their phases are offset so that a
  // player who holds a sprint (about 10 m/s) meets every gap open; slower or faster still works
  // on a narrower timing. Fairness is checked by tests/sim/hazards.test.ts.
  const crusherRest = 1.5,
    crusherDown = 0.7,
    crusherDrop = 3.7,
    crusherSpeed = 10,
    crusherGap = 14,
    wavePace = 10;
  const crusherCycle = (2 * crusherDrop) / crusherSpeed + crusherDown + crusherRest;
  for (let i = 0; i < 3; i++) {
    const z = 334 + i * crusherGap;
    const phase = ((((-i * crusherGap) / wavePace) % crusherCycle) + crusherCycle) % crusherCycle;
    b.entity({
      type: 'mover',
      s: [9, 3, 4],
      path: [
        [0, G + 1.5 + crusherDrop, z],
        [0, G + 1.5, z],
      ],
      speed: crusherSpeed,
      pause: crusherDown,
      rest: crusherRest,
      phase,
      lethal: true,
      telegraph: true,
    });
    b.decor('box', [-5.2, G + 4, z], [1, 8, 5], 'dark');
    b.decor('box', [5.2, G + 4, z], [1, 8, 5], 'dark');
    b.decor('box', [0, G + 8.4, z], [11.4, 0.8, 5], 'dark');
    // glowing floor lines mark where it lands
    for (const dz of [-2.1, 2.1]) b.strip([0, G + 0.02, z + dz], [8.4, 0.04, 0.14], 0.9);
  }
  b.prompt(
    [0, G + 1.5, 322],
    [9, 4, 8],
    'forward',
    'Crushers glow and rattle before they drop. Go as one lifts and keep sprinting: the gaps line up',
  );
  b.checkpoint(0, G, 374);

  // ===== G. The canyon moves (first Dynamic World act) ======================================
  // One new idea at a time, each in the open with room to watch it: (1) physical rotation that
  // builds the road, (2) gravity that tilts and helps, (3) both at once — a full 90° roll.
  const K = G - 12; // after the gravity chute
  // (1) the turntable bridge: an 18 m span lying across the gap swings round to bridge it. It is
  // triggered at the crusher exit and is in place 2.15 s later, before even a dashing sprinter
  // covers the 38 m to the gap.
  b.plat(0, G, 398, 9, 34); // 381..415
  b.trigger([0, G + 1.5, 377], [9, 6, 3], 'turntable');
  b.entity({
    type: 'structure',
    id: 'turntable',
    on: 'turntable',
    p: [0, G, 424],
    warn: 0.75,
    steps: [{ t: 1.4, rot: [0, 1, 0, 90] }],
    parts: [
      { p: [0, -0.5, 0], s: [18, 1, 6] }, // across the gap → along it (z 415..433)
      { p: [0, 0.03, 0], s: [17, 0.06, 0.25], mat: 'accent' },
      { p: [0, -1.4, 0], s: [3, 0.8, 3], mat: 'dark' },
    ],
  });
  b.plat(0, G - 2.2, 424, 2.4, 2.4, { h: 40, mat: 'dark', dress: false }); // the turntable's pillar
  b.prompt([0, G + 1.5, 386], [9, 4, 8], 'forward', 'The canyon is building the road for you. Keep running');
  b.plat(0, G, 441, 9, 16); // 433..449
  b.checkpoint(0, G, 437);
  // (2) the gravity chute: gravity leans 17° forward over the ramp, so a slide picks up speed
  // fast. The glowing arrows show the pull; the camera leans with it.
  b.ramp([0, G, 449], [0, K, 489], 9);
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0.3], p: [0, G - 5, 469], s: [10, 18, 40] });
  b.prompt([0, G + 1.5, 444], [9, 4, 8], 'slide', 'Gravity leans forward here. Slide, and let it pull you');
  b.plat(0, K, 503, 9, 28); // 489..517
  b.checkpoint(0, K, 500);
  // (3) the Roll: a 64 m chrome channel rolls a quarter turn while you sprint through it. Its own
  // gravity keeps you on its floor; your speed is untouched; the view turns with the world. It turns
  // in 1.6 s from just inside the entrance, so the whole quarter turn happens inside the channel at
  // any pace from a run (11 m/s) to the chute's 26 m/s.
  const ribs = [];
  for (let z = -30; z <= 30; z += 6)
    ribs.push({
      p: [0, 4.3, z] as [number, number, number],
      s: [8, 0.6, 1] as [number, number, number],
      mat: 'accent' as const,
    });
  b.entity({
    type: 'structure',
    id: 'roll',
    on: 'roll',
    p: [0, K + 3, 549],
    warn: 0.75,
    steps: [{ t: 1.6, rot: [0, 0, 1, -90] }],
    parts: [
      { p: [0, -3.5, 0], s: [6, 1, 64] }, // floor, z 517..581
      { p: [3.5, 0.5, 0], s: [1, 9, 64], mat: 'dark' },
      { p: [-3.5, 0.5, 0], s: [1, 9, 64], mat: 'dark' },
      { p: [0, -2.97, 0], s: [0.2, 0.06, 62], mat: 'accent' },
      ...ribs,
    ],
  });
  b.entity({ type: 'field', mode: 'structure', link: 'roll', p: [0, 0, 0], s: [6, 7, 64] });
  b.trigger([0, K + 1.5, 513], [9, 4, 3], 'roll');
  b.prompt(
    [0, K + 1.5, 505],
    [9, 4, 8],
    'forward',
    'The channel is about to roll. Do not slow down: its floor stays your floor',
  );
  b.plat(0, K, 595, 8, 28); // 581..609, meets the channel's end
  b.checkpoint(0, K, 583);

  // ===== H. The long line (finale) ===========================================================================
  const Z0 = 609;
  const H = K - 10;
  b.ramp([0, K, Z0], [0, H, Z0 + 30], 9);
  b.plat(0, H, Z0 + 38, 9, 16);
  b.entity({ type: 'boost', p: [0, H + 0.6, Z0 + 35], s: [6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 21 });
  b.checkpoint(0, H, Z0 + 32.5, Math.PI, [9, 6, 2]);
  b.wall(-3.0, H - 2, Z0 + 58.5, 0.8, 10, 39); // right wall (starts on the deck)
  b.plat(0, H, Z0 + 89, 12, 22);
  b.checkpoint(0, H, Z0 + 86);
  // sinking pads: each one drops shortly after you touch it
  for (const dz of [106.5, 115.5, 124.5])
    b.entity({ type: 'collapse', p: [0, H - 0.4, Z0 + dz], s: [5, 0.8, 5], delay: 0.8, mat: 'alt' });
  b.collectible('m3', 0, H + 3.6, Z0 + 115.5);
  b.plat(0, H, Z0 + 142, 10, 22);
  b.checkpoint(0, H, Z0 + 134);
  b.entity({ type: 'boost', p: [0, H + 0.6, Z0 + 137], s: [6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 21 });
  b.entity({ type: 'jumppad', p: [0, H + 0.6, Z0 + 148], s: [6, 1.2, 4], v: [0, 16, 3] });
  b.ring(0, H + 5.5, Z0 + 158, 6.5, 0.4, [0, 0, 0], [0, 0, 0.5], 'accent', 1);
  b.plat(0, H + 2, Z0 + 178, 16, 28);
  b.finish(0, H + 2, Z0 + 182, 12);
  b.prompt(
    [0, K + 1.5, 604],
    [9, 4, 8],
    'slide',
    'Last line: chute, wall, sinking pads, launcher. Do not stop for anything',
  );

  scenery(b);
  b.bot(
    [0, 0, 2],
    [0, 0, 7.5, 's'],
    [0, -10, 40],
    [0, -10, 52, 'u'],
    [0, -10, 60.3, 'jj', 0.8],
    [0, -10, 80],
    [0.3, -10, 91.3, 'jj', 0.8],
    [2, F, 108],
    [0, F, 122],
    [0, F, 128.3, 'j', 0.6],
    [0, F, 139.5, 's', 0.8],
    [0, F, 146.5, 'u'],
    [0, F, 152.3, 'j', 0.6],
    [0, F, 163.5, 's', 0.8],
    [0, F, 170.5, 'u'],
    [0, F, 181.5, 's'],
    [-2.6, G, 214],
    [-2.6, G, 242, 'u'],
    [0, G, 262],
    [0, G, 272.3, 'j', 0.6],
    [0, G, 281.3, 'j', 0.6],
    [0, G, 290.3, 'j', 0.6],
    [0, G, 299.3, 'j', 0.6],
    [0, G, 308.3, 'j', 0.6],
    [0, G, 318],
    [0, G, 323, 'g'],
    [0, G, 376],
    [0, G, 400],
    [0, G, 430],
    [0, G, 448],
    [0, G, 449.6, 's'],
    [0, K, 492, 'u'],
    [0, K, 512],
    // inside the channel: points on its rotation axis do not move as it turns
    [0, K + 3, 525, undefined, 3],
    [0, K + 3, 578, undefined, 3],
    [0, K, 588, undefined, 2],
    [0, K, 609.5, 's'],
    [0, H, 641],
    [0, H, 642.5, 'u'],
    [-2.15, H, 647.5],
    [-2.2, H, 654.3, 'j', 0.8],
    [-2.2, H + 1, 673],
    [-2.2, H + 1, 680, 'wj'],
    [0, H, 698],
    [0, H, 708.4, 'j', 0.6],
    [0, H, 717.4, 'j', 0.6],
    [0, H, 726.4, 'j', 0.6],
    [0, H, 735.4, 'j', 0.6],
    [0, H, 746],
    [0, H, 757],
    [0, H + 3, 766, 'j', 2.5],
    [0, H + 2, 791],
  );
  // ----- destructibles (Phase B): neon pylons, energy barriers and cargo beside the high-speed
  // lines (none in the crusher hall)
  b.breakable('pylon', 1.6, -10, 83.1);
  b.breakable('energy', -0.5, -10.5, 109.5, { yaw: 0.15, scale: 0.7 });
  b.breakable('pylon', -2.2, -10.5, 172.5);
  b.breakable('energy', -3.2, -20.5, 248.7, { yaw: 0.13, scale: 0.7 });
  b.breakable('pylon', 1.45, -20.5, 266);
  b.breakable('crate', 3.6, -10.5, 115.5);
  b.breakable('pylon', -0.7, H, 653.9);
  b.breakable('energy', 1.6, H, 701.1, { yaw: -0.11, scale: 0.7 });
  b.breakable('pylon', -1.55, H, 750.8);
  b.breakable('energy', 3.2, G, 446, { yaw: 0.1, scale: 0.7 });
  b.breakable('pylon', -3.0, K, 598);
  return b.data;
}

function scenery(b: LevelBuilder) {
  // canyon walls: huge chrome slabs either side, lit by flowing seams
  for (let i = 0; i < 22; i++) {
    const z = -30 + i * 44;
    const lean = (i % 3) * 0.04;
    b.monolith(-38 - (i % 4) * 6, -150, z, 20, 300 + (i % 3) * 40, 40, 'dark', [0, 0, lean]);
    b.monolith(38 + ((i + 2) % 4) * 6, -150, z + 22, 20, 300 + ((i + 1) % 3) * 40, 40, 'dark', [0, 0, -lean]);
    b.strip([-27.9 - (i % 4) * 6, -20 + (i % 5) * 9, z], [0.2, 0.5, 38], 1);
    b.strip([27.9 + ((i + 2) % 4) * 6, -34 + (i % 4) * 11, z + 22], [0.2, 0.5, 38], 1);
  }
  // data rivers: long glowing ribbons far below
  for (let i = 0; i < 6; i++)
    b.decor('box', [-18 + i * 7.2, -80 - (i % 2) * 6, 400], [0.8, 0.3, 1000], i % 2 ? 'accent' : 'glass', {
      glow: 0.8,
    });
  b.ring(0, -6, 60, 16, 0.5, [0, 0, 0], [0, 0, 0.2], 'accent', 1);
  b.ring(0, -18, 420, 20, 0.6, [0, 0, 0], [0, 0, -0.25], 'accent', 1);
  b.ring(0, -10, 250, 44, 1.2, [1.2, 0, 0.3], [0, 0, 0.04], 'alt', 0.2);
  for (let i = 0; i < 66; i++) {
    const side = i % 2 ? 1 : -1;
    b.shard(
      side * (9 + ((i * 7) % 14)),
      -24 + ((i * 11) % 30),
      -4 + i * 11.6,
      0.7 + (i % 3) * 0.5,
      i % 4 === 0 ? 'accent' : 'glass',
      0.5,
    );
  }
  b.ring(0, -34, 549, 18, 0.6, [0, 0, 0], [0, 0, 0.3], 'accent', 1);
  b.monolith(0, -170, 980, 120, 520, 40, 'dark');
}
