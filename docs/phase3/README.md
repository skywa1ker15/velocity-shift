# Phase 3: the world evolves with you — report

Plan and before-state: [AUDIT.md](AUDIT.md). Each item says what was **implemented**, what is **tested** (automated) and what was **observed** (screenshots of the real game in a headless Chromium using the SwiftShader software renderer). No hand-play by a person is claimed anywhere.

## 1. Systems inspected

- Simulation and determinism: `Simulation`, the 120 Hz tick, rearm and checkpoints.
- Level building: `LevelBuilder`, entity types, events (`on`, `fires`) and colliders that can be switched off.
- Rotated-world traversal: tubes, structures and gravity fields.
- Movement: `MovementController`, `movementConfig`, input and sprint modes.
- Evolve: abilities, evolutions, synergies, Flux, Flow, the Kinetic Chain and slots.
- Rendering: `LevelView`, `BreakableView`, `EvoView`, `UniversePost`, multiverse shaders, `Fx`.
- HUD and audio.
- Tests and the reference bot.

The audit found:

- no runtime difficulty system;
- a sprint key that did nothing, because sprint was automatic;
- the sources of the flickering rows (listed under 12).

## 2. New systems

- **Difficulty Director** (`src/gameplay/Director.ts`): eight dimensions and per-encounter tiers. See 6.
- **Section library** (`src/levels/sections.ts`, `Course`): thirteen parameterised sections. Each builds its own geometry, checkpoint, reference line, encounter and tiered variants.
- **Sprint and stamina** (both modes). See 8.
- **Active-effects panel** (Evolve). See 10.
- **Power-up beacons and halos.** See 9.
- **Mechanisms.** Level events can now switch entities off for an attempt (`off`), and they are restored on respawn. Invisible movers act as seals. A breakable can fire events (the glass seal, drawbridge chains, a laser gate's conduit).
- **New destructibles:** glass panes, energy cores, conduits, chains and motes.
- **Endurance** ability, **Redline** synergy and the **Overcharge** effect (Evolve).

## 3. Existing systems expanded

- `Simulation`:
  - entity and breakable presence;
  - Director tick and death hooks;
  - `off` events;
  - mechanism restore on rearm.
- `PhysicsWorld`: per-entity collider enable.
- `MovementController`:
  - sprint boost and stamina;
  - stamina events;
  - a fix for a wall-run that a spurious contact normal could end. This was found on Momentum's new section and is covered by the course runs.
- `Evolution`:
  - stamina scaling;
  - Overcharge;
  - rewards for the new kinds;
  - the `effects()` list;
  - Momentum Lock duration tracking.
- `Bot`: skips absent objects and mechanisms when slashing. The reference line itself never needs them.
- HUD (stamina bar, effects panel, source-labelled upgrade callouts), audio (sprint and stamina cues, effect end) and camera (sprint FOV kick).

## 4. Changes to every level

Every course keeps its original act intact. After its old finish line, it continues through sections in its own materials into a finale with a launch pad, halos, a crumbling run and a last Spindle gate. Progression order is respected:

- levels 1–2 use fundamentals only;
- rolls start at level 3;
- left and right turns and the 180° roll start at level 6;
- the climb-over starts at level 7.

| Course | Sections added (in order) |
|---|---|
| Awakening (1) | runway · hurdles · gaps · drawbridge · wall chain · stairs · chute · collapse run · laser gate · double gap · runway · hurdles ×4 · gaps ×5 · finale |
| Verticality (2) | stairs · gaps · drawbridge · hurdles · chute · runway · stairs · gaps ×5 · finale |
| Momentum (3) | runway · roll · hurdles · gaps · drawbridge · chute · roll (other way) · runway · finale |
| Breakpoint (4) | runway · hurdles · gaps · chute · roll · drawbridge · collapse run · laser gate · wall chain · double gap · stairs · gaps ×5 · finale |
| Ink Falls (5) | runway · hurdles · drawbridge · gaps · chute · collapse run · laser gate · roll · wall chain · collapse ×6 · stairs · hurdles ×4 · finale |
| Faceted (6) | roll · gaps · roll 180° · hurdles · laser gate · wall chain · roll · collapse run · runway · finale |
| Blockfall (7) | climb-over · gaps · climb-over · hurdles · laser gate · roll · wall chain · climb-over · collapse run · finale |
| Corrupted Core (8) | roll · climb-over · hurdles · gaps · drawbridge · roll (other way) · chute · laser gate · wall chain · climb-over · collapse run · finale |
| Shift Point (9) | roll · climb-over · runway · hurdles · laser gate · gaps · roll 180° · wall chain · drawbridge · climb-over · collapse run · double gap · finale |

Other level changes:

- An extra checkpoint was added at Breakpoint z 722 and at Shift Point z 1040, so checkpoints stay under 85 m apart.
- Training is unchanged apart from its sprint prompt, which now teaches Shift and stamina.
- Each course's layout version was bumped, so old bests reset.
- Pure medals were recalibrated: gold sits just above the new reference run, platinum ×0.86, silver ×1.33, bronze ×1.9.

## 5. Level length (measured, Pure reference run)

| Course | Before | After | × | Time before → after | Encounters | Checkpoints |
|---|---|---|---|---|---|---|
| Awakening | 865 m | 1808 m | 2.09 | 75.7 → 160.3 s | 10 | 33 |
| Verticality | 718 m | 1614 m | 2.25 | 74.3 → 156.7 s | 8 | 28 |
| Momentum | 1164 m | 2030 m | 1.74 | 86.9 → 166.9 s | 8 | 33 |
| Breakpoint | 861 m | 1738 m | 2.02 | 58.2 → 136.5 s | 8 | 29 |
| Ink Falls | 833 m | 1744 m | 2.09 | 71.4 → 155.6 s | 9 | 30 |
| Faceted | 601 m | 1340 m | 2.23 | 55.3 → 124.4 s | 6 | 23 |
| Blockfall | 663 m | 1515 m | 2.29 | 59.3 → 139.0 s | 5 | 26 |
| Corrupted Core | 742 m | 1685 m | 2.27 | 58.6 → 147.7 s | 6 | 28 |
| Shift Point | 1123 m | 2119 m | 1.89 | 85.9 → 178.4 s | 6 | 36 |

The new medals are:

| Course | Gold | Platinum | Silver | Bronze |
|---|---|---|---|---|
| Awakening | 163 | 140 | 217 | 310 |
| Verticality | 159 | 136.5 | 211 | 302 |
| Momentum | 169 | 145.5 | 225 | 321 |
| Breakpoint | 139 | 119.5 | 185 | 264 |
| Ink Falls | 158 | 136 | 210 | 300 |
| Faceted | 127 | 109 | 169 | 241 |
| Blockfall | 141 | 121.5 | 188 | 268 |
| Core | 150 | 129 | 200 | 285 |
| Shift Point | 181 | 155.5 | 241 | 344 |

## 6. Difficulty Director

**Dimensions.** There are eight dimensions: traversal, obstacle, environment, reaction, precision, ability, density and visual. Each is recomputed every 0.25 s from:

- progress through the course's encounters;
- Evolve upgrade levels (movement and sword separately);
- recent average speed;
- stamina capacity and fill;
- the Kinetic Chain;
- deaths in the last 90 s, which ease every gameplay dimension by up to 0.75.

**Limits.**

- Each dimension moves at most 0.12 per second, so there are no spikes.
- Each is capped at 0.45 + 0.55 × progress, so early sections are never hard.

**Tiers.**

- Each encounter's tier is chosen 110 m before it from the dimensions it uses, and only that tier's variants exist.
- After an intense encounter (a finale) the next is held back a tier.
- A death in an encounter lowers its tier on the next attempt.

**What higher tiers add:**

- lasers inside jump arcs and slides the line already clears;
- crumbling or narrower footing on the same line;
- faster laser-gate cycles: open windows of 1.8, 1.5 and 1.2 s, against the 0.6 s needed to cross;
- more Spindle gates, prisms, cores, motes, seals and sentinels to cut.

Higher tiers never require an ability.

**Both modes.** Both modes run the Director. Pure has no upgrades, so it follows progress and consistency. The natural Pure reference runs climb from tier 0 to 1–2 by the end, for example Awakening `0000111112` and Ink Falls `000011222`.

- **Tested:**
  - dimension caps and responses;
  - the rate limit;
  - decision before view;
  - presence matching the tier;
  - absent hazards cannot kill;
  - recovery and death easing;
  - determinism;
  - every section, and every full course, cleared at tier 0 and tier 2 with zero deaths.
- **Observed:** tier-2 variants in the browser: the laser gate, and the finale's seal and sentinels.
- **Not done:** no human playtest of whether the escalation *feels* right.

## 7. Environmental events and transformations

- **Drawbridge.** The bridge stands raised and swings down (telegraphed 0.8 s) when you reach its trigger. Cutting a chain drops it at once. Callout "THE WORLD MOVES", a flash scaled by the visual dimension, and a sound.
- **Laser gate.** A curtain on a telegraphed cycle. Cutting its conduit powers it down for the attempt ("GATE POWERED DOWN"), and it is back after a respawn.
- **Glass bypass.** A clear lane beside each hurdle set, sealed by glass that only the blade opens ("BYPASS OPEN").
- **World rotation:**
  - rolls: the tube turns 90° round you and the next turns you back; level 3 on;
  - 180° rolls: level 6 on;
  - climb-overs: the floor curls up and over; level 7 on.
- **Finale.** A launch pad through two counter-turning halos.
- The stage glow follows the visual dimension.
- **Tested:** the mechanisms (glass, conduit, chain), and every roll, climb and drawbridge crossed by the line at both tiers.
- **Observed:** the drawbridge raised, then lowering; a Blockfall climb-over; the finale halos on Core. See `drawbridge-raised-lowering.webp`, `blockfall-climbover.webp` and `core-finale-tier2.webp`.

## 8. Sprint and stamina

**Implemented.**

- 11 m/s is the full running pace, unchanged for every course.
- Shift (hold, or toggle in Settings) adds +3 m/s and drains 20 stamina per second from 100, which is about 5 s.
- Stamina regenerates at 18/s after 0.7 s.
- An empty bar locks the sprint until 30. There is a low warning under 25. Stamina refills on respawn.
- No gap needs the sprint.

**Feedback.**

- HUD bar under the dash pips: green; amber when low; red-labelled EMPTY when empty; a mark at the 30% restart point.
- Sounds for sprint start, low, empty and recovered.
- An FOV kick and a slightly wider field of view while sprinting.

**Upgrades (Evolve).**

- **Endurance:** bigger bar (+40/60/75), faster refill, cheaper sprint. At level 2, Second Wind refills the bar on chain milestones and gate clears. At level 3, Afterburner makes the sprint 1.5 m/s faster and removes the lockout after running dry.
- **Redline** synergy: the chain holds while you sprint in Overdrive.
- **Overcharge** (energy cores): free sprint for 8 s.

**Status.**

- **Tested:** `stamina.test.ts`, 9 tests.
- **Observed:** the bar at about half, low (amber) and nearly empty (amber) with the real keyboard (W and Shift held), in `stamina-full-low-empty.webp`.
- **Not observed:** the red EMPTY label. The software renderer runs the game slower than real time, so the bar had only reached about 2.5 when the last frame was taken.

## 9. Power-up visibility

**Implemented.**

- Every power-up except Glints (which are Flux) has a 7 m beam in its rarity colour rising from it.
- A halo turns slowly round it and breathes; nothing blinks.
- Both are one instanced draw call each for the whole course.
- A pickup throws a ring burst sized by rarity.
- The upgrade callout names its source, for example "Skyknot → Spring 2: …" or "Full Flux → …", and what the new level does.

**Status.**

- **Observed:** beams on Awakening (`evolve-beacons.webp`) and on every Evolve course in the sweep.
- **Tested:** indirectly. The e2e pickup tests still pass. There is no automated visual assertion.

## 10. Active power-up HUD

**Implemented.** A panel under the Evolve meters lists every running temporary effect:

- icon, name, what it actually does, a countdown bar and seconds left;
- the row turns amber under 30%;
- a timed effect shows ENDED for about 0.9 s and leaves, and a chime plays when an effect of 3 s or more ends;
- Overdrive (no clock) says ACTIVE.

The effects listed:

- Surge
- Reflex
- Overcharge
- Momentum Lock
- Shielded (hazards only; falls still count)
- Hover
- Overdrive

The duplicate SURGE, REFLEX and LOCK timers were removed from the meters. Permanent upgrades never appear in the panel.

**Status.**

- **Tested:**
  - Overcharge appears with an 8 s max, counts down and is removed and undone;
  - three effects at once each keep their own clock;
  - permanent upgrades are never listed;
  - e2e: the Surge row shows, its seconds fall, and it leaves after expiry.
- **Observed:** Surge (0.2 s) and Overcharge (5.7 s) together in `evolve-active-effects.webp`.

## 11. Sword interactions and destructibles

- **Glass:** a 3×3 pane that shatters per piece along the blade. It opens the bypass and is blade-only; running into it does not break it. Worth 6 Flux in Evolve.
- **Energy core:** floats and comes apart weightlessly. In Evolve it gives 10 Flux, Overcharge and a 5 m wave. In Pure it is cosmetic.
- **Conduit:** powers down the laser gate (8 Flux in Evolve).
- **Chain:** drops the drawbridge (8 Flux).
- **Motes:** a floating trail beside the runway line, 3 Flux each (other objects give 5), quick links for the Kinetic Chain.
- Runways and finales add Spindle gates, prisms, sentinels and seals by tier.

Status:

- **Tested:**
  - the mechanisms;
  - slashing everything in reach never changes a route, and changes a time by at most 0.1 s on courses with architecture;
  - the line passes close enough to cut at least 60% of what is present (excluding mechanisms, which stand off the line on purpose).
- **Observed:** cores, motes and glass panes are visible in captures.
- **Not captured:** a destruction animation.

## 12. Flickering horizontal block removal

**Removed:**

- `SpeedLines`: a full-screen shader redrawing random radial streaks at 12 fps.
- `Streaks`.
- The Overdrive and Lock sticker streaks.
- The transition row glitch and pixel burst.
- The corruption row slip in stickers.
- Time-stepped or scrolling patterns in the sky grid, floor pulses, tower scan bands, window and glyph flicker, scenery corruption rows, character scan tears, tile pulses and chevron scroll.
- The universe grain re-rolled several times a second. It is now a fixed grain.

Speed is now shown by a steady vignette, the FOV and the camera.

- **Tested:** `no-flicker.test.ts` guards each removed pattern.
- **Observed:** standing still, two frames 400 ms apart differ in about 5–6% of pixels (over 3% tolerance). The differences are only the idle hands, drifting clouds and object edges, with no rows or blocks (`still-frame-diff.webp`). Before the grain fix it was 12%, with speckle across every surface.

## 13. Performance

- Beacons and halos are 2 instanced draw calls per course.
- Absent variants are hidden and their colliders disabled.
- Breakables beyond 110 m are culled (existing).
- New sections reuse kit pieces and instanced columns.

Measured draw calls in the browser sweep:

| Preset | Pure | Evolve |
|---|---|---|
| Low | 32–197 (early sections highest) | 51–219 |
| Medium | 96–117 | 133–138 |

- On the Medium preset, captures had 40–65 k triangles in Pure and 64–95 k in Evolve.
- Frame rates were 5–16 fps in the software renderer. They say nothing about a GPU, and none was measured on real hardware.

## 14. Automated tests (final run)

- `tsc --noEmit`: clean.
- ESLint (0 warnings allowed): clean.
- Prettier on `src` and `tests`: clean.
- Vitest: 501 passed, 10 skipped. The skips are the slot generator and opt-in tests.
- Production build: OK.
- Playwright (production build, software renderer): 29 passed (11.0 min).

Updated tests:

- Medals and the checkpoint spacing rule.
- Breakables:
  - present-only counts;
  - a 0.1 s allowance where architecture can be cut. On Core, cutting a solid pylon shifted controller contacts by 5 ticks.
- Progression act-end checks: they now check that the old finish position is reached, since the course continues.
- The Surge e2e test reads the new panel.

## 15. Browser validation

- A sweep loaded every course in both modes and captured early, middle and late frames (`sweep-pure.webp`, `sweep-evolve.webp`): 9 courses × 2 modes × 3 frames, with zero console errors.
  - The late frames in Evolve used an upgraded build (Stride 3, Spring 2, Phase, Endurance, Timeslip, Edge and Reach).
  - Positions were set by checkpoint and the player was advanced 1.2 s forward. This is placement, not play. Two middle frames show FELL, because running straight on from a checkpoint met a gap that needs a jump.
- Targeted captures:
  - the runway at speed;
  - stamina states;
  - drawbridge raised and lowering;
  - a tier-2 laser gate;
  - a Blockfall climb-over;
  - the Core finale;
  - Evolve beacons;
  - the effects panel.
- **Not validated in a browser:**
  - a hand-played full run;
  - Overdrive at full speed;
  - a captured destruction animation;
  - the red EMPTY stamina state;
  - the tier 0 vs tier 2 hurdle lasers. They sit behind the rails from standing height. Their presence is tested in the simulation.

## 16. Known limitations

- No person has played this build. Feel, pacing and whether the Director's escalation is satisfying are unverified.
- Courses are longer mostly by composing library sections after each original act. Each course's new half uses its own materials and progression-appropriate mechanics, but the sections repeat across courses with different parameters.
- Verticality has no laser gate. Blockfall has 5 tiered encounters, the fewest.
- The Director's weights are first-pass numbers.
- The software renderer cannot speak for real-GPU frame rate.
- The upgraded-build reference line is not bot-tested end to end. The bot follows a Pure plan, as before.

## 17–18. Git and deployment

Recorded in the final report message: the commit, the push to both branches and the Vercel check.
