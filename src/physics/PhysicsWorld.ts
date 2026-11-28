/**
 * Thin wrapper around Rapier used for world collision queries.
 *
 * - The world only contains fixed and kinematic colliders (level geometry, moving terrain).
 * - The player is NOT a dynamic body: the movement controller moves a capsule through this
 *   world with Rapier's kinematic character controller (shape-cast collide-and-slide).
 * - No three.js here, so the whole simulation can run headless in tests.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { Quat, V3 } from '../core/math';
import { quatRotate, quatRotateInv, v3, vset } from '../core/math';
import type { CollisionWorld, MoveResult, RayHit } from '../movement/types';
import { movementConfig as cfg } from '../movement/movementConfig';
import { SIM_DT } from '../core/loop';

let rapierReady: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

/** Anything that moves and can carry the player exposes its transform for this and the previous tick. */
export interface MotionSource {
  prevP: V3;
  prevQ: Quat;
  p: V3;
  q: Quat;
}

export interface ColliderMeta {
  wallrun: boolean;
  motion?: MotionSource;
  /** Index of the owning dynamic entity, or -1 for static level geometry. */
  entity: number;
}

const GROUP_WORLD = 0x0001;
const GROUP_PLAYER = 0x0002;
const WORLD_GROUPS = (GROUP_WORLD << 16) | 0xffff;
const PLAYER_GROUPS = (GROUP_PLAYER << 16) | GROUP_WORLD;
const QUERY_GROUPS = (0xffff << 16) | GROUP_WORLD;
const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

export class PhysicsWorld implements CollisionWorld {
  readonly world: RAPIER.World;
  private kcc: RAPIER.KinematicCharacterController;
  private player: RAPIER.Collider;
  private playerHeight = cfg.standHeight;
  private meta = new Map<number, ColliderMeta>();
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private tmp = { x: 0, y: 0, z: 0 };
  private fitShapes = new Map<number, RAPIER.Capsule>();
  private probe = new RAPIER.Ball(PROBE_R);
  private t1 = v3();
  private t2 = v3();
  private t3 = v3();

  /**
   * Gravity frame (Phase G). While set, every CollisionWorld query is expressed in the player's
   * frame: positions, deltas and normals are local, with +Y pointing against gravity. The movement
   * controller sets it around its own tick only; everything else always sees world space.
   */
  private frame: Quat | null = null;
  private readonly up = v3(0, 1, 0);
  private upIsY = true;
  private fW = v3();
  private fD = v3();
  private fN = v3();
  private fP = v3();

  setFrame(q: Quat | null) {
    this.frame = q;
    if (q) quatRotate(q, Y_AXIS, this.up);
  }
  private toW(v: V3, out: V3) {
    return quatRotate(this.frame!, v, out);
  }
  private toL(v: V3, out: V3) {
    return quatRotateInv(this.frame!, v, out);
  }
  /** Point the character controller (and its capsule) along `up`; cheap when unchanged. */
  private orient(framed: boolean) {
    if (framed) {
      this.kcc.setUp(this.up);
      this.player.setRotation(this.frame!);
      this.upIsY = false;
    } else if (!this.upIsY) {
      this.kcc.setUp(Y_AXIS);
      this.player.setRotation(IDENTITY);
      this.upIsY = true;
    }
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = SIM_DT;
    this.kcc = this.world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.disableAutostep();
    this.kcc.disableSnapToGround();
    this.kcc.setMaxSlopeClimbAngle((cfg.maxSlopeDeg * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((cfg.maxSlopeDeg * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    this.kcc.setSlideEnabled(true);
    const desc = RAPIER.ColliderDesc.capsule((cfg.standHeight - cfg.stepHeight) / 2 - cfg.radius, cfg.radius)
      .setCollisionGroups(PLAYER_GROUPS)
      .setTranslation(0, 1000, 0);
    this.player = this.world.createCollider(desc);
  }

  dispose() {
    this.world.free();
  }

  // ----- world construction -------------------------------------------------------------

  addBox(p: V3, half: V3, q: Quat = IDENTITY, wallrun = false, entity = -1): number {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(p.x, p.y, p.z)
      .setRotation(q)
      .setCollisionGroups(WORLD_GROUPS);
    const c = this.world.createCollider(desc);
    this.meta.set(c.handle, { wallrun, entity });
    return c.handle;
  }

  /** Creates a kinematic body; attach boxes to it with addBoxToBody. */
  addKinematicBody(p: V3, q: Quat = IDENTITY): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setRotation(q);
    return this.world.createRigidBody(desc);
  }

  addBoxToBody(
    body: RAPIER.RigidBody,
    localP: V3,
    half: V3,
    localQ: Quat,
    wallrun: boolean,
    motion: MotionSource,
    entity: number,
  ): number {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(localP.x, localP.y, localP.z)
      .setRotation(localQ)
      .setCollisionGroups(WORLD_GROUPS);
    const c = this.world.createCollider(desc, body);
    this.meta.set(c.handle, { wallrun, motion, entity });
    return c.handle;
  }

  moveBody(body: RAPIER.RigidBody, p: V3, q: Quat) {
    body.setNextKinematicTranslation(p);
    body.setNextKinematicRotation(q);
  }

  setEnabled(handle: number, enabled: boolean) {
    const c = this.world.getCollider(handle);
    if (c && c.isEnabled() !== enabled) c.setEnabled(enabled);
  }

  private byEntity = new Map<number, number[]>();
  /** Switch every collider belonging to entity `index` on or off (Director variants). */
  setEntityEnabled(index: number, enabled: boolean) {
    let hs = this.byEntity.get(index);
    if (!hs) {
      hs = [];
      for (const [h, m] of this.meta) if (m.entity === index) hs.push(h);
      this.byEntity.set(index, hs);
    }
    for (const h of hs) this.setEnabled(h, enabled);
  }

  metaOf(handle: number): ColliderMeta | undefined {
    return this.meta.get(handle);
  }

  /** Advance kinematic bodies and refresh the query acceleration structure. Call once per tick. */
  step() {
    this.world.step();
  }

  // ----- CollisionWorld -----------------------------------------------------------------

  /**
   * The collision capsule floats `lift` above the feet; a ball-cast underneath finds the ground.
   * This "hover" layout gives exact, noise-free footing, free step-up over kerbs and forgiving
   * ledge catches, while the capsule only ever has to deal with real walls and ceilings.
   */
  private lift = cfg.stepHeight;
  private setHeight(height: number) {
    if (height !== this.playerHeight) {
      this.lift = Math.min(cfg.stepHeight, Math.max(0, height - 2 * cfg.radius));
      this.player.setHalfHeight(Math.max(0.005, (height - this.lift) / 2 - cfg.radius));
      this.playerHeight = height;
    }
  }

  move(feet: V3, height: number, dx: number, dy: number, dz: number, snap: boolean, out: MoveResult): void {
    if (this.frame) return this.moveFramed(feet, height, dx, dy, dz, snap, out);
    this.orient(false);
    this.setHeight(height);
    const lift = this.lift;
    const t = this.tmp;
    t.x = feet.x;
    t.y = feet.y + lift + (height - lift) / 2;
    t.z = feet.z;
    this.player.setTranslation(t);
    t.x = dx;
    t.y = dy;
    t.z = dz;
    this.kcc.computeColliderMovement(this.player, t, undefined, QUERY_GROUPS);
    let m = this.kcc.computedMovement();
    // Against the walls of a moving structure (a collider on a kinematic body) the controller can
    // refuse a sliding step outright while the capsule rests in that wall's contact skin, freezing
    // a wall-run or a run along the wall. As in a turned frame: if a step makes almost no progress
    // against such a wall, ease out of the skin along it and take the step again. (Static level
    // geometry never takes this path, so every course without structures is unchanged.)
    const want = Math.hypot(dx, dy, dz);
    if (want > 1e-4 && Math.hypot(m.x, m.y, m.z) < want * 0.2 && this.kcc.numComputedCollisions() > 0) {
      const col = this.kcc.computedCollision(0);
      if (
        col &&
        Math.abs(col.normal1.y) < 0.7 &&
        col.collider &&
        this.meta.get(col.collider.handle)?.motion
      ) {
        const nudge = 0.03,
          nx = col.normal1.x,
          ny = col.normal1.y,
          nz = col.normal1.z;
        const t0 = this.player.translation();
        this.player.setTranslation({ x: t0.x + nx * nudge, y: t0.y + ny * nudge, z: t0.z + nz * nudge });
        this.kcc.computeColliderMovement(this.player, t, undefined, QUERY_GROUPS);
        const m2 = this.kcc.computedMovement();
        m = { x: m2.x + nx * nudge, y: m2.y + ny * nudge, z: m2.z + nz * nudge } as typeof m;
      }
    }
    out.x = feet.x + m.x;
    out.y = feet.y + m.y;
    out.z = feet.z + m.z;
    out.grounded = false;
    out.hitWall = false;
    out.hitCeiling = false;
    out.wallNx = out.wallNy = out.wallNz = 0;
    out.groundId = -1;
    out.gnx = 0;
    out.gny = 1;
    out.gnz = 0;
    const n = this.kcc.numComputedCollisions();
    let best = 0.72; // most wall-like normal wins (smallest |ny|)
    for (let i = 0; i < n; i++) {
      const c = this.kcc.computedCollision(i);
      if (!c) continue;
      // normal1 is on the obstacle and points toward the character
      const nx = c.normal1.x,
        ny = c.normal1.y,
        nz = c.normal1.z;
      if (ny < -0.5) out.hitCeiling = true;
      else if (Math.abs(ny) < best) {
        best = Math.abs(ny);
        out.hitWall = true;
        out.wallNx = nx;
        out.wallNy = ny;
        out.wallNz = nz;
      }
    }
    if (out.hitWall) {
      // Sliding along a wall can never carry the character further along it than it asked to go.
      // (Without this, pressing into a wall that is itself sliding sideways drags the character
      // along with it.)
      const tl = Math.hypot(out.wallNx, out.wallNz);
      if (tl > 0.5) {
        const tx = -out.wallNz / tl,
          tz = out.wallNx / tl;
        const want = dx * tx + dz * tz;
        const got = m.x * tx + m.z * tz;
        if (got * want < 0 || Math.abs(got) > Math.abs(want) + 1e-5) {
          const fix = (got * want < 0 ? 0 : want) - got;
          out.x += tx * fix;
          out.z += tz * fix;
        }
      }
    }
    // ground: while grounded reach down (stairs, slopes); while falling only catch what the feet touch
    if (snap || dy <= 0) this.probeGround(out, lift, snap ? cfg.snapDistance : 0.02);
  }

  /** The same collide-and-slide as `move`, with the capsule standing along the frame's up. */
  private moveFramed(
    feet: V3,
    height: number,
    dx: number,
    dy: number,
    dz: number,
    snap: boolean,
    out: MoveResult,
  ) {
    this.orient(true);
    this.setHeight(height);
    const lift = this.lift;
    const up = this.up;
    const fw = this.toW(feet, this.fW);
    const c = lift + (height - lift) / 2;
    this.player.setTranslation({ x: fw.x + up.x * c, y: fw.y + up.y * c, z: fw.z + up.z * c });
    const d = this.fD;
    d.x = dx;
    d.y = dy;
    d.z = dz;
    this.toW(d, d);
    this.kcc.computeColliderMovement(this.player, d, undefined, QUERY_GROUPS);
    let mw = this.kcc.computedMovement();
    // In a turned frame a capsule can come to rest inside the contact skin of a second surface
    // (a floor that became a wall beside it); the controller then refuses the whole step instead of
    // sliding. If a step makes almost no progress against a contact, ease the capsule out of the
    // skin along that contact and take the step again.
    const want = Math.hypot(d.x, d.y, d.z);
    if (want > 1e-4) {
      const got = Math.hypot(mw.x, mw.y, mw.z);
      if (got < want * 0.2 && this.kcc.numComputedCollisions() > 0) {
        const col = this.kcc.computedCollision(0);
        if (col) {
          const nx = col.normal1.x,
            ny = col.normal1.y,
            nz = col.normal1.z;
          // only push off surfaces that are not the ground we stand on
          if (Math.abs(nx * up.x + ny * up.y + nz * up.z) < 0.7) {
            const nudge = 0.03;
            const t0 = this.player.translation();
            this.player.setTranslation({ x: t0.x + nx * nudge, y: t0.y + ny * nudge, z: t0.z + nz * nudge });
            this.kcc.computeColliderMovement(this.player, d, undefined, QUERY_GROUPS);
            const m2 = this.kcc.computedMovement();
            mw = { x: m2.x + nx * nudge, y: m2.y + ny * nudge, z: m2.z + nz * nudge } as typeof mw;
          }
        }
      }
    }
    const m = this.toL(mw as V3, this.fD);
    out.x = feet.x + m.x;
    out.y = feet.y + m.y;
    out.z = feet.z + m.z;
    out.grounded = false;
    out.hitWall = false;
    out.hitCeiling = false;
    out.wallNx = out.wallNy = out.wallNz = 0;
    out.groundId = -1;
    out.gnx = 0;
    out.gny = 1;
    out.gnz = 0;
    const n = this.kcc.numComputedCollisions();
    let best = 0.72;
    for (let i = 0; i < n; i++) {
      const col = this.kcc.computedCollision(i);
      if (!col) continue;
      const nl = this.toL(col.normal1 as V3, this.fN);
      if (nl.y < -0.5) out.hitCeiling = true;
      else if (Math.abs(nl.y) < best) {
        best = Math.abs(nl.y);
        out.hitWall = true;
        out.wallNx = nl.x;
        out.wallNy = nl.y;
        out.wallNz = nl.z;
      }
    }
    if (out.hitWall) {
      const tl = Math.hypot(out.wallNx, out.wallNz);
      if (tl > 0.5) {
        const tx = -out.wallNz / tl,
          tz = out.wallNx / tl;
        const want = dx * tx + dz * tz;
        const got = m.x * tx + m.z * tz;
        if (got * want < 0 || Math.abs(got) > Math.abs(want) + 1e-5) {
          const fix = (got * want < 0 ? 0 : want) - got;
          out.x += tx * fix;
          out.z += tz * fix;
        }
      }
    }
    if (snap || dy <= 0) {
      // ground probe: a ball cast "down" the frame
      const pr = PROBE_R;
      const reach = lift + (snap ? cfg.snapDistance : 0.02);
      const o = this.fW;
      o.x = out.x;
      o.y = out.y + lift + pr;
      o.z = out.z;
      const ly = o.y;
      this.toW(o, o);
      const down = { x: -up.x, y: -up.y, z: -up.z };
      const hit = this.world.castShape(
        o,
        IDENTITY,
        down,
        this.probe,
        0,
        reach,
        true,
        undefined,
        QUERY_GROUPS,
        this.player,
      );
      if (!hit) return;
      const nl = this.toL(hit.normal1 as V3, this.fN);
      if (nl.y < WALKABLE_NY) return;
      out.grounded = true;
      out.y = ly - hit.time_of_impact - pr;
      out.groundId = hit.collider.handle;
      out.gnx = nl.x;
      out.gny = nl.y;
      out.gnz = nl.z;
    }
  }

  private probeGround(out: MoveResult, lift: number, down: number) {
    const pr = PROBE_R;
    const t = this.tmp;
    t.x = out.x;
    t.y = out.y + lift + pr;
    t.z = out.z;
    const hit = this.world.castShape(
      t,
      IDENTITY,
      DOWN,
      this.probe,
      0,
      lift + down,
      true,
      undefined,
      QUERY_GROUPS,
      this.player,
    );
    if (!hit) return;
    const ny = hit.normal1.y;
    if (ny < WALKABLE_NY) return; // too steep to stand on: the capsule will slide down it
    out.grounded = true;
    out.y = t.y - hit.time_of_impact - pr;
    out.groundId = hit.collider.handle;
    out.gnx = hit.normal1.x;
    out.gny = ny;
    out.gnz = hit.normal1.z;
  }

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    max: number,
    out: RayHit,
  ): boolean {
    const r = this.ray;
    if (this.frame) {
      const o = this.toW(vset(this.fW, ox, oy, oz), this.fW);
      const d = this.toW(vset(this.fD, dx, dy, dz), this.fD);
      ox = o.x;
      oy = o.y;
      oz = o.z;
      dx = d.x;
      dy = d.y;
      dz = d.z;
    }
    r.origin.x = ox;
    r.origin.y = oy;
    r.origin.z = oz;
    r.dir.x = dx;
    r.dir.y = dy;
    r.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(r, max, true, undefined, QUERY_GROUPS, this.player);
    if (!hit) return false;
    out.dist = hit.timeOfImpact;
    out.nx = hit.normal.x;
    out.ny = hit.normal.y;
    out.nz = hit.normal.z;
    if (this.frame) {
      const nl = this.toL(vset(this.fN, out.nx, out.ny, out.nz), this.fN);
      out.nx = nl.x;
      out.ny = nl.y;
      out.nz = nl.z;
    }
    out.id = hit.collider.handle;
    out.wallrun = this.meta.get(out.id)?.wallrun ?? false;
    return true;
  }

  canFit(x: number, y: number, z: number, height: number): boolean {
    const lift = Math.min(cfg.stepHeight, Math.max(0, height - 2 * cfg.radius));
    let shape = this.fitShapes.get(height);
    if (!shape) {
      shape = new RAPIER.Capsule(Math.max(0.005, (height - lift) / 2 - cfg.radius), cfg.radius - 0.03);
      this.fitShapes.set(height, shape);
    }
    const t = this.tmp;
    t.x = x;
    t.y = y + lift + (height - lift) / 2;
    t.z = z;
    let rot = IDENTITY;
    if (this.frame) {
      this.toW(t, t);
      rot = this.frame;
    }
    return this.world.intersectionWithShape(t, rot, shape, undefined, QUERY_GROUPS, this.player) === null;
  }

  overlapPush(feet: V3, height: number, out: V3): number {
    if (!this.frame) return this.overlapPushW(feet, height, out, IDENTITY);
    const fw = this.toW(feet, this.fP);
    const r = this.overlapPushW(fw, height, out, this.frame, true);
    this.toL(out, out);
    return r;
  }

  private overlapPushW(feet: V3, height: number, out: V3, rot: Quat, resolve = false): number {
    const lift = Math.min(cfg.stepHeight, Math.max(0, height - 2 * cfg.radius));
    let shape = this.fitShapes.get(height);
    if (!shape) {
      shape = new RAPIER.Capsule(Math.max(0.005, (height - lift) / 2 - cfg.radius), cfg.radius - 0.03);
      this.fitShapes.set(height, shape);
    }
    const t = this.tmp;
    const ch = lift + (height - lift) / 2;
    const upv = rot === IDENTITY ? Y_AXIS : quatRotate(rot, Y_AXIS, this.t3);
    const cx = feet.x + upv.x * ch,
      cy = feet.y + upv.y * ch,
      cz = feet.z + upv.z * ch;
    t.x = cx;
    t.y = cy;
    t.z = cz;
    out.x = out.y = out.z = 0;
    let best = 0;
    let overlapped = false;
    const d = this.t3;
    // framed only: static penetration (a capsule that turned in place with gravity) is pushed out
    const dep = this.dep;
    dep.x = dep.y = dep.z = 0;
    let depen = false;
    const centre = this.depC;
    centre.x = cx;
    centre.y = cy;
    centre.z = cz;
    this.world.intersectionsWithShape(
      t,
      rot,
      shape,
      (c) => {
        overlapped = true;
        if (resolve) {
          const ct = c.contactShape(shape, centre, rot, 0);
          if (ct && ct.distance < 0) {
            const k = -ct.distance + 0.004;
            dep.x += ct.normal1.x * k;
            dep.y += ct.normal1.y * k;
            dep.z += ct.normal1.z * k;
            depen = true;
          }
        }
        if (!this.meta.get(c.handle)?.motion) return true;
        this.surfaceDeltaW(c.handle, feet, d);
        // only the part of its motion that drives INTO the player pushes; sliding past does not drag
        t.x = cx;
        t.y = cy;
        t.z = cz;
        const proj = c.projectPoint(t, true);
        let nx: number,
          ny = 0,
          nz: number;
        if (proj && !proj.isInside) {
          nx = cx - proj.point.x;
          ny = cy - proj.point.y;
          nz = cz - proj.point.z;
        } else {
          const o = c.translation();
          nx = cx - o.x;
          nz = cz - o.z;
        }
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-6) return true;
        const along = (d.x * nx + d.y * ny + d.z * nz) / nl;
        if (along > best) {
          best = along;
          out.x = (nx / nl) * along;
          out.y = (ny / nl) * along;
          out.z = (nz / nl) * along;
        }
        return true;
      },
      undefined,
      QUERY_GROUPS,
      this.player,
    );
    if (!overlapped) return 0;
    if (best > 0) return 2;
    if (depen) {
      out.x = dep.x;
      out.y = dep.y;
      out.z = dep.z;
      return 3;
    }
    return 1;
  }
  private dep = v3();
  private depC = v3();

  surfaceDelta(id: number, p: V3, out: V3): void {
    if (!this.frame) return this.surfaceDeltaW(id, p, out);
    this.surfaceDeltaW(id, this.toW(p, this.fP), out);
    this.toL(out, out);
  }

  private surfaceDeltaW(id: number, p: V3, out: V3): void {
    out.x = out.y = out.z = 0;
    const m = this.meta.get(id)?.motion;
    if (!m) return;
    // local = prevQ⁻¹ (p - prevP);  new = q * local + p_now
    const l = this.t1;
    l.x = p.x - m.prevP.x;
    l.y = p.y - m.prevP.y;
    l.z = p.z - m.prevP.z;
    quatRotateInv(m.prevQ, l, l);
    const w = quatRotate(m.q, l, this.t2);
    out.x = w.x + m.p.x - p.x;
    out.y = w.y + m.p.y - p.y;
    out.z = w.z + m.p.z - p.z;
  }
}

const DOWN = { x: 0, y: -1, z: 0 };
const Y_AXIS = { x: 0, y: 1, z: 0 };
const PROBE_R = cfg.radius * 0.8;
const WALKABLE_NY = Math.cos((cfg.maxSlopeDeg * Math.PI) / 180);
