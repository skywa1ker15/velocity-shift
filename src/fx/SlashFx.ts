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
uniform float uStyle;
uniform float uSeed;
uniform vec3 uAccent;
uniform vec3 uInk;
float h1(float x) { return fract(sin(x * 91.7) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
vec3 hue(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main() {
  float u = vUV.x, v = vUV.y;
  float st = uStyle;
  // faceted universes: the stroke is built from flat steps
  if (st > 3.5 && st < 4.5) { u = floor(u * 14.0) / 14.0; v = floor(v * 5.0) / 5.0 + 0.1; }
  // corrupt: slices of the stroke jump sideways and drop out
  if (st > 4.5 && st < 5.5) {
    float sl = floor(u * 18.0);
    if (h1(sl + uSeed + floor(uHead * 12.0)) < 0.18) discard;
    v = clamp(v + (h1(sl * 3.1 + uSeed) - 0.5) * 0.35, 0.0, 1.0);
  }
  if (u > uHead) discard;
  float age = uHead - u;
  // crescent: fat in the middle, pointed at both ends, thickest just behind the blade
  float cres = pow(sin(3.14159 * clamp(u, 0.0, 1.0)), 0.6);
  float th = uWidth * (0.3 + 0.7 * cres) * (0.6 + 0.4 * exp(-age * 5.0));
  // ink: a rough, bristly inner edge
  if (st > 2.5 && st < 3.5) th *= 0.7 + 0.6 * n1(u * 22.0 + uSeed);
  float inner = 1.0 - th;
  // ink splatter flicks off the inner side of the stroke
  if (v < inner) {
    if (st > 2.5 && st < 3.5) {
      float c = floor(u * 26.0);
      vec2 d = vec2(fract(u * 26.0) - 0.5, (v - (inner - 0.08 - h1(c) * 0.15)) * 9.0);
      if (h1(c + 5.0) > 0.55 && length(d) < 0.22 && age < 0.8) { gl_FragColor = vec4(uInk, exp(-age * 2.0) * uFade); return; }
    }
    discard;
  }
  float k = (v - inner) / max(th, 1e-3);   // 0 inner edge .. 1 outer (cutting) edge
  float aa = fwidth(k) * 1.5 + 0.02;
  float lane = floor(k * 9.0);
  float streak = step(0.35 + 0.4 * h1(lane + 3.1), fract(u * (6.0 + h1(lane) * 10.0) + h1(lane + 7.0)));
  float body = mix(1.0, streak, uStreak * (1.0 - smoothstep(0.45, 0.7, k)));
  vec3 acc = st > 5.5 && st < 6.5 ? hue(u * 1.6 - uHead * 0.8) : uAccent;
  vec3 col = mix(acc, vec3(1.0), smoothstep(0.62, 0.82, k) * (0.6 + 0.4 * uHot));
  float inkW = 2.0;
  if (st > 0.5 && st < 1.5) {
    // neon: hollow tube: a white-hot rim on the cutting edge, a second rim in the ink colour inside
    float rim = exp(-pow((1.0 - k) * 7.0, 2.0)) + 0.6 * exp(-pow((k - 0.35) * 9.0, 2.0));
    col = mix(uInk, mix(acc, vec3(1.0), exp(-pow((1.0 - k) * 14.0, 2.0))), smoothstep(0.2, 0.75, k));
    body = clamp(rim + 0.18, 0.0, 1.0);
    inkW = 0.0;
  } else if (st > 1.5 && st < 2.5) {
    // comic: a flat solid ribbon, a heavy black border, and speed-cut gaps toward the tail
    col = mix(acc, vec3(1.0), step(0.78, k) * 0.9);
    body = 1.0 - step(0.5, fract(u * 9.0)) * step(0.25, age) * step(k, 0.7);
    inkW = 4.0;
  } else if (st > 2.5 && st < 3.5) {
    // ink: a dark wet stroke; only the cutting edge catches a little paper-white
    col = mix(uAccent, vec3(0.92), smoothstep(0.88, 1.0, k) * 0.5);
    body = mix(1.0, streak, 0.35 * (1.0 - k));
    inkW = 0.0;
  } else if (st > 6.5) {
    // painted: bristle lanes in two warm tones along the stroke, soft edges, no hard border
    float br = n1(k * 11.0 + uSeed);
    col = mix(uAccent * 0.8, mix(uAccent, vec3(1.0, 0.96, 0.85), 0.55), br);
    col = mix(col, vec3(1.0), smoothstep(0.85, 1.0, k) * 0.5);
    body *= 0.85 + 0.15 * n1(u * 30.0 + k * 7.0);
    inkW = 0.0;
  }
  float ink = 1.0 - smoothstep(0.0, aa * inkW, k) + smoothstep(1.0 - aa * inkW * 0.7, 1.0, k);
  if (inkW > 0.0) col = mix(col, uInk, clamp(ink, 0.0, 1.0) * 0.9);
  float fade = exp(-age * 1.9) * uFade;
  float a = body * fade * smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.96, 1.0, u));
  if (st > 6.5) a *= smoothstep(0.0, 0.2, k);
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, min(a, 0.92));
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

/** How a universe draws its sword stroke (see `FxLook.trail`). */
export interface TrailLook {
  tint: number | null;
  ink: number;
  streak: number;
  hot: number;
  /** 0 brush, 1 neon tube, 2 comic ribbon, 3 ink splash, 4 faceted, 5 glitch, 6 rainbow, 7 paint. */
  style: number;
}

/** Keep a projected point inside the visible frame: values near the edge ease toward it. */
const soft = (x: number, lim: number) => lim * Math.tanh(x / lim);

export class SlashFx {
  readonly group = new THREE.Group();
  private arcs: Arc[] = [];
  private next = 0;
  private accent = new THREE.Color(0xff9a3c);
  private suit = new THREE.Color(0xff9a3c);
  private ink = new THREE.Color(0x0b0d14);
  private look: TrailLook = {
    tint: null,
    ink: 0x0b0d14,
    streak: 1,
    hot: 1,
    style: 0,
  };

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
          uStyle: { value: 0 },
          uSeed: { value: 0 },
          uAccent: { value: this.accent },
          uInk: { value: this.ink },
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

  /** The suit's accent; the universe's trail tint (if any) wins over it. */
  setAccent(c: THREE.Color) {
    this.suit.copy(c);
    this.applyLook();
  }

  /**
   * How this universe draws a sword stroke: an optional body tint, the border (ink) colour, how
   * broken the dry-brush streaks are (0 = a solid ribbon) and how hot the leading edge burns.
   */
  setLook(l: TrailLook) {
    this.look = l;
    this.ink.set(l.ink);
    this.applyLook();
  }
  private applyLook() {
    if (this.look.tint !== null) this.accent.set(this.look.tint);
    else this.accent.copy(this.suit);
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
    const W = (0.25 + s.power * 0.14) * scale;
    const sx: number[] = [],
      sy: number[] = [],
      hx: number[] = [],
      hy: number[] = [];
    for (let j = 0; j < N; j++) {
      const t = t0 + ((t1 - t0) * j) / (N - 1);
      bladeDir(pose, t, _b);
      swingHilt(_b, h);
      // the tip passes beside the eye, so its true projection runs far off-screen; the stroke is
      // laid out by the tip's *direction* from the eye instead (angles stay smooth where the
      // projection blows up), mapped into the frame and lifted a little above the hands
      const tx = h.x + _b[0] * reach,
        ty = h.y + _b[1] * reach,
        tzz = h.z + _b[2] * reach;
      sx.push(soft((Math.atan2(tx, -tzz) / (Math.PI / 2)) * 1.15, 0.95));
      sy.push(soft((Math.atan2(ty, Math.hypot(tx, tzz)) / (Math.PI / 2)) * 1.3 + 0.12, 0.5));
      const hz = Math.min(-0.2, h.z);
      hx.push(soft((Math.atan2(h.x, -hz) / (Math.PI / 2)) * 1.15, 0.95));
      hy.push(soft((Math.atan2(h.y, Math.hypot(h.x, hz)) / (Math.PI / 2)) * 1.3 + 0.12, 0.5));
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
    u.uStyle.value = this.look.style;
    u.uSeed.value = serial * 7.31;
    u.uHot.value = (pose.kind === Slash.Vertical || pose.kind === Slash.Running ? 1 : 0.4) * this.look.hot;
    u.uStreak.value = (pose.kind === Slash.Running ? 1 : 0.7) * this.look.streak;
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
      u.uFade.value = 1 - Math.min(1, Math.max(0, (a.life - a.dur - 0.08) / 0.24));
      if (a.life > a.dur + 0.34) {
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
