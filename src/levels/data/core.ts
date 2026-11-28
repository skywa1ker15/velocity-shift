/**
 * LEVEL 8 — CORRUPTED CORE
 * Inside a machine that is coming apart. Lethal beams to read and clear, a wall chain over the
 * void, a crusher hall on a green wave, a launch pad and a last pair of beams; then the machine
 * stops following any rules (Level 8, everything combined), three sequences in which several
 * things happen in one run: Breach (a launch into reverse gravity, a ceiling that collapses behind
 * you, a 38 m fall), Twist & Climb (a tube that rolls left and back, a floor that curls up a face,
 * braces you break to drop a tower across the gap) and the Core Plunge (a 40 m drop onto a spring
 * whose throw carries you into sideways gravity, along a wall that collapses behind you, down
 * into the core). Home universe: Corrupt. Main line x = 0; a hidden beam sits above the entry
 * corridor.
 */
import { LevelBuilder } from '../LevelBuilder';
import { Course } from '../sections';
import type { LevelData } from '../types';
import { arc, faceAt, floorAt, type Lane } from '../profile';
import { tube } from '../tubes';

const T = 2; // the core terrace
const CE = T + 18; // Breach's ceiling (underside)
const LD = T - 20; // where Breach's fall lands
const TP = LD + 16; // top of the climb (and the tower bridge)
const W = TP - 40; // the Core Plunge's spring floor
const CP = -36; // the core platform: below the wall's lower edge, so every runner drops onto it

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

  // ===== F. Meltdown: everything at once ==========================================================
  // Three sequences, each several events in one run; a checkpoint before each.
  // --- Breach: launch → reverse gravity → the ceiling collapses behind you → a 38 m fall
  b.plat(0, T, 262, 12, 16); // 254..270
  b.checkpoint(0, T, 258);
  b.entity({ type: 'jumppad', p: [0, T + 0.6, 266], s: [6, 1.2, 4], v: [0, 22, 0] });
  b.entity({
    type: 'field',
    mode: 'dir',
    dir: [0, 1, 0],
    p: [0, (T + 6 + 70) / 2, 292],
    s: [10, 70 - T - 6, 48],
  }); // z 268..316; it reaches far above the ceiling, so falling up through a broken panel is a
  // fall into the sky (out of bounds), never a hover at the field's edge
  for (let i = 0; i < 8; i++)
    b.entity({ type: 'collapse', p: [0, CE + 0.3, 271 + 6 * i], s: [6, 0.6, 5.8], delay: 0.9, mat: 'alt' }); // z 268..316
  b.solid({ p: [0, CE + 0.8, 292], s: [8, 0.4, 50], mat: 'dark', collide: false }); // the machine's roof beyond the panels
  b.prompt(
    [0, T + 1.5, 260],
    [12, 4, 6],
    'forward',
    'Launch, fall up, and do not stop on the ceiling: it is coming apart',
  );
  // --- Twist & Climb: a tube that rolls left and back → the floor curls up a face and over →
  // braces you break to drop a tower across the gap
  b.plat(0, LD, 342, 12, 40); // 322..362
  b.checkpoint(0, LD, 336);
  b.checkpoint(0, LD, 358);
  tube(b, LD, 'twist', 362, 422, {
    steps: [
      { t: 1.2, rot: [0, 0, 1, 90] },
      { t: 0.8, rot: [0, 0, 1, 0] },
      { t: 1.2, rot: [0, 0, 1, -90] },
    ],
  });
  b.trigger([0, LD + 2, 363], [4, 4, 2], 'twist');
  const A: Lane = [-3, 3];
  floorAt(b, A, LD, 422, 428);
  arc(b, A, LD + 5, 428, 5, 0, 90, 'inside');
  faceAt(b, A, 433, LD + 5, LD + 11, -1);
  arc(b, A, LD + 11, 438, 5, -90, -180, 'outside');
  b.plat(0, TP, 449, 6, 22, { h: 20, mat: 'base' }); // the top, z 438..460
  b.checkpoint(0, TP, 440);
  for (const x of [-2.1, 0, 2.1]) b.breakable('pylon', x, TP, 445, { scale: 1.3, fires: 'tower' });
  b.trigger([0, TP + 1.5, 456], [6, 4, 4], 'tower'); // never a soft-lock: it falls once you reach it
  tower(b, 'tower', 460, 482, TP);
  b.prompt([0, TP + 1.5, 441], [6, 4, 3], 'attack', 'Break the braces: the tower is your bridge');
  b.plat(0, TP, 494, 12, 24); // 482..506
  b.checkpoint(0, TP, 500);
  // --- the Core Plunge: a 40 m drop onto a spring → its throw carries you into sideways gravity →
  // run the wall as it collapses behind you → drop into the core
  b.plat(0, W - 0.5, 521, 12, 30, { h: 4, mat: 'dark', dress: false }); // well floor, z 506..536
  b.entity({ type: 'jumppad', p: [0, W + 0.1, 521], s: [10, 1.2, 28], v: [0, 10, 0], spring: 0.7 });
  b.solid({ p: [-6.5, (W + TP) / 2, 521], s: [1, TP - W, 30], mat: 'alt' }); // well wall (left)
  // the right-hand wall becomes the floor: solid, then four panels that give way, then solid
  b.solid({ p: [6.5, (W + TP) / 2, 523.5], s: [1, TP - W, 35], mat: 'alt', wallrun: false }); // z 506..541
  for (let i = 0; i < 4; i++)
    b.entity({ type: 'collapse', p: [6.5, -16, 544 + 6 * i], s: [1, 28, 5.8], delay: 0.9, mat: 'alt' }); // z 541..565
  b.solid({ p: [6.5, -16, 569], s: [1, 28, 8], mat: 'alt', wallrun: false }); // z 565..573
  b.solid({ p: [4.5, -1.5, 550.5], s: [3, 1, 45], mat: 'dark' }); // lips: the wall's edges, as side walls
  b.solid({ p: [4.5, -30.5, 550.5], s: [3, 1, 45], mat: 'dark' });
  b.entity({ type: 'field', mode: 'dir', dir: [1, 0, 0], p: [0, -16, 550.5], s: [12, 28, 45] }); // the well's whole width, z 528..573
  b.prompt(
    [0, TP + 1.5, 502],
    [12, 4, 6],
    'forward',
    'Down the core. The spring throws you onto the wall: keep running',
  );
  b.plat(6, CP, 597, 16, 48); // the core platform, z 573..621
  b.checkpoint(6, CP, 580);
  b.gate(6, CP, 620, 10, 8);
  b.ring(6, CP + 9, 628, 9, 0.6, [0, 0, 0], [0, 0, 0.4], 'accent', 1);

  // ===== Phase 3: the course goes on (section library + Difficulty Director) =================
  const ext = new Course(b, [6, CP, 621], { id: 'cor', level: 8 });
  ext.roll(1);
  ext.climbOver();
  ext.hurdles();
  ext.gaps();
  ext.drawbridge();
  ext.roll(-1);
  ext.chute(6);
  ext.laserGate();
  ext.wallChain();
  ext.climbOver();
  ext.collapseRun();
  const { finishZ } = ext.finale();
  ext.finish(finishZ);

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
    [0, T, 262],
    [0, T, 266, undefined, 1.5],
    [0, CE, 278, undefined, 4],
    [0, CE, 316.5],
    [0, LD, 332, undefined, 4],
    [0, LD, 361],
    [0, LD + 2, 380, undefined, 2.5],
    [0, LD + 2, 421, undefined, 2.5],
    [0, LD + 1.5, 431.5, undefined, 2.5],
    [0, LD + 8, 433, undefined, 2.5],
    [0, LD + 14.5, 434.5, undefined, 2.5],
    [0, TP, 444, undefined, 2.5],
    [0, TP, 459.5, 'w', 0.8],
    [0, TP, 472],
    [0, TP, 506],
    [0, W, 521, undefined, 40],
    [6, -6, 545, undefined, 4],
    [6, -6, 572, undefined, 3],
    [6, CP, 588, undefined, 4],
    [6, CP, 600],
  );
  b.bot(...ext.bot);
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

/**
 * A tower rooted at the edge (z0) of a deck at height y. When `event` fires it topples forward and
 * lies across the gap as the bridge, flush with both decks (reaching z1).
 */
function tower(b: LevelBuilder, event: string, z0: number, z1: number, y: number) {
  const len = z1 - z0;
  b.entity({
    type: 'structure',
    id: event,
    on: event,
    p: [0, y - 2, z0],
    warn: 0.75,
    steps: [{ t: 1.0, rot: [1, 0, 0, 90], ease: 'in' }],
    parts: [
      { p: [0, len / 2, 0], s: [4, len, 4] },
      { p: [0, len + 0.3, 0], s: [4.2, 0.6, 4.2], mat: 'accent' },
    ],
  });
  b.plat(0, y - 3, z0, 6, 6, { h: 30, mat: 'dark', dress: false });
}

function scenery(b: LevelBuilder) {
  // the machine: towering server stacks either side, cables of light, a core ring ahead
  for (let i = 0; i < 42; i++) {
    for (const side of [-1, 1]) {
      const x = side * (18 + ((i * 5) % 12));
      const h = 40 + ((i * 23) % 60);
      b.monolith(x, -50, -6 + i * 16, 8, h + 50, 10, (i + (side > 0 ? 1 : 0)) % 3 ? 'base' : 'alt');
      b.strip([x - side * 4.05, -50 + (h + 50) * 0.55, -6 + i * 16], [0.1, (h + 50) * 0.6, 0.3], 0.8);
    }
  }
  for (let i = 0; i < 22; i++) b.strip([((i * 17) % 30) - 15, 30, i * 28], [0.15, 0.15, 24], 0.6);
  b.ring(0, 20, 700, 60, 2, [0, 0, 0], [0, 0, 0.1], 'alt', 0.4);
  for (let i = 0; i < 52; i++)
    b.shard(
      ((i * 31) % 44) - 22,
      8 + (i % 6) * 4,
      i * 12,
      0.8 + (i % 3) * 0.6,
      i % 3 ? 'base' : 'accent',
      0.7,
    );
}
