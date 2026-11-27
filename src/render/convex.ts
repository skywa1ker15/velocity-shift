/**
 * Small convex-solid toolkit for destructibles: build boxes and prisms as face lists, cut them
 * with a plane (Sutherland–Hodgman per face + a cap polygon over the cut), and turn the result
 * into flat-shaded geometry for PartBuilder.
 *
 * Every destructible is made of a handful of convex parts, so a real cut along the blade's plane
 * is cheap enough to do at the moment of impact.
 */
import * as THREE from 'three';
import type { PartOpts } from './ink';

export type P3 = [number, number, number];

export interface ConvexPart {
  /** Each face is a convex loop of points, counter-clockwise seen from outside. */
  faces: P3[][];
  color: number;
  opts?: PartOpts;
  /** Colour of a fresh cut surface (defaults to a lighter version of `color`). */
  inner?: number;
  /** Faces created by a cut (index into faces). */
  caps?: Set<number>;
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: P3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Apply a transform to every point of a part (in place) and return it. */
export function transformPart(part: ConvexPart, m: THREE.Matrix4): ConvexPart {
  const v = new THREE.Vector3();
  for (const f of part.faces)
    for (const p of f) {
      v.set(p[0], p[1], p[2]).applyMatrix4(m);
      p[0] = v.x;
      p[1] = v.y;
      p[2] = v.z;
    }
  return part;
}

export function boxPart(
  hx: number,
  hy: number,
  hz: number,
  color: number,
  m?: THREE.Matrix4,
  opts?: PartOpts,
  inner?: number,
): ConvexPart {
  const c = (x: number, y: number, z: number): P3 => [x * hx, y * hy, z * hz];
  const faces: P3[][] = [
    [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)],
    [c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1), c(-1, -1, -1)],
    [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)],
    [c(-1, -1, 1), c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1)],
    [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)],
    [c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1)],
  ];
  const p: ConvexPart = { faces, color, opts, inner };
  return m ? transformPart(p, m) : p;
}

/** An n-sided prism along Y (a cylinder, disc, hex crystal…), radius r, half height h. */
export function prismPart(
  n: number,
  r: number,
  h: number,
  color: number,
  m?: THREE.Matrix4,
  opts?: PartOpts,
  inner?: number,
  rTop = r,
  phase = 0,
): ConvexPart {
  const ring = (rr: number, y: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = phase + (i / n) * Math.PI * 2;
      return [Math.cos(a) * rr, y, Math.sin(a) * rr] as P3;
    });
  const bot = ring(r, -h),
    top = ring(rTop, h);
  const faces: P3[][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([[...bot[i]] as P3, [...top[i]] as P3, [...top[j]] as P3, [...bot[j]] as P3]);
  }
  faces.push(top.map((p) => [...p] as P3).reverse());
  faces.push(bot.map((p) => [...p] as P3));
  // make sure every face winds outward
  const ctr: P3 = [0, 0, 0];
  for (const f of faces) {
    const fn = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = f.reduce<P3>(
      (a, p) => [a[0] + p[0] / f.length, a[1] + p[1] / f.length, a[2] + p[2] / f.length],
      [0, 0, 0],
    );
    if (dot(fn, sub(fc, ctr)) < 0) f.reverse();
  }
  const p: ConvexPart = { faces, color, opts, inner };
  return m ? transformPart(p, m) : p;
}

export function partCentroid(part: ConvexPart): P3 {
  let x = 0,
    y = 0,
    z = 0,
    n = 0;
  for (const f of part.faces)
    for (const p of f) {
      x += p[0];
      y += p[1];
      z += p[2];
      n++;
    }
  return [x / n, y / n, z / n];
}

/**
 * Cut a convex part by the plane dot(n, p) = d. Returns [front (dot > d), back] — either may be
 * null when the plane misses the part. The new faces over the cut are recorded in `caps`.
 */
export function clipPart(part: ConvexPart, n: P3, d: number): [ConvexPart | null, ConvexPart | null] {
  const out: [ConvexPart | null, ConvexPart | null] = [null, null];
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const faces: P3[][] = [];
    const caps = new Set<number>();
    const cut: P3[] = [];
    part.faces.forEach((f, fi) => {
      const res: P3[] = [];
      for (let i = 0; i < f.length; i++) {
        const a = f[i],
          b = f[(i + 1) % f.length];
        const da = (dot(n, a) - d) * sgn,
          db = (dot(n, b) - d) * sgn;
        if (da >= 0) res.push(a);
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          const q: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
          res.push(q);
          cut.push(q);
        }
      }
      if (res.length >= 3) {
        if (part.caps?.has(fi)) caps.add(faces.length);
        faces.push(res.map((p) => [...p] as P3));
      }
    });
    if (!faces.length) continue;
    if (cut.length >= 3) {
      // cap: order the cut points around their centroid, facing out of this piece
      const c = cut.reduce<P3>(
        (a, p) => [a[0] + p[0] / cut.length, a[1] + p[1] / cut.length, a[2] + p[2] / cut.length],
        [0, 0, 0],
      );
      const out_: P3 = [-n[0] * sgn, -n[1] * sgn, -n[2] * sgn];
      const ax = norm(cross(out_, Math.abs(out_[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      const ay = cross(out_, ax);
      const uniq: { p: P3; a: number }[] = [];
      for (const p of cut) {
        if (uniq.some((u) => Math.hypot(u.p[0] - p[0], u.p[1] - p[1], u.p[2] - p[2]) < 1e-5)) continue;
        const v = sub(p, c);
        uniq.push({ p, a: Math.atan2(dot(v, ay), dot(v, ax)) });
      }
      if (uniq.length >= 3) {
        uniq.sort((u, v) => u.a - v.a);
        const loop = uniq.map((u) => [...u.p] as P3);
        const fn = cross(sub(loop[1], loop[0]), sub(loop[2], loop[0]));
        if (dot(fn, out_) < 0) loop.reverse();
        caps.add(faces.length);
        faces.push(loop);
      }
    }
    out[side] = { faces, color: part.color, opts: part.opts, inner: part.inner, caps };
  }
  return out;
}

/** Flat-shaded geometry for a part. `capsOnly` / `skipCaps` split cut faces from the rest. */
export function partGeometry(part: ConvexPart, which: 'all' | 'caps' | 'skin' = 'all', origin?: P3) {
  const pos: number[] = [];
  const nor: number[] = [];
  const o = origin ?? [0, 0, 0];
  part.faces.forEach((f, fi) => {
    const isCap = part.caps?.has(fi) ?? false;
    if ((which === 'caps' && !isCap) || (which === 'skin' && isCap)) return;
    const fn = norm(cross(sub(f[1], f[0]), sub(f[2], f[0])));
    for (let i = 1; i + 1 < f.length; i++) {
      for (const p of [f[0], f[i], f[i + 1]]) {
        pos.push(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
        nor.push(fn[0], fn[1], fn[2]);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
