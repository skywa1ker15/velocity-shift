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
crushers with `lethal`, sweeping beams with `lethal` + `ghost`), `rotator`, `collapse`, `blink`,
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

## Workflow

1. Lay out decks and walls with the reach table; add the bot line.
2. `npm test -- levels` until the bot finishes cleanly.
3. Add scenery, prompts, collectibles, the hidden route and its hint.
4. Set medal times in the registry: gold just above the bot's time, the hidden tier ~12 % below
   it, silver ×1.4, bronze ×2 (the test checks that a clean bot run earns exactly gold).
5. Play it.
