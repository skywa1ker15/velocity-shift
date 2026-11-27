/**
 * The run cycle's clock, owned in one place. The camera's footfall bob, the arm swing and the
 * leg cycle all read this one phase, so a footfall, a hand pumping and a head dip are always the
 * same beat. (Before, the camera kept the phase and the body borrowed it.)
 *
 * One full cycle (2π) is two steps: the arms use sin(phase), the head bob uses sin(2·phase).
 */
import type { MovementController } from '../movement/MovementController';
import { MoveState } from '../movement/types';

export class Gait {
  /** Radians. Not wrapped: some wall-run leg curves use fractional multiples of it. */
  phase = 0;
  /** True while the feet are cycling (grounded, not sliding, moving). */
  moving = false;

  update(pl: MovementController, dt: number) {
    const sliding = pl.state === MoveState.Slide;
    this.moving = pl.grounded && !sliding && pl.speed > 0.5;
    if (this.moving) this.phase += dt * (4.2 + pl.speed * 0.62);
  }

  reset() {
    this.phase = 0;
    this.moving = false;
  }
}
