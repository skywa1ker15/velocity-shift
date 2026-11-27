/**
 * LEVEL 6 — FACETED
 * A folded-paper valley where the ground keeps moving. Drifting stones, a turning carousel, stones
 * that blink in and out together, a launch pad up to the high terrace and a wall chain to the
 * finish: a course about timing, not speed. Home universe: Low-Poly.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const Y = 1.4; // the middle terrace
const T = 3.4; // the high terrace

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Drifting stones ===============================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 24, 8, 24); // 12..36
  b.checkpoint(0, 0, 20);
  b.entity({
    type: 'mover',
    s: [5, 1, 4.5],
    path: [
      [0, -0.7, 41.5],
      [0, 0.3, 41.5],
    ],
    speed: 0.7,
    pause: 0.4,
  });
  b.entity({
    type: 'mover',
    s: [5, 1, 4.5],
    path: [
      [0, 0.9, 48.5],
      [0, -0.1, 48.5],
    ],
    speed: 0.7,
    pause: 0.4,
  });
  b.plat(0, Y, 63, 10, 19); // 53.5..72.5
  b.checkpoint(0, Y, 56);
  b.prompt([0, 1.5, 30], [8, 4, 8], 'jump', 'The stones rise and sink: jump when they are close');

  // ===== B. The carousel ===================================================================
  b.plat(0, Y, 87.5, 8, 8, { h: 20, mat: 'dark', dress: false }); // hub 83.5..91.5
  b.entity({
    type: 'rotator',
    p: [0, Y - 0.5, 87.5],
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
  b.collectible('f1', 0, Y + 1.4, 87.5);
  b.plat(0, Y, 107.5, 12, 10); // 102.5..112.5
  b.checkpoint(0, Y, 105.5);
  b.prompt(
    [0, Y + 1.5, 66],
    [8, 4, 6],
    'jump',
    'Step on as an arm arrives, cross the hub, step off the far side',
  );

  // ===== C. Blink stones ===================================================================
  // they switch on as a wave that runs ahead of you (about 0.85 s apart, 2.6 s each); phases are
  // tuned on the deterministic level clock so the reference line crosses each mid-window
  [
    [118.5, 1.1],
    [127.5, 0.2],
    [136.5, 3.0],
  ].forEach(([z, phase]) =>
    b.entity({ type: 'blink', p: [0, Y - 0.5, z], s: [6, 1, 6], onTime: 2.6, offTime: 1.0, phase }),
  );
  b.collectible('f2', 0, Y + 1.4, 127.5);
  b.plat(0, Y, 150, 10, 14); // 143..157
  b.checkpoint(0, Y, 146);
  b.prompt(
    [0, Y + 1.5, 106],
    [10, 4, 6],
    'forward',
    'The stones blink on in a wave: go as the first appears and keep moving',
  );

  // ===== D. Launch to the high terrace + hidden beam ========================================
  b.entity({ type: 'jumppad', p: [0, Y + 0.6, 152], s: [6, 1.2, 4], v: [0, 16, 3] });
  b.plat(0, T, 172, 12, 28); // 158..186
  b.checkpoint(0, T, 162);
  // hidden: a lit wall off the left edge leads up to a beam above the lane
  b.wall(-6.2, T - 1.2, 175.5, 0.8, 8, 15); // 168..183, face at x = -5.8
  b.plat(0, T + 3.4, 190.5, 3, 12, { h: 0.6, mat: 'alt', dress: false }); // 184.5..196.5
  b.strip([-5.75, T + 0.1, 166.1], [0.06, 0.06, 2.4], 1);
  b.collectible('f3', 0, T + 4.7, 191.5);
  b.shortcut('fa-hidden', [0, T + 4.9, 190.5], [4, 3, 11], true);

  // ===== E. Wall chain to the finish ===========================================================
  b.wall(3.0, T - 2, 192, 0.8, 8, 22); // 181..203
  b.plat(0, T, 210.5, 10, 14); // 203.5..217.5
  b.checkpoint(0, T, 207);
  b.wall(-3.0, T - 2, 223, 0.8, 9, 21); // 212.5..233.5
  b.wall(3.0, T - 2, 238.5, 0.8, 9, 14); // 231.5..245.5
  b.plat(0, T, 260, 14, 25); // 247.5..272.5
  b.finish(0, T, 264, 12);
  b.gate(0, T, 272, 10, 8);

  scenery(b);

  b.bot(
    [0, 0, 6],
    [0, 0, 30],
    [0, 0, 35.3, 'j', 0.8],
    [0, 0.3, 41.5, 'j', 1.2],
    [0, 0.9, 48.5, 'j', 1.2],
    [0, Y, 58],
    [0, Y, 67.5, 'w2', 0.6],
    [0, Y, 72, 'j', 0.6],
    [0, Y, 78, undefined, 1.6],
    [0, Y, 80.3, 'j', 1],
    [0, Y, 87, 'w2', 0.6],
    [0, Y, 91, 'j', 0.6],
    [0, Y, 97, undefined, 1.6],
    [0, Y, 99.3, 'j', 1],
    [0, Y, 106.5],
    [0, Y, 109, 'w2', 0.6],
    [0, Y, 111.8, 'j', 0.6],
    [0, Y, 118.5],
    [0, Y, 120.8, 'j', 0.6],
    [0, Y, 127.5],
    [0, Y, 129.8, 'j', 0.6],
    [0, Y, 136.5],
    [0, Y, 138.8, 'j', 0.6],
    [0, Y, 147],
    [0, Y, 152],
    [0, T, 166, undefined, 2.5],
    [0, T, 178],
    [1.7, T, 181.5],
    [1.7, T, 185.4, 'j', 0.8],
    [2.2, T + 1, 192.5],
    [2.2, T + 1, 198.5, 'wj'],
    [0, T, 208.5],
    [-1.7, T, 212.5],
    [-1.7, T, 216.7, 'j', 0.8],
    [-2.2, T + 1, 223.5],
    [-2.2, T + 1, 229.5, 'wj'],
    [2.2, T + 1, 236.5],
    [2.2, T + 1, 242.5, 'wj'],
    [0, T, 255],
    [0, T, 264],
  );
  // ----- destructibles beside the line: the sword is never needed, but they answer it
  b.breakable('panel', 1.5, 0 + 1.9, 8);
  b.breakable('crate', -1.5, 0, 26);
  b.breakable('panel', 1.5, Y + 1.9, 60);
  b.breakable('crate', -1.5, Y, 64);
  b.breakable('panel', 1.5, Y + 1.9, 109);
  b.breakable('crate', -1.5, Y, 155.8);
  b.breakable('panel', -1.5, T + 1.9, 176);
  b.breakable('crate', 1.5, T, 214);
  b.breakable('panel', -1.5, T + 1.9, 256);
  b.breakable('crate', 1.5, T, 266);
  return b.data;
}

function scenery(b: LevelBuilder) {
  // folded hills: big faceted blocks tilted at angles either side of the valley
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const z = i * 19;
    const s = 18 + (i % 4) * 7;
    b.decor(
      'box',
      [side * (30 + (i % 3) * 9), -12 + (i % 5) * 3, z],
      [s, s * 0.8, s],
      i % 3 ? 'base' : 'alt',
      {
        r: [0.3 * side, (i * 0.7) % 1.5, 0.4],
      },
    );
  }
  b.monolith(-110, -60, 180, 50, 160, 50, 'dark');
  b.monolith(120, -60, 260, 60, 180, 50, 'dark');
  for (let i = 0; i < 28; i++)
    b.shard(((i * 31) % 50) - 25, 10 + (i % 4) * 5, i * 11, 1 + (i % 3) * 0.6, i % 4 ? 'alt' : 'accent', 0.3);
}
