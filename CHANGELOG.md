# Changelog

## Phase D: Character, first-person and movement animation

- **D5, jump, air and landing.** Take-off: the arms load for an instant and the view lifts, both scaled by how fast you are going (the jump itself is never delayed). In the air: arms drive up on the way up, hands open and drift at the top of the arc, spread wide and flutter on a long fall, and sweep back slightly at high speed; a long fall adds a faint wind flutter to the view. Landing anticipation: a single read-only ground ray works out when the ground arrives, and over the last ~0.3 s the hands reach down and out, the legs extend and the view lowers a touch. Landings come in sizes: soft (barely registers, recovers fast), medium (brace and dip), hard (hands slam wide, body sinks deep, a sideways stagger, slower recovery). Hard landings throw universe-coloured sparks. All scaled by Motion intensity; the simulation is untouched.
- **D4, slide overhaul.** Entry: the view dives and the lens punches out (harder with the speed boost) while the trailing hand throws back to plant and the guard arm sweeps in low. During the slide the view sits lower the faster the ground passes, carves with a roll into turns, and the body, hips and legs ease in rather than snapping; the trailing hand drags further back and chatters harder at speed and rises as the slide dies. Exit: the view rises past standing height and settles, the hands drive forward and up, and the body eases up instead of popping. Per-universe slide effects: neon throws cyan/magenta light sparks, comic bold yellow, low-poly chunky flecks, psychedelic a rainbow, voxel blocky chips, painted warm embers, synthwave pink/gold, corruption glitch colours; ink uses its dark dust only. Purely visual: the simulation, collision timing and input are untouched.
- **D3, sprint, acceleration and speed.** The run is now a gait that changes character with pace through smooth weights: a loose, low JOG, a driven SPRINT, and at TOP speed the arms tuck in and the hands open into blades. Pushing off makes the hands trail back and the view lean into it; stopping swings them on. Strafing and backpedalling have their own arm and leg carriage (legs follow the travel direction). Every stride differs slightly from the last, and each step rolls and twists the shoulders and rocks the head a touch. All of it scales with the Arm and body sway and Head bob sliders and the master Motion intensity.
- **D2, animation architecture.** The arm animation is now three layers instead of one `switch` plus patches: per-state locomotion poses (idle, run, slide, wall, dash, vault, air) that cross-fade through eased blend weights, so run -> slide -> air no longer snaps; overlays for short actions (wall-jump shove, double-jump push, landing brace, sword counter-swing); and secondary motion (look lag, air-steering sway). One `Gait` clock now drives the camera bob, the arm swing and the legs, so footfall, hand pump and head dip are the same beat.
- **Master Motion intensity** (0-150%) in Settings > Comfort, with a new individual "Arm and body sway" slider. The master scales head bob, camera roll, shake, speed FOV, speed lines, arm and body sway, landing impact and the dash and jump camera kicks; every individual slider still applies on top of it, and Reduce motion still wins (bob, shake and screen distortion stay off; the rest softened).
- **D1, skinned first-person arms.** Each arm is now one continuous inked mesh bound to a 19-bone skeleton (upper arm, forearm, a mid-forearm twist bone that carries half the hand's roll, hand, and three phalanges per finger and thumb). Elbows, wrists and knuckles bend smoothly instead of hinging behind a ball. The old arm was about 13 rigid pieces; both arms are now two draws. Measured (software GL, medium): draw calls 141-148 -> 126-128, geometries 181 -> 157, triangles +2k, shader programs +2 (skinned variants); frame time within noise.
- **New arm design**: a long sleeve with a bold stitched accent band and a rolled cuff, a gauntlet bracer with a swept "shift fin" along the back of the forearm, a glove with a bone-white knuckle plate and lit knuckle line, and accent-painted fingertips. Outline weight now varies per part (heavy on the sleeve, fine on the fingers).
- All ten universes restyle the skinned arm through the existing character shader; the sword grip follows the new hand. See docs/phase-d for before/after images.

- **D6 – advanced movement and sword presentation.** Wall-run entry slaps the wall-side palm flat while the free arm throws back, the palm presses with the stride and the buzz grows with speed, and leaving the wall peels the hand away. Vaults plant both palms on the lip with a view dip, nod and FOV punch. A dash's end recoils the arms. The carried sword now keeps the stride's rhythm, tucks in a slide, tilts with rise/fall and lags the look. Each universe has its own sword-stroke look (tint, border, streak, heat). Presentation only; no physics change. Not yet verified: live sword-arc screenshots (frame capture never caught an arc), so the trail tints are covered by unit tests only.

## Phase 3: Multiverse art and graphics overhaul

- **Ten visual universes**, each a full rendering identity: Hand-Drawn (the original look), Neon District, Issue #1 (comic), Facet Valley (low-poly), The Bloom (psychedelic), Blockworld (voxel), Ink, Elderwild (painted fantasy), Outrun (synthwave) and ERR_REALITY (corruption). Each has its own surface rendering, sky, character and arm treatment, seeded 3D background scenery, light, fog, grading, screen treatment, movement effects, HUD theme and music voicing. See docs/ART_DIRECTION.md.
- **Shifts during play.** Each level has a home universe. A seeded plan shifts universes at checkpoints, drifts back home and throws in rare anomalies, so every run differs but any run can be reproduced from its seed (shown on the pause card).
- **Seven transitions**: portal, tear, glitch, drain, wave, pixel and collapse. Two universes are drawn at once along a world-space front, so nothing loads or pauses.
- **Movement presentation**: speed lines and decals in six styles, air streaks at speed, flow-chain and close-call call-outs, a camera breath and lens effect when a front passes, and the universe name announced on entry.
- **Menu and UI**: the main menu tours the universes; HUD themes per universe; level previews show each home universe.
- **Settings**: Multiverse (Shifting / Home universe / Classic look) and Shift intensity, which also respects Reduce motion.
- **Safety**: visual only; the simulation never reads it. Tests cover planner determinism, director behaviour, every transition kind, scenery clearance, identical physics with and without shifts, resource stability across repeated shifts, and HUD overlap.
- **Fix**: the universe effect sanitises its input. Grading could push a channel below zero and produce NaN, which turned regions black.

## Phase 3: Phase C, UI and game presentation

- **Main menu:** a stacked logo, one prominent Play entry (Continue or Play, with the level name and best time) over a quiet list, and a legibility gradient in place of the old halftone wash. The live attract runner is larger, carries the Shift Edge drawn in hand, and follows the real sword state. The hero camera keeps clear of columns and walls.
- **HUD:** speed, dash charge and state icons moved to the top-right, level and checkpoint to the top-left, and the timer with personal best to the top-centre. Nothing sits in the bottom-centre where the first-person hands are. A top scrim and outlined type keep it readable on bright and dark skies. The death caption is non-blocking (retry speed is unchanged), a ring shows progress when R is held for a full restart, and checkpoint banners are clearer.
- **Sword interface:** a chip showing stowed, drawing, drawn or sheathing, with an auto-sheathe ring, combo pips, key hints for the first few draws and a cut tally. A hit marker confirms cuts, smashes and bullseyes. A one-time contextual hint teaches the sword, using the player's own key bindings.
- **Level select and intro:** cards use real in-game preview renders, the level name and description, best time, medal and the time for the next medal. Locked cards name the level that unlocks them. Arrow keys move between cards. The intro card lists medal times, objectives and controls, and states that the sword is optional.
- **Results:** time, medal, personal best, comparison with the previous best (or the delta on a non-record run), a medal ladder with the next target, per-split deltas, movement stats, objectives, a "New this run" list, and Retry, Next, Level Select and Main Menu actions. No toast is ever drawn over the card.
- **Notifications:** major (achievement, unlock) and ordinary (shard, info) toasts with icons and entrance and exit animations, on the left rail during play.
- **Design system:** the UI is split into `hud.css`, `menu.css` and `results.css` on shared tokens. Panels are flat inked plates. Layouts were checked at 1920×1080, 1280×720, 1024×600, 844×390 and 390×844.
- **Tests:** `tests/e2e/ui.spec.ts` covers HUD placement, sword feedback, the results card, level-select locking and keyboard navigation, and small-screen layout.
- No gameplay, level, physics, control or sword-mechanic changes. The results screen has no performance score because the game does not record one.

## Phase 3: Phase B, environment, sword combat and destructibles

- **Environment and lighting:**
  - Each level gets an identity layered on the shared inked shader: coloured shadow fill, a floor motif (Training tiles, Awakening marble, Verticality hex lattice, Momentum circuit traces), a safe-ground lip on walkable edges, a neon cap and a two-layer silhouette skyline in the sky.
  - Pillars and other decor get their own structure colour, separate from the floors.
  - Momentum's mid-tones are lifted and its bloom calmed.
  - Awakening's floor is a warm sand, with cream pillars and violet shade.
  - Verticality's platforms are lighter, and the hands are lit with neutralised light.
- **The sword "Shift Edge":**
  - An original code-built blade, carried in a back scabbard on the runner.
  - Attack is LMB or F; it draws the sword if needed. X draws or sheathes. The sword sheathes itself after 5 s.
  - Five slashes: horizontal, diagonal and vertical (the ground combo), a running draw-cut and an aerial crescent. Slide and wall-run variants are included.
  - The logic is deterministic and lives in the simulation (`gameplay/Sword.ts`). The blade path is a pure function shared by hit detection and the first-person pose. The sword never changes player motion; this is covered by tests.
- **Destructibles:**
  - 36 objects across the four levels, in nine kinds.
  - They never collide and are never required. A blade cut splits them along the real sweep plane (`render/convex.ts`); running into one smashes it into chunks.
  - Behaviour per kind: columns slide apart, relics float and crumble, energy barriers burst.
  - Placement is validated by tests: no overlap with level geometry, nothing next to a hazard or checkpoint, identical run times with or without slashing.
- **Effects and audio:** illustrated face-on slash crescents, inked cut marks, and material-specific debris and sparks. Procedural draw, sheathe, slash, cut, smash and bullseye sounds.
- The results screen shows sword cuts, and Training has an optional sword prompt.

## Phase 3 — Phase A: character and performance

- Arms rebuilt with tapered anatomy: long pushed-up sleeve, rolled cuff, slim gauntlet, wrist bracer, knuckle plate, jointed fingers; fingertip accent pads removed.
- Fixed a Phase 2 bug: the forearm basis was mirrored (left-handed), so the forearm mesh did not point at the hand. Hand conventions are now right-handed (+Z = back of hand).
- Per-level sleeve / glove / trim palette (`EnvPreset.hands`) so the hands contrast with each environment.
- Menu / ghost runner redesigned: waisted jacket, hood peak, longer scarf, tapered limbs.
- Geometry: outline hulls only for silhouette pieces; low-poly rounded boxes; legs drawn only when visible and shadowed by cheap proxies. Triangles per frame on high (Training): 42.6k to about 14k.

## Unreleased — "Ink & Signal" visual, art and animation overhaul

No level layouts, obstacle timings or movement values changed.

- **Art direction:** cel-shaded world (flat light bands), black ink lines on every block edge,
  hatching in shadow, crisp painted tone patches, painted wall-run chevrons, bold hazard stripes,
  banded sky with cut-paper clouds and a graphic sun. Bloom cut by 40%, chromatic aberration removed,
  tone mapping switched to Khronos Neutral to keep colours flat and saturated.
- **Character:** rebuilt first-person arms and hands (jacket sleeve with rolled cuff, strapped
  guard, glove with separate jointed fingers and thumb, accent-dipped fingertips), legs, shoes and
  hips, all toon-shaded with halftone shade, a hard rim light and ink outlines (`render/ink.ts`).
  New full-body `Runner` figure (hood, visor, scarf) used for the ghost and the menu.
- **Animation:** velocity-driven poses for idle, run, sprint, take-off, rise, fall, landing,
  slide, wall-run, wall-jump, vault, dash, double jump and air steering; per-state spring
  stiffness; wrist bend, finger splay and elbow pole channels.
- **2D effects:** sprite sheet painted in code (dust puffs, impact stars, rings, brush streaks,
  skid marks, action ticks, glints), stepped at 12 fps, one instanced draw call; anime speed lines
  that converge on the direction of travel; landing ripple through nearby surfaces; wall-run
  markings brighten near the player.
- **Camera:** landing/take-off nod, sharper sprint footfalls, slide rattle, wall-run side offset,
  FOV includes fall speed and relaxes slowly. All scaled by the existing comfort settings.
- **Menu:** the autopilot runs Level 1 for real behind the menu, followed by a chase camera.
- **UI:** comic-panel theme (ink borders, offset shadows, halftone, slanted plates), outlined HUD
  numbers, speed-tier chevrons, icons for double jump / wall / slide, caption-box prompts.
- **Dev:** `debugBot`, `debugAuto`, `debugFrozen` hooks on the game for automated visual checks.

## Unreleased — Level 3 (Momentum) fairness pass

### Fixed
- **Crusher hall was timed for one narrow pace.** The three crushers were phased for the test bot's
  8.7 m/s line, so a player holding a sprint got through on about 2% of arrival times at 11 m/s and
  0% at 12 m/s. They now run as a "green wave" for a ~10 m/s sprint: 1.5 s up, 0.37 s slam (same
  speed as before), 0.7 s down. Measured pass rate at 9-12 m/s is now 38-51%, with 1.1-1.5 s safe
  windows; 8 m/s still gets through 24% of the time.
- **Crushers gave no warning.** Lethal movers glowed all the time. Telegraphing movers now stay dark
  at rest, then glow, rattle and tick (positional sound) for 0.75 s before they drop.
- Lethal mover hit box trimmed from 0.6 to 0.5 of the player's radius / half height (only Momentum
  has lethal movers), so a graze at speed is not a death.

### Added
- `rest` (dwell at `path[0]`) and `telegraph` fields on movers; glowing floor lines where crushers land;
  a clearer crusher prompt.
- `tests/sim/hazards.test.ts`: crusher pass rate and window per pace, telegraph lead time for every
  level, and a laser-run test where a sprinting player acts up to 0.15 s early or late.
- Bot action `g`: wait until the next crusher has just lifted, then go.

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
