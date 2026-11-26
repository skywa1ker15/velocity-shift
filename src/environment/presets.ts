/**
 * Environment presets: sky, fog, lighting, material palette and post-processing per level.
 * This is the "Dreamlike Brutalism" art direction expressed as data (docs/ART_DIRECTION.md).
 */

export interface EnvPreset {
  id: string;
  sky: {
    top: number;
    horizon: number;
    bottom: number;
    sun: number;
    sunDir: [number, number, number];
    sunGlow: number;
    clouds: number; // 0..1 amount
    cloudColor: number;
    stars: number; // 0..1
    aurora: number; // 0..1 flowing light bands (night skies)
    auroraColor: number;
  };
  fog: { color: number; density: number; base: number; falloff: number };
  light: { sun: number; sunIntensity: number; skyAmbient: number; groundAmbient: number; ambient: number };
  palette: { base: number; alt: number; dark: number; accent: number; glass: number; hazard: number };
  /** Material response. */
  surface: { roughness: number; metalness: number; seam: number; rim: number };
  post: {
    exposure: number;
    bloom: number;
    bloomThreshold: number;
    vignette: number;
    saturation: number;
    contrast: number;
  };
  motes: { color: number; count: number; rise: number; size: number };
  /** Colour of speed lines / dash streaks. */
  streak: number;
}

export const envPresets: Record<string, EnvPreset> = {
  // Training: a calm teal simulation hall at blue hour
  training: {
    id: 'training',
    sky: {
      top: 0x16233f,
      horizon: 0x6aa6b8,
      bottom: 0x1a2c3c,
      sun: 0xfff1d6,
      sunDir: [-0.45, 0.42, 0.6],
      sunGlow: 0.5,
      clouds: 0.35,
      cloudColor: 0x9fd0d8,
      stars: 0.35,
      aurora: 0.0,
      auroraColor: 0x66ffe0,
    },
    fog: { color: 0x5f97aa, density: 0.0042, base: -8, falloff: 0.035 },
    light: { sun: 0xffe9c8, sunIntensity: 2.4, skyAmbient: 0x9fd4ff, groundAmbient: 0x24384a, ambient: 1.15 },
    palette: {
      base: 0xc9d6dc,
      alt: 0x8fb3c2,
      dark: 0x3d5566,
      accent: 0xff9a3c,
      glass: 0xa8f0ff,
      hazard: 0xff2d55,
    },
    surface: { roughness: 0.82, metalness: 0.05, seam: 0.1, rim: 0.2 },
    post: {
      exposure: 1.0,
      bloom: 0.55,
      bloomThreshold: 0.82,
      vignette: 0.32,
      saturation: 0.08,
      contrast: 0.06,
    },
    motes: { color: 0xbff4ff, count: 220, rise: 0.25, size: 0.07 },
    streak: 0xdff8ff,
  },

  // Level 1 — The Awakening: dawn above a sea of clouds, pale marble, gold light
  awakening: {
    id: 'awakening',
    sky: {
      top: 0x3f6cc0,
      horizon: 0xffd2a6,
      bottom: 0xf2a78c,
      sun: 0xfff0cf,
      sunDir: [0.35, 0.2, 0.92],
      sunGlow: 1.0,
      clouds: 0.75,
      cloudColor: 0xffe6d2,
      stars: 0.0,
      aurora: 0.0,
      auroraColor: 0xffffff,
    },
    fog: { color: 0xf6c3a3, density: 0.0036, base: -14, falloff: 0.05 },
    light: { sun: 0xffe2b8, sunIntensity: 3.1, skyAmbient: 0xb8d4ff, groundAmbient: 0xe8a58a, ambient: 1.25 },
    palette: {
      base: 0xf1e9dc,
      alt: 0xd9c7b0,
      dark: 0x7c6f80,
      accent: 0xff8a3d,
      glass: 0xc8ecff,
      hazard: 0xe8204f,
    },
    surface: { roughness: 0.78, metalness: 0.0, seam: 0.09, rim: 0.22 },
    post: {
      exposure: 1.02,
      bloom: 0.5,
      bloomThreshold: 0.88,
      vignette: 0.26,
      saturation: 0.1,
      contrast: 0.04,
    },
    motes: { color: 0xfff3d6, count: 260, rise: 0.35, size: 0.06 },
    streak: 0xfff6e6,
  },

  // Level 2 — Verticality: dusk into night, violet spires, hot magenta veins
  verticality: {
    id: 'verticality',
    sky: {
      top: 0x08071f,
      horizon: 0x7a2f7c,
      bottom: 0x130a2c,
      sun: 0xff9ad5,
      sunDir: [-0.5, 0.12, 0.85],
      sunGlow: 0.8,
      clouds: 0.55,
      cloudColor: 0x9b4a9e,
      stars: 0.9,
      aurora: 0.35,
      auroraColor: 0x38e0c8,
    },
    fog: { color: 0x4a2260, density: 0.0046, base: -20, falloff: 0.03 },
    light: { sun: 0xffa8d8, sunIntensity: 2.1, skyAmbient: 0x8a7cff, groundAmbient: 0x3a1746, ambient: 1.3 },
    palette: {
      base: 0x756f9e,
      alt: 0x8f84c4,
      dark: 0x231f3e,
      accent: 0xff3fa8,
      glass: 0x4fe6d8,
      hazard: 0xff6a1a,
    },
    surface: { roughness: 0.7, metalness: 0.12, seam: 0.14, rim: 0.32 },
    post: {
      exposure: 1.1,
      bloom: 0.85,
      bloomThreshold: 0.72,
      vignette: 0.4,
      saturation: 0.04,
      contrast: 0.06,
    },
    motes: { color: 0xff9be0, count: 300, rise: 0.6, size: 0.06 },
    streak: 0xffd0f2,
  },

  // Level 3 — Momentum: night in a chrome canyon, cyan data rivers, orange warnings
  momentum: {
    id: 'momentum',
    sky: {
      top: 0x01040d,
      horizon: 0x0d3a66,
      bottom: 0x010309,
      sun: 0xbfe9ff,
      sunDir: [0.3, 0.5, -0.8],
      sunGlow: 0.35,
      clouds: 0.25,
      cloudColor: 0x1c5d8a,
      stars: 1.0,
      aurora: 0.8,
      auroraColor: 0x1fd8ff,
    },
    fog: { color: 0x08294a, density: 0.0038, base: -25, falloff: 0.028 },
    light: { sun: 0xcfeaff, sunIntensity: 1.9, skyAmbient: 0x4fb6ff, groundAmbient: 0x08182c, ambient: 1.35 },
    palette: {
      base: 0x33455c,
      alt: 0x4d6a8c,
      dark: 0x0e1622,
      accent: 0x21e4ff,
      glass: 0xdff8ff,
      hazard: 0xff7a14,
    },
    surface: { roughness: 0.42, metalness: 0.55, seam: 0.16, rim: 0.4 },
    post: {
      exposure: 1.12,
      bloom: 1.0,
      bloomThreshold: 0.66,
      vignette: 0.42,
      saturation: 0.14,
      contrast: 0.1,
    },
    motes: { color: 0x7fe9ff, count: 340, rise: -0.4, size: 0.05 },
    streak: 0xc9f6ff,
  },
};

export const getEnv = (id: string): EnvPreset => envPresets[id] ?? envPresets.training;
