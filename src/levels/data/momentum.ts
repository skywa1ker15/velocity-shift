/**
 * LEVEL 3 — MOMENTUM
 * Night in a chrome canyon. Everything here rewards carrying speed: chutes, boost pads,
 * high-speed gaps, a laser run, a splitting chute that drops one lane, blinking platforms,
 * a crusher hall and a long final line. A narrow high rail skips a quarter of the course.
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
  b.entity({ type: 'blink', p: [0, G - 0.5, 279], s: [6, 1, 6], onTime: 1.7, offTime: 1.1, phase: 0.8 });
  b.entity({ type: 'blink', p: [0, G - 0.5, 288], s: [6, 1, 6], onTime: 1.7, offTime: 1.1, phase: 2.75 });
  b.entity({ type: 'blink', p: [0, G - 0.5, 297], s: [6, 1, 6], onTime: 1.7, offTime: 1.1, phase: 1.9 });
  b.entity({ type: 'blink', p: [0, G - 0.5, 306], s: [6, 1, 6], onTime: 1.7, offTime: 1.1, phase: 1.05 });
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

  // ===== G. The long line (finale) ===========================================================================
  const H = G - 10;
  b.ramp([0, G, 381], [0, H, 411], 9);
  b.plat(0, H, 419, 9, 16); // 411..427
  b.entity({ type: 'boost', p: [0, H + 0.6, 416], s: [6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 21 });
  b.checkpoint(0, H, 413.5, Math.PI, [9, 6, 2]);
  b.wall(-3.0, H - 2, 439.5, 0.8, 10, 39); // right wall 420..459 (starts on the deck)
  b.plat(0, H, 470, 12, 22); // 459..481
  b.checkpoint(0, H, 467);
  // sinking pads: each one drops shortly after you touch it
  for (const z of [487.5, 496.5, 505.5])
    b.entity({ type: 'collapse', p: [0, H - 0.4, z], s: [5, 0.8, 5], delay: 0.8, mat: 'alt' });
  b.collectible('m3', 0, H + 3.6, 496.5);
  b.plat(0, H, 523, 10, 22); // 512..534
  b.checkpoint(0, H, 515);
  b.entity({ type: 'boost', p: [0, H + 0.6, 518], s: [6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 21 });
  b.entity({ type: 'jumppad', p: [0, H + 0.6, 529], s: [6, 1.2, 4], v: [0, 16, 3] });
  b.ring(0, H + 5.5, 539, 6.5, 0.4, [0, 0, 0], [0, 0, 0.5], 'accent', 1);
  b.plat(0, H + 2, 559, 16, 28); // 545..573
  b.finish(0, H + 2, 563, 12);
  b.prompt(
    [0, G + 1.5, 376],
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
    [0, G, 381.5, 's'],
    [0, H, 413],
    [0, H, 414.5, 'u'],
    [-2.15, H, 419.5],
    [-2.2, H, 426.3, 'j', 0.8],
    [-2.2, H + 1, 445],
    [-2.2, H + 1, 452, 'wj'],
    [0, H, 470],
    [0, H, 480.4, 'j', 0.6],
    [0, H, 489.4, 'j', 0.6],
    [0, H, 498.4, 'j', 0.6],
    [0, H, 507.4, 'j', 0.6],
    [0, H, 518],
    [0, H, 529],
    [0, H + 3, 538, 'j', 2.5],
    [0, H + 2, 563],
  );
  // ----- destructibles (Phase B): neon pylons, energy barriers and cargo beside the high-speed
  // lines (none in the crusher hall)
  b.breakable('pylon', 1.6, -10, 83.1);
  b.breakable('energy', -0.5, -10.5, 109.5, { yaw: 0.15, scale: 0.7 });
  b.breakable('pylon', -2.2, -10.5, 172.5);
  b.breakable('energy', -3.2, -20.5, 248.7, { yaw: 0.13, scale: 0.7 });
  b.breakable('pylon', 1.45, -20.5, 266);
  b.breakable('crate', 3.6, -10.5, 115.5);
  b.breakable('pylon', -0.7, -30.5, 425.9);
  b.breakable('energy', 1.6, -30.5, 473.1, { yaw: -0.11, scale: 0.7 });
  b.breakable('pylon', -1.55, -30.5, 522.8);
  return b.data;
}

function scenery(b: LevelBuilder) {
  // canyon walls: huge chrome slabs either side, lit by flowing seams
  for (let i = 0; i < 16; i++) {
    const z = -30 + i * 44;
    const lean = (i % 3) * 0.04;
    b.monolith(-38 - (i % 4) * 6, -150, z, 20, 300 + (i % 3) * 40, 40, 'dark', [0, 0, lean]);
    b.monolith(38 + ((i + 2) % 4) * 6, -150, z + 22, 20, 300 + ((i + 1) % 3) * 40, 40, 'dark', [0, 0, -lean]);
    b.strip([-27.9 - (i % 4) * 6, -20 + (i % 5) * 9, z], [0.2, 0.5, 38], 1);
    b.strip([27.9 + ((i + 2) % 4) * 6, -34 + (i % 4) * 11, z + 22], [0.2, 0.5, 38], 1);
  }
  // data rivers: long glowing ribbons far below
  for (let i = 0; i < 6; i++)
    b.decor('box', [-18 + i * 7.2, -70 - (i % 2) * 6, 300], [0.8, 0.3, 800], i % 2 ? 'accent' : 'glass', {
      glow: 0.8,
    });
  b.ring(0, -6, 60, 16, 0.5, [0, 0, 0], [0, 0, 0.2], 'accent', 1);
  b.ring(0, -18, 420, 20, 0.6, [0, 0, 0], [0, 0, -0.25], 'accent', 1);
  b.ring(0, -10, 250, 44, 1.2, [1.2, 0, 0.3], [0, 0, 0.04], 'alt', 0.2);
  for (let i = 0; i < 46; i++) {
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
  b.monolith(0, -160, 760, 120, 520, 40, 'dark');
}
