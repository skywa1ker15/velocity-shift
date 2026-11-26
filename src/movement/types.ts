import type { V3 } from '../core/math';

/** One simulation tick of player input. Deterministic: the same stream always gives the same run. */
export interface InputFrame {
  moveX: number; // strafe  -1..1 (right positive)
  moveZ: number; // forward -1..1 (forward positive)
  yaw: number; // radians, 0 looks toward -Z, positive turns left
  pitch: number; // radians, positive looks up
  jumpHeld: boolean;
  jumpPressed: boolean;
  sprint: boolean;
  slideHeld: boolean;
  slidePressed: boolean;
  dashPressed: boolean;
}

export const emptyInput = (): InputFrame => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  jumpHeld: false,
  jumpPressed: false,
  sprint: false,
  slideHeld: false,
  slidePressed: false,
  dashPressed: false,
});

export const enum MoveState {
  Idle,
  Run,
  Sprint,
  Slide,
  Air,
  Dash,
  WallRun,
  Vault,
  Dead,
}

export const moveStateNames = ['Idle', 'Run', 'Sprint', 'Slide', 'Air', 'Dash', 'WallRun', 'Vault', 'Dead'] as const;

export interface MoveResult {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  /** True when something other than walkable ground blocked the move. */
  hitWall: boolean;
  hitCeiling: boolean;
  /** Collider id of the surface stood on (or -1). */
  groundId: number;
  /** Ground normal (0,1,0 when unknown). */
  gnx: number;
  gny: number;
  gnz: number;
  wallNx: number;
  wallNy: number;
  wallNz: number;
}

export interface RayHit {
  dist: number;
  nx: number;
  ny: number;
  nz: number;
  id: number;
  wallrun: boolean;
}

/**
 * Everything the movement controller needs from the world. Implemented by PhysicsWorld.
 * Keeping this narrow is what makes movement independent of levels and rendering.
 */
export interface CollisionWorld {
  /** Collide-and-slide the capsule whose feet are at `feet` by `delta`. */
  move(feet: V3, height: number, dx: number, dy: number, dz: number, snap: boolean, out: MoveResult): void;
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, out: RayHit): boolean;
  /** Can a capsule of this height stand with its feet at this position without overlapping anything? */
  canFit(x: number, y: number, z: number, height: number): boolean;
  /** How far the surface `id` moved this tick at world point p (moving platforms). */
  surfaceDelta(id: number, p: V3, out: V3): void;
}

export interface MoveEvents {
  jump: { fromSlide: boolean };
  doubleJump: Record<string, never>;
  dash: { air: boolean };
  dashEnd: Record<string, never>;
  land: { speed: number; slide: boolean };
  slideStart: { boosted: boolean };
  slideEnd: Record<string, never>;
  wallRunStart: { side: 1 | -1 };
  wallRunEnd: Record<string, never>;
  wallJump: { side: 1 | -1 };
  vault: { height: number };
  footstep: { wall: boolean; speed: number };
  bump: { speed: number };
}
