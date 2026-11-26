/**
 * First-person camera rig.
 *
 * Rule: mouse look is never smoothed or delayed. Yaw/pitch come straight from the input manager
 * every rendered frame; every effect below (bob, dip, roll, FOV, shake, inertia) is an additive
 * offset on top, scaled by the player's comfort settings (see settings.motionProfile).
 */
import * as THREE from 'three';
import { clamp, damp, Spring } from '../core/math';
import type { MovementController } from '../movement/MovementController';
import { movementConfig as cfg } from '../movement/movementConfig';
import { MoveState } from '../movement/types';
import type { MotionProfile } from '../settings/settings';

const DEG = Math.PI / 180;

export class CameraRig {
  /** World-space eye position (also used as audio listener / FX anchor). */
  readonly eye = new THREE.Vector3();
  /** Interpolated feet position. */
  readonly feet = new THREE.Vector3();
  fov = 95;
  roll = 0;
  /** Run-cycle phase shared with the character animation so bob and footfalls line up. */
  bobPhase = 0;

  private eyeHeight = cfg.standHeight - cfg.eyeOffset;
  private stepOffset = 0;
  private lastFeetY = 0;
  private dip = new Spring(170, 17);
  private fovPunch = new Spring(120, 16);
  private lurch = new Spring(160, 18);
  private trauma = 0;
  private leanX = 0;
  private seeded = false;
  private t = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private viewCamera: THREE.PerspectiveCamera,
  ) {
    camera.rotation.order = 'YXZ';
  }

  reset(pl: MovementController) {
    this.seeded = false;
    this.stepOffset = 0;
    this.dip.reset();
    this.fovPunch.reset();
    this.lurch.reset();
    this.trauma = 0;
    this.roll = 0;
    this.eyeHeight = pl.height - cfg.eyeOffset;
  }

  onLand(impact: number) {
    this.dip.kick(-clamp(impact, 2, 30) * 0.075);
    if (impact > 20) this.trauma = Math.min(1, this.trauma + (impact - 20) * 0.03);
  }
  onDash() {
    this.fovPunch.kick(150);
    this.lurch.kick(1.4);
  }
  onDoubleJump() {
    this.dip.kick(0.9);
  }
  onJump() {
    this.dip.kick(0.5);
  }
  /** Big world events only (collapses, crushers). */
  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(
    pl: MovementController,
    alpha: number,
    dt: number,
    yaw: number,
    pitch: number,
    baseFov: number,
    m: MotionProfile,
  ) {
    this.t += dt;
    const p = pl.pos,
      q = pl.prevPos;
    const fx = q.x + (p.x - q.x) * alpha,
      fy = q.y + (p.y - q.y) * alpha,
      fz = q.z + (p.z - q.z) * alpha;
    if (!this.seeded) {
      this.seeded = true;
      this.lastFeetY = fy;
    }
    // step-ups snap the feet by up to 0.35 m in one tick: absorb the snap and ease it out
    const jump = fy - this.lastFeetY;
    if (pl.grounded && Math.abs(jump) > 0.035 && Math.abs(jump) < 0.6) this.stepOffset -= jump;
    this.lastFeetY = fy;
    this.stepOffset = damp(this.stepOffset, 0, 16, dt);
    this.feet.set(fx, fy + this.stepOffset, fz);

    const sliding = pl.state === MoveState.Slide;
    this.eyeHeight = damp(this.eyeHeight, pl.height - cfg.eyeOffset - (sliding ? 0.06 : 0), 15, dt);

    const speed = pl.speed;
    const moving = pl.grounded && !sliding && speed > 0.5;
    if (moving) this.bobPhase += dt * (4.2 + speed * 0.62);
    const bobAmt = moving ? clamp(speed / 11, 0, 1.3) * m.headBob : 0;
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.018 * bobAmt;
    // idle breathing
    const breathe = pl.state === MoveState.Idle ? Math.sin(this.t * 1.6) * 0.006 : 0;

    const dip = clamp(this.dip.update(0, dt), -0.28, 0.12);
    const lurch = this.lurch.update(0, dt) * 0.02;

    // subtle positional inertia: the view leans a little against sideways velocity
    const sy = Math.sin(yaw),
      cy = Math.cos(yaw);
    const lateral = pl.vel.x * cy - pl.vel.z * sy; // velocity along camera-right
    this.leanX = damp(this.leanX, clamp(-lateral * 0.0035, -0.05, 0.05), 8, dt);

    // roll: away from the wall while wall-running, slight tilt in slides, tiny strafe lean
    let rollTarget: number;
    if (pl.state === MoveState.WallRun) rollTarget = pl.wallSide * 12 * DEG;
    else if (sliding) rollTarget = -3 * DEG;
    else rollTarget = clamp(-lateral * 0.0018, -2.2 * DEG, 2.2 * DEG);
    this.roll = damp(this.roll, rollTarget * m.roll, pl.state === MoveState.WallRun ? 9 : 7, dt);

    // shake: reserved for heavy events, squared trauma for a soft falloff
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const sh = this.trauma * this.trauma * m.shake;
    const shx = sh ? Math.sin(this.t * 71.3) * 0.02 * sh : 0;
    const shy = sh ? Math.sin(this.t * 83.9 + 1.7) * 0.02 * sh : 0;
    const shr = sh ? Math.sin(this.t * 64.1 + 4.1) * 0.012 * sh : 0;

    const ex = fx + (cy * (bobX + this.leanX) - sy * lurch) + shx;
    const ey = this.feet.y + this.eyeHeight + bobY + breathe + dip + shy;
    const ez = fz + (-sy * (bobX + this.leanX) - cy * lurch);
    this.eye.set(ex, ey, ez);

    const cam = this.camera;
    cam.position.copy(this.eye);
    cam.rotation.set(pitch + shy * 0.5, yaw + shx * 0.5, this.roll + shr);

    // FOV: widens with speed, punches on dash
    const k = clamp((speed - cfg.runSpeed) / (25 - cfg.runSpeed), 0, 1);
    const punch = clamp(this.fovPunch.update(0, dt), -4, 14);
    const target = baseFov + k * 15 * m.speedFov + punch * (m.screenFx ? 1 : 0.3);
    this.fov = damp(this.fov, target, 10, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    void this.viewCamera;
  }
}
