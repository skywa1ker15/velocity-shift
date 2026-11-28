# Movement system

Movement is the game. This document describes how it works, every legal state transition, the
chains that must always work, the tuning values and the reasoning behind them.

Code: `src/movement/` (controller + config), `src/physics/PhysicsWorld.ts` (collision queries).
Tests: `tests/sim/movement.test.ts`, `tests/sim/chains.test.ts`.

## Design in one paragraph

A single state machine owns the player's velocity. No ability plays a canned motion and then
hands control back; each one reads the current velocity, changes it, and passes it on. That is why
chains work: a slide inherits the sprint's speed plus a boost, a jump out of the slide keeps it, a
dash can only raise it, and a wall-run converts it into height. Speed above the normal top speed is
never clamped — it bleeds off slowly on the ground (4 m/s²) and not at all in the air — so
momentum is something you earn and then spend.

## Simulation

- **Fixed 120 Hz ticks** with an accumulator (`src/core/loop.ts`); rendering interpolates. Movement
  is identical at any refresh rate. Frame spikes above 250 ms are clamped.
- **Deterministic**: no randomness, no wall-clock. The same input stream reproduces the same run
  bit-for-bit (tested), which is what makes the reference-run level tests and ghosts possible.
- **Input** is sampled per rendered frame for look (never smoothed) and consumed per tick for
  actions; presses are latched so a tap between ticks is never lost.

## The collision body ("hover capsule")

The player is a kinematic capsule moved with Rapier's shape-cast character controller, but the
capsule **floats 0.35 m above the feet** and a short ball-cast underneath finds the ground:

- footing is exact (no solver noise → no camera jitter; tested to < 1 mm),
- kerbs up to 0.35 m are simply stepped over at full speed,
- a jump that falls a little short of a ledge is caught instead of bouncing off its face,
- the capsule only ever has to resolve real walls and ceilings.

Slopes up to 50° are walkable; steeper faces cannot be stood on. Moving ground carries the player
and its velocity is inherited on jumping or walking off. A moving wall shoves the player; being
pinned for 0.25 s is a crush (death).

## States

| State | Summary |
|---|---|
| Idle / Run / Sprint | Ground movement. Run speed 7 m/s in ~0.12 s, sprint 11 m/s after a ~0.6 s ramp. |
| Slide | Low profile (0.9 m), low friction, steered slowly, fed by slopes. |
| Air | Jumps, falls, air control, coyote time, double jump. |
| Dash | 0.15 s burst at 26 m/s along the look direction, gravity suspended. |
| WallRun | Runs along a lit wall for 0.8–2.0 s depending on speed, in an arc. |
| Vault | 0.25 s mantle over a 0.4–1.3 m obstacle, keeping ≥ 95 % of speed. |
| Dead | Frozen until the respawn (0.25 s later). |

## Transition table

| From | To | Trigger |
|---|---|---|
| Idle/Run/Sprint | Air | jump (buffered 0.12 s) · walk off an edge (0.1 s coyote time follows) |
| Idle/Run/Sprint | Slide | slide pressed at ≥ 4.5 m/s |
| Idle/Run/Sprint | Dash | dash pressed with a charge |
| Idle/Run/Sprint | Vault | run into a 0.4–1.3 m obstacle while holding forward at ≥ 4 m/s |
| Slide | Run | speed < 3 m/s or slide released (stays crouched if there is no head room) |
| Slide | Air | jump (**keeps slide speed**) · slide off an edge |
| Slide | Dash | dash pressed |
| Air | Run | land |
| Air | Slide | land while holding slide at ≥ 4.5 m/s (slide-landing) |
| Air | Air (double jump) | jump pressed, once per airtime (buffered instead if about to land) |
| Air | Dash | dash pressed with a charge (follows the look pitch, ±25°) |
| Air | WallRun | next to a lit wall, moving along it at ≥ 5.5 m/s, holding forward |
| Air | Vault | hit a ledge whose lip is 0.4–1.3 m above the feet |
| Air | Air (wall jump) | jump within 0.14 s of leaving a wall-run (wall coyote) |
| Dash | Run / Air | 0.15 s elapsed (exit speed = max(speed before, 13 m/s)) · hit a wall |
| Dash | Slide | slide pressed during a ground dash (**carries dash momentum**) |
| Dash | Air (jump) | jump during a ground dash |
| WallRun | Air (wall jump) | jump: 7 m/s away from the wall, 8.5 m/s up, forward speed kept |
| WallRun | Air | timer ran out · wall ended · forward released for 0.18 s · blocked ahead |
| WallRun | Run | touched the ground |
| WallRun | Dash | dash pressed |
| Vault | Air → Run | mantle finished (lands with coyote time so a jump can follow immediately) |
| any | Dead | void, hazard, crush |

What refreshes what: landing refreshes the double jump, guarantees at least one dash charge and
clears the "same wall" lock. Starting a wall-run refreshes the double jump and guarantees one dash
charge. A wall-jump refreshes the double jump.

## Chains (all covered by automated tests)

| # | Chain | Input timing |
|---|---|---|
| 1 | Sprint → Slide → Dash → Double Jump | sprint ≥ 0.7 s · slide · dash any time during the slide · jump as the dash ends · jump again near the apex |
| 2 | Sprint → Wall Run → Wall Jump → Dash | jump within ~0.8 m of a lit wall while moving along it · jump to kick off · dash in the air |
| 3 | Slide downhill → Jump → Air Dash → Landing | hold slide down the slope · jump at the bottom · dash · keep slide held to land in a slide |
| 4 | Wall Run → Double Jump → Vault → Sprint | kick off the wall · jump again · steer at a ledge slightly too high: the vault catches it |
| 5 | Wall Run → Wall Jump → opposite Wall Run → Wall Jump | kick off and hold forward; the opposite wall catches automatically |
| 6 | Dash → Slide | press slide during a ground dash |
| 7 | Slide → Jump → land → Slide | hold slide, tap jump on each landing (bunny-slide) |

## Tuning values (`movementConfig.ts`)

| Group | Values |
|---|---|
| Body | radius 0.35 · stand 1.8 · slide 0.9 · step-up 0.35 |
| Ground | run 7 · sprint 11 · run accel 60 · sprint ramp 7 · steer 70 · stop 48 · overspeed decay 4 |
| Sprint & stamina (Phase 3) | 11 m/s is the full running pace; Shift adds +3 m/s · stamina 100, drains 20/s while sprinting, refills 18/s after 0.7 s · empty locks the sprint until 30 · low warning under 25 · refilled on respawn · no gap needs it |
| Air | gravity 28 (×1.6 falling) · jump 9 (apex ≈ 1.45 m, 0.58 s airtime, 6.3 m at sprint) · jump cut ×0.5 · coyote 0.1 · buffer 0.12 · air accel 14 toward a 7 m/s wish speed · double jump 8.5 with 60 % redirect |
| Slide | +2.5 m/s entry boost (0.8 s cooldown, only below ~14 m/s) · friction 8.6 (≈ 1.2 s / 10 m on flat) · slope gain 1.4 · steer 1.4 rad/s · exits at 3 m/s |
| Dash | 26 m/s for 0.15 s (≈ 4 m) · exit 13 m/s · 2 charges · 1.2 s recharge each · 0.3 s minimum interval |
| Wall-run | min speed 5.5 · speed floor 9 · duration clamp(0.8 + 0.06·speed, 0.8, 2.0) · start lift 2.6 · reach 0.6 m · wall jump 7 out / 8.5 up |
| Vault | 0.4–1.3 m · 0.25 s · keeps 95 % |
| Limits | soft speed cap 35 m/s (drag above it) |

Why these: heavy gravity with a faster fall gives snappy, readable arcs. A double jump that *sets*
vertical speed (rather than adding) behaves the same wherever it is used. Air control never
subtracts momentum (Quake-style), so steering in the air costs nothing but cannot brake a dash for
free either. The slide's friction was tuned to the brief's "about 1.2 s and 10 m from a sprint".

## Useful numbers for level design

| Move | Reach from a sprint |
|---|---|
| Jump | 6.3 m flat, +1.45 m up |
| Jump + ledge catch / vault | climbs ~2.5 m |
| Double jump | 10.7 m flat, +2.7 m up |
| Jump + dash | ≈ 11 m |
| Double jump + dash | ≈ 16 m |
| Wall-run | ≈ 15 m along the wall, rising ~2.2 m by 0.75 s |
| Narrow canyon (walls 3.4 m apart) | +2 m of height per kick-off |

## Emergent technique and exploit limits

Kept on purpose: slide-hopping (chain 7) holds speed above sprint; dash-jumping; wall-kick chains;
quick wall-kicks in a narrow canyon climb faster than slow ones (this is how Level 2's hidden route
is reached).

Bounded on purpose:
- the slide boost has a cooldown and does not apply above ~14 m/s, so slide-spam cannot snowball;
- a wall cannot be re-run without touching the ground or another wall (no infinite climbing);
- a wall-run only inherits speed *along* the wall — sideways speed from the previous kick-off is
  absorbed — so wall-to-wall chains cannot accelerate without limit (found during testing: before
  this, each kick added ~2 m/s);
- drag rises sharply above 35 m/s.

## Deviations from the written plan

- Dash charges: the plan said both charges refill on landing. That makes ground dashes unlimited,
  so landing (and starting a wall-run) guarantee **one** charge instead; the rest is time-based.
- Ledge climb from the air (a stretch goal) is covered by the vault, which also triggers in the air.
- Ramps do not launch the player upward at their top (ground velocity is horizontal by design, for
  predictable footing); launches use jump pads instead.

## Live tuning

`npm run dev`, then open `http://localhost:5173/?dev`. A panel exposes every value above while
playing; "Copy config as JSON" puts the current values on the clipboard.

## What has not been verified

The numbers above are measured by the headless simulation and the reference-run bot. The *feel* —
how the camera, sound and animation read at 144 Hz with a real mouse — has not been play-tested by
a person yet. Expect to adjust a handful of values after the first hands-on session.
