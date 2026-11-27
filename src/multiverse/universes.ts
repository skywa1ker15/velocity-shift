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
  /** Rain streaks across the lens. */
  rain: number;
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
  rain: 0,
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
    id: 'neon',
    index: 1,
    name: 'Neon District',
    tagline: 'Rain, glass and light',
    env: own('neon', {
      structure: 0x10142a,
      sky: {
        top: 0x05030f,
        horizon: 0x2a1450,
        bottom: 0x0a0618,
        sun: 0xcfd8ff,
        sunDir: [0, 1, 0],
        sunGlow: 0.4,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0x1a1038, density: 0.0072, base: -10, falloff: 0.03 },
      light: {
        sun: 0x8fa8ff,
        sunIntensity: 1.1,
        skyAmbient: 0x6a5cff,
        groundAmbient: 0x301040,
        ambient: 0.95,
      },
      palette: {
        base: 0x1a2036,
        alt: 0x242c4a,
        dark: 0x0b0d18,
        accent: 0xffb000,
        glass: 0x7ff0ff,
        hazard: 0xff2030,
      },
      post: {
        exposure: 1.05,
        bloom: 1.2,
        bloomThreshold: 0.62,
        vignette: 0.5,
        saturation: 0.2,
        contrast: 0.12,
      },
      motes: { color: 0x9fd8ff, count: 300, rise: -3.2, size: 0.04 },
      hands: { sleeve: 0x14182c, glove: 0x20263c, trim: 0x19f0ff },
      streak: 0x7ff6ff,
    }),
    screen: { ...NO_SCREEN, rain: 0.85, fringe: 0.35, grain: 0.15 },
  },
  {
    id: 'comic',
    index: 2,
    name: 'Issue #1',
    tagline: 'Four-colour action',
    env: own('comic', {
      structure: 0xff8f73,
      sky: {
        top: 0x2aa7ee,
        horizon: 0xbfeaff,
        bottom: 0x1670b8,
        sun: 0xffe14a,
        sunDir: [0, 1, 0],
        sunGlow: 0,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0x9fdcff, density: 0.003, base: -10, falloff: 0.03 },
      light: {
        sun: 0xffffff,
        sunIntensity: 2.4,
        skyAmbient: 0xbfe0ff,
        groundAmbient: 0x5a4a6a,
        ambient: 1.1,
      },
      palette: {
        base: 0xffe9a8,
        alt: 0x7fd6c2,
        dark: 0x4b3f8f,
        accent: 0xff7a00,
        glass: 0xfff7d0,
        hazard: 0xe4002b,
      },
      post: { exposure: 1, bloom: 0.2, bloomThreshold: 0.9, vignette: 0.3, saturation: 0.3, contrast: 0.15 },
      motes: { color: 0xffffff, count: 120, rise: 0.2, size: 0.06 },
      hands: { sleeve: 0xe4002b, glove: 0xffe14a, trim: 0x1d1d2b },
      streak: 0x111122,
    }),
    screen: { ...NO_SCREEN, paper: 0.35, grain: 0.12 },
  },
  {
    id: 'lowpoly',
    index: 3,
    name: 'Facet Valley',
    tagline: 'Folded light',
    env: own('lowpoly', {
      structure: 0xd98f6a,
      sky: {
        top: 0x3f9ad6,
        horizon: 0xffd9b0,
        bottom: 0x5a7a9a,
        sun: 0xfff2c0,
        sunDir: [0, 1, 0],
        sunGlow: 0.3,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0xf3c9a8, density: 0.0036, base: -10, falloff: 0.03 },
      light: {
        sun: 0xfff0d0,
        sunIntensity: 2.3,
        skyAmbient: 0xa8d8ff,
        groundAmbient: 0x6a5a4a,
        ambient: 1.15,
      },
      palette: {
        base: 0xe8d9b8,
        alt: 0x7fc8a9,
        dark: 0x4a5a7a,
        accent: 0xff8a3c,
        glass: 0xbff3ff,
        hazard: 0xff3b5c,
      },
      post: {
        exposure: 1,
        bloom: 0.35,
        bloomThreshold: 0.85,
        vignette: 0.25,
        saturation: 0.12,
        contrast: 0.04,
      },
      motes: { color: 0xffffff, count: 180, rise: 0.15, size: 0.06 },
      hands: { sleeve: 0x3f9ad6, glove: 0xfff2e0, trim: 0xff8a3c },
      streak: 0xffffff,
    }),
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
        accent: 0x15151a,
        glass: 0xffffff,
        hazard: 0xd8261c,
      },
      post: { exposure: 1, bloom: 0.12, bloomThreshold: 0.95, vignette: 0.42, saturation: 0, contrast: 0.12 },
      motes: { color: 0x222222, count: 160, rise: -0.5, size: 0.06 },
      hands: { sleeve: 0x1c1c1e, glove: 0xf2efe6, trim: 0x8a8a86 },
      streak: 0x111111,
    }),
    screen: { ...NO_SCREEN, grain: 0.35, paper: 0.6 },
  },
  {
    id: 'synth',
    index: 8,
    name: 'Outrun',
    tagline: 'Sunset on the grid',
    env: own('synth', {
      structure: 0x241050,
      sky: {
        top: 0x0a0326,
        horizon: 0x5a1a7a,
        bottom: 0x12062e,
        sun: 0xffe066,
        sunDir: [0, 1, 0],
        sunGlow: 0.5,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 1,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0x3a0f5a, density: 0.0048, base: -10, falloff: 0.03 },
      light: {
        sun: 0xff8ad0,
        sunIntensity: 1.2,
        skyAmbient: 0x7a5cff,
        groundAmbient: 0x2a0a40,
        ambient: 0.9,
      },
      palette: {
        base: 0x6a3aa8,
        alt: 0x3a2470,
        dark: 0x12082a,
        accent: 0xfff06a,
        glass: 0x7ff6ff,
        hazard: 0xff2030,
      },
      post: {
        exposure: 1.05,
        bloom: 1.25,
        bloomThreshold: 0.58,
        vignette: 0.45,
        saturation: 0.25,
        contrast: 0.12,
      },
      motes: { color: 0xff7ad9, count: 200, rise: 0.3, size: 0.05 },
      hands: { sleeve: 0x241050, glove: 0x12082a, trim: 0xff2fa0 },
      streak: 0xff7ad9,
    }),
    screen: { ...NO_SCREEN, scan: 0.6, fringe: 0.5, grain: 0.12 },
  },
];

export const UNIVERSES: Record<string, UniverseDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const UNIVERSE_IDS = defs.map((d) => d.id);
export const getUniverse = (id: string): UniverseDef => UNIVERSES[id] ?? UNIVERSES.anime;

/** Each course's dominant universe. */
export const HOME: Record<string, UniverseId> = {
  training: 'anime',
  awakening: 'anime',
  verticality: 'neon',
  momentum: 'synth',
};
export const homeOf = (levelId: string): UniverseId => {
  const h = HOME[levelId] ?? 'anime';
  return UNIVERSES[h] ? h : 'anime';
};
