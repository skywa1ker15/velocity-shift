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
}

export class PartBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private info: number[] = [];
  private idx: number[] = [];
  private count = 0;

  /** Add a primitive (the geometry is consumed and disposed). */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, color: number, o: PartOpts = {}): this {
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const base = this.count;
    _m.copy(matrix ?? _m.identity());
    _nm.getNormalMatrix(_m);
    _c.set(color);
    const glow = o.accent ? -1 : (o.glow ?? 0);
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
    this.count += p.count;
    geo.dispose();
    return this;
  }

  /** Finish the piece. `ink` is the outline thickness in metres (0 = no outline). */
  build(ink: number): THREE.BufferGeometry {
    const n = this.count;
    if (ink > 0) {
      // average the normals of coincident vertices so the hull has no cracks at hard edges
      const acc = new Map<string, [number, number, number]>();
      const keys: string[] = [];
      for (let i = 0; i < n; i++) {
        const k = `${Math.round(this.pos[i * 3] * 2e4)},${Math.round(this.pos[i * 3 + 1] * 2e4)},${Math.round(this.pos[i * 3 + 2] * 2e4)}`;
        keys.push(k);
        const a = acc.get(k);
        if (a) {
          a[0] += this.nor[i * 3];
          a[1] += this.nor[i * 3 + 1];
          a[2] += this.nor[i * 3 + 2];
        } else acc.set(k, [this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2]]);
      }
      for (let i = 0; i < n; i++) {
        const a = acc.get(keys[i])!;
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        this.pos.push(
          this.pos[i * 3] + (a[0] / l) * ink,
          this.pos[i * 3 + 1] + (a[1] / l) * ink,
          this.pos[i * 3 + 2] + (a[2] / l) * ink,
        );
        this.nor.push(-a[0] / l, -a[1] / l, -a[2] / l);
        this.col.push(0, 0, 0);
        this.info.push(1, 0);
      }
      const tris = this.idx.length;
      for (let i = 0; i < tris; i += 3)
        this.idx.push(this.idx[i] + n, this.idx[i + 2] + n, this.idx[i + 1] + n);
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
  userData: { accent: { value: THREE.Color }; fade: { value: number } };
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
  mat.userData = { accent, fade };
  const ghost = !!opts.ghost;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = accent;
    shader.uniforms.uFade = fade;
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
uniform vec3 uInk;
uniform float uFade;
uniform float uSunPower;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vInfo.y < -0.5) diffuseColor.rgb = uAccent;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += uAccent * max(vInfo.y, 0.0) * 1.6;`,
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
