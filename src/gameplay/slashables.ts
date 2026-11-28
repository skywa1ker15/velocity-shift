/**
 * The slashable world: objects placed along every course for the blade.
 *
 * Placement is seeded per course (the same in Pure and Evolve, so Pure stays one fixed game), and
 * comes from the course's reference line (src/evolution/slots/<level>.json): every object stands
 * where the line really passes, at blade height beside it or above it, never on it. Running the
 * line without the sword never touches them; with the sword most of them are in reach.
 *
 * Objects are laid out in small designed patterns, not scattered:
 *   Spindle gate   3-4 Chain Spindles down a straight. Cut the whole gate in time for a reward.
 *   Prism          a Kinetic Prism before or along a fast stretch: cut it for a forward burst.
 *   Lantern        a Drift Lantern over a jump: cut it in the air for a lift and an air jump back.
 *   Bloom          a Flux Bloom beside a slide: a big Flux reward.
 *   Seal cluster   a Rift Seal with Hollow Sentinels around it: cut the seal, the wave takes the rest.
 *   Sentinel       a lone Hollow Sentinel: nothing but satisfying.
 *
 * Rewards are Evolution's business (Evolve only); in Pure these are props to cut.
 */
import { quatFromEuler } from '../core/math';
import { exclusionZones, type Slot } from '../evolution/slots';
import { rng } from '../evolution/collectibles';
import type { BreakableDef, BreakableKind, LevelData, SolidDef } from '../levels/types';
import { BREAKABLE_SPECS } from './breakables';

type P = [number, number, number];

/** Is a point inside a solid (oriented box)? */
function inside(s: SolidDef, x: number, y: number, z: number, pad = 0) {
  let dx = x - s.p[0],
    dy = y - s.p[1],
    dz = z - s.p[2];
  const q = s.q
    ? { x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] }
    : s.r
      ? quatFromEuler(s.r[0], s.r[1], s.r[2])
      : null;
  if (q) {
    const qx = -q.x,
      qy = -q.y,
      qz = -q.z,
      qw = q.w;
    const tx = 2 * (qy * dz - qz * dy),
      ty = 2 * (qz * dx - qx * dz),
      tz = 2 * (qx * dy - qy * dx);
    const rx = dx + qw * tx + (qy * tz - qz * ty),
      ry = dy + qw * ty + (qz * tx - qx * tz),
      rz = dz + qw * tz + (qx * ty - qy * tx);
    dx = rx;
    dy = ry;
    dz = rz;
  }
  return (
    Math.abs(dx) < s.s[0] / 2 + pad && Math.abs(dy) < s.s[1] / 2 + pad && Math.abs(dz) < s.s[2] / 2 + pad
  );
}

export interface SlashBudget {
  /** One pattern per this many metres of line. */
  every: number;
}
export const SLASH_BUDGET: SlashBudget = { every: 20 };

/**
 * The course with its slashable world added (a new LevelData; the input is not changed).
 * Deterministic: same data + slots + seed → the same objects.
 */
export function withSlashables(data: LevelData, slots: readonly Slot[], seed: number): LevelData {
  // hand-authored courses (Training's stations) place their own
  if (!slots.length || data.evoItems) return data;
  const extra = placeSlashables(data, slots, seed);
  return { ...data, breakables: [...data.breakables, ...extra] };
}

export function placeSlashables(
  data: LevelData,
  slots: readonly Slot[],
  seed: number,
  budget = SLASH_BUDGET,
): BreakableDef[] {
  const r = rng((seed * 2654435761) ^ 0x51ab1e);
  const out: BreakableDef[] = [];
  const solids = data.solids.filter((s) => s.collide !== false);
  const zones = exclusionZones(data.entities);
  const L = slots[slots.length - 1].d;
  let n = 0,
    gate = 0;

  const hazards: P[] = [];
  for (const e of data.entities) {
    const p = (e as { p?: P }).p;
    if (p && (e.type === 'hazard' || (e as { lethal?: boolean }).lethal)) hazards.push(p);
  }
  const taken: P[] = [...data.breakables.map((b) => b.p), ...data.collectibles.map((c) => c.p)];
  const near = (p: P, list: P[], d: number) =>
    list.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < d && Math.abs(q[1] - p[1]) < 4);
  const inZone = (x: number, y: number, z: number) =>
    zones.some(
      (b) =>
        x >= b.min[0] && y >= b.min[1] && z >= b.min[2] && x <= b.max[0] && y <= b.max[1] && z <= b.max[2],
    );
  const solidAt = (x: number, y: number, z: number, pad = 0) => solids.some((s) => inside(s, x, y, z, pad));

  /** Can an object of `kind` sit at p (its placement point) facing yaw? */
  const fits = (kind: BreakableKind, p: P, yaw: number, standing: boolean) => {
    const s = BREAKABLE_SPECS[kind];
    const c = Math.cos(yaw),
      sn = Math.sin(yaw);
    for (const ix of [-1, 0, 1])
      for (const iy of [-1, 0, 1])
        for (const iz of [-1, 0, 1]) {
          const lx = ix * s.hx,
            lz = iz * s.hz;
          const x = p[0] + lx * c + lz * sn,
            y = p[1] + s.cy + iy * s.hy * 0.95,
            z = p[2] - lx * sn + lz * c;
          if (solidAt(x, y, z, 0.05)) return false;
          if (inZone(x, y, z)) return false;
        }
    if (standing) {
      // a floor right under it (and not a sliver of one)
      for (const [ox, oz] of [
        [0, 0],
        [s.hx, 0],
        [-s.hx, 0],
        [0, s.hz],
        [0, -s.hz],
      ])
        if (!solidAt(p[0] + ox * c + oz * sn, p[1] - 0.06, p[2] - ox * sn + oz * c)) return false;
    }
    for (const cp of data.checkpoints) if (Math.hypot(cp.p[0] - p[0], cp.p[2] - p[2]) < 4.5) return false;
    if (Math.hypot(data.finish.p[0] - p[0], data.finish.p[2] - p[2]) < 7) return false;
    if (near(p, hazards, 5)) return false;
    if (near(p, taken, 3)) return false;
    return true;
  };

  const add = (kind: BreakableKind, p: P, yaw: number, o: Partial<BreakableDef> = {}) => {
    const def: BreakableDef = { id: `sx-${kind}-${n++}`, kind, p, yaw, ...o };
    out.push(def);
    taken.push(p);
    return def;
  };

  const upright = (s: Slot) => Math.abs(s.u[1] - 1) < 1e-3;
  const yawOf = (s: Slot) => Math.atan2(-s.f[0], -s.f[2]); // faces back along the line (-Z at yaw 0)
  /** A point beside the line at slot s: `side` metres to the right (+) or left (-), on its floor. */
  const beside = (s: Slot, side: number, lift = 0): P => {
    const hl = Math.hypot(s.f[0], s.f[2]) || 1;
    const sx = -s.f[2] / hl,
      sz = s.f[0] / hl;
    return [s.p[0] + sx * side, s.p[1] - 0.9 + lift, s.p[2] + sz * side];
  };
  const tryBeside = (kind: BreakableKind, s: Slot, sides: number[], standing: boolean, lift = 0) => {
    for (const side of sides) {
      const p = beside(s, side, lift);
      const yaw = yawOf(s);
      if (fits(kind, p, yaw, standing)) return add(kind, p, yaw, standing ? { ground: p[1] } : {});
    }
    return null;
  };

  const body = slots.filter((s) => s.k !== 'cut' && upright(s));
  const ahead = (d0: number, d1: number, k?: Slot['k']) =>
    body.filter((s) => s.d >= d0 && s.d < d1 && (!k || s.k === k));
  /** A straight run of ground slots from d0 at least `len` m long (same heading throughout). */
  const straight = (d0: number, len: number) => {
    const g = ahead(d0, d0 + len + 2, 'ground');
    if (g.length < Math.floor(len / 4.5)) return null;
    const f0 = g[0].f;
    if (g.some((s) => s.f[0] * f0[0] + s.f[2] * f0[2] < 0.97)) return null;
    if (g[g.length - 1].d - g[0].d < len - 4) return null;
    return g;
  };

  let lastGate = -999,
    lastSeal = -999;
  const side = () => (r() < 0.5 ? 1 : -1);
  for (let d = 30 + r() * 10; d < L - 25; d += budget.every * (0.8 + r() * 0.4)) {
    const roll = r();
    let placed = false;
    // spindle gate: a straight of 16+ m, one gate per ~110 m
    if (!placed && d - lastGate > 100 && roll < 0.6) {
      let g: Slot[] | null = null;
      for (const s0 of ahead(d, d + 40, 'ground')) if ((g = straight(s0.d, 16))) break;
      if (g) {
        const sd = side();
        const picks = [g[0], g[Math.floor(g.length / 3)], g[Math.floor((2 * g.length) / 3)], g[g.length - 1]];
        const made: BreakableDef[] = [];
        picks.forEach((s, i) => {
          const def = tryBeside('spindle', s, [sd * (i % 2 ? 1.35 : 1.15)], true);
          if (def) {
            def.gate = gate;
            made.push(def);
          }
        });
        if (made.length >= 3) {
          gate++;
          lastGate = d;
          placed = true;
        } else for (const m of made) out.splice(out.indexOf(m), 1);
      }
    }
    // a lantern over a jump
    if (!placed && roll >= 0.45 && roll < 0.7) {
      const a = ahead(d, d + 20, 'air').find((s) => s.s > 6);
      if (a) {
        // up and to one side of the jump: the body sails past, a rising aerial cut takes it
        const hl = Math.hypot(a.f[0], a.f[2]) || 1;
        const sx = -a.f[2] / hl,
          sz = a.f[0] / hl;
        for (const sd of [side() * 1.3, 1.3, -1.3]) {
          const p: P = [a.p[0] + sx * sd, a.p[1] + 0.9, a.p[2] + sz * sd];
          if (fits('lantern', p, yawOf(a), false)) {
            add('lantern', p, yawOf(a));
            placed = true;
            break;
          }
        }
      }
    }
    // a bloom beside a slide
    if (!placed) {
      const sl = ahead(d, d + 18, 'slide')[0];
      if (sl) {
        // beside the slide if there is room, otherwise in the open just before it
        const before = body.filter((q) => q.k === 'ground' && q.d > sl.d - 12 && q.d < sl.d - 3);
        for (const q of [sl, ...before.reverse()])
          if (tryBeside('bloom', q, [1.15, -1.15], true)) {
            placed = true;
            break;
          }
      }
    }
    // a seal cluster in the open, one per ~150 m
    if (!placed && d - lastSeal > 150 && roll > 0.6) {
      const g = straight(d, 10);
      if (g) {
        const s = g[Math.floor(g.length / 2)];
        const sd = side();
        const seal = tryBeside('seal', s, [sd * 1.25], false, 0);
        if (seal) {
          let k = 0;
          for (const [off, lat] of [
            [-4, 2.6],
            [3, 2.8],
            [5, -2.4],
          ] as const) {
            const t = body.find((q) => q.d >= s.d + off) ?? s;
            if (tryBeside('sentinel', t, [sd * lat], true)) k++;
          }
          if (k === 0) out.splice(out.indexOf(seal), 1);
          else {
            lastSeal = d;
            placed = true;
          }
        }
      }
    }
    // a prism where the line is fast
    if (!placed) {
      const f = ahead(d, d + 16, 'ground').find((s) => s.s >= 10.5);
      if (f && tryBeside('prism', f, [side() * 1.2, 1.2, -1.2], false)) placed = true;
    }
    // otherwise a lone sentinel
    if (!placed) {
      const g = ahead(d, d + 12, 'ground')[0];
      if (g) tryBeside('sentinel', g, [side() * 2.4, 2.4, -2.4], true);
    }
  }
  return out;
}
