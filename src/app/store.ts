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
  /** Bumped whenever save data changes so menus re-read it. */
  saveRev: number;
  storageOk: boolean;
  contextLost: boolean;
  lockHint: boolean;
  set(p: Partial<UiState>): void;
  toast(kind: Toast['kind'], title: string, text: string): void;
  dismissToast(id: number): void;
  fire(kind: Flash['kind'], text?: string, delta?: number | null): void;
}

let nextId = 1;

export const useUi = create<UiState>((set) => ({
  screen: 'boot',
  overlay: null,
  loadProgress: 0,
  loadLabel: 'Starting',
  levelId: null,
  hud: { time: 0, started: false, speed: 0, dash: 2, doubleJump: true, wall: 0, sliding: false, fps: 0, checkpoint: 0, checkpoints: 0 },
  results: null,
  toasts: [],
  flash: null,
  prompt: null,
  saveRev: 0,
  storageOk: true,
  contextLost: false,
  lockHint: false,
  set: (p) => set(p),
  toast: (kind, title, text) => set((s) => ({ toasts: [...s.toasts.slice(-3), { id: nextId++, kind, title, text }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  fire: (kind, text, delta) => set({ flash: { id: nextId++, kind, text, delta } }),
}));

export const ui = useUi;
