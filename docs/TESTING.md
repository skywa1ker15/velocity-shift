# Testing

```bash
npm run typecheck   # TypeScript, strict
npm run lint        # ESLint, zero warnings allowed
npm test            # unit + headless simulation tests (Vitest)
npm run build       # production build
npm run test:e2e    # Playwright against the production build (needs Chrome; CI installs Chromium)
```

CI (`.github/workflows/ci.yml`) runs all five on every push.

## What is automated

| Suite | Files | What it proves |
|---|---|---|
| Unit | `tests/unit/core.test.ts` | fixed timestep gives the same tick count at 30–360 fps and under uneven frames; hitches are clamped; math helpers; springs stay stable down to 4 fps |
| Unit | `tests/unit/save.test.ts` | settings and bindings are validated and clamped; old saves migrate forward without losing progress; corrupt saves are repaired |
| Unit | `tests/unit/progression.test.ts` | medal thresholds, records never regress, objectives, achievements, cosmetic unlocks, level unlock order |
| Simulation | `tests/sim/movement.test.ts` | every ability against the real controller and physics: sprint ramp, stopping, steps, walls, jump arc, variable height, coyote time, jump buffer / bunny hop, double jump, air control, ceilings, slide timing and distance, slide boost cooldown, sliding under a 1 m gap and not standing up beneath it, downhill gain, slide-jump, dash distance / charges / recharge / gravity, **no tunnelling through a 0.2 m wall at dash speed from six start distances**, wall-run attach / duration / kick-off / same-wall lock / non-runnable walls, vault, moving-platform carry and velocity inheritance, rising platforms, moving walls shoving and crushing, **determinism** |
| Simulation | `tests/sim/chains.test.ts` | the seven movement chains as continuous state sequences with momentum preserved; ramps, steep slopes, ledge catches, void death and sub-0.5 s respawn |
| Simulation | `tests/sim/levels.test.ts` | for each level: the bot completes the main line **without dying**, the run is exactly reproducible, a clean run earns gold but not the hidden tier, three collectibles, ordered checkpoints, a hidden route, telegraph times ≥ 0.75 s, sane geometry |
| End-to-end | `tests/e2e/game.spec.ts` | in a real browser, failing on **any console error**: boot → title → every menu; load → move with real key events → pause (simulation frozen) → resume → restart → finish → results → retry → main menu; settings and records persist across a reload; all three courses load, render and tick; leaving a level releases GPU resources; key rebinding with conflict handling |

Current totals: **109 unit and simulation tests, 5 end-to-end tests, all passing.**

## What automation cannot cover — manual checklist

Run this on real hardware with a mouse. *Status: not yet run by a person.*

Movement feel
- [ ] Mouse look feels immediate; no smoothing or acceleration; sensitivity setting behaves
- [ ] Sprint ramp, stopping distance and turning feel right at 60 Hz and at 144 Hz
- [ ] Slide entry, slide-jump, slide-landing; cannot stand under a low ceiling
- [ ] Dash feels powerful but controllable; charge display matches
- [ ] Double jump redirect; coyote time and jump buffer feel forgiving, not sticky
- [ ] Wall-run attaches when expected and never when not; kick-off direction is predictable
- [ ] Vault triggers on waist-high obstacles and never steals control
- [ ] Each of the seven chains can be performed deliberately

Body, camera, effects, audio
- [ ] Arms and legs read correctly in every state; nothing clips into the camera
- [ ] Camera roll, bob, landing dip and FOV change are comfortable; Reduce Motion works
- [ ] Speed lines, dash distortion, rings and sparks are readable, not noisy
- [ ] Every action has a sound; wind rises with speed; music swells with speed; volumes work

Levels (each)
- [ ] Completable on the main line by a newcomer; no blind deaths
- [ ] Hidden route reachable and hinted; all three shards obtainable
- [ ] Telegraphs are noticeable in time (collapsing bridge, split chute, crushers, blink platforms)
- [ ] Medal times feel right (gold = clean run, Shift = optimised)

Platform
- [ ] Pointer lock: Esc pauses, Resume re-locks (a second click may be needed right after Esc)
- [ ] Chrome, Edge, Firefox; Safari loads and plays
- [ ] 16:9, 16:10, 21:9 and a small laptop window
- [ ] Frame rate on each preset on the target laptop; Auto settles sensibly
- [ ] Tab switch / window blur pauses; returning does not fast-forward
- [ ] Private browsing shows the "progress will not be saved" notice and still plays
- [ ] Ghost of the personal best appears on the next run

## Render load (measured, software renderer, 1280×720)

| Level | Draw calls (High) | Triangles | JS heap |
|---|---|---|---|
| Training | 115 | 9.8 k | ~45 MB |
| The Awakening | 135 | 14.7 k | ~30 MB |
| Verticality | 129 | 9.8 k | ~30 MB |
| Momentum | 166 | 11.4 k | ~40 MB |

Frame-rate figures on the reference hardware have not been measured.
