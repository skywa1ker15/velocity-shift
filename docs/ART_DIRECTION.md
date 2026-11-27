# Art direction — "Ink & Signal" (current)

A comic-book treatment of the original "Dreamlike Brutalism" spaces. Rules:

1. **Flat tone, not gradients.** Four light bands (`toonRamp`), crisp tone swatches, banded sky.
2. **Ink everywhere.** Every block edge carries a black line (world shader); every character piece
   carries an ink hull (`PartBuilder`); sprites and UI use the same near-black `#0b0d14`.
3. **Shade is drawn.** Hatching on shadowed world surfaces, halftone dots on the character and UI.
4. **One hot accent per level** for everything the player should read: wall-run markings, glow
   strips, fingertips, effects. Hazards use their own colour plus a stripe pattern.
5. **Effects are drawings.** Sprite-sheet shapes stepped at 12 fps; speed lines, not blur. Each
   effect is tied to one movement event; nothing is ambient noise.
6. **Restraint.** Bloom at 60% of the old value, no chromatic aberration, no film grain.

The sections below describe the level palettes and spaces, which are unchanged.

# Art direction — "Dreamlike Brutalism"

Enormous, simple architecture in soft, surreal light, with crisp 2D graphics layered on top.
Everything is generated in code: geometry, materials, sky, effects.

## Pillars

1. **Scale.** Structures dwarf the player; megastructures stand on the horizon; the ground is
   usually out of sight below fog or cloud.
2. **Few colours, strong light.** Each level has one palette of six colours and one light
   direction. Surfaces are matte and pale so the emissive accent colour carries the eye.
3. **Graphics that belong to the world.** Speed lines, shockwave rings and screen wipes use the
   same diamond / chevron / diagonal shapes as the wall rails, hazard stripes and the UI.
4. **Always moving.** Rings turn, shards bob, motes drift, rails shimmer, clouds slide.
5. **Readable at speed.** Decoration never competes with the route.

## Readability vocabulary (the same on every level)

| Meaning | Signal |
|---|---|
| Wall-runnable | two glowing rails near the top and bottom of the wall + strips of drifting chevrons |
| Not runnable | plain, matte, no rails |
| Lethal | the level's hazard colour **and** pulsing diagonal stripes (pattern as well as colour; a high-contrast mode strengthens the stripes) |
| About to move / collapse | hot flicker and crack glow for ≥ 0.75 s, a shake, and a three-beep warning |
| Blinking platform | glassy and glowing; flickers before it vanishes, fades in just before it returns |
| Checkpoint | two light posts and a spinning shard above the gate |
| Boost / launch pad | a glowing plate (boost pads carry three white bars pointing along the push) |
| Low-gravity zone | a frame of thin glowing edges around the volume |
| Collectible | a bright spinning shard (dimmed if already owned) |
| Hidden route | a light leak or a strip pointing at it — never an invisible wall |

## Palettes (`src/environment/presets.ts`)

| Level | Sky | Surfaces | Accent | Hazard | Mood |
|---|---|---|---|---|---|
| Training | blue-hour teal `#16233f → #6aa6b8` | cool pale `#c9d6dc`, `#8fb3c2`, `#3d5566` | amber `#ff9a3c` | `#ff2d55` | calm, clinical |
| The Awakening | dawn `#3f6cc0 → #ffd2a6 → #f2a78c`, cloud sea | marble `#f1e9dc`, `#d9c7b0`, `#7c6f80` | warm gold-orange `#ff8a3d` | `#e8204f` | hopeful, vast |
| Verticality | dusk `#08071f → #7a2f7c`, stars, teal aurora | violet concrete `#756f9e`, `#8f84c4`, `#231f3e` | hot magenta `#ff3fa8` | orange `#ff6a1a` | vertigo, electric |
| Momentum | night `#01040d → #0d3a66`, stars, cyan aurora | dark chrome `#33455c`, `#4d6a8c`, `#0e1622` (metallic) | cyan `#21e4ff` | warning orange `#ff7a14` | speed, neon |

## Materials

One world material (`render/WorldMaterial.ts`): matte PBR base, plus per-face detail computed in
the shader from box-face coordinates — a bevel highlight along every edge, panel seams every 2.5 m,
large- and small-scale tonal noise, darker undersides. No textures are used.

## Light and atmosphere

One directional sun with a shadow frustum that follows the player (texel-snapped), hemisphere
ambient, exponential distance fog plus height fog tinted toward the sun, a procedural sky (gradient,
sun disc and halo, drifting cloud bands, stars, aurora ribbons), bloom on emissive accents only,
AgX tone mapping, light grading and vignette per level.

## Effects

Speed lines (from ~12 m/s, full by ~25 m/s), dash burst + brief chromatic distortion, double-jump
ring, landing ring and dust, wall-run sparks, slide sparks from the trailing hand, checkpoint ring
and screen sweep, death / respawn wipes (≤ 0.42 s), a single "impact frame" on very hard landings.
All of it scales with the comfort settings; Reduce Motion removes distortion, bob and shake.

## Typography

Unbounded (display, wide and geometric), Chakra Petch (interface), JetBrains Mono with tabular
figures (timers and numbers). Buttons and panels use a clipped-corner diagonal.

## Do / don't

- Do keep walkable tops pale and clean; put detail on edges, undersides and in the distance.
- Do frame each section with one big landmark (a gate, a halo, a spire).
- Don't use the accent colour for anything that is not interactive or route-relevant.
- Don't let bloom wash out a scene: only emissive strips should glow.
- Don't shake the camera for ordinary actions.


## Phase B: level identity, the sword and destructibles

- **Level looks** live in `EnvPreset.look`: the shade fill colour, structure colour, floor motif, lip, glow cap and skyline. Floor motifs are drawn only on walkable tops and fade with distance, so they never compete with hazard stripes or wall-run chevrons.
- **The sword** is a slim single-edged blade with a forward-swept tanto point, a stepped spine notch (the "shift") and a light channel up the fuller. It has an asymmetric hex guard with a swept quillon, accent grip wraps and a glowing pommel. Between swings it rests on the right shoulder so the view stays clear, and the recovery passes through a low guard so the blade never crosses the eye.
- **Slash arcs** are drawn face-on to the camera along the blade tip's real screen path. A first-person swing plane passes near the eye, so the true swept surface would read as a line. The arcs have a white-hot cutting edge, an accent body with dry-brush streaks and an ink border.
- **Cuts** split objects along the blade's sweep plane. Fresh faces glow in the accent colour and cool over about a second. Pieces are kinematic, live about 2 s and are capped at 28.

## The multiverse

The game travels between ten visual universes. Each one is a full rendering identity, not a palette: its own surface shader branch, sky, character treatment, 3D background scenery, light, fog, grading, screen treatment, movement effects, HUD theme and music voicing.

| Universe | Id | Surfaces | Sky | Scenery |
| --- | --- | --- | --- | --- |
| Hand-Drawn | `anime` | The original inked cel look | Painted bands, skyline | (the level's own decor) |
| Neon District | `neon` | Wet reflective ground, lit windows, neon-tube edges | Megacity, holo-signs, searchlights | Slab towers, billboards, drones |
| Issue #1 | `comic` | Ben-Day dots, spot blacks, brush outlines | Sunburst, printed dot gradient, outlined clouds | Burst signs, puffy clouds, rocks |
| Facet Valley | `lowpoly` | Per-facet flat shading, bevels | Faceted dome, folded peaks, hex sun | Floating islands with pines, crystals |
| The Bloom | `psyche` | Flowing contour bands, white keyline | Kaleidoscope with an iris sun | Ring knots, twisted stacks |
| Blockworld | `voxel` | Half-metre block grid, turf, ore | Texel sky, square sun, block clouds | Cube islands and trees |
| Ink | `ink` | Three-tone brush washes on paper | Ink-wash ranges, black sun | Karst spires, pines, red gates |
| Elderwild | `painted` | Brush strokes, moss, warm key / cool shade | Brushed cumulus, light shafts, spires | Ruins, great trees, crystals |
| Outrun | `synth` | World-space glowing grid | Striped sun, wire mountains, grid plane | Palms, wire pyramids, chrome spheres |
| ERR_REALITY | `corrupt` | Debug grid, missing textures, memory dumps | A skybox failing to load | Shard clouds, half-built towers |

Home universes: Training = Hand-Drawn, The Awakening = Elderwild, Verticality = Neon District, Momentum = Outrun.

**Readability is universal.** Every surface style routes the gameplay markings through one shared function (`mvMarks` in `multiverse/surface.ts`): safe-ground lip, wall-run rails and chevrons, glow strips, hazard stripes (pattern and colour), telegraph flicker and the landing ring. Walkable ground is kept calmer than walls in the loud universes (Psychedelic, Corruption). Scenery never comes within 4 m of anything the player can touch (tested), and distortion is only ever applied to scenery or the screen, never to ground you stand on.

**Transitions.** Seven kinds, all world-space fronts drawn in the same pass: portal, tear, glitch, drain, wave, pixel, collapse. Nothing loads, pauses or touches input.

**How a run is planned.** `multiverse/plan.ts` builds a plan from (level, seed): shifts at checkpoints, a drift back home, and rare anomalies (a short unannounced visit somewhere else). The same seed always gives the same plan; the pause card shows it.

**Adding a universe.** Add an entry to `multiverse/universes.ts` (id, shader index, env, screen look) and to `FX`, then a branch in `multiverse/surface.ts`, `multiverse/sky.ts`, `multiverse/character.ts`, a maker in `multiverse/Scenery.ts` and a voicing in `AudioEngine.ts`. The director, planner, tests and settings pick it up automatically.

**Built for the movement overhaul.** The character material and movement effects already read their style from the universe at the camera, so new animation work only has to drive poses; the universe look follows.

## Phase D: character and first-person animation

- One skinned, 19-bone arm per side (sleeve, gauntlet, shift fin, plated knuckles, tapered fingers), restyled per universe by the character shader. Skinned beat rigid on measured draw calls (about 141-148 down to 126-128); software-GL frame time was within noise.
- Animation is layered: state poses (idle, run, slide, wall, dash, vault, air) cross-fade by weight; event overlays (jump, land, wall slap, vault plant, dash recoil, sword counter-swing); secondary sway scaled by the player's sway setting; then springs and two-bone IK.
- The hands camera follows the main camera partially (FOV, landing dip, nod, roll). All motion passes through the master Motion intensity and Reduce Motion.
- Each universe sets a sword-stroke look (`FxLook.trail`) and spark colours (`FxLook.slide`).
- Evidence frames: `docs/phase-d/`. Real-GPU performance is not measured here.
