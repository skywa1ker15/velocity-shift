/**
 * The player's visible body: an illustrated runner (deep navy jacket, bone-white guards, charcoal
 * gloves with accent-coloured fingertips), cel-shaded with ink outlines and animated entirely in
 * code.
 *
 * Two layers:
 *  - Viewmodel arms (viewScene, camera space): forearms + hands, drawn after the world so they
 *    never clip into walls.
 *  - World body (world scene): legs, feet and lower torso under the camera, visible when looking
 *    down and casting a shadow.
 *
 * There are no baked animation clips. Each movement state supplies pose targets for hands and
 * feet; springs carry them there (giving follow-through and overshoot), two-bone IK places the
 * joints, and events (land, dash, double jump…) add impulses. That is what keeps the body
 * reacting to physics rather than playing canned loops.
 */
import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { MovementController } from '../movement/MovementController';
import type { MotionProfile } from '../settings/settings';
import { Gait } from './Gait';
import { MoveState } from '../movement/types';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCharacterMaterial, PartBuilder, xf, type CharacterMaterial } from '../render/ink';
import {
  bladeDir,
  DRAW_TIME,
  drawDir,
  readyDir,
  SHEATHE_TIME,
  SLASHES,
  SwordPhase,
  windupOf,
  type Sword,
} from '../gameplay/Sword';
import { buildSword, SWORD } from './SwordModel';
import { buildArm, type ArmRig, type FingerRig } from './ArmRig';
import { swingHilt } from '../fx/SlashFx';

/** The runner's outfit (shared with the ghost figure). */
export const outfit = {
  jacket: 0x2b3656,
  cuff: 0x3d4a6b,
  glove: 0x39425c,
  guard: 0xece6d8,
  strap: 0x14171f,
  trouser: 0x2c3550,
  sole: 0x14171f,
};
const rbox = (x: number, y: number, z: number, r: number) =>
  new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2, y / 2, z / 2));
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

interface ArmPose {
  x: number;
  y: number;
  z: number;
  roll: number;
  bend: number;
  curl: number;
  splay: number;
  pole: number;
  stiff: number;
}
const mkPose = (): ArmPose => ({
  x: 0,
  y: 0,
  z: 0,
  roll: 0,
  bend: 0,
  curl: 0.85,
  splay: 0,
  pole: 0.55,
  stiff: 210,
});
const POSE_IDLE = 0,
  POSE_RUN = 1,
  POSE_SLIDE = 2,
  POSE_WALL = 3,
  POSE_DASH = 4,
  POSE_VAULT = 5;
// how fast each state's weight eases in / out (per second): quick for impacts, softer for settles
const W_IN = [8, 12, 18, 14, 30, 20, 12];
const W_OUT = [8, 10, 9, 9, 18, 12, 10];
function stateIndex(st: MoveState): number {
  switch (st) {
    case MoveState.Idle:
      return POSE_IDLE;
    case MoveState.Run:
    case MoveState.Sprint:
      return POSE_RUN;
    case MoveState.Slide:
      return POSE_SLIDE;
    case MoveState.WallRun:
      return POSE_WALL;
    case MoveState.Dash:
      return POSE_DASH;
    case MoveState.Vault:
      return POSE_VAULT;
    default:
      return 6;
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

/** Solve a two-bone chain: returns the elbow/knee position in `out`. */
function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
) {
  const dir = _s1.subVectors(target, root);
  let d = dir.length();
  if (d < 1e-5) {
    dir.set(0, -1, 0);
    d = 1e-5;
  } else dir.divideScalar(d);
  const max = l1 + l2 - 0.002,
    min = Math.abs(l1 - l2) + 0.002;
  if (d > max) {
    d = max;
    target.copy(root).addScaledVector(dir, d); // out of reach: pull the target in
  } else if (d < min) d = min;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = _s2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  out.copy(root).addScaledVector(dir, a).addScaledVector(perp, h);
}
const _s1 = new THREE.Vector3();
const _s2 = new THREE.Vector3();
const _sb = new THREE.Vector3();
const _se = new THREE.Vector3();
const _sz = new THREE.Vector3();
const _sx = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _sa = new THREE.Vector3();
const _sr = new THREE.Vector3();
const _sg = new THREE.Vector3();

/** Place a Y-aligned segment mesh between two points. */
function placeSegment(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  _c.subVectors(to, from).normalize();
  mesh.quaternion.setFromUnitVectors(Y, _c);
}

class Spring3 {
  readonly p = new THREE.Vector3();
  readonly v = new THREE.Vector3();
  constructor(
    public k = 210,
    public d = 23,
  ) {}
  update(t: THREE.Vector3, dt: number) {
    // semi-implicit integration, sub-stepped so it stays stable however low the frame rate drops
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v.x += ((t.x - this.p.x) * this.k - this.v.x * this.d) * h;
      this.v.y += ((t.y - this.p.y) * this.k - this.v.y * this.d) * h;
      this.v.z += ((t.z - this.p.z) * this.k - this.v.z * this.d) * h;
      this.p.addScaledVector(this.v, h);
    }
  }
}

type Finger = FingerRig;

interface Arm {
  side: 1 | -1;
  rig: ArmRig;
  shoulder: THREE.Vector3;
  upper: THREE.Bone;
  fore: THREE.Bone;
  twist: THREE.Bone;
  hand: THREE.Bone;
  spring: Spring3;
  target: THREE.Vector3;
  elbow: THREE.Vector3;
  fingers: Finger[];
  thumb: Finger;
  // pose channels: current value, eased toward the target each frame
  roll: number;
  bend: number;
  curl: number;
  splay: number;
  pole: number;
  tRoll: number;
  tBend: number;
  tCurl: number;
  tSplay: number;
  tPole: number;
}

interface Leg {
  side: 1 | -1;
  hip: THREE.Vector3;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  foot: THREE.Mesh;
  /** Cheap invisible stand-ins that cast the shadow while the detailed legs are hidden. */
  proxy: THREE.Mesh[];
  spring: Spring3;
  target: THREE.Vector3;
  knee: THREE.Vector3;
}

const UPPER = 0.29,
  FORE = 0.27,
  THIGH = 0.46,
  SHIN = 0.47;

export class Body {
  private arms: Arm[] = [];
  private legs: Leg[] = [];
  private armRoot = new THREE.Group();
  private bodyRoot = new THREE.Group();
  private torso!: THREE.Group;
  private mat: CharacterMaterial;
  private phase = 0;
  private gait = new Gait();
  private stepSway = 0;
  private t = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private sway = new THREE.Vector2();
  private dashT = 9;
  private djT = 9;
  private landT = 9;
  private landAmt = 0;
  private wjT = 9;
  private jumpT = 9;
  private slideT = 9;
  private landDur = 0.34;
  private landHard = 0;
  /** 0..1: how close the ground is for a falling body (set each frame by the game). */
  brace = 0;
  private braceS = 0;
  private exitT = 9;
  private slideBlend = 0;
  private hipDrop = 0;
  private bodyRoll = 0;
  private rootDip = 0;
  private rootLean = 0;
  private lateral = 0;
  private geos: THREE.BufferGeometry[] = [];
  private skeletons: THREE.Skeleton[] = [];
  private sword: Sword | null = null;
  private swordMesh!: THREE.Mesh;
  /** Camera-space blade direction and tip of the drawn sword (for effects). */
  readonly bladeTip = new THREE.Vector3();
  readonly bladeBase = new THREE.Vector3();
  swordShown = false;
  /** World position of the trailing hand / feet for particle effects. */
  readonly contact = new THREE.Vector3();

  constructor(viewScene: THREE.Scene, worldScene: THREE.Scene) {
    this.mat = createCharacterMaterial({ view: true });
    this.buildArms();
    this.buildLegs();
    {
      const g = buildSword().build(0.0028);
      this.geos.push(g);
      this.swordMesh = new THREE.Mesh(g, this.mat);
      this.swordMesh.visible = false;
      this.armRoot.add(this.swordMesh);
    }
    viewScene.add(this.armRoot);
    worldScene.add(this.bodyRoot);
  }

  /** The simulation's sword, whose state drives the sword arm (null: no sword). */
  setSword(sw: Sword | null) {
    this.sword = sw;
  }
  setAccent(hex: number) {
    this.mat.userData.accent.value.set(hex);
  }
  /** Per-level sleeve / glove / trim colours so the hands contrast with the surfaces around them. */
  setPalette(h: { sleeve: number; glove: number; trim: number }) {
    this.mat.userData.sleeve.value.set(h.sleeve);
    this.mat.userData.glove.value.set(h.glove);
    this.mat.userData.trim.value.set(h.trim);
  }
  setVisible(v: boolean) {
    this.armRoot.visible = v;
    this.bodyRoot.visible = v;
  }

  private mesh(b: PartBuilder, ink: number): THREE.Mesh {
    const g = b.build(ink);
    this.geos.push(g);
    return new THREE.Mesh(g, this.mat);
  }

  // ----- construction -------------------------------------------------------------------
  private buildArms() {
    for (const side of [1, -1] as const) {
      const rig = buildArm(side, this.mat);
      this.geos.push(rig.geometry);
      this.skeletons.push(rig.skeleton);
      this.armRoot.add(rig.group);
      const arm: Arm = {
        side,
        rig,
        shoulder: new THREE.Vector3(side * 0.235, -0.275, 0.03),
        upper: rig.upper,
        fore: rig.fore,
        twist: rig.twist,
        hand: rig.hand,
        spring: new Spring3(),
        target: new THREE.Vector3(),
        elbow: new THREE.Vector3(),
        fingers: rig.fingers,
        thumb: rig.thumb,
        roll: 0,
        bend: 0,
        curl: 0.8,
        splay: 0,
        pole: 0.55,
        tRoll: 0,
        tBend: 0,
        tCurl: 0.8,
        tSplay: 0,
        tPole: 0.55,
      };
      arm.spring.p.set(side * 0.2, -0.27, -0.42);
      this.arms.push(arm);
    }
  }

  private buildLegs() {
    const o = outfit;
    this.shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (const side of [1, -1] as const) {
      const thigh = this.mesh(
        new PartBuilder()
          .add(capsule(0.08, THIGH - 0.16), null, o.trouser)
          .add(rbox(0.012, THIGH - 0.14, 0.05, 0.004), xf(side * 0.079, 0, 0), o.trouser, { accent: true }),
        0.006,
      );
      // shin (local +Y runs up to the knee, local -Z is the front)
      const shin = this.mesh(
        new PartBuilder()
          .add(new THREE.CylinderGeometry(0.072, 0.05, SHIN, 12, 1), null, o.trouser)
          .add(rbox(0.1, 0.11, 0.04, 0.015), xf(0, SHIN / 2 - 0.04, -0.056, 0.12), o.guard)
          .add(rbox(0.07, 0.21, 0.026, 0.01), xf(0, -0.03, -0.058, -0.05), o.guard)
          .add(rbox(0.014, 0.16, 0.008, 0.003), xf(0, -0.03, -0.073, -0.05), o.guard, { glow: 1 })
          .add(new THREE.CylinderGeometry(0.056, 0.054, 0.02, 12, 1), xf(0, -SHIN / 2 + 0.05), o.strap),
        0.006,
      );
      // running shoe: chunky sole, bone midsole, dark upper, guard toe cap, accent heel tab
      const foot = this.mesh(
        new PartBuilder()
          .add(rbox(0.114, 0.026, 0.292, 0.01), xf(0, -0.04, -0.06), o.sole)
          .add(rbox(0.11, 0.026, 0.286, 0.01), xf(0, -0.018, -0.06), o.guard)
          .add(rbox(0.1, 0.07, 0.19, 0.03), xf(0, 0.025, -0.02), o.glove)
          .add(rbox(0.102, 0.05, 0.1, 0.022), xf(0, 0.008, -0.158), o.guard)
          .add(rbox(0.05, 0.05, 0.014, 0.005), xf(0, 0.035, 0.078), o.glove, { accent: true })
          .add(rbox(0.104, 0.012, 0.11, 0.004), xf(0, 0.03, -0.07, 0.25), o.glove, { glow: 1 }),
        0.006,
      );
      // the detailed (outlined) legs are only drawn when they can be seen; shadows come from
      // simple proxies, so the shadow pass never re-draws every ink hull
      const proxy = [
        new THREE.Mesh(new THREE.CapsuleGeometry(0.08, THIGH - 0.16, 2, 6), this.shadowMat),
        new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, SHIN, 7, 1), this.shadowMat),
        new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.29), this.shadowMat),
      ];
      for (const m of proxy) {
        m.castShadow = true;
        m.frustumCulled = false;
        this.geos.push(m.geometry);
        this.bodyRoot.add(m);
      }
      this.bodyRoot.add(thigh, shin, foot);
      const leg: Leg = {
        side,
        hip: new THREE.Vector3(side * 0.11, 0.93, 0.06),
        thigh,
        shin,
        foot,
        proxy,
        spring: new Spring3(260, 26),
        target: new THREE.Vector3(),
        knee: new THREE.Vector3(),
      };
      leg.spring.p.set(side * 0.13, 0.05, -0.08);
      this.legs.push(leg);
    }

    // hips, belt and the jacket hem; the upper torso exists only as a shadow caster
    this.torso = new THREE.Group();
    const hips = this.mesh(
      new PartBuilder()
        .add(rbox(0.34, 0.2, 0.21, 0.05), null, o.trouser)
        .add(rbox(0.352, 0.046, 0.222, 0.012), xf(0, 0.1, 0), o.strap)
        .add(rbox(0.07, 0.034, 0.012, 0.004), xf(0, 0.1, -0.113), o.guard, { glow: 1 })
        .add(rbox(0.09, 0.1, 0.05, 0.015), xf(0.16, 0.03, -0.03), o.guard)
        .add(rbox(0.37, 0.17, 0.235, 0.05), xf(0, 0.215, 0.015), o.jacket)
        .add(rbox(0.372, 0.016, 0.237, 0.005), xf(0, 0.135, 0.015), o.jacket, { accent: true }),
      0.007,
    );
    this.hips = hips;
    const sg = new THREE.CapsuleGeometry(0.19, 0.5, 2, 8);
    this.geos.push(sg);
    const shadowBody = new THREE.Mesh(sg, this.shadowMat);
    shadowBody.position.set(0, 0.6, 0);
    shadowBody.castShadow = true;
    shadowBody.frustumCulled = false;
    this.torso.add(hips, shadowBody);
    this.bodyRoot.add(this.torso);
  }
  private shadowMat!: THREE.Material;
  private hips!: THREE.Mesh;

  // ----- reactions ----------------------------------------------------------------------
  /**
   * Landings come in sizes. A soft touch barely registers and recovers fast; a medium one braces
   * the hands and dips; a hard one (impact > ~14 m/s) slams the hands wide, sinks the body deep and
   * takes noticeably longer to come back up.
   */
  onLand(impact: number) {
    const k = this.motion.landing;
    this.landT = 0;
    this.landHard = clamp((impact - 10) / 14, 0, 1);
    this.landDur = lerp(0.24, 0.56, clamp((impact - 4) / 18, 0, 1));
    this.landAmt = clamp(impact / 20, 0.15, 1) * Math.min(1.3, k);
    for (const a of this.arms) {
      a.spring.v.y -= (1.2 + this.landAmt * 2.6) * (1 + this.landHard * 0.5);
      a.spring.v.z -= this.landAmt * 0.8;
      a.spring.v.x += a.side * this.landHard * 1.2 * k;
    }
  }
  onDash() {
    this.dashT = 0;
    for (const a of this.arms) a.spring.v.z += a.side > 0 ? -2.5 : 3.6; // lead hand spears forward
  }
  onDoubleJump() {
    this.djT = 0;
    for (const a of this.arms) {
      a.spring.v.y -= 3.6;
      a.spring.v.x += a.side * 1.4;
    }
    for (const l of this.legs) l.spring.v.y += 3.5;
  }
  /** Take-off: the arms load for an instant (never delaying the jump), then throw up with the legs. */
  onJump(speed = 0) {
    this.jumpT = 0;
    const k = this.motion.intensity * (1 + clamp(speed / 14, 0, 1) * 0.6);
    for (const a of this.arms) a.spring.v.y -= 1.5 * k;
  }
  onWallJump() {
    this.wjT = 0;
    for (const a of this.arms) a.spring.v.x -= a.side * 0.8;
  }
  /** Dropping into a slide: the trailing hand throws back to plant, the guard arm sweeps in low. */
  onSlideStart(boosted: boolean) {
    this.slideT = 0;
    const k = this.motion.intensity * (boosted ? 1.3 : 1);
    for (const a of this.arms) {
      if (a.side > 0) {
        a.spring.v.y -= 2.4 * k;
        a.spring.v.z += 1.8 * k;
      } else {
        a.spring.v.y -= 1.0 * k;
        a.spring.v.z -= 1.4 * k;
      }
    }
  }
  /** Coming out of a slide: both hands drive forward and up as the body rises. */
  onSlideEnd() {
    this.exitT = 0;
    const k = this.motion.intensity;
    for (const a of this.arms) {
      a.spring.v.y += 1.9 * k;
      a.spring.v.z -= 1.3 * k;
    }
  }
  onBump() {
    for (const a of this.arms) a.spring.v.z += 1.5;
  }

  // ----- per-frame ----------------------------------------------------------------------
  update(
    pl: MovementController,
    feet: THREE.Vector3,
    gait: Gait,
    dt: number,
    yaw: number,
    pitch: number,
    camRoll: number,
  ) {
    this.t += dt;
    this.dashT += dt;
    this.djT += dt;
    this.landT += dt;
    this.wjT += dt;
    this.jumpT += dt;
    this.slideT += dt;
    this.exitT += dt;
    const st = pl.state;
    const speed = pl.speed;
    const grounded = pl.grounded;
    this.gait = gait;
    this.phase = gait.phase;

    // hands lag slightly behind fast look movement (secondary motion)
    let dyaw = yaw - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.sway.x = damp(this.sway.x, clamp(dyaw * 1.6, -0.07, 0.07), 10, dt);
    this.sway.y = damp(this.sway.y, clamp(-dpitch * 1.6, -0.06, 0.06), 10, dt);
    // sideways velocity in camera space: the arms counter-balance it (air steering, strafing)
    const lat = pl.vel.x * Math.cos(yaw) - pl.vel.z * Math.sin(yaw);
    this.lateral = damp(this.lateral, clamp(lat / 8, -1, 1), 8, dt);

    this.updateArms(pl, st, speed, grounded, dt, camRoll);
    this.updateLegs(pl, st, speed, grounded, feet, dt, yaw, pitch);
  }

  // ----- arm pose layers -------------------------------------------------------------------
  //
  // The arms are posed in three layers, so states can overlap and nothing snaps:
  //  1. LOCOMOTION: one pose provider per movement state (idle, run, slide, wall, dash, vault,
  //     air). Each state has a blend weight that eases in and out, and the arm's target is the
  //     weighted mix of the providers, so run -> slide -> air cross-fades instead of switching.
  //  2. OVERLAYS: short actions on top (wall-jump shove, double-jump push, landing brace, the free
  //     hand counter-swinging a sword stroke), driven by the event timers.
  //  3. SECONDARY MOTION: look lag and air-steering sway, scaled by the player's sway setting.
  // The blended target then goes through the spring (follow-through) and the IK.
  private stateW = new Float32Array(7).fill(0).map((_, i) => (i === 0 ? 1 : 0));
  private poseScratch: ArmPose[] = Array.from({ length: 7 }, mkPose);
  private blend: ArmPose = mkPose();
  private cx = { sp: 0, breathe: 0, rise: 0, fall: 0, longFall: 0, speed: 0 };
  private motion: MotionProfile = {
    headBob: 1,
    roll: 1,
    shake: 1,
    speedFov: 1,
    speedLines: 1,
    screenFx: true,
    armSway: 1,
    landing: 1,
    intensity: 1,
  };
  setMotion(m: MotionProfile) {
    this.motion = m;
  }

  private updateArms(
    pl: MovementController,
    st: MoveState,
    speed: number,
    grounded: boolean,
    dt: number,
    camRoll: number,
  ) {
    const m = this.motion;
    const sway = m.armSway;
    const c = this.cx;
    c.speed = speed;
    c.sp = clamp(speed / 11, 0, 1.4);
    c.breathe = Math.sin(this.t * 1.6) * 0.007 * sway;
    const vy = pl.vel.y;
    c.rise = clamp(vy / 9, 0, 1);
    c.fall = clamp(-vy / 15, 0, 1);
    c.longFall = clamp((pl.airTime - 0.45) / 0.8, 0, 1);
    const sp = c.sp;
    const landK = this.landT < this.landDur ? (1 - this.landT / this.landDur) * this.landAmt : 0;
    this.braceS = damp(this.braceS, this.brace, 20, dt);

    // state weights: the active state eases in, the others ease out
    const ti = stateIndex(st);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      this.stateW[i] = damp(this.stateW[i], i === ti ? 1 : 0, i === ti ? W_IN[i] : W_OUT[i], dt);
      sum += this.stateW[i];
    }
    if (sum < 1e-4) this.stateW[ti] = sum = 1;

    const swordArm = this.swordPose(dt, sp);
    for (const a of this.arms) {
      const s = a.side;
      const t = a.target;
      if (s > 0 && swordArm) {
        // the sword hand: pose comes from the blade (see swordPose), only the IK runs here
        t.copy(this.swordWrist);
        a.tCurl = 1.05;
        a.tSplay = 0;
        a.tRoll = 0;
        a.tBend = 0;
        a.tPole = 0.5;
        a.spring.k = this.swordStiff;
        a.spring.d = 1.7 * Math.sqrt(this.swordStiff);
        a.spring.update(t, dt);
        a.curl = damp(a.curl, a.tCurl, 22, dt);
        a.splay = damp(a.splay, 0, 22, dt);
        a.pole = damp(a.pole, a.tPole, 10, dt);
        this.solveArm(a);
        a.hand.quaternion.copy(this.swordHandQ);
        this.finishHand(a);
        this.placeSword(a);
        continue;
      }

      // ---- layer 1: blend the state poses
      const bl = this.blend;
      bl.x = bl.y = bl.z = bl.roll = bl.bend = bl.curl = bl.splay = bl.pole = bl.stiff = 0;
      for (let i = 0; i < 7; i++) {
        const w = this.stateW[i] / sum;
        if (w < 0.003) continue;
        const p = this.poseScratch[i];
        this.poseFor(i, a, pl, p);
        bl.x += p.x * w;
        bl.y += p.y * w;
        bl.z += p.z * w;
        bl.roll += p.roll * w;
        bl.bend += p.bend * w;
        bl.curl += p.curl * w;
        bl.splay += p.splay * w;
        bl.pole += p.pole * w;
        bl.stiff += p.stiff * w;
      }
      t.set(bl.x, bl.y, bl.z);
      a.tRoll = bl.roll;
      a.tBend = bl.bend;
      a.tCurl = bl.curl;
      a.tSplay = bl.splay;
      a.tPole = bl.pole;
      let stiff = bl.stiff;

      // ---- layer 2: overlays
      if (ti === 6) {
        if (this.wjT < 0.28) {
          // wall jump: the wall-side arm shoves off, the other swings across
          if (s === pl.wallSide) {
            t.set(s * 0.46, -0.13, -0.26);
            a.tSplay = 1;
            a.tCurl = 0.05;
            a.tRoll = s * 1.2;
          } else t.set(s * 0.12, -0.12, -0.5);
          stiff = 300;
        }
        if (this.djT < 0.22) {
          t.y -= 0.11; // push down against the air
          a.tSplay = 1;
          a.tCurl = 0.05;
          a.tBend = -0.7;
        }
        // steering in the air: both arms swing against the sideways motion
        t.x -= this.lateral * 0.045 * sway;
        a.tRoll += this.lateral * 0.35 * sway;
      }
      // the free hand counter-swings against a sword stroke
      if (swordArm && this.swordSwing > 0) {
        t.x -= 0.07 * this.swordSwing;
        t.y -= 0.04 * this.swordSwing;
        t.z += 0.07 * this.swordSwing;
        a.tCurl = Math.max(a.tCurl, 0.7);
      }
      // out of a slide: the hands drive forward and up as the body rises
      if (ti !== POSE_SLIDE && this.exitT < 0.3) {
        const ek = 1 - this.exitT / 0.3;
        t.y += 0.05 * ek * sway;
        t.z -= 0.05 * ek * sway;
      }
      // landing: hands brace down and forward, fingers spread; heavy landings bring them together
      if (landK > 0 && grounded) {
        t.y -= 0.075 * landK;
        t.z -= 0.035 * landK;
        if (this.landAmt > 0.55) t.x = lerp(t.x, s * 0.15, landK);
        a.tSplay = Math.max(a.tSplay, landK);
        a.tCurl = lerp(a.tCurl, 0.08, landK);
        a.tBend -= 0.6 * landK;
      }

      // ---- layer 3: secondary motion
      t.x += this.sway.x * sway;
      t.y += this.sway.y * sway;
      a.spring.k = stiff;
      a.spring.d = 1.55 * Math.sqrt(stiff);
      a.spring.update(t, dt);
      a.roll = damp(a.roll, a.tRoll, 12, dt);
      a.bend = damp(a.bend, a.tBend, 13, dt);
      a.curl = damp(a.curl, a.tCurl, 15, dt);
      a.splay = damp(a.splay, a.tSplay, 15, dt);
      a.pole = damp(a.pole, a.tPole, 8, dt);

      this.solveArm(a);
    }

    // the whole upper body: sinks on landings, leans into speed, stays upright when the view rolls
    const fall = c.fall;
    this.rootDip = damp(this.rootDip, landK * (0.035 + this.landHard * 0.04), 20, dt);
    const g = this.gait;
    const stepping = g.moving && grounded ? clamp(sp, 0, 1.2) : 0;
    this.rootLean = damp(
      this.rootLean,
      ((st === MoveState.Sprint ? -0.035 * clamp(sp, 0, 1.2) : fall * 0.05) -
        (grounded ? g.accel * 0.03 : 0)) *
        sway,
      6,
      dt,
    );
    const counterBob = grounded ? Math.sin(this.phase * 2) * 0.005 * sp * sway : 0;
    // each step rolls and twists the shoulders a touch and shifts the weight sideways
    this.stepSway = damp(this.stepSway, stepping, 8, dt);
    const swayK = this.stepSway * sway;
    this.armRoot.position.set(Math.cos(this.phase) * 0.004 * swayK, -this.rootDip - counterBob, 0);
    this.armRoot.rotation.set(
      this.rootLean,
      Math.sin(this.phase) * 0.022 * swayK,
      -camRoll * 0.45 + Math.cos(this.phase) * 0.014 * swayK,
    );
  }

  /** The locomotion pose of one arm in one state (index as in POSE_*), written into `p`. */
  private poseFor(i: number, a: Arm, pl: MovementController, p: ArmPose) {
    const s = a.side;
    const c = this.cx;
    const sp = c.sp;
    p.roll = 0;
    p.bend = 0;
    p.curl = 0.85;
    p.splay = 0;
    p.pole = 0.55;
    p.stiff = 210;
    const swing = Math.sin(this.phase + (s > 0 ? 0 : Math.PI));
    const fwd = Math.max(0, swing),
      back = Math.max(0, -swing);
    switch (i) {
      case POSE_IDLE:
        p.x = s * 0.215;
        p.y = -0.268 + c.breathe;
        p.z = -0.41;
        p.curl = 0.5 + Math.sin(this.t * 0.7 + s) * 0.06;
        p.roll = -s * 0.15;
        p.stiff = 150;
        break;
      case POSE_RUN: {
        // A pumping run. The gait changes character with pace, smoothly rather than at a
        // threshold: a JOG swings loose and low; a SPRINT drives harder and higher; at TOP speed
        // the arms tuck in close and the hands open into blades. Pushing off makes the hands trail
        // back, stopping swings them on; strafing and backpedalling have their own carriage; and
        // every step differs a little from the last.
        const g = this.gait;
        const back_ = clamp(-g.dirF, 0, 1);
        const vary = 1 + g.vary * 0.09;
        const amp = (0.04 + sp * 0.1) * vary * (1 - back_ * 0.45);
        const tuck = g.top;
        p.x =
          s * (0.245 + g.jog * 0.012 - fwd * 0.04 * sp + back * 0.02 - tuck * 0.035) -
          g.dirR * 0.03 +
          back_ * s * 0.02;
        p.y =
          -0.28 + fwd * amp * 0.55 - back * amp * 0.5 + sp * 0.012 - g.jog * 0.012 + back_ * 0.05 * (1 + fwd);
        p.z = -0.4 - fwd * amp * 1.15 + back * amp + g.accel * 0.04 + tuck * 0.02;
        // loose fists with the thumb turned up while running; the hand opens into a blade,
        // edge-on to the wind, only once the runner is well past sprint speed
        const blade = clamp((c.speed - 14) / 5, 0, 1);
        p.curl = lerp(lerp(0.72, 0.9, g.sprint), 0.1, blade);
        p.roll = -s * (0.85 + fwd * 0.2 + blade * 0.35) + g.dirR * 0.25;
        p.bend = fwd * 0.2 - back * 0.1 + blade * 0.35;
        p.pole = lerp(0.46, 0.3, tuck);
        p.stiff = 200 + sp * 50;
        break;
      }
      case POSE_SLIDE: {
        // entry: over the first 0.2 s the hands settle from the drop into the slide carriage;
        // afterwards the pose follows how much speed is left (a fast slide sits lower and
        // wider, the hand drags further behind and chatters harder; a dying slide rises)
        const e = clamp(this.slideT / 0.2, 0, 1);
        const k = e * e * (3 - 2 * e);
        const sK = clamp((c.speed - 3) / 9, 0, 1);
        if (s > 0) {
          // trailing hand skims the ground behind, fingers spread, chattering with speed
          p.x = lerp(0.2, 0.36 + sK * 0.05, k);
          p.y = lerp(-0.12, -0.3 - sK * 0.015, k) + Math.sin(this.t * 31) * (0.003 + 0.005 * sK) * k;
          p.z = lerp(-0.4, -0.31 + sK * 0.08, k);
          p.roll = lerp(0.4, 1.25, k);
          p.bend = lerp(0, -0.55, k);
          p.curl = lerp(0.5, 0.12, k);
          p.splay = k;
          p.pole = lerp(0.6, 1.1, k);
        } else {
          // guard arm leads low across the body, higher as the slide dies
          p.x = lerp(-0.12, -0.25, k);
          p.y = lerp(-0.1, -0.26 - sK * 0.02 + (1 - sK) * 0.03, k);
          p.z = lerp(-0.45, -0.5 - sK * 0.03, k);
          p.roll = lerp(0.1, 0.5, k);
          p.bend = lerp(0, 0.3, k);
          p.curl = lerp(0.6, 0.3, k);
          p.pole = lerp(0.6, 0.9, k);
        }
        break;
      }
      case POSE_WALL:
        if (s === pl.wallSide) {
          // palm planted on the wall, fingers spread, buzzing as it drags
          p.x = s * 0.43;
          p.y = -0.02 + Math.sin(this.t * 27) * 0.005;
          p.z = -0.4 + Math.sin(this.phase) * 0.02;
          p.roll = s * 1.4;
          p.bend = -0.6;
          p.curl = 0.06;
          p.splay = 1;
          p.pole = 0.2;
        } else {
          // the free arm pumps hard for balance
          p.x = s * 0.25;
          p.y = -0.22 + fwd * 0.09 - back * 0.03;
          p.z = -0.4 - fwd * 0.08 + back * 0.07;
          p.curl = 0.7;
          p.roll = -s * 0.3;
        }
        p.stiff = 230;
        break;
      case POSE_DASH:
        if (s > 0) {
          p.x = 0.09; // lead hand: a spear through the air
          p.y = -0.13;
          p.z = -0.56;
          p.curl = 0.05;
          p.roll = -0.9;
          p.bend = 0.1;
        } else {
          p.x = -0.37; // off hand swept back
          p.y = -0.25;
          p.z = -0.14;
          p.curl = 0.1;
          p.splay = 0.4;
        }
        p.stiff = 340;
        break;
      case POSE_VAULT: {
        // both palms plant on the ledge, then drive it down and behind
        const k = pl.vaultT;
        p.x = s * 0.165;
        p.y = -0.2 - k * 0.17;
        p.z = -0.5 + k * 0.26;
        p.curl = 0.05;
        p.splay = 0.7;
        p.bend = -0.75 + k * 0.5;
        p.roll = -s * 0.25;
        p.pole = 0.9;
        p.stiff = 300;
        break;
      }
      default: {
        // airborne. Rising: arms drive up, lead arm ahead. At the top of the arc the body
        // floats: hands open, a slow drift. Falling: arms spread wide and high with open
        // fluttering hands: a long fall looks nothing like a hop. Close to the ground the hands
        // reach down and out to meet it.
        const lead = s > 0 ? 1 : 0;
        const { rise, fall, longFall } = c;
        const apex = (1 - clamp(Math.abs(pl.vel.y) / 3.5, 0, 1)) * clamp(pl.airTime / 0.2, 0, 1);
        const fast = clamp((Math.hypot(pl.vel.x, pl.vel.z) - 9) / 9, 0, 1);
        const b = this.braceS;
        p.x = s * (0.25 + fall * 0.13 + longFall * 0.04 + apex * 0.03 + b * 0.04);
        p.y =
          -0.21 +
          rise * (0.1 + lead * 0.03) +
          fall * 0.1 +
          Math.sin(this.t * 2.6 + s) * 0.008 * apex -
          b * 0.12;
        p.z = -0.42 - rise * lead * 0.05 + fall * 0.06 + fast * 0.05 * (1 - fall) - b * 0.03;
        p.y += Math.sin(this.t * 17 + s * 1.3) * 0.012 * fall * (0.4 + longFall);
        p.x += Math.cos(this.t * 13 + s) * 0.008 * fall * (0.4 + longFall);
        p.curl = lerp(lerp(0.6, 0.06, Math.max(fall, rise * 0.5)), 0.08, Math.max(apex * 0.6, b));
        p.splay = Math.max(fall, apex * 0.5, b);
        p.roll = s * 0.75 * fall - s * 0.2 * rise + s * 0.3 * b;
        p.bend = -0.45 * fall + 0.15 * rise - 0.4 * b;
        p.pole = 0.55 + fall * 0.8;
        p.stiff = 170 + b * 80;
      }
    }
  }

  /** Two-bone IK for one arm and the default (forearm-following) hand orientation. */
  private solveArm(a: Arm) {
    const s = a.side;
    const hand = a.spring.p;
    _d.set(s * a.pole, -1, 0.5); // elbow pole: down, out and slightly back
    _b.copy(hand);
    solveTwoBone(a.shoulder, _b, UPPER, FORE, _d, a.elbow);
    // forearm: explicit basis so its twist (and the hand's) is stable
    const f = _a.subVectors(_b, a.elbow).normalize();
    const r = _c.crossVectors(f, Y);
    if (r.lengthSq() < 1e-4) r.set(1, 0, 0);
    r.normalize();
    const u = _d.crossVectors(r, f);
    _m.makeBasis(r, f, u); // right-handed: +Z is the back of the arm (up when it points forward)
    a.fore.quaternion.setFromRotationMatrix(_m);
    a.fore.position.copy(a.elbow);
    // upper arm: aims shoulder → elbow, with the forearm's side axis so the elbow does not twist
    const du = _sa.subVectors(a.elbow, a.shoulder).normalize();
    const ru = _sr.copy(r).addScaledVector(du, -r.dot(du));
    if (ru.lengthSq() < 1e-6) ru.copy(r);
    ru.normalize();
    const uu = _sg.crossVectors(ru, du);
    _m.makeBasis(ru, du, uu);
    a.upper.quaternion.setFromRotationMatrix(_m);
    a.upper.position.copy(a.shoulder);
    _q.setFromAxisAngle(Y, a.roll);
    a.hand.quaternion.copy(a.fore.quaternion).multiply(_q);
    _q.setFromAxisAngle(X, a.bend);
    a.hand.quaternion.multiply(_q);
    a.hand.position.copy(_b);
    this.finishHand(a);
  }

  /**
   * Everything that hangs off the final hand orientation: the mid-forearm twist bone (half of the
   * hand's roll, so the forearm winds smoothly instead of kinking at the wrist) and the fingers.
   */
  private finishHand(a: Arm) {
    const s = a.side;
    // roll of the hand about the forearm axis: swing-twist split of the relative rotation
    _q.copy(a.fore.quaternion).invert().multiply(a.hand.quaternion);
    const tw = _q2.set(0, _q.y, 0, _q.w);
    if (tw.lengthSq() < 1e-8) tw.identity();
    else tw.normalize();
    _q3.identity().slerp(tw, 0.5);
    a.twist.quaternion.copy(a.fore.quaternion).multiply(_q3);
    a.twist.position.addVectors(a.elbow, a.hand.position).multiplyScalar(0.5);
    for (let i = 0; i < 4; i++) {
      const [p, m, d] = a.fingers[i].bones;
      const c = clamp(a.curl * (1 + (i - 1.5) * 0.08), 0, 1.15);
      p.rotation.set(-c * 1.05, 0, a.fingers[i].spread * (0.25 + a.splay * 1.1));
      m.rotation.x = -c * 1.25;
      d.rotation.x = -c * 0.7;
    }
    const [p, m, d] = a.thumb.bones;
    p.rotation.set(-a.curl * 0.45, 0, a.thumb.spread * (0.75 + a.splay * 0.45) - s * a.curl * 0.3);
    m.rotation.x = -a.curl * 0.55;
    d.rotation.x = -a.curl * 0.45;
  }

  // ----- sword arm ------------------------------------------------------------------------
  private swordWrist = new THREE.Vector3();
  private swordHandQ = new THREE.Quaternion();
  private swordQ = new THREE.Quaternion();
  private swordStiff = 900;
  /** 0..1 how hard the current stroke is swinging (drives the off-hand and effects). */
  swordSwing = 0;
  private bd: [number, number, number] = [0, 0, 0];
  private bd2: [number, number, number] = [0, 0, 0];

  /**
   * Work out where the sword is this frame (camera space): blade direction, hilt position and
   * edge direction, then the hand orientation that holds it and the wrist target for the IK.
   * Returns false while the sword is on the back.
   */
  private swordPose(dt: number, sp: number): boolean {
    const sw = this.sword;
    if (!sw || sw.phase === SwordPhase.Sheathed) {
      this.swordMesh.visible = false;
      this.swordShown = false;
      this.swordSwing = 0;
      return false;
    }
    const b = this.bd,
      e = this.bd2;
    let w = 0; // 0 = resting guard hilt, 1 = swinging arc hilt
    let visible = true;
    let reach = 0; // 0..1 how far behind the shoulder the hand is (drawing / sheathing)
    let swing = 0;
    this.swordStiff = 700;
    switch (sw.phase) {
      case SwordPhase.Drawing:
      case SwordPhase.Sheathing: {
        let k = sw.phase === SwordPhase.Drawing ? sw.t / DRAW_TIME : 1 - sw.t / SHEATHE_TIME;
        k = clamp(k, 0, 1);
        drawDir(clamp((k - 0.25) / 0.75, 0, 1), b);
        reach = 1 - clamp(k / 0.45, 0, 1);
        visible = k > 0.28;
        e[0] = 0;
        e[1] = 0;
        e[2] = -1;
        this.swordStiff = 520;
        break;
      }
      case SwordPhase.Ready: {
        const r = readyDir();
        b[0] = r[0];
        b[1] = r[1];
        b[2] = r[2];
        e[0] = 0;
        e[1] = 0.2;
        e[2] = -1;
        break;
      }
      case SwordPhase.Attack: {
        const p = sw.pose,
          sl = SLASHES[p.kind];
        const wu = windupOf(p);
        bladeDir(p, sw.t, b);
        bladeDir(p, sw.t + 0.012, e);
        e[0] -= b[0];
        e[1] -= b[1];
        e[2] -= b[2];
        if (Math.hypot(e[0], e[1], e[2]) < 1e-4) {
          e[0] = 0;
          e[1] = 0;
          e[2] = -1;
        }
        const tr = sw.t - wu - sl.active;
        w =
          sw.t < wu ? clamp(sw.t / (wu * 0.8), 0, 1) : tr < 0 ? 1 : 1 - clamp(tr / (sl.recover * 0.7), 0, 1);
        swing = sw.t < wu ? 0 : tr < 0 ? 1 : 1 - clamp(tr / (sl.recover * 0.6), 0, 1);
        if (p.fromSheath && sw.t < wu * 0.45) {
          reach = 1 - sw.t / (wu * 0.45);
          visible = sw.t > wu * 0.2;
        }
        this.swordStiff = 1700;
        break;
      }
    }
    this.swordSwing = swing;
    _sb.set(b[0], b[1], b[2]).normalize();
    // edge: perpendicular to the blade, along its travel
    _se.set(e[0], e[1], e[2]);
    _se.addScaledVector(_sb, -_se.dot(_sb));
    if (_se.lengthSq() < 1e-8) _se.set(0, 0, -1).addScaledVector(_sb, _sb.z);
    _se.normalize();
    _sz.crossVectors(_se, _sb);
    _m.makeBasis(_se, _sb, _sz);
    this.swordQ.setFromRotationMatrix(_m);
    // the hand: its -X runs up the blade, +Y (knuckles) along the edge
    _sx.copy(_sb).negate();
    _m.makeBasis(_sx, _se, _sz);
    this.swordHandQ.setFromRotationMatrix(_m);

    // where the hilt is: resting low at the right, or carried on an arc around the chest
    const bob = Math.sin(this.phase * 2) * 0.012 * sp;
    _sh.set(0.27, -0.3 + bob, -0.37);
    this.bd[0] = _sb.x;
    this.bd[1] = _sb.y;
    this.bd[2] = _sb.z;
    swingHilt(this.bd, _sa);
    _sh.lerp(_sa, w);
    // drawing: the hand reaches back over the shoulder to the hilt
    if (reach > 0) _sh.lerp(_sr.set(0.2, 0.06, 0.08), reach);
    // grip point → wrist
    _sg.set(0, 0.075, -0.024).applyQuaternion(this.swordHandQ);
    this.swordWrist.copy(_sh).sub(_sg);
    this.swordMesh.visible = visible;
    this.swordShown = visible;
    return true;
  }

  private placeSword(a: Arm) {
    // follow the actual (sprung) hand so blade and fist never separate
    _sg.set(0, 0.075, -0.024).applyQuaternion(a.hand.quaternion);
    _sh.copy(a.hand.position).add(_sg);
    this.swordMesh.quaternion.copy(this.swordQ);
    _sb.set(0, 1, 0).applyQuaternion(this.swordQ);
    this.swordMesh.position.copy(_sh).addScaledVector(_sb, -SWORD.grip);
    this.bladeBase.copy(this.swordMesh.position);
    this.bladeTip.copy(this.swordMesh.position).addScaledVector(_sb, SWORD.bladeLength);
  }

  private updateLegs(
    pl: MovementController,
    st: MoveState,
    speed: number,
    grounded: boolean,
    feet: THREE.Vector3,
    dt: number,
    yaw: number,
    pitch: number,
  ) {
    const root = this.bodyRoot;
    root.position.copy(feet);
    root.rotation.set(0, yaw, 0);
    const sliding = st === MoveState.Slide;
    const wall = st === MoveState.WallRun;
    // lean the whole body into the wall while wall-running
    this.bodyRoll = damp(this.bodyRoll, wall ? -pl.wallSide * 0.3 : 0, 9, dt);
    root.rotation.z = this.bodyRoll;

    const land =
      this.landT < this.landDur
        ? Math.sin((this.landT / this.landDur) * Math.PI) * this.landAmt * (0.26 + this.landHard * 0.14)
        : 0;
    this.slideBlend = damp(this.slideBlend, sliding ? 1 : 0, sliding ? 16 : 9, dt);
    const sb = this.slideBlend;
    const slideLow = 0.47 + 0.1 * clamp(speed / 11, 0, 1);
    const hipTarget = sliding ? slideLow : land;
    // rising out of a slide is eased; everything else keeps the quick response
    this.hipDrop = damp(this.hipDrop, hipTarget, sliding ? 14 : sb > 0.1 ? 9 : 22, dt);
    const hipY = 0.93 - this.hipDrop;
    // keep the torso out of the lens: it sits behind the eye and leans back in a slide
    const lookDown = clamp(-pitch / 1.2, 0, 1);
    this.torso.position.set(0, hipY + 0.02, 0.1 + lookDown * 0.08 + 0.25 * sb);
    this.torso.rotation.x = lerp(-0.08 - clamp(speed / 30, 0, 0.25), 0.95, sb);

    // the detailed legs only exist for the camera when it can see them: looking down, in a slide
    // (the view drops) or a vault
    const showLegs = pitch < -0.12 || sliding || st === MoveState.Vault;
    const sp = clamp(speed / 11, 0, 1.5);
    const stride = 0.12 + sp * 0.32;
    const lift = 0.05 + sp * 0.2;
    const rise = clamp(pl.vel.y / 9, 0, 1);
    const fall = clamp(-pl.vel.y / 15, 0, 1);
    for (const l of this.legs) {
      const s = l.side;
      const t = l.target;
      const ph = this.phase + (s > 0 ? Math.PI : 0); // opposite to the same-side arm
      l.hip.set(s * 0.11, hipY, 0.06 + 0.2 * sb);
      if (sliding) {
        // legs shoot forward; one knee stays up
        if (s > 0) t.set(0.13, 0.1, -0.78);
        else t.set(-0.12, 0.2, -0.5);
      } else if (st === MoveState.Vault) {
        t.set(s * 0.14, 0.45, -0.25 - pl.vaultT * 0.3);
      } else if (grounded && st !== MoveState.Dash) {
        if (speed < 0.5) t.set(s * 0.13, 0.045, -0.08);
        else {
          // heel kicks up behind at speed, knee drives forward
          const c = Math.cos(ph),
            sn = Math.sin(ph);
          const dF = this.gait.dirF,
            dR = this.gait.dirR;
          t.set(
            s * 0.115 + sn * stride * dR * 0.6,
            0.045 + Math.max(0, c) * lift + Math.max(0, sn) * sp * 0.06,
            -0.08 - sn * stride * dF,
          );
        }
      } else if (wall) {
        t.set(
          s * 0.12 + pl.wallSide * 0.16,
          0.12 + Math.max(0, Math.cos(ph * 1.4)) * 0.22,
          -0.1 - Math.sin(ph * 1.4) * 0.34,
        );
      } else if (st === MoveState.Dash) {
        t.set(s * 0.13, 0.2, 0.38 + (s > 0 ? 0.1 : 0)); // trailing behind the burst
      } else {
        // airborne: lead knee drives up on the way up; legs reach for the ground on the way down
        const tuck = this.djT < 0.3 ? 0.32 : 0;
        const lead = s > 0 ? 1 : 0;
        t.set(
          s * (0.14 + fall * 0.05),
          0.2 + tuck + rise * lead * 0.22 - fall * 0.14 - this.braceS * 0.1,
          (lead ? -0.34 : 0.1) - tuck * 0.5 + fall * (lead ? 0.12 : -0.14) - this.braceS * 0.06 * lead,
        );
      }
      l.spring.update(t, dt);
      const foot = l.spring.p;
      if (grounded && !sliding && foot.y < 0.045) foot.y = 0.045;
      _d.set(s * 0.25, 0.2, -1); // knee pole: forward
      _b.copy(foot);
      _b.y += 0.05;
      solveTwoBone(l.hip, _b, THIGH, SHIN, _d, l.knee);
      placeSegment(l.thigh, l.hip, l.knee);
      const f = _a.subVectors(l.knee, _b).normalize(); // shin's local +Y points up to the knee
      const r = _c.set(1, 0, 0);
      const fw = _d.crossVectors(r, f).normalize();
      r.crossVectors(f, fw).normalize();
      _m.makeBasis(r, f, fw);
      l.shin.quaternion.setFromRotationMatrix(_m);
      l.shin.position.addVectors(l.knee, _b).multiplyScalar(0.5);
      l.foot.position.copy(_b);
      // foot pitches with the shin's lean but stays flat when planted
      const planted = grounded && !sliding && foot.y <= 0.07;
      const pitchFoot = planted ? 0 : clamp(Math.atan2(l.knee.z - _b.z, l.knee.y - _b.y) * 0.8, -1.1, 1.1);
      l.foot.rotation.set(sliding ? -0.5 : -pitchFoot * 0.6, 0, 0);
      const parts = [l.thigh, l.shin, l.foot];
      for (let i = 0; i < 3; i++) {
        l.proxy[i].position.copy(parts[i].position);
        l.proxy[i].quaternion.copy(parts[i].quaternion);
        parts[i].visible = showLegs;
      }
      l.proxy[2].rotation.copy(l.foot.rotation);
    }
    this.hips.visible = showLegs;

    // effect anchor: trailing hand in a slide, feet otherwise
    const sy = Math.sin(yaw),
      cy = Math.cos(yaw);
    if (sliding)
      this.contact.set(feet.x + cy * 0.42 + sy * 0.1, feet.y + 0.03, feet.z - sy * 0.42 + cy * 0.1);
    else this.contact.set(feet.x, feet.y + 0.03, feet.z);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const sk of this.skeletons) sk.dispose();
    this.mat.dispose();
    this.shadowMat.dispose();
    this.armRoot.removeFromParent();
    this.bodyRoot.removeFromParent();
  }
}
