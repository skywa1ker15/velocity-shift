/**
 * LEVEL 4 — BREAKPOINT
 * A printed city at noon, inked in heavy black. The course is about keeping flow through clutter:
 * vault the crates, slide the bars, read low beams (jump) from high beams (slide), ride a slide
 * chute down into the lot, then chain a wall-run and the beam run. Then the city starts bending
 * gravity, one block at a time (Level 4, gravity manipulation): light gravity over a gap, a launch
 * pad up to a rooftop, a huge fall into a spring well, a heavy-gravity chute, a facade where gravity
 * turns sideways, an overpass where it reverses, and a last block that combines a launch with a
 * light-gravity float to the finish. Home universe: Comic.
 * Main line heads +Z down x = 0. One hidden high beam over the boost straight.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const L = -8; // the lot, below the street
const R = L + 18; // the rooftop
const W = L - 24; // the spring well's floor
const E = L + 2; // the ledge past the well
const F = E - 14; // below the heavy chute
const G = F - 4; // after the facade
const U = G + 14; // the overpass underside

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
  b.plat(0, L, 290, 16, 34); // 273..307
  b.checkpoint(0, L, 276);

  // ===== H. The gravity blocks ===============================================================
  // One way of bending gravity per block, each on its own with room to read it; then a last block
  // that combines two. Glowing chevrons always show the pull before you enter it.
  // (1) light gravity: a 20 m gap you could never jump normally. A sprint jump floats across;
  // a plain run needs the double jump too.
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 0.3, p: [0, L + 2, 316], s: [16, 18, 22] });
  b.prompt(
    [0, L + 1.5, 290],
    [16, 4, 10],
    'jump',
    'Light gravity over the gap: jump from the edge and float',
  );
  b.plat(0, L, 338, 12, 22); // 327..349 (runs straight into the building's foot)
  b.checkpoint(0, L, 331);
  // (2) the launch pad: straight up the side of a building and onto its roof
  b.entity({ type: 'jumppad', p: [0, L + 0.6, 342], s: [6, 1.2, 4], v: [0, 36, 0] });
  b.plat(0, R, 368.5, 12, 39, { h: 30, mat: 'base' }); // the building, z 349..388
  b.prompt(
    [0, L + 1.5, 335],
    [12, 4, 6],
    'forward',
    'Launch pads throw you straight up. Keep holding forward',
  );
  b.checkpoint(0, R, 358);
  // (3) the long way down: drop 42 m into a light well onto a spring floor. The harder you land,
  // the higher it throws you: back up and over the ledge on the far side. The well is long enough
  // that a walker and a sprinter both land on the spring, and the throw clears the ledge's face.
  b.plat(0, W - 0.5, 404, 12, 32, { h: 4, mat: 'dark', dress: false }); // well floor, z 388..420
  b.entity({ type: 'jumppad', p: [0, W + 0.1, 404], s: [10, 1.2, 30], v: [0, 10, 0], spring: 0.78 });
  b.solid({ p: [-6.5, (W + R) / 2, 404], s: [1, R - W + 6, 34], mat: 'alt' }); // well walls
  b.solid({ p: [6.5, (W + R) / 2, 404], s: [1, R - W + 6, 34], mat: 'alt' });
  b.prompt(
    [0, R + 1.5, 380],
    [12, 4, 8],
    'forward',
    'Long way down. Land on the spring: it throws you as high as you fell',
  );
  b.plat(0, E, 428, 12, 16, { h: 26, mat: 'base' }); // ledge 420..436, its face is the well's far wall
  b.checkpoint(0, E, 424);
  // (4) heavy gravity: everything falls harder, including you down this chute. Slide it and the
  // speed carries you over the next gap
  b.ramp([0, E, 436], [0, E - 10, 468], 9);
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 2, p: [0, E - 4, 452], s: [12, 16, 32] });
  b.prompt(
    [0, E + 1.5, 430],
    [12, 4, 6],
    'slide',
    'Heavy gravity: slide the chute and let it throw you over',
  );
  b.plat(0, F, 494, 10, 24); // 482..506
  b.checkpoint(0, F, 502);
  // (5) sideways gravity: run off the edge and the billboard facade becomes the floor
  // the field starts right at the deck's edge, so even a walker stepping off is caught at once
  b.solid({ p: [8, F + 2, 542], s: [1, 22, 72], mat: 'alt', wallrun: false }); // face at x = 7.5, z 506..578
  b.entity({ type: 'field', mode: 'dir', dir: [1, 0, 0], p: [3.5, F, 541], s: [8, 26, 68] }); // z 507..575
  for (let z = 514; z < 574; z += 8) b.strip([7.45, F + 4, z], [0.04, 2, 3], 0.8); // lit billboards
  b.prompt(
    [0, F + 1.5, 496],
    [10, 4, 8],
    'forward',
    'Gravity turns sideways ahead: the billboard is your floor',
  );
  b.plat(4, G, 591, 12, 30); // 576..606, x -2..10
  b.checkpoint(4, G, 580);
  // (6) reverse gravity: run off the end, fall UP onto the overpass, run its underside, drop back
  // the field starts right at the deck's edge (a walker stepping off is caught at once) and the
  // underside reaches back over the deck's end, so there is always a ceiling to fall up onto
  b.solid({ p: [0, U + 0.5, 630], s: [10, 1, 52], mat: 'alt' }); // underside y = U, z 604..656
  b.entity({
    type: 'field',
    mode: 'dir',
    dir: [0, 1, 0],
    p: [0, (G + U) / 2 - 4, 631],
    s: [12, U - G + 12, 50],
  });
  b.collectible('b3', 0, U - 1.2, 640);
  b.prompt([2, G + 1.5, 596], [10, 4, 8], 'forward', 'Up is down under the overpass. Run off the end');
  b.plat(0, G, 672, 12, 24); // 660..684
  b.checkpoint(0, G, 664);
  // (7) both at once: a launch pad throws you into light gravity and you float over the last gap
  b.entity({ type: 'jumppad', p: [0, G + 0.6, 680], s: [6, 1.2, 4], v: [0, 14, 9] });
  b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 0.35, p: [0, G + 4, 692], s: [16, 26, 32] }); // z 676..708: over the pad too
  b.prompt(
    [0, G + 1.5, 668],
    [12, 4, 6],
    'forward',
    'Launch, then float. Everything you have learned, together',
  );
  b.plat(0, G, 723, 16, 46); // 700..746
  b.finish(0, G, 734, 12);
  b.gate(0, G, 745, 10, 8);

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
    [0, L, 306.4, 'jj', 0.8],
    [0, L, 333, undefined, 2],
    [0, L, 342, undefined, 1.5],
    [0, R, 362, undefined, 3],
    [0, R, 389],
    [0, E, 426, undefined, 3],
    [0, E, 435.5, 's'],
    [0, E - 10, 467.5, 'j', 0.8],
    [0, F, 492, 'u', 3],
    [0, F, 505],
    [7.5, F, 526, undefined, 2],
    [7.5, F, 572, undefined, 2],
    [4, G, 582, undefined, 2],
    [0, G, 596],
    [0, G, 607],
    [0, U, 616, undefined, 3],
    [0, U, 655],
    [0, G, 668, undefined, 3],
    [0, G, 680, undefined, 1.5],
    [0, G, 716, undefined, 3],
    [0, G, 734],
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
  b.breakable('crate', 1.5, L, 338);
  b.breakable('sign', -1.5, R + 1.9, 372);
  b.breakable('crate', -1.5, F, 498);
  b.breakable('sign', 2.5, G + 1.9, 590);
  b.breakable('crate', 1.5, G, 715);
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
  for (let i = 0; i < 40; i++) {
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
  for (let i = 0; i < 56; i++)
    b.shard(
      ((i * 37) % 60) - 30,
      14 + (i % 5) * 4,
      i * 13,
      1 + (i % 3) * 0.5,
      i % 4 ? 'base' : 'accent',
      0.4,
    );
}
