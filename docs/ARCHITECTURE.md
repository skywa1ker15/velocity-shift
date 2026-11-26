# Architecture

```
src/
  app/          Game.ts (owns the loop, wires systems), store.ts (UI state), main.tsx (entry)
  core/         fixed-timestep loop, typed events, math, seeded RNG
  input/        key bindings, InputManager (pointer lock, raw mouse, latched presses)
  physics/      PhysicsWorld: Rapier wrapper — collision queries only
  movement/     MovementController (state machine), movementConfig, types
  entities/     dynamic terrain simulation (movers, rotators, collapse, blink, hazards, pads, zones)
  gameplay/     Simulation (one level: physics + player + entities + checkpoints + stats), Bot
  levels/       data format, LevelBuilder authoring kit, registry, data/<level>.ts
  camera/       CameraRig: additive camera effects on top of raw look
  character/    Body: procedural first-person arms, legs and torso with IK
  render/       Renderer (WebGL2 + post), quality tiers, WorldMaterial, Sky, LevelView, geometry batching
  environment/  per-level presets: sky, fog, light, palette, post
  fx/           speed lines, bursts, sparks, ambient motes (all pooled)
  audio/        AudioEngine: synthesised effects, continuous layers, generative music
  progression/  medals, objectives, achievements, cosmetics, run results
  replay/       ghost recording and playback
  save/         versioned local save + IndexedDB ghosts
  settings/     settings model, defaults, Reduce Motion profile
  ui/           React screens (menus, HUD, pause, results, settings) and styles
  dev/          live tuning panel (dev builds only)
tests/
  unit/         math, loop, save, progression
  sim/          headless movement, chain and level tests (real controller + physics)
  e2e/          Playwright tests against the production build
```

## The frame

```
requestAnimationFrame
 ├─ accumulate time → run 0..n fixed ticks of 1/120 s
 │    Game.tick → InputManager.sample() → Simulation.tick(input)
 │         entities.update (level clock) → physics.step → MovementController.tick
 │         → checkpoints / triggers / hazards / finish → events
 └─ Game.frame(alpha)
      CameraRig.update (interpolated feet + raw look + additive effects)
      Body.update (pose targets → springs → IK)
      LevelView.update (interpolate entity transforms)
      effects, audio layers, ghost
      Renderer.render (world pass → clear depth → viewmodel pass → one merged post pass)
      HUD state pushed to the store at 30 Hz
```

## Layering rules

- **`movement` knows nothing about levels, rendering, audio or UI.** It talks to a five-method
  `CollisionWorld` interface and emits events. That is why it runs headless in tests.
- **`gameplay/Simulation` has no three.js, DOM or audio.** The browser `Game` wraps it; tests and
  the bot drive it directly. Everything in it advances on the deterministic level clock.
- **React never runs in the game loop.** The game writes to a Zustand store at a low rate; screens
  read from it and call a handful of public methods on `Game`.
- **Levels are data.** A level file produces `LevelData` with `LevelBuilder`; the engine never
  special-cases a level. Level chunks are lazy-loaded.
- Every system that owns GPU resources has `dispose()`; leaving a level returns the renderer's
  geometry count to the menu baseline (checked by an end-to-end test).

## Rendering

- WebGL 2 through three.js `WebGLRenderer`. `Renderer.ts` is the only file that touches the
  renderer, so a `WebGPURenderer` can be swapped in later without touching game code.
- Two scenes: the world, and a viewmodel scene (arms, speed lines) drawn afterwards with its own
  fixed-FOV camera and a cleared depth buffer — arms never clip into walls or stretch with speed FOV.
- Static level geometry and static decoration are merged into two meshes with custom vertex
  attributes; `WorldMaterial` (an extended `MeshStandardMaterial`) draws bevel highlights, panel
  seams, wall-run rails, hazard stripes, telegraph flicker and height fog from those attributes.
- Post-processing (pmndrs `postprocessing`) is one merged effect pass: bloom, vignette, AgX tone
  mapping, grading, plus optional chromatic aberration on dashes and SMAA.
- Quality tiers (`render/quality.ts`) change pixel ratio, shadow size, bloom, SMAA and particle
  density. "Auto" watches frame time and steps down resolution, then tier.
- All materials — including pooled effects that are invisible until used — are compiled while the
  loading screen is up, so nothing hitches mid-run.

## Dynamic terrain

Each entity (`entities/Entities.ts`) is a pure function of the level clock or of player contact,
and exposes plain state (`p`, `q`, `warn`, `visible`) for the renderer. Kinematic Rapier bodies
make movers and rotators solid; the player rides them through `surfaceDelta`. Anything that can
drop or kill telegraphs for at least 0.75 s (`warn` → glow, flicker, shake and a sound).
On respawn, triggered terrain is restored and triggers are re-armed so set-pieces replay fairly.

## Saving

`save/SaveSystem.ts`: one versioned JSON document in localStorage (settings, bindings, records,
achievements, totals) with a `migrate()` chain and full validation; ghost recordings go to
IndexedDB. Writes are debounced. If storage is unavailable the game still runs and says so.

## Adding things

- **A level**: see `docs/LEVEL_AUTHORING.md`.
- **A terrain type**: add its definition to `levels/types.ts`, a class in `entities/Entities.ts`,
  and a mesh branch in `render/LevelView.ts`.
- **A movement ability**: add a state to `MovementController`, its values to `movementConfig.ts`,
  a pose in `character/Body.ts`, and a chain test.
- **A setting**: add it to `settings/settings.ts` (model, default, clamp) and a row in `ui/Settings.tsx`.
