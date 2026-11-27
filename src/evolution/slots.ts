/**
 * Collectible slots: the controlled places a collectible may appear.
 *
 * Slots come from each course's reference run (the autopilot playing the main line through the
 * real simulation). Every slot is a point the line actually passes through, together with what the
 * runner was doing there (running, sliding, airborne, dashing, wall-running), so a collectible
 * placed in a slot is always reachable with that very move. Points in or near moving terrain,
 * hazards, checkpoints and the finish are left out.
 *
 * `recordSlots` is run offline by tests/tools/gen-slots.test.ts, which writes
 * src/evolution/slots/<level>.json; tests/sim/evolution.test.ts checks the files are current.
 */
import { quatRotate, v3 } from '../core/math';
import type { Simulation } from '../gameplay/Simulation';
import type { EntityDef } from '../levels/types';
import { MoveState, type InputFrame } from '../movement/types';

export type SlotKind = 'ground' | 'slide' | 'air' | 'dash' | 'wall' | 'cut';
export interface Slot {
  k: SlotKind;
  /** Body centre (or the glyph position for 'cut'). */
  p: [number, number, number];
  /** Gravity up and travel direction there. */
  u: [number, number, number];
  f: [number, number, number];
  /** Distance along the line (m) and speed there (m/s). */
  d: number;
  s: number;
}

const SPACING = 4;

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

function grow(b: Box, x: number, y: number, z: number, r: number) {
  b.min[0] = Math.min(b.min[0], x - r);
  b.min[1] = Math.min(b.min[1], y - r);
  b.min[2] = Math.min(b.min[2], z - r);
  b.max[0] = Math.max(b.max[0], x + r);
  b.max[1] = Math.max(b.max[1], y + r);
  b.max[2] = Math.max(b.max[2], z + r);
}
const box = (): Box => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const inside = (b: Box, x: number, y: number, z: number) =>
  x >= b.min[0] && y >= b.min[1] && z >= b.min[2] && x <= b.max[0] && y <= b.max[1] && z <= b.max[2];

/** Volumes a collectible must stay out of: anything that moves, anything lethal. */
export function exclusionZones(entities: readonly EntityDef[]): Box[] {
  const out: Box[] = [];
  for (const e of entities as (EntityDef & Record<string, any>)[]) {
    const b = box();
    const p: number[] | undefined = e.p;
    switch (e.type) {
      case 'structure':
      case 'rotator': {
        let r = 0;
        for (const part of e.parts ?? [])
          r = Math.max(
            r,
            Math.hypot(part.p[0], part.p[1], part.p[2]) + Math.hypot(part.s[0], part.s[1], part.s[2]) / 2,
          );
        grow(b, p![0], p![1], p![2], r + 2.5);
        break;
      }
      case 'mover':
        for (const q of e.path) grow(b, q[0], q[1], q[2], Math.max(e.s[0], e.s[1], e.s[2]) / 2 + 2.5);
        break;
      case 'collapse':
      case 'blink':
        grow(b, p![0], p![1], p![2], Math.max(e.s[0], e.s[1], e.s[2]) / 2 + 2);
        break;
      case 'hazard':
        grow(b, p![0], p![1], p![2], Math.max(e.s[0], e.s[1], e.s[2]) / 2 + 3.5);
        break;
      case 'field':
        if (e.mode === 'structure') {
          // linked to a moving structure: follows it, so treat its volume as moving
          const s = e.s as number[];
          b.min = [e.p[0] - s[0] / 2, e.p[1] - s[1] / 2, e.p[2] - s[2] / 2];
          b.max = [e.p[0] + s[0] / 2, e.p[1] + s[1] / 2, e.p[2] + s[2] / 2];
        } else continue;
        break;
      default:
        continue;
    }
    out.push(b);
  }
  return out;
}

const R = (n: number) => Math.round(n * 100) / 100;
const _u = v3();
const UP = v3(0, 1, 0);

/**
 * Play the course with `step` (the autopilot) and record slots along the way. Returns null if the
 * run did not finish cleanly.
 */
export function recordSlots(sim: Simulation, step: () => InputFrame, maxTicks = 120 * 300): Slot[] | null {
  const zones = exclusionZones(sim.data.entities);
  const d = sim.data;
  const pl = sim.player;
  const slots: Slot[] = [];
  let dist = 0;
  const next: Record<SlotKind, number> = { ground: 6, slide: 0, air: 0, dash: 0, wall: 0, cut: 10 };
  let dashMarked = -1;
  const blocked = (x: number, y: number, z: number) => {
    for (const c of d.checkpoints) if (Math.hypot(c.p[0] - x, c.p[1] + 0.9 - y, c.p[2] - z) < 4) return true;
    if (Math.hypot(d.finish.p[0] - x, d.finish.p[1] - y, d.finish.p[2] - z) < 8) return true;
    for (const b of d.breakables) if (Math.hypot(b.p[0] - x, b.p[1] + 1 - y, b.p[2] - z) < 2.2) return true;
    for (const c of d.collectibles) if (Math.hypot(c.p[0] - x, c.p[1] - y, c.p[2] - z) < 3) return true;
    for (const z0 of zones) if (inside(z0, x, y, z)) return true;
    return false;
  };
  for (let t = 0; t < maxTicks && !sim.stats.finished; t++) {
    sim.tick(step());
    if (sim.stats.deaths > 0) return null;
    if (!sim.stats.started) continue;
    const dx = pl.pos.x - pl.prevPos.x,
      dy = pl.pos.y - pl.prevPos.y,
      dz = pl.pos.z - pl.prevPos.z;
    const step1 = Math.hypot(dx, dy, dz);
    if (step1 > 2) continue; // a respawn or teleport
    dist += step1;
    const up = quatRotate(pl.frame, UP, _u);
    const cx = pl.pos.x + up.x * pl.height * 0.5,
      cy = pl.pos.y + up.y * pl.height * 0.5,
      cz = pl.pos.z + up.z * pl.height * 0.5;
    const st = pl.state;
    let k: SlotKind | null = null;
    if (st === MoveState.Slide) k = 'slide';
    else if (st === MoveState.WallRun) k = 'wall';
    else if (st === MoveState.Dash) k = 'dash';
    else if (st === MoveState.Air && pl.airTime > 0.22) k = 'air';
    else if ((st === MoveState.Run || st === MoveState.Sprint) && pl.grounded && pl.groundId !== -1) {
      const meta = sim.physics.metaOf(pl.groundId);
      if (!meta || meta.entity === undefined || meta.entity < 0) k = 'ground';
    }
    if (!k) continue;
    if (k === 'dash') {
      // one slot per dash, at its middle
      if (pl.sinceDash < 0.06 || dashMarked === sim.stats.dashes) continue;
      dashMarked = sim.stats.dashes;
    } else if (dist < next[k]) continue;
    if (blocked(cx, cy, cz)) continue;
    const sp = Math.max(0.01, step1);
    const f: [number, number, number] = [R(dx / sp), R(dy / sp), R(dz / sp)];
    const u: [number, number, number] = [R(up.x), R(up.y), R(up.z)];
    // slides hang the collectible low (slide under it); everything else at the body centre
    const lift = k === 'slide' ? -0.1 : 0;
    slots.push({
      k,
      p: [R(cx + up.x * lift), R(cy + up.y * lift), R(cz + up.z * lift)],
      u,
      f,
      d: R(dist),
      s: R(pl.speed),
    });
    next[k] = dist + SPACING;
    // a sword glyph beside a stretch of running: off to one side at slash height, clear of walls
    if (k === 'ground' && dist >= next.cut && Math.abs(up.y - 1) < 1e-3) {
      const hl = Math.hypot(f[0], f[2]) || 1;
      const sx = -f[2] / hl,
        sz = f[0] / hl;
      for (const side of [1, -1]) {
        const ex = cx + sx * side * 1.25,
          ez = cz + sz * side * 1.25,
          ey = cy + 0.55;
        if (blocked(ex, ey, ez)) continue;
        const hit = {} as Parameters<typeof sim.physics.raycast>[7];
        if (sim.physics.raycast(cx, ey, cz, sx * side, 0, sz * side, 2, hit)) continue;
        if (!sim.physics.canFit(ex, ey - 0.5, ez, 1)) continue;
        slots.push({ k: 'cut', p: [R(ex), R(ey), R(ez)], u, f, d: R(dist), s: R(pl.speed) });
        next.cut = dist + 9;
        break;
      }
    }
  }
  return sim.stats.finished ? slots : null;
}
