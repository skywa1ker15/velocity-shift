/**
 * Shared multiverse uniforms + GLSL.
 *
 * Two universes can be on screen at once: A (the one being left) and B (the one arriving). A
 * transition "front" sweeps through world space; every shader that takes part asks mvMask(worldPos)
 * which side of the front a pixel is on and draws that universe's look. Nothing is swapped or
 * reloaded, so a shift never pauses the game. When no shift is running uUniOn is 0 and only A is
 * evaluated.
 *
 * Surfaces carry a material *role* (base, alt, dark, accent, glass, hazard, structure) rather
 * than a baked colour, so each universe paints the same level with its own palette.
 */
import * as THREE from 'three';

export const ROLE = { base: 0, alt: 1, dark: 2, accent: 3, glass: 4, hazard: 5, structure: 6 } as const;
export const ROLE_COUNT = 7;

/** A colour that remembers which material role it stands for. */
export class RoleColor extends THREE.Color {
  role = 0;
  withRole(role: number): this {
    this.role = role;
    return this;
  }
}

const pal = () => Array.from({ length: ROLE_COUNT }, () => new THREE.Color(1, 1, 1));

export const mv = {
  /** Shader ids of the universe being left (A) and the one arriving (B). */
  uUniA: { value: 0 },
  uUniB: { value: 0 },
  /** 1 while a transition front is travelling. */
  uUniOn: { value: 0 },
  /** xyz = where the shift began, w = current radius of the front (metres). */
  uFront: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x = transition kind, y = edge roughness (m), z = seconds since the shift began, w = run seed 0..1. */
  uFrontP: { value: new THREE.Vector4(0, 1.2, 0, 0) },
  uPalA: { value: pal() },
  uPalB: { value: pal() },
  /** Per-universe light: sun colour, shade (ambient) colour. */
  uSunA: { value: new THREE.Color(1, 1, 1) },
  uSunB: { value: new THREE.Color(1, 1, 1) },
  uAmbA: { value: new THREE.Color(0.4, 0.4, 0.5) },
  uAmbB: { value: new THREE.Color(0.4, 0.4, 0.5) },
  /** Per-universe fog: colour, sun-side colour, (density, base, falloff). */
  uFogColA: { value: new THREE.Color() },
  uFogColB: { value: new THREE.Color() },
  uFogSunA: { value: new THREE.Color() },
  uFogSunB: { value: new THREE.Color() },
  uFogPA: { value: new THREE.Vector3(0.004, -10, 0.04) },
  uFogPB: { value: new THREE.Vector3(0.004, -10, 0.04) },
  /** Sky colours per universe: top, horizon, bottom, sun. */
  uSkyA: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  uSkyB: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  /** 0..1: how far the camera itself is inside universe B (drives lights, post, HUD, audio). */
  uInB: { value: 0 },
};

/** Declarations + the mask. Include once per shader stage that needs it. */
export const mvGLSL = /* glsl */ `
uniform float uUniA;
uniform float uUniB;
uniform float uUniOn;
uniform vec4 uFront;
uniform vec4 uFrontP;
float mvHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float mvNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mvHash(i), mvHash(i + vec3(1,0,0)), f.x), mix(mvHash(i + vec3(0,1,0)), mvHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mvHash(i + vec3(0,0,1)), mvHash(i + vec3(1,0,1)), f.x), mix(mvHash(i + vec3(0,1,1)), mvHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float mvH2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// signed distance to the transition front: negative = already in universe B
float mvSdf(vec3 p) {
  float d = distance(p, uFront.xyz) - uFront.w;
  float soft = uFrontP.y;
  // far away the front is a clean shell; near the player it is a ragged, living edge
  float rough = soft * (1.0 - smoothstep(60.0, 400.0, uFront.w) * 0.6);
  d += (mvNoise(p * 0.33 + uFrontP.z * 0.35) - 0.5) * rough * 2.4;
  d += (mvNoise(p * 1.9 - uFrontP.z * 0.6) - 0.5) * rough * 0.5;
  return d;
}
// 0 = universe A, 1 = universe B
float mvMask(float sdf) {
  return 1.0 - smoothstep(-0.06, 0.06, sdf);
}
`;
