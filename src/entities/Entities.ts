/**
 * Dynamic terrain: the simulation half of every moving / changing level element.
 *
 * Everything here runs on the deterministic level clock (no randomness, no wall-clock), so
 * speedruns and ghosts are reproducible. Each entity exposes plain state (`p`, `q`, `warn`,
 * `visible`) that the renderer reads; this file has no rendering code.
 *
 * Fairness rule: anything that can kill or drop the player telegraphs for >= 0.75 s first
 * (`warn` rises toward 1, which the view turns into glow / flicker / shake and audio).
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import {
  quatFromAxisAngle,
  quatFromEuler,
  quatMul,
  quatRotate,
  quatRotateInv,
  v3,
  type Quat,
  type V3,
  type Vec3Tuple,
} from '../core/math';
import type { MovementController } from '../movement/MovementController';
import { movementConfig as cfg } from '../movement/movementConfig';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type {
  BlinkDef,
  BoostDef,
  CollapseDef,
  EntityDef,
  FieldDef,
  GravityDef,
  HazardDef,
  ImpulseDef,
  JumpPadDef,
  MoverDef,
  RotatorDef,
  StructureDef,
} from '../levels/types';

export const TELEGRAPH_TIME = 0.75;
/** Hit-box growth for lethal movers, as a fraction of the player's radius / half height. */
export const LETHAL_MOVER_GROW = 0.5;

export interface EntityCtx {
  player: MovementController;
  time: number;
  dt: number;
  kill(reason: string): void;
  signal(
    kind: 'boost' | 'jumppad' | 'collapse' | 'telegraph' | 'hazardWarn' | 'impulse' | 'structure' | 'fall',
    e: Entity,
  ): void;
  /** Ask for gravity along (dx,dy,dz) at `scale` this tick (Phase G gravity fields). */
  gravity?(dx: number, dy: number, dz: number, scale: number, priority: number): void;
  /** Another entity by its `id` (fields linked to structures). */
  byId?(id: string): Entity | undefined;
}

const tmp = v3();
const half = (s: Vec3Tuple): V3 => ({ x: s[0] / 2, y: s[1] / 2, z: s[2] / 2 });
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Is the player's body overlapping the (optionally rotated) box? Slightly forgiving. */
export function playerTouchesBox(pl: MovementController, c: V3, h: V3, q?: Quat, grow = 0.75): boolean {
  bodyCentre(pl, tmp);
  tmp.x -= c.x;
  tmp.y -= c.y;
  tmp.z -= c.z;
  if (q) quatRotateInv(q, tmp, tmp);
  return (
    Math.abs(tmp.x) < h.x + cfg.radius * grow &&
    Math.abs(tmp.y) < h.y + (pl.height / 2) * grow &&
    Math.abs(tmp.z) < h.z + cfg.radius * grow
  );
}

/** Is the player's centre inside the axis-aligned volume? */
export function playerInVolume(pl: MovementController, p: Vec3Tuple, s: Vec3Tuple): boolean {
  const c = bodyCentre(pl, tmpC);
  return (
    Math.abs(c.x - p[0]) < s[0] / 2 && Math.abs(c.y - p[1]) < s[1] / 2 && Math.abs(c.z - p[2]) < s[2] / 2
  );
}

const tmpC = v3();
const tmpU = v3();
/** The middle of the player's body: half their height "up" from the feet, whichever way up is. */
export function bodyCentre(pl: MovementController, out: V3): V3 {
  const h = pl.height / 2;
  if (!pl.framed) {
    out.x = pl.pos.x;
    out.y = pl.pos.y + h;
    out.z = pl.pos.z;
    return out;
  }
  const u = pl.upAxis(tmpU);
  out.x = pl.pos.x + u.x * h;
  out.y = pl.pos.y + u.y * h;
  out.z = pl.pos.z + u.z * h;
  return out;
}

export abstract class Entity {
  index = -1;
  readonly p = v3();
  q: Quat = { x: 0, y: 0, z: 0, w: 1 };
  readonly prevP = v3();
  prevQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /** 0..1 telegraph intensity. */
  warn = 0;
  visible = true;
  /** Extra visual offset used for the collapse fall animation. */
  drop = 0;
  active = true;
  protected startTime = 0;

  constructor(public readonly def: EntityDef) {
    this.active = !def.on;
  }
  abstract init(phys: PhysicsWorld): void;
  abstract update(ctx: EntityCtx, phys: PhysicsWorld): void;
  /** Called on respawn (`full` = whole level restart). */
  reset(_phys: PhysicsWorld, full: boolean) {
    if (full) {
      this.active = !this.def.on;
      this.startTime = 0;
    }
  }
  onEvent(event: string, time: number) {
    if (this.def.on === event && !this.active) {
      this.active = true;
      this.startTime = time;
    }
  }
  onStand(_ctx: EntityCtx) {}
  protected savePrev() {
    this.prevP.x = this.p.x;
    this.prevP.y = this.p.y;
    this.prevP.z = this.p.z;
    this.prevQ.x = this.q.x;
    this.prevQ.y = this.q.y;
    this.prevQ.z = this.q.z;
    this.prevQ.w = this.q.w;
  }
}

// ---------------------------------------------------------------------------------------
export class Mover extends Entity {
  declare readonly def: MoverDef;
  private body!: RAPIER.RigidBody;
  private h: V3;
  private lens: number[] = [];
  private total = 0;
  moving = false;
  /** Seconds left in the dwell at path[0] (pingpong only), or -1 when not resting there. */
  restLeft = -1;
  get atRest() {
    return this.restLeft >= 0;
  }

  constructor(def: MoverDef) {
    super(def);
    this.h = half(def.s);
    const pts = def.path;
    const n = def.mode === 'loop' ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      this.lens.push(l);
      this.total += l;
    }
    this.place(0);
    this.savePrev();
  }

  init(phys: PhysicsWorld) {
    this.place(this.fraction(0));
    this.savePrev();
    if (this.def.ghost) return;
    this.body = phys.addKinematicBody(this.p, this.q);
    phys.addBoxToBody(
      this.body,
      v3(),
      this.h,
      { x: 0, y: 0, z: 0, w: 1 },
      this.def.wallrun ?? false,
      this,
      this.index,
    );
  }

  /** 0..1 progress along the path at level time t. Pure function of time → deterministic. */
  private fraction(time: number): number {
    const d = this.def;
    const T = Math.max(0.001, this.total / d.speed);
    const pause = d.pause ?? 0;
    const rest = d.rest ?? pause;
    const mode = d.mode ?? 'pingpong';
    this.restLeft = -1;
    if (!this.active) return 0;
    const t = time - this.startTime + (d.phase ?? 0);
    if (mode === 'once') return smooth(Math.min(1, Math.max(0, t / T)));
    if (mode === 'loop') return (((t % T) + T) % T) / T;
    // out (T) → dwell at the far end (pause) → back (T) → dwell at path[0] (rest)
    const cycle = 2 * T + pause + rest;
    const u = ((t % cycle) + cycle) % cycle;
    if (u < T) return smooth(u / T);
    if (u < T + pause) return 1;
    if (u < 2 * T + pause) return smooth(1 - (u - T - pause) / T);
    this.restLeft = cycle - u;
    return 0;
  }

  private place(f: number) {
    const pts = this.def.path;
    let dist = f * this.total;
    let i = 0;
    while (i < this.lens.length - 1 && dist > this.lens[i]) {
      dist -= this.lens[i];
      i++;
    }
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const k = this.lens[i] > 0 ? Math.min(1, dist / this.lens[i]) : 0;
    this.p.x = a[0] + (b[0] - a[0]) * k;
    this.p.y = a[1] + (b[1] - a[1]) * k;
    this.p.z = a[2] + (b[2] - a[2]) * k;
  }

  update(ctx: EntityCtx, phys: PhysicsWorld) {
    this.savePrev();
    this.place(this.fraction(ctx.time));
    this.moving = this.p.x !== this.prevP.x || this.p.y !== this.prevP.y || this.p.z !== this.prevP.z;
    if (this.body) phys.moveBody(this.body, this.p, this.q);
    if (this.def.lethal) {
      if (this.def.telegraph) {
        // dark while safely at rest, a rising glow for TELEGRAPH_TIME before it moves, lit while out
        const before = this.warn;
        this.warn = !this.atRest
          ? 1
          : this.restLeft < TELEGRAPH_TIME
            ? 1 - this.restLeft / TELEGRAPH_TIME
            : 0;
        if (before === 0 && this.warn > 0 && this.atRest) ctx.signal('hazardWarn', this);
      } else this.warn = 1;
      // slightly smaller than the visible box: a graze at speed is not a death
      if (playerTouchesBox(ctx.player, this.p, this.h, undefined, LETHAL_MOVER_GROW)) ctx.kill('crushed');
    } else if (this.def.mode === 'once') {
      this.warn = this.moving ? 1 : Math.max(0, this.warn - ctx.dt * 2);
    }
  }
}

// ---------------------------------------------------------------------------------------
export class Rotator extends Entity {
  declare readonly def: RotatorDef;
  private body!: RAPIER.RigidBody;
  angle = 0;

  constructor(def: RotatorDef) {
    super(def);
    this.p.x = def.p[0];
    this.p.y = def.p[1];
    this.p.z = def.p[2];
    this.setAngle(def.phase ?? 0);
    this.savePrev();
  }
  private setAngle(a: number) {
    this.angle = a;
    const ax = this.def.axis;
    quatFromAxisAngle(ax[0], ax[1], ax[2], a, this.q);
  }
  init(phys: PhysicsWorld) {
    this.body = phys.addKinematicBody(this.p, this.q);
    for (const part of this.def.parts) {
      phys.addBoxToBody(
        this.body,
        { x: part.p[0], y: part.p[1], z: part.p[2] },
        half(part.s),
        { x: 0, y: 0, z: 0, w: 1 },
        part.wallrun ?? false,
        this,
        this.index,
      );
    }
  }
  update(ctx: EntityCtx, phys: PhysicsWorld) {
    this.savePrev();
    const t = this.active ? ctx.time - this.startTime : 0;
    this.setAngle((this.def.phase ?? 0) + this.def.speed * t);
    phys.moveBody(this.body, this.p, this.q);
    for (const part of this.def.parts) {
      if (!part.lethal) continue;
      // test in the rotator's local frame
      tmp.x = ctx.player.pos.x - this.p.x;
      tmp.y = ctx.player.pos.y + ctx.player.height / 2 - this.p.y;
      tmp.z = ctx.player.pos.z - this.p.z;
      quatRotateInv(this.q, tmp, tmp);
      if (
        Math.abs(tmp.x - part.p[0]) < part.s[0] / 2 + cfg.radius * 0.6 &&
        Math.abs(tmp.y - part.p[1]) < part.s[1] / 2 + ctx.player.height * 0.3 &&
        Math.abs(tmp.z - part.p[2]) < part.s[2] / 2 + cfg.radius * 0.6
      )
        ctx.kill('hazard');
    }
  }
}

// ---------------------------------------------------------------------------------------
export class Collapse extends Entity {
  declare readonly def: CollapseDef;
  private handle = -1;
  private h: V3;
  /** 0 = intact, 1 = telegraphing, 2 = fallen */
  phase: 0 | 1 | 2 = 0;
  private timer = 0;

  constructor(def: CollapseDef) {
    super(def);
    this.h = half(def.s);
    this.p.x = def.p[0];
    this.p.y = def.p[1];
    this.p.z = def.p[2];
    this.savePrev();
    this.active = true;
  }
  init(phys: PhysicsWorld) {
    this.handle = phys.addBox(this.p, this.h, undefined, false, this.index);
  }
  private begin(ctx: EntityCtx) {
    if (this.phase !== 0) return;
    this.phase = 1;
    this.timer = Math.max(TELEGRAPH_TIME, this.def.delay ?? 0.9);
    ctx.signal('telegraph', this);
  }
  override onStand(ctx: EntityCtx) {
    this.begin(ctx);
  }
  override onEvent(event: string) {
    if (this.def.on === event) this.pending = true;
  }
  private pending = false;
  update(ctx: EntityCtx, phys: PhysicsWorld) {
    if (this.pending) {
      this.pending = false;
      this.begin(ctx);
    }
    if (this.phase === 1) {
      this.timer -= ctx.dt;
      this.warn = Math.min(1, this.warn + ctx.dt * 6);
      if (this.timer <= 0) {
        this.phase = 2;
        this.timer = 4.5;
        this.drop = 0;
        phys.setEnabled(this.handle, false);
        ctx.signal('collapse', this);
      }
    } else if (this.phase === 2) {
      this.timer -= ctx.dt;
      this.drop += ctx.dt;
      // rebuild (no soft-locks) once the player is clear of the space
      if (this.timer <= 0 && !playerTouchesBox(ctx.player, this.p, this.h, undefined, 1.2))
        this.restore(phys);
    }
  }
  private restore(phys: PhysicsWorld) {
    this.phase = 0;
    this.warn = 0;
    this.drop = 0;
    phys.setEnabled(this.handle, true);
  }
  override reset(phys: PhysicsWorld) {
    this.pending = false;
    this.restore(phys);
  }
}

// ---------------------------------------------------------------------------------------
export class Blink extends Entity {
  declare readonly def: BlinkDef;
  private handle = -1;
  private h: V3;
  solid = true;

  constructor(def: BlinkDef) {
    super(def);
    this.h = half(def.s);
    this.p.x = def.p[0];
    this.p.y = def.p[1];
    this.p.z = def.p[2];
    this.savePrev();
  }
  init(phys: PhysicsWorld) {
    this.handle = phys.addBox(this.p, this.h, undefined, false, this.index);
  }
  update(ctx: EntityCtx, phys: PhysicsWorld) {
    const d = this.def;
    const period = d.onTime + d.offTime;
    const u = (((ctx.time + (d.phase ?? 0)) % period) + period) % period;
    const solid = u < d.onTime;
    // telegraph during the last moments of being solid, and fade back in just before returning
    this.warn = solid ? Math.min(1, Math.max(0, (u - (d.onTime - TELEGRAPH_TIME)) / TELEGRAPH_TIME)) : 0;
    this.visible = solid || period - u < 0.35;
    if (solid !== this.solid) {
      this.solid = solid;
      phys.setEnabled(this.handle, solid);
    }
  }
}

// ---------------------------------------------------------------------------------------
export class Hazard extends Entity {
  declare readonly def: HazardDef;
  private h: V3;
  private rot?: Quat;
  constructor(def: HazardDef) {
    super(def);
    this.h = half(def.s);
    this.p.x = def.p[0];
    this.p.y = def.p[1];
    this.p.z = def.p[2];
    if (def.r) {
      this.rot = quatFromEuler(def.r[0], def.r[1], def.r[2]);
      this.q = this.rot;
    }
    this.warn = 1;
    this.visible = def.visible !== false;
    this.active = true;
  }
  init() {}
  update(ctx: EntityCtx) {
    if (playerTouchesBox(ctx.player, this.p, this.h, this.rot, 0.55)) ctx.kill('hazard');
  }
}

// ---------------------------------------------------------------------------------------
abstract class Volume<D extends BoostDef | JumpPadDef | GravityDef | ImpulseDef> extends Entity {
  declare readonly def: D;
  protected cooldown = 0;
  constructor(def: D) {
    super(def);
    this.p.x = def.p[0];
    this.p.y = def.p[1];
    this.p.z = def.p[2];
    this.active = true;
  }
  init() {}
}

export class Boost extends Volume<BoostDef> {
  update(ctx: EntityCtx) {
    this.cooldown -= ctx.dt;
    this.warn = Math.max(0, this.warn - ctx.dt * 2);
    if (this.cooldown <= 0 && playerInVolume(ctx.player, this.def.p, this.def.s)) {
      const d = this.def.dir;
      const l = Math.hypot(d[0], d[2]) || 1;
      ctx.player.boost(d[0] / l, d[2] / l, this.def.add, this.def.min);
      this.cooldown = 0.6;
      this.warn = 1;
      ctx.signal('boost', this);
    }
  }
}

export class JumpPad extends Volume<JumpPadDef> {
  /** Falling speed just before touching (spring floors). */
  private lastFall = 0;
  update(ctx: EntityCtx) {
    const vy = ctx.player.upSpeed;
    if (!playerInVolume(ctx.player, this.def.p, this.def.s)) this.lastFall = Math.min(0, vy);
    else if (vy < this.lastFall) this.lastFall = vy;
    this.cooldown -= ctx.dt;
    this.warn = Math.max(0, this.warn - ctx.dt * 2);
    if (this.cooldown <= 0 && playerInVolume(ctx.player, this.def.p, this.def.s)) {
      const v = this.def.v;
      // a spring floor answers how hard you came down on it
      const up = this.def.spring ? Math.max(v[1], -this.lastFall * this.def.spring) : v[1];
      ctx.player.launch(v[0], up, v[2], true);
      this.cooldown = 0.4;
      this.warn = 1;
      ctx.signal('jumppad', this);
    }
  }
}

export class GravityZone extends Volume<GravityDef> {
  update(ctx: EntityCtx) {
    if (playerInVolume(ctx.player, this.def.p, this.def.s)) ctx.player.gravityScale = this.def.scale;
  }
}

// ----- Phase G: dynamic world ------------------------------------------------------------

const ease = (k: StructureEase, t: number) =>
  k === 'linear' ? t : k === 'in' ? t * t : k === 'out' ? 1 - (1 - t) * (1 - t) : smooth(t);
type StructureEase = 'linear' | 'smooth' | 'in' | 'out';
const _sq: Quat = { x: 0, y: 0, z: 0, w: 1 };
const _sq2: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * A rigid structure on one kinematic body, posed by a deterministic motion program (see
 * StructureDef). The pose is a pure function of the time since it started, so respawns replay it
 * exactly. Riders are carried by the physics world's surface tracking; collision always matches
 * what is drawn, and is switched off once a fallen structure has dropped away.
 */
export class Structure extends Entity {
  declare readonly def: StructureDef;
  private body!: RAPIER.RigidBody;
  private handles: number[] = [];
  private q0: Quat;
  private p0 = v3();
  /** 0 idle, 1 telegraphing, 2 moving, 3 falling, 4 gone */
  stage = 0;
  private t = 0;
  private readonly total: number;
  /** Seconds since the motion program began (for effects). */
  progress = 0;
  /** 0..1 how far through the current program step (camera framing, audio). */
  moving = 0;

  constructor(def: StructureDef) {
    super(def);
    this.p0.x = this.p.x = def.p[0];
    this.p0.y = this.p.y = def.p[1];
    this.p0.z = this.p.z = def.p[2];
    this.q0 = def.r ? quatFromEuler(def.r[0], def.r[1], def.r[2]) : { x: 0, y: 0, z: 0, w: 1 };
    this.q = { ...this.q0 };
    this.total = def.steps.reduce((a, st) => a + st.t, 0);
    this.active = !def.on;
    this.savePrev();
  }
  get warnTime() {
    return Math.max(this.def.fall !== undefined || this.def.warn ? TELEGRAPH_TIME : 0, this.def.warn ?? 0);
  }
  init(phys: PhysicsWorld) {
    this.body = phys.addKinematicBody(this.p, this.q);
    for (const part of this.def.parts) {
      const lq = part.r ? quatFromEuler(part.r[0], part.r[1], part.r[2]) : { x: 0, y: 0, z: 0, w: 1 };
      this.handles.push(
        phys.addBoxToBody(
          this.body,
          { x: part.p[0], y: part.p[1], z: part.p[2] },
          half(part.s),
          lq,
          part.wallrun ?? false,
          this,
          this.index,
        ),
      );
    }
  }
  /** Pose at `tau` seconds into the program (after delay and telegraph). */
  private pose(tau: number) {
    let q = { ...this.q0 };
    let px = this.p0.x,
      py = this.p0.y,
      pz = this.p0.z;
    let left = tau;
    if (this.def.loop && this.total > 0) left = tau % this.total;
    this.moving = 0;
    for (const st of this.def.steps) {
      if (left <= 0) break;
      const f = st.t > 0 ? Math.min(1, left / st.t) : 1;
      const k = ease(st.ease ?? 'smooth', f);
      if (f < 1) this.moving = k;
      if (st.rot) {
        quatFromAxisAngle(st.rot[0], st.rot[1], st.rot[2], (st.rot[3] * Math.PI * k) / 180, _sq);
        q = quatMul(_sq, q, { x: 0, y: 0, z: 0, w: 1 });
      }
      if (st.move) {
        px += st.move[0] * k;
        py += st.move[1] * k;
        pz += st.move[2] * k;
      }
      left -= st.t;
    }
    this.p.x = px;
    this.p.y = py;
    this.p.z = pz;
    this.q = q;
  }
  update(ctx: EntityCtx, phys: PhysicsWorld) {
    this.savePrev();
    if (!this.active || this.stage === 4) return;
    if (this.stage === 0) {
      this.stage = this.warnTime > 0 ? 1 : 2;
      this.t = 0;
      if (this.stage === 1) ctx.signal('telegraph', this);
    }
    this.t += ctx.dt;
    const start = this.warnTime + (this.def.delay ?? 0);
    if (this.stage === 1) {
      this.warn = Math.min(1, this.t / Math.max(0.01, this.warnTime));
      if (this.t >= start) {
        this.stage = 2;
        this.warn = 0;
        ctx.signal('structure', this);
      }
    }
    if (this.stage >= 2) {
      const tau = this.t - start;
      this.progress = tau;
      this.pose(Math.max(0, tau));
      if (this.def.fall !== undefined && !this.def.loop && tau > this.total) {
        // drop away under ordinary gravity, tumbling about the last turn's axis
        const f = tau - this.total;
        if (this.stage === 2) {
          this.stage = 3;
          ctx.signal('fall', this);
        }
        this.p.y -= 0.5 * 14 * f * f;
        const last = [...this.def.steps].reverse().find((st) => st.rot)?.rot ?? [1, 0, 0, 0];
        quatFromAxisAngle(last[0], last[1], last[2], 0.35 * f * f * Math.sign(last[3] || 1), _sq);
        quatMul(_sq, this.q, _sq2);
        this.q = { x: _sq2.x, y: _sq2.y, z: _sq2.z, w: _sq2.w };
        if (f > this.def.fall) {
          this.stage = 4;
          this.visible = false;
          for (const h of this.handles) phys.setEnabled(h, false);
        }
      }
    }
    phys.moveBody(this.body, this.p, this.q);
  }
  override onEvent(event: string, time: number) {
    if (this.def.on === event && !this.active) {
      this.active = true;
      this.startTime = time;
      this.stage = 0;
    }
  }
  override reset(phys: PhysicsWorld, full: boolean) {
    // every respawn replays the set-piece from the start (fair, and exactly the same each time)
    this.active = !this.def.on;
    this.stage = 0;
    this.t = 0;
    this.warn = 0;
    this.progress = 0;
    this.visible = true;
    for (const h of this.handles) phys.setEnabled(h, true);
    this.p.x = this.p0.x;
    this.p.y = this.p0.y;
    this.p.z = this.p0.z;
    this.q = { ...this.q0 };
    this.savePrev();
    phys.moveBody(this.body, this.p, this.q);
    void full;
  }
}

/**
 * Gravity field (see FieldDef). Asks the gravity director for a direction each tick the player is
 * inside. Linked fields live in their structure's frame, so they turn and move with it.
 */
export class GravityField extends Entity {
  declare readonly def: FieldDef;
  private h: V3;
  /** Current pull direction (world, unit) — for effects. */
  readonly dir = v3(0, -1, 0);
  /** The player is inside (for effects and audio). */
  inside = false;
  constructor(def: FieldDef) {
    super(def);
    this.h = half(def.s);
    this.p.x = def.p[0];
    this.p.y = def.p[1];
    this.p.z = def.p[2];
    const d = def.dir ?? [0, -1, 0];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    this.dir.x = d[0] / l;
    this.dir.y = d[1] / l;
    this.dir.z = d[2] / l;
    this.savePrev();
  }
  init() {}
  update(ctx: EntityCtx) {
    this.savePrev();
    this.inside = false;
    if (!this.active || !ctx.gravity) return;
    const d = this.def;
    const pl = ctx.player;
    let host: Entity | undefined;
    if (d.mode === 'structure' && d.link) {
      host = ctx.byId?.(d.link);
      if (!host || !host.visible) return;
      // the field box lives in the structure's frame
      this.q = host.q;
      quatRotate(host.q, { x: d.p[0], y: d.p[1], z: d.p[2] }, this.p);
      this.p.x += host.p.x;
      this.p.y += host.p.y;
      this.p.z += host.p.z;
      if (!playerTouchesBox(pl, this.p, this.h, host.q, 0)) return;
      quatRotate(host.q, { x: 0, y: -1, z: 0 }, this.dir);
    } else {
      if (!playerInVolume(pl, d.p, d.s)) return;
      if (d.mode === 'well') {
        const c = d.center ?? d.p;
        const up = pl.upAxis(tmp);
        const cx = c[0] - (pl.pos.x + up.x * pl.height * 0.5),
          cy = c[1] - (pl.pos.y + up.y * pl.height * 0.5),
          cz = c[2] - (pl.pos.z + up.z * pl.height * 0.5);
        const l = Math.hypot(cx, cy, cz);
        if (l < 0.5) return;
        this.dir.x = cx / l;
        this.dir.y = cy / l;
        this.dir.z = cz / l;
      } else if (d.mode === 'spin' && d.axis) {
        const base = d.dir ?? [0, -1, 0];
        quatFromAxisAngle(d.axis[0], d.axis[1], d.axis[2], (d.speed ?? 0.5) * ctx.time, _sq);
        quatRotate(_sq, { x: base[0], y: base[1], z: base[2] }, this.dir);
        const l = Math.hypot(this.dir.x, this.dir.y, this.dir.z) || 1;
        this.dir.x /= l;
        this.dir.y /= l;
        this.dir.z /= l;
      }
    }
    this.inside = true;
    ctx.gravity(this.dir.x, this.dir.y, this.dir.z, d.scale ?? 1, d.priority ?? 1);
  }
}

/** Impulse volume (rings, slingshot exits, launch gates). Works in the air. */
export class Impulse extends Volume<ImpulseDef> {
  update(ctx: EntityCtx) {
    this.cooldown -= ctx.dt;
    this.warn = Math.max(0, this.warn - ctx.dt * 2);
    if (this.cooldown <= 0 && playerInVolume(ctx.player, this.def.p, this.def.s)) {
      const d = this.def.dir;
      ctx.player.impulse(d[0], d[1], d[2], this.def.add, this.def.min);
      this.cooldown = 0.5;
      this.warn = 1;
      ctx.signal('impulse', this);
    }
  }
}

export function createEntity(def: EntityDef): Entity {
  switch (def.type) {
    case 'mover':
      return new Mover(def);
    case 'rotator':
      return new Rotator(def);
    case 'collapse':
      return new Collapse(def);
    case 'blink':
      return new Blink(def);
    case 'hazard':
      return new Hazard(def);
    case 'boost':
      return new Boost(def);
    case 'jumppad':
      return new JumpPad(def);
    case 'gravity':
      return new GravityZone(def);
    case 'field':
      return new GravityField(def);
    case 'structure':
      return new Structure(def);
    case 'impulse':
      return new Impulse(def);
  }
}
