/**
 * Illustrated-character rendering helpers.
 *
 * PartBuilder merges several primitive shapes into one rigid piece (one draw call) with
 * per-vertex colour, and appends an "ink hull": the same surface pushed out along smoothed
 * normals with reversed winding. Drawn with the same material it shows up as a black outline
 * around the piece, the classic cel-animation look, with no extra draw call or render pass.
 *
 * createCharacterMaterial is the matching toon material: flat light bands, a stepped rim light,
 * halftone dots in the shade, accent-coloured paint and glow.
 */
import * as THREE from 'three';
import { toonRamp, worldUniforms } from './WorldMaterial';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** Compose a transform from position, Euler rotation and scale. */
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    _v.set(x, y, z).clone(),
    _q.setFromEuler(_e.set(rx, ry, rz)).clone(),
    _s.set(sx, sy, sz).clone(),
  );
}

export interface PartOpts {
  /** > 0: glows in the accent colour. */
  glow?: number;
  /** Painted in the accent colour (follows the equipped suit). */
  accent?: boolean;
  /**
   * Painted in one of the runner's per-level palette colours (glove / sleeve / trim), so the
   * hands can contrast with every environment.
   */
  tone?: 'glove' | 'sleeve' | 'trim';
  /** Detail that sits inside the silhouette: it gets no outline hull (saves half its triangles). */
  noInk?: boolean;
}

const TONE_CODE = { glove: -2, sleeve: -3, trim: -4 } as const;

/**
 * A smooth lathed solid of revolution around +Y from a [radius, y] profile, optionally squashed
 * into an ellipse (sx, sz) so limbs are wider than they are deep. Cheap tapered anatomy.
 */
export function lathe(
  profile: [number, number][],
  segs = 10,
  sx = 1,
  sz = 1,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
    phiStart,
    phiLength,
  );
  if (sx !== 1 || sz !== 1) {
    g.scale(sx, 1, sz);
    g.computeVertexNormals();
  }
  return g;
}

export class PartBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private info: number[] = [];
  private idx: number[] = [];
  private count = 0;
  /** Vertex and index ranges of each added piece, and whether it takes part in the outline. */
  private pieces: { v0: number; v1: number; i0: number; i1: number; ink: boolean }[] = [];

  /** Add a primitive (the geometry is consumed and disposed). */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, color: number, o: PartOpts = {}): this {
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const base = this.count;
    _m.copy(matrix ?? _m.identity());
    _nm.getNormalMatrix(_m);
    _c.set(color);
    const glow = o.accent ? -1 : o.tone ? TONE_CODE[o.tone] : (o.glow ?? 0);
    const i0 = this.idx.length;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(_m);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r, _c.g, _c.b);
      this.info.push(0, glow);
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.pieces.push({ v0: base, v1: base + p.count, i0, i1: this.idx.length, ink: !o.noInk });
    this.count += p.count;
    geo.dispose();
    return this;
  }

  /** Finish the piece. `ink` is the outline thickness in metres (0 = no outline). */
  build(ink: number): THREE.BufferGeometry {
    const n = this.count;
    if (ink > 0) {
      // only pieces that shape the silhouette get a hull. Smooth the normals of coincident
      // vertices so the hull has no cracks at hard edges.
      const acc = new Map<string, [number, number, number]>();
      const keys: (string | null)[] = new Array(n).fill(null);
      for (const pc of this.pieces) {
        if (!pc.ink) continue;
        for (let i = pc.v0; i < pc.v1; i++) {
          const k = `${Math.round(this.pos[i * 3] * 2e4)},${Math.round(this.pos[i * 3 + 1] * 2e4)},${Math.round(this.pos[i * 3 + 2] * 2e4)}`;
          keys[i] = k;
          const a = acc.get(k);
          if (a) {
            a[0] += this.nor[i * 3];
            a[1] += this.nor[i * 3 + 1];
            a[2] += this.nor[i * 3 + 2];
          } else acc.set(k, [this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2]]);
        }
      }
      const hullIndex = new Int32Array(n).fill(-1);
      let h = n;
      const hp: number[] = [];
      const hn: number[] = [];
      for (let i = 0; i < n; i++) {
        const k = keys[i];
        if (k === null) continue;
        const a = acc.get(k)!;
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        hp.push(
          this.pos[i * 3] + (a[0] / l) * ink,
          this.pos[i * 3 + 1] + (a[1] / l) * ink,
          this.pos[i * 3 + 2] + (a[2] / l) * ink,
        );
        hn.push(-a[0] / l, -a[1] / l, -a[2] / l);
        hullIndex[i] = h++;
      }
      const hullTris: number[] = [];
      for (const pc of this.pieces) {
        if (!pc.ink) continue;
        for (let i = pc.i0; i < pc.i1; i += 3)
          hullTris.push(hullIndex[this.idx[i]], hullIndex[this.idx[i + 2]], hullIndex[this.idx[i + 1]]);
      }
      this.pos.push(...hp);
      this.nor.push(...hn);
      for (let i = n; i < h; i++) {
        this.col.push(0, 0, 0);
        this.info.push(1, 0);
      }
      this.idx.push(...hullTris);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export interface CharacterMaterial extends THREE.MeshToonMaterial {
  userData: {
    accent: { value: THREE.Color };
    fade: { value: number };
    glove: { value: THREE.Color };
    sleeve: { value: THREE.Color };
    trim: { value: THREE.Color };
    /** Scales accent glow (destructible pieces cool down after a cut). */
    glowK: { value: number };
  };
}

/**
 * Toon material for the character. `fade` < 1 turns the piece into a translucent "echo"
 * (used by the ghost): flat accent tint, ink kept.
 */
export function createCharacterMaterial(opts: { ghost?: boolean } = {}): CharacterMaterial {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp(),
    fog: false,
    transparent: !!opts.ghost,
    depthWrite: !opts.ghost,
  }) as CharacterMaterial;
  const accent = { value: new THREE.Color(0xff9a3c) };
  const fade = { value: 1 };
  const glove = { value: new THREE.Color(0x39425c) };
  const sleeve = { value: new THREE.Color(0x2b3656) };
  const trim = { value: new THREE.Color(0x14171f) };
  const glowK = { value: 1 };
  mat.userData = { accent, fade, glove, sleeve, trim, glowK };
  const ghost = !!opts.ghost;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = accent;
    shader.uniforms.uFade = fade;
    shader.uniforms.uGlove = glove;
    shader.uniforms.uSleeve = sleeve;
    shader.uniforms.uTrim = trim;
    shader.uniforms.uGlowK = glowK;
    shader.uniforms.uInk = worldUniforms.uInk;
    shader.uniforms.uSunPower = worldUniforms.uSunPower;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aInfo;\nvarying vec2 vInfo;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvInfo = aInfo;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vInfo;
uniform vec3 uAccent;
uniform vec3 uGlove;
uniform vec3 uSleeve;
uniform vec3 uTrim;
uniform vec3 uInk;
uniform float uFade;
uniform float uGlowK;
uniform float uSunPower;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vInfo.y < -0.5) {
  vec3 pc = uAccent;
  if (vInfo.y < -3.5) pc = uTrim;
  else if (vInfo.y < -2.5) pc = uSleeve;
  else if (vInfo.y < -1.5) pc = uGlove;
  diffuseColor.rgb = pc;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += uAccent * max(vInfo.y, 0.0) * 1.6 * uGlowK;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  float dmax = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
  float lit = max(max(reflectedLight.directDiffuse.r, reflectedLight.directDiffuse.g), reflectedLight.directDiffuse.b)
    / max(dmax * 0.3183 * uSunPower * 1.1, 0.0001);
  float shade = 1.0 - smoothstep(0.55, 0.7, lit);
  // halftone dots fill the shaded side, like printed comic shading
  vec2 hg = mat2(0.707, -0.707, 0.707, 0.707) * gl_FragCoord.xy / 5.0;
  float dots = 1.0 - smoothstep(0.24, 0.32, length(fract(hg) - 0.5));
  outgoingLight *= 1.0 - dots * shade * 0.3;
  // a hard-edged rim light on upward-facing silhouettes
  float rimK = 1.0 - abs(dot(normalize(vViewPosition), normal));
  outgoingLight += diffuseColor.rgb * step(0.62, rimK) * step(0.1, normal.y) * 0.5 * (1.0 - shade);
  ${
    ghost
      ? `outgoingLight = mix(uAccent * 1.3, outgoingLight, 0.25);
  diffuseColor.a = uFade * 0.5;
  if (vInfo.x > 0.5) { outgoingLight = uAccent * 2.0; diffuseColor.a = uFade * 0.9; }`
      : `if (vInfo.x > 0.5) outgoingLight = uInk;`
  }
}
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (ghost ? 'vs-char-ghost' : 'vs-char');
  return mat;
}
