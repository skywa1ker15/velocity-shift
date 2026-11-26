/**
 * The player's visible body, animated entirely in code.
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

const Y = new THREE.Vector3(0, 1, 0);
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

interface Arm {
  side: 1 | -1;
  shoulder: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Group;
  hand: THREE.Group;
  spring: Spring3;
  target: THREE.Vector3;
  elbow: THREE.Vector3;
  roll: number;
  rollTarget: number;
  curl: number;
  curlTarget: number;
  fingers: THREE.Object3D[];
}

interface Leg {
  side: 1 | -1;
  hip: THREE.Vector3;
  thigh: THREE.Mesh;
  shin: THREE.Group;
  foot: THREE.Group;
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
  private suit: THREE.MeshStandardMaterial;
  private plate: THREE.MeshStandardMaterial;
  private glow: THREE.MeshStandardMaterial;
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
  private hipDrop = 0;
  private bodyRoll = 0;
  private geos: THREE.BufferGeometry[] = [];
  /** World position of the trailing hand / feet for particle effects. */
  readonly contact = new THREE.Vector3();

  constructor(viewScene: THREE.Scene, worldScene: THREE.Scene) {
    this.suit = new THREE.MeshStandardMaterial({ color: 0x4a5266, roughness: 0.62, metalness: 0.1 });
    this.plate = new THREE.MeshStandardMaterial({ color: 0x8b95ab, roughness: 0.4, metalness: 0.25 });
    this.glow = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: 0xff9a3c,
      emissiveIntensity: 2.6,
      roughness: 0.4,
    });
    this.buildArms();
    this.buildLegs();
    viewScene.add(this.armRoot);
    worldScene.add(this.bodyRoot);
  }

  setAccent(hex: number) {
    this.glow.emissive.set(hex);
  }
  setVisible(v: boolean) {
    this.armRoot.visible = v;
    this.bodyRoot.visible = v;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  // ----- construction -------------------------------------------------------------------
  private buildArms() {
    const upperGeo = this.geo(new THREE.CapsuleGeometry(0.05, UPPER - 0.1, 3, 10));
    const foreGeo = this.geo(new THREE.CylinderGeometry(0.036, 0.052, FORE, 12, 1));
    const cuffGeo = this.geo(new THREE.CylinderGeometry(0.047, 0.05, 0.07, 12, 1));
    const bandGeo = this.geo(new THREE.CylinderGeometry(0.0495, 0.0515, 0.014, 12, 1));
    const plateGeo = this.geo(new THREE.BoxGeometry(0.06, 0.15, 0.022));
    const palmGeo = this.geo(new THREE.BoxGeometry(0.086, 0.085, 0.034));
    const fingerGeo = this.geo(new THREE.BoxGeometry(0.0185, 0.044, 0.02));
    const tipGeo = this.geo(new THREE.BoxGeometry(0.0175, 0.036, 0.018));
    const thumbGeo = this.geo(new THREE.BoxGeometry(0.022, 0.05, 0.022));
    const knuckleGeo = this.geo(new THREE.BoxGeometry(0.082, 0.014, 0.012));

    for (const side of [1, -1] as const) {
      const upper = new THREE.Mesh(upperGeo, this.suit);
      const fore = new THREE.Group();
      fore.add(new THREE.Mesh(foreGeo, this.suit));
      const cuff = new THREE.Mesh(cuffGeo, this.plate);
      cuff.position.y = FORE / 2 - 0.05;
      const band = new THREE.Mesh(bandGeo, this.glow);
      band.position.y = FORE / 2 - 0.095;
      const armPlate = new THREE.Mesh(plateGeo, this.plate);
      armPlate.position.set(0, -0.01, -0.043); // back of the forearm, faces the camera
      const armGlow = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.012, 0.11, 0.006)), this.glow);
      armGlow.position.set(0, -0.01, -0.056);
      fore.add(cuff, band, armPlate, armGlow);

      // hand: local +Y points along the fingers, local -Z is the back of the hand
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(palmGeo, this.suit);
      palm.position.y = 0.042;
      const knuckle = new THREE.Mesh(knuckleGeo, this.glow);
      knuckle.position.set(0, 0.078, -0.019);
      hand.add(palm, knuckle);
      const fingers: THREE.Object3D[] = [];
      for (let i = 0; i < 4; i++) {
        const base = new THREE.Group();
        base.position.set((i - 1.5) * 0.0215, 0.086, 0);
        const seg = new THREE.Mesh(fingerGeo, this.suit);
        seg.position.y = 0.022;
        const tipPivot = new THREE.Group();
        tipPivot.position.y = 0.044;
        const tip = new THREE.Mesh(tipGeo, this.plate);
        tip.position.y = 0.018;
        tipPivot.add(tip);
        base.add(seg, tipPivot);
        hand.add(base);
        fingers.push(base, tipPivot);
      }
      const thumb = new THREE.Mesh(thumbGeo, this.suit);
      thumb.position.set(side * -0.052, 0.045, 0.012);
      thumb.rotation.z = side * 0.6;
      hand.add(thumb);

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
        roll: 0,
        rollTarget: 0,
        curl: 0.9,
        curlTarget: 0.9,
        fingers,
      };
      arm.spring.p.set(side * 0.2, -0.27, -0.42);
      this.arms.push(arm);
    }
  }

  private buildLegs() {
    const thighGeo = this.geo(new THREE.CapsuleGeometry(0.075, THIGH - 0.15, 3, 10));
    const shinGeo = this.geo(new THREE.CylinderGeometry(0.068, 0.05, SHIN, 10, 1));
    const shinPlate = this.geo(new THREE.BoxGeometry(0.07, 0.26, 0.03));
    const shinGlow = this.geo(new THREE.BoxGeometry(0.014, 0.2, 0.008));
    const footGeo = this.geo(new THREE.BoxGeometry(0.105, 0.075, 0.27));
    const toeGeo = this.geo(new THREE.BoxGeometry(0.1, 0.05, 0.07));
    const soleGeo = this.geo(new THREE.BoxGeometry(0.108, 0.016, 0.275));

    for (const side of [1, -1] as const) {
      const thigh = new THREE.Mesh(thighGeo, this.suit);
      const shin = new THREE.Group();
      shin.add(new THREE.Mesh(shinGeo, this.suit));
      const sp = new THREE.Mesh(shinPlate, this.plate);
      sp.position.set(0, 0.02, -0.058);
      const sg = new THREE.Mesh(shinGlow, this.glow);
      sg.position.set(0, 0.02, -0.075);
      shin.add(sp, sg);
      const foot = new THREE.Group();
      const shoe = new THREE.Mesh(footGeo, this.plate);
      shoe.position.set(0, 0, -0.06);
      const toe = new THREE.Mesh(toeGeo, this.suit);
      toe.position.set(0, -0.012, -0.21);
      const sole = new THREE.Mesh(soleGeo, this.glow);
      sole.position.set(0, -0.042, -0.06);
      foot.add(shoe, toe, sole);
      for (const m of [thigh, ...shin.children, ...foot.children]) (m as THREE.Mesh).castShadow = true;
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

    // lower torso + belt; upper torso exists only as a shadow caster
    this.torso = new THREE.Group();
    const pelvis = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.33, 0.2, 0.2)), this.suit);
    const belt = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.345, 0.045, 0.215)), this.plate);
    belt.position.y = 0.1;
    const buckle = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.07, 0.03, 0.01)), this.glow);
    buckle.position.set(0, 0.1, -0.11);
    const chest = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.34, 0.16, 0.2)), this.suit);
    chest.position.set(0, 0.2, 0.02);
    const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const shadowBody = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.19, 0.5, 3, 8)), shadowMat);
    shadowBody.position.set(0, 0.6, 0);
    shadowBody.castShadow = true;
    pelvis.castShadow = chest.castShadow = true;
    this.torso.add(pelvis, belt, buckle, chest, shadowBody);
    this.bodyRoot.add(this.torso);
  }

  // ----- reactions ----------------------------------------------------------------------
  onLand(impact: number) {
    this.landT = 0;
    this.landAmt = clamp(impact / 22, 0.15, 1);
    for (const a of this.arms) a.spring.v.y -= 0.9 + this.landAmt * 2.2;
  }
  onDash() {
    this.dashT = 0;
    for (const a of this.arms) a.spring.v.z += 3.2; // thrown back by the acceleration
  }
  onDoubleJump() {
    this.djT = 0;
    for (const a of this.arms) {
      a.spring.v.y -= 3.4;
      a.spring.v.x += a.side * 1.2;
    }
    for (const l of this.legs) l.spring.v.y += 3.5;
  }
  onJump() {
    for (const a of this.arms) a.spring.v.y += 1.3;
  }
  onWallJump() {
    this.wjT = 0;
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

    this.updateArms(pl, st, speed, grounded, dt);
    this.updateLegs(pl, st, speed, grounded, feet, dt, yaw, pitch, camRoll);
  }

  private updateArms(pl: MovementController, st: MoveState, speed: number, grounded: boolean, dt: number) {
    const sp = clamp(speed / 11, 0, 1.4);
    const breathe = Math.sin(this.t * 1.6) * 0.007;
    for (const a of this.arms) {
      const s = a.side;
      const t = a.target;
      const swing = Math.sin(this.phase + (s > 0 ? 0 : Math.PI));
      a.rollTarget = 0;
      a.curlTarget = 0.95;
      switch (st) {
        case MoveState.Idle:
          t.set(s * 0.2, -0.262 + breathe, -0.42);
          a.curlTarget = 0.55;
          break;
        case MoveState.Run:
        case MoveState.Sprint: {
          const amp = 0.05 + sp * 0.085;
          t.set(
            s * (0.2 - Math.abs(swing) * 0.02),
            -0.235 + swing * amp * 0.75 + sp * 0.02,
            -0.42 - swing * amp,
          );
          a.curlTarget = sp > 1 ? 0.25 : 0.9; // open "blade" hands at full sprint
          break;
        }
        case MoveState.Slide:
          if (s > 0) {
            t.set(0.35, -0.27, -0.4); // trailing hand skims the ground
            a.rollTarget = 1.2;
            a.curlTarget = 0.2;
          } else {
            t.set(-0.19, -0.15, -0.46); // balance arm out front
            a.curlTarget = 0.3;
          }
          break;
        case MoveState.WallRun:
          if (s === pl.wallSide) {
            t.set(s * 0.42, -0.03 + Math.sin(this.t * 9) * 0.012, -0.42); // palm brushes the wall
            a.rollTarget = s * 1.35;
            a.curlTarget = 0.1;
          } else {
            t.set(s * 0.26, -0.24 + swing * 0.04, -0.4);
          }
          break;
        case MoveState.Dash:
          t.set(s * 0.34, -0.25, -0.16);
          a.curlTarget = 0.15;
          break;
        case MoveState.Vault: {
          const k = pl.vaultT;
          t.set(s * 0.17, -0.24 - k * 0.12, -0.46 + k * 0.18); // plant, then push the obstacle down and back
          a.curlTarget = 0.1;
          a.rollTarget = -s * 0.2;
          break;
        }
        default: {
          // airborne: arms lift on the way up, spread and brace on the way down
          const vy = pl.vel.y;
          const up = clamp(vy / 9, -1, 1);
          t.set(s * (0.27 + (up < 0 ? -up * 0.07 : 0)), -0.19 + up * 0.06, -0.42 + (up < 0 ? up * 0.03 : 0));
          a.curlTarget = 0.35;
          a.rollTarget = up < 0 ? s * 0.5 : 0;
          if (this.wjT < 0.25 && s === pl.wallSide) t.set(s * 0.44, -0.14, -0.3); // push off the wall
        }
      }
      if (!grounded && this.djT < 0.22) t.y -= 0.1; // second-impulse swing
      t.x += this.sway.x;
      t.y += this.sway.y;
      a.spring.update(t, dt);
      a.roll = damp(a.roll, a.rollTarget, 12, dt);
      a.curl = damp(a.curl, a.curlTarget, 14, dt);

      const hand = a.spring.p;
      _d.set(s * 0.55, -1, 0.5); // elbow pole: down, out and slightly back
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
      a.hand.position.copy(_b);
      for (let i = 0; i < a.fingers.length; i++) a.fingers[i].rotation.x = a.curl * (i % 2 ? 1.5 : 1.25);
    }
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
    camRoll: number,
  ) {
    const root = this.bodyRoot;
    root.position.copy(feet);
    root.rotation.set(0, yaw, 0);
    const sliding = st === MoveState.Slide;
    const wall = st === MoveState.WallRun;
    // lean the whole body into the wall while wall-running
    this.bodyRoll = damp(this.bodyRoll, wall ? -pl.wallSide * 0.3 : 0, 9, dt);
    root.rotation.z = this.bodyRoll;
    void camRoll;

    const land = this.landT < 0.3 ? Math.sin((this.landT / 0.3) * Math.PI) * this.landAmt * 0.22 : 0;
    const hipTarget = sliding ? 0.55 : land;
    this.hipDrop = damp(this.hipDrop, hipTarget, sliding ? 14 : 22, dt);
    const hipY = 0.93 - this.hipDrop;
    // keep the torso out of the lens: it sits behind the eye and leans back in a slide
    const lookDown = clamp(-pitch / 1.2, 0, 1);
    this.torso.position.set(0, hipY + 0.02, 0.1 + lookDown * 0.08 + (sliding ? 0.25 : 0));
    this.torso.rotation.x = sliding ? 0.95 : -0.08 - clamp(speed / 30, 0, 0.25);

    const sp = clamp(speed / 11, 0, 1.5);
    const stride = 0.12 + sp * 0.3;
    const lift = 0.05 + sp * 0.16;
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
        else t.set(s * 0.115, 0.045 + Math.max(0, Math.cos(ph)) * lift, -0.08 - Math.sin(ph) * stride);
      } else if (wall) {
        t.set(
          s * 0.12 + pl.wallSide * 0.16,
          0.12 + Math.max(0, Math.cos(ph * 1.4)) * 0.22,
          -0.1 - Math.sin(ph * 1.4) * 0.34,
        );
      } else if (st === MoveState.Dash) {
        t.set(s * 0.13, 0.2, 0.38 + (s > 0 ? 0.1 : 0)); // trailing behind the burst
      } else {
        // airborne: split stance, knees tucking after a double jump
        const tuck = this.djT < 0.3 ? 0.32 : 0;
        const fall = clamp(-pl.vel.y / 20, 0, 1);
        t.set(s * 0.14, 0.2 + tuck - fall * 0.1, (s > 0 ? -0.34 : 0.06) - tuck * 0.5);
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
    this.suit.dispose();
    this.plate.dispose();
    this.glow.dispose();
    this.armRoot.removeFromParent();
    this.bodyRoot.removeFromParent();
  }
}
