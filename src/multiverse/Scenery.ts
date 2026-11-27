/**
 * Scenery: each universe's own background architecture, standing in the space around the course.
 *
 * It never collides and is never placed near anything the player can touch, so it cannot affect
 * a run. Every universe gets one merged mesh per level (one draw call), built once at load from a
 * seed, so memory is fixed however many universes a run visits. Only the universes on screen are
 * drawn. Props belong to a universe: when the transition front passes a prop of the universe
 * being left it folds away, and the arriving universe's props unfold in its wake.
 */
import * as THREE from 'three';
import { makeRng } from '../core/math';
import type { EnvPreset } from '../environment/presets';
import type { LevelData } from '../levels/types';
import { worldUniforms } from '../render/WorldMaterial';
import { hashSeed } from './plan';
import { mv, mvGLSL } from './uniforms';
import { UNIVERSES, type UniverseDef, type UniverseId } from './universes';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** Collects props into one non-indexed buffer. Every vertex remembers its prop's anchor. */
class PropBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  anchor: number[] = [];
  glow: number[] = [];
  private ax = 0;
  private ay = 0;
  private az = 0;
  private rot = new THREE.Matrix4();
  private scale = 1;

  /** Start a prop at a world position, with a yaw and a uniform scale. */
  begin(x: number, y: number, z: number, yaw = 0, scale = 1) {
    this.ax = x;
    this.ay = y;
    this.az = z;
    this.rot.makeRotationY(yaw);
    this.scale = scale;
  }

  /** Add a primitive in the prop's local space. */
  add(
    geo: THREE.BufferGeometry,
    at: [number, number, number],
    size: [number, number, number],
    color: number,
    glow = 0,
    euler: [number, number, number] = [0, 0, 0],
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _m.compose(_p.set(...at), _q.setFromEuler(_e.set(...euler)), _s.set(...size));
    const nm = new THREE.Matrix3().getNormalMatrix(_m);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    _c.set(color);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(_m).multiplyScalar(this.scale).applyMatrix4(this.rot);
      _n.fromBufferAttribute(n, i).applyMatrix3(nm).normalize().applyMatrix4(this.rot);
      this.pos.push(_v.x + this.ax, _v.y + this.ay, _v.z + this.az);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r, _c.g, _c.b);
      this.anchor.push(this.ax, this.ay, this.az);
      this.glow.push(glow);
    }
    if (g !== geo) g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(this.anchor, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Shared primitives, created once and reused by every builder. */
const prim = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone4: new THREE.ConeGeometry(0.5, 1, 4, 1),
  cone6: new THREE.ConeGeometry(0.5, 1, 6, 1),
  cone8: new THREE.ConeGeometry(0.5, 1, 8, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  taper: new THREE.CylinderGeometry(0.28, 0.5, 1, 7, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ball: new THREE.IcosahedronGeometry(0.5, 1),
  oct: new THREE.OctahedronGeometry(0.5, 0),
  ring: new THREE.TorusGeometry(0.5, 0.045, 5, 18),
  star: (() => {
    // a flat spiky burst
    const shape = new THREE.Shape();
    const pts = 14;
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 ? 0.3 : 0.5;
      const a = (i / (pts * 2)) * Math.PI * 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  })(),
};

type Rng = () => number;
type Maker = (b: PropBuilder, rng: Rng, x: number, y: number, z: number, far: number) => void;

/** What each universe builds. `far` is 0 for props near the course, 1 for the distant ring. */
const MAKERS: Partial<Record<UniverseId, Maker>> = {
  // megacity: slab towers with a lit crown, holo-billboards, hovering ring drones
  neon(b, rng, x, y, z, far) {
    const k = rng();
    const yaw = rng() * 6.28;
    if (k < 0.5 || far > 0.5) {
      const h = 40 + rng() * 70;
      const w = 7 + rng() * 9;
      b.begin(x, y - 30, z, yaw);
      b.add(prim.box, [0, h / 2, 0], [w, h, w * (0.6 + rng() * 0.6)], 0x10142a, 0.35);
      b.add(prim.box, [0, h + 1.2, 0], [w * 0.55, 2.4, w * 0.4], 0x10142a, 0.35);
      b.add(prim.box, [0, h + 0.15, 0], [w * 1.04, 0.3, w * 0.7], 0x19f0ff, 2.2);
      b.add(prim.box, [w * 0.2, h + 7, 0], [0.25, 12, 0.25], 0xff2fa0, 2);
      // a vertical sign down one face
      b.add(
        prim.box,
        [w * 0.52, h * (0.45 + rng() * 0.3), 0],
        [0.2, h * 0.3, 2.2],
        rng() < 0.5 ? 0xff2fa0 : 0x19f0ff,
        1.6,
      );
    } else if (k < 0.8) {
      const w = 8 + rng() * 8;
      b.begin(x, y, z, yaw);
      b.add(prim.box, [0, 0, 0], [w, w * 0.5, 0.15], rng() < 0.5 ? 0xff2fa0 : 0x19f0ff, 3.1);
      b.add(prim.box, [0, w * 0.27, 0], [w * 1.04, 0.2, 0.3], 0x10142a, 0);
      b.add(prim.box, [0, -w * 0.27, 0], [w * 1.04, 0.2, 0.3], 0x10142a, 0);
      b.add(prim.box, [0, -w * 1.2, 0], [0.3, w * 1.9, 0.3], 0x10142a, 0);
    } else {
      b.begin(x, y, z, yaw, 1 + rng() * 1.5);
      b.add(prim.ring, [0, 0, 0], [3, 3, 3], 0x19f0ff, 2.4, [1.57, 0, 0]);
      b.add(prim.oct, [0, 0, 0], [1, 0.5, 1], 0x10142a, 0);
      b.add(prim.box, [0, -0.5, 0], [0.12, 0.6, 0.12], 0xff2030, 2.4);
    }
  },
  // floating islands with pines, loose crystals
  lowpoly(b, rng, x, y, z, far) {
    const yaw = rng() * 6.28;
    const k = rng();
    if (k < 0.72 || far > 0.5) {
      const r = (5 + rng() * 6) * (1 + far * 2);
      b.begin(x, y, z, yaw);
      b.add(prim.cone6, [0, -r * 0.55, 0], [r * 2, r * 1.3, r * 2], 0x9a7a5c, 0, [3.1416, 0, 0]);
      b.add(prim.cyl6, [0, 0.25, 0], [r * 2.02, 0.7, r * 2.02], 0x8fcf6a, 0);
      const trees = 1 + Math.floor(rng() * 4);
      for (let i = 0; i < trees; i++) {
        const a = rng() * 6.28,
          d = rng() * r * 0.6,
          th = 2.2 + rng() * 2.6;
        const tx = Math.cos(a) * d,
          tz = Math.sin(a) * d;
        b.add(prim.cyl6, [tx, 0.6 + th * 0.15, tz], [0.4, th * 0.3, 0.4], 0x7a5a44, 0);
        b.add(prim.cone6, [tx, 0.6 + th * 0.62, tz], [th * 0.85, th * 0.8, th * 0.85], 0x3f9a6a, 0);
        b.add(prim.cone6, [tx, 0.6 + th * 1.05, tz], [th * 0.6, th * 0.6, th * 0.6], 0x55b07a, 0);
      }
      if (rng() < 0.5) b.add(prim.ico, [r * 0.5, 0.9, r * 0.2], [1.6, 1.2, 1.4], 0xb9b2a6, 0);
    } else {
      b.begin(x, y, z, yaw, 1 + rng() * 2);
      b.add(prim.oct, [0, 0, 0], [1.6, 4, 1.6], 0x7fe0e8, 0.5);
      b.add(prim.oct, [1.1, -0.8, 0.4], [0.9, 2.2, 0.9], 0xa8f0ff, 0.5, [0, 0, -0.4]);
    }
  },
  // karst spires, pines, the occasional red gate
  ink(b, rng, x, y, z, far) {
    const yaw = rng() * 6.28;
    const k = rng();
    if (k < 0.55 || far > 0.5) {
      const h = (24 + rng() * 46) * (1 + far);
      const w = (5 + rng() * 7) * (1 + far * 0.8);
      b.begin(x, y - h * 0.55, z, yaw);
      b.add(prim.taper, [0, h / 2, 0], [w, h, w], 0x8d8a82, 0);
      b.add(prim.taper, [w * 0.45, h * 0.3, w * 0.2], [w * 0.6, h * 0.6, w * 0.6], 0x5f5d58, 0);
      // a pine clinging to the top
      b.add(prim.cyl6, [0, h + 1.2, 0], [0.35, 2.4, 0.35], 0x111114, 0);
      b.add(prim.cone6, [0, h + 2.6, 0], [3.2, 1.6, 3.2], 0x111114, 0);
      b.add(prim.cone6, [0.3, h + 3.7, 0], [2.3, 1.3, 2.3], 0x111114, 0);
    } else if (k < 0.85) {
      b.begin(x, y, z, yaw, 1.2 + rng() * 1.2);
      for (let i = 0; i < 4; i++)
        b.add(prim.cone6, [0, 1.6 + i * 1.5, 0], [4.2 - i * 0.85, 2, 4.2 - i * 0.85], 0x111114, 0);
      b.add(prim.cyl6, [0, 0, 0], [0.5, 3, 0.5], 0x111114, 0);
      b.add(prim.ico, [0, -2.4, 0], [5, 2.4, 5], 0x8d8a82, 0);
    } else {
      b.begin(x, y, z, yaw, 1.4 + rng());
      b.add(prim.box, [-2.4, 0, 0], [0.5, 7, 0.5], 0xd8261c, 0);
      b.add(prim.box, [2.4, 0, 0], [0.5, 7, 0.5], 0xd8261c, 0);
      b.add(prim.box, [0, 3.2, 0], [7.4, 0.55, 0.7], 0xd8261c, 0);
      b.add(prim.box, [0, 2.2, 0], [5.6, 0.4, 0.5], 0xd8261c, 0);
      b.add(prim.ico, [0, -4.4, 0], [8, 2.6, 5], 0x8d8a82, 0);
    }
  },
  // burst signs, puffy clouds, floating rocks
  comic(b, rng, x, y, z, far) {
    const yaw = rng() * 6.28;
    const k = rng();
    if (k < 0.4 && far < 0.5) {
      const r = 6 + rng() * 6;
      b.begin(x, y, z, yaw);
      b.add(prim.star, [0, 0, -0.2], [r * 1.25, r * 1.25, 1], 0x1d1d2b, 0);
      b.add(prim.star, [0, 0, 0], [r, r, 1], rng() < 0.5 ? 0xffe14a : 0xff4a3c, 0.25);
      b.add(prim.star, [0, 0, 0.12], [r * 0.52, r * 0.52, 1], 0xffffff, 0.25, [0, 0, 0.22]);
    } else if (k < 0.75) {
      b.begin(x, y, z, yaw, (1.5 + rng() * 2) * (1 + far));
      const puffs = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < puffs; i++) {
        const s = 2 + rng() * 2;
        b.add(prim.ball, [(i - puffs / 2) * 1.7, rng() * 1.2, rng() * 1.4], [s, s * 0.8, s], 0xffffff, 0);
      }
    } else {
      b.begin(x, y, z, yaw, (1 + rng() * 2) * (1 + far));
      b.add(prim.ico, [0, 0, 0], [5, 3.4, 4.2], 0xb46a4a, 0);
      b.add(prim.ico, [2.6, 1.3, 0.5], [2.4, 1.8, 2.2], 0xd98a5e, 0);
      b.add(prim.cyl6, [0, 1.75, 0], [3.6, 0.3, 3], 0x69c24a, 0);
    }
  },
  // palms, wire pyramids, chrome spheres
  synth(b, rng, x, y, z, far) {
    const yaw = rng() * 6.28;
    const k = rng();
    if (k < 0.45 && far < 0.5) {
      b.begin(x, y, z, yaw, 1.3 + rng() * 0.9);
      // a leaning trunk in segments, then a fan of fronds
      let px = 0,
        py = -6;
      for (let i = 0; i < 5; i++) {
        b.add(prim.cyl6, [px, py + 1.2, 0], [0.45, 2.5, 0.45], 0x12082a, 0.15, [0, 0, -0.07 * i]);
        px += 0.17 * i;
        py += 2.35;
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.28;
        b.add(
          prim.cone4,
          [px + Math.cos(a) * 1.9, py + 0.5, Math.sin(a) * 1.9],
          [0.9, 4.4, 0.18],
          0x12082a,
          0.6,
          [Math.sin(a) * 1.25, -a, 1.57 - Math.cos(a) * 0.1 + 0.35],
        );
      }
      b.add(prim.box, [0, -6.6, 0], [3.4, 0.25, 3.4], 0xff2fa0, 2.1);
    } else if (k < 0.8 || far > 0.5) {
      const r = (7 + rng() * 9) * (1 + far * 1.8);
      b.begin(x, y - r * 0.4, z, yaw);
      b.add(prim.cone4, [0, r * 0.45, 0], [r * 1.6, r * 0.9, r * 1.6], 0x12082a, 1.1);
      b.add(prim.box, [0, 0.05, 0], [r * 1.16, 0.25, r * 1.16], 0x19f0ff, 2.2, [0, 0.785, 0]);
    } else {
      const r = 2.5 + rng() * 3;
      b.begin(x, y, z, yaw);
      b.add(prim.ball, [0, 0, 0], [r * 2, r * 2, r * 2], 0xc8a8ff, 0.8);
      b.add(prim.ring, [0, 0, 0], [r * 3.2, r * 3.2, r * 3.2], 0xff2fa0, 2.2, [1.2, 0.3, 0]);
    }
  },
};

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Positions around the course that are clear of everything the level contains. */
function placements(
  data: LevelData,
  seed: number,
  count: number,
): { x: number; y: number; z: number; far: number }[] {
  const boxes: Box[] = [];
  const add = (p: number[], s: number[]) => {
    const r = Math.hypot(s[0], s[1], s[2]) / 2; // rotation-proof bound
    const hx = Math.max(s[0] / 2, Math.min(r, s[0] / 2 + 4)),
      hy = Math.max(s[1] / 2, Math.min(r, s[1] / 2 + 4)),
      hz = Math.max(s[2] / 2, Math.min(r, s[2] / 2 + 4));
    boxes.push({ x0: p[0] - hx, x1: p[0] + hx, y0: p[1] - hy, y1: p[1] + hy, z0: p[2] - hz, z1: p[2] + hz });
  };
  for (const s of data.solids) add(s.p, s.s);
  for (const d of data.decor) add(d.p, d.s);
  // moving things: cover every point of a mover's path, and a rotator's whole sweep
  for (const e of data.entities as unknown as {
    p?: number[];
    s?: number[];
    path?: number[][];
    parts?: { p: number[]; s: number[] }[];
  }[]) {
    if (e.p && e.s) add(e.p, e.s);
    if (e.s && e.path) for (const pt of e.path) add(pt, e.s);
    if (e.p && e.parts) {
      let r = 0;
      for (const part of e.parts) r = Math.max(r, Math.hypot(...part.p) + Math.hypot(...part.s) / 2);
      add(e.p, [r * 2, r * 2, r * 2]);
    }
  }
  for (const c of data.checkpoints as unknown as { p: number[] }[]) if (c.p) add(c.p, [6, 8, 6]);
  if (!boxes.length) return [];
  const rng = makeRng(seed);
  const out: { x: number; y: number; z: number; far: number }[] = [];
  const clear = (x: number, y: number, z: number, gap: number, vgap: number) => {
    for (const b of boxes) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1),
        dy = Math.max(b.y0 - y, 0, y - b.y1),
        dz = Math.max(b.z0 - z, 0, z - b.z1);
      if (dx < gap && dz < gap && dy < vgap) return false;
    }
    return true;
  };
  let tries = 0;
  while (out.length < count && tries++ < count * 30) {
    const s = data.solids[Math.floor(rng() * data.solids.length)];
    const far = rng() < 0.3 ? 1 : 0;
    const a = rng() * Math.PI * 2;
    const d = far ? 95 + rng() * 120 : 22 + rng() * 48;
    const x = s.p[0] + Math.cos(a) * d,
      z = s.p[2] + Math.sin(a) * d,
      y = s.p[1] + (rng() - 0.6) * (far ? 50 : 26);
    // nothing within 16 m sideways of any surface (props are up to ~10 m wide), at any height near it
    if (!clear(x, y, z, far ? 40 : 17, 60)) continue;
    // keep props apart from one another
    let ok = true;
    for (const o of out)
      if (Math.hypot(o.x - x, o.z - z) < (far ? 34 : 15) && Math.abs(o.y - y) < 30) ok = false;
    if (ok) out.push({ x, y, z, far });
  }
  return out;
}

const vert = /* glsl */ `
attribute vec3 aAnchor;
attribute float aGlow;
uniform float uMine;
uniform float uTime;
varying vec3 vCol;
varying vec3 vW;
varying vec3 vN;
varying float vGlow;
varying float vShow;
${mvGLSL}
void main() {
  // how present is this prop? It unfolds behind the front in its own universe, folds away in the other
  float show = abs(uUniA - uMine) < 0.5 ? 1.0 : 0.0;
  if (uUniOn > 0.5) {
    float sd = distance(aAnchor, uFront.xyz) - uFront.w;
    float inB = clamp(-sd / 16.0, 0.0, 1.0);
    show = (abs(uUniA - uMine) < 0.5 ? 1.0 - clamp(-sd / 7.0, 0.0, 1.0) : 0.0) + (abs(uUniB - uMine) < 0.5 ? inB : 0.0);
  }
  // ease with a small overshoot, and twist as it opens
  float e = show * show * (3.0 - 2.0 * show);
  float pop = e + sin(e * 3.14159) * 0.12;
  vec3 local = position - aAnchor;
  float tw = (1.0 - e) * 2.4;
  float ct = cos(tw), st = sin(tw);
  local = vec3(local.x * ct - local.z * st, local.y, local.x * st + local.z * ct) * pop;
  // a slow bob so the world never stands perfectly still
  vec3 wp = aAnchor + local;
  wp.y += sin(uTime * 0.35 + aAnchor.x * 0.13 + aAnchor.z * 0.07) * 0.6;
  vCol = color;
  vW = wp;
  vN = normal;
  vGlow = aGlow;
  vShow = e;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const frag = /* glsl */ `
uniform float uMine;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunC;
uniform vec3 uAmbC;
uniform vec3 uFogC;
uniform vec3 uFogSunC;
uniform vec3 uFogP;
varying vec3 vCol;
varying vec3 vW;
varying vec3 vN;
varying float vGlow;
varying float vShow;
float sH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (vShow < 0.01) discard;
  vec3 n = normalize(vN);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 view = toCam / max(dist, 0.001);
  float ndl = max(dot(n, uSunDir), 0.0);
  float rim = 1.0 - abs(dot(view, n));
  vec3 c;
  if (uMine < 1.5) {
    // neon: black mass, emissive parts, lit windows on the big slabs
    c = vCol * (uAmbC * 0.7 + uSunC * ndl * 0.3);
    vec2 wg = vec2(dot(vW.xz, vec2(n.z, -n.x)) / 1.3, vW.y / 1.9);
    float win = step(0.7, sH(floor(wg))) * step(0.2, fract(wg.x)) * step(0.3, fract(wg.y)) * step(abs(n.y), 0.5);
    vec3 wc = mix(vec3(1.0, 0.75, 0.4), mix(vec3(0.1, 0.95, 1.0), vec3(1.0, 0.12, 0.72), step(0.5, sH(floor(wg) + 7.0))), step(0.5, sH(floor(wg) + 3.0)));
    c += wc * win * step(0.2, vGlow) * step(vGlow, 0.5) * 0.85;
    c += vCol * max(vGlow - 0.5, 0.0) * (0.85 + 0.15 * sin(uTime * 5.0 + vW.y));
    // big panels show scrolling blocks of light
    if (vGlow > 3.0) c *= 0.45 + 0.75 * step(0.45, sH(floor(vec2(vW.y * 0.9 + uTime * 0.5, dot(vW.xz, vec2(n.z, -n.x)) * 0.9))));
  } else if (uMine < 2.5) {
    // comic: flat colour, dotted shade, an ink rim standing in for the outline
    vec2 hg = mat2(0.866, -0.5, 0.5, 0.866) * gl_FragCoord.xy / 7.0;
    float dots = 1.0 - smoothstep(0.34, 0.4, length(fract(hg) - 0.5));
    c = mix(vCol * vec3(0.5, 0.48, 0.72), vCol, max(step(0.25, ndl), 1.0 - dots));
    c = mix(c, vec3(0.03, 0.03, 0.06), step(0.8, rim));
    c += vCol * vGlow;
  } else if (uMine < 3.5) {
    // low-poly: true flat facets, warm sun, cool shade
    vec3 fn = normalize(cross(dFdx(vW), dFdy(vW)));
    float fl = max(dot(fn, uSunDir), 0.0);
    c = vCol * (uAmbC * (0.75 + 0.45 * fn.y) + uSunC * fl);
    c = mix(c, c * vec3(0.82, 0.9, 1.15), (1.0 - fl) * 0.3) + vCol * vGlow * 0.6;
  } else if (uMine < 6.5) {
    // ink: silhouettes in flat washes, darker the nearer, with a pale lit side
    float lum = dot(vCol, vec3(0.299, 0.587, 0.114));
    vec3 paper = vec3(0.955, 0.94, 0.9);
    float isRed = step(0.3, vCol.r - vCol.g);
    c = mix(vec3(0.05), paper * mix(0.45, 0.8, ndl), smoothstep(0.1, 0.5, lum));
    c = mix(c, c * 0.8, step(0.5, fract((gl_FragCoord.x * 0.6 + gl_FragCoord.y) / 9.0)) * (1.0 - ndl) * 0.5);
    c = mix(c, vCol * (0.75 + 0.25 * ndl), isRed);
  } else {
    // synthwave: black volumes, glowing wire, sunset rim
    c = vCol * 0.25 + mix(vec3(1.0, 0.16, 0.62), vec3(1.0, 0.75, 0.25), 0.5 + 0.5 * n.y) * pow(rim, 2.0) * 0.8;
    float wire = max(1.0 - smoothstep(0.0, 0.05, abs(fract(vW.y / 2.5 + 0.5) - 0.5)), 0.0);
    c += vec3(1.0, 0.16, 0.62) * wire * step(0.5, vGlow) * step(vGlow, 1.5) * 0.9;
    c += vCol * max(vGlow - 1.5, 0.0) * 1.6;
  }
  // fog, as on the level geometry
  float fd = 1.0 - exp(-uFogP.x * uFogP.x * dist * dist);
  float hf = exp(-max(vW.y - uFogP.y, 0.0) * uFogP.z);
  float below = smoothstep(uFogP.y + 4.0, uFogP.y - 70.0, vW.y);
  float f = clamp(fd * (0.3 + 0.7 * hf) + below * smoothstep(20.0, 160.0, dist), 0.0, 1.0);
  float s = pow(max(dot(-view, uSunDir), 0.0), 6.0);
  c = mix(c, mix(uFogC, uFogSunC, s * 0.7), f);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Scenery {
  readonly group = new THREE.Group();
  private sets: { index: number; mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
  /** Total triangles built (debug / tests). */
  triangles = 0;

  constructor(levelId: string, data: LevelData, level: EnvPreset, density = 1) {
    for (const def of Object.values(UNIVERSES) as UniverseDef[]) {
      const make = MAKERS[def.id];
      if (!make) continue;
      const seed = hashSeed(levelId + ':' + def.id, 77);
      const spots = placements(data, seed, Math.round(64 * density));
      if (!spots.length) continue;
      const rng = makeRng(seed ^ 0x9e3779b9);
      const b = new PropBuilder();
      for (const s of spots) make(b, rng, s.x, s.y, s.z, s.far);
      const geo = b.build();
      const env = def.env(level);
      const fogC = new THREE.Color(env.fog.color);
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        vertexColors: true,
        uniforms: {
          ...mv,
          uMine: { value: def.index },
          uTime: worldUniforms.uTime,
          uSunDir: worldUniforms.uSunDir,
          uSunC: { value: new THREE.Color(env.light.sun).multiplyScalar(env.light.sunIntensity / 2.2) },
          uAmbC: { value: new THREE.Color(env.light.skyAmbient).multiplyScalar(env.light.ambient * 0.42) },
          uFogC: { value: fogC },
          uFogSunC: { value: new THREE.Color(env.sky.sun).lerp(fogC, 0.35) },
          uFogP: { value: new THREE.Vector3(env.fog.density, env.fog.base, env.fog.falloff) },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; // spans the whole level; vertices move in the shader
      mesh.visible = false;
      this.group.add(mesh);
      this.sets.push({ index: def.index, mesh, mat });
      this.triangles += geo.getAttribute('position').count / 3;
    }
  }

  /** Draw only the universes that are on screen. */
  update() {
    const a = mv.uUniA.value,
      b = mv.uUniB.value,
      on = mv.uUniOn.value > 0.5;
    for (const s of this.sets) s.mesh.visible = s.index === a || (on && s.index === b);
  }

  dispose() {
    for (const s of this.sets) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.sets.length = 0;
    this.group.removeFromParent();
  }
}
