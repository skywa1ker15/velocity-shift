/**
 * LEVEL 4 — BREAKPOINT
 * A printed city at noon, inked in heavy black. The course is about keeping flow through clutter:
 * vault the crates, slide the bars, read low beams (jump) from high beams (slide), ride a slide
 * chute down into the lot, then chain a wall-run and a final double jump. Home universe: Comic.
 * Main line heads +Z down x = 0. One hidden high beam over the boost straight.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const L = -8; // the lot, below the street

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Street: crates and a bar ======================================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 30, 8, 36); // 12..48
  for (const [z, h] of [
    [22, 0.9],
    [34, 1.1],
  ])
    crate(b, 0, 0, z, h);
  bar(b, 0, 42);
  b.gate(0, 0, 11.6, 8.5, 6);
  b.prompt(
    [0, 1.5, 16],
    [8, 4, 8],
    'forward',
    'Run straight at the crates: you vault them without breaking stride',
  );
  b.prompt([0, 1.5, 37], [8, 4, 4], 'slide', 'Slide under the bar');

  // ===== B. Beam alley ====================================================================
  b.plat(0, 0, 63, 8, 22); // 52..74
  b.checkpoint(0, 0, 55);
  b.entity({ type: 'hazard', p: [0, 0.35, 60], s: [8, 0.5, 0.35] }); // low: jump it
  b.entity({ type: 'hazard', p: [0, 1.75, 66], s: [8, 1.4, 0.35] }); // high: slide it
  for (const z of [60, 66]) {
    b.decor('box', [-4.3, 1.6, z], [0.4, 3.2, 0.6], 'dark');
    b.decor('box', [4.3, 1.6, z], [0.4, 3.2, 0.6], 'dark');
  }
  b.collectible('b1', 0, 2.1, 60);
  b.prompt([0, 1.5, 54], [8, 4, 4], 'jump', 'Low beams: jump. High beams: slide');

  // ===== C. Boost straight + hidden beam ==================================================
  b.plat(0, 0, 91, 8, 28); // 77..105
  b.checkpoint(0, 0, 79);
  b.entity({ type: 'boost', p: [0, 0.6, 86], s: [6, 1.2, 4], dir: [0, 0, 1], add: 4, min: 15 });
  // hidden: a lit wall just off the left edge leads up to a beam above the lane
  b.wall(-6.2, -1.2, 88, 0.8, 8, 15); // 80.5..95.5, face at x = -5.8
  b.plat(0, 3.4, 103, 3, 12, { h: 0.6, mat: 'alt', dress: false }); // 97..109
  b.strip([-5.75, 0.1, 78.6], [0.06, 0.06, 2.4], 1);
  b.collectible('b2', 0, 4.7, 104);
  b.shortcut('bp-hidden', [0, 4.9, 103], [4, 3, 11], true);

  // ===== D. The chute ======================================================================
  b.ramp([0, 0, 105], [0, L, 129], 8);
  b.plat(0, L, 145, 8, 32); // 129..161
  b.checkpoint(0, L, 133, Math.PI, [7, 6, 2]);
  bar(b, L, 140);
  bar(b, L, 150);
  crate(b, 0, L, 158, 1.0);
  b.prompt([0, 1.5, 101], [8, 4, 6], 'slide', 'Slide the chute and keep sliding under the bars');

  // ===== E. The lot (vaults) ===============================================================
  b.plat(0, L, 180, 8, 28); // 166..194
  b.checkpoint(0, L, 169);
  crate(b, 0, L, 174, 0.8);
  crate(b, 0, L, 182, 1.2);

  // ===== F. Billboard wall ==================================================================
  b.wall(3.0, L - 2, 199.5, 0.8, 8, 22); // 188.5..210.5, face at x = 2.6
  b.plat(0, L, 218, 10, 14); // 211..225
  b.checkpoint(0, L, 214);
  b.prompt([0, L + 1.5, 186], [8, 4, 6], 'jump', 'Jump beside the billboard and run along it');

  // ===== G. Final run ======================================================================
  b.plat(0, L, 245, 10, 40); // 225..265
  b.checkpoint(0, L, 229);
  b.entity({ type: 'hazard', p: [0, L + 1.75, 236], s: [10, 1.4, 0.35] });
  b.entity({ type: 'hazard', p: [0, L + 0.35, 246], s: [10, 0.5, 0.35] });
  for (const z of [236, 246]) {
    b.decor('box', [-5.3, L + 1.6, z], [0.4, 3.2, 0.6], 'dark');
    b.decor('box', [5.3, L + 1.6, z], [0.4, 3.2, 0.6], 'dark');
  }
  b.collectible('b3', 0, L + 2.6, 269);
  b.plat(0, L, 290, 16, 34); // 273..307
  b.finish(0, L, 300, 12);
  b.gate(0, L, 306, 10, 8);

  scenery(b);

  b.bot(
    [0, 0, 6],
    [0, 0, 18],
    [0, 0, 30],
    [0, 0, 38],
    [0, 0, 39.5, 's'],
    [0, 0, 45, 'u'],
    [0, 0, 47.2, 'j', 0.8],
    [0, 0, 56],
    [0, 0, 58.8, 'j', 0.8],
    [0, 0, 63.5, 's'],
    [0, 0, 69, 'u'],
    [0, 0, 73.2, 'j', 0.8],
    [0, 0, 84],
    [0, 0, 103.5, 's'],
    [0, L, 131],
    [0, L, 153, 'u'],
    [0, L, 160.2, 'j', 0.8],
    [0, L, 170],
    [0, L, 186],
    [1.7, L, 189],
    [1.7, L, 193.4, 'j', 0.8],
    [2.2, L + 1, 200],
    [2.2, L + 1, 206, 'wj'],
    [0, L, 216],
    [0, L, 231],
    [0, L, 233, 's'],
    [0, L, 239, 'u'],
    [0, L, 244.4, 'j', 0.8],
    [0, L, 255],
    [0, L, 264.2, 'jj', 0.8],
    [0, L, 285],
    [0, L, 300],
  );
  // ----- destructibles beside the line: the sword is never needed, but they answer it
  b.breakable('crate', 1.5, 0, 8);
  b.breakable('sign', -1.5, 0 + 1.9, 27);
  b.breakable('crate', 1.5, 0, 52.4);
  b.breakable('sign', -1.5, 0 + 1.9, 90);
  b.breakable('crate', 1.5, 0, 98);
  b.breakable('sign', -1.5, L + 1.9, 137);
  b.breakable('crate', 1.5, L, 145);
  b.breakable('sign', -1.5, L + 1.9, 166.5);
  b.breakable('crate', 1.5, L, 178);
  b.breakable('sign', -1.5, L + 1.9, 225.5);
  b.breakable('crate', 1.5, L, 255);
  b.breakable('sign', -1.5, L + 1.9, 285);
  return b.data;
}

/** A vaultable crate, full lane width. */
function crate(b: LevelBuilder, x: number, y: number, z: number, h: number) {
  b.solid({ p: [x, y + h / 2, z], s: [7.6, h, 1.2], mat: 'alt' });
  b.strip([x, y + h + 0.01, z - 0.62], [7.6, 0.04, 0.06], 0.8);
}

/** A bar to slide under: its underside 1.05 m above the deck. */
function bar(b: LevelBuilder, y: number, z: number) {
  b.solid({ p: [0, y + 1.05 + 0.6, z], s: [9, 1.2, 1.4], mat: 'alt' });
  b.decor('box', [-4.8, y + 2.5, z], [0.5, 5, 0.5], 'dark');
  b.decor('box', [4.8, y + 2.5, z], [0.5, 5, 0.5], 'dark');
}

function scenery(b: LevelBuilder) {
  // a printed skyline: blocky towers with lit window strips either side of the street
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -10 + i * 19;
    const w = 10 + (i % 4) * 4;
    const h = 30 + ((i * 17) % 50);
    const x = side * (22 + ((i * 11) % 14));
    b.monolith(x, -40, z, w, h + 40, w * 0.8, i % 3 ? 'base' : 'alt');
    b.strip([x - (side * w) / 2 - side * 0.05, -40 + (h + 40) * 0.6, z], [0.1, (h + 40) * 0.5, w * 0.5], 0.7);
  }
  b.monolith(-120, -80, 200, 40, 260, 40, 'dark');
  b.monolith(140, -80, 320, 50, 300, 46, 'dark');
  for (let i = 0; i < 26; i++)
    b.shard(
      ((i * 37) % 60) - 30,
      14 + (i % 5) * 4,
      i * 13,
      1 + (i % 3) * 0.5,
      i % 4 ? 'base' : 'accent',
      0.4,
    );
}
