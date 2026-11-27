/**
 * LEVEL 5 — INK FALLS
 * A brush-drawn gorge that only goes down. A bridge that gives way, terraces that drop a storey at
 * a time, a long ink chute and a wall chain over the void; then the gorge starts to come apart
 * (Level 5, destruction), one idea at a time: a pillar that topples across the gap to become the
 * bridge, a braced pillar you bring down yourself by cutting its brace, and the Cascade — a bridge
 * whose slabs all fall at once while you hop from one to the next. Last, the plunge and the final
 * failing bridge to the finish.
 * Home universe: Ink. Main line heads +Z down x = 0; a hidden ledge runs left of the chute.
 */
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const C = -22; // the gorge floor
const K = C - 25; // below the Cascade
const F = K - 8; // the pool at the bottom

export function build(): LevelData {
  const b = new LevelBuilder();

  // ===== A. Lip of the falls + failing bridge ==============================================
  b.spawnCheckpoint(0, 0, -4);
  b.plat(0, 0, 2, 14, 20); // -8..12
  b.plat(0, 0, 22, 8, 20); // 12..32
  b.checkpoint(0, 0, 25);
  for (let i = 0; i < 5; i++)
    b.entity({ type: 'collapse', p: [0, -0.3, 35 + i * 6], s: [6, 0.6, 5.8], delay: 0.9 });
  b.collectible('i1', 0, 1.6, 47);
  b.prompt([0, 1.5, 26], [8, 4, 6], 'forward', 'The bridge gives way under you: keep running');

  // ===== B. Terraces ========================================================================
  b.plat(0, 0, 72, 8, 20); // 62..82
  b.checkpoint(0, 0, 66);
  b.plat(0, -4, 92, 8, 12); // 86..98
  b.plat(0, -8, 108, 8, 12); // 102..114
  b.plat(0, -12, 126, 8, 16); // 118..134
  b.checkpoint(0, -12, 121);
  b.prompt([0, 1.5, 76], [8, 4, 8], 'jump', 'Drop a storey at a time: jump each gap');

  // ===== C. The ink chute + hidden ledge ======================================================
  b.ramp([0, -12, 134], [0, C, 158], 8);
  b.plat(0, C, 176, 8, 36); // 158..194
  b.checkpoint(0, C, 162, Math.PI, [7, 6, 2]);
  b.solid({ p: [0, C + 1.05 + 0.6, 172], s: [9, 1.2, 1.4], mat: 'alt' });
  b.decor('box', [-4.8, C + 2.5, 172], [0.5, 5, 0.5], 'dark');
  b.decor('box', [4.8, C + 2.5, 172], [0.5, 5, 0.5], 'dark');
  // hidden: a narrow ledge left of the chute, for those who jump off the side
  b.plat(-7.5, -17, 151, 3, 26, { h: 0.6, mat: 'alt', dress: false }); // 138..164, x -9..-6
  b.ramp([-7.5, -17, 164], [-5, C, 180], 3);
  b.strip([-6, -11.9, 136], [0.06, 0.06, 2.4], 1);
  b.collectible('i2', -7.5, -15.6, 152);
  b.shortcut('if-hidden', [-7.5, -15.5, 151], [4, 3, 24], true);
  b.prompt([0, -10.5, 130], [8, 4, 6], 'slide', 'Slide the chute and stay low under the bar');

  // ===== D. Over the void (wall chain) ==========================================================
  b.wall(3.0, C - 2, 200, 0.8, 8, 22); // 189..211
  b.plat(0, C, 218.5, 10, 14); // 211.5..225.5
  b.checkpoint(0, C, 215);
  b.wall(-3.0, C - 2, 231, 0.8, 9, 21); // 220.5..241.5
  b.wall(3.0, C - 2, 246.5, 0.8, 9, 14); // 239.5..253.5
  b.plat(0, C, 263.5, 10, 16); // 255.5..271.5
  b.checkpoint(0, C, 259);
  b.prompt([0, C + 1.5, 186], [8, 4, 6], 'jump', 'Run the walls across the void: kick off to the next');

  // ===== E. The gorge comes apart (destruction) =============================================
  // (1) a falling structure: the pillar ahead topples across the gap and becomes the bridge. It is
  // triggered on leaving the checkpoint and is down 2.2 s later — before even a dashing sprinter
  // covers the 37 m to it.
  b.plat(0, C, 275.5, 10, 40); // 255.5..295.5
  b.trigger([0, C + 1.5, 261], [10, 4, 2], 'pillar1');
  pillar(b, 'pillar1', 295.5, 317, { warn: 0.8, t: 1.4 });
  b.prompt(
    [0, C + 1.5, 266],
    [10, 4, 8],
    'forward',
    'Watch the pillar ahead. The gorge is about to give you a bridge',
  );
  b.plat(0, C, 335, 10, 36); // 317..353
  b.checkpoint(0, C, 321);
  // (2) destructible architecture: three stone braces across the lane hold this pillar up. Cut one
  // or simply run into it and the pillar falls across for you, in time even at a dash. (Slip
  // between them and it gives way anyway once you reach it: there is never a soft-lock.)
  for (const x of [-3.2, 0, 3.2]) b.breakable('column', x, C, 326, { scale: 1.4, fires: 'pillar2' });
  b.trigger([0, C + 1.5, 348], [10, 4, 4], 'pillar2'); // in front of the standing pillar
  pillar(b, 'pillar2', 353, 375, { warn: 0.75, t: 1.2 });
  b.prompt([0, C + 1.5, 322], [10, 4, 3], 'attack', 'Those braces hold the pillar up. Cut through them');
  b.plat(0, C, 387, 10, 24); // 375..399
  b.checkpoint(0, C, 379);
  // (3) the Cascade: seven slabs from here to the far side all fall at once, the far ones first,
  // so the bridge becomes a staircase dropping away under you. Each slab is always at or below the
  // one before it (later slabs start sooner and fall further), so every hop is down, never up;
  // a slow player finds the stair settled, a fast one rides the slabs as they fall.
  b.trigger([0, C + 1.5, 381], [10, 4, 2], 'cascade');
  for (let i = 0; i < 7; i++) {
    const drop = 5 + 3 * i;
    b.entity({
      type: 'structure',
      id: `slab${i}`,
      on: 'cascade',
      p: [0, C, 402 + 8 * i],
      warn: 0.75,
      delay: 1.5 - 0.2 * i,
      steps: [{ t: drop / 6, move: [0, -drop, 0], ease: 'linear' }],
      parts: [
        { p: [0, -0.4, 0], s: [6, 0.8, 6] },
        { p: [0, -1.2, 0], s: [5, 0.8, 5], mat: 'dark' },
        { p: [0, 0.02, -2.6], s: [5.6, 0.04, 0.2], mat: 'accent' },
      ],
    });
  }
  b.prompt(
    [0, C + 1.5, 392],
    [10, 4, 6],
    'forward',
    'The whole bridge is falling. Keep hopping forward: every step is down',
  );
  b.plat(0, K, 467, 12, 24); // 455..479
  b.checkpoint(0, K, 459);

  // ===== F. The plunge and the last bridge ======================================================
  b.ramp([0, K, 479], [0, F, 503], 8);
  b.plat(0, F, 517, 8, 28); // 503..531
  b.checkpoint(0, F, 506.5, Math.PI, [7, 6, 2]);
  for (let i = 0; i < 5; i++)
    b.entity({ type: 'collapse', p: [0, F - 0.3, 534 + i * 6], s: [6, 0.6, 5.8], delay: 0.9 });
  b.collectible('i3', 0, F + 1.4, 546.5);
  b.prompt([0, F + 1.5, 531.5], [8, 4, 5], 'jump', 'The bridge is going: double jump the last gap');
  b.plat(0, F, 575.5, 12, 16); // 567.5..583.5
  b.finish(0, F, 577.5, 10);
  b.gate(0, F, 583, 10, 8);

  scenery(b);

  b.bot(
    [0, 0, 6],
    [0, 0, 20],
    [0, 0, 45],
    [0, 0, 60],
    [0, 0, 70],
    [0, 0, 81.2, 'j', 0.8],
    [0, -4, 92],
    [0, -4, 97.2, 'j', 0.8],
    [0, -8, 108],
    [0, -8, 113.2, 'j', 0.8],
    [0, -12, 126],
    [0, -12, 134.5, 's'],
    [0, C, 160],
    [0, C, 178, 'u'],
    [0, C, 186],
    [1.7, C, 189.5],
    [1.7, C, 192.9, 'j', 0.8],
    [2.2, C + 1, 200.5],
    [2.2, C + 1, 206.5, 'wj'],
    [0, C, 216.5],
    [-1.7, C, 220.5],
    [-1.7, C, 224.7, 'j', 0.8],
    [-2.2, C + 1, 231.5],
    [-2.2, C + 1, 237.5, 'wj'],
    [2.2, C + 1, 244.5],
    [2.2, C + 1, 250.5, 'wj'],
    [0, C, 260.5],
    [0, C, 294, 'w', 0.8],
    [0, C, 305],
    [0, C, 322],
    [0, C, 352.5, 'w', 0.8],
    [0, C, 364],
    [0, C, 380],
    [0, C, 398],
    [0, C - 6, 408, undefined, 30],
    [0, C - 12, 424, undefined, 30],
    [0, C - 18, 440, undefined, 30],
    [0, C - 23, 450, undefined, 30],
    [0, K, 462, undefined, 3],
    [0, K, 479.5, 's'],
    [0, F, 505],
    [0, F, 522, 'u'],
    [0, F, 529.5],
    [0, F, 547.5],
    [0, F, 559.7, 'jj', 0.8],
    [0, F, 572.5],
    [0, F, 577.5],
  );
  // ----- destructibles beside the line: the sword is never needed, but they answer it
  b.breakable('relic', 1.5, 0, 8);
  b.breakable('column', -1.5, 0, 20);
  b.breakable('relic', 1.5, 0, 70);
  b.breakable('column', -1.5, -12, 126);
  b.breakable('relic', 1.5, C, 165);
  b.breakable('column', -1.5, C, 180);
  b.breakable('relic', 1.5, C, 221);
  b.breakable('column', 1.5, C, 262);
  b.breakable('relic', -1.5, C, 285);
  b.breakable('relic', -1.5, C, 384);
  b.breakable('column', 1.5, K, 470);
  b.breakable('relic', -1.5, F, 512.5);
  b.breakable('column', 1.5, F, 525.5);
  b.breakable('relic', -1.5, F, 573.5);
  return b.data;
}

/**
 * A brush-stroke pillar rooted at the near deck's edge (z0). When `event` fires it topples forward
 * and lies across the gap as the bridge, flush with both decks (top surface at C, reaching z1).
 */
function pillar(b: LevelBuilder, event: string, z0: number, z1: number, o: { warn: number; t: number }) {
  const z = z0,
    len = z1 - z0;
  b.entity({
    type: 'structure',
    id: event,
    on: event,
    p: [0, C - 2, z],
    warn: o.warn,
    steps: [{ t: o.t, rot: [1, 0, 0, 90], ease: 'in' }],
    parts: [
      { p: [0, len / 2, 0], s: [4, len, 4] },
      { p: [0, len + 0.3, 0], s: [4.2, 0.6, 4.2], mat: 'accent' },
      { p: [0, len * 0.3, -2.02], s: [0.5, len * 0.5, 0.04], mat: 'dark' }, // a crack running up its face
    ],
  });
  b.plat(0, C - 3, z, 6, 6, { h: 30, mat: 'dark', dress: false }); // its footing
}

function scenery(b: LevelBuilder) {
  // gorge walls: tall brush-stroke cliffs either side, stepping down with the route
  for (let i = 0; i < 30; i++) {
    const z = -10 + i * 20;
    const top = 10 - i * 2;
    for (const side of [-1, 1]) {
      const x = side * (24 + ((i * 7) % 9));
      b.monolith(x, top - 120, z, 14 + (i % 3) * 6, 120, 18, i % 2 ? 'base' : 'alt');
    }
  }
  // the falls themselves: pale strips pouring off the left cliff
  for (let i = 0; i < 6; i++) b.strip([-17, -20, 40 + i * 55], [3, 60, 0.3], 0.5);
  for (let i = 0; i < 44; i++)
    b.shard(((i * 29) % 40) - 20, 6 - i * 1.2, i * 13, 0.8 + (i % 3) * 0.5, i % 5 ? 'base' : 'accent', 0.5);
}
