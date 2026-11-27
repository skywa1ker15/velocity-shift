/**
 * UI state store (Zustand). The game writes to it at a low rate (HUD ~30 Hz, events as they
 * happen); React reads from it. React never runs inside the game loop.
 */
import { create } from 'zustand';
import type { ResultsData } from '../progression/Progression';

export type Screen =
  | 'boot' // loading shell
  | 'title' // "click to start" gate
  | 'menu'
  | 'levels'
  | 'collection'
  | 'credits'
  | 'loading'
  | 'ready' // level loaded, waiting for the click that locks the pointer
  | 'playing'
  | 'paused'
  | 'results'
  | 'unsupported'
  | 'touch';

export type Overlay = null | 'settings' | 'controls';

export interface HudState {
  time: number;
  started: boolean;
  speed: number;
  dash: number; // 0..2 energy
  doubleJump: boolean;
  wall: number; // 0..1 wall-run time left, 0 when not wall-running
  sliding: boolean;
  fps: number;
  checkpoint: number;
  checkpoints: number;
  /** Sword: phase (0 stowed … 4 sheathing), ground-combo count, auto-sheathe progress 0..1. */
  sword: { phase: number; combo: number; idle: number; cuts: number; total: number };
  /** 0..1 while R is held toward a full level restart, -1 otherwise. */
  restartHold: number;
  /** Dash charges available at most (Phase Dash raises it). */
  dashMax: number;
  /** Evolve mode HUD (null in Pure). */
  evo: EvoHud | null;
}

export interface EvoHud {
  flux: number;
  tier: number;
  /** 0..1 progress within the current Flow tier. */
  flowFrac: number;
  stage: number;
  /** Seconds of Surge left (and its full length), Reflex time left, Aegis 0..1 (-1 = none). */
  surge: number;
  surgeMax: number;
  reflex: number;
  aegis: number;
  chain: number;
  chainLeft: number;
  canSurge: boolean;
  abilities: { id: string; glyph: string; name: string; level: number; max: number; category: string }[];
  synergies: string[];
}

export interface Toast {
  id: number;
  kind: 'achievement' | 'unlock' | 'info' | 'collect';
  title: string;
  text: string;
}

export interface Flash {
  id: number;
  kind: 'checkpoint' | 'death' | 'respawn' | 'record' | 'impact';
  text?: string;
  delta?: number | null;
  /** Death flash: how many falls this run (for the retry caption). */
  deaths?: number;
}

/** Combat confirmation near the crosshair: a clean cut, a body smash or a training bullseye. */
/** A short movement call-out under the timer (near miss, flow chain, universe name). */
export interface Callout {
  id: number;
  text: string;
  sub?: string;
  tone: 'flow' | 'close' | 'shift' | 'evolve' | 'synergy' | 'rare';
}

export interface Hit {
  id: number;
  kind: 'cut' | 'smash' | 'bullseye';
  /** How many objects this run so far (the running tally the HUD shows). */
  n: number;
}

/** A one-off contextual control hint (shown at most once per session per hint). */
export interface Hint {
  id: number;
  action: string;
  text: string;
}

export interface UiState {
  screen: Screen;
  overlay: Overlay;
  loadProgress: number;
  loadLabel: string;
  levelId: string | null;
  hud: HudState;
  results: ResultsData | null;
  toasts: Toast[];
  flash: Flash | null;
  prompt: { action: string; text: string } | null;
  hit: Hit | null;
  callout: Callout | null;
  hint: Hint | null;
  /** Bumped whenever save data changes so menus re-read it. */
  saveRev: number;
  storageOk: boolean;
  contextLost: boolean;
  lockHint: boolean;
  set(p: Partial<UiState>): void;
  toast(kind: Toast['kind'], title: string, text: string): void;
  dismissToast(id: number): void;
  fire(kind: Flash['kind'], text?: string, delta?: number | null, deaths?: number): void;
  fireHit(kind: Hit['kind'], n: number): void;
  call(tone: Callout['tone'], text: string, sub?: string): void;
}

let nextId = 1;

export const useUi = create<UiState>((set) => ({
  screen: 'boot',
  overlay: null,
  loadProgress: 0,
  loadLabel: 'Starting',
  levelId: null,
  hud: {
    time: 0,
    started: false,
    speed: 0,
    dash: 2,
    doubleJump: true,
    wall: 0,
    sliding: false,
    fps: 0,
    checkpoint: 0,
    checkpoints: 0,
    sword: { phase: 0, combo: 0, idle: 0, cuts: 0, total: 0 },
    restartHold: -1,
    dashMax: 2,
    evo: null,
  },
  results: null,
  toasts: [],
  flash: null,
  prompt: null,
  hit: null,
  callout: null,
  hint: null,
  saveRev: 0,
  storageOk: true,
  contextLost: false,
  lockHint: false,
  set: (p) => set(p),
  toast: (kind, title, text) =>
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id: nextId++, kind, title, text }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  fire: (kind, text, delta, deaths) => set({ flash: { id: nextId++, kind, text, delta, deaths } }),
  fireHit: (kind, n) => set({ hit: { id: nextId++, kind, n } }),
  call: (tone, text, sub) => set({ callout: { id: nextId++, tone, text, sub } }),
}));

export const ui = useUi;
