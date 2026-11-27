/**
 * The run cycle's clock and the "how is this runner moving" read-out, owned in one place. The
 * camera's footfall bob, the arm swing, the leg cycle and the body sway all read this, so a
 * footfall, a hand pumping and a head dip are always the same beat.
 *
 * One full cycle (2π) is two steps: the arms use sin(phase), the head bob uses sin(2·phase).
 *
 * Beyond the phase it tracks:
 *  - pace tiers (jog, sprint, top speed) as smooth 0..1 weights, so the gait changes character
 *    gradually instead of at a threshold;
 *  - smoothed acceleration, so arms and view lag when pushing off and swing on when stopping;
 *  - travel direction relative to the view (forward / back, strafe), for strafing and
 *    backpedalling;
 *  - a per-step variation, so no two strides are exactly the same.
 */
import { clamp, damp } from '../core/math';
import type { MovementController } from '../movement/MovementController';
import { MoveState } from '../movement/types';

const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Cheap deterministic hash → -1..1, for per-step variation. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

export class Gait {
  /** Radians. Not wrapped: some wall-run leg curves use fractional multiples of it. */
  phase = 0;
  /** True while the feet are cycling (grounded, not sliding, moving). */
  moving = false;
  /** Pace tiers, 0..1 each. */
  jog = 0;
  sprint = 0;
  top = 0;
  /** Smoothed acceleration along the direction of travel, about -1 (braking) .. 1 (pushing off). */
  accel = 0;
  /** Travel direction in view space: forward (+1) / backward (-1), and right (+1) / left (-1). */
  dirF = 1;
  dirR = 0;
  /** Per-step variation (-1..1), eased between steps. */
  vary = 0;

  private lastSpeed = 0;
  private lastStep = 0;
  private varyTarget = 0;

  update(pl: MovementController, dt: number, yaw = 0) {
    const sliding = pl.state === MoveState.Slide;
    const speed = pl.speed;
    this.moving = pl.grounded && !sliding && speed > 0.5;
    if (this.moving) this.phase += dt * (4.2 + speed * 0.62);

    this.jog = 1 - ss(5, 8.5, speed);
    this.sprint = ss(8.5, 11.5, speed);
    this.top = ss(13, 20, speed);

    if (dt > 1e-4) {
      const raw = clamp((speed - this.lastSpeed) / dt / 12, -1, 1);
      this.accel = damp(this.accel, pl.grounded ? raw : 0, 9, dt);
    }
    this.lastSpeed = speed;

    if (speed > 0.8) {
      const sy = Math.sin(yaw),
        cy = Math.cos(yaw);
      const lv = pl.framed ? pl.toLocal(pl.vel, _lv) : pl.vel;
      const vf = -(lv.x * sy + lv.z * cy);
      const vr = lv.x * cy - lv.z * sy;
      const l = Math.hypot(vf, vr) || 1;
      this.dirF = damp(this.dirF, vf / l, 10, dt);
      this.dirR = damp(this.dirR, vr / l, 10, dt);
    } else {
      this.dirF = damp(this.dirF, 1, 6, dt);
      this.dirR = damp(this.dirR, 0, 6, dt);
    }

    // each step gets its own small amplitude variation
    const step = Math.floor(this.phase / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      this.varyTarget = hash(step);
    }
    this.vary = damp(this.vary, this.varyTarget, 14, dt);
  }

  reset() {
    this.phase = 0;
    this.moving = false;
    this.accel = 0;
    this.lastSpeed = 0;
    this.dirF = 1;
    this.dirR = 0;
    this.vary = 0;
    this.lastStep = 0;
  }
}

const _lv = { x: 0, y: 0, z: 0 };
