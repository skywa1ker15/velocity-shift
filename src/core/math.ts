/**
 * Small allocation-free math helpers used by the simulation.
 * The simulation deliberately avoids three.js so it can run headless (tests, bots).
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}
export type Vec3Tuple = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const vset = (o: V3, x: number, y: number, z: number): V3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
export const vcopy = (o: V3, a: V3): V3 => vset(o, a.x, a.y, a.z);
export const vlen = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const hlen = (a: V3) => Math.hypot(a.x, a.z);
export const vdot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. `rate` ≈ 1/time-constant. */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const moveToward = (a: number, b: number, maxDelta: number) =>
  Math.abs(b - a) <= maxDelta ? b : a + Math.sign(b - a) * maxDelta;

export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
export const angleDelta = (from: number, to: number) => wrapAngle(to - from);

/** Quaternion from XYZ euler angles (radians), matching three.js 'XYZ' order. */
export function quatFromEuler(
  rx: number,
  ry: number,
  rz: number,
  out: Quat = { x: 0, y: 0, z: 0, w: 1 },
): Quat {
  const c1 = Math.cos(rx / 2),
    c2 = Math.cos(ry / 2),
    c3 = Math.cos(rz / 2);
  const s1 = Math.sin(rx / 2),
    s2 = Math.sin(ry / 2),
    s3 = Math.sin(rz / 2);
  out.x = s1 * c2 * c3 + c1 * s2 * s3;
  out.y = c1 * s2 * c3 - s1 * c2 * s3;
  out.z = c1 * c2 * s3 + s1 * s2 * c3;
  out.w = c1 * c2 * c3 - s1 * s2 * s3;
  return out;
}

export function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number,
  out: Quat = { x: 0, y: 0, z: 0, w: 1 },
): Quat {
  const l = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin(angle / 2) / l;
  out.x = ax * s;
  out.y = ay * s;
  out.z = az * s;
  out.w = Math.cos(angle / 2);
  return out;
}

export function quatMul(a: Quat, b: Quat, out: Quat = { x: 0, y: 0, z: 0, w: 1 }): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}

/** Rotate vector `v` by quaternion `q` into `out`. */
export function quatRotate(q: Quat, v: V3, out: V3 = v3()): V3 {
  const { x, y, z } = v;
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return out;
}

export function quatRotateInv(q: Quat, v: V3, out: V3 = v3()): V3 {
  _qi.x = -q.x;
  _qi.y = -q.y;
  _qi.z = -q.z;
  _qi.w = q.w;
  return quatRotate(_qi, v, out);
}
const _qi: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Critically-damped-ish spring for secondary motion (camera dips, arm lag). */
export class Spring {
  x = 0;
  v = 0;
  constructor(
    public stiffness = 120,
    public damping = 14,
  ) {}
  update(target: number, dt: number): number {
    // sub-stepped so the spring stays stable at any frame rate
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += ((target - this.x) * this.stiffness - this.v * this.damping) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(impulse: number) {
    this.v += impulse;
  }
  reset(x = 0) {
    this.x = x;
    this.v = 0;
  }
}

/** Seeded RNG (mulberry32). Simulation code must use this, never Math.random(). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--.---';
  const ms = Math.round(seconds * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}
