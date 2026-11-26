/**
 * World material: MeshStandardMaterial extended with the game's stylised surface language.
 *
 * Per-vertex inputs (built by render/geometry.ts):
 *   color  – palette colour
 *   aFace  – (u, v, width, height) of the box face in metres → bevel highlights + panel seams
 *   aFx    – (wallrun, glow, hazard) flags
 *
 * The same shader carries the readability vocabulary on every level:
 *   wall-runnable = twin light rails + drifting chevrons, hazard = pulsing diagonal stripes,
 *   telegraph (uWarn) = hot flicker. Height fog is applied here too so everything, including the
 *   far megastructures, sinks into the atmosphere.
 */
import * as THREE from 'three';

export interface WorldUniforms {
  uTime: { value: number };
  uAccent: { value: THREE.Color };
  uHazard: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogSun: { value: THREE.Color };
  uFogDensity: { value: number };
  uFogBase: { value: number };
  uFogFalloff: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSeam: { value: number };
  uRim: { value: number };
  uHazardAlt: { value: number }; // 1 = colour-blind-safe hazard pattern boost
}

export const worldUniforms: WorldUniforms = {
  uTime: { value: 0 },
  uAccent: { value: new THREE.Color(0xff9a3c) },
  uHazard: { value: new THREE.Color(0xff2d55) },
  uFogColor: { value: new THREE.Color(0x88aacc) },
  uFogSun: { value: new THREE.Color(0xffeedd) },
  uFogDensity: { value: 0.004 },
  uFogBase: { value: -10 },
  uFogFalloff: { value: 0.04 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSeam: { value: 0.1 },
  uRim: { value: 0.2 },
  uHazardAlt: { value: 0 },
};

/** GLSL shared with other shaders (sky, particles) so fog always matches. */
export const fogGLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSun;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uFogFalloff;
uniform vec3 uSunDir;
vec3 applyWorldFog(vec3 color, vec3 wpos, vec3 camPos) {
  vec3 toP = wpos - camPos;
  float dist = length(toP);
  float fd = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  float hf = exp(-max(wpos.y - uFogBase, 0.0) * uFogFalloff);
  float below = smoothstep(uFogBase + 4.0, uFogBase - 70.0, wpos.y);
  float f = clamp(fd * (0.3 + 0.7 * hf) + below * smoothstep(20.0, 160.0, dist), 0.0, 1.0);
  float s = pow(max(dot(toP / max(dist, 0.001), uSunDir), 0.0), 6.0);
  return mix(color, mix(uFogColor, uFogSun, s * 0.7), f);
}
`;

export function createWorldMaterial(opts: {
  roughness: number;
  metalness: number;
  warn?: { value: number };
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness,
    metalness: opts.metalness,
    fog: false,
  });
  const warn = opts.warn ?? { value: 0 };
  mat.userData.warn = warn;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, { uWarn: warn });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aFace;
attribute vec3 aFx;
varying vec4 vFace;
varying vec3 vFx;
varying vec3 vWPos;
varying vec3 vWNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFace = aFace;
vFx = aFx;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNormal = normalize(mat3(modelMatrix) * normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vFace;
varying vec3 vFx;
varying vec3 vWPos;
varying vec3 vWNormal;
uniform float uTime;
uniform vec3 uAccent;
uniform vec3 uHazard;
uniform float uSeam;
uniform float uRim;
uniform float uWarn;
uniform float uHazardAlt;
${fogGLSL}
float vsHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vsNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vsHash(i), vsHash(i + vec3(1,0,0)), f.x), mix(vsHash(i + vec3(0,1,0)), vsHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(vsHash(i + vec3(0,0,1)), vsHash(i + vec3(1,0,1)), f.x), mix(vsHash(i + vec3(0,1,1)), vsHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 vsEmissive = vec3(0.0);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float u = vFace.x, v = vFace.y, fw = vFace.z, fh = vFace.w;
  float edge = min(min(u, fw - u), min(v, fh - v));
  float aa = fwidth(edge) + 0.0005;
  // bevel highlight along every box edge (cheap "chamfer")
  float rim = 1.0 - smoothstep(0.02, 0.07 + aa, edge);
  // panel seams every 2.5 m, centred on the face
  vec2 cell = abs(fract(vec2(u - fw * 0.5, v - fh * 0.5) / 2.5 + 0.5) - 0.5) * 2.5;
  float seamD = min(cell.x, cell.y);
  float seam = (1.0 - smoothstep(0.012, 0.03 + fwidth(seamD), seamD)) * step(1.6, min(fw, fh));
  // broad tonal variation + fine grain so large faces never look flat
  float n = vsNoise(vWPos * 0.18) * 0.6 + vsNoise(vWPos * 1.7) * 0.25 + vsNoise(vWPos * 9.0) * 0.15;
  float up = vWNormal.y;
  vec3 c = diffuseColor.rgb;
  c *= 0.9 + n * 0.2;
  c *= 1.0 + up * 0.1;                       // tops catch light, undersides sink
  c *= 1.0 - seam * uSeam * 2.2;
  c += rim * uRim * (0.35 + 0.65 * max(up, 0.0)) * mix(vec3(1.0), uAccent, 0.25);
  // soft contact darkening where vertical faces meet the ground plane of the box
  if (abs(up) < 0.5) c *= 0.82 + 0.18 * smoothstep(0.0, 1.4, v);

  // ---- wall-runnable: two light rails and drifting chevrons on vertical faces ----
  if (vFx.x > 0.5 && abs(up) < 0.5) {
    float rail = (1.0 - smoothstep(0.035, 0.06, abs(v - 0.45))) + (1.0 - smoothstep(0.035, 0.06, abs(v - (fh - 0.45))));
    float inside = smoothstep(0.55, 0.75, v) * smoothstep(fh - 0.55, fh - 0.75, v);
    // a strip of small chevrons every 3.2 m of height, drifting along the wall
    float vv = mod(v - 0.45, 3.2) - 1.6;
    float strip = (1.0 - smoothstep(0.26, 0.3, abs(vv))) * inside;
    float chev = abs(fract(u * 0.9 - uTime * 0.45 - abs(vv) * 1.1) - 0.5);
    float chevron = (1.0 - smoothstep(0.07, 0.11, chev)) * strip;
    float guide = (1.0 - smoothstep(0.012, 0.03, abs(abs(vv) - 0.3))) * inside;
    float shimmer = 0.78 + 0.22 * sin(uTime * 2.2 + u * 0.8);
    vsEmissive += uAccent * (rail * 2.2 + chevron * 0.9 + guide * 0.5) * shimmer;
    c = mix(c, c * 0.8 + uAccent * 0.05, inside * 0.5);
  }
  // ---- glow strips / accent pieces ----
  if (vFx.y > 0.0) {
    vsEmissive += diffuseColor.rgb * vFx.y * (2.0 + 0.5 * sin(uTime * 1.7 + vWPos.x * 0.3 + vWPos.z * 0.3));
  }
  // ---- hazard: pulsing diagonal stripes (pattern as well as colour, for colour-blind players) ----
  if (vFx.z > 0.5) {
    float d = fract((vWPos.x + vWPos.y + vWPos.z) * 0.7 + uTime * 0.9);
    float stripe = smoothstep(0.42, 0.5, d) * (1.0 - smoothstep(0.92, 1.0, d));
    float pulse = 0.7 + 0.3 * sin(uTime * 6.0);
    c = mix(uHazard * 0.25, uHazard, stripe);
    vsEmissive += uHazard * (0.9 + stripe * (2.2 + uHazardAlt * 1.5)) * pulse;
    c = mix(c, vec3(0.02), uHazardAlt * (1.0 - stripe) * 0.8);
  }
  // ---- telegraph: about to move / collapse ----
  if (uWarn > 0.001) {
    float flick = 0.55 + 0.45 * sin(uTime * 22.0);
    float crack = smoothstep(0.55, 0.6, vsNoise(vWPos * 2.3 + 7.0)) ;
    vsEmissive += uHazard * uWarn * (0.5 + crack * 2.0) * flick;
    c = mix(c, uHazard, uWarn * 0.25 * flick);
  }
  diffuseColor.rgb = c;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vsEmissive;`,
      )
      .replace(
        '#include <fog_fragment>',
        `gl_FragColor.rgb = applyWorldFog(gl_FragColor.rgb, vWPos, cameraPosition);`,
      );
  };
  mat.customProgramCacheKey = () => 'vs-world';
  return mat;
}
