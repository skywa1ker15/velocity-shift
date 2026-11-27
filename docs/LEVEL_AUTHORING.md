# Level authoring

A level is one file in `src/levels/data/` exporting `build(): LevelData`, plus one entry in
`src/levels/registry.ts`. No engine code changes.

## Conventions

- Metres, Y up. Courses head **+Z** (spawn yaw `Math.PI`); "left" is +X, "right" is −X.
- `plat(x, yTop, z, width, depth)` takes the height of the **walkable top**.
- `wall(x, yBottom, z, thickness, height, length)` creates a wall-runnable slab. Start walls on
  the take-off deck (alongside the last few metres of it) so there is no exposed leading face.
- `ramp(a, b, width)` joins two top-centre points with a sloped slab (≤ 50° is walkable).
- Keep each runnable wall a single box: the "same wall" rule is per collider.

## Reach table (from a sprint)

| Move | Gap | Up |
|---|---|---|
| jump | ≤ 4.5 m comfortable, 6.3 m max | 1.45 m (2.5 m with a ledge catch) |
| double jump | ≤ 8.5 m comfortable, 10.7 m max | 2.7 m |
| jump + dash | ≈ 11 m | — |
| double jump + dash | ≈ 16 m | — |
| wall-run + kick-off | wall ≈ 15 m, landing ≈ 6 m beyond | +1 to +2 m |
| slide under | clearance 1.05 m | — |
| vault | — | obstacle 0.4–1.3 m |

## Builder cheat sheet (`LevelBuilder`)

```ts
const b = new LevelBuilder();
b.spawnCheckpoint(0, 0, -4);
b.plat(0, 0, 2, 14, 20);                       // deck
b.wall(-3, -1, 143, 0.8, 8, 21);               // lit wall
b.ramp([0, 3.6, 271], [0, -4.4, 295], 8);      // slide chute
b.checkpoint(0, 1.2, 75);                      // gate + beacon (order = route order)
b.finish(0, -2.4, 408);
b.collectible('a1', 0, 5.9, 111);              // exactly three per level
b.shortcut('aw-hidden', [0, 6, 110], [4, 3, 13], true);   // true = the hidden route
b.prompt([0, 1.5, 38], [7, 4, 7], 'jump', 'Jump the gap');
b.trigger([0, -2, 298], [8, 6, 4], 'door');    // fires an event once per life
b.entity({ type: 'mover', s: [5, 1, 4.5], path: [[0, 1.5, 143], [0, 2.5, 143]], speed: 0.7, pause: 0.4 });
b.entity({ type: 'collapse', p: [0, -4.7, 326], s: [6, 0.6, 5.8], delay: 0.9 });
b.entity({ type: 'blink', p: [0, -21, 279], s: [6, 1, 6], onTime: 1.7, offTime: 1.1, phase: 0.8 });
b.entity({ type: 'hazard', p: [0, -10.15, 131], s: [9, 0.5, 0.35] });
b.entity({ type: 'boost', p: [0, -9.4, 45], s: [6, 1.2, 4], dir: [0, 0, 1], add: 5, min: 21 });
b.entity({ type: 'jumppad', p: [0, 21.6, 310], s: [4, 1.2, 4], v: [0, 22, 5] });
b.entity({ type: 'gravity', p: [0, 42, 194], s: [18, 50, 76], scale: 0.35 });
b.entity({ type: 'rotator', p: [0, 14.5, 105], axis: [0, 1, 0], speed: 0.3, parts: [...] });
b.gate(...); b.column(...); b.monolith(...); b.ring(...); b.shard(...); b.strip(...);  // scenery
b.bot([0, 0, 6], [0, 0, 41.2, 'j', 0.8], ...);  // reference line for the test bot
return b.data;
```

Entity types: `mover` (moving/rising platforms, doors with `mode: 'once'` + `on`, shutters,
crushers with `lethal` + `telegraph` (rest at `path[0]` for `rest` s, warn before dropping), sweeping beams with `lethal` + `ghost`), `rotator`, `collapse`, `blink`,
`hazard`, `boost`, `jumppad`, `gravity`. All timing runs on the level clock, so it is identical on
every run.

## Fairness rules (enforced by tests where possible)

- Anything that drops or kills telegraphs for ≥ 0.75 s (`collapse.delay`, blink warning).
- A first-time player must be able to see a hazard before it can kill them.
- No soft-locks: collapsed pieces rebuild after a few seconds, and respawning restores them.
- Checkpoints sit *before* a challenge, in route order, no more than ~85 m apart.
- One obvious main line, at least one faster line, and one hidden route with a visible hint.

## The reference line (bot)

`b.bot(...)` lists waypoints for the autopilot in `src/gameplay/Bot.ts`. It plays the level with
ordinary inputs; `tests/sim/levels.test.ts` requires it to finish every level without dying.
Actions at a waypoint: `j` jump · `jj` jump + double jump at the apex · `d` dash · `s` / `u` start /
stop sliding · `wj` wall jump · `w` wait for ground under the next point (`w2`: the one after).
Combine with `+` (`jj+d`). The fifth value is the arrival radius.

Because the simulation is deterministic, timed hazards can be tuned (their `phase`) so the
reference line passes on the first attempt; the test then guards that line against regressions.

## Dynamic world (Phase G)

Four entity types build moving, turning, collapsing and gravity-bending sequences. They are all
deterministic on the level clock and all replay from the start on respawn.

```ts
// a structure: one rigid kinematic body; pivot at p; a motion program of steps
b.entity({ type: 'structure', id: 'hall', on: 'hall', p: [0, 3, 74], warn: 0.9,
  steps: [{ t: 2.4, rot: [0, 0, 1, 90] }],          // rot: world axis + degrees; move: [dx,dy,dz]
  parts: [{ p: [0, -3.5, 0], s: [6, 1, 52] }, ...] }); // ease: 'smooth' | 'linear' | 'in' | 'out'
// add `fall: 2` to drop it away after the program (its collision is removed after 2 s)

// gravity fields (highest priority wins where they overlap)
b.entity({ type: 'field', mode: 'dir', dir: [1, 0, 0], p, s });           // sideways / reverse / diagonal
b.entity({ type: 'field', mode: 'dir', dir: [0, -1, 0], scale: 0.4, p, s }); // low (0 = weightless)
b.entity({ type: 'field', mode: 'well', center: [0, 5, 40], p, s });      // pulls toward a point
b.entity({ type: 'field', mode: 'spin', dir: [0, -1, 0], axis: [0, 0, 1], speed: 0.5, p, s });
b.entity({ type: 'field', mode: 'structure', link: 'hall', p: [0, 0, 0], s: [6, 7, 52] }); // follows the hall's floor

// launches
b.entity({ type: 'impulse', p, s, dir: [0, 1, 1], add: 4, min: 22 });     // ring / slingshot, works airborne
b.entity({ type: 'jumppad', p, s, v: [0, 8, 0], spring: 0.9 });            // spring floor: bounce grows with impact
```

Rules that keep it fair and stable:

- Anything that moves under the player or falls telegraphs for at least 0.75 s (`warn`).
- Gravity turns are eased and rate-limited (≈0.4 s for 90°, ≈0.7 s for 180°). Gravity itself
  acts along the true field at once; only the frame and camera ease.
- Put bot waypoints inside a turning structure **on its rotation axis**: those points do not move.
- Collapse timings: make each section fall behind a 7 m/s runner, not only a sprinter.
- Checkpoints before every set-piece, lined up with what follows (respawn and run straight).
- A level whose gravity can point anywhere should set `bounds` (falling up is also out).

## Progression tools (Levels 3–9)

```ts
import { arc, ceilingAt, faceAt, floorAt, type Lane } from '../profile';
import { tube } from '../tubes';
const L: Lane = [-3, 3];
// pitch: a floor that curls up into a 6 m face and over the top (angles: see profile.ts)
floorAt(b, L, 0, 260, 270);
arc(b, L, 5, 270, 5, 0, 90, 'inside'); // floor → wall
faceAt(b, L, 275, 5, 11, -1); // run up it
arc(b, L, 11, 280, 5, -90, -180, 'outside'); // over the crest (R ≥ v²/g ≈ 5 m)
// roll: a square tube whose own gravity keeps you on its floor face as it turns
tube(b, baseY, 'fold', 272.5, 322.5, { steps: [{ t: 1.6, rot: [0, 0, 1, 90] }] });
// destructible architecture: break it (sword or body) to fire an event; always pair with a trigger
b.breakable('column', 0, y, z, { scale: 1.4, fires: 'tower' });
b.trigger([0, y + 1.5, zEdge], [6, 4, 4], 'tower'); // in front of whatever it opens: no soft-lock
// fields can draw nothing when the surface already shows the way
b.entity({ type: 'field', mode: 'pipe', center, axis: [1, 0, 0], inward: false, quiet: true, p, s });
```

Rules learned the hard way:

- **Start fields at the deck's edge.** A walker stepping off must be caught at once, not after 2 m of ordinary gravity.
- **Reverse gravity over a collapsible ceiling must reach far above it.** Falling up through a broken panel has to be a fall into the sky; otherwise the player hovers forever at the field's edge.
- **Keep fast full rolls slow and steady.** About 1.3 rad/s at a constant rate (`ease: 'linear'`) works; split a 360° roll into halves.
- **Keep lanes centred on where the player naturally runs.**
- **Give a crossing's gravity-flip point margin for a tapped jump.**
- **Bump `meta.layout` whenever you rebuild a course,** so stale bests and ghosts reset.

## Hidden routes are tested

`tests/sim/hidden-routes.test.ts` holds a second bot line per course that takes the hidden route.
It must reach the hidden zone and pick up that route's shard. The usual way onto a beam above the
lane is a wall-run, a kick-off, then a double jump (a kick-off alone gains only 1–2 m).

## Workflow

1. Lay out decks and walls with the reach table; add the bot line.
2. `npm test -- levels` until the bot finishes cleanly.
3. Add scenery, prompts, collectibles, the hidden route and its hint.
4. Set medal times in the registry: gold just above the bot's time, the hidden tier ~12 % below
   it, silver ×1.4, bronze ×2 (the test checks that a clean bot run earns exactly gold).
5. Play it.

## Evolve tools

- Evolve collectibles are not authored per course: `npm run gen:slots` records slots along the autopilot reference line into `src/evolution/slots/<level>.json`, and `placeCollectibles(slots, seed)` places them at run start. Re-run it and commit the JSON whenever geometry or the reference line changes (a test checks freshness).
- For hand-placed items (the Training gym) use `LevelData.evoItems` with `evoItem()` from the builder.
- Courses must still keep exactly 3 collectibles of the old kind, checkpoint spacing under 85 m and a hidden route; Pure reference times set the medals.
