import type { TrailLook } from '../fx/SlashFx';
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

/** How movement feedback is drawn in a universe. */
export interface FxLook {
  /** Speed lines: 0 inked, 1 light streaks, 2 comic wedges, 3 pixel blocks, 4 dry brush. */
  lines: number;
  /** Decal / puff sprites: 0 inked, 1 glowing, 2 black-and-paper, 3 pixel, 4 corrupted. */
  sprites: number;
  /** Dust kicked up by feet. */
  dust: number;
  /** Streaks in the air are ink-dark rather than light. */
  darkStreaks: boolean;
  /**
   * What a slide throws off. `colors` cycle through the sparks (empty = the suit's accent), `size`
   * and `rate` scale them, `life` is their lifetime in seconds. rate 0: no sparks (ink: the dark
   * dust does the work; sparks are additive and would vanish).
   */
  slide: { colors: number[]; size: number; rate: number; life: number };
  /** Sword stroke: body tint (null = the suit accent), border colour, streakiness, edge heat. */
  trail: TrailLook;
  /** Phase G: how this universe breaks apart — chunk shape and how many / how hard they fly. */
  debris: { shape: 'cube' | 'shard' | 'slab'; amount: number; push: number };
}

export const FX: Record<UniverseId, FxLook> = {
  anime: {
    lines: 0,
    sprites: 0,
    dust: 0xf6f2e6,
    darkStreaks: false,
    slide: { colors: [], size: 1, rate: 1, life: 0.3 },
    trail: { tint: null, ink: 0x0b0d14, streak: 1, hot: 1, style: 0 },
    debris: { shape: 'slab', amount: 1, push: 3.5 },
  },
  neon: {
    lines: 1,
    sprites: 1,
    dust: 0x7ff6ff,
    darkStreaks: false,
    slide: { colors: [0x19f2ff, 0xff2bd6], size: 1.2, rate: 1.5, life: 0.45 },
    trail: { tint: 0x19f2ff, ink: 0xff2bd6, streak: 0.35, hot: 1.4, style: 1 },
    debris: { shape: 'shard', amount: 0.8, push: 4 },
  },
  comic: {
    lines: 2,
    sprites: 0,
    dust: 0xffffff,
    darkStreaks: true,
    slide: { colors: [0xffe23d, 0xffffff], size: 1.6, rate: 0.8, life: 0.25 },
    trail: { tint: 0xffe23d, ink: 0x050508, streak: 0, hot: 1, style: 2 },
    debris: { shape: 'slab', amount: 1.3, push: 5 },
  },
  lowpoly: {
    lines: 0,
    sprites: 0,
    dust: 0xfff2e0,
    darkStreaks: false,
    slide: { colors: [0xffd9a0, 0xfff2e0], size: 1.9, rate: 0.7, life: 0.35 },
    trail: { tint: null, ink: 0x2a2f45, streak: 0, hot: 0.8, style: 4 },
    debris: { shape: 'shard', amount: 1, push: 3 },
  },
  psyche: {
    lines: 1,
    sprites: 1,
    dust: 0xfff23d,
    darkStreaks: false,
    slide: { colors: [0xff3d6e, 0xffd23d, 0x3dff9e, 0x3d9eff, 0xc13dff], size: 1.3, rate: 1.4, life: 0.4 },
    trail: { tint: 0xff3d6e, ink: 0x3d9eff, streak: 0.6, hot: 1.3, style: 6 },
    debris: { shape: 'shard', amount: 1.2, push: 4.5 },
  },
  voxel: {
    lines: 3,
    sprites: 3,
    dust: 0xffffff,
    darkStreaks: false,
    slide: { colors: [0xffffff, 0xb7e4ff], size: 2.4, rate: 0.6, life: 0.4 },
    trail: { tint: 0xffffff, ink: 0x14161f, streak: 0, hot: 0.9, style: 4 },
    debris: { shape: 'cube', amount: 1.4, push: 3 },
  },
  ink: {
    lines: 4,
    sprites: 2,
    dust: 0x222222,
    darkStreaks: true,
    slide: { colors: [], size: 1, rate: 0, life: 0.3 },
    trail: { tint: 0x15151c, ink: 0x0a0a0d, streak: 1.4, hot: 1.2, style: 3 },
    debris: { shape: 'slab', amount: 0.9, push: 2.5 },
  },
  painted: {
    lines: 4,
    sprites: 0,
    dust: 0xfff0c0,
    darkStreaks: false,
    slide: { colors: [0xffc46b, 0xfff0c0], size: 1.5, rate: 0.9, life: 0.5 },
    trail: { tint: 0xffc46b, ink: 0x6b3a1e, streak: 1.2, hot: 0.9, style: 7 },
    debris: { shape: 'slab', amount: 1, push: 3 },
  },
  synth: {
    lines: 1,
    sprites: 1,
    dust: 0xff7ad9,
    darkStreaks: false,
    slide: { colors: [0xff2e9f, 0xffd23d], size: 1.2, rate: 1.4, life: 0.4 },
    trail: { tint: 0xff2e9f, ink: 0x19f2ff, streak: 0.4, hot: 1.4, style: 1 },
    debris: { shape: 'cube', amount: 0.8, push: 4 },
  },
  corrupt: {
    lines: 1,
    sprites: 4,
    dust: 0x16ff73,
    darkStreaks: false,
    slide: { colors: [0x16ff73, 0xff1a3c, 0x1a5cff], size: 1.3, rate: 1.2, life: 0.22 },
    trail: { tint: 0x16ff73, ink: 0xff1a3c, streak: 0.8, hot: 1.2, style: 5 },
    debris: { shape: 'cube', amount: 1.2, push: 6 },
  },
};

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
    id: 'psyche',
    index: 4,
    name: 'The Bloom',
    tagline: 'Colour without rules',
    env: own('psyche', {
      structure: 0x8a3dff,
      sky: {
        top: 0x2a0a5a,
        horizon: 0xff5ad0,
        bottom: 0x12062e,
        sun: 0xffffff,
        sunDir: [0, 1, 0],
        sunGlow: 0.3,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0x5a1a8a, density: 0.0042, base: -10, falloff: 0.03 },
      light: {
        sun: 0xffe6ff,
        sunIntensity: 1.9,
        skyAmbient: 0xc8a0ff,
        groundAmbient: 0x40206a,
        ambient: 1.1,
      },
      palette: {
        base: 0xff8ad0,
        alt: 0x5ad0ff,
        dark: 0x3a1a6a,
        accent: 0xffffff,
        glass: 0xfff23d,
        hazard: 0xff1a1a,
      },
      post: { exposure: 1, bloom: 0.7, bloomThreshold: 0.75, vignette: 0.4, saturation: 0.3, contrast: 0.08 },
      motes: { color: 0xfff23d, count: 260, rise: 0.5, size: 0.07 },
      hands: { sleeve: 0x8a3dff, glove: 0x3dffd9, trim: 0xfff23d },
      streak: 0xffffff,
    }),
    screen: { ...NO_SCREEN, hueDrift: 0.45, fringe: 0.5, grain: 0.1 },
  },
  {
    id: 'voxel',
    index: 5,
    name: 'Blockworld',
    tagline: 'Built one cube at a time',
    env: own('voxel', {
      structure: 0xb0b4bc,
      sky: {
        top: 0x4a90e8,
        horizon: 0xbfe4ff,
        bottom: 0x3a6ea8,
        sun: 0xfff4b0,
        sunDir: [0, 1, 0],
        sunGlow: 0.3,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0xbfe4ff, density: 0.0034, base: -10, falloff: 0.03 },
      light: {
        sun: 0xfff6dc,
        sunIntensity: 2.3,
        skyAmbient: 0xbcdcff,
        groundAmbient: 0x5a6a50,
        ambient: 1.15,
      },
      palette: {
        base: 0xc0c4c8,
        alt: 0x9aa0a8,
        dark: 0x4e5560,
        accent: 0xff9a2e,
        glass: 0x7fe8ff,
        hazard: 0xff3030,
      },
      post: {
        exposure: 1,
        bloom: 0.25,
        bloomThreshold: 0.88,
        vignette: 0.25,
        saturation: 0.16,
        contrast: 0.06,
      },
      motes: { color: 0xffffff, count: 140, rise: 0.1, size: 0.08 },
      hands: { sleeve: 0x2e9ad6, glove: 0xe8c9a0, trim: 0x3a3f8f },
      streak: 0xffffff,
    }),
    screen: { ...NO_SCREEN, pixel: 3, posterize: 20 },
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
    id: 'painted',
    index: 7,
    name: 'Elderwild',
    tagline: 'Oil, gold and old stone',
    env: own('painted', {
      structure: 0xd8c6aa,
      sky: {
        top: 0x3a5a9a,
        horizon: 0xffd9a0,
        bottom: 0x4a4a6a,
        sun: 0xfff0c0,
        sunDir: [0, 1, 0],
        sunGlow: 0.3,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0xe9c9a0, density: 0.0044, base: -10, falloff: 0.03 },
      light: {
        sun: 0xffe2b0,
        sunIntensity: 2.4,
        skyAmbient: 0x9ab8ff,
        groundAmbient: 0x6a5040,
        ambient: 1.1,
      },
      palette: {
        base: 0xd6c2a2,
        alt: 0x86a890,
        dark: 0x7a6a86,
        accent: 0xffa62e,
        glass: 0xa8e8ff,
        hazard: 0xe0243a,
      },
      post: {
        exposure: 1.04,
        bloom: 0.5,
        bloomThreshold: 0.8,
        vignette: 0.38,
        saturation: 0.18,
        contrast: 0.08,
      },
      motes: { color: 0xffe9a0, count: 240, rise: 0.25, size: 0.06 },
      hands: { sleeve: 0x7a2e3a, glove: 0xa8784a, trim: 0xe0b84a },
      streak: 0xfff0c0,
    }),
    screen: { ...NO_SCREEN, paper: 0.55, grain: 0.2 },
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
  {
    id: 'corrupt',
    index: 9,
    name: 'ERR_REALITY',
    tagline: 'The data is failing',
    env: own('corrupt', {
      structure: 0x6a727c,
      sky: {
        top: 0x0a0c12,
        horizon: 0x2a3440,
        bottom: 0x050608,
        sun: 0xffffff,
        sunDir: [0, 1, 0],
        sunGlow: 0.3,
        clouds: 0,
        cloudColor: 0xffffff,
        stars: 0,
        aurora: 0,
        auroraColor: 0xffffff,
      },
      fog: { color: 0x10141a, density: 0.0056, base: -10, falloff: 0.03 },
      light: {
        sun: 0xdfe8ff,
        sunIntensity: 1.8,
        skyAmbient: 0x8aa0b8,
        groundAmbient: 0x202830,
        ambient: 1.0,
      },
      palette: {
        base: 0x9aa2ad,
        alt: 0x6a727c,
        dark: 0x2a2e36,
        accent: 0xffc400,
        glass: 0x16ff73,
        hazard: 0xff1e3c,
      },
      post: {
        exposure: 1,
        bloom: 0.7,
        bloomThreshold: 0.7,
        vignette: 0.5,
        saturation: -0.05,
        contrast: 0.14,
      },
      motes: { color: 0x16ff73, count: 200, rise: 1.2, size: 0.05 },
      hands: { sleeve: 0x4a5058, glove: 0x9aa2ad, trim: 0x16ff73 },
      streak: 0x16ff73,
    }),
    screen: { ...NO_SCREEN, fringe: 0.7, scan: 0.35, grain: 0.3 },
  },
];

export const UNIVERSES: Record<string, UniverseDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const UNIVERSE_IDS = defs.map((d) => d.id);
export const getUniverse = (id: string): UniverseDef => UNIVERSES[id] ?? UNIVERSES.anime;

/** Each course's dominant universe. */
export const HOME: Record<string, UniverseId> = {
  training: 'anime',
  awakening: 'painted',
  verticality: 'neon',
  momentum: 'synth',
  breakpoint: 'comic',
  inkfalls: 'ink',
  faceted: 'lowpoly',
  blockfall: 'voxel',
  core: 'corrupt',
  shiftpoint: 'psyche',
};
export const homeOf = (levelId: string): UniverseId => {
  const h = HOME[levelId] ?? 'anime';
  return UNIVERSES[h] ? h : 'anime';
};
