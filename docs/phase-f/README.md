# Phase F: course fairness, verified secrets and course rewards

Phase F does not add content. It checks the eight courses the way a player meets them, at
human paces and with imperfect timing, and fixes what that check found.

## Why this scope

Phase E left open questions: unverified hidden routes on the original courses, timed obstacles
tuned to the bot's exact clock, precision sections with no human-focused assessment, and no
per-course rewards. An unreachable secret or a frame-perfect obstacle is a fairness bug, and
fairness comes before polish. Profiling was not chosen: software GL cannot answer the RTX 2050
question, and the courses already draw fewer calls than the originals.

## Findings and fixes

| Finding | Evidence | Fix |
|---|---|---|
| **Momentum's blink tiles were frame-perfect below sprint pace.** 7 m/s: 0% of arrival times passed; 8 m/s: 5%, with a 0.13 s window. 7 m/s is the run speed with Sprint set to "hold" or "toggle", and while accelerating. | New per-pace sweep using the real `Blink` code (`tests/sim/hazards.test.ts`) | Tiles are solid 2.4 s (was 1.7) and the wave runs at 9 m/s, between run and sprint. Now **22% / 0.69 s at 7 m/s, 40% / 1.28 s at 8**, and 41% at sprint. The reference time is unchanged (44.79 s), so medals stay valid. |
| **Blockfall's stepping blocks failed a running jump taken 0.05 s early.** | Real-controller timing grid, −0.15 to +0.15 s, run and sprint | Blocks are 4.6 m deep (was 4 m), same centres, gaps 3.4–3.7 m. Running now passes from −0.05 to +0.15 s; sprinting passes from −0.15 to +0.15 s. It is still a precision section: a running jump 0.1 s early still fails. |
| **"Every Last One" said "Collect all 12 shards"** and unlocked at 12. There are now 27. | Code reading, new unit test | Derived from the level registry (`SHARD_COUNT`). Saves that already hold it keep it, because unlocks are never revoked. |
| **Verticality's hidden route was untested, and its comment was wrong** ("climb fast enough"). A fast climb drops onto the ledge. | New hidden-route test | It **is** reachable: land on the ledge, double jump onto the upper walls, kick three times, double jump onto the beam. The layout is kept, the comment is corrected, and a regression test is added. |
| **Momentum's hidden route was untested.** | New hidden-route test | Verified reachable: launch pad, rail, shard. |
| **Corrupted Core's crusher hall was only *assumed* fair** because it copies Momentum's timings. | Crusher sweep extended to Core | Verified: 24–51% per pace, windows of 0.71 s or more (Momentum: the same). |
| Faceted's blink wave was phased to the bot. | Per-pace sweep | Already fair: 24–55% per pace, windows of 0.88 s or more. No change. |
| The new courses had no rewards of their own. | — | 11 achievements: "finish" for each Phase E course, plus one feat per course tied to its identity (Breakpoint 5 vaults without dying; Ink Falls and Blockfall without dying; Faceted without dying in under 40 s; Core gold), and *Every World* for finishing all eight. |

New regression tests: the hidden routes of **all eight courses** (`tests/sim/hidden-routes.test.ts`),
blink fairness at 7–12 m/s on Momentum and Faceted, crusher fairness on Core, Blockfall's sloppy
timing (12 cases), and the achievement and shard-count rules.

## How it was verified, and what was not

**Automated (simulation):** the bot reference runs; the per-pace sweeps (every arrival time across a full
cycle, with the real entity code); timing grids that drive the real movement controller with early
and late inputs.

**Real game in a browser, real keyboard input (no autopilot, no debug stepping):** Playwright
holds W (and Shift), watches the player's position and presses Space. The game runs its normal
real-time frame loop, about 21–26 fps in software GL, so input is sampled once per rendered
frame. That is harsher than a real machine.

- Blockfall's stepping blocks at sprint pace: all four jumps landed (`real_keyboard_blockfall_jump.webp`).
- The same blocks at a true 7 m/s with Sprint set to "hold": landed (`real_keyboard_run_pace_landed.webp`).
- Running off a block without jumping respawns the player at the last checkpoint, z = 20 (`real_keyboard_fall_respawn.webp`).

**Real game, course completion:** Faceted and Breakpoint were finished in the browser (driven by the
autopilot), and the save was read back. The new achievements were unlocked and persisted. The
results screen shows gold and offers the next course (`results_*.webp`). The achievements screen
lists all 33 (`achievements_screen.webp`).

**Not done: human playtesting.** No person has played these changes. The keyboard checks are
scripted real input, not a human. Difficulty *feel*, readability of the blink wave, and how
discoverable the hidden routes are all still need a person.

## Test results

- Prettier, `tsc` and ESLint (0 warnings): clean.
- Vitest: **263 passed** in 18 files (was 236).
- Playwright e2e: **17 passed**.
- Production build: OK.

## Performance

No rendering code changed in Phase F. Geometry changed only slightly (three blocks 0.6 m deeper).
The Phase E software-GL figures stand (`docs/phase-e/perf_software_gl.txt`). **Real GPU
performance (RTX 2050) is still unmeasured**: this environment has no GPU.

## Remaining limitations

- Human playtesting.
- The new courses still reuse the existing music tracks.
- The sweeps model a constant pace. A real player who slows down or speeds up mid-section is covered
  only by the windows' margin.
- Hidden routes are proven reachable, but not proven discoverable.
