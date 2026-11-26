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
import { quatFromAxisAngle, quatFromEuler, quatRotateInv, v3, type Quat, type V3, type Vec3Tuple } from '../core/math';
import type { MovementController } from '../movement/MovementController';
import { movementConfig as cfg } from '../movement/movementConfig';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type {
  BlinkDef,
  BoostDef,
  CollapseDef,
  EntityDef,
  GravityDef,
  HazardDef,
  JumpPadDef,
  MoverDef,
  RotatorDef,
} from '../levels/types';

export const TELEGRAPH_TIME = 0.75;

export interface EntityCtx {
  player: MovementController;
  time: number;
  dt: number;
  kill(reason: string): void;
  signal(kind: 'boost' | 'jumppad' | 'collapse' | 'telegraph', e: Entity): void;
}

const tmp = v3();
const half = (s: Vec3Tuple): V3 => ({ x: s[0] / 2, y: s[1] / 2, z: s[2] / 2 });
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Is the player's body overlapping the (optionally rotated) box? Slightly forgiving. */
export function playerTouchesBox(pl: MovementController, c: V3, h: V3, q?: Quat, grow = 0.75): boolean {
  tmp.x = pl.pos.x - c.x;
  tmp.y = pl.pos.y + pl.height / 2 - c.y;
  tmp.z = pl.pos.z - c.z;
  if (q) quatRotateInv(q, tmp, tmp);
  return (
    Math.abs(tmp.x) < h.x + cfg.radius * grow &&
    Math.abs(tmp.y) < h.y + (pl.height / 2) * grow &&
    Math.abs(tmp.z) < h.z + cfg.radius * grow
  );
}

/** Is the player's centre inside the axis-aligned volume? */
export function playerInVolume(pl: MovementController, p: Vec3Tuple, s: Vec3Tuple): boolean {
  return (
    Math.abs(pl.pos.x - p[0]) < s[0] / 2 &&
    Math.abs(pl.pos.y + pl.height / 2 - p[1]) < s[1] / 2 &&
    Math.abs(pl.pos.z - p[2]) < s[2] / 2
  );
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
    phys.addBoxToBody(this.body, v3(), this.h, { x: 0, y: 0, z: 0, w: 1 }, this.def.wallrun ?? false, this, this.index);
  }

  /** 0..1 progress along the path at level time t. Pure function of time → deterministic. */
  private fraction(time: number): number {
    const d = this.def;
    const T = Math.max(0.001, this.total / d.speed);
    const pause = d.pause ?? 0;
    const mode = d.mode ?? 'pingpong';
    if (!this.active) return 0;
    const t = time - this.startTime + (d.phase ?? 0);
    if (mode === 'once') return smooth(Math.min(1, Math.max(0, t / T)));
    if (mode === 'loop') return (((t % T) + T) % T) / T;
    const cycle = 2 * (T + pause);
    const u = ((t % cycle) + cycle) % cycle;
    if (u < T) return smooth(u / T);
    if (u < T + pause) return 1;
    if (u < 2 * T + pause) return smooth(1 - (u - T - pause) / T);
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
      this.warn = 1;
      if (playerTouchesBox(ctx.player, this.p, this.h, undefined, 0.6)) ctx.kill('crushed');
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
      phys.addBoxToBody(this.body, { x: part.p[0], y: part.p[1], z: part.p[2] }, half(part.s), { x: 0, y: 0, z: 0, w: 1 }, part.wallrun ?? false, this, this.index);
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
      if (this.timer <= 0 && !playerTouchesBox(ctx.player, this.p, this.h, undefined, 1.2)) this.restore(phys);
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
abstract class Volume<D extends BoostDef | JumpPadDef | GravityDef> extends Entity {
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
  update(ctx: EntityCtx) {
    this.cooldown -= ctx.dt;
    this.warn = Math.max(0, this.warn - ctx.dt * 2);
    if (this.cooldown <= 0 && playerInVolume(ctx.player, this.def.p, this.def.s)) {
      const v = this.def.v;
      ctx.player.launch(v[0], v[1], v[2], true);
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
  }
}
