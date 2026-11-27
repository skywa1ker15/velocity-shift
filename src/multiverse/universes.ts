/**
 * The universe library. Each universe is a complete visual identity: how surfaces are rendered
 * (a style branch in the world shader, selected by `index`), its sky, palette, light, fog,
 * post-processing, screen treatment, particles, hands and HUD colours.
 *
 * A universe is resolved against the level it is shown in: the level keeps its sun direction
 * (shadows never jump) and the "anime" universe, the game's original inked look, takes the
 * level's own hand-tuned preset so every course keeps its identity there.
 *
 * To add a universe: add an id + index here, a surface branch in multiverse/surface.ts, a sky
 * branch in render/Sky.ts, and it is automatically available to the director and the run planner.
 */
import type { EnvPreset } from '../environment/presets';

export type UniverseId =
  'anime' | 'neon' | 'comic' | 'lowpoly' | 'psyche' | 'voxel' | 'ink' | 'painted' | 'synth' | 'corrupt';

/** Screen-space treatment applied by the universe post effect (all 0 = untouched). */
export interface ScreenLook {
  /** Halftone dot screen in the shadows. */
  halftone: number;
  /** Horizontal scanlines. */
  scan: number;
  /** Pixel size in screen pixels (0 = off). */
  pixel: number;
  /** Chromatic fringe toward the screen edge. */
  fringe: number;
  /** Film / paper grain. */
  grain: number;
  /** Colour steps per channel (0 = off). */
  posterize: number;
  /** Paper fibre texture multiply. */
  paper: number;
  /** Rolling digital block glitches. */
  glitch: number;
  /** Slow hue drift. */
  hueDrift: number;
}

export const NO_SCREEN: ScreenLook = {
  halftone: 0,
  scan: 0,
  pixel: 0,
  fringe: 0,
  grain: 0,
  posterize: 0,
  paper: 0,
  glitch: 0,
  hueDrift: 0,
};

export interface UniverseDef {
  id: UniverseId;
  /** Style id used by the shaders. */
  index: number;
  name: string;
  tagline: string;
  /** The universe's look for a given level. */
  env(level: EnvPreset): EnvPreset;
  screen: ScreenLook;
}

type Override = Omit<EnvPreset, 'id' | 'look' | 'surface'> & { structure: number };

/** Build a full preset from a universe's own values, keeping the level's sun direction and look data. */
function own(id: string, o: Override) {
  return (level: EnvPreset): EnvPreset => ({
    ...o,
    id: level.id + ':' + id,
    sky: { ...o.sky, sunDir: level.sky.sunDir },
    surface: level.surface,
    look: { ...level.look, structure: o.structure },
  });
}

const defs: UniverseDef[] = [
  {
    id: 'anime',
    index: 0,
    name: 'Hand-Drawn',
    tagline: 'Ink and cel paint',
    env: (level) => level,
    screen: NO_SCREEN,
  },
  {
    id: 'ink',
    index: 6,
    name: 'Ink',
    tagline: 'Black brush on white paper',
    env: own('ink', {
      structure: 0xe9e6dc,
      sky: {
        top: 0xf4f1e8,
        horizon: 0xe2ded2,
        bottom: 0xbdb8aa,
        sun: 0x111111,
        sunDir: [0, 1, 0],
        sunGlow: 0,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0xe6e2d6, density: 0.0052, base: -10, falloff: 0.03 },
      light: {
        sun: 0xffffff,
        sunIntensity: 2.2,
        skyAmbient: 0xffffff,
        groundAmbient: 0x555555,
        ambient: 1.2,
      },
      palette: {
        base: 0xf1eee4,
        alt: 0xcfcbbf,
        dark: 0x2a2a2c,
        accent: 0xd8261c,
        glass: 0xffffff,
        hazard: 0xd8261c,
      },
      post: { exposure: 1, bloom: 0.12, bloomThreshold: 0.95, vignette: 0.42, saturation: 0, contrast: 0.12 },
      motes: { color: 0x222222, count: 160, rise: -0.5, size: 0.06 },
      hands: { sleeve: 0x1c1c1e, glove: 0xf2efe6, trim: 0xd8261c },
      streak: 0x111111,
    }),
    screen: { ...NO_SCREEN, grain: 0.35, paper: 0.6 },
  },
];

export const UNIVERSES: Record<string, UniverseDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const UNIVERSE_IDS = defs.map((d) => d.id);
export const getUniverse = (id: string): UniverseDef => UNIVERSES[id] ?? UNIVERSES.anime;

/** Each course's dominant universe. */
export const HOME: Record<string, UniverseId> = {
  training: 'anime',
  awakening: 'anime',
  verticality: 'anime',
  momentum: 'anime',
};
export const homeOf = (levelId: string): UniverseId => {
  const h = HOME[levelId] ?? 'anime';
  return UNIVERSES[h] ? h : 'anime';
};
