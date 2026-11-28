/**
 * Regression guard for the flickering horizontal rows players saw rushing toward them.
 *
 * Sources removed in Phase 3: the screen-space speed lines (random streaks redrawn 12 times a
 * second, quantised to blocks in the voxel universe), the world-space streak cloud, the Overdrive
 * sticker streaks, the transition row-glitch and pixel-block burst, and every time-stepped row,
 * band or stripe in the world, sky, scenery and hand shaders. None of them may come back.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(p, 'utf8');
const SHADERS = [
  'src/multiverse/surface.ts',
  'src/multiverse/sky.ts',
  'src/multiverse/Scenery.ts',
  'src/multiverse/character.ts',
  'src/render/WorldMaterial.ts',
  'src/render/UniversePost.ts',
  'src/render/BreakableView.ts',
  'src/fx/Fx.ts',
  'src/fx/SlashFx.ts',
];

describe('no flickering horizontal rows', () => {
  it('the speed-line and streak systems are gone and nothing builds them', () => {
    const fx = src('src/fx/Fx.ts');
    expect(fx).not.toMatch(/class SpeedLines/);
    expect(fx).not.toMatch(/class Streaks/);
    const game = src('src/app/Game.ts');
    expect(game).not.toMatch(/SpeedLines|Streaks|streakT/);
  });

  it('no shader steps a pattern on the clock (the flicker mechanism)', () => {
    for (const f of SHADERS) {
      const s = src(f);
      expect(s, f).not.toMatch(/floor\(\s*uTime/);
      expect(s, f).not.toMatch(/floor\(\s*uT\s*\*/);
    }
  });

  it('no rows, bands or grids scroll across the world, the sky or the screen', () => {
    const post = src('src/render/UniversePost.ts');
    expect(post).not.toMatch(/uPixelBurst|pixelBurst/);
    expect(post).not.toMatch(/floor\(p\.y \* 38/);
    expect(post).not.toMatch(/fract\(uT \*/); // grain re-rolled several times a second (static)
    expect(src('src/multiverse/sky.ts')).not.toMatch(/gp\.y \+= uTime/);
    const surface = src('src/multiverse/surface.ts');
    expect(surface).not.toMatch(/vWPos\.z \* 0\.035 - uTime/); // grid pulses racing along the floor
    expect(surface).not.toMatch(/vWPos\.y \* 0\.09 - uTime/); // scan bands up the towers
    expect(surface).not.toMatch(/gl_FragCoord\.y \* 0\.25/); // transition scan lines
  });
});
