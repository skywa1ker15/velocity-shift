# Power-up, movement evolution & destructible world overhaul: report

Branch `development/phase-2`, released to `main`.

- Audit and plan: [AUDIT.md](AUDIT.md).
- Every number below comes from the deterministic simulation (`tests/sim/measure.ts`, `tests/sim/overhaul.test.ts`) or from a real browser (Playwright, software renderer).
- **No human has played this build.** The changes are tested by scripted inputs, the autopilot and real-keyboard browser tests. They have not been tested by a person playing.

## What was wrong (summary of the audit)

- Level 1 of almost every upgrade changed things by about 5%. Sprint went from 11.0 to 11.6 m/s, and a jump from 1.48 to 1.6 m.
- New behaviours arrived at level 2–4 of a single ability.
- A run gave 3–9 upgrades, with 25–40 s gaps between them.
- Glints were worth 4% of a meter that turned into nothing until it overflowed.
- Courses carried 12–21 breakables each, about one every 60 m. Cutting them gave no reward and no movement.

## What changed

### 1. Every level is a felt change, and every major ability evolves

Same scripted inputs, same flat test course; "Lv 1" is one pickup.

| Measure                                            | No upgrades | Lv 1     | Lv 2                 | Max                         |
| -------------------------------------------------- | ----------- | -------- | -------------------- | --------------------------- |
| Top sprint speed (Stride)                          | 11.0 m/s    | 12.6 m/s | 15.0 m/s (Overdrive) | 15.5 m/s                    |
| Time to 11 m/s from a stand (Stride)               | 0.68 s      | 0.47 s   | 0.43 s               | 0.40 s                      |
| Slide distance from a sprint (Glide)               | 10.0 m      | 26.8 m   | 33.7 m               | 109 m (Kinetic Slide held)  |
| Slide-jump distance (Glide)                        | 5.4 m       | 8.1 m    | 14.0 m (Slingshot)   | 19.3 m                      |
| Standing jump height (Spring)                      | 1.48 m      | 2.21 m   | 2.33 m               | 2.54 m                      |
| Height with every air jump (Spring)                | 2.73 m      | 3.91 m   | 6.02 m (Triple Jump) | 6.73 m                      |
| Dash: extra distance over running (Phase)          | 2.72 m      | 4.30 m   | 4.75 m               | 5.43 m                      |
| Six dashes back to back, gain over running (Phase) | 7.7 m       | 16.5 m   | 22.7 m               | 26.1 m                      |
| Wall-run time (Wallrunner)                         | 1.38 s      | 2.09 s   | 2.25 s               | 3.37 s                      |
| Wall-run distance (Wallrunner)                     | 14.4 m      | 21.3 m   | 22.7 m               | 60.9 m (Grip + Wall Sprint) |

Each ability's stages:

| Ability    | Lv 1                                               | Lv 2                                                  | Lv 3                                                                   | Lv 4                                                                     |
| ---------- | -------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Stride     | +1.6 m/s, faster run-up                            | **Overdrive**: +2 m/s after 1 s of sprinting          | **Momentum Lock**: extra speed is held for 1.6 s after any move        | **Slipstream**: above 15 m/s, smashing through objects pushes you faster |
| Glide      | Slides twice as long, +2 m/s kick                  | **Slingshot**: a charged slide-jump launch            | **Kinetic Slide**: a held slide speeds up for 1.3 s and charges Flux   | **Skim**: landing into a slide gives a +2.5 m/s kick                     |
| Spring     | Jumps 50% higher                                   | **Triple Jump**                                       | **Air Burst**: air jumps throw you toward the direction you hold       | **Hover**                                                                |
| Phase Dash | A third further, 30% faster recharge               | **Dash Jump** and a third charge                      | **Phase**: pass through lethal beams                                   | **Blink Chain**: a dash that breaks something refunds its charge         |
| Wallrunner | Wall-runs about twice as long                      | **Wall Surge**                                        | **Grip**: no sagging                                                   | **Wall Sprint**: wall-runs accelerate                                    |
| Flywheel   | Extra speed fades at half the rate; ceiling +4 m/s | **Conservation**: a drop becomes forward speed        | **Inertia**: dashes end at 70% of dash speed                           | –                                                                        |
| Edge       | Swings 25% faster                                  | **Crescent** wave                                     | **Skyward Cut**: a hit in the air lifts you and gives back an air jump | –                                                                        |
| Reach      | +0.7 m reach                                       | **Wide Arc**: a hit also cuts everything within 2.5 m | **Arc Chain**: a cut leaps to the next object ahead (up to 8 m, twice) | –                                                                        |

The other abilities are kept, with bigger numbers: Severance (level 2 now refills a dash), Siphon, Aegis, Reflex, Steady, Timeslip and Magnet. The mythics (Overclock, Mirror Edge, Chrono Heart) are unchanged.

Behaviour that is not about levels:

- **Stacking:** within a family, an ability you already own is three times as likely to be picked, so runs reach evolutions instead of spreading thin.
- **Caps and diminishing returns:** these still apply to every numeric table, and the test checks them.
- **Sword at speed:** swings quicken and the blade's reach leads with your speed. In the test, a cut started anywhere from 4 to 8 m out lands at 30 m/s.
- **Momentum when blocked:** pushes against a wall, a cut or a landing never stop you. The sword never touches your velocity.

### 2. Synergies that change how you move

| Synergy        | Needs                   | Effect                                                           |
| -------------- | ----------------------- | ---------------------------------------------------------------- |
| Phantom Cut    | Phase 1 + Edge 1        | Dash through anything breakable and it is cut                    |
| Tempest        | Stride 2 + Edge 1       | Every cut above 13 m/s pushes you forward (at most 4 a second)   |
| Comet          | Glide 2 + Spring 1      | Slide-jumps launch 40% harder                                    |
| Skybreaker     | Spring 2 + Phase 1      | Steep air dashes; slide in the air to slam down with a shockwave |
| Railgun        | Glide 1 + Flywheel 1    | Slides above 15 m/s do not slow at all                           |
| Ricochet       | Wallrunner 2 + Phase 1  | Every wall jump refunds a dash                                   |
| Updraft        | Spring 1 + Flywheel 1   | Jumping at high speed turns speed into height                    |
| Dynamo         | Wallrunner 1 + Siphon 1 | Wall-running charges Flux and your dash                          |
| Guardian Tempo | Aegis 1 + Reflex 1      | A broken shield slows time and recharges faster                  |

### 3. Progression and collectibles

- **Flux evolves you.** A full meter (100) is an upgrade, and the meter starts again. The family is weighted toward what you have been doing over the last ~20 s.
- **Flux sources:**
  - each Glint gives 8 (was 4);
  - every cut gives 5 plus Siphon;
  - slashables give more;
  - the Kinetic Chain multiplies Flux up to ×3.
- **Pickup density:** uncommon pickups are 1.7× denser (one per 36 m instead of 62), and Glint strings appear once every 30 m instead of 42.
- **Placement:** collectibles keep 2.5 m clear of the slashable world.

Upgrade pacing measured with the autopilot in Evolve (seed 12345, slashing on):

| Course      | First upgrade                  | Upgrades in the run | Stage reached |
| ----------- | ------------------------------ | ------------------- | ------------- |
| Training    | 36 s (the gym starts at 360 m) | 11                  | 2             |
| Awakening   | 4 s                            | 19                  | 4             |
| Verticality | 1 s                            | 3 (bot died early)  | 1             |
| Momentum    | 2 s                            | 29                  | 4             |
| Breakpoint  | 9 s                            | 14                  | 3             |
| Ink Falls   | 3 s                            | 20                  | 4             |
| Faceted     | 16 s                           | 9                   | 2             |
| Blockfall   | 3 s                            | 20                  | 4             |
| Core        | 5 s                            | 10                  | 2             |
| Shift Point | 14 s                           | 11                  | 2             |

Before the overhaul: 3–9 upgrades per run, with first-upgrade gaps of up to 30 s.

### 4. The slashable world

There are six new original object kinds. Each comes apart differently and does something different in Evolve.

| Object          | Look                                                     | Comes apart                        | Evolve reward                                                                   |
| --------------- | -------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| Kinetic Prism   | Floating charged-glass bipyramid with a glowing collar   | Shatters                           | Forward burst (+3 m/s, +4.5 above 15 m/s)                                       |
| Drift Lantern   | Hexagonal cage around a hot core, floating beside a jump | Drifts apart and burns out         | In the air: a lift and an air jump back                                         |
| Flux Bloom      | Energy flower, five glass petals around a charged bulb   | Bursts into drifting light         | +20 Flux                                                                        |
| Chain Spindle   | Tall needle threaded with glowing rings, in gates of 3–4 | Splits                             | Clear a whole gate within 4 s for a speed burst, full dash charges and +20 Flux |
| Hollow Sentinel | Empty construct with a visor slit                        | Collapses (top slides off the cut) | Nothing extra, but it counts twice toward the chain                             |
| Rift Seal       | Ring of eight segments holding a disc of folded space    | Bursts                             | An energy wave that cuts everything within 7 m                                  |

**Placement**

- Objects are placed by a seeded spawner (`src/gameplay/slashables.ts`) from each course's reference line, in designed patterns:
  - spindle gates on straights;
  - lanterns up beside jumps;
  - blooms beside or just before slides;
  - prisms along fast stretches;
  - a seal with sentinels around it in open ground;
  - lone sentinels.
- Every object is checked:
  - clear of geometry;
  - standing kinds on a floor;
  - away from hazards, checkpoints, the finish, moving terrain and existing objects.
- Training gets one of each, hand-placed on its last plaza.

**Breakables per course (original → now)**

| Course      | Original | Now |
| ----------- | -------- | --- |
| Training    | 13       | 22  |
| Awakening   | 14       | 42  |
| Verticality | 12       | 30  |
| Momentum    | 16       | 45  |
| Breakpoint  | 17       | 35  |
| Ink Falls   | 21       | 45  |
| Faceted     | 12       | 18  |
| Blockfall   | 12       | 34  |
| Core        | 13       | 26  |
| Shift Point | 17       | 44  |

Faceted and Verticality get fewer because much of their line runs on rotated gravity or vertical walls, where the spawner does not place objects yet.

**Same world in both modes**

- Pure gets the same objects to cut, with no rewards.
- Pure physics, reference times, medals and ghosts are unchanged. The suite checks that cutting everything never changes a Pure run's time or route.
- Running the line without the sword touches none of the new objects.

### 5. Kinetic Chain (slashing while moving)

- Every cut, slashable and non-Glint pickup within 2.5 s of the last adds a link. Glints keep a chain alive.
- **Flux multiplier:** ×1 rising to ×3 at 10 links.
- **Milestones** come every 5 links, in this order:
  - **Kinetic Burst**: +2.5 m/s and a short Momentum Lock;
  - **Recharge**: full dash charges and an air jump back;
  - **Overcharge**: +20 Flux.
- The chain breaks after its window and on a respawn.

### 6. Control is never taken away

Stronger movement must not stop a player making the plain move. These pushes only fire while you hold sprint and forward:

- Wall Surge;
- Steady;
- Conservation;
- Updraft;
- Slipstream;
- slide-jump kicks.

Let go and every move is the original one again. Two more rules:

- Air Burst needs a held direction.
- A tapped jump with Spring 4 is no higher than a held plain jump.

Momentum Lock never stops you braking. Wall jumps no longer push you further out from the wall: that automatic change broke designed wall-to-platform landings.

### 7. Feedback and HUD

**Ability rail**

- Evolution levels are diamonds in the level pips.
- The latest stage name sits beside the glyph, for example "OVERDRIVE" or "KINETIC SLIDE".
- Synergies are packed into one wrapped row.

**Meters**

- A Kinetic Chain readout (length, ×multiplier, draining timer).
- A LOCK tag while Momentum Lock holds your speed.
- "Longest chain" on the results card.

**Callouts**

- Named callouts only for the rarer, deliberate moves: Slingshot, Wall Surge, Dash Jump, Skyward Cut, Blink, Skim, Lift, Gate Cleared or Gate Missed, and chain milestones.
- Evolutions get a stronger flash and sound than plain levels.

**Audio and visuals tied to capability**

- Sounds: a whoosh for pushes (bigger for big ones) and a chain blip that climbs in pitch.
- Speed streaks pour past the view while Overdrive or Momentum Lock is holding your speed.
- Slash arcs grow with the blade's real reach.
- The existing stage glow and Flow wisps are kept.

### 8. Performance

Software renderer (SwiftShader), 960×540, medium preset. These are not GPU numbers.

| Course      | Draw calls before (Pure / Evolve) | Draw calls now (Pure / Evolve) | Sim ms per tick now (Pure / Evolve) |
| ----------- | --------------------------------- | ------------------------------ | ----------------------------------- |
| Awakening   | 186 / 198                         | 181 / 195                      | 0.06 / 0.07                         |
| Momentum    | 232 / 252                         | 221 / 235                      | 0.06 / 0.07                         |
| Shift Point | 226 / 240                         | 205 / 215                      | 0.15 / 0.09                         |

- The 2–3× larger slashable world would have added about 45 draw calls.
- Objects more than 110 m from the eye are no longer drawn, so draw calls end slightly below where they started.
- Software frame times were 135–195 ms both before and after, which is within run-to-run noise.

## Tests

**Vitest:** 471 passed (10 skipped generator tests).

`tests/sim/overhaul.test.ts` (39 tests) covers:

- each first level's measured change;
- every evolution stage;
- four synergies (Tempest, Comet, Ricochet, Railgun; the rest are covered in `tests/sim/evolution.test.ts`);
- each slashable kind's reward;
- chain build, payout, break and respawn;
- usage-weighted Flux upgrades;
- stacking toward stages;
- Flux with everything maxed;
- the Tempest rate limit;
- a slash landing at 30 m/s;
- control (sprint gating, tapped jumps, braking under Momentum Lock);
- Pure untouched.

`tests/sim/breakables.test.ts` now runs on the courses with their slashable world:

- nothing inside geometry;
- standing objects on floors;
- clear of hazards and checkpoints;
- slashing never changes a Pure run;
- the blade can take at least 60% of objects from the line;
- the line without the sword touches none of the new ones.

**Playwright:** 29 of 29 in the final full run, including one new real-keyboard test that also passed 10 of 10 repeats. In it, an Evolve runner with Crescent holds W and taps F down Training's last plaza. It must cut the whole Spindle gate, clear it, build a chain, and never drop below 6 m/s. Earlier versions of this test without an evolved blade missed a spindle about one run in six.

**Also checked:**

- tsc;
- eslint (0 warnings);
- prettier;
- production build;
- slot files regenerated (only Training's changed).

## Known limitations (read these)

**No human playtest.** Whether the changes feel strong enough, or too strong, has not been judged by a person.

**The autopilot cannot play every upgraded build.** It follows fixed waypoints tuned for Pure physics. In a sweep run during development (not kept as a test, 11 builds × 9 courses), each single ability was granted at the start of a run and the bot was left to play:

- **Fine:** Phase Dash at any level, and Glide/Stride on most courses.
- **Most failures:** Spring (higher jumps), Wallrunner 4 and Flywheel 3. These carry the fixed-plan bot past landings, mainly on Verticality, Momentum, Faceted and Core.
- A full Evolve run with slashing finished on Training, Faceted, Blockfall and Core, and died or stalled on the others.
- In one case (Shift Point at z ≈ 531) the bot stalls below a ledge it overshot. A player can restart from the checkpoint there.
- The controls above guarantee that a player can always make the original move. They do not prove the upgraded build is comfortable on every section. That needs human play.

**Jump height may make some sections easier.** Spring 1 raises jumps from 1.48 m to 2.21 m, which may shortcut some climbing on Verticality and Shift Point. It is not checked.

**Rotated gravity gets no new objects.** The spawner only places objects on upright parts of the line. On Faceted, Blockfall's turnovers and Shift Point's rolled sections, these stretches get no new objects.

**Performance is not measured on a GPU.**

## Evidence

| File                            | What it shows                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `baseline-momentum.webp`        | Before the overhaul (Evolve, Momentum)                                                                 |
| `slashable-world-training.webp` | One of each new object on Training's last plaza                                                        |
| `gate-run-chain-hud.webp`       | Running a spindle gate on Awakening: chain ×2.2 on the HUD, a prism being cut, stage names on the rail |
| `after-gate-hud.webp`           | HUD after the gate run                                                                                 |
| `late-build-rail.webp`          | A stage-4 build on Momentum: rail with stage names, packed synergies                                   |
| `momentum-before-after.webp`    | Momentum before and after, side by side                                                                |
