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
import { quatRotate, quatRotateInv, v3 } from '../core/math';
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
    const m = this.kcc.computedMovement();
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
    // ground: while grounded reach down (stairs, slopes); while falling only catch what the feet touch
    if (snap || dy <= 0) this.probeGround(out, lift, snap ? cfg.snapDistance : 0.02);
  }

  private probeGround(out: MoveResult, lift: number, down: number) {
    const pr = PROBE_R;
    const t = this.tmp;
    t.x = out.x;
    t.y = out.y + lift + pr;
    t.z = out.z;
    const hit = this.world.castShape(t, IDENTITY, DOWN, this.probe, 0, lift + down, true, undefined, QUERY_GROUPS, this.player);
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

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, out: RayHit): boolean {
    const r = this.ray;
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
    return this.world.intersectionWithShape(t, IDENTITY, shape, undefined, QUERY_GROUPS, this.player) === null;
  }

  surfaceDelta(id: number, p: V3, out: V3): void {
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
const PROBE_R = cfg.radius * 0.8;
const WALKABLE_NY = Math.cos((cfg.maxSlopeDeg * Math.PI) / 180);
