/**
 * Gravity director (Phase G).
 *
 * Every tick, gravity fields ask for a direction and strength (`request`); the strongest-priority
 * request wins, otherwise gravity is the world's ordinary pull. The player's gravity frame then
 * turns toward the requested "up" — never snapping:
 *
 * - the turn is eased (fast to start, gentle to settle) and capped at MAX_RATE, so a 90° change
 *   takes about 0.4 s and a 180° flip about 0.7 s;
 * - a 180° flip rolls about the direction the player is facing, so their heading is kept;
 * - velocity lives in world space, so turning the frame never adds or removes momentum.
 *
 * Deterministic: no randomness, fixed dt.
 */
import { quatFromAxisAngle, quatMul, quatRotate, v3, type Quat, type V3 } from '../core/math';
import type { MovementController } from '../movement/MovementController';

/** Ease rate (1/s): the frame closes this fraction of the remaining angle per second. */
const GAIN = 10;
/** Never turn faster than this (rad/s) — about 240°/s. */
const MAX_RATE = 4.2;
/** Turns slower than this finish linearly instead of creeping (rad/s). */
const MIN_RATE = 1.4;

const _up = v3();
const _axis = v3();
const _q: Quat = { x: 0, y: 0, z: 0, w: 1 };
const _q2: Quat = { x: 0, y: 0, z: 0, w: 1 };

export class GravityDirector {
  /** Requested "down" (unit, world) and strength for this tick. */
  private down = v3(0, -1, 0);
  private scale = 1;
  private priority = -Infinity;
  /** The frame at the end of the previous tick (for render interpolation). */
  readonly prevFrame: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /** Requested up for this tick (world) — exposed for effects and tests. */
  readonly targetUp = v3(0, 1, 0);
  /** Strength in effect this tick (1 = normal). */
  strength = 1;
  /** Angle (rad) still to turn: > 0 while the world is rotating around the player. */
  turning = 0;
  /**
   * When a round trip leaves the frame upright but turned about Y, that yaw is folded into the look
   * (the view does not change) and the frame returns to identity, so ordinary stretches run on the
   * original code path. Whoever owns the look angle adds this (and clears it with `takeYawFix`).
   */
  yawFix = 0;
  takeYawFix() {
    const y = this.yawFix;
    this.yawFix = 0;
    return y;
  }

  begin() {
    this.down.x = 0;
    this.down.y = -1;
    this.down.z = 0;
    this.scale = 1;
    this.priority = -Infinity;
  }

  /** A field asks for gravity along `down` (any length) at `scale` (0 = weightless). */
  request(dx: number, dy: number, dz: number, scale: number, priority = 0) {
    if (priority < this.priority) return;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) {
      // a field with no direction (zero-g) keeps the current down
      this.priority = priority;
      this.scale = scale;
      this.down.x = NaN;
      return;
    }
    this.priority = priority;
    this.down.x = dx / l;
    this.down.y = dy / l;
    this.down.z = dz / l;
    this.scale = scale;
  }

  reset(pl: MovementController) {
    this.prevFrame.x = this.prevFrame.y = this.prevFrame.z = 0;
    this.prevFrame.w = 1;
    this.targetUp.x = 0;
    this.targetUp.y = 1;
    this.targetUp.z = 0;
    this.strength = 1;
    this.turning = 0;
    this.begin();
    void pl;
  }

  /** Apply this tick's request to the player: strength now, frame eased toward the new up. */
  apply(pl: MovementController, dt: number) {
    const f = pl.frame;
    this.prevFrame.x = f.x;
    this.prevFrame.y = f.y;
    this.prevFrame.z = f.z;
    this.prevFrame.w = f.w;
    // strength multiplies whatever a classic gravity zone already set this tick
    pl.gravityScale *= this.scale;
    this.strength = pl.gravityScale;
    const cur = pl.upAxis(_up);
    let tx: number, ty: number, tz: number;
    if (Number.isNaN(this.down.x)) {
      tx = cur.x;
      ty = cur.y;
      tz = cur.z;
    } else {
      tx = -this.down.x;
      ty = -this.down.y;
      tz = -this.down.z;
    }
    this.targetUp.x = tx;
    this.targetUp.y = ty;
    this.targetUp.z = tz;
    const dot = Math.max(-1, Math.min(1, cur.x * tx + cur.y * ty + cur.z * tz));
    const angle = Math.acos(dot);
    this.turning = angle;
    pl.useTrueDown = false;
    if (angle < 1e-4) {
      if (angle > 0) snapTo(f, cur, tx, ty, tz);
      // upright again but turned about Y: fold the turn into the look and drop the frame
      if (ty > 0.99999 && f.w < 0.9999999 && f.w > -0.9999999) {
        const yaw = 2 * Math.atan2(f.y, f.w);
        this.yawFix += yaw;
        pl.yaw += yaw;
        f.x = f.y = f.z = 0;
        f.w = 1;
        this.prevFrame.x = this.prevFrame.y = this.prevFrame.z = 0;
        this.prevFrame.w = 1;
      }
      return;
    }
    // axis: cur × target; for a near-180° flip, roll about the facing direction
    let ax = cur.y * tz - cur.z * ty,
      ay = cur.z * tx - cur.x * tz,
      az = cur.x * ty - cur.y * tx;
    let al = Math.hypot(ax, ay, az);
    if (al < 1e-3) {
      const fwd = quatRotate(f, { x: -Math.sin(pl.yaw), y: 0, z: -Math.cos(pl.yaw) }, _axis);
      ax = fwd.x;
      ay = fwd.y;
      az = fwd.z;
      al = Math.hypot(ax, ay, az) || 1;
    }
    const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, angle * GAIN));
    const step = Math.min(angle, rate * dt);
    quatFromAxisAngle(ax / al, ay / al, az / al, step, _q);
    quatMul(_q, f, _q2);
    normalize(_q2);
    f.x = _q2.x;
    f.y = _q2.y;
    f.z = _q2.z;
    f.w = _q2.w;
    this.turning = angle - step;
    // turn about the body's centre, not the feet: a player flipping over beside a floor must not
    // swing their body into it (feet move by (oldUp - newUp) * half height)
    const c = pl.height / 2;
    const nu = pl.upAxis(_axis);
    const ox = (cur.x - nu.x) * c,
      oy = (cur.y - nu.y) * c,
      oz = (cur.z - nu.z) * c;
    pl.pos.x += ox;
    pl.pos.y += oy;
    pl.pos.z += oz;
    pl.prevPos.x += ox;
    pl.prevPos.y += oy;
    pl.prevPos.z += oz;
    // a real turn lifts the player off what they stood on; tiny settling corrections do not
    if (step > 0.004) pl.grounded = false;
    // The frame (and the camera) ease round, but physics must not lag: while the frame is still
    // turning, the controller pulls along the TRUE field direction (see MovementController).
    pl.trueDown.x = -tx;
    pl.trueDown.y = -ty;
    pl.trueDown.z = -tz;
    pl.useTrueDown = this.turning > 1e-3;
  }
}

function normalize(q: Quat) {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= l;
  q.y /= l;
  q.z /= l;
  q.w /= l;
}

/** Close a tiny remaining gap exactly (keeps the frame from drifting by float error). */
function snapTo(f: Quat, cur: V3, tx: number, ty: number, tz: number) {
  const ax = cur.y * tz - cur.z * ty,
    ay = cur.z * tx - cur.x * tz,
    az = cur.x * ty - cur.y * tx;
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-9) return;
  const ang = Math.asin(Math.min(1, al));
  quatFromAxisAngle(ax / al, ay / al, az / al, ang, _q);
  quatMul(_q, f, _q2);
  normalize(_q2);
  f.x = _q2.x;
  f.y = _q2.y;
  f.z = _q2.z;
  f.w = _q2.w;
}
