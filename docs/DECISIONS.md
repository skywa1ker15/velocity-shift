# Decisions

Choices made while building, and where the build deviates from the written brief.

## Technology

| Decision | Why |
|---|---|
| three.js used imperatively (no React Three Fiber) for the world | full control of the frame, update order and allocations |
| React + Zustand only for menus and HUD | fast to build polished UI; never runs in the game loop |
| Rapier for collision queries, custom kinematic controller | dynamic-body controllers feel floaty; a movement game needs exact control |
| "Hover capsule" + ground ball-cast instead of Rapier's built-in ground snapping | the built-in snap left ±2–4 cm of noise in the feet height (camera jitter); the hover layout is exact and gives free step-up and ledge forgiveness |
| WebGL 2 only | dependable baseline; `Renderer.ts` isolates the renderer so WebGPU can come later |
| All art, sound and music generated in code | no licensing risk, tiny download, consistent style |
| Position-snapshot ghosts (30 Hz) rather than input replays | cannot drift or break when tuning changes |
| Level data as TypeScript modules checked by tests, not a JSON schema library | the integrity tests cover the same ground with no runtime dependency |

## Hosting

Deployed on **Vercel** with Git integration (auto-deploy on every push to `main`), at the project
owner's request. Cloudflare Pages was the original target, but the Cloudflare account had no Git
connection for Pages and a direct upload of a ~5 MB build was not practical from the build
environment. The build is plain static files (`dist/`), so it runs on Cloudflare Pages unchanged —
see the README.

## Gameplay

| Decision | Why |
|---|---|
| Slide defaults to **C** (Ctrl optional) | Ctrl+W closes the browser tab |
| Auto-sprint on by default | less finger strain; hold / toggle available |
| Respawning keeps the run valid and the timer running | dying already costs time; no advantage to gain, so no need to invalidate runs |
| Landing guarantees one dash charge (not a full refill) | a full refill made ground dashes unlimited |
| Wall-runs inherit only along-wall speed | wall-to-wall chains were gaining ~2 m/s per kick without limit |
| Wall-run walls begin on the take-off deck | removes the exposed leading face that players would clip at speed |
| The carousel (Level 2) is rotating platforms, not rotating runnable walls | wall-running on a moving wall cannot be made reliable with a kinematic controller |
| Ramps do not launch upward; jump pads do | keeps footing predictable on slopes |
| Timed hazards in Level 3 are phased to the reference line | deterministic simulation makes this a stable regression test |

## Cut or reduced (in the order the plan allowed)

| Item | Status |
|---|---|
| Ledge climb from the air | covered by the vault (works from the air) |
| Replay viewer ("watch replay") | cut — ghosts are in |
| Level debug mode (free-fly camera, collider display) | not built; the live movement tuning panel is |
| Level-select preview art rendered from the level | replaced by generated card art using each level's palette |
| Captions for audio cues | not built |
| Texture compression | not applicable — the game uses no textures |
| Course length | each course is a 40–45 s clean run (roughly 2–3 minutes for a newcomer), shorter than the brief's 3–6 minute target; quality was put ahead of length |

## Known risks

- Movement *feel* has been tuned by simulation, not by hand. Numbers are in one config file and a
  live tuning panel exists for the first hands-on pass.
- Performance was measured in software rendering only (draw calls and triangles are low: ≤ 170
  calls, ≤ 15 k triangles per level). It has not been profiled on the RTX 2050 reference laptop.
- Medal times derive from the bot's clean run; the hidden "Shift" tier is an estimate of an
  optimised human run and may need adjusting.
- Rapier's WebAssembly is ~1.7 MB gzipped, most of the download.
