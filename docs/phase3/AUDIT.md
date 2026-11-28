# Phase 3 audit and plan

Measured on commit `9eb8b47`.

## Architecture (what is reused)

**Engine**
- three.js rendering and Rapier character physics.
- A deterministic 120 Hz simulation (`Simulation`) and a zustand/React HUD.
- Pure is the original game: medals, ghosts and the reference runs come from it. Evolve layers `Evolution` over it.

**Courses** (`src/levels/data/*`)
- Built with `LevelBuilder` from static solids, decor, entities, checkpoints, triggers, breakables and a bot line.
- Entity types:
  - mover, rotator, collapse, blink, hazard;
  - boost, jump pad, gravity volume, impulse;
  - gravity field (dir, well, spin, structure, pipe);
  - structure (a scripted rigid group with telegraph and fall).
- Entities can wait for a level event (`on`). Triggers and breakables (`fires`) raise events.
- Colliders can be switched off (`PhysicsWorld.setEnabled`), and entities have `visible`. Together these support entities that exist only in some variants.

**Gravity frames**
- Rotated-world traversal already exists and is fully coordinated: movement, camera, sword and collision all follow the frame. New world transformations reuse it.

**Progression**
- Evolve already has 18 abilities in stages, synergies, Flux (a full meter is an upgrade), the Kinetic Chain, and a seeded slashable world.

## Current playable length (autopilot reference run, Pure)

| Course | Distance | Time |
|---|---|---|
| Training | 730 m | 69.5 s |
| Awakening | 865 m | 75.7 s |
| Verticality | 718 m | 74.3 s |
| Momentum | 1164 m | 86.9 s |
| Breakpoint | 861 m | 58.2 s |
| Ink Falls | 833 m | 71.4 s |
| Faceted | 601 m | 55.3 s |
| Blockfall | 663 m | 59.3 s |
| Core | 742 m | 58.6 s |
| Shift Point | 1123 m | 85.9 s |

## Difficulty

There is no runtime difficulty system. Difficulty is authored per course. The only performance-reactive system is Evolve's Flow meter, which affects speed slightly.

## Sprint

- A `sprint` action exists (Left Shift).
- The default `sprintMode` is `auto`, so every player runs at sprint pace (11 m/s) all the time. Shift does nothing.
- Every course gap is tuned for 11 m/s, and the autopilot always sprints.

**Plan**
- 11 m/s becomes the base running pace, unchanged for every existing course.
- Shift becomes a real sprint above it: +3 m/s, drawing stamina.
- The sprint setting (hold or toggle) applies to the new sprint.
- No gap anywhere requires the new sprint. It is speed and route choice only.

## Power-ups

**Permanent for the run:** the abilities and synergies.

**Temporary effects that exist today:**

| Effect | Duration |
|---|---|
| Surge (Timeslip) | 2.5–3.4 s, ×1.5 with Chrono Heart |
| Reflex slow | 0.7 s |
| Momentum Lock | 1.6 s, or 1–1.2 s from a Dash Jump, Kinetic Burst or gate |
| Aegis invulnerability after a save | 1 s |
| Hover | up to 1.2 s of air |
| Kinetic Chain window | 2.5–3.5 s |
| Echo Chain window | 4 s |
| Overdrive | while sprinting after 1 s |

Only Surge, Reflex and Echo have HUD timers today. Collectibles have distinct shapes and rarity colours but no beacon, so they read as decoration at speed.

## Flickering horizontal rows

**Found**
- `SpeedLines` (src/fx/Fx.ts): a full-screen shader that redraws 120 radial streak slots at 12 frames per second. Random slots switch on and off each frame.
  - In the voxel universe the streaks are quantised into screen blocks.
  - At running speed they read as rows of flickering bars rushing toward the player, on every course and in both modes.
- `Streaks`: 90 world-space slivers that wrap around the camera and stretch along travel.
- The Overdrive/Lock sticker streaks added in the last release, which add more strips flying past.
- The Corrupt glitch bars were already removed in the previous expansion.

**Plan**
- Delete `SpeedLines` and `Streaks` and their wiring, plus the sticker streaks.
- Speed is conveyed by what stays: FOV widening, camera, the steady stage glow and Flow wisps, and a new steady (never flickering) speed vignette.
- A regression test checks that none of these can be constructed again.

## Performance risks

- Draw calls: 181–235 on the measured courses.
- Doubling course length adds geometry. Culling far breakables already helps. New sections reuse kit pieces, and far decor stays cheap.
- New destructibles reuse the convex-part destruction pool (at most 28 live pieces).

## Plan (in build order)

1. Remove the flicker sources (above).
2. Sprint and stamina in both modes, with the Endurance ability, a HUD bar and audio. Pure medals recalibrated; bests reset by layout bumps.
3. A section library (`src/levels/sections`): parameterised building blocks with their own bot lines, Director tiers and telegraphed events. Each course grows about 2× by composing sections in its own theme and in line with progression:
   - Levels 1–2: fundamentals only.
   - Level 3: rotating world.
   - Level 6 onward: directional and multi-axis turns.
4. The Difficulty Director: eight independent dimensions computed from distance, speed, upgrades, sprint capability, chain, deaths and recent history. Each section encounter is set to a tier before the player can see it, with caps, cooldowns, recovery after hard sections, and minimum reaction windows. Higher tiers only add optional routes, things the line already avoids, or faster telegraphed cycles, never a required ability. Tests run every course at the lowest and the highest tier.
5. New destructibles and mechanisms:
   - glass walls;
   - energy cores (temporary Overcharge);
   - conduits that switch off laser gates;
   - mechanical locks that open shortcuts;
   - chains that drop bridges;
   - switches;
   - target clusters.
6. Power-up beacons and silhouettes, collection feedback, and an active-effects panel that shows every real temporary effect with its countdown.
7. Integration: slot regeneration, medal recalibration, full test suites, and browser captures in both modes.
