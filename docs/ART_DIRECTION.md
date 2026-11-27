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
