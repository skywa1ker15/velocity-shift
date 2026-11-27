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
import { MoveState } from '../movement/types';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCharacterMaterial, PartBuilder, xf, type CharacterMaterial } from '../render/ink';

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

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

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

interface Finger {
  base: THREE.Group;
  tip: THREE.Group;
  spread: number;
}

interface Arm {
  side: 1 | -1;
  shoulder: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  hand: THREE.Group;
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
  private hipDrop = 0;
  private bodyRoll = 0;
  private rootDip = 0;
  private rootLean = 0;
  private lateral = 0;
  private geos: THREE.BufferGeometry[] = [];
  /** World position of the trailing hand / feet for particle effects. */
  readonly contact = new THREE.Vector3();

  constructor(viewScene: THREE.Scene, worldScene: THREE.Scene) {
    this.mat = createCharacterMaterial();
    this.buildArms();
    this.buildLegs();
    viewScene.add(this.armRoot);
    worldScene.add(this.bodyRoot);
  }

  setAccent(hex: number) {
    this.mat.userData.accent.value.set(hex);
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
    const o = outfit;
    for (const side of [1, -1] as const) {
      // upper arm: jacket sleeve
      const upper = this.mesh(new PartBuilder().add(capsule(0.054, UPPER - 0.1), null, o.jacket), 0.004);

      // forearm (local +Y runs toward the hand, local -Z is the back of the arm, facing the camera):
      // a pushed-up sleeve with a rolled cuff, then a fitted gauntlet with a strapped-on guard
      const half = FORE / 2;
      const fore = this.mesh(
        new PartBuilder()
          .add(
            new THREE.CylinderGeometry(0.051, 0.058, half + 0.02, 14, 1),
            xf(0, -half / 2 - 0.01),
            o.jacket,
          )
          .add(new THREE.TorusGeometry(0.052, 0.013, 6, 14), xf(0, 0.004, 0, Math.PI / 2), o.cuff)
          .add(new THREE.CylinderGeometry(0.039, 0.047, half, 14, 1), xf(0, half / 2), o.glove)
          .add(rbox(0.066, 0.108, 0.022, 0.009), xf(0, 0.066, -0.037, -0.05), o.guard)
          .add(rbox(0.014, 0.08, 0.008, 0.003), xf(0, 0.066, -0.05, -0.05), o.guard, { glow: 1 })
          .add(new THREE.CylinderGeometry(0.0475, 0.049, 0.013, 14, 1), xf(0, 0.028), o.strap)
          .add(new THREE.CylinderGeometry(0.043, 0.0445, 0.013, 14, 1), xf(0, 0.1), o.strap)
          .add(new THREE.CylinderGeometry(0.041, 0.041, 0.012, 14, 1), xf(0, half - 0.008), o.glove, {
            accent: true,
          }),
        0.0035,
      );

      // hand: local +Y points along the fingers, local -Z is the back of the hand
      const hand = new THREE.Group();
      const palm = this.mesh(
        new PartBuilder()
          .add(rbox(0.086, 0.09, 0.034, 0.014), xf(0, 0.046, 0), o.glove)
          .add(rbox(0.06, 0.052, 0.012, 0.005), xf(0, 0.046, -0.019), o.guard)
          .add(rbox(0.03, 0.009, 0.005, 0.002), xf(0, 0.056, -0.0262), o.guard, { glow: 1 })
          .add(rbox(0.018, 0.009, 0.005, 0.002), xf(0, 0.04, -0.0262), o.guard, { glow: 1 })
          .add(
            new THREE.SphereGeometry(0.022, 8, 6),
            xf(side * -0.036, 0.03, 0.01, 0, 0, 0, 1, 1.25, 0.9),
            o.glove,
          )
          .add(new THREE.SphereGeometry(0.0105, 8, 6), xf(-0.032, 0.091, -0.011), o.guard)
          .add(new THREE.SphereGeometry(0.0115, 8, 6), xf(-0.0108, 0.093, -0.012), o.guard)
          .add(new THREE.SphereGeometry(0.0115, 8, 6), xf(0.0108, 0.093, -0.012), o.guard)
          .add(new THREE.SphereGeometry(0.0105, 8, 6), xf(0.032, 0.091, -0.011), o.guard),
        0.003,
      );
      hand.add(palm);
      const makeFinger = (len: number, r: number, parent: THREE.Object3D): Finger => {
        const base = new THREE.Group();
        const l1 = 0.036 * len,
          l2 = 0.026 * len,
          l3 = 0.021 * len;
        base.add(this.mesh(new PartBuilder().add(capsule(r, l1), xf(0, l1 / 2), o.glove), 0.0026));
        const tip = new THREE.Group();
        tip.position.y = l1 + 0.002;
        tip.add(
          this.mesh(
            new PartBuilder()
              .add(capsule(r * 0.94, l2), xf(0, l2 / 2), o.glove)
              // the fingertip is dipped in the accent colour: the runner's signature
              .add(capsule(r * 0.9, l3), xf(0, l2 + l3 / 2 - 0.001, l3 * 0.16, 0.32), o.glove, {
                accent: true,
              }),
            0.0026,
          ),
        );
        base.add(tip);
        parent.add(base);
        return { base, tip, spread: 0 };
      };
      const fingers: Finger[] = [];
      const lens = [0.9, 1, 0.95, 0.78];
      for (let i = 0; i < 4; i++) {
        // index finger sits on the thumb side
        const f = makeFinger(lens[i], 0.0105, hand);
        f.base.position.set(side * (i - 1.5) * 0.0214, 0.09, 0.001);
        f.spread = -side * (i - 1.5) * 0.16;
        fingers.push(f);
      }
      const thumb = makeFinger(1.05, 0.0122, hand);
      thumb.base.position.set(side * -0.05, 0.034, 0.012);
      thumb.spread = side * 0.75;

      this.armRoot.add(upper, fore, hand);
      const arm: Arm = {
        side,
        shoulder: new THREE.Vector3(side * 0.235, -0.275, 0.03),
        upper,
        fore,
        hand,
        spring: new Spring3(),
        target: new THREE.Vector3(),
        elbow: new THREE.Vector3(),
        fingers,
        thumb,
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
      for (const m of [thigh, shin, foot]) m.castShadow = true;
      this.bodyRoot.add(thigh, shin, foot);
      const leg: Leg = {
        side,
        hip: new THREE.Vector3(side * 0.11, 0.93, 0.06),
        thigh,
        shin,
        foot,
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
    hips.castShadow = true;
    const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const sg = new THREE.CapsuleGeometry(0.19, 0.5, 3, 8);
    this.geos.push(sg);
    const shadowBody = new THREE.Mesh(sg, shadowMat);
    shadowBody.position.set(0, 0.6, 0);
    shadowBody.castShadow = true;
    this.shadowMat = shadowMat;
    this.torso.add(hips, shadowBody);
    this.bodyRoot.add(this.torso);
  }
  private shadowMat!: THREE.Material;

  // ----- reactions ----------------------------------------------------------------------
  onLand(impact: number) {
    this.landT = 0;
    this.landAmt = clamp(impact / 20, 0.15, 1);
    for (const a of this.arms) {
      a.spring.v.y -= 1.2 + this.landAmt * 2.6;
      a.spring.v.z -= this.landAmt * 0.8;
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
  onJump() {
    this.jumpT = 0;
    // wind-up without delaying the jump: the arms dip for an instant, then the pose throws them up
    for (const a of this.arms) a.spring.v.y -= 1.5;
  }
  onWallJump() {
    this.wjT = 0;
    for (const a of this.arms) a.spring.v.x -= a.side * 0.8;
  }
  onBump() {
    for (const a of this.arms) a.spring.v.z += 1.5;
  }

  // ----- per-frame ----------------------------------------------------------------------
  update(
    pl: MovementController,
    feet: THREE.Vector3,
    bobPhase: number,
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
    const st = pl.state;
    const speed = pl.speed;
    const grounded = pl.grounded;
    this.phase = bobPhase;

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

  private updateArms(
    pl: MovementController,
    st: MoveState,
    speed: number,
    grounded: boolean,
    dt: number,
    camRoll: number,
  ) {
    const sp = clamp(speed / 11, 0, 1.4);
    const breathe = Math.sin(this.t * 1.6) * 0.007;
    const vy = pl.vel.y;
    const rise = clamp(vy / 9, 0, 1);
    const fall = clamp(-vy / 15, 0, 1);
    const longFall = clamp((pl.airTime - 0.45) / 0.8, 0, 1);
    const landK = this.landT < 0.34 ? (1 - this.landT / 0.34) * this.landAmt : 0;
    let stiff = 210;

    for (const a of this.arms) {
      const s = a.side;
      const t = a.target;
      const swing = Math.sin(this.phase + (s > 0 ? 0 : Math.PI));
      const fwd = Math.max(0, swing),
        back = Math.max(0, -swing);
      a.tRoll = 0;
      a.tBend = 0;
      a.tCurl = 0.85;
      a.tSplay = 0;
      a.tPole = 0.55;
      switch (st) {
        case MoveState.Idle:
          t.set(s * 0.215, -0.268 + breathe, -0.41);
          a.tCurl = 0.5 + Math.sin(this.t * 0.7 + s) * 0.06;
          a.tRoll = -s * 0.15;
          stiff = 150;
          break;
        case MoveState.Run:
        case MoveState.Sprint: {
          // a pumping run: the forward hand drives up and toward the centre line, the rear hand
          // drops back out of view. Amplitude, reach and hand shape all grow with real speed.
          const amp = 0.045 + sp * 0.1;
          t.set(
            s * (0.245 - fwd * 0.04 * sp + back * 0.02),
            -0.28 + fwd * amp * 0.55 - back * amp * 0.5 + sp * 0.012,
            -0.4 - fwd * amp * 1.15 + back * amp,
          );
          // loose fists with the thumb turned up while running; the hand opens into a blade,
          // edge-on to the wind, only once the runner is well past sprint speed
          const blade = clamp((speed - 14) / 5, 0, 1);
          a.tCurl = lerp(0.8, 0.1, blade);
          a.tRoll = -s * (0.85 + fwd * 0.2 + blade * 0.35);
          a.tBend = fwd * 0.2 - back * 0.1 + blade * 0.35;
          a.tPole = 0.4;
          stiff = 200 + sp * 50;
          break;
        }
        case MoveState.Slide:
          if (s > 0) {
            // trailing hand skims the ground behind, fingers spread, chattering with speed
            t.set(0.37, -0.3 + Math.sin(this.t * 31) * 0.006 * sp, -0.33);
            a.tRoll = 1.25;
            a.tBend = -0.55;
            a.tCurl = 0.12;
            a.tSplay = 1;
            a.tPole = 1.1;
          } else {
            // guard arm leads low across the body
            t.set(-0.13, -0.155, -0.5);
            a.tRoll = 0.5;
            a.tBend = 0.3;
            a.tCurl = 0.3;
            a.tPole = 0.9;
          }
          break;
        case MoveState.WallRun:
          if (s === pl.wallSide) {
            // palm planted on the wall, fingers spread, buzzing as it drags
            t.set(s * 0.43, -0.02 + Math.sin(this.t * 27) * 0.005, -0.4 + Math.sin(this.phase) * 0.02);
            a.tRoll = s * 1.4;
            a.tBend = -0.6;
            a.tCurl = 0.06;
            a.tSplay = 1;
            a.tPole = 0.2;
          } else {
            // the free arm pumps hard for balance
            t.set(s * 0.25, -0.22 + fwd * 0.09 - back * 0.03, -0.4 - fwd * 0.08 + back * 0.07);
            a.tCurl = 0.7;
            a.tRoll = -s * 0.3;
          }
          stiff = 230;
          break;
        case MoveState.Dash:
          if (s > 0) {
            t.set(0.09, -0.13, -0.56); // lead hand: a spear through the air
            a.tCurl = 0.05;
            a.tRoll = -0.9;
            a.tBend = 0.1;
          } else {
            t.set(-0.37, -0.25, -0.14); // off hand swept back
            a.tCurl = 0.1;
            a.tSplay = 0.4;
          }
          stiff = 340;
          break;
        case MoveState.Vault: {
          // both palms plant on the ledge, then drive it down and behind
          const k = pl.vaultT;
          t.set(s * 0.165, -0.2 - k * 0.17, -0.5 + k * 0.26);
          a.tCurl = 0.05;
          a.tSplay = 0.7;
          a.tBend = -0.75 + k * 0.5;
          a.tRoll = -s * 0.25;
          a.tPole = 0.9;
          stiff = 300;
          break;
        }
        default: {
          // airborne. Rising: arms drive up, lead arm ahead. Falling: arms spread wide and
          // high with open fluttering hands — a long fall looks nothing like a hop.
          const lead = s > 0 ? 1 : 0;
          t.set(
            s * (0.25 + fall * 0.13 + longFall * 0.04),
            -0.21 + rise * (0.1 + lead * 0.03) + fall * 0.1,
            -0.42 - rise * lead * 0.05 + fall * 0.06,
          );
          t.y += Math.sin(this.t * 17 + s * 1.3) * 0.012 * fall * (0.4 + longFall);
          t.x += Math.cos(this.t * 13 + s) * 0.008 * fall * (0.4 + longFall);
          a.tCurl = lerp(0.6, 0.06, Math.max(fall, rise * 0.5));
          a.tSplay = fall;
          a.tRoll = s * 0.75 * fall - s * 0.2 * rise;
          a.tBend = -0.45 * fall + 0.15 * rise;
          a.tPole = 0.55 + fall * 0.8;
          stiff = 170;
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
          t.x -= this.lateral * 0.045;
          a.tRoll += this.lateral * 0.35;
        }
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
      t.x += this.sway.x;
      t.y += this.sway.y;
      a.spring.k = stiff;
      a.spring.d = 1.55 * Math.sqrt(stiff);
      a.spring.update(t, dt);
      a.roll = damp(a.roll, a.tRoll, 12, dt);
      a.bend = damp(a.bend, a.tBend, 13, dt);
      a.curl = damp(a.curl, a.tCurl, 15, dt);
      a.splay = damp(a.splay, a.tSplay, 15, dt);
      a.pole = damp(a.pole, a.tPole, 8, dt);

      const hand = a.spring.p;
      _d.set(s * a.pole, -1, 0.5); // elbow pole: down, out and slightly back
      _b.copy(hand);
      solveTwoBone(a.shoulder, _b, UPPER, FORE, _d, a.elbow);
      placeSegment(a.upper, a.shoulder, a.elbow);
      // forearm: explicit basis so its twist (and the hand's) is stable
      const f = _a.subVectors(_b, a.elbow).normalize();
      const r = _c.crossVectors(f, Y);
      if (r.lengthSq() < 1e-4) r.set(1, 0, 0);
      r.normalize();
      const u = _d.crossVectors(r, f);
      _m.makeBasis(r, f, u.negate());
      a.fore.quaternion.setFromRotationMatrix(_m);
      a.fore.position.addVectors(a.elbow, _b).multiplyScalar(0.5);
      _q.setFromAxisAngle(Y, a.roll);
      a.hand.quaternion.copy(a.fore.quaternion).multiply(_q);
      _q.setFromAxisAngle(X, a.bend);
      a.hand.quaternion.multiply(_q);
      a.hand.position.copy(_b);
      for (let i = 0; i < 4; i++) {
        const fg = a.fingers[i];
        // fingers curl in a wave (index leads) and fan out when the hand opens
        const c = clamp(a.curl * (1 + (i - 1.5) * 0.08), 0, 1.15);
        fg.base.rotation.set(c * 1.3, 0, fg.spread * (0.25 + a.splay * 1.1));
        fg.tip.rotation.x = c * 1.55;
      }
      a.thumb.base.rotation.set(
        a.curl * 0.55,
        0,
        a.thumb.spread * (0.75 + a.splay * 0.45) - s * a.curl * 0.3,
      );
      a.thumb.tip.rotation.x = a.curl * 0.9;
    }

    // the whole upper body: sinks on landings, leans into speed, stays upright when the view rolls
    this.rootDip = damp(this.rootDip, landK * 0.035, 20, dt);
    this.rootLean = damp(
      this.rootLean,
      st === MoveState.Sprint ? -0.035 * clamp(sp, 0, 1.2) : fall * 0.05,
      6,
      dt,
    );
    const counterBob = grounded ? Math.sin(this.phase * 2) * 0.005 * sp : 0;
    this.armRoot.position.set(0, -this.rootDip - counterBob, 0);
    this.armRoot.rotation.set(this.rootLean, 0, -camRoll * 0.45);
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

    const land = this.landT < 0.3 ? Math.sin((this.landT / 0.3) * Math.PI) * this.landAmt * 0.26 : 0;
    const hipTarget = sliding ? 0.55 : land;
    this.hipDrop = damp(this.hipDrop, hipTarget, sliding ? 14 : 22, dt);
    const hipY = 0.93 - this.hipDrop;
    // keep the torso out of the lens: it sits behind the eye and leans back in a slide
    const lookDown = clamp(-pitch / 1.2, 0, 1);
    this.torso.position.set(0, hipY + 0.02, 0.1 + lookDown * 0.08 + (sliding ? 0.25 : 0));
    this.torso.rotation.x = sliding ? 0.95 : -0.08 - clamp(speed / 30, 0, 0.25);

    const sp = clamp(speed / 11, 0, 1.5);
    const stride = 0.12 + sp * 0.32;
    const lift = 0.05 + sp * 0.2;
    const rise = clamp(pl.vel.y / 9, 0, 1);
    const fall = clamp(-pl.vel.y / 15, 0, 1);
    for (const l of this.legs) {
      const s = l.side;
      const t = l.target;
      const ph = this.phase + (s > 0 ? Math.PI : 0); // opposite to the same-side arm
      l.hip.set(s * 0.11, hipY, 0.06 + (sliding ? 0.2 : 0));
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
          t.set(s * 0.115, 0.045 + Math.max(0, c) * lift + Math.max(0, sn) * sp * 0.06, -0.08 - sn * stride);
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
          0.2 + tuck + rise * lead * 0.22 - fall * 0.14,
          (lead ? -0.34 : 0.1) - tuck * 0.5 + fall * (lead ? 0.12 : -0.14),
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
    }

    // effect anchor: trailing hand in a slide, feet otherwise
    const sy = Math.sin(yaw),
      cy = Math.cos(yaw);
    if (sliding)
      this.contact.set(feet.x + cy * 0.42 + sy * 0.1, feet.y + 0.03, feet.z - sy * 0.42 + cy * 0.1);
    else this.contact.set(feet.x, feet.y + 0.03, feet.z);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.shadowMat.dispose();
    this.armRoot.removeFromParent();
    this.bodyRoot.removeFromParent();
  }
}
