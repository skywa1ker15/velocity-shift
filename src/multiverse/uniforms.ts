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
  /** Direction the player was heading when the shift began (planar transitions sweep along it). */
  uFrontDir: { value: new THREE.Vector3(0, 0, 1) },
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
uniform vec3 uFrontDir;
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
// signed distance to the transition front: negative = already in universe B.
// uFrontP.x picks the transition: 0 portal, 1 tear, 2 glitch, 3 drain, 4 wave, 5 pixel, 6 collapse
float mvSdf(vec3 p) {
  float kind = uFrontP.x;
  float soft = uFrontP.y;
  float t = uFrontP.z;
  float w = uFront.w;
  vec3 rel = p - uFront.xyz;
  // far away the front is a clean shell; near the player it is a ragged, living edge
  float rough = soft * (1.0 - smoothstep(60.0, 400.0, w) * 0.6);
  float n = (mvNoise(p * 0.33 + t * 0.35) - 0.5) * rough * 2.4 + (mvNoise(p * 1.9 - t * 0.6) - 0.5) * rough * 0.5;
  if (kind < 0.5) return length(rel) - w + n;
  if (kind < 1.5) {
    // tear: reality splits along a jagged vertical seam and is pulled apart sideways
    vec3 right = normalize(cross(uFrontDir, vec3(0.0, 1.0, 0.0)));
    float fwd = dot(rel, uFrontDir);
    float jag = (mvNoise(vec3(rel.y * 0.7, fwd * 0.7, 1.0)) - 0.5) * (2.5 + min(w, 40.0) * 0.2)
      + (mvNoise(vec3(rel.y * 3.5, fwd * 3.5, 3.0)) - 0.5) * 0.9;
    return abs(dot(rel, right)) - w * 0.6 + jag;
  }
  if (kind < 2.5) {
    // glitch: the world flips block by block, and blocks near the front cannot make up their mind
    vec3 cell = floor(p / 3.0);
    float d = distance((cell + 0.5) * 3.0, uFront.xyz) - w + (mvHash(cell) - 0.5) * 18.0;
    if (abs(d) < 6.0) d = mvHash(cell + floor(t * 13.0)) > 0.5 ? -1.0 : 1.0;
    return d;
  }
  if (kind < 3.5) return length(rel) - w + n * 0.4;
  if (kind < 4.5) {
    // wave: a rippling wall of change rolls out along the course in both directions
    vec3 right = normalize(cross(uFrontDir, vec3(0.0, 1.0, 0.0)));
    float side = dot(rel, right);
    return abs(dot(rel, uFrontDir)) - w * 0.6 + sin(side * 0.3 + t * 3.0) * 1.8 + sin(rel.y * 0.45 - t * 2.2) * 1.3;
  }
  if (kind < 5.5) {
    // pixel: the front advances in big cubes with a dithered edge
    vec3 cell = floor(p / 4.0);
    return distance((cell + 0.5) * 4.0, uFront.xyz) - w + (mvHash(cell * 1.31) - 0.5) * 12.0;
  }
  return length(rel) - w + n;
}
// 0 = universe A, 1 = universe B
float mvMask(float sdf) {
  return 1.0 - smoothstep(-0.06, 0.06, sdf);
}
`;
