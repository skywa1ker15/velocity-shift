/**
 * First-person movement controller.
 *
 * One hierarchical state machine owns the player's velocity; every ability (sprint, slide, dash,
 * double jump, wall-run, wall-jump, vault) reads and writes that same velocity, which is what makes
 * chaining work: momentum flows from one state into the next instead of being reset by animations.
 *
 * The controller is deterministic (fixed dt, no randomness) and knows nothing about levels,
 * rendering or audio — it only talks to a CollisionWorld and emits events.
 * Transition table and tuning notes: docs/MOVEMENT.md
 */
import { Emitter } from '../core/events';
import { clamp, hlen, quatRotate, quatRotateInv, v3, type Quat, type V3 } from '../core/math';
import { movementConfig, type MovementConfig } from './movementConfig';
import {
  MoveState,
  type CollisionWorld,
  type InputFrame,
  type MoveEvents,
  type MoveResult,
  type RayHit,
} from './types';

const DEG = Math.PI / 180;
const UP: V3 = { x: 0, y: 1, z: 0 };
const _l = v3();

export class MovementController {
  /**
   * Tuning for this player. Normally the shared config itself (so the dev panel edits it live and
   * Pure runs stay exact to the tick); Evolve gives the player its own layer over it
   * (`Object.create(movementConfig)`) and writes upgrades into that layer.
   */
  cfg: MovementConfig = movementConfig;
  /** Evolve: air jumps on top of the double jump (Spring's triple jump). 0 in Pure. */
  extraAirJumps = 0;
  private airJumpsLeft = 0;
  readonly pos = v3();
  readonly prevPos = v3();
  readonly vel = v3();
  state: MoveState = MoveState.Air;
  grounded = false;
  readonly groundNormal = v3(0, 1, 0);
  groundId = -1;
  /** Current collision height (stand or slide). */
  height = this.cfg.standHeight;
  crouched = false;
  yaw = 0;
  pitch = 0;

  dashEnergy = this.cfg.dashCharges;
  canDoubleJump = true;
  /** Evolve: give back one air jump (and the triple jump's extra, if owned). */
  refundAirJump() {
    this.canDoubleJump = true;
    this.airJumpsLeft = Math.max(this.airJumpsLeft, this.extraAirJumps > 0 ? 1 : 0);
  }
  /** +1 = wall on the player's right, -1 = wall on the left. */
  wallSide: 1 | -1 = 1;
  readonly wallNormal = v3();
  wallTime = 0;
  wallMax = 1;
  airTime = 0;
  /** Multiplier applied to gravity (gravity zones). */
  gravityScale = 1;
  /** Progress 0..1 of the current vault. */
  vaultT = 0;
  /** Velocity of the surface being stood on (moving platforms). */
  readonly platformVel = v3();
  /** Seconds since the last dash started (for effects). */
  sinceDash = 99;
  /**
   * Gravity frame (Phase G): rotation from the player's local frame to the world. Local +Y points
   * against gravity. Every ability runs unchanged in local space; `pos`, `vel` and the other
   * vectors stay in WORLD space between ticks, so turning the frame never changes momentum.
   * Identity (the usual case) takes the original code path untouched.
   */
  readonly frame: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /**
   * While the frame is still easing toward a new gravity direction, gravity itself must not lag:
   * the air step pulls along this true "down" (world between ticks, local during one).
   */
  readonly trueDown = v3(0, -1, 0);
  useTrueDown = false;

  readonly events = new Emitter<MoveEvents>();

  private coyote = 0;
  private wallCoyote = 0;
  private jumpBuffer = 0;
  private dashBuffer = 0;
  private dashCooldown = 0;
  private slideBoostCd = 0;
  private jumpCut = false;
  private readonly wallDir = v3();
  private wallSpeed = 0;
  private lastWallId = -1;
  private wallNoInput = 0;
  private readonly dashDir = v3();
  private dashTime = 0;
  private preDashSpeed = 0;
  private dashFromAir = false;
  private readonly vaultFrom = v3();
  private readonly vaultTo = v3();
  private readonly vaultDir = v3();
  private vaultSpeed = 0;
  private stepDist = 0;
  private speedBeforeMove = 0;
  private pushTicks = 0;

  private readonly res = {} as MoveResult;
  private readonly hit = {} as RayHit;
  private readonly tmp = v3();
  // per-tick input basis
  private fx = 0;
  private fz = -1;
  private wx = 0;
  private wz = 0;
  private hasWish = false;

  constructor(private world: CollisionWorld) {}

  get speed() {
    if (this.framed) {
      quatRotateInv(this.frame, this.vel, _l);
      return Math.hypot(_l.x, _l.z);
    }
    return hlen(this.vel);
  }
  /** Is the gravity frame turned away from world up? */
  get framed() {
    return !this.local && this.frame.w < 0.9999999 && this.frame.w > -0.9999999;
  }
  /** True while vector state is expressed in the frame (inside a framed tick). */
  private local = false;
  /** Velocity along the frame's up (= vel.y when gravity points down). */
  get upSpeed() {
    if (!this.framed) return this.vel.y;
    return quatRotateInv(this.frame, this.vel, _l).y;
  }
  /** The frame's up axis in world space. */
  upAxis(out: V3 = v3()) {
    return quatRotate(this.frame, UP, out);
  }
  /** World-space position expressed in the local frame. */
  toLocal(v: V3, out: V3 = v3()) {
    return this.framed
      ? quatRotateInv(this.frame, v, out)
      : ((out.x = v.x), (out.y = v.y), (out.z = v.z), out);
  }
  get dashCharges() {
    return Math.floor(this.dashEnergy + 1e-6);
  }
  get isSliding() {
    return this.state === MoveState.Slide;
  }

  reset(x: number, y: number, z: number, yaw: number) {
    this.pos.x = this.prevPos.x = x;
    this.pos.y = this.prevPos.y = y;
    this.pos.z = this.prevPos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.state = MoveState.Air;
    this.grounded = false;
    this.groundId = -1;
    this.height = this.cfg.standHeight;
    this.crouched = false;
    this.dashEnergy = this.cfg.dashCharges;
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.coyote = this.wallCoyote = this.jumpBuffer = this.dashBuffer = this.dashCooldown = 0;
    this.slideBoostCd = 0;
    this.lastWallId = -1;
    this.airTime = 0;
    this.gravityScale = 1;
    this.sinceDash = 99;
    this.platformVel.x = this.platformVel.y = this.platformVel.z = 0;
    this.frame.x = this.frame.y = this.frame.z = 0;
    this.frame.w = 1;
    this.useTrueDown = false;
  }

  kill() {
    this.state = MoveState.Dead;
    this.vel.x = this.vel.y = this.vel.z = 0;
  }

  /** Jump pads / launchers: replaces vertical velocity and puts the player in the air. */
  launch(vx: number, vy: number, vz: number, additive = true) {
    if (this.state === MoveState.Dead) return;
    if (this.framed) {
      // the launch vector is given in world space; "vertical" means along the frame's up
      this.inFrame(() => {
        const l = quatRotateInv(this.frame, { x: vx, y: vy, z: vz }, v3());
        this.launchLocal(l.x, l.y, l.z, additive);
      });
      return;
    }
    this.launchLocal(vx, vy, vz, additive);
  }

  private launchLocal(vx: number, vy: number, vz: number, additive: boolean) {
    if (this.state === MoveState.Slide) this.exitSlide();
    if (additive) {
      this.vel.x += vx;
      this.vel.z += vz;
    } else {
      this.vel.x = vx;
      this.vel.z = vz;
    }
    this.vel.y = vy;
    this.grounded = false;
    this.state = MoveState.Air;
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.jumpCut = false;
    this.coyote = 0;
    this.airTime = 0;
  }

  /** Boost pads: raise horizontal speed along a direction to at least `minSpeed`, adding `add`. */
  boost(dx: number, dz: number, add: number, minSpeed: number) {
    if (this.framed) {
      const l = quatRotateInv(this.frame, { x: dx, y: 0, z: dz }, v3());
      const hl = Math.hypot(l.x, l.z) || 1;
      this.inFrame(() => this.boostLocal(l.x / hl, l.z / hl, add, minSpeed));
      return;
    }
    this.boostLocal(dx, dz, add, minSpeed);
  }

  /**
   * Impulse along an arbitrary world direction (impulse rings, gravity slingshots): the speed along
   * `dir` becomes at least `min`, plus `add`; motion across it is kept, so momentum carries through.
   */
  impulse(dx: number, dy: number, dz: number, add: number, min: number) {
    if (this.state === MoveState.Dead) return;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    const v = this.vel;
    const along = v.x * dx + v.y * dy + v.z * dz;
    const target = Math.max(along + add, min);
    v.x += dx * (target - along);
    v.y += dy * (target - along);
    v.z += dz * (target - along);
    if (this.state === MoveState.Slide) this.inFrame(() => this.exitSlide());
    if (this.grounded && this.upSpeed > 0.5) {
      this.grounded = false;
      this.state = MoveState.Air;
    }
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.airTime = 0;
  }

  private boostLocal(dx: number, dz: number, add: number, minSpeed: number) {
    const along = this.vel.x * dx + this.vel.z * dz;
    const target = Math.max(along + add, minSpeed);
    this.vel.x += dx * (target - along);
    this.vel.z += dz * (target - along);
  }

  // =====================================================================================
  tick(inp: InputFrame, dt: number) {
    if (!this.framed) return this.tickLocal(inp, dt);
    this.inFrame(() => this.tickLocal(inp, dt));
  }

  /** Run `fn` with all vector state expressed in the gravity frame (and the world framed too). */
  private inFrame(fn: () => void) {
    this.convert(true);
    this.world.setFrame?.(this.frame);
    this.local = true;
    try {
      fn();
    } finally {
      this.local = false;
      this.world.setFrame?.(null);
      this.convert(false);
    }
  }
  private convert(toLocal: boolean) {
    const f = toLocal ? quatRotateInv : quatRotate;
    for (const v of this.frameVecs) f(this.frame, v, v);
  }
  private get frameVecs(): V3[] {
    return (this._fv ??= [
      this.pos,
      this.prevPos,
      this.vel,
      this.groundNormal,
      this.wallNormal,
      this.platformVel,
      this.wallDir,
      this.dashDir,
      this.vaultFrom,
      this.vaultTo,
      this.vaultDir,
      this.trueDown,
    ]);
  }
  private _fv?: V3[];

  private tickLocal(inp: InputFrame, dt: number) {
    const p = this.pos;
    this.prevPos.x = p.x;
    this.prevPos.y = p.y;
    this.prevPos.z = p.z;
    if (this.state === MoveState.Dead) return;
    this.yaw = inp.yaw;
    this.pitch = inp.pitch;

    // timers
    if (this.dashEnergy < this.cfg.dashCharges)
      this.dashEnergy = Math.min(this.cfg.dashCharges, this.dashEnergy + dt / this.cfg.dashRecharge);
    this.dashCooldown -= dt;
    this.slideBoostCd -= dt;
    this.sinceDash += dt;
    this.coyote -= dt;
    this.wallCoyote -= dt;
    this.jumpBuffer = inp.jumpPressed ? this.cfg.jumpBuffer : this.jumpBuffer - dt;
    this.dashBuffer = inp.dashPressed ? 0.1 : this.dashBuffer - dt;

    // input basis (yaw 0 looks down -Z)
    const sy = Math.sin(inp.yaw),
      cy = Math.cos(inp.yaw);
    this.fx = -sy;
    this.fz = -cy;
    let wx = this.fx * inp.moveZ + cy * inp.moveX;
    let wz = this.fz * inp.moveZ - sy * inp.moveX;
    const wl = Math.hypot(wx, wz);
    this.hasWish = wl > 0.01;
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    this.wx = wx;
    this.wz = wz;

    // ride moving surfaces
    const pv = this.platformVel;
    pv.x = pv.y = pv.z = 0;
    if (this.grounded && this.groundId !== -1) {
      const d = this.tmp;
      this.world.surfaceDelta(this.groundId, p, d);
      if (d.x !== 0 || d.y !== 0 || d.z !== 0) {
        p.x += d.x;
        p.y += d.y;
        p.z += d.z;
        pv.x = d.x / dt;
        pv.y = d.y / dt;
        pv.z = d.z / dt;
      }
    }

    // shoved by moving terrain (sliding walls, shutters): move with it; if pinned, get crushed
    const overlap = this.world.overlapPush(p, this.height, this.tmp);
    if (overlap === 2) {
      const d = this.tmp;
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      const k = (len + 0.03) / len;
      const r = this.res;
      this.world.move(p, this.height, d.x * k, Math.max(0, d.y * k), d.z * k, false, r);
      p.x = r.x;
      p.y = r.y;
      p.z = r.z;
    }
    if (overlap === 3) {
      // (gravity frames only) the body turned into a surface: step straight back out of it
      p.x += this.tmp.x;
      p.y += this.tmp.y;
      p.z += this.tmp.z;
      this.pushTicks = 0;
    } else if (overlap === 0) this.pushTicks = 0;
    else if (++this.pushTicks > 30) {
      this.pushTicks = 0;
      this.events.emit('crushed', {});
      return;
    }

    if (this.state === MoveState.Vault) {
      this.updateVault(dt);
      return;
    }

    if (this.dashBuffer > 0 && this.dashEnergy >= 1 && this.dashCooldown <= 0) this.startDash(inp);

    switch (this.state) {
      case MoveState.Dash:
        this.updateDash(inp, dt);
        break;
      case MoveState.WallRun:
        this.updateWallRun(inp, dt);
        break;
      case MoveState.Air:
        this.updateAir(inp, dt);
        break;
      default:
        this.updateGround(inp, dt);
    }

    // soft speed ceiling
    const v = this.vel;
    const hs = hlen(v);
    if (hs > this.cfg.softSpeedCap && this.state !== MoveState.Dash) {
      const ns = hs - (hs - this.cfg.softSpeedCap) * Math.min(1, this.cfg.softCapDrag * dt);
      v.x *= ns / hs;
      v.z *= ns / hs;
    }
    this.speedBeforeMove = hlen(v);

    // integrate + collide
    const st = this.state as MoveState;
    const onGround = st !== MoveState.Air && st !== MoveState.WallRun && this.grounded && v.y <= 0;
    const dy = onGround ? 0 : v.y * dt;
    const r = this.res;
    this.world.move(p, this.height, v.x * dt, dy, v.z * dt, onGround, r);
    p.x = r.x;
    p.y = r.y;
    p.z = r.z;
    this.afterMove(inp, dt);
  }

  // ----- ground -------------------------------------------------------------------------
  private updateGround(inp: InputFrame, dt: number) {
    const v = this.vel;
    if (this.jumpBuffer > 0 && this.tryJump()) {
      this.updateAir(inp, 0);
      return;
    }
    let speed = hlen(v);
    if (this.state !== MoveState.Slide && inp.slidePressed && speed >= this.cfg.slideMinEnterSpeed)
      this.enterSlide();

    if (this.state === MoveState.Slide) {
      // slopes feed the slide: gravity projected onto the ground plane
      const n = this.groundNormal;
      const g = this.cfg.gravity * this.gravityScale * n.y * this.cfg.slideSlopeGain * dt;
      v.x += n.x * g;
      v.z += n.z * g;
      speed = hlen(v);
      const ns = Math.max(0, speed - this.cfg.slideFriction * dt);
      if (speed > 1e-4) {
        let dx = v.x / speed,
          dz = v.z / speed;
        if (this.hasWish) {
          // limited steering: rotate heading toward the wish direction
          const cross = dx * this.wz - dz * this.wx;
          const dot = dx * this.wx + dz * this.wz;
          const ang = Math.atan2(cross, dot);
          const turn = clamp(ang, -this.cfg.slideSteer * dt, this.cfg.slideSteer * dt);
          const c = Math.cos(turn),
            s = Math.sin(turn);
          const ndx = dx * c - dz * s;
          dz = dx * s + dz * c;
          dx = ndx;
        }
        v.x = dx * ns;
        v.z = dz * ns;
      }
      v.y = 0;
      if (ns < this.cfg.slideExitSpeed || !inp.slideHeld) this.exitSlide();
      return;
    }

    // standing up again after a slide that ended under a low ceiling
    if (this.crouched && this.world.canFit(this.pos.x, this.pos.y, this.pos.z, this.cfg.standHeight)) {
      this.crouched = false;
      this.height = this.cfg.standHeight;
    }
    const top = this.crouched
      ? this.cfg.crouchSpeed
      : inp.sprint && inp.moveZ > 0
        ? this.cfg.sprintSpeed
        : this.cfg.runSpeed;
    if (this.hasWish) {
      let ns: number;
      if (speed > top) ns = Math.max(top, speed - this.cfg.overspeedDecay * dt);
      else if (speed < Math.min(top, this.cfg.runSpeed))
        ns = Math.min(Math.min(top, this.cfg.runSpeed), speed + this.cfg.runAccel * dt);
      else ns = Math.min(top, speed + this.cfg.sprintAccel * dt);
      // carrying extra momentum only works when roughly following it
      if (speed > 0.1 && (v.x * this.wx + v.z * this.wz) / speed < 0.5) ns = Math.min(ns, top);
      this.steer(this.wx * ns, this.wz * ns, this.cfg.groundSteer * dt);
    } else {
      this.steer(0, 0, this.cfg.groundDecel * dt);
    }
    v.y = 0;
    speed = hlen(v);
    this.state =
      speed < 0.4 && !this.hasWish
        ? MoveState.Idle
        : speed > this.cfg.runSpeed + 0.6
          ? MoveState.Sprint
          : MoveState.Run;

    // footsteps
    this.stepDist += speed * dt;
    const stride = 1.15 + speed * 0.11;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      this.events.emit('footstep', { wall: false, speed });
    }
  }

  private steer(tx: number, tz: number, maxDelta: number) {
    const v = this.vel;
    const dx = tx - v.x,
      dz = tz - v.z;
    const d = Math.hypot(dx, dz);
    if (d <= maxDelta || d < 1e-6) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / d) * maxDelta;
      v.z += (dz / d) * maxDelta;
    }
  }

  private enterSlide() {
    const v = this.vel;
    const speed = hlen(v);
    let boosted = false;
    if (
      this.slideBoostCd <= 0 &&
      speed >= this.cfg.runSpeed * 0.9 &&
      speed < this.cfg.sprintSpeed + this.cfg.slideBoost + 0.5
    ) {
      const ns = speed + this.cfg.slideBoost;
      v.x *= ns / speed;
      v.z *= ns / speed;
      this.slideBoostCd = this.cfg.slideBoostCooldown;
      boosted = true;
    }
    this.state = MoveState.Slide;
    this.height = this.cfg.slideHeight;
    this.crouched = false;
    this.events.emit('slideStart', { boosted });
  }

  /** Leave the slide; stay crouched if there is no head room. */
  private exitSlide() {
    if (this.state !== MoveState.Slide) return;
    this.state = this.grounded ? MoveState.Run : MoveState.Air;
    if (this.world.canFit(this.pos.x, this.pos.y, this.pos.z, this.cfg.standHeight)) {
      this.height = this.cfg.standHeight;
      this.crouched = false;
    } else {
      this.crouched = true;
    }
    this.events.emit('slideEnd', {});
  }

  private tryJump(): boolean {
    const fromSlide = this.state === MoveState.Slide;
    if (fromSlide || this.crouched) {
      if (!this.world.canFit(this.pos.x, this.pos.y, this.pos.z, this.cfg.standHeight)) return false;
      if (fromSlide) this.exitSlide();
      this.crouched = false;
      this.height = this.cfg.standHeight;
    }
    const v = this.vel;
    v.x += this.platformVel.x;
    v.z += this.platformVel.z;
    v.y = this.cfg.jumpVelocity + Math.max(0, this.platformVel.y);
    this.grounded = false;
    this.groundId = -1;
    this.state = MoveState.Air;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpCut = true;
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.airTime = 0;
    this.events.emit('jump', { fromSlide });
    return true;
  }

  // ----- air ----------------------------------------------------------------------------
  private updateAir(inp: InputFrame, dt: number) {
    const v = this.vel;
    this.airTime += dt;
    if (this.crouched && this.world.canFit(this.pos.x, this.pos.y, this.pos.z, this.cfg.standHeight)) {
      this.crouched = false;
      this.height = this.cfg.standHeight;
    }
    if (this.jumpBuffer > 0) {
      if (this.coyote > 0) {
        this.grounded = true; // coyote jump behaves exactly like a ground jump
        if (this.tryJump()) this.airTime = 0;
        this.grounded = false;
      } else if (this.wallCoyote > 0) {
        this.wallJump();
      } else if (this.canDoubleJump) {
        // about to land? keep the press buffered for a bunny-hop instead of burning the double jump
        const landingSoon =
          v.y < -1 &&
          this.world.raycast(
            this.pos.x,
            this.pos.y + 0.1,
            this.pos.z,
            0,
            -1,
            0,
            -v.y * this.jumpBuffer + 0.15,
            this.hit,
          ) &&
          this.hit.ny > 0.6;
        if (!landingSoon) this.doubleJump();
      }
    }
    if (this.jumpCut) {
      if (v.y <= 0) this.jumpCut = false;
      else if (!inp.jumpHeld) {
        v.y *= this.cfg.jumpCutMultiplier;
        this.jumpCut = false;
      }
    }
    if (this.useTrueDown) {
      // gravity along the true field while the frame catches up (same fall boost and cap)
      const d = this.trueDown;
      const along = v.x * d.x + v.y * d.y + v.z * d.z;
      const g = this.cfg.gravity * this.gravityScale * (along > 0 ? this.cfg.fallMultiplier : 1) * dt;
      const capped = Math.min(along + g, this.cfg.terminalVelocity) - along;
      if (capped > 0) {
        v.x += d.x * capped;
        v.y += d.y * capped;
        v.z += d.z * capped;
      }
    } else {
      const g = this.cfg.gravity * this.gravityScale * (v.y < 0 ? this.cfg.fallMultiplier : 1);
      v.y = Math.max(v.y - g * dt, -this.cfg.terminalVelocity);
    }
    if (this.hasWish && dt > 0) {
      // Quake-style air acceleration: steer without ever reducing existing momentum
      const cur = v.x * this.wx + v.z * this.wz;
      const add = this.cfg.airWishSpeed - cur;
      if (add > 0) {
        const a = Math.min(this.cfg.airAccel * dt, add);
        v.x += this.wx * a;
        v.z += this.wz * a;
      }
    }
  }

  private doubleJump() {
    const v = this.vel;
    const speed = hlen(v);
    if (this.hasWish) {
      if (speed < this.cfg.runSpeed) {
        v.x = this.wx * this.cfg.runSpeed;
        v.z = this.wz * this.cfg.runSpeed;
      } else {
        // redirect part of the momentum toward the input direction, keeping its magnitude
        let dx = v.x / speed + (this.wx - v.x / speed) * this.cfg.doubleJumpRedirect;
        let dz = v.z / speed + (this.wz - v.z / speed) * this.cfg.doubleJumpRedirect;
        const l = Math.hypot(dx, dz);
        if (l > 0.05) {
          dx /= l;
          dz /= l;
          v.x = dx * speed;
          v.z = dz * speed;
        }
      }
    }
    v.y = this.cfg.doubleJumpVelocity;
    if (this.airJumpsLeft > 0) this.airJumpsLeft--;
    else this.canDoubleJump = false;
    this.jumpBuffer = 0;
    this.jumpCut = false;
    this.events.emit('doubleJump', {});
  }

  // ----- dash ---------------------------------------------------------------------------
  private startDash(inp: InputFrame) {
    if (this.state === MoveState.Slide) this.exitSlide();
    if (this.state === MoveState.WallRun) this.endWallRun(false);
    const air = !this.grounded;
    const d = this.dashDir;
    if (air) {
      const pitch = clamp(inp.pitch, -this.cfg.dashMaxPitchDeg * DEG, this.cfg.dashMaxPitchDeg * DEG);
      const cp = Math.cos(pitch);
      d.x = this.fx * cp;
      d.y = Math.sin(pitch);
      d.z = this.fz * cp;
    } else {
      d.x = this.fx;
      d.y = 0;
      d.z = this.fz;
    }
    this.preDashSpeed = hlen(this.vel);
    this.dashTime = this.cfg.dashDuration;
    this.dashEnergy -= 1;
    this.dashCooldown = this.cfg.dashMinInterval;
    this.dashBuffer = 0;
    this.sinceDash = 0;
    this.dashFromAir = air;
    this.jumpCut = false;
    this.state = MoveState.Dash;
    this.events.emit('dash', { air });
  }

  private updateDash(inp: InputFrame, dt: number) {
    const v = this.vel,
      d = this.dashDir;
    v.x = d.x * this.cfg.dashSpeed;
    v.y = this.grounded ? 0 : d.y * this.cfg.dashSpeed;
    v.z = d.z * this.cfg.dashSpeed;
    this.dashTime -= dt;
    const wantsJump = this.jumpBuffer > 0 && (this.grounded || this.coyote > 0);
    if (this.dashTime <= 0 || wantsJump || (inp.slidePressed && this.grounded)) {
      this.endDash();
      if (this.grounded) {
        if (wantsJump) this.tryJump();
        else if (inp.slidePressed || inp.slideHeld) this.enterSlide();
      }
    }
  }

  private endDash() {
    if (this.state !== MoveState.Dash) return;
    const v = this.vel,
      d = this.dashDir;
    const exit = Math.min(Math.max(this.preDashSpeed, this.cfg.dashExitSpeed), this.cfg.softSpeedCap);
    const hl = Math.hypot(d.x, d.z) || 1;
    v.x = (d.x / hl) * exit;
    v.z = (d.z / hl) * exit;
    v.y = this.grounded ? 0 : d.y * exit * 0.6;
    this.state = this.grounded ? MoveState.Run : MoveState.Air;
    this.events.emit('dashEnd', {});
  }

  // ----- wall-run -----------------------------------------------------------------------
  private tryWallRun(inp: InputFrame): boolean {
    const v = this.vel;
    const speed = hlen(v);
    if (speed < this.cfg.wallMinSpeed || inp.moveZ <= 0 || this.airTime < 0.06 || this.grounded) return false;
    const hx = v.x / speed,
      hz = v.z / speed;
    // right of heading
    const rx = -hz,
      rz = hx;
    const p = this.pos,
      h = this.hit;
    const oy = p.y + this.height * 0.55;
    const reach = this.cfg.radius + this.cfg.wallCheckDistance;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      if (!this.world.raycast(p.x, oy, p.z, rx * side, 0, rz * side, reach, h)) continue;
      if (!h.wallrun || Math.abs(h.ny) > 0.26 || h.id === this.lastWallId) continue;
      const into = hx * h.nx + hz * h.nz; // negative when heading into the wall
      if (into < -Math.sin(this.cfg.wallMaxAngleDeg * DEG)) continue;
      if (this.wx * h.nx + this.wz * h.nz > 0.6) continue; // steering away from it
      const nx = h.nx,
        nz = h.nz,
        id = h.id;
      // not when about to touch the ground anyway
      if (this.world.raycast(p.x, p.y + 0.1, p.z, 0, -1, 0, this.cfg.wallMinGroundClearance + 0.1, h))
        continue;
      this.startWallRun(nx, nz, id, side as 1 | -1, speed, hx, hz);
      return true;
    }
    return false;
  }

  private startWallRun(
    nx: number,
    nz: number,
    id: number,
    side: 1 | -1,
    speed: number,
    hx: number,
    hz: number,
  ) {
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const d = hx * nx + hz * nz;
    let tx = hx - nx * d,
      tz = hz - nz * d;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    this.wallNormal.x = nx;
    this.wallNormal.y = 0;
    this.wallNormal.z = nz;
    this.wallDir.x = tx;
    this.wallDir.z = tz;
    // only the speed already travelling ALONG the wall carries over: sideways speed from a
    // previous kick-off is absorbed, so wall-to-wall chains cannot accelerate without limit
    const along = speed * (hx * tx + hz * tz);
    this.wallSpeed =
      Math.max(along, this.cfg.wallRunSpeedFloor) + (this.sinceDash < 0.45 ? this.cfg.wallDashBonus : 0);
    this.vel.y = Math.max(clamp(this.vel.y, -3, 5), this.cfg.wallStartLift);
    this.wallTime = 0;
    this.wallNoInput = 0;
    this.wallMax = clamp(
      this.cfg.wallDurationBase + this.wallSpeed * this.cfg.wallDurationPerSpeed,
      this.cfg.wallDurationBase,
      this.cfg.wallDurationMax,
    );
    this.wallSide = side;
    this.lastWallId = id;
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.dashEnergy = Math.max(this.dashEnergy, 1);
    this.jumpCut = false;
    this.state = MoveState.WallRun;
    this.stepDist = 0;
    this.events.emit('wallRunStart', { side });
  }

  private updateWallRun(inp: InputFrame, dt: number) {
    const v = this.vel,
      p = this.pos,
      n = this.wallNormal,
      t = this.wallDir,
      h = this.hit;
    this.wallTime += dt;
    if (this.jumpBuffer > 0) {
      this.wallJump();
      this.updateAir(inp, 0);
      return;
    }
    // still touching a runnable wall?
    const ok =
      this.world.raycast(p.x, p.y + this.height * 0.55, p.z, -n.x, 0, -n.z, this.cfg.radius + 0.8, h) &&
      h.wallrun &&
      Math.abs(h.ny) < 0.3;
    this.wallNoInput = inp.moveZ > 0 ? 0 : this.wallNoInput + dt;
    if (!ok || this.wallTime >= this.wallMax || this.wallNoInput > 0.18) {
      this.endWallRun(true);
      this.updateAir(inp, dt);
      return;
    }
    // follow gently curving walls
    const nl = Math.hypot(h.nx, h.nz) || 1;
    n.x = h.nx / nl;
    n.z = h.nz / nl;
    const d = t.x * n.x + t.z * n.z;
    t.x -= n.x * d;
    t.z -= n.z * d;
    const tl = Math.hypot(t.x, t.z) || 1;
    t.x /= tl;
    t.z /= tl;
    // gravity ramps in over the run: an arc, not a flat line
    const k = this.wallTime / this.wallMax;
    v.y -= this.cfg.gravity * this.gravityScale * this.cfg.wallGravityScale * k * k * 2 * dt;
    if (v.y > 0) v.y -= 4 * dt;
    if (this.cfg.wallRunGain)
      this.wallSpeed = Math.min(this.cfg.softSpeedCap, this.wallSpeed + (this.cfg.wallRunGain - 0.8) * dt);
    else this.wallSpeed = Math.max(this.cfg.wallRunSpeedFloor, this.wallSpeed - 0.8 * dt);
    v.x = t.x * this.wallSpeed - n.x * 1.2;
    v.z = t.z * this.wallSpeed - n.z * 1.2;
    this.stepDist += this.wallSpeed * dt;
    if (this.stepDist > 2.1) {
      this.stepDist = 0;
      this.events.emit('footstep', { wall: true, speed: this.wallSpeed });
    }
  }

  private endWallRun(coyote: boolean) {
    if (this.state !== MoveState.WallRun) return;
    const v = this.vel,
      t = this.wallDir;
    v.x = t.x * this.wallSpeed;
    v.z = t.z * this.wallSpeed;
    this.state = MoveState.Air;
    this.wallCoyote = coyote ? this.cfg.wallCoyote : 0;
    this.airTime = 0.1;
    this.events.emit('wallRunEnd', {});
  }

  private wallJump() {
    const v = this.vel,
      n = this.wallNormal,
      t = this.wallDir;
    const wasRunning = this.state === MoveState.WallRun;
    v.x = t.x * this.wallSpeed + n.x * this.cfg.wallJumpOut;
    v.z = t.z * this.wallSpeed + n.z * this.cfg.wallJumpOut;
    v.y = this.cfg.wallJumpUp;
    this.state = MoveState.Air;
    this.wallCoyote = 0;
    this.jumpBuffer = 0;
    this.jumpCut = false;
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.airTime = 0.1;
    if (wasRunning) this.events.emit('wallRunEnd', {});
    this.events.emit('wallJump', { side: this.wallSide });
  }

  // ----- vault --------------------------------------------------------------------------
  private tryVault(inp: InputFrame, nx: number, nz: number): boolean {
    if (inp.moveZ <= 0 || this.speedBeforeMove < this.cfg.vaultMinSpeed) return false;
    if (!this.grounded && this.vel.y > 4) return false;
    const nl = Math.hypot(nx, nz);
    if (nl < 0.5) return false;
    nx /= nl;
    nz /= nl;
    // must be moving (and looking) into the obstacle
    if (this.fx * nx + this.fz * nz > -0.5) return false;
    const p = this.pos,
      h = this.hit;
    const ax = p.x - nx * (this.cfg.radius + 0.25),
      az = p.z - nz * (this.cfg.radius + 0.25);
    const top = p.y + this.cfg.vaultMaxHeight + 0.25;
    if (
      !this.world.raycast(ax, top, az, 0, -1, 0, this.cfg.vaultMaxHeight + 0.25 - this.cfg.vaultMinHeight, h)
    )
      return false;
    if (h.ny < 0.7 || h.dist < 0.02) return false;
    const topY = top - h.dist;
    const lx = p.x - nx * (this.cfg.radius + this.cfg.vaultReach),
      lz = p.z - nz * (this.cfg.radius + this.cfg.vaultReach);
    if (!this.world.canFit(lx, topY + 0.03, lz, this.cfg.slideHeight)) return false;
    if (this.state === MoveState.Slide) this.exitSlide();
    this.vaultFrom.x = p.x;
    this.vaultFrom.y = p.y;
    this.vaultFrom.z = p.z;
    this.vaultTo.x = lx;
    this.vaultTo.y = topY + 0.03;
    this.vaultTo.z = lz;
    this.vaultDir.x = -nx;
    this.vaultDir.z = -nz;
    this.vaultSpeed = Math.max(this.speedBeforeMove * this.cfg.vaultSpeedKeep, 6);
    this.vaultT = 0;
    this.state = MoveState.Vault;
    this.grounded = false;
    this.groundId = -1;
    this.events.emit('vault', { height: topY - p.y });
    return true;
  }

  private updateVault(dt: number) {
    const p = this.pos,
      a = this.vaultFrom,
      b = this.vaultTo,
      r = this.res;
    this.vaultT = Math.min(1, this.vaultT + dt / this.cfg.vaultDuration);
    const k = this.vaultT;
    const ky = Math.min(1, k / 0.5);
    const kh = k < 0.3 ? 0 : (k - 0.3) / 0.7;
    const tx = a.x + (b.x - a.x) * kh,
      ty = a.y + (b.y - a.y + 0.06) * (1 - (1 - ky) * (1 - ky)),
      tz = a.z + (b.z - a.z) * kh;
    this.world.move(p, this.height, tx - p.x, ty - p.y, tz - p.z, false, r);
    p.x = r.x;
    p.y = r.y;
    p.z = r.z;
    if (k >= 1) {
      // if collision resolution left us short of the landing spot, finish the move
      if (Math.hypot(p.x - b.x, p.z - b.z) > 0.25 && this.world.canFit(b.x, b.y, b.z, this.height)) {
        p.x = b.x;
        p.y = b.y;
        p.z = b.z;
      }
      const v = this.vel;
      v.x = this.vaultDir.x * this.vaultSpeed;
      v.z = this.vaultDir.z * this.vaultSpeed;
      v.y = 0;
      this.state = MoveState.Air;
      this.coyote = this.cfg.coyoteTime;
      this.airTime = 0;
      this.canDoubleJump = true;
      this.airJumpsLeft = this.extraAirJumps;
    }
  }

  // ----- post-move resolution -----------------------------------------------------------
  private afterMove(inp: InputFrame, dt: number) {
    const r = this.res,
      v = this.vel;
    const st = this.state as MoveState;
    const wasGrounded = this.grounded;

    if (r.hitCeiling && v.y > 0) v.y = 0;

    if (st === MoveState.WallRun) {
      if (r.grounded) this.land(inp, 0);
      else if (r.hitWall && r.wallNx * this.wallDir.x + r.wallNz * this.wallDir.z < -0.5)
        this.endWallRun(false);
      return;
    }

    // walls: lose the velocity component going into them, keep the rest (slide along)
    if (r.hitWall) {
      const vn = v.x * r.wallNx + v.z * r.wallNz;
      if (vn < 0) {
        if (st === MoveState.Dash) this.endDash();
        const vn2 = this.vel.x * r.wallNx + this.vel.z * r.wallNz;
        if (vn2 < 0) {
          v.x -= r.wallNx * vn2;
          v.z -= r.wallNz * vn2;
        }
        if (this.tryVault(inp, r.wallNx, r.wallNz)) return;
        if (-vn > 7) this.events.emit('bump', { speed: -vn });
      }
    }

    const state = this.state as MoveState;
    if (state === MoveState.Air || (state === MoveState.Dash && !wasGrounded)) {
      if (r.grounded && v.y <= 0.01) {
        this.land(inp, -v.y);
      } else if (state === MoveState.Air) {
        this.tryWallRun(inp);
      }
      return;
    }
    // ground states (and ground dash)
    if (r.grounded) {
      this.grounded = true;
      this.groundId = r.groundId;
      this.groundNormal.x = r.gnx;
      this.groundNormal.y = r.gny;
      this.groundNormal.z = r.gnz;
    } else {
      // walked, slid or dashed off an edge
      this.grounded = false;
      this.groundId = -1;
      this.coyote = this.cfg.coyoteTime;
      this.airTime = 0;
      v.x += this.platformVel.x;
      v.z += this.platformVel.z;
      if (state === MoveState.Slide) this.exitSlide();
      if (state !== MoveState.Dash) this.state = MoveState.Air;
    }
    void dt;
  }

  private land(inp: InputFrame, impact: number) {
    const v = this.vel,
      r = this.res;
    const wasWall = this.state === MoveState.WallRun;
    if (wasWall) this.events.emit('wallRunEnd', {});
    if (this.state === MoveState.Dash) this.endDash();
    this.grounded = true;
    this.groundId = r.groundId;
    this.groundNormal.x = r.gnx;
    this.groundNormal.y = r.gny;
    this.groundNormal.z = r.gnz;
    v.y = 0;
    this.state = MoveState.Run;
    this.canDoubleJump = true;
    this.airJumpsLeft = this.extraAirJumps;
    this.lastWallId = -1;
    this.wallCoyote = 0;
    this.coyote = 0;
    this.jumpCut = false;
    this.dashEnergy = Math.max(this.dashEnergy, 1);
    const slide = inp.slideHeld && hlen(v) >= this.cfg.slideMinEnterSpeed;
    this.events.emit('land', { speed: impact, slide });
    if (slide) this.enterSlide();
    this.airTime = 0;
  }
}
