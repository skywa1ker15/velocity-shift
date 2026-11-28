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
import type { Gait } from '../character/Gait';
import type { MotionProfile } from '../settings/settings';

const DEG = Math.PI / 180;

/** The hands camera's field of view at the default 90° setting with no speed widening. */
const VIEW_FOV = 68;
/** The vertical FOV that 90° horizontal gives at 16:9. */
const REF_VERTICAL = (2 * Math.atan(Math.tan((90 * DEG) / 2) * (9 / 16))) / DEG;

const _lv = { x: 0, y: 0, z: 0 };
const _o = new THREE.Vector3();

export class CameraRig {
  /** World-space eye position (also used as audio listener / FX anchor). */
  readonly eye = new THREE.Vector3();
  /** Interpolated feet position. */
  readonly feet = new THREE.Vector3();
  fov = 74;
  roll = 0;
  /** Run-cycle phase shared with the character animation so bob and footfalls line up. */
  bobPhase = 0;

  private eyeHeight = cfg.standHeight - cfg.eyeOffset;
  private stepOffset = 0;
  private lastFeetY = 0;
  private dip = new Spring(170, 17);
  private fovPunch = new Spring(120, 16);
  private lurch = new Spring(160, 18);
  /** Visual-only pitch nudge (radians): nods on landings, lifts on take-off. Never touches aim. */
  private nod = new Spring(150, 17);
  private wallOff = 0;
  private trauma = 0;
  private leanX = 0;
  private lastYaw = 0;
  private landRoll = new Spring(140, 13);
  /** 0..1: how close the ground is for a falling player (set each frame by the game). */
  brace = 0;
  private braceS = 0;
  private yawRate = 0;
  private seeded = false;
  /** Master scales from the player's motion profile, refreshed each frame. */
  private landK = 1;
  private fxK = 1;
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
    this.nod.reset();
    this.landRoll.reset();
    this.braceS = 0;
    this.wallOff = 0;
    this.trauma = 0;
    this.roll = 0;
    this.eyeHeight = pl.height - cfg.eyeOffset;
  }

  onLand(impact: number, lateral = 0) {
    // a hard landing also staggers the view sideways a touch, then it rights itself
    if (impact > 12)
      this.landRoll.kick((lateral >= 0 ? 1 : -1) * clamp((impact - 12) / 14, 0, 1) * 0.5 * this.landK);
    this.dip.kick(-clamp(impact, 2, 30) * 0.075 * this.landK);
    this.nod.kick(-clamp(impact, 3, 26) * 0.022 * this.landK); // the head nods forward with the impact
    if (impact > 20) this.trauma = Math.min(1, this.trauma + (impact - 20) * 0.03 * this.landK);
  }
  /** Dropping into a slide: the view dives and the lens punches out (harder with the speed boost). */
  onSlideStart(boosted: boolean) {
    this.dip.kick(-(boosted ? 1.15 : 0.7) * this.fxK);
    this.nod.kick(-0.05 * this.fxK);
    this.fovPunch.kick((boosted ? 70 : 28) * this.fxK);
    this.lurch.kick(0.9 * this.fxK);
  }
  /** Up and over a ledge: the view ducks toward the hands as they plant, then lifts with the push. */
  onVault() {
    this.dip.kick(-0.45 * this.fxK);
    this.nod.kick(-0.07 * this.fxK);
    this.fovPunch.kick(25 * this.fxK);
  }
  /** Coming out of a slide: the view rises past the standing height and settles. */
  onSlideEnd() {
    this.dip.kick(0.8 * this.fxK);
    this.nod.kick(0.05 * this.fxK);
  }
  onDash() {
    this.fovPunch.kick(150 * this.fxK);
    this.lurch.kick(1.4 * this.fxK);
  }
  /** Sprint kicking in: a gentle push of the lens (the speed itself then widens it further). */
  onSprint() {
    this.fovPunch.kick(45 * this.fxK);
    this.lurch.kick(0.5 * this.fxK);
  }
  onDoubleJump() {
    this.dip.kick(0.9 * this.fxK);
    this.nod.kick(0.16 * this.fxK);
  }
  /** A blade connecting: a short visual nod and a small FOV squeeze (aim never moves). */
  onCut(power: number) {
    this.nod.kick(-0.06 - power * 0.08);
    this.fovPunch.kick(-30 - power * 40);
  }
  onJump(speed = 0) {
    const k = 0.6 + 0.4 * clamp(speed / 12, 0, 1.3);
    this.dip.kick(0.5 * this.fxK * k);
    this.nod.kick(0.12 * this.fxK * k); // chin lifts as the legs drive
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
    gait: Gait,
    frame?: THREE.Quaternion,
  ) {
    this.t += dt;
    // Phase G: a turned gravity frame. Everything below is built "upright" in the player's frame
    // and rotated into the world at the end; velocity effects read frame-local velocity.
    const framed = !!frame && Math.abs(frame.w) < 0.9999999;
    const lv = framed && pl.framed ? pl.toLocal(pl.vel, _lv) : pl.vel;
    this.landK = m.landing;
    this.fxK = m.intensity;
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
    // (in a turned frame the feet move legitimately as the body rotates: no step smoothing)
    if (!framed && pl.grounded && Math.abs(jump) > 0.035 && Math.abs(jump) < 0.6) this.stepOffset -= jump;
    this.lastFeetY = fy;
    this.stepOffset = damp(this.stepOffset, 0, 16, dt);
    this.feet.set(fx, fy + this.stepOffset, fz);

    const sliding = pl.state === MoveState.Slide;
    // how hard the slide is still going: the view sits lower the faster the ground rushes past
    const slideK = sliding ? clamp((pl.speed - 3) / 9, 0, 1) : 0;
    this.braceS = damp(this.braceS, this.brace, 16, dt);
    this.eyeHeight = damp(
      this.eyeHeight,
      pl.height - cfg.eyeOffset - (sliding ? 0.06 + slideK * 0.05 : 0) - this.braceS * 0.045 * m.landing,
      sliding ? 15 : 11,
      dt,
    );
    // turn rate (visual lean only)
    let dyaw = yaw - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.lastYaw = yaw;
    this.yawRate = damp(this.yawRate, dt > 1e-4 ? clamp(dyaw / dt, -6, 6) : 0, 12, dt);

    const speed = pl.speed;
    const moving = gait.moving;
    this.bobPhase = gait.phase;
    const bobAmt = moving ? clamp(speed / 11, 0, 1.3) * m.headBob : 0;
    // footfalls sharpen as the pace rises: a soft sine at a jog, a harder drop-and-catch at a sprint
    const stepS = Math.sin(this.bobPhase * 2);
    const hard = clamp((speed - cfg.runSpeed) / 5, 0, 1);
    const bobY =
      (stepS * (1 - hard * 0.5) + (Math.abs(Math.sin(this.bobPhase)) - 0.64) * 2 * hard * 0.5) *
      0.028 *
      bobAmt;
    // a slide rattles: tiny, fast, and tied to how fast the ground is passing
    const rattle =
      sliding && pl.grounded ? Math.sin(this.t * 57) * 0.0035 * clamp(speed / 14, 0, 1) * m.headBob : 0;
    const bobX = Math.cos(this.bobPhase) * 0.018 * bobAmt;
    // idle breathing
    const breathe = pl.state === MoveState.Idle ? Math.sin(this.t * 1.6) * 0.006 : 0;

    const dip = clamp(this.dip.update(0, dt), -0.28, 0.12);
    const lurch = this.lurch.update(0, dt) * 0.02;

    // subtle positional inertia: the view leans a little against sideways velocity
    const sy = Math.sin(yaw),
      cy = Math.cos(yaw);
    const lateral = lv.x * cy - lv.z * sy; // velocity along camera-right
    this.leanX = damp(this.leanX, clamp(-lateral * 0.0035, -0.05, 0.05), 8, dt);

    // roll: away from the wall while wall-running, slight tilt in slides, tiny strafe lean
    let rollTarget: number;
    const onWall = pl.state === MoveState.WallRun;
    // on a wall the view also shifts a little away from it, opening up the surface being run on
    this.wallOff = damp(this.wallOff, onWall ? -pl.wallSide * 0.1 * Math.min(1, m.roll + 0.3) : 0, 7, dt);
    if (onWall) rollTarget = pl.wallSide * 12 * DEG;
    else if (sliding)
      rollTarget = -3 * DEG + clamp(this.yawRate * 0.9, -3.5, 3.5) * DEG; // leans into the carve
    else rollTarget = clamp(-lateral * 0.0018, -2.2 * DEG, 2.2 * DEG);
    this.roll = damp(this.roll, rollTarget * m.roll, pl.state === MoveState.WallRun ? 9 : 7, dt);

    // shake: reserved for heavy events, squared trauma for a soft falloff
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const sh = this.trauma * this.trauma * m.shake;
    const shx = sh ? Math.sin(this.t * 71.3) * 0.02 * sh : 0;
    const shy = sh ? Math.sin(this.t * 83.9 + 1.7) * 0.02 * sh : 0;
    const shr = sh ? Math.sin(this.t * 64.1 + 4.1) * 0.012 * sh : 0;

    const side = bobX + this.leanX + this.wallOff;
    const ex = fx + (cy * side - sy * lurch) + shx;
    const ey = this.feet.y + this.eyeHeight + bobY + rattle + breathe + dip + shy;
    const ez = fz + (-sy * side - cy * lurch);
    this.eye.set(ex, ey, ez);

    const cam = this.camera;
    cam.position.copy(this.eye);
    const nod = clamp(this.nod.update(0, dt), -0.07, 0.035) * 0.9 * m.headBob;
    // the head leans into a push-off and rocks a little with each stride (visual only: aim is untouched)
    const lean = gait.moving ? clamp(-gait.accel, -1, 1) * 0.012 * m.headBob : 0;
    const stepRoll = gait.moving ? Math.sin(gait.phase) * 0.0035 * bobAmt : 0;
    // a long fall: wind flutters the view very slightly (no shake, no aim change)
    const fallK = !pl.grounded ? clamp((-lv.y - 12) / 18, 0, 1) : 0;
    const flutter = fallK > 0 ? Math.sin(this.t * 23) * 0.002 * fallK * fallK * m.headBob : 0;
    const lroll = this.landRoll.update(0, dt) * 0.03 * m.roll;
    cam.rotation.set(
      pitch + shy * 0.5 + nod + lean,
      yaw + shx * 0.5,
      this.roll + shr + stepRoll + flutter + lroll,
    );
    if (framed) {
      // eye offsets (height, bob, lean) were built upright around the feet: turn them with the frame
      _o.set(this.eye.x - fx, this.eye.y - fy, this.eye.z - fz).applyQuaternion(frame!);
      this.eye.set(fx + _o.x, fy + _o.y, fz + _o.z);
      cam.position.copy(this.eye);
      cam.quaternion.premultiply(frame!);
    }

    // FOV: widens with speed, punches on dash
    // the setting is a horizontal FOV at 16:9 (the usual convention); three.js wants vertical
    const vertical = (2 * Math.atan(Math.tan((baseFov * DEG) / 2) * (9 / 16))) / DEG;
    // total speed counts (a long fall widens the view too); slides and wall-runs add a touch more
    const speed3 = Math.hypot(speed, pl.grounded ? 0 : lv.y * 0.7);
    const k = clamp((speed3 - cfg.runSpeed) / (25 - cfg.runSpeed), 0, 1);
    const stateFov = (sliding ? 2.5 + slideK * 2 : onWall ? 2 : 0) + (pl.sprinting ? 2.5 : 0);
    const punch = clamp(this.fovPunch.update(0, dt), -4, 12);
    const target = vertical + (k * 12 + stateFov) * m.speedFov + punch * (m.screenFx ? 1 : 0.3);
    // widen promptly, relax slowly: the view never snaps shut when speed drops
    this.fov = damp(this.fov, target, target > this.fov ? 9 : 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.syncView(vertical, dip, nod + lean, this.roll + shr + stepRoll + flutter + lroll);
  }

  /**
   * The hands and sword are drawn by their own camera. It follows the main one *partially*, the way
   * a body does: the field of view widens with the world's (half as much), the eye's landing dip
   * moves the arms 40 % of the way, the head's nod and the horizon roll carry them 50 % / 35 %.
   * Everything is already scaled by the comfort settings (Reduce Motion, master intensity) upstream.
   */
  private syncView(vertical: number, dip: number, nod: number, roll: number) {
    const v = this.viewCamera;
    // (the setting itself carries over a third of the way, so a wide view does not shrink the hands)
    const fov = VIEW_FOV + (vertical - REF_VERTICAL) * 0.35 + (this.fov - vertical) * 0.5;
    if (Math.abs(v.fov - fov) > 0.01) {
      v.fov = fov;
      v.updateProjectionMatrix();
    }
    v.position.set(0, dip * 0.4, 0);
    v.rotation.set(nod * 0.5, 0, roll * 0.35);
  }
}
