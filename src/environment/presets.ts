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
  /** Ink line colour (defaults to near-black). */
  ink?: number;
  /** The runner's sleeve / glove / trim colours, chosen to contrast with this level's surfaces. */
  hands: { sleeve: number; glove: number; trim: number };
  /** Colour of speed lines / dash streaks. */
  streak: number;
  /** Phase B art direction: per-level identity layered on the shared inked shader. */
  look: LookPreset;
}

export interface LookPreset {
  /** Coloured fill light added into shadowed areas (lifts mid-tones, tints shade). */
  shade: number;
  shadeAmt: number;
  /** Colour for non-colliding architecture painted with the 'base' material (pillars, towers). */
  structure: number;
  /** Floor motif on walkable tops: 1 tiles, 2 marble veins, 3 hex lattice, 4 circuit traces. */
  motif: 1 | 2 | 3 | 4;
  motifAmt: number;
  /** Bright lip just inside the edge of walkable surfaces: "this is safe ground". */
  lip: number;
  /** Multiplier on glow strips / neon. */
  glow: number;
  /** Distant silhouette skyline in the sky dome: far + near layer colours, height, spires. */
  skyline: { far: number; near: number; height: number; spires: number; windows: number };
}

export const envPresets: Record<string, EnvPreset> = {
  // Training: a calm teal simulation hall at blue hour
  training: {
    id: 'training',
    look: {
      shade: 0x3a6c8c,
      shadeAmt: 0.32,
      structure: 0x9fb8c4,
      motif: 1,
      motifAmt: 1,
      lip: 0.5,
      glow: 1,
      skyline: { far: 0x5a8ea3, near: 0x34596e, height: 0.07, spires: 0, windows: 0.25 },
    },
    hands: { sleeve: 0x2f4fc2, glove: 0x46527e, trim: 0xf1ead8 },
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
      base: 0xc3d1d8,
      alt: 0x6f97aa,
      dark: 0x2c4556,
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
    look: {
      shade: 0x7d5c9e,
      shadeAmt: 0.42,
      structure: 0xf7efe2,
      motif: 2,
      motifAmt: 1,
      lip: 0.55,
      glow: 0.9,
      skyline: { far: 0xe7b9a4, near: 0xc98f8a, height: 0.09, spires: 1, windows: 0 },
    },
    hands: { sleeve: 0x3a4fb8, glove: 0x4a4670, trim: 0xfff3dc },
    sky: {
      top: 0x2f58a8,
      horizon: 0xffc89a,
      bottom: 0xf2a78c,
      sun: 0xfff0cf,
      sunDir: [0.55, 0.32, 0.77],
      sunGlow: 1.0,
      clouds: 0.75,
      cloudColor: 0xffe6d2,
      stars: 0.0,
      aurora: 0.0,
      auroraColor: 0xffffff,
    },
    fog: { color: 0xf6c3a3, density: 0.0036, base: -14, falloff: 0.05 },
    light: { sun: 0xffdcab, sunIntensity: 3.3, skyAmbient: 0xa9c2f2, groundAmbient: 0xc98c7c, ambient: 1.0 },
    palette: {
      base: 0xd9bf9c,
      alt: 0xc9a98a,
      dark: 0x6d5a78,
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
    look: {
      shade: 0x3b2c86,
      shadeAmt: 0.4,
      structure: 0x5b5590,
      motif: 3,
      motifAmt: 1,
      lip: 0.7,
      glow: 0.8,
      skyline: { far: 0x3d1d5c, near: 0x1d1136, height: 0.12, spires: 1, windows: 0.6 },
    },
    hands: { sleeve: 0x14b3a6, glove: 0xffefc4, trim: 0x2a1f4a },
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
    light: { sun: 0xffc2e4, sunIntensity: 2.3, skyAmbient: 0x8f8cff, groundAmbient: 0x2a1640, ambient: 1.1 },
    palette: {
      base: 0x9a95cc,
      alt: 0x6e64a8,
      dark: 0x1a1534,
      accent: 0xff4fb0,
      glass: 0x4fe6d8,
      hazard: 0xff6a1a,
    },
    surface: { roughness: 0.7, metalness: 0.12, seam: 0.14, rim: 0.32 },
    post: {
      exposure: 1.06,
      bloom: 0.7,
      bloomThreshold: 0.78,
      vignette: 0.36,
      saturation: 0.04,
      contrast: 0.06,
    },
    motes: { color: 0xff9be0, count: 300, rise: 0.6, size: 0.06 },
    streak: 0xffd0f2,
  },

  // Level 3 — Momentum: night in a chrome canyon, cyan data rivers, orange warnings
  momentum: {
    id: 'momentum',
    look: {
      shade: 0x2f5f9a,
      shadeAmt: 0.55,
      structure: 0x3e5878,
      motif: 4,
      motifAmt: 1,
      lip: 0.75,
      glow: 0.6,
      skyline: { far: 0x0c2e52, near: 0x061a30, height: 0.1, spires: 0, windows: 1 },
    },
    hands: { sleeve: 0x7f9bd0, glove: 0xf2eee4, trim: 0x16264a },
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
      aurora: 0.45,
      auroraColor: 0x1fd8ff,
    },
    fog: { color: 0x123d66, density: 0.0046, base: -25, falloff: 0.028 },
    light: { sun: 0xdcefff, sunIntensity: 2.4, skyAmbient: 0x6fa8e6, groundAmbient: 0x14284a, ambient: 1.45 },
    palette: {
      base: 0x506a8a,
      alt: 0x3f5a7c,
      dark: 0x16233a,
      accent: 0x3fdcf5,
      glass: 0xdff8ff,
      hazard: 0xff7a14,
    },
    surface: { roughness: 0.42, metalness: 0.55, seam: 0.16, rim: 0.4 },
    post: {
      exposure: 1.08,
      bloom: 0.62,
      bloomThreshold: 0.82,
      vignette: 0.34,
      saturation: 0.14,
      contrast: 0.1,
    },
    motes: { color: 0x7fe9ff, count: 340, rise: -0.4, size: 0.05 },
    streak: 0xc9f6ff,
  },
};

/** Phase E courses: each starts from an existing preset and gets its own sky, light and palette. */
const derive = (from: EnvPreset, id: string, o: Partial<EnvPreset>): EnvPreset => ({ ...from, ...o, id });
const E = envPresets;
envPresets.breakpoint = derive(E.awakening, 'breakpoint', {
  sky: {
    ...E.awakening.sky,
    top: 0x2f7fe0,
    horizon: 0x9fd8ff,
    bottom: 0x6aa6e8,
    sun: 0xfff6d0,
    sunDir: [-0.2, 0.9, -0.3],
    sunGlow: 0.5,
    clouds: 0.55,
    cloudColor: 0xffffff,
    stars: 0,
    aurora: 0,
  },
  fog: { color: 0xa9d6ff, density: 0.0032, base: -20, falloff: 0.03 },
  light: { sun: 0xfff3d6, sunIntensity: 2.8, skyAmbient: 0xbfe0ff, groundAmbient: 0x6a5a3a, ambient: 1.6 },
  palette: {
    base: 0xf3e4b0,
    alt: 0x3fb7c9,
    dark: 0x1f2a44,
    accent: 0xff4f2e,
    glass: 0xffffff,
    hazard: 0xff2e2e,
  },
});
envPresets.inkfalls = derive(E.verticality, 'inkfalls', {
  sky: {
    ...E.verticality.sky,
    top: 0x9a9a96,
    horizon: 0xe9e6dc,
    bottom: 0xcfccc2,
    sun: 0xffffff,
    sunDir: [0.3, 0.6, -0.7],
    sunGlow: 0.2,
    clouds: 0.4,
    cloudColor: 0xf4f2ea,
    stars: 0,
    aurora: 0,
  },
  fog: { color: 0xdcd8cc, density: 0.006, base: -40, falloff: 0.02 },
  light: { sun: 0xffffff, sunIntensity: 2.2, skyAmbient: 0xe6e3da, groundAmbient: 0x4a4844, ambient: 1.5 },
  palette: {
    base: 0xe8e4d8,
    alt: 0xb9b4a6,
    dark: 0x1c1c22,
    accent: 0xc8322a,
    glass: 0xffffff,
    hazard: 0xc8322a,
  },
});
envPresets.faceted = derive(E.awakening, 'faceted', {
  sky: {
    ...E.awakening.sky,
    top: 0x5a86c8,
    horizon: 0xffd2a0,
    bottom: 0xe8b08a,
    sun: 0xffe0a8,
    sunDir: [0.6, 0.35, -0.7],
    sunGlow: 0.6,
    clouds: 0.35,
    cloudColor: 0xffe8d0,
    stars: 0,
    aurora: 0,
  },
  fog: { color: 0xf0c8a4, density: 0.004, base: -20, falloff: 0.03 },
  light: { sun: 0xffe2b8, sunIntensity: 2.6, skyAmbient: 0xa8c0e8, groundAmbient: 0x6a4a3a, ambient: 1.5 },
  palette: {
    base: 0xd9c7a6,
    alt: 0x7fb08a,
    dark: 0x3a3048,
    accent: 0xff8a3c,
    glass: 0xfff4e0,
    hazard: 0xff5a2e,
  },
});
envPresets.blockfall = derive(E.training, 'blockfall', {
  sky: {
    ...E.training.sky,
    top: 0x3a8cff,
    horizon: 0xbfe6ff,
    bottom: 0x8ac4ff,
    sun: 0xffffff,
    sunDir: [0.3, 0.8, -0.5],
    sunGlow: 0.4,
    clouds: 0.6,
    cloudColor: 0xffffff,
    stars: 0,
    aurora: 0,
  },
  fog: { color: 0xbfe0ff, density: 0.0035, base: -30, falloff: 0.025 },
  light: { sun: 0xffffff, sunIntensity: 2.7, skyAmbient: 0xc8e4ff, groundAmbient: 0x4a6a3a, ambient: 1.6 },
  palette: {
    base: 0x9a9a9a,
    alt: 0x6abf4a,
    dark: 0x3a2a1e,
    accent: 0xffc83c,
    glass: 0xe0f4ff,
    hazard: 0xff4a2e,
  },
});
envPresets.core = derive(E.momentum, 'core', {
  sky: {
    ...E.momentum.sky,
    top: 0x050308,
    horizon: 0x2a0a18,
    bottom: 0x030205,
    sun: 0xff3c5a,
    sunDir: [0, 0.4, -0.9],
    sunGlow: 0.5,
    clouds: 0.15,
    cloudColor: 0x3a0a1c,
    stars: 0.6,
    aurora: 0.5,
    auroraColor: 0x16ff73,
  },
  fog: { color: 0x1a0812, density: 0.005, base: -25, falloff: 0.03 },
  light: { sun: 0xffc0cc, sunIntensity: 2.2, skyAmbient: 0x7a3a5a, groundAmbient: 0x14100a, ambient: 1.4 },
  palette: {
    base: 0x5a5a66,
    alt: 0x3a3a48,
    dark: 0x0e0c12,
    accent: 0x16ff73,
    glass: 0xe0ffe8,
    hazard: 0xff1a3c,
  },
});

envPresets.shiftpoint = derive(E.momentum, 'shiftpoint', {
  sky: {
    ...E.momentum.sky,
    top: 0x1a0638,
    horizon: 0xff5ab8,
    bottom: 0x2a0a4a,
    sun: 0xfff0a0,
    sunDir: [0.2, 0.4, -0.9],
    sunGlow: 0.7,
    clouds: 0.4,
    cloudColor: 0xb05aff,
    stars: 0.5,
    aurora: 0.7,
    auroraColor: 0x3dffd2,
  },
  fog: { color: 0x5a1a7a, density: 0.0035, base: -40, falloff: 0.02 },
  light: { sun: 0xffe8d0, sunIntensity: 2.5, skyAmbient: 0xc08aff, groundAmbient: 0x2a1040, ambient: 1.5 },
  palette: {
    base: 0xd8c8f0,
    alt: 0x7a5ad8,
    dark: 0x1c0e30,
    accent: 0x3dffd2,
    glass: 0xfff0ff,
    hazard: 0xff3d6e,
  },
});
export const getEnv = (id: string): EnvPreset => envPresets[id] ?? envPresets.training;
