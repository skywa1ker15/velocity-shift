/** Player settings: one typed model, defaults, and the Reduce Motion derivation. */

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'auto';
export type SprintMode = 'auto' | 'hold' | 'toggle';
export type SlideMode = 'hold' | 'toggle';

export interface Settings {
  // graphics
  preset: GraphicsPreset;
  resolutionScale: number; // 0.5 .. 1
  shadows: boolean;
  postFx: boolean;
  particles: number; // 0 .. 1 density
  fpsCap: number; // 0 = unlimited
  showFps: boolean;
  // display
  fov: number; // horizontal field of view in degrees, measured at 16:9
  speedFov: number; // 0 .. 1
  brightness: number; // 0.6 .. 1.4
  // controls
  sensitivity: number;
  invertY: boolean;
  sprintMode: SprintMode;
  slideMode: SlideMode;
  // comfort
  reduceMotion: boolean;
  headBob: number;
  cameraRoll: number;
  cameraShake: number;
  speedLines: number;
  colorblind: boolean;
  captions: boolean;
  tutorials: boolean;
  // audio
  volMaster: number;
  volMusic: number;
  volSfx: number;
  volAmbience: number;
  volUi: number;
  // gameplay / hud
  ghost: boolean;
  showSpeed: boolean;
  showIndicators: boolean;
  crosshair: 'dot' | 'ring' | 'off';
  hudScale: number;
  hudOpacity: number;
  hideHud: boolean;
  unlockAll: boolean;
  /**
   * dynamic: universes shift during a run. home: each level stays in its home universe.
   * classic: the original hand-drawn look everywhere.
   */
  multiverse: 'dynamic' | 'home' | 'classic';
  /** 0 .. 1: strength of flashes, glitches, colour fringes and hue drift. */
  shiftIntensity: number;
}

export const defaultSettings: Settings = {
  preset: 'auto',
  resolutionScale: 1,
  shadows: true,
  postFx: true,
  particles: 1,
  fpsCap: 0,
  showFps: false,
  fov: 105,
  speedFov: 1,
  brightness: 1,
  sensitivity: 1,
  invertY: false,
  sprintMode: 'auto',
  slideMode: 'hold',
  reduceMotion: false,
  headBob: 1,
  cameraRoll: 1,
  cameraShake: 1,
  speedLines: 1,
  colorblind: false,
  captions: false,
  tutorials: true,
  volMaster: 0.8,
  volMusic: 0.6,
  volSfx: 0.9,
  volAmbience: 0.7,
  volUi: 0.7,
  ghost: true,
  showSpeed: true,
  showIndicators: true,
  crosshair: 'dot',
  hudScale: 1,
  hudOpacity: 1,
  hideHud: false,
  unlockAll: false,
  multiverse: 'dynamic',
  shiftIntensity: 1,
};

/** Effective motion multipliers after applying the Reduce Motion master toggle. */
export interface MotionProfile {
  headBob: number;
  roll: number;
  shake: number;
  speedFov: number;
  speedLines: number;
  screenFx: boolean; // radial blur / chromatic aberration
}

export function motionProfile(s: Settings): MotionProfile {
  if (s.reduceMotion) {
    return {
      headBob: 0,
      roll: s.cameraRoll * 0.25,
      shake: 0,
      speedFov: s.speedFov * 0.3,
      speedLines: s.speedLines * 0.3,
      screenFx: false,
    };
  }
  return {
    headBob: s.headBob,
    roll: s.cameraRoll,
    shake: s.cameraShake,
    speedFov: s.speedFov,
    speedLines: s.speedLines,
    screenFx: true,
  };
}

/** Clamp / repair settings loaded from storage (unknown keys dropped, bad values reset). */
export function sanitizeSettings(raw: unknown): Settings {
  const out: any = { ...defaultSettings };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(defaultSettings) as (keyof Settings)[]) {
      const v = (raw as any)[k];
      if (typeof v === typeof defaultSettings[k]) out[k] = v;
    }
  }
  const num = (k: keyof Settings, lo: number, hi: number) => {
    const v = out[k];
    out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : defaultSettings[k];
  };
  num('resolutionScale', 0.5, 1);
  num('particles', 0, 1);
  num('fpsCap', 0, 360);
  num('fov', 80, 120);
  num('speedFov', 0, 1);
  num('brightness', 0.6, 1.4);
  num('sensitivity', 0.1, 5);
  num('headBob', 0, 1);
  num('cameraRoll', 0, 1);
  num('cameraShake', 0, 1);
  num('speedLines', 0, 1);
  num('volMaster', 0, 1);
  num('volMusic', 0, 1);
  num('volSfx', 0, 1);
  num('volAmbience', 0, 1);
  num('volUi', 0, 1);
  num('hudScale', 0.7, 1.4);
  num('hudOpacity', 0.2, 1);
  num('shiftIntensity', 0, 1);
  if (!['dynamic', 'home', 'classic'].includes(out.multiverse)) out.multiverse = 'dynamic';
  if (!['low', 'medium', 'high', 'ultra', 'auto'].includes(out.preset)) out.preset = 'auto';
  if (!['auto', 'hold', 'toggle'].includes(out.sprintMode)) out.sprintMode = 'auto';
  if (!['hold', 'toggle'].includes(out.slideMode)) out.slideMode = 'hold';
  if (!['dot', 'ring', 'off'].includes(out.crosshair)) out.crosshair = 'dot';
  return out as Settings;
}
