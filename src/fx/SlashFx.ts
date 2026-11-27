/**
 * Illustrated sword arcs, drawn in camera space beside the first-person sword.
 *
 * Each arc is built at the start of a swing from the very blade path the simulation cuts with
 * (`bladeDir`) and revealed in step with the swing: a crescent brush stroke with a white-hot
 * leading edge, an accent-coloured body broken into dry-brush streaks, and an ink border, which
 * then fades out from the tail. Three pooled meshes; no allocation after construction.
 */
import * as THREE from 'three';
import { bladeDir, SLASHES, windupOf, Slash, type AttackPose } from '../gameplay/Sword';

const N = 40;

const vert = /* glsl */ `
attribute vec2 aUV;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
varying vec2 vUV;
uniform float uHead;
uniform float uFade;
uniform float uWidth;
uniform float uHot;
uniform float uStreak;
uniform vec3 uAccent;
uniform vec3 uInk;
float h1(float x) { return fract(sin(x * 91.7) * 43758.5453); }
void main() {
  float u = vUV.x, v = vUV.y;
  if (u > uHead) discard;
  float age = uHead - u;
  // crescent: fat in the middle of the stroke, tapering to points at both ends, and thicker
  // right behind the blade
  float cres = pow(sin(3.14159 * clamp(u, 0.0, 1.0)), 0.65);
  float th = uWidth * (0.25 + 0.75 * cres) * (0.55 + 0.45 * exp(-age * 6.0));
  float inner = 1.0 - th;
  if (v < inner) discard;
  float k = (v - inner) / max(th, 1e-3);          // 0 inner edge .. 1 outer (cutting) edge
  float aa = fwidth(k) * 1.5 + 0.02;
  // dry-brush streaks running along the stroke in its inner half
  float lane = floor(k * 9.0);
  float streak = step(0.35 + 0.4 * h1(lane + 3.1), fract(u * (6.0 + h1(lane) * 10.0) + h1(lane + 7.0)));
  float body = mix(1.0, streak, uStreak * (1.0 - smoothstep(0.45, 0.7, k)));
  vec3 col = mix(uAccent, vec3(1.0), smoothstep(0.62, 0.8, k) * (0.6 + 0.4 * uHot));
  // ink border on both edges
  float ink = 1.0 - smoothstep(0.0, aa * 2.0, k) + smoothstep(1.0 - aa * 1.4, 1.0, k);
  col = mix(col, uInk, clamp(ink, 0.0, 1.0) * 0.85);
  float fade = exp(-age * 3.2) * uFade;
  float a = body * fade * smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.97, 1.0, u));
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}`;

interface Arc {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: Float32Array;
  t0: number; // attack clock at which the stroke starts
  dur: number;
  life: number;
  live: boolean;
  serial: number;
}

const _b: [number, number, number] = [0, 0, 0];

/** Hilt position (camera space) for a blade direction while swinging — same arc as Body. */
export function swingHilt(b: [number, number, number], out: THREE.Vector3) {
  // raised blades are carried further forward so an overhead swing stays out of the eye
  return out.set(0.06 + b[0] * 0.3, -0.2 + b[1] * 0.16, -0.3 + b[2] * 0.28 - Math.max(0, b[1]) * 0.12);
}

export class SlashFx {
  readonly group = new THREE.Group();
  private arcs: Arc[] = [];
  private next = 0;
  private accent = new THREE.Color(0xff9a3c);

  constructor() {
    for (let i = 0; i < 3; i++) {
      const pos = new Float32Array(N * 2 * 3);
      const uv = new Float32Array(N * 2 * 2);
      const idx: number[] = [];
      for (let j = 0; j < N; j++) {
        uv[j * 4] = j / (N - 1);
        uv[j * 4 + 1] = 0;
        uv[j * 4 + 2] = j / (N - 1);
        uv[j * 4 + 3] = 1;
        if (j < N - 1) {
          const a = j * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        uniforms: {
          uHead: { value: 0 },
          uFade: { value: 1 },
          uWidth: { value: 0.6 },
          uHot: { value: 0 },
          uStreak: { value: 1 },
          uAccent: { value: this.accent },
          uInk: { value: new THREE.Color(0x0b0d14) },
        },
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      this.arcs.push({ mesh, mat, pos, t0: 0, dur: 0.1, life: 0, live: false, serial: -1 });
    }
  }

  setAccent(c: THREE.Color) {
    this.accent.copy(c);
  }

  /** Start the arc for a swing (called when its cutting window opens). */
  spawn(pose: AttackPose, serial: number, scale = 1) {
    if (this.arcs.some((a) => a.live && a.serial === serial)) return;
    const arc = this.arcs[this.next];
    this.next = (this.next + 1) % this.arcs.length;
    const s = SLASHES[pose.kind];
    const w = windupOf(pose);
    // the stroke covers the cutting window plus a little overshoot either side
    const t0 = w - 0.012,
      t1 = w + s.active + 0.03;
    // A first-person swing sweeps a plane that passes close to the eye, so the true swept
    // surface is seen almost edge-on. The arc is drawn the way an illustrator would instead: a
    // crescent laid face-on to the camera whose spine is the blade tip's real path on screen,
    // swelling toward the hilt side.
    const h = new THREE.Vector3();
    const reach = (pose.kind === Slash.Running ? 1.22 : 1.1) * scale;
    const W = (0.13 + s.power * 0.11) * scale;
    const sx: number[] = [],
      sy: number[] = [],
      hx: number[] = [],
      hy: number[] = [];
    for (let j = 0; j < N; j++) {
      const t = t0 + ((t1 - t0) * j) / (N - 1);
      bladeDir(pose, t, _b);
      swingHilt(_b, h);
      const tz = Math.min(-0.2, h.z + _b[2] * reach);
      sx.push((h.x + _b[0] * reach) / -tz);
      sy.push((h.y + _b[1] * reach) / -tz);
      const hz = Math.min(-0.2, h.z);
      hx.push(h.x / -hz);
      hy.push(h.y / -hz);
    }
    const D = 1.0; // the crescent lives on the plane one metre in front of the eye
    for (let j = 0; j < N; j++) {
      const a0 = Math.max(0, j - 1),
        a1 = Math.min(N - 1, j + 1);
      let tx = sx[a1] - sx[a0],
        ty = sy[a1] - sy[a0];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // normal pointing toward the hilt
      let nx = -ty,
        ny = tx;
      if (nx * (hx[j] - sx[j]) + ny * (hy[j] - sy[j]) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const u = j / (N - 1);
      const th = W * (0.2 + 0.8 * Math.pow(Math.sin(Math.PI * u), 0.6));
      const o = j * 6;
      arc.pos[o] = (sx[j] + nx * th) * D;
      arc.pos[o + 1] = (sy[j] + ny * th) * D;
      arc.pos[o + 2] = -D;
      arc.pos[o + 3] = sx[j] * D;
      arc.pos[o + 4] = sy[j] * D;
      arc.pos[o + 5] = -D;
    }
    const attr = arc.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    arc.mesh.geometry.computeBoundingSphere();
    const u = arc.mat.uniforms;
    u.uWidth.value = 1;
    u.uHot.value = pose.kind === Slash.Vertical || pose.kind === Slash.Running ? 1 : 0.4;
    u.uStreak.value = pose.kind === Slash.Running ? 1 : 0.7;
    arc.t0 = t0;
    arc.dur = t1 - t0;
    arc.life = 0;
    arc.live = true;
    arc.serial = serial;
    arc.mesh.visible = true;
  }

  /** `attackT`: the sword's attack clock for the current swing (or -1 once it has moved on). */
  update(dt: number, serial: number, attackT: number) {
    for (const a of this.arcs) {
      if (!a.live) continue;
      a.life += dt;
      const u = a.mat.uniforms;
      // reveal tracks the real swing; once the swing is over it keeps running on its own
      const head = a.serial === serial && attackT >= 0 ? (attackT - a.t0) / a.dur : a.life / a.dur;
      u.uHead.value = Math.min(1.6, Math.max(0, head));
      u.uFade.value = 1 - Math.min(1, Math.max(0, (a.life - a.dur - 0.05) / 0.22));
      if (a.life > a.dur + 0.3) {
        a.live = false;
        a.mesh.visible = false;
      }
    }
  }

  clear() {
    for (const a of this.arcs) {
      a.live = false;
      a.mesh.visible = false;
    }
  }

  dispose() {
    for (const a of this.arcs) {
      a.mesh.geometry.dispose();
      a.mat.dispose();
    }
    this.group.removeFromParent();
  }
}
