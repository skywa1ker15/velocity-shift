# Changelog

## 1.0.0 — first release

### Phase 0 — Discovery
- Repository `skywa1ker15/velocity-shift` existed and was empty.
- Defaults adopted: one tested push per milestone, generated assets first, auto-sprint on, slide on C.
- Cloudflare Pages had no Git connection on the account → hosting moved to Vercel (owner's call).

### Phase 1 — Foundation
- Vite + TypeScript (strict) + React + three.js + Rapier; ESLint, Prettier, Vitest, Playwright, CI workflow.
- 120 Hz fixed-timestep loop with render interpolation; raw-input pointer lock; latched key presses.
- Renderer with quality tiers, procedural sky, height fog, merged post-processing pass.

### Phase 2 — Movement
- Kinematic "hover capsule" controller and the full state machine: sprint, slide, dash (2 charges),
  double jump, wall-run, wall-jump, vault, coyote time, jump buffer, moving-platform carry,
  shove / crush by moving walls.
- Changed from plan: Rapier's ground snapping produced ±2–4 cm height noise, replaced by a floating
  capsule with a ground ball-cast (noise now < 1 mm). Dash charges refill by time; landing guarantees one.
- Found and fixed during testing: wall-to-wall chains gained speed without limit; sliding walls
  dragged a player pressing against them; spring animation blew up below ~8 fps.
- 50 simulation tests, including all seven chains, tunnelling and determinism.

### Phase 3 — Character
- Procedural arms, hands (articulated fingers), legs, feet and torso; spring-driven poses per state,
  two-bone IK, event impulses (land, dash, double jump, wall kick). Arms render in a separate pass.

### Phase 4 — Visual development
- Art direction document; world material (bevels, seams, wall-run rails, hazard stripes, telegraph
  flicker, height fog); four environment presets; pooled speed lines, bursts, sparks, motes.

### Phase 5 — Gameplay
- Entity system: movers, rotators, collapsing and blinking platforms, hazards, boost and jump pads,
  gravity zones, triggers. Level builder, lazy-loaded level chunks.
- Training plus three courses, each completed by the reference bot without dying:
  Training 34.4 s · The Awakening 38.7 s · Verticality 41.8 s · Momentum 45.0 s.

### Phase 6 — Progression and UI
- Title, main menu with a live fly-through, level select, level intro card, HUD, pause, results,
  settings (7 tabs, applied live), key rebinding, achievements (22), cosmetics (15), career stats.
- Versioned save with migration, validation, export / import / reset; personal-best ghosts in IndexedDB.

### Phase 7 — Polish
- Fully synthesised audio: 25+ effects, speed-driven wind / slide / wall layers, generative music
  per level whose intensity follows speed. Reduce Motion, high-contrast hazards, HUD options.
- All shaders (including pooled effects) are compiled during loading.

### Phase 8 — Testing and deployment
- 109 unit and simulation tests and 5 end-to-end browser tests passing; lint and typecheck clean.
- Production build: game code 54 kB, UI libraries 68 kB, three.js + post 207 kB, physics 1.67 MB (all gzipped).
- Deployed on Vercel from `main`.

### Known limitations
See `docs/DECISIONS.md` ("Cut or reduced" and "Known risks").
