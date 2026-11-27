# Gameplay Expansion & Evolution: Phase 1 plan

## What exists (inspected)

| System | Where | Notes for the expansion |
|---|---|---|
| Movement | `movement/MovementController.ts` (state machine, 120 Hz) | Every tunable is a single shared `movementConfig`. **Upgrades need per-player tuning** layered over it. |
| Gravity / dynamic world | `gameplay/Gravity.ts`, `entities/Entities.ts` | Fields, structures, collapses and movers run on the level clock. |
| Sword | `gameplay/Sword.ts` | Five slashes, combo, a blade sweep against breakables. Constants are global, so **attack speed and reach need modifiers**. |
| Simulation | `gameplay/Simulation.ts` | Deterministic and headless. Tests and the autopilot drive it, and reference runs and medals depend on it being exact. |
| Breakables | `gameplay/breakables.ts`, `render/BreakableView.ts` | Sword cuts and body smashes, with `fires` events. |
| Effects | `fx/Fx.ts` (speed lines, stickers, streaks, motes), `fx/SlashFx.ts`, `render/UniversePost.ts`, `multiverse/surface.ts` | Each universe has its own look. **The flicker lives here.** |
| HUD and UI | `ui/Hud.tsx`, `app/store.ts` (zustand) | Top rail, corners, toasts, callouts; nothing in the bottom-centre hand zone. |
| Progression and saves | `progression/Progression.ts`, `save/SaveSystem.ts` | Medals, objectives, achievements, layout versions, ghosts. |
| Levels | `levels/data/*.ts`, `levels/registry.ts` | Ten courses plus helpers (profile, tubes). Autopilot lines, reference runs and progression tests. |

## Decisions (confirmed with you)

- **The flickering blocks** are the Corrupt universe's glitch effects, which you picked as option A:
  - the edge-tearing glitch bars drawn by the speed lines;
  - the continuous screen glitch (rows and blocks jumping sideways 11 times a second);
  - the flickering byte columns, moving horizontal tears, shimmer and jitter on Corrupt surfaces.

  All three are removed, with nothing replacing them. Corrupt keeps its look through static rendering. Universe-switch transitions are kept.
- **Length:** every course reaches about **2× its original running length**, measured along the main line.

  | Course | Original | Planned target | Measured now (reference run) | Ratio |
  |---|---|---|---|---|
  | Training | 354 m | 708 m | 730 m | 1.9× |
  | Awakening | 407 m | 814 m | 865 m | 2.0× |
  | Verticality | 365 m | 730 m | 718 m | 1.8× |
  | Momentum | 567 m | 1134 m | 1164 m | 2.0× |
  | Ink Falls | 372 m | 744 m | 833 m | 2.1× |
  | Shift Point | 505 m | 1010 m | 1123 m | 2.1× |

  "Measured" is the distance the autopilot reference run travels (Pure); "Original" is the same measurement on the pre-expansion code (377, 437, 396, 589, 399, 530 m), so ratios are 1.9–2.1× (Verticality 1.8×) on like-for-like numbers. Reference times: Training 34.4→69.5 s, Awakening 38.7→75.7 s, Verticality 41.8→74.3 s, Momentum 44.8→86.9 s, Ink Falls 34.4→71.4 s, Shift Point 43.5→85.9 s.

  Breakpoint, Faceted, Blockfall and Core are already 2.2–2.9× their original length.
- **Upgrades last one level run.** You start fresh, evolve during the run, and keep everything through checkpoint respawns.
- **Two modes:**
  - **Evolve** (the default): collectibles and upgrades are on.
  - **Pure**: the game as it is today. Medals, ghosts and reference runs come from Pure, so times stay comparable. Evolve keeps its own best time.

## Design

**Collectibles.** How you catch a collectible tells you what it gives.

| Collectible | Caught by | Gives |
|---|---|---|
| Glint (common) | Running through it; strings of them mark racing lines | Flux energy |
| Undertow (uncommon) | Sliding under it (hangs at hip height) | Ground abilities |
| Skyknot (uncommon) | Touching it in the air | Air abilities |
| Rift Mote (uncommon) | Dashing through it | Dash and momentum abilities |
| Fracture Glyph (uncommon) | A sword cut | Combat abilities |
| Wall Vein (uncommon) | Touching it while wall-running | Wall abilities |
| Echo Chain (rare) | Catching 4 nodes in turn, each appearing as you catch the last | A rare ability or a survival ability |
| Paradox Core (mythic) | Touching it at Flow tier 3 or higher; otherwise it phases out | A mythic ability |

Collectibles are placed by a seeded spawner along the course's main line, in controlled slots with rarity weights. It checks that every spot is reachable, and keeps them away from hazards, checkpoints and dynamic sections. Each run in Evolve uses a new seed.

**Abilities** (levels, thresholds, caps and diminishing returns):

- **Movement:**
  - **Stride:** speed and acceleration. Level 3 adds Overdrive.
  - **Glide:** slide distance and momentum. Level 3 adds the Charged Slide and its Slingshot launch.
  - **Spring:** jump height and timing. Level 2 adds a Triple Jump; level 5 adds Hover.
  - **Phase Dash:** dash speed, distance and recharge. Level 2 adds a charge; level 4 lets the dash pass through lethal beams.
  - **Wallrunner:** wall-run duration and wall-jump strength. Level 3 adds Wall Surge.
  - **Flywheel:** momentum retention and the speed cap.
- **Combat:**
  - **Edge:** attack speed. Level 3 adds a crescent wave.
  - **Reach:** blade range.
  - **Severance:** a combo finisher. Level 3 adds a shockwave.
  - **Siphon:** Flux from cuts.
- **Survival:**
  - **Aegis:** absorbs a lethal hit, then recharges. Level 3 also catches one fall into the void.
  - **Reflex:** slow motion just before a hazard would hit.
  - **Steady:** landing recovery. Level 2 adds the Shockwave Landing.
- **Special:**
  - **Timeslip:** the new Surge key spends Flux to slow the world while you keep full speed.
  - **Magnet:** draws Glints in.
- **Mythic** (Paradox Core only): Overclock, Mirror Edge, Chrono Heart.

**Flow** is momentum as a system. Varied movement actions chained within about 1.6 s build Flow through tiers 0–4. Flow raises speed and Flux gain and intensifies the visual trail, and it decays if you stall. Built-in links:
- jumping out of a slide launches you harder;
- wall-run speed carries into the wall jump;
- a slash straight after a dash extends the dash;
- landing at speed keeps your momentum;
- fast slides generate Flux.

**Synergies** (6, each announced when it activates):
- Phantom Cut (Phase Dash + Edge)
- Skybreaker (Spring + Phase Dash): an upward air dash and a ground slam
- Railgun (Glide + Flywheel)
- Dynamo (Wallrunner + Siphon)
- Updraft (Spring + Flywheel)
- Guardian Tempo (Aegis + Reflex)

**Visual evolution:**
- an evolution stage (0–4) from total ability levels drives glove glow, energy wisps and afterimages;
- trail intensity follows Flow;
- dash, slash, landing and wall effects scale with their ability levels;
- each synergy has its own burst.

The effects stay complementary and inexpensive, built on the existing effect systems.

**HUD:**
- a compact ability rail on the left edge, with level pips;
- a Flux meter and a Flow gauge on the top-right rail;
- timers for temporary effects;
- upgrade, synergy and rare-find callouts under the timer.

## Implementation order

1. **Phase 2:** remove the flicker, then extend Momentum, Ink Falls and Shift Point by inserting new sections before their finales, and extend Awakening and Verticality in their own identities. Recalibrate medals, re-run all course tests, and capture screenshots.
2. **Phase 3–5:**
   - per-player movement tuning and sword modifiers (Pure stays exact to the tick);
   - the evolution module (collectibles, spawner, abilities, Flow, synergies, Surge);
   - views, HUD and the mode setting.
3. Extend Training with stations that teach the new collection methods and Surge.
4. **Phase 6:** the full test suite, plus new simulation tests for every collection method, ability, threshold, cap and synergy; real-keyboard browser runs; screenshots; a performance check.
5. **Phase 7:** commit and push once, after everything is complete and tested.

## Risks

- **Determinism.** Any change to shared movement code could shift Pure reference runs. Upgrades are overlaid per player and are inert when absent, and tests assert that Pure is unchanged.
- **High-speed collision.** The character controller sweeps every move, and the speed cap stays below what a single tick can tunnel through. There are tests at the highest upgraded speeds.
- **Balance.** Upgrades could trivialise hazards. Phase Dash only passes lethal beams; collapses and the void still count. Reflex and Aegis have cooldowns, and caps plus diminishing returns limit stacking.
- **Clutter and performance.** Collectibles use instanced meshes (one draw call per kind), the number of spawn slots is capped, and nothing is spawned during play.
- **Scope.** This is very large. Every part will be tested before it is claimed.
