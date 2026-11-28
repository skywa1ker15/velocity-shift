# Power-up, movement evolution & destructible world overhaul: audit and plan

Measured on commit `1193388`. All numbers come from the deterministic simulation (`tests/sim/measure.ts`, `tests/sim/zz-audit` runs). None of them come from human play.

## Why the power-ups feel weak

### 1. Level 1 of almost anything is a 4–5% change

These are measured on a flat test course, with scripted inputs. "Owned" means the levels a bot actually collected in a whole run.

| Measure                           | No upgrades | After 1 level  | Level owned at the end of a typical run | Maxed                                    |
| --------------------------------- | ----------- | -------------- | --------------------------------------- | ---------------------------------------- |
| Top sprint speed                  | 11.0 m/s    | 11.6 m/s (+5%) | Stride 0–1                              | 14.2 m/s (Stride 5, including Overdrive) |
| Standing jump height              | 1.48 m      | ~1.6 m         | Spring 1–4                              | 1.94 m (Spring 5)                        |
| Slide distance from a sprint      | 10.0 m      | ~11 m          | Glide 0–1                               | 17.0 m (Glide 5)                         |
| Dash: extra distance over running | 2.7 m       | ~2.9 m         | Phase 0                                 | 3.3 m (Phase 5)                          |
| Wall-run time                     | 1.38 s      | ~1.5 s         | Wallrunner 0–4                          | 1.98 s (Wallrunner 4)                    |

A human cannot feel a 5% change, and the first mechanic-changing evolution sits at level 2–4 of a single ability.

### 2. Too few upgrades per run, unevenly spread

Here is a bot run in Evolve (seed 12345) for every course. The bot never swings the sword, so it misses the sword-only pickups.

| Course      | Upgrades in the whole run      | First upgrade             |
| ----------- | ------------------------------ | ------------------------- |
| Training    | 6 (hand-placed gym)            | 38 s                      |
| Awakening   | 6 (Spring ×2, Wallrunner ×4)   | 6 s, then none until 30 s |
| Verticality | 8                              | 6 s, then 37 s            |
| Momentum    | 3                              | 4 s                       |
| Breakpoint  | 6                              | 5 s                       |
| Ink Falls   | 9                              | 9 s                       |
| Faceted     | 3                              | 16 s                      |
| Blockfall   | 8                              | 4 s                       |
| Core        | 4 (none after 10 s until 52 s) | 5 s                       |
| Shift Point | 4                              | 30 s                      |

Over a 55–90 s run the player gets 3–9 upgrades, and there are long gaps of 25–40 s with nothing. The air and wall families each grant a single ability (Spring, Wallrunner), so most runs pile into those two. Stride, Phase and Edge almost never appear.

### 3. Glints and Flux do nothing early

- A Glint is worth 4 Flux out of 100.
- Flux only becomes an upgrade after the meter is full and another 60 overflows. That is about 40 Glints, more than most courses hold.
- Until then, Flux is only spent on Surge, which needs the Timeslip ability first.

### 4. The sword is barely part of progression

- Courses carry 12–21 breakables over 600–1100 m, about one every 55–75 m. Most are columns and relics standing to the side of the line.
- In Evolve a cut gives Flow points, plus Flux only with Siphon. It never moves the runner.
- Slashing never interrupts movement, which is good. But there is no momentum, chain or traversal reward for doing it.
- Combat upgrades come only from Fracture Glyphs: one or two per course, and only if you swing at them.

### 5. The levels do not showcase upgrades

Collectibles sit on the reference line, so they are reachable. But nothing after a pickup asks you to use the new capability. Upgrades also bend the fixed-waypoint bot: in Evolve it now dies on Awakening, Verticality and Momentum.

### 6. Feedback is small

- Ability rail glyphs, a stage glow on the hands and a callout.
- No movement trails that grow with build strength.
- No sword energy by level.
- Evolutions get the same callout as a +0.3 m/s level.

## Root causes, in order

1. Each level's effect is too small, and new behaviours arrive too late.
2. There are too few upgrade events per minute, with long dead stretches.
3. Flux and slashing are not wired into progression.
4. There are not enough slashable objects, and they have no movement-linked rewards.
5. There is no chain or skill loop that combines movement and slashing.

## Plan

**Every ability has 3–4 stages, and every stage changes behaviour.**

- **Stride:**
  - Stage 1 gives +1.6 m/s and faster acceleration.
  - Stage 2 unlocks Overdrive.
  - Stage 3 unlocks Momentum Lock: speed above sprint does not bleed off for a while after a jump, slide, vault or wall-run.
  - Stage 4 unlocks Slipstream: at high speed you smash through objects for Flux and speed.
- **Glide (slide):**
  - Stage 1 gives a long slide.
  - Stage 2 unlocks Slingshot (charged slide-jump).
  - Stage 3 unlocks Kinetic Slide: a held slide gains speed.
  - Stage 4 unlocks Skim: landing with slide held re-slides with a boost.
- **Spring (jump):**
  - Stage 1 gives much higher jumps.
  - Stage 2 unlocks the triple jump.
  - Stage 3 unlocks Air Burst: air jumps throw you toward the direction you hold.
  - Stage 4 unlocks Hover.
- **Phase Dash:**
  - Stage 1 gives a much faster dash with quicker recharge.
  - Stage 2 unlocks a third charge and Dash Jump (a jump straight out of a dash keeps the dash speed).
  - Stage 3 unlocks Phase (pass through lethal beams).
  - Stage 4 unlocks Blink Chain: a dash that breaks something refunds its charge.
- **Wallrunner:**
  - Stage 1 gives much longer runs.
  - Stage 2 unlocks Wall Surge.
  - Stage 3 unlocks Grip: no sag, and wall-runs accelerate.
  - Stage 4 unlocks Rebound: wall jumps refund a dash.
- **Flywheel (momentum):** a slower bleed-off of extra speed, a higher speed cap, and Conservation (fall speed becomes forward speed on landing).
- **Sword:**
  - **Edge:** faster swings, then Crescent, then Momentum Edge (cuts at speed push you forward).
  - **Reach:** longer blade, then Wide Arc, then Arc Chain (a cut leaps to the next object).
  - Siphon and Severance are kept, with bigger numbers.

**Pacing**

- Flux fills to an upgrade every 100 points, and the meter resets.
- Glints, slashes and chains feed it.
- Uncommon pickups are about 1.7× denser.
- Picks favour abilities you already own, so stages are actually reached.
- Target: a first upgrade inside 20 s, and 12–20 upgrades per run.

**Kinetic Chain**

- Each cut or pickup within 2.5 s of the last raises a chain multiplier (×1 to ×4) on Flux.
- Milestones in the chain give speed, a dash charge, and an air-jump refund.

**Slashable world**

- Six new original object kinds, each with its own destruction and reward:
  - Kinetic Prism: a forward burst.
  - Drift Lantern: an air lift and an air-jump refund.
  - Flux Bloom: Flux.
  - Chain Spindle: a sequence target.
  - Hollow Sentinel: none, satisfying to break.
  - Rift Seal: an energy burst that breaks objects nearby.
- They are placed by a seeded spawner on the reference line, in intentional patterns:
  - spindle gates on straights;
  - lanterns over gaps;
  - prisms before fast stretches;
  - blooms in slide passages;
  - sentinels in open running.
- The spawner keeps clear of checkpoints, other objects and hazards.
- Objects appear in both modes, but rewards apply only in Evolve, so Pure physics and medals stay identical.

**Visual and HUD**

- Speed trails and sword energy scale with the build.
- An evolution moment: a brief banner, a sound and a flash.
- A chain counter on the HUD.

**Testing**

- A measured before/after table for every movement stat.
- A test for every stage of every ability, every new object kind and the chain rules.
- Every course run in both modes.
- Full suite, screenshots, perf.
