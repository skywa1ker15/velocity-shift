/**
 * LEVEL 6 — FACETED
 * A folded-paper valley where the ground keeps moving. Drifting stones, a turning carousel, stones
 * that blink in and out together, a launch pad up to the high terrace and a wall chain: a course
 * about timing. Then the valley folds (Level 6, left/right rotation), in square paper tubes where
 * whichever face is under you is the floor: a tube that folds left 90° as you run, one that folds
 * right through 180°, the Crossing — a slot where gravity pulls to the nearer wall, so you jump
 * across and it flips 180° in mid-air — and a last tube that unfolds upright, with a wall-run over
 * a gap inside it and collapsing tiles out to the finish. Home universe: Low-Poly.
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
  b.checkpoint(0, T, 251);

  // ===== F. The folds (left/right rotation) =================================================
  // Square paper tubes, 4 m inside. Each tube's own gravity always pulls to its "floor" face (the
  // one with the lit centre line), so as a tube rolls the world turns around you and the floor
  // stays your floor; the static stretches between tubes continue the same orientation, so every
  // hand-over is seamless. Each turn finishes well inside its tube even at a dash.
  b.prompt(
    [0, T + 1.5, 262],
    [14, 4, 10],
    'forward',
    'The valley folds from here. Whatever is under you is the floor',
  );
  // (1) fold left: a quarter turn to the left as you run (gravity ends up pulling toward +X)
  tube(b, 'fold1', 272.5, 322.5, { steps: [{ t: 1.6, rot: [0, 0, 1, 90] }] });
  b.trigger([0, T + 2, 274], [4, 4, 2], 'fold1');
  corridor(b, 322.5, 352.5, [{ dir: 1 }]);
  b.checkpoint(0, T, 326);
  // (2) fold right through 180°: from the left wall, over the top (upside down halfway), to the
  // right wall
  tube(b, 'fold2', 352.5, 402.5, { r0: 90, steps: [{ t: 2.2, rot: [0, 0, 1, 180] }] });
  b.trigger([0, T + 2, 354], [4, 4, 2], 'fold2');
  b.prompt([0, T + 2, 340], [4, 4, 8], 'forward', 'Next fold: all the way over, to the other side');
  // (3) the Crossing: gravity pulls to whichever wall is nearer. Each wall has a gap; jump before
  // it and you cross the middle, gravity flips 180° in mid-air and you land on the far wall
  // Where gravity flips sits 0.75 m off the centre toward the wall you are leaving, so a full jump
  // crosses with room to spare and even a tapped one does; just running on a wall never reaches it.
  corridor(b, 402.5, 470, [
    { dir: -1, holes: [[418, 424]] },
    { dir: 1, holes: [[442, 448]] },
  ]);
  crossing(b, 402.5, 433, -0.75); // first crossing: right wall → left wall
  crossing(b, 433, 470, 0.75); // second crossing: left wall → right wall
  b.checkpoint(-1, T, 406);
  b.checkpoint(-1, T, 462); // back on the right-hand wall after the second crossing
  b.prompt([0, T + 2, 410], [4, 4, 6], 'jump', 'Jump across before the gap: gravity flips to the other wall');
  // (4) unfold: back upright, then wall-run the tube's side over the gap in its floor; the tiles
  // outside give way under you
  tube(b, 'unfold', 470, 520, {
    r0: -90,
    steps: [{ t: 1.6, rot: [0, 0, 1, 90] }],
    gap: [504, 512],
    wallrun: true,
  });
  b.trigger([0, T + 2, 471], [4, 4, 2], 'unfold');
  b.prompt([0, T + 2, 464], [4, 4, 6], 'jump', 'Unfold, then run the wall over the gap');
  b.plat(0, T, 525, 8, 10); // 520..530
  b.checkpoint(0, T, 523);
  for (let i = 0; i < 4; i++)
    b.entity({ type: 'collapse', p: [0, T - 0.3, 533 + i * 6], s: [6, 0.6, 5.8], delay: 0.9, mat: 'alt' });
  b.plat(0, T, 569, 14, 30); // 554..584
  b.finish(0, T, 566, 12);
  b.gate(0, T, 583, 10, 8);

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
    [0, T, 271],
    // inside the tubes: points on the tube's axis do not move as it turns
    [0, T + 2, 290, undefined, 2.5],
    [0, T + 2, 350, undefined, 2.5],
    [0, T + 2, 400, undefined, 2.5],
    [-2, T + 2, 410, undefined, 2.5],
    [-2, T + 2, 416.6, 'j', 2.5],
    [2, T + 2, 430, undefined, 2.5],
    [2, T + 2, 440.6, 'j', 2.5],
    [-2, T + 2, 455, undefined, 2.5],
    [0, T + 2, 480, undefined, 2.5],
    [1.4, T, 499],
    [1.4, T, 502.5, 'j', 0.8],
    [1.6, T + 1, 507.5, undefined, 1.2],
    [1.6, T + 1, 511.5, 'wj', 1.2],
    [0, T, 523, undefined, 2],
    [0, T, 545],
    [0, T, 566],
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
  b.breakable('crate', -1.5, T, 527);
  b.breakable('panel', 1.5, T + 1.9, 560);
  return b.data;
}

/**
 * A square paper tube, 4 m inside, along z0..z1 with its pivot on the axis. Its local -Y face is
 * the floor (lit centre line) and its own gravity always pulls toward it. `r0`: starting roll in
 * degrees about Z; `gap`: a hole in the floor face (world z range); `wallrun`: the side faces can
 * be wall-run (and are painted so).
 */
function tube(
  b: LevelBuilder,
  id: string,
  z0: number,
  z1: number,
  o: {
    r0?: number;
    steps: { t: number; rot: [number, number, number, number] }[];
    gap?: [number, number];
    wallrun?: boolean;
  },
) {
  const len = z1 - z0,
    zc = (z0 + z1) / 2;
  type Part = {
    p: [number, number, number];
    s: [number, number, number];
    mat?: 'base' | 'alt' | 'accent' | 'dark';
    wallrun?: boolean;
  };
  const parts: Part[] = [];
  const floor = (a: number, c: number) => {
    parts.push({ p: [0, -2.5, (a + c) / 2 - zc], s: [6, 1, c - a] });
    parts.push({ p: [0, -1.97, (a + c) / 2 - zc], s: [0.3, 0.06, c - a - 0.4], mat: 'accent' });
  };
  if (o.gap) {
    floor(z0, o.gap[0]);
    floor(o.gap[1], z1);
  } else floor(z0, z1);
  parts.push({ p: [2.5, 0, 0], s: [1, 4, len], mat: 'alt', wallrun: !!o.wallrun });
  parts.push({ p: [-2.5, 0, 0], s: [1, 4, len], mat: 'alt', wallrun: !!o.wallrun });
  parts.push({ p: [0, 2.5, 0], s: [6, 1, len], mat: 'base' });
  for (const x of [-1.9, 1.9]) parts.push({ p: [x, 1.9, 0], s: [0.12, 0.12, len], mat: 'accent' });
  for (let z = -len / 2 + 3; z < len / 2; z += 6)
    for (const k of [-1, 1]) {
      // ribs: thin frames round the outside of the tube
      parts.push({ p: [0, k * 3.1, z], s: [6.4, 0.2, 0.3], mat: 'dark' });
      parts.push({ p: [k * 3.1, 0, z], s: [0.2, 6.4, 0.3], mat: 'dark' });
    }
  b.entity({
    type: 'structure',
    id,
    on: id,
    p: [0, T + 2, zc],
    r: o.r0 ? [0, 0, (o.r0 * Math.PI) / 180] : undefined,
    warn: 0.75,
    steps: o.steps,
    parts,
  });
  b.entity({ type: 'field', mode: 'structure', link: id, p: [0, 0, 0], s: [4, 4, len] });
}

/**
 * A static stretch of the same square section, already turned. One side given: the whole width
 * pulls toward that wall. Two sides: walls only (see `crossing` for their gravity).
 * `holes`: gaps in that side's wall (world z ranges).
 */
function corridor(
  b: LevelBuilder,
  z0: number,
  z1: number,
  sides: { dir: -1 | 1; holes?: [number, number][] }[],
) {
  const len = z1 - z0,
    zc = (z0 + z1) / 2;
  b.solid({ p: [0, T - 0.5, zc], s: [6, 1, len], mat: 'base' });
  b.solid({ p: [0, T + 4.5, zc], s: [6, 1, len], mat: 'base' });
  for (const dir of [-1, 1] as const) {
    const side = sides.find((sd) => sd.dir === dir);
    const holes = side?.holes ?? [];
    let a = z0;
    for (const [h0, h1] of [...holes, [z1, z1] as [number, number]]) {
      if (h0 > a) {
        b.solid({ p: [dir * 2.5, T + 2, (a + h0) / 2], s: [1, 4, h0 - a], mat: 'alt', wallrun: false });
        if (side) b.strip([dir * 1.97, T + 2, (a + h0) / 2], [0.06, 0.3, h0 - a - 0.4], 1);
      }
      a = h1;
    }
  }
  if (sides.length === 1)
    b.entity({ type: 'field', mode: 'dir', dir: [sides[0].dir, 0, 0], p: [0, T + 2, zc], s: [4, 4, len] });
}

/** Two-sided gravity over z0..z1: pulls toward -X left of `split`, toward +X right of it. */
function crossing(b: LevelBuilder, z0: number, z1: number, split: number) {
  const len = z1 - z0,
    zc = (z0 + z1) / 2;
  b.entity({
    type: 'field',
    mode: 'dir',
    dir: [-1, 0, 0],
    p: [(-2 + split) / 2, T + 2, zc],
    s: [split + 2, 4, len],
  });
  b.entity({
    type: 'field',
    mode: 'dir',
    dir: [1, 0, 0],
    p: [(2 + split) / 2, T + 2, zc],
    s: [2 - split, 4, len],
  });
}

function scenery(b: LevelBuilder) {
  // folded hills: big faceted blocks tilted at angles either side of the valley
  for (let i = 0; i < 32; i++) {
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
  for (let i = 0; i < 54; i++)
    b.shard(((i * 31) % 50) - 25, 10 + (i % 4) * 5, i * 11, 1 + (i % 3) * 0.6, i % 4 ? 'alt' : 'accent', 0.3);
}
