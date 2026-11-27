/**
 * Pitch geometry (Level 7 and later): surfaces in the course's YZ plane that turn the floor into a
 * wall or a ceiling, each with the gravity that holds you to it. Everything spans a lane
 * [x0, x1] across the course.
 *
 * Angles φ go round a circle in the YZ plane: the point at φ is centre + R·(0, −cos φ, sin φ), so
 * φ = 0 is straight below the centre, 90° straight ahead (+Z), 180° above and −90° behind.
 *
 * Their gravity zones draw nothing: the lit centre line along every curve shows the way.
 *
 * - `arc(..., 'inside')`: you run on the inside of the circle (a floor curling up into a wall, a
 *   wall curling into a ceiling); gravity points away from the centre.
 * - `arc(..., 'outside')`: you run over the outside (going over a convex edge); gravity points at
 *   the centre. Keep R ≥ v²/g (≈ 5 m for a sprint) or a runner flies off the crest, as in life.
 */
import type { LevelBuilder } from './LevelBuilder';
import type { MatId } from './types';

export type Lane = [number, number];

const deg = Math.PI / 180;
const off = (phi: number) => [-Math.cos(phi * deg), Math.sin(phi * deg)] as const;

/** A floor whose top surface is at y, along z0..z1. */
export function floorAt(b: LevelBuilder, lane: Lane, y: number, z0: number, z1: number, mat: MatId = 'base') {
  const [x0, x1] = lane;
  b.solid({ p: [(x0 + x1) / 2, y - 0.5, (z0 + z1) / 2], s: [x1 - x0, 1, z1 - z0], mat });
}

/** A ceiling whose underside is at y (gravity there pulls up, +Y). */
export function ceilingAt(
  b: LevelBuilder,
  lane: Lane,
  y: number,
  z0: number,
  z1: number,
  mat: MatId = 'base',
) {
  const [x0, x1] = lane;
  b.solid({ p: [(x0 + x1) / 2, y + 0.5, (z0 + z1) / 2], s: [x1 - x0, 1, z1 - z0], mat });
  b.entity({
    type: 'field',
    mode: 'dir',
    dir: [0, 1, 0],
    p: [(x0 + x1) / 2, y - 2.5, (z0 + z1) / 2],
    s: [x1 - x0, 5, z1 - z0],
    quiet: true,
  });
}

/**
 * A vertical face at z running y0..y1. `toward` is the side you stand on: −1 = you are at smaller z
 * (the face looks back down the course; gravity pulls +Z), +1 = you are at larger z (gravity −Z).
 */
export function faceAt(
  b: LevelBuilder,
  lane: Lane,
  z: number,
  y0: number,
  y1: number,
  toward: -1 | 1,
  mat: MatId = 'alt',
) {
  const [x0, x1] = lane;
  const xc = (x0 + x1) / 2;
  b.solid({ p: [xc, (y0 + y1) / 2, z - toward * 0.5], s: [x1 - x0, y1 - y0, 1], mat, wallrun: false });
  b.entity({
    type: 'field',
    mode: 'dir',
    dir: [0, 0, -toward],
    p: [xc, (y0 + y1) / 2, z + toward * 2.5],
    s: [x1 - x0, y1 - y0, 5],
    quiet: true,
  });
}

/**
 * A curved surface of radius R about the line x = *, y = cy, z = cz, from φ0 to φ1 (degrees), built
 * from short segments, with its own pipe gravity. A lit line runs along its middle.
 */
export function arc(
  b: LevelBuilder,
  lane: Lane,
  cy: number,
  cz: number,
  R: number,
  phi0: number,
  phi1: number,
  side: 'inside' | 'outside',
  mat: MatId = 'alt',
) {
  const [x0, x1] = lane;
  const xc = (x0 + x1) / 2,
    w = x1 - x0;
  const n = Math.max(2, Math.ceil(Math.abs(phi1 - phi0) / 7.5));
  const step = (phi1 - phi0) / n;
  const rs = side === 'inside' ? R + 0.5 : R - 0.5; // box centres: just beyond the running surface
  const len = R * Math.abs(step) * deg * 1.06 + 0.06;
  for (let i = 0; i < n; i++) {
    const phi = phi0 + step * (i + 0.5);
    const [oy, oz] = off(phi);
    // a box's local Y is its thin axis: turn it to lie along the radius (about X by 180° − φ)
    const r: [number, number, number] = [(180 - phi) * deg, 0, 0];
    b.solid({ p: [xc, cy + oy * rs, cz + oz * rs], s: [w, 1, len], r, mat, wallrun: false });
    const [ly, lz] = off(phi);
    const lr = side === 'inside' ? R - 0.02 : R + 0.02;
    b.solid({
      p: [xc, cy + ly * lr, cz + lz * lr],
      s: [0.3, 0.04, len * 0.9],
      r,
      mat: 'accent',
      collide: false,
      glow: 0.9,
    });
  }
  // gravity: the box around where a body on this surface can be
  let ymin = Infinity,
    ymax = -Infinity,
    zmin = Infinity,
    zmax = -Infinity;
  const r0 = side === 'inside' ? R - 2.2 : R,
    r1 = side === 'inside' ? R : R + 2.2;
  for (let i = 0; i <= 24; i++) {
    const [oy, oz] = off(phi0 + ((phi1 - phi0) * i) / 24);
    for (const rr of [r0, r1]) {
      ymin = Math.min(ymin, cy + oy * rr);
      ymax = Math.max(ymax, cy + oy * rr);
      zmin = Math.min(zmin, cz + oz * rr);
      zmax = Math.max(zmax, cz + oz * rr);
    }
  }
  b.entity({
    type: 'field',
    mode: 'pipe',
    center: [xc, cy, cz],
    axis: [1, 0, 0],
    inward: side === 'outside',
    // over a crest the pull is a little stronger, so a sprinter stays on the surface
    scale: side === 'outside' ? 1.5 : 1,
    p: [xc, (ymin + ymax) / 2, (zmin + zmax) / 2],
    s: [w, ymax - ymin, zmax - zmin],
    priority: 2,
    quiet: true,
  });
}
