/**
 * Keyboard + mouse input.
 *
 * - Mouse look is applied the moment the event arrives (per rendered frame, never smoothed).
 * - Actions are sampled once per simulation tick; presses are latched so a tap that starts and
 *   ends between two ticks is never lost.
 * - Uses Pointer Lock with raw (unadjusted) mouse movement where the browser supports it.
 */
import type { InputFrame } from '../movement/types';
import type { Action, Bindings } from './bindings';
import { usesCtrl } from './bindings';
import type { Settings } from '../settings/settings';

const BASE_SENS = 0.0011; // radians per pixel at sensitivity 1 (≈ 18 cm per full turn at 800 DPI)
const PITCH_LIMIT = (89 * Math.PI) / 180;

export class InputManager {
  yaw = Math.PI;
  pitch = 0;
  /** Gameplay input is only read while enabled (not in menus / paused). */
  enabled = false;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};
  onAction: (a: Action, down: boolean) => void = () => {};

  private down = new Set<string>();
  private pressed: Record<'jump' | 'dash' | 'slide', boolean> = { jump: false, dash: false, slide: false };
  private sprintLatch = false;
  private slideLatch = false;
  private capture: ((code: string) => void) | null = null;
  private frame: InputFrame = {
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    jumpHeld: false,
    jumpPressed: false,
    sprint: false,
    slideHeld: false,
    slidePressed: false,
    dashPressed: false,
  };

  constructor(
    private el: HTMLElement,
    public bindings: Bindings,
    public settings: Settings,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLock);
    document.addEventListener('pointerlockerror', this.onLock);
    window.addEventListener('blur', this.releaseAll);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLock);
    document.removeEventListener('pointerlockerror', this.onLock);
    window.removeEventListener('blur', this.releaseAll);
  }

  // ----- pointer lock -------------------------------------------------------------------
  async requestLock() {
    if (document.pointerLockElement === this.el) return;
    try {
      // raw input: bypasses OS mouse acceleration
      await (this.el.requestPointerLock as any)({ unadjustedMovement: true });
    } catch {
      try {
        await this.el.requestPointerLock();
      } catch {
        /* user gesture missing or lock denied: stay unlocked, the game shows "click to resume" */
      }
    }
    // Ctrl+W would close the tab mid-slide: lock the keyboard when possible (Chromium, fullscreen)
    if (usesCtrl(this.bindings))
      (navigator as any).keyboard?.lock?.(['KeyW', 'KeyR', 'KeyT', 'KeyN']).catch(() => {});
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onLock = () => {
    const locked = document.pointerLockElement === this.el;
    if (locked !== this.locked) {
      this.locked = locked;
      if (!locked) this.releaseAll();
      this.onLockChange(locked);
    }
  };

  // ----- events -------------------------------------------------------------------------
  private actionOf(code: string): Action | null {
    const b = this.bindings;
    for (const a in b) if (b[a as Action].includes(code)) return a as Action;
    return null;
  }

  private press(code: string) {
    if (this.capture) {
      const c = this.capture;
      this.capture = null;
      c(code);
      return true;
    }
    if (this.down.has(code)) return !!this.actionOf(code);
    this.down.add(code);
    const a = this.actionOf(code);
    if (!a) return false;
    if (this.enabled) {
      if (a === 'jump') this.pressed.jump = true;
      else if (a === 'dash') this.pressed.dash = true;
      else if (a === 'slide') {
        this.pressed.slide = true;
        if (this.settings.slideMode === 'toggle') this.slideLatch = !this.slideLatch;
      } else if (a === 'sprint' && this.settings.sprintMode === 'toggle')
        this.sprintLatch = !this.sprintLatch;
    }
    this.onAction(a, true);
    return true;
  }

  private release(code: string) {
    if (!this.down.delete(code)) return;
    const a = this.actionOf(code);
    if (a) this.onAction(a, false);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      if (this.enabled && this.actionOf(e.code)) e.preventDefault();
      return;
    }
    const used = this.press(e.code);
    if (this.enabled && (used || e.code === 'Tab' || e.code === 'Space')) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.release(e.code);
  private onMouseDown = (e: MouseEvent) => {
    // left click is reserved for UI while rebinding; in play it only counts once the pointer is locked
    if (this.capture ? e.button !== 0 : this.enabled && this.locked)
      this.press('Mouse' + ([0, 2, 1, 3, 4][e.button] ?? e.button));
  };
  private onMouseUp = (e: MouseEvent) => this.release('Mouse' + ([0, 2, 1, 3, 4][e.button] ?? e.button));

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    const s = BASE_SENS * this.settings.sensitivity;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s * (this.settings.invertY ? -1 : 1);
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  };

  private releaseAll = () => {
    this.down.clear();
    this.pressed.jump = this.pressed.dash = this.pressed.slide = false;
    this.slideLatch = false;
  };

  // ----- sampling -----------------------------------------------------------------------
  private isDown(a: Action): boolean {
    const codes = this.bindings[a];
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true;
    return false;
  }

  /** Build the input for one simulation tick and consume latched presses. */
  sample(): InputFrame {
    const f = this.frame;
    if (!this.enabled) {
      f.moveX = f.moveZ = 0;
      f.jumpHeld = f.jumpPressed = f.sprint = f.slideHeld = f.slidePressed = f.dashPressed = false;
      f.yaw = this.yaw;
      f.pitch = this.pitch;
      return f;
    }
    f.moveZ = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    f.moveX = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    f.yaw = this.yaw;
    f.pitch = this.pitch;
    f.jumpHeld = this.isDown('jump');
    f.jumpPressed = this.pressed.jump;
    f.dashPressed = this.pressed.dash;
    f.slidePressed = this.pressed.slide;
    const mode = this.settings.sprintMode;
    f.sprint = mode === 'auto' ? true : mode === 'hold' ? this.isDown('sprint') : this.sprintLatch;
    f.slideHeld = this.settings.slideMode === 'hold' ? this.isDown('slide') : this.slideLatch;
    this.pressed.jump = this.pressed.dash = this.pressed.slide = false;
    return f;
  }

  /** Toggle-mode slide ends when the slide itself ends. */
  clearSlideLatch() {
    this.slideLatch = false;
  }

  setLook(yaw: number, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /** Rebinding: resolves with the next key or mouse button pressed. */
  captureNext(): Promise<string> {
    return new Promise((resolve) => {
      this.capture = resolve;
    });
  }
  cancelCapture() {
    this.capture = null;
  }
}
