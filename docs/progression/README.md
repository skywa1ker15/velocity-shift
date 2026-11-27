# Progressive level design: the world learns to move

Players discover, one course at a time, that the world itself can change direction, gravity and
physical structure. Every mechanic is introduced on its own, given room to be understood, then
reused in combinations; later courses are substantially more ambitious than earlier ones.

## Level mapping (verified against the game, confirmed with the user)

The game numbers its courses; Training is the unnumbered gym. "Level N" below is the number shown
in the game.

| Level | Course | Role in the progression | Identity kept |
|---|---|---|---|
| 1 | The Awakening | Fundamentals: unchanged | marble ruins at dawn |
| 2 | Verticality | Advanced movement: unchanged | violet spires at dusk |
| 3 | Momentum | **First dynamic world** | chrome speed canyon |
| 4 | Breakpoint | **Gravity manipulation** | comic printed city |
| 5 | Ink Falls | **Destruction** | brush-drawn gorge that only goes down |
| 6 | Faceted | **Left/right rotation (roll)** | folded-paper valley |
| 7 | Blockfall | **Up/down rotation (pitch)** | voxel blocks in the sky |
| 8 | Corrupted Core | **Everything combined** | a machine coming apart |
| 9 | Shift Point | **The finale**: kept, plus a closing act | Psyche showcase |

Each rebuilt course keeps its original sections unchanged (all of its hidden routes, hazards and
fairness tests still pass), and then continues into the new material. Its medal times are
recalibrated to its new reference run, and its layout version is bumped, so best times, medals and
ghosts set on the old layout are cleared once (shards, objectives and achievements are kept).

## Physical rotation vs world orientation

Both are supported and both are real:

- **Physical rotation** moves actual geometry and collision. Examples:
  - Momentum's turntable bridge and the Roll;
  - the folding tubes, Barrel Roll, toppling pillars and towers;
  - the falling slabs.
- **World orientation changes** update gravity, the player's movement frame and the camera
  together, and preserve momentum. They come from gravity fields:
  - fields that point anywhere;
  - fields linked to a moving structure;
  - the new **pipe** field, which follows a curve.

The camera is never rotated on its own.

## What each level introduces

**Level 3 — Momentum.** After the crusher hall, the canyon moves, one idea at a time:

1. A turntable bridge swings into place ahead of you. This is physical rotation only.
2. A chute whose gravity leans 17° forward feeds a slide, from 11 to 27 m/s. This is gravity-assisted movement.
3. The Roll: a 64 m channel turns 90° while you sprint. It combines rotation, gravity that follows the floor, the camera turning with the world, and momentum preserved.

**Level 4 — Breakpoint.** One gravity idea per city block:

1. Light gravity over a 20 m gap.
2. A vertical launch pad onto a roof.
3. A 42 m fall into a spring well that throws you back out.
4. A heavy-gravity chute that feeds a slide at 31 m/s.
5. A billboard facade with sideways gravity.
6. An overpass with reverse gravity.
7. A launch combined with light gravity, to the finish.

**Level 5 — Ink Falls.** The gorge comes apart:

1. A pillar topples across a gap and becomes the bridge.
2. Destructible architecture: three braces across the lane hold a pillar up. Cutting one or running into one brings it down, and it falls anyway if you slip between them, so there is no soft-lock.
3. The Cascade: seven slabs fall at once, the far ones first, so every hop is down.

**Level 6 — Faceted.** Square paper tubes, where whichever face is under you is the floor:

1. Fold left 90°.
2. Fold right through 180°, over the top.
3. The Crossing: gravity pulls toward the nearer wall. You jump before each gap and gravity flips 180° in mid-air, twice. The flip point is placed so that even a tapped jump crosses.
4. Unfold upright, then a wall-run over the floor gap and collapsing tiles.

**Level 7 — Blockfall.** Pitch: floors curl into walls and ceilings:

1. The Climb: run straight up a 6 m face and over.
2. The Drop: over an edge and straight down a face.
3. The Turnover: up a face onto a ceiling, upside down back over the route. You jump hurdles, cross lanes, and come down the far side.
4. A climb, a jump and a drop back to back.

**Level 8 — Corrupted Core.** Three sequences, each with several events in one run:

- **Breach:** a launch into reverse gravity, a ceiling that collapses behind you (stopping is fatal), and a 38 m fall.
- **Twist & Climb:** a tube rolls left and back, a face curls up, and you break braces to drop a tower across the gap.
- **Core Plunge:** a 40 m drop onto a spring whose throw carries you into sideways gravity, along a wall that collapses behind you, and down into the core.

**Level 9 — Shift Point.** Every original section is kept. After the carousel comes a new finale:

- the Barrel Roll: a full 360° in two halves, with a moment upside down between them;
- the Grand Climb up a 20 m face;
- the Falling Summit;
- the Last Slingshot into low gravity, under a giant finish ring.

## Engine work

- **`pipe` gravity field:** gravity points away from an axis line, or toward it. With the profile
  helpers (`src/levels/profile.ts`: `floorAt`, `ceilingAt`, `faceAt`, `arc`), it builds curved
  surfaces from short segments, each with its own gravity and a lit centre line.
- **Fields can be `quiet`:** they draw nothing, for places where the surface already shows the way.
- **Shared tubes:** rolling tubes now live in a shared module (`src/levels/tubes.ts`).
- **Breakables can fire level events** (`fires`), which is how destructible architecture works.
- **Layout versions on courses:** a once-only reset of stale bests and ghosts. Ghosts are stored per layout.
- **Fix: walls of moving structures froze players.** Rapier's character controller could refuse every
  sliding step against a collider on a kinematic body, freezing a player who ran or wall-ran along
  a moving structure's wall. This also affected Shift Point's hall and Momentum's Roll. Those steps
  now ease out of the contact skin and retry. Static geometry never takes this path, so every
  original reference run is unchanged.
- **Gravity arrows:** chevrons now line the side faces of a field volume, never the running line,
  and are left out of narrow tubes.

## Verification

All of the following were actually run:

- **Simulation progression tests** (`tests/sim/progression.test.ts`, 62 tests): every new
  mechanic, played through the real controller and physics from the checkpoint before it, at a
  **plain run (7 m/s) and a sprint**. Some sections are also checked at a dash, after waiting, with
  a tapped jump, or by slipping past the braces. Every test asserts:
  - that the mechanic really happens: the geometry moves, gravity turns, panels collapse;
  - that it is survivable;
  - that momentum is carried through.
- **Negative tests:**
  - the Crossing's gaps are real;
  - stopping on Breach's ceiling is fatal;
  - the lane wall can't be bypassed;
  - braces never soft-lock.
- **Reference runs:** every course's autopilot run finishes with no deaths, is deterministic, and
  earns gold but not platinum with its recalibrated medals.
- **Unchanged courses:** Levels 1–2 and Training are untouched, and their reference runs are
  identical to the tick.
- **Real keyboard in the browser** (scripted Playwright input, real-time): one run per new
  mechanic family:
  - the Roll;
  - the overpass;
  - the Cascade;
  - the Crossing;
  - the Climb and the Drop;
  - Breach;
  - the Barrel Roll and Grand Climb.
- **Totals:**
  - Vitest: **366 passed**;
  - Playwright: **25 passed**;
  - Prettier, `tsc` and ESLint: clean;
  - build: OK.

**Problems the tests and real-keyboard runs found, all fixed:**

| Course | Problem | Fix |
|---|---|---|
| Momentum | The Roll was too slow for chute speed | Shortened and retimed |
| Breakpoint | The launch pad clipped the building; the spring threw you into a wall | Both retimed |
| Breakpoint, Faceted | Fields started too late for a slow walker stepping off an edge | Fields start at the edge |
| Ink Falls, Core | A pillar edge notch; a soft-lock risk at the braces | Pillar flush with the deck; fallback trigger in front |
| Faceted | Decorative ribs blocked the tube | Ribs moved outside |
| Faceted | A tapped jump fell short in the Crossing | Flip point moved |
| Faceted | The structure-wall freeze (engine) | Contact-skin retry |
| Blockfall | The lane started on the player's running line | Lanes recentred |
| Core | An endless hover above a broken ceiling | Reverse gravity extended upward |
| Core | Runners missed the sideways field or landed too low for the platform | Field covers the whole well; platform lowered |
| Shift Point | The player came off the floor mid-turn in a fast full roll | Two steady halves |
| Shift Point | Level slabs tripped sprinters into a vault | Earlier trigger, smaller gaps |

**Evidence:** real renders of every course's new act:

- `momentum.webp`
- `breakpoint.webp`
- `inkfalls.webp`
- `faceted.webp`
- `blockfall.webp`
- `core.webp`
- `shiftpoint.webp`

## Not verified, and limitations

- **No human playtesting.** All "real keyboard" runs are scripted input. Comfort during rolls and
  pitches, readability of each new mechanic and difficulty all need people. Level 7 and Level 8
  are the most intense. Rotations cannot be turned off; Reduce Motion only scales camera effects.
- **Real GPU performance is unmeasured.** Each rebuilt course adds geometry. Draw calls were not
  re-measured for this work; Phase G's software-GL figures predate it.
- **Course lengths grew.** Reference runs are now about 52–68 s for Levels 3–9, up from 25–47 s.
  This is deliberate escalation, but it is a design choice a playtest should confirm.
- **Pitch rotations reverse your heading by design.** On the Turnover ceiling you run back over the
  route, upside down. Players turn with the mouse as normal.
