/**
 * The runner's sword: state machine, attack timing and blade sweep.
 *
 * Deterministic and headless (it ticks inside Simulation at 120 Hz). It never touches the
 * player's velocity or collision — the sword is purely an action layered over the parkour.
 *
 * The blade's direction over an attack is a pure function (`bladeDir`) of the attack and its
 * clock. The simulation uses it to sweep for hits; the first-person renderer uses the very same
 * function to pose the sword, so what you see cutting is exactly what cuts.
 *
 * Camera-space convention (as three.js): +x right, +y up, -z forward.
 */
import type { MovementController } from '../movement/MovementController';
import { MoveState, type InputFrame } from '../movement/types';

export const enum SwordPhase {
  Sheathed,
  Drawing,
  Ready,
  Attack,
  Sheathing,
}

export const enum Slash {
  Horizontal,
  Vertical,
  Diagonal,
  Running,
  Aerial,
}
export const slashNames = ['horizontal', 'vertical', 'diagonal', 'running', 'aerial'] as const;

type V = [number, number, number];
export interface SlashSpec {
  /** Anticipation, cutting window and recovery, in seconds. */
  windup: number;
  active: number;
  recover: number;
  /** How far the blade reaches from the eye (m). */
  reach: number;
  /** Blade direction: cocked (end of wind-up), mid-swing, follow-through. */
  A: V;
  M: V;
  E: V;
  /** Visual / audio weight 0..1. */
  power: number;
}

const n3 = (x: number, y: number, z: number): V => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/** The five attacks. Wind-ups are short on purpose: the runner never stops to swing. */
export const SLASHES: SlashSpec[] = [
  // horizontal: a flat, wide right-to-left sweep
  {
    windup: 0.075,
    active: 0.1,
    recover: 0.2,
    reach: 2.8,
    A: n3(1, 0.06, 0.32),
    M: n3(0.05, 0.02, -1),
    E: n3(-1, -0.08, 0.3),
    power: 0.6,
  },
  // vertical: an overhead strike straight down the line of sight
  {
    windup: 0.11,
    active: 0.09,
    recover: 0.24,
    reach: 3.0,
    A: n3(0.1, 1, -0.05),
    M: n3(0.02, 0.15, -1),
    E: n3(-0.02, -1, -0.3),
    power: 1,
  },
  // diagonal: top-right to bottom-left
  {
    windup: 0.065,
    active: 0.09,
    recover: 0.2,
    reach: 2.8,
    A: n3(0.78, 0.72, 0.25),
    M: n3(0.05, 0.05, -1),
    E: n3(-0.75, -0.72, 0.05),
    power: 0.75,
  },
  // running draw-cut: out of the back sheath over the right shoulder, a long low iai sweep
  {
    windup: 0.12,
    active: 0.12,
    recover: 0.22,
    reach: 3.4,
    A: n3(0.55, 0.85, 0.35),
    M: n3(0.25, 0.05, -1),
    E: n3(-1, -0.32, 0.1),
    power: 0.9,
  },
  // aerial: a rising crescent, low-left up to high-right (alternates direction in a chain)
  {
    windup: 0.06,
    active: 0.13,
    recover: 0.18,
    reach: 3.1,
    A: n3(-0.7, -0.72, 0.1),
    M: n3(0.0, 0.25, -1),
    E: n3(0.75, 0.7, 0.2),
    power: 0.8,
  },
];

export const DRAW_TIME = 0.26;
export const SHEATHE_TIME = 0.32;
/** Extra wind-up when an attack also has to pull the sword out of the sheath. */
export const QUICKDRAW = 0.07;
/** Ready with no attack for this long: the sword goes back on the back. */
export const AUTO_SHEATHE = 5;
/** Ground combo order. */
const COMBO = [Slash.Horizontal, Slash.Diagonal, Slash.Vertical];

// ----- blade geometry (pure) --------------------------------------------------------------
// the guard between swings: the blade rests back over the right shoulder, out of the way of
// the view, edge forward
const READY: V = n3(0.3, 0.8, 0.5);
/** Recovery passes through a low guard (blade forward-down at the right) on its way back to
 * the shoulder, so the blade never swings across the eye. */
const LOW: V = n3(0.55, -0.35, -0.75);

function slerp(a: V, b: V, t: number, out: V) {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const th = Math.acos(d);
  if (th < 1e-4) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
  }
  const s = Math.sin(th);
  const k0 = Math.sin((1 - t) * th) / s,
    k1 = Math.sin(t * th) / s;
  out[0] = a[0] * k0 + b[0] * k1;
  out[1] = a[1] * k0 + b[1] * k1;
  out[2] = a[2] * k0 + b[2] * k1;
  return out;
}
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const _a: V = [0, 0, 0],
  _b: V = [0, 0, 0],
  _e: V = [0, 0, 0],
  _m: V = [0, 0, 0];

export interface AttackPose {
  kind: Slash;
  /** -1 mirrors the swing left-right. */
  mirror: number;
  /** Lowered swing (slide attacks). */
  low: boolean;
  /** Includes pulling the sword from the sheath. */
  fromSheath: boolean;
}

export function windupOf(p: AttackPose) {
  const s = SLASHES[p.kind];
  return s.windup + (p.fromSheath && p.kind !== Slash.Running ? QUICKDRAW : 0);
}

function mir(v: V, p: AttackPose, out: V) {
  out[0] = v[0] * p.mirror;
  out[1] = v[1] - (p.low ? 0.28 : 0);
  out[2] = v[2];
  const l = Math.hypot(out[0], out[1], out[2]);
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}

/** Over-the-shoulder direction of a sheathed blade (hilt up behind the right shoulder). */
export const SHEATH_DIR: V = n3(0.35, 0.9, 0.55);

/**
 * Blade direction (camera space) `t` seconds into an attack. Sweeps cocked → mid → through with
 * a fast ease-out during the cutting window, then eases back to the ready guard.
 */
export function bladeDir(p: AttackPose, t: number, out: V): V {
  const s = SLASHES[p.kind];
  const w = windupOf(p);
  mir(s.A, p, _a);
  mir(s.M, p, _m);
  mir(s.E, p, _e);
  if (t < w) {
    // anticipation: from the guard (or out of the sheath) to the cocked position, pulled a
    // little past it so the swing has something to release
    const k = easeInOut(t / w);
    return slerp(p.fromSheath ? SHEATH_DIR : READY, _a, k, out);
  }
  if (t < w + s.active) {
    const k = easeOut((t - w) / s.active);
    if (k < 0.5) return slerp(_a, _m, k * 2, out);
    return slerp(_m, _e, (k - 0.5) * 2, out);
  }
  const k = Math.min(1, (t - w - s.active) / s.recover);
  if (k < 0.5) return slerp(_e, LOW, easeInOut(k * 2), out);
  return slerp(LOW, READY, easeInOut((k - 0.5) * 2), out);
}

/** Direction for drawing (k 0→1) or sheathing (k 1→0). */
export function drawDir(k: number, out: V): V {
  return slerp(SHEATH_DIR, READY, easeInOut(k), out);
}
export const readyDir = (): V => [READY[0], READY[1], READY[2]];

// ----- the state machine ------------------------------------------------------------------
export interface SwordTarget {
  /** World-space centre and bounding radius. */
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface SwordHit {
  target: number;
  /** World-space sweep plane normal (the cut plane) and the blade's travel direction. */
  nx: number;
  ny: number;
  nz: number;
  tx: number;
  ty: number;
  tz: number;
  kind: Slash;
  power: number;
}

export class Sword {
  phase = SwordPhase.Sheathed;
  /** Time in the current phase (s). */
  t = 0;
  pose: AttackPose = { kind: Slash.Horizontal, mirror: 1, low: false, fromSheath: false };
  combo = 0;
  /** Index of the attack in this session (lets the renderer spot a new swing). */
  serial = 0;
  private buffered = false;
  private idle = 0;
  private hitSet = new Set<number>();
  private aerialFlip = 1;

  reset() {
    this.phase = SwordPhase.Sheathed;
    this.t = 0;
    this.combo = 0;
    this.buffered = false;
    this.idle = 0;
    this.hitSet.clear();
  }

  /** Auto-sheathe progress 0..1 while the blade idles in the ready pose (display only). */
  get idleFrac() {
    return this.phase === SwordPhase.Ready ? Math.min(1, this.idle / AUTO_SHEATHE) : 0;
  }
  get drawn() {
    return this.phase !== SwordPhase.Sheathed;
  }
  get attacking() {
    return this.phase === SwordPhase.Attack;
  }
  /** True during the cutting window of the current attack. */
  get cutting() {
    if (this.phase !== SwordPhase.Attack) return false;
    const w = windupOf(this.pose);
    return this.t >= w && this.t < w + SLASHES[this.pose.kind].active;
  }

  private start(pl: MovementController, fromSheath: boolean) {
    const st = pl.state;
    const air = !pl.grounded && st !== MoveState.WallRun && st !== MoveState.Vault;
    let kind: Slash;
    if (air) {
      kind = Slash.Aerial;
    } else if (fromSheath && pl.speed > 7.5) {
      kind = Slash.Running;
      this.combo = 0;
    } else {
      kind = COMBO[this.combo % COMBO.length];
    }
    const p = this.pose;
    p.kind = kind;
    p.fromSheath = fromSheath;
    p.low = st === MoveState.Slide;
    p.mirror = 1;
    if (kind === Slash.Aerial) {
      p.mirror = this.aerialFlip;
      this.aerialFlip = -this.aerialFlip;
    } else if (st === MoveState.WallRun && pl.wallSide === -1 && kind === Slash.Horizontal) {
      p.mirror = -1; // wall on the left: sweep away from it
    }
    if (!air) this.aerialFlip = 1;
    this.phase = SwordPhase.Attack;
    this.t = 0;
    this.buffered = false;
    this.hitSet.clear();
    this.serial++;
  }

  /**
   * Advance one tick. `hitTest` is called for each target the blade sweeps through this tick.
   * Returns true when an attack's cutting window opened this tick (for the slash event).
   */
  tick(
    inp: InputFrame,
    pl: MovementController,
    dt: number,
    targets: readonly (SwordTarget | null)[],
    onHit: (h: SwordHit) => void,
  ): boolean {
    if (pl.state === MoveState.Dead) {
      this.reset();
      return false;
    }
    const prevT = this.t;
    this.t += dt;
    let opened = false;
    switch (this.phase) {
      case SwordPhase.Sheathed:
        if (inp.attackPressed) this.start(pl, true);
        else if (inp.swordPressed) {
          this.phase = SwordPhase.Drawing;
          this.t = 0;
        }
        break;
      case SwordPhase.Drawing:
        if (inp.attackPressed) this.buffered = true;
        if (this.t >= DRAW_TIME) {
          this.phase = SwordPhase.Ready;
          this.t = 0;
          this.idle = 0;
          if (this.buffered) this.start(pl, false);
        }
        break;
      case SwordPhase.Ready:
        this.idle += dt;
        if (inp.attackPressed) this.start(pl, false);
        else if (inp.swordPressed || this.idle >= AUTO_SHEATHE) {
          this.phase = SwordPhase.Sheathing;
          this.t = 0;
        }
        break;
      case SwordPhase.Sheathing:
        if (inp.attackPressed) this.start(pl, true);
        else if (this.t >= SHEATHE_TIME) {
          this.phase = SwordPhase.Sheathed;
          this.t = 0;
        }
        break;
      case SwordPhase.Attack: {
        const s = SLASHES[this.pose.kind];
        const w = windupOf(this.pose);
        if (inp.attackPressed) this.buffered = true;
        if (prevT < w && this.t >= w) opened = true;
        // sweep for hits over this tick's slice of the cutting window
        const a0 = Math.max(prevT, w),
          a1 = Math.min(this.t, w + s.active);
        if (a1 > a0) this.sweep(pl, a0, a1, targets, onHit);
        const end = w + s.active;
        if (this.t >= end) {
          if (this.buffered) {
            // chain: the next swing releases straight out of this one's follow-through
            this.combo++;
            this.start(pl, false);
          } else if (this.t >= end + s.recover) {
            this.phase = SwordPhase.Ready;
            this.t = 0;
            this.idle = 0;
            this.combo = 0;
          }
        }
        if (this.phase === SwordPhase.Attack && inp.swordPressed && this.t >= end) {
          this.phase = SwordPhase.Sheathing;
          this.t = 0;
          this.combo = 0;
        }
        break;
      }
    }
    return opened;
  }

  private sweep(
    pl: MovementController,
    t0: number,
    t1: number,
    targets: readonly (SwordTarget | null)[],
    onHit: (h: SwordHit) => void,
  ) {
    const s = SLASHES[this.pose.kind];
    const b0 = toWorld(bladeDir(this.pose, t0, _w0), pl, _w0);
    const b1 = toWorld(bladeDir(this.pose, t1, _w1), pl, _w1);
    // sweep plane normal
    let nx = b0[1] * b1[2] - b0[2] * b1[1],
      ny = b0[2] * b1[0] - b0[0] * b1[2],
      nz = b0[0] * b1[1] - b0[1] * b1[0];
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) return;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const span = Math.acos(Math.min(1, b0[0] * b1[0] + b0[1] * b1[1] + b0[2] * b1[2]));
    const ex = pl.pos.x,
      ey = pl.pos.y + pl.height - 0.16,
      ez = pl.pos.z;
    for (let i = 0; i < targets.length; i++) {
      const tg = targets[i];
      if (!tg || this.hitSet.has(i)) continue;
      let dx = tg.x - ex,
        dy = tg.y - ey,
        dz = tg.z - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > s.reach + tg.r || dist < 0.05) continue;
      dx /= dist;
      dy /= dist;
      dz /= dist;
      const ar = Math.asin(Math.min(1, tg.r / dist));
      const off = dx * nx + dy * ny + dz * nz;
      if (Math.abs(off) > Math.sin(Math.min(1.5, BAND + ar))) continue;
      // angle of the target within the sweep, measured from b0 toward b1
      const px = dx - nx * off,
        py = dy - ny * off,
        pz = dz - nz * off;
      const cx = b0[1] * pz - b0[2] * py,
        cy = b0[2] * px - b0[0] * pz,
        cz = b0[0] * py - b0[1] * px;
      const ang = Math.atan2(cx * nx + cy * ny + cz * nz, b0[0] * px + b0[1] * py + b0[2] * pz);
      if (ang < -ar || ang > span + ar) continue;
      this.hitSet.add(i);
      const tx = b1[0] - b0[0],
        ty = b1[1] - b0[1],
        tz = b1[2] - b0[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      onHit({
        target: i,
        nx,
        ny,
        nz,
        tx: tx / tl,
        ty: ty / tl,
        tz: tz / tl,
        kind: this.pose.kind,
        power: s.power,
      });
    }
  }
}

/** Angular half-width of the blade's cutting band either side of the sweep plane. */
const BAND = 0.4;
const _w0: V = [0, 0, 0],
  _w1: V = [0, 0, 0];

/** Camera-space direction → world, from the player's view yaw / pitch. */
export function toWorld(c: V, pl: { yaw: number; pitch: number }, out: V): V {
  const cy = Math.cos(pl.yaw),
    sy = Math.sin(pl.yaw),
    cp = Math.cos(pl.pitch),
    sp = Math.sin(pl.pitch);
  // basis: right, up, back (+z camera)
  const rx = cy,
    ry = 0,
    rz = -sy;
  const fx = -sy * cp,
    fy = sp,
    fz = -cy * cp;
  const ux = -sy * -sp * 1,
    uy = cp,
    uz = -cy * -sp;
  const x = c[0],
    y = c[1],
    z = c[2];
  out[0] = rx * x + ux * y - fx * z;
  out[1] = ry * x + uy * y - fy * z;
  out[2] = rz * x + uz * y - fz * z;
  return out;
}
