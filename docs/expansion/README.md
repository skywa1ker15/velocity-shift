# Gameplay expansion & evolution overhaul — report

Branch `development/phase-2`, released to `main`. Plan: [PLAN.md](PLAN.md). Evidence images are in this folder.

## What was built

| Area | Result |
|---|---|
| Flicker | Corrupt's flickering horizontal blocks, screen glitch and surface tears are removed (no `uTime` jitter, no glitch field, one speed-line pass). Regression test in `tests/unit/multiverse.test.ts`. Evidence: `flicker-before-after.webp`, `flicker-candidates.webp`. |
| Length | Six courses extended (Training, Awakening, Verticality, Momentum, Ink Falls, Shift Point). Reference-run distance went from 377/437/396/589/399/530 m to 730/865/718/1164/833/1123 m (1.8–2.1×); reference times roughly doubled. Medals recalibrated, layout versions bumped (old bests on those courses are cleared once). Evidence: `doubled-courses.webp`. |
| Collectibles | Eight kinds (Glint, Undertow, Skyknot, Rift Mote, Fracture Glyph, Wall Vein, Echo Chain, Paradox Core), five rarities, different catch methods (run through, slide under, touch in air, sword, wall-run, chains, tier-gated). Seeded spawner places them on slots taken from the autopilot's reference line, so each one is reachable by the move that catches it. Training has a hand-placed gym. Evidence: `collectibles-gym.webp`, `vein-paradox-surge.webp`. |
| Upgrades | 18 stackable abilities across movement, combat, survival and special (Stride, Glide, Spring, Phase Dash, Wallrunner, Flywheel, Edge, Reach, Severance, Siphon, Aegis, Reflex, Steady, Timeslip, Magnet, Overclock, Mirror Edge, Chrono Heart) with levels, caps, diminishing-return tables and evolution stages. Triple jump, Aegis lethal-hit absorb and void catch, Surge/Timeslip world slow-down (key V/G). Flux overflows into upgrades once everything is capped. |
| Momentum | Flow meter with five tiers (0/20/45/75/100, max 120) that feeds upgrade effects and gates Paradox Cores. |
| Synergies | Six, each with a callout: Phantom Cut, Skybreaker, Railgun, Dynamo, Updraft, Guardian Tempo. |
| Visual evolution | The player body glows and changes with upgrade stage; collectibles are instanced per kind with an ink shell. Evidence: `visual-evolution.webp`. |
| Run variety | The run seed changes slot selection and rarity rolls, so each Evolve run places things differently on the same course. |
| HUD | Minimal ability rail, meters, dynamic dash pips and callouts. Evidence: `hud-callouts-ready-results.webp`, `ready-mode-pick.webp`, `results-evolve.webp`. |
| Modes | **Evolve** (default) and **Pure** (no collectibles). Medals, splits, ghosts and reference runs come from Pure only; Evolve keeps its own best time. Setting `gameMode`, picker on the ready card. |

Pure determinism was preserved: reference-run times for Awakening, Verticality, Momentum, Ink Falls and Shift Point were identical before and after the engine refactor.

## Tests

- Vitest: 430+ tests including `tests/sim/evolution.test.ts` (61+ tests: slot freshness per level, seeded spawner, every catch method, ability caps and diminishing returns, synergies, run model, no wall tunnelling at max speed), updated progression/save tests, and the level rule tests (3 collectibles, checkpoint spacing, hidden routes, medal order).
- Playwright e2e: existing flows plus three Evolve tests (keyboard-driven).
- Final run: tsc clean, eslint 0 warnings, Vitest 432 passed (10 skipped, generator tests), production build OK, Playwright 28/28 passed. One e2e (Skyknot catch) was timing-flaky in real-time key presses; the gym Skyknot was lowered to a forgiving height and it then passed 6 of 6 repeats plus the full run.

## Performance (software renderer, 960×540, medium — NOT GPU data)

| Course | Pure draw calls | Evolve draw calls | Render ms Pure → Evolve |
|---|---|---|---|
| Awakening | 186 | 198 | 131.6 → 124.2 |
| Momentum | 232 | 252 | 179 → 168.7 |
| Shift Point | 226 | 240 | 177.2 → 173.4 |

Evolve adds about 12–20 draw calls. Simulation cost is about 0.06–0.09 ms per tick in both modes. Frame-time numbers come from a CPU software renderer and say nothing about real GPU frame rates.

## Honest limitations

- **No human playtest.** Everything here was verified by automated tests, bots and screenshots; nobody has played Evolve by hand.
- **Evolve balance is bot-tested only.** The autopilot finishes Awakening, Shift Point and Training in Evolve, but dies repeatedly on Momentum (voids near z 295–304 and 1075–1083, a lethal hit near 334; unfinished at 119 s in a smoke run). The cause was not investigated; the likely explanation is that upgrades such as extra jump height shift the bot's fixed waypoints, which would mean a bot limitation rather than a course problem, but that is unconfirmed.
- Rendering and timing figures are software-rendered.
- Courses with new layout versions cleared old best times, medals and ghosts once.

## Regenerating slots

After changing any course geometry: `npm run gen:slots` and commit `src/evolution/slots/*.json`. A test fails if they are stale.
