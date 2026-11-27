/**
 * Destructible objects: what they are, how big, and how they are hit.
 *
 * Breakables never collide with the player and never block a route: a sword cut splits them
 * cleanly along the blade's path, running into one smashes it crudely. Either way the run
 * carries on untouched. Shapes and destruction looks live in render/BreakableView.ts.
 */
import type { BreakableDef, BreakableKind } from '../levels/types';

export interface BreakableSpec {
  /** Half extents of the hit box in the object's local frame (x = width, z = depth). */
  hx: number;
  hy: number;
  hz: number;
  /** Height of the hit-box centre above the placement point (0 for hanging objects). */
  cy: number;
  /** Material family, for sound and effects. */
  mat: 'wood' | 'stone' | 'metal' | 'glass' | 'energy';
}

export const BREAKABLE_SPECS: Record<BreakableKind, BreakableSpec> = {
  target: { hx: 0.48, hy: 0.48, hz: 0.07, cy: 1.45, mat: 'wood' },
  barrier: { hx: 0.95, hy: 0.42, hz: 0.06, cy: 0.78, mat: 'wood' },
  crate: { hx: 0.45, hy: 0.45, hz: 0.45, cy: 0.45, mat: 'wood' },
  column: { hx: 0.3, hy: 1.15, hz: 0.3, cy: 1.15, mat: 'stone' },
  relic: { hx: 0.3, hy: 0.75, hz: 0.3, cy: 1.75, mat: 'stone' },
  panel: { hx: 0.8, hy: 0.6, hz: 0.04, cy: 0, mat: 'glass' },
  sign: { hx: 0.75, hy: 0.32, hz: 0.07, cy: 0, mat: 'metal' },
  energy: { hx: 1.2, hy: 1.1, hz: 0.05, cy: 1.15, mat: 'energy' },
  pylon: { hx: 0.32, hy: 0.85, hz: 0.32, cy: 0.95, mat: 'glass' },
};

/** World-space hit-box centre and a bounding radius for the sword sweep. */
export function breakableCentre(d: BreakableDef): { x: number; y: number; z: number; r: number } {
  const s = BREAKABLE_SPECS[d.kind];
  const k = d.scale ?? 1;
  return {
    x: d.p[0],
    y: d.p[1] + s.cy * k,
    z: d.p[2],
    r: Math.hypot(s.hx, s.hy, s.hz) * k * 0.8,
  };
}

/** Does the player's body (capsule approximated as a box) overlap the object? */
export function bodyTouches(
  d: BreakableDef,
  px: number,
  py: number,
  pz: number,
  height: number,
  radius = 0.36,
): boolean {
  const s = BREAKABLE_SPECS[d.kind];
  const k = d.scale ?? 1;
  const yaw = d.yaw ?? 0;
  const dx = px - d.p[0],
    dz = pz - d.p[2];
  const c = Math.cos(yaw),
    sn = Math.sin(yaw);
  // into the object's frame (inverse yaw rotation)
  const lx = dx * c - dz * sn,
    lz = dx * sn + dz * c;
  const cy = d.p[1] + s.cy * k;
  return (
    Math.abs(lx) < s.hx * k + radius &&
    Math.abs(lz) < s.hz * k + radius &&
    py < cy + s.hy * k &&
    py + height > cy - s.hy * k
  );
}
