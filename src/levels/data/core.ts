/**
 * LEVEL 8 — CORRUPTED CORE
 * The finale, inside a machine that is coming apart. Everything at once: lethal beams to read and
 * clear, a wall chain over the void, a crusher hall on a green wave, a launch pad and a last pair
 * of beams before the core. Home universe: Corrupt. Main line x = 0; a hidden beam sits above the
 * entry corridor.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const T = 2; // the core terrace

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Entry corridor: beams + hidden beam ================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 30, 8, 36); // 12..48
  b.checkpoint(0, 0, 15);
  b.entity({ type: 'hazard', p: [0, 0.35, 24], s: [8, 0.5, 0.35] }); // low: jump
  b.entity({ type: 'hazard', p: [0, 1.75, 32], s: [8, 1.4, 0.35] }); // high: slide
  for (const z of [24, 32]) {
    b.decor('box', [-4.3, 1.6, z], [0.4, 3.2, 0.6], 'dark');
    b.decor('box', [4.3, 1.6, z], [0.4, 3.2, 0.6], 'dark');
  }
  b.prompt([0, 1.5, 16], [8, 4, 6], 'jump', 'Glowing beams kill: jump the low ones, slide the high ones');
  b.wall(-6.2, -1.2, 30, 0.8, 8, 15); // 22.5..37.5, face at x = -5.8
  b.plat(0, 3.4, 44, 3, 10, { h: 0.6, mat: 'alt', dress: false }); // 39..49
  b.strip([-5.75, 0.1, 20.6], [0.06, 0.06, 2.4], 1);
  b.collectible('c1', 0, 4.7, 44);
  b.shortcut('co-hidden', [0, 4.9, 44], [4, 3, 9], true);

  // ===== B. The spine (wall chain) ===============================================================
  b.wall(3.0, -2, 54, 0.8, 8, 22); // 43..65
  b.plat(0, 0, 72.5, 10, 14); // 65.5..79.5
  b.checkpoint(0, 0, 69);
  b.wall(-3.0, -2, 85, 0.8, 9, 21); // 74.5..95.5
  b.wall(3.0, -2, 100.5, 0.8, 9, 14); // 93.5..107.5
  b.plat(0, 0, 117.5, 10, 16); // 109.5..125.5
  b.checkpoint(0, 0, 113);

  // ===== C. Crusher hall (Momentum's green wave: same timings, same fairness) ====================
  b.plat(0, 0, 157, 9, 63); // 125.5..188.5
  b.checkpoint(0, 0, 128);
  const crusherRest = 1.5,
    crusherDown = 0.7,
    crusherDrop = 3.7,
    crusherSpeed = 10,
    crusherGap = 14,
    wavePace = 10;
  const crusherCycle = (2 * crusherDrop) / crusherSpeed + crusherDown + crusherRest;
  for (let i = 0; i < 3; i++) {
    const z = 146 + i * crusherGap;
    const phase = ((((-i * crusherGap) / wavePace) % crusherCycle) + crusherCycle) % crusherCycle;
    b.entity({
      type: 'mover',
      s: [9, 3, 4],
      path: [
        [0, 1.5 + crusherDrop, z],
        [0, 1.5, z],
      ],
      speed: crusherSpeed,
      pause: crusherDown,
      rest: crusherRest,
      phase,
      lethal: true,
      telegraph: true,
    });
    b.decor('box', [-5.2, 4, z], [1, 8, 5], 'dark');
    b.decor('box', [5.2, 4, z], [1, 8, 5], 'dark');
    b.decor('box', [0, 8.4, z], [11.4, 0.8, 5], 'dark');
    for (const dz of [-2.1, 2.1]) b.strip([0, 0.02, z + dz], [8.4, 0.04, 0.14], 0.9);
  }
  b.collectible('c2', 0, 1.5, 153);
  b.prompt(
    [0, 1.5, 129],
    [9, 4, 6],
    'forward',
    'Crushers rattle before they drop. Go as one lifts and keep sprinting',
  );

  // ===== D. Launch to the core ======================================================================
  b.entity({ type: 'jumppad', p: [0, 0.6, 184], s: [6, 1.2, 4], v: [0, 16, 3] });
  b.plat(0, T, 204, 12, 28); // 190..218
  b.checkpoint(0, T, 194);

  // ===== E. The last beams and the core ===============================================================
  b.entity({ type: 'hazard', p: [0, T + 1.75, 204], s: [12, 1.4, 0.35] }); // high: slide
  b.entity({ type: 'hazard', p: [0, T + 0.35, 212], s: [12, 0.5, 0.35] }); // low: jump
  for (const z of [204, 212]) {
    b.decor('box', [-6.3, T + 1.6, z], [0.4, 3.2, 0.6], 'dark');
    b.decor('box', [6.3, T + 1.6, z], [0.4, 3.2, 0.6], 'dark');
  }
  b.collectible('c3', 0, T + 2.5, 222);
  b.plat(0, T, 240, 14, 28); // 226..254
  b.checkpoint(0, T, 229);
  b.finish(0, T, 244, 12);
  b.gate(0, T, 253.5, 10, 8);
  b.ring(0, T + 9, 262, 9, 0.6, [0, 0, 0], [0, 0, 0.4], 'accent', 1);

  scenery(b);

  b.bot(
    [0, 0, 6],
    [0, 0, 18],
    [0, 0, 22.8, 'j', 0.8],
    [0, 0, 28],
    [0, 0, 29.5, 's'],
    [0, 0, 35, 'u'],
    [1.7, 0, 43.5],
    [1.7, 0, 46.9, 'j', 0.8],
    [2.2, 1, 54.5],
    [2.2, 1, 60.5, 'wj'],
    [0, 0, 70.5],
    [-1.7, 0, 74.5],
    [-1.7, 0, 78.7, 'j', 0.8],
    [-2.2, 1, 85.5],
    [-2.2, 1, 91.5, 'wj'],
    [2.2, 1, 98.5],
    [2.2, 1, 104.5, 'wj'],
    [0, 0, 114.5],
    [0, 0, 135, 'g'],
    [0, 0, 180],
    [0, 0, 184],
    [0, T, 198, undefined, 2.5],
    [0, T, 201.5, 's'],
    [0, T, 207, 'u'],
    [0, T, 210.8, 'j', 0.8],
    [0, T, 214],
    [0, T, 217.2, 'jj', 0.8],
    [0, T, 236],
    [0, T, 244],
  );
  // ----- destructibles beside the line: the sword is never needed, but they answer it
  b.breakable('pylon', 1.5, 0, 8);
  b.breakable('energy', -2.7, 0, 18, { scale: 0.7 });
  b.breakable('pylon', 1.5, 0, 28);
  b.breakable('energy', -2.7, 0, 40, { scale: 0.7 });
  b.breakable('pylon', 1.5, 0, 118);
  b.breakable('energy', -2.7, 0, 133, { scale: 0.7 });
  b.breakable('energy', -2.7, T, 199, { scale: 0.7 });
  b.breakable('pylon', 1.5, T, 216.5);
  b.breakable('energy', -2.7, T, 234, { scale: 0.7 });
  b.breakable('pylon', 1.5, T, 248);
  return b.data;
}

function scenery(b: LevelBuilder) {
  // the machine: towering server stacks either side, cables of light, a core ring ahead
  for (let i = 0; i < 18; i++) {
    for (const side of [-1, 1]) {
      const x = side * (18 + ((i * 5) % 12));
      const h = 40 + ((i * 23) % 60);
      b.monolith(x, -50, -6 + i * 16, 8, h + 50, 10, (i + (side > 0 ? 1 : 0)) % 3 ? 'base' : 'alt');
      b.strip([x - side * 4.05, -50 + (h + 50) * 0.55, -6 + i * 16], [0.1, (h + 50) * 0.6, 0.3], 0.8);
    }
  }
  for (let i = 0; i < 10; i++) b.strip([((i * 17) % 30) - 15, 30, i * 28], [0.15, 0.15, 24], 0.6);
  b.ring(0, 20, 330, 60, 2, [0, 0, 0], [0, 0, 0.1], 'alt', 0.4);
  for (let i = 0; i < 24; i++)
    b.shard(
      ((i * 31) % 44) - 22,
      8 + (i % 6) * 4,
      i * 12,
      0.8 + (i % 3) * 0.6,
      i % 3 ? 'base' : 'accent',
      0.7,
    );
}
