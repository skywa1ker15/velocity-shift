# Phase G: Dynamic World Movement

**The player moves. The world moves. Gravity changes.** Phase G adds a gravity-frame movement
system, gravity fields, rigid dynamic structures, launches and destruction feedback. They are
reusable level-data entities, shown together in a new course, **SHIFT POINT** (Level 9).

## Architecture, and why it is built this way

The movement controller is an 882-line, Y-up state machine. Every ability, and every tuned
course, depends on it. Rewriting it for arbitrary "up" would have put all eight courses at risk.
Instead:

| Piece | File | What it does |
|---|---|---|
| Gravity frame | `MovementController.frame` | A rotation from the player's local frame to the world. The unchanged controller runs in local space; vectors are converted in and out around each tick. `pos` and `vel` stay in **world** space between ticks, so turning the frame never touches momentum. Identity frame = the original code path, untouched. |
| Framed collision | `PhysicsWorld.setFrame` | Every `CollisionWorld` query (move, ground probe, rays, fit, overlap, moving-surface delta) is converted at the boundary. Rapier's character controller gets the frame's up vector, and the capsule is rotated to match. |
| Gravity director | `gameplay/Gravity.ts` | Fields request a direction and strength each tick (highest priority wins). The frame turns toward it, eased and capped at 240°/s: about 0.4 s for 90° and 0.7 s for 180°. A 180° flip rolls about the facing direction, so heading is kept. **Gravity itself acts along the true field immediately**; only the frame and camera ease. The body turns about its centre, not its feet. An upright frame left turned about Y folds back into the look angle and becomes identity again. |
| Fields | `GravityField` (`type: 'field'`) | `dir` (sideways, reverse, diagonal; `scale` 0 = weightless, 0.4 low, 1.8 heavy), `well` (toward a point), `spin` (a rotating direction), `structure` (follows a structure's floor). |
| Structures | `Structure` (`type: 'structure'`) | One kinematic body, a motion program (`rot`, `move`, easing) on the level clock, optional trigger, a mandatory telegraph when it moves under you or falls, and an optional `fall` that drops it away and then **removes its collision**. The pose is a pure function of time, so respawns replay it exactly. Riders are carried by the existing surface tracking. |
| Launches | `Impulse`, `JumpPad.spring` | Impulse rings set a minimum speed along any world direction (airborne too) and keep cross-motion. Spring floors bounce in proportion to the landing speed. Launches and boosts respect the frame. |
| Destruction feedback | `LevelView` debris pools | Three instanced meshes (cube, shard, slab) of 96 chunks each, in the **world material** (patched for instancing), so every universe's shader restyles them. Each universe picks its shape, amount and force (`FxLook.debris`). No physics bodies; at most three draw calls. Collapsing pieces show crack lines while they telegraph. |
| Camera | `CameraRig.update(…, frame)` | Builds the view upright in the player's frame, then rotates it into the world using the **interpolated** frame. Velocity effects read frame-local velocity. A short FOV breath and a light rumble mark the start of a gravity turn; both respect Motion intensity and Reduce Motion. |
| Autopilot | `Bot` | Steers and judges waypoints in the player's frame. |

### Two engine problems found and fixed on the way

1. **A capsule that turns in place can end up inside geometry.** After a 90° roll, the body lay
   against a former wall and Rapier refused every step. Fixed with depenetration for static
   overlaps in framed mode, and contact-skin recovery: a framed step that makes no progress
   against a non-ground contact eases out of the 2 cm skin and is retaken.
2. **Gravity following the lagging frame** shoved players sideways during a 180° flip, and let a
   fall in the old direction keep accelerating. Fixed by applying the true field direction in the
   controller's air step while the frame catches up.

## SHIFT POINT (Level 9, home universe Psyche)

| Section | What happens | Systems |
|---|---|---|
| A. Approach | Calm running | — |
| B. The Turning Hall | A 52 m hall rolls 90° while you sprint through it; you stay on its floor all the way round | structure + linked field |
| C. The Wall Run | Run off the edge into sideways gravity: the wall becomes the floor; drop back down at its end | `dir` field |
| D. The Falling Bridge | Seven sections collapse behind you (timed for a 7 m/s run, not only a sprint) while a tower ahead topples across the chasm and becomes the next bridge | collapse chain + falling structure |
| E. Gravity Chaos | A 45° slingshot ring through low gravity; then reverse gravity: fall 20 m **up**, run along the ceiling, drop back down when it ends | impulse + `dir` fields |
| F. Finale | Carousel and finish: calm control after the chaos | rotator |

It has 9 checkpoints (each placed before a set-piece and lined up with it), 3 shards, a hidden
route, 10 destructibles, medals calibrated to the reference run (43.5 s, gold 46 s), and two
achievements: *Shift Happens* and *Which Way Is Up*.

**The existing eight courses were deliberately left unchanged.** Their medals, reference runs,
hidden routes and the fairness tuning from Phase F are all validated tick-for-tick. Retrofitting
set-pieces into them would invalidate that work, and the brief asked to preserve their identities
and requirements. The systems are general-purpose level entities (see `docs/LEVEL_AUTHORING.md`),
so adding optional dynamic routes to existing courses is now straightforward future work.

## Verification

**Automated: simulation (real controller and physics).** `tests/sim/gravity.test.ts` (25 tests):

- the frame converges to every direction (±X, ±Z, reverse, diagonal) within the rate cap, with 90° and 180° timings;
- heading is kept through a flip, and momentum is preserved exactly while the frame turns;
- standing and running on a wall, standing on a ceiling and jumping off it, standing on a 45° slab;
- low and heavy gravity, wells;
- 300 m falls under ×3 gravity onto a 0.3 m slab and a 0.3 m wall, with **no tunnelling**;
- respawn resets gravity, and gravity runs are deterministic;
- turning platforms carry riders, and a rolling corridor with linked gravity keeps the player on its floor;
- a fallen structure leaves **no collision behind**, and respawn replays structures;
- impulse rings in mid-air, spring-floor scaling.

Shift Point also passes the same course checks as every other level: reference run (gold, not
platinum), determinism, checkpoint spacing, fairness, destructible placement and slashing, and its
hidden route.

**Regression.** All earlier simulation tests pass unchanged, including every original course's
reference time to the tick.

**Real game in a browser, real keyboard (no autopilot, real-time loop, software GL at 17–25 fps):**

- **Turning Hall:** holding W, the player stays grounded through the whole roll (up goes +Y → −X → +Y).
- **Wall Run:** holding W, the player lands on the wall at x = 7.5, sprints 40 m along it, picks up the wall shard, and drops to the next deck.
- **Bridge → tower → slingshot → ceiling:** holding W, plus one Space press at the ring. The player crosses as the sections fall behind, runs along the toppled tower, rides the slingshot through low gravity, falls up onto the ceiling, runs it and drops back, with no deaths.
- The wall run is now a permanent end-to-end test.

**Bugs found by real-keyboard play that the autopilot had hidden** (fixed):

- a 3 m gap before the bridge; the bot crossed it at full sprint with a ledge-catch;
- a bridge checkpoint not lined up with the bridge;
- the hidden-route beam hanging over the slingshot take-off, which cut the jump short.

**Evidence (all real renders):**

- `shiftpoint_sequences_anime.webp`: every set-piece, in a readable universe.
- `shiftpoint_sequences_psyche_home.webp`: the same, in the home universe.
- `debris_per_universe.webp`: voxel cubes, low-poly shards, comic slabs, ink flecks.
- `real_keyboard_*.webp` and `*.log`: frames and per-step position and gravity traces from the keyboard runs.

## Test results

- Prettier, `tsc` and ESLint (0 warnings): clean.
- Vitest: **299 passed** in 19 files.
- Playwright: **17 passed** in the full run; the new real-keyboard wall-run test (the 18th) **passed** in its own run.
- Production build: OK.

## Performance (software GL; no GPU here)

`perf_software_gl.txt`:

- Shift Point draws **132–133 calls**, between The Awakening (127) and Momentum (148).
- Existing courses' draw calls are unchanged. Geometries rose by 3 (the debris pools; not drawn while idle) and shader programs by 2 (the instanced world-material variant).
- Frame times in software rendering are not meaningful.
- **Real GPU performance (RTX 2050) is still unmeasured.**

## Not verified, and limitations

- **No human playtesting.** All "real keyboard" runs are scripted Playwright input. Comfort
  (motion sickness) during gravity turns, readability of the field chevrons, and difficulty all
  need a person, ideally on the target laptop.
- **Gravity turns cannot be turned off.** Reduce Motion and Motion intensity scale the extra
  camera effects, but the frame turn itself is gameplay.
- **Effects assume world-up in turned frames.** A few presentation effects (dust puffs at the
  feet, the landing-brace ray) still assume world up and are simply skipped or approximate there.
- **Arm poses use world velocity.** The hand animation's rise and fall poses read world
  velocity, so they are approximate in turned frames.
- **Debris is visual only.** Gameplay destruction is the structures and collapses themselves.
- **No new shader effects for gravity.** The brief's "gravity distortion" is represented by the
  glowing field volumes and chevrons, the FOV breath and the sound.
- **Old courses have no dynamic routes yet** (see above).
