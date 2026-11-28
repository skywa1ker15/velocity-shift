# VELOCITY: SHIFT

A browser-based first-person movement game. Sprint, slide, dash, double jump, wall-run and vault —
then chain it all together through three shifting courses and chase your own ghost.

**Play:** https://velocity-shift.vercel.app

Desktop only (keyboard and mouse). Chrome, Edge or Firefox. No install, no account; progress is
saved in your browser.

## Controls (all rebindable)

| Action | Key |
|---|---|
| Move | W A S D |
| Look | Mouse |
| Jump · double jump · wall jump | Space |
| Slide | C (or right mouse button) |
| Dash | Q (or E) |
| Sprint | Shift (hold, or toggle in Settings): +3 m/s on top of the full running pace, drawing stamina |
| Restart from checkpoint | R (hold R: restart the level) |
| Pause | Esc or P |

Wall-running and vaulting are automatic: jump beside a lit wall while moving forward to run on
it; run straight at a waist-high obstacle to vault it.

## What is in the game

- **Movement**: momentum-based sprint, slide (with slopes, slide-jumps and slide-landings), a
  two-charge dash, double jump with redirect, wall-run and wall-jump, vault, coyote time and jump
  buffering — one state machine, so everything chains.
- **A visible body**: arms, hands, legs and torso animated in code and reacting to every move.
- **Four places to run**: Training, The Awakening (dawn marble ruins), Verticality (a climb through
  violet spires) and Momentum (a neon chrome canyon), each with its own look, moving terrain,
  three hidden shards, optional objectives and a hidden route.
- **Dynamic terrain**: drifting and rising platforms, a turning carousel, a lift, sliding shutters,
  a low-gravity spire, collapsing bridges, a chute that drops one lane, blinking platforms,
  crushers, laser beams, boost and launch pads — all telegraphed.
- **Speedrunning**: tick-accurate timer, checkpoint splits against your best, bronze / silver / gold
  medals plus a hidden tier, a results screen with movement statistics, and a ghost of your best run.
- **Progression**: 22 achievements and 15 cosmetic unlocks (suit colours, burst styles, speed-line
  colours, HUD themes), all earned by playing.
- **Settings**: quality presets with an adaptive Auto mode, field of view, sensitivity, full key
  rebinding, Reduce Motion and other comfort options, separate volume controls, save export / import.
- **Sound**: every effect and all music is synthesised at runtime and follows your speed.

## Develop

Requires Node 22+.

```bash
npm install
npm run dev          # http://localhost:5173  (add ?dev for the live movement tuning panel)
npm run typecheck
npm run lint
npm test             # unit + headless simulation tests
npm run build        # production build → dist/
npm run preview      # serve the build on http://localhost:4173
npm run test:e2e     # browser tests against the build
```

## Deploy

The build is plain static files in `dist/` with relative asset paths, so any static host works.

- **Vercel (current)**: the repository is connected; every push to `main` builds (`npm run build`)
  and publishes `dist/`. Settings are in `vercel.json`.
- **Cloudflare Pages**: create a Pages project connected to this repository with build command
  `npm run build`, output directory `dist` and environment variable `NODE_VERSION=22`.
  `public/_headers` already sets long-lived caching for the hashed assets.
- **Anything else**: run `npm run build` and upload `dist/`.

## Documentation

| File | Contents |
|---|---|
| `docs/MOVEMENT.md` | how movement works, the transition table, chains, tuning values |
| `docs/ARCHITECTURE.md` | systems, the frame, layering rules, how to extend |
| `docs/ART_DIRECTION.md` | visual language, palettes, readability rules |
| `docs/LEVEL_AUTHORING.md` | how to build a level and its reference line |
| `docs/TESTING.md` | automated suites and the manual checklist |
| `docs/DECISIONS.md` | choices, deviations from the brief, known risks |
| `ASSETS_LICENSES.md` | fonts and libraries |
| `CHANGELOG.md` | phase-by-phase build report |
