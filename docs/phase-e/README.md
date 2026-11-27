# Phase E: five new courses

The original audit asked for at least five new levels. Phases C and D finished the other audit
items (the Level 3 obstacle fix, the character redesign), but the game still had three courses
plus training. Phase E adds five, each built around a different movement skill and set in a
different home universe.

| # | Course | Home universe | Focus | Reference run | Gold / Platinum |
|---|---|---|---|---|---|
| 4 | Breakpoint | Comic | flow through clutter: vaults, slide bars, jump/slide beams, slide chute, wall-run | 29.6 s | 31.5 / 27.5 |
| 5 | Ink Falls | Ink | descent: failing bridges, drop terraces, ink chute, wall chain over the void | 34.4 s | 36.5 / 31.5 |
| 6 | Faceted | Low-Poly | timing: drifting stones, carousel, blink-stone wave, launch pad, wall chain | 27.7 s | 29.5 / 25.5 |
| 7 | Blockfall | Voxel | precision: narrow blocks, two double-jump + dash gaps, canyon climb, crumbling stair, thin beam | 23.4 s | 25 / 21.5 |
| 8 | Corrupted Core | Corrupt | finale: lethal beams, wall spine, Momentum-timed crusher hall, launch pad | 25.7 s | 27.5 / 23.5 |

Every course has 6–7 checkpoints, three shards, a hidden route with a visible hint, three
objectives, 9–12 themed destructibles beside the line (the sword is never needed), its own
environment preset and a real-render preview card. Courses unlock in order, as before.

## What was verified, and how

- **Reference runs (deterministic sim):** the autopilot finishes every new course with ordinary
  inputs and no deaths, earns gold but not platinum, and repeats exactly
  (`tests/sim/levels.test.ts`).
- **Hidden routes (new test, `tests/sim/hidden-routes.test.ts`):** the autopilot follows each hidden
  line and must trigger the hidden-route zone and collect that route's shard. It runs for all
  five new courses and, as a control, The Awakening. Writing it found three hidden routes that
  could not actually be reached: Ink Falls' ledge was too far from the chute, Blockfall's upper
  walls started out of reach, and Faceted's wall began where a launch-pad landing could not use it.
  All three were fixed. The intended technique for the wall-and-beam routes is a wall-run, a
  kick-off, then a double jump.
- **Fairness and content rules:** checkpoint spacing, telegraph times, collapse delays,
  destructible placement, and "slashing everything changes neither route nor time" all run on
  the new courses.
- **Rendered gameplay:** `*_playthrough.webp` shows six frames per course, rendered by the game
  while the autopilot plays it in the home universe (software GL).
- **Level select:** `level_select_*.webp` shows a fresh save (seven locked cards, each naming the
  course that unlocks it) and the unlocked grid.

## Performance (software GL; no GPU available)

From `perf_software_gl.txt`: the new courses draw **69–117** calls, against 127–151 for the
existing courses. Geometries are 97–141 (against 157–174), triangles are in the same range, and
the shader programs are the same 52–55. Frame times in software rendering are noise and are not a
GPU measurement.

## Known limits

- **Human playtesting:** none. Routes are proven by the autopilot. Difficulty for a person,
  especially Faceted's blink wave and Blockfall's blocks, needs a human playtest.
- **Timed elements:** these are tuned to the reference line on the deterministic clock, as
  Momentum's are. Other paces work on narrower windows.
- **Music:** new courses reuse the existing tracks, and each universe's voicing still changes the
  sound.
- **Achievements:** I added no per-course "finish" achievements. The existing all-course ones
  ("Podium" and "Gold Rush") now count the new courses automatically.
- **Hidden routes of Verticality and Momentum:** still untested.
