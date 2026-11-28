# Phase 4: rank, blade score and where to improve

Brief: the five-objective gameplay overhaul. Audit result: objectives 1–4 (power-ups, varied environments, sword objects, long structured courses) and the medals, personal bests, splits, ghosts, shards, optional objectives and hidden routes of objective 5 were built in earlier phases. This phase fills what was missing from the replayability list: performance ratings, combo and sword-interaction scores, movement-efficiency feedback and mastery challenges.

## What was added

- `src/progression/Rating.ts`: a pure rating function (Pace 300, Blade 200, Flow 200, Clean 150, Extras 150 points). Grades D, C, B, A at 780 and S at 900. Each part has a tip; the two weakest are shown.
- `Simulation`: `bestCombo`, `airCuts`, `wallCuts`, `cutPoints` in `RunStats`. Combo window 1.6 s; chain bonus +25% per link (max 8), air +35%, wall-run +50%; the combo resets on respawn.
- Save: `bestScore` and `bestCombo` per course (clamped, defaults for old saves, reset with a layout bump).
- Results screen: grade badge, score, part bars, tips and a blade line. Level cards show the rank.
- Four achievements: Chain Blade, Skyline Cut, Perfect Form, Consistent.

## Tests

- `tests/sim/rating.test.ts` (9): combos chain inside the window and break after it; body smashes score a fifth and never chain; air and wall cuts count and pay more; a respawn resets the chain; the rating is deterministic and bounded; S and D extremes; each part moves the score the right way; thresholds.
- `tests/unit/save.test.ts`: rating fields clamped; old saves load unrated.
- `tests/e2e/game.spec.ts`: the results screen shows a grade, five parts and "/ 1000".

## Observed

`results-rating.webp` is the real results screen from the production build, after a Training run in which the player was teleported to just before the finish. Its 0.49 s time and the high Pace are therefore an artefact of the teleport, not a result of play.

## Limits

- Nobody has hand-played this build. The weights and grade thresholds are first-pass numbers: whether S is reachable and A is fair needs real runs. The unit tests show the scale behaves in the right direction, nothing more.
- The bot never cuts on its own line, so no automated run reports blade points. Blade scoring was tested by cutting objects directly in the simulation.
- Software-rendered browser only; nothing here says anything about GPU frame rate.
