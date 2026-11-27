/**
 * World material: a cel-shaded (toon) material extended with the game's inked, illustrated
 * surface language: flat light bands, black ink lines on every block edge, hatching in shadow,
 * crisp painted tone patches and graphic markings.
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
import { surfaceDecl } from '../multiverse/surface';
import { mv, mvGLSL } from '../multiverse/uniforms';

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
  uInk: { value: THREE.Color };
  uSunPower: { value: number };
  /** xyz = where the player last landed, w = when (level time): surfaces ripple outward from it. */
  uPulse: { value: THREE.Vector4 };
  uPulseAmt: { value: number };
  uPlayer: { value: THREE.Vector3 };
  /** Phase B look: coloured shadow fill, floor motif, safe-edge lip, neon scale. */
  uShade: { value: THREE.Color };
  uShadeAmt: { value: number };
  uMotif: { value: number };
  uMotifAmt: { value: number };
  uLip: { value: number };
  uGlow: { value: number };
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
  uInk: { value: new THREE.Color(0x0b0d14) },
  uSunPower: { value: 2 },
  uPulse: { value: new THREE.Vector4(0, -9999, 0, -100) },
  uPulseAmt: { value: 0 },
  uPlayer: { value: new THREE.Vector3(0, -9999, 0) },
  uShade: { value: new THREE.Color(0x404a70) },
  uShadeAmt: { value: 0 },
  uMotif: { value: 0 },
  uMotifAmt: { value: 0 },
  uLip: { value: 0 },
  uGlow: { value: 1 },
};

/** Light bands for cel shading (shared by the world and the character). */
let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    // four flat tones: deep shade, shade, light, full light
    const t = new Uint8Array([96, 96, 96, 255, 150, 150, 150, 255, 222, 222, 222, 255, 255, 255, 255, 255]);
    ramp = new THREE.DataTexture(t, 4, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

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

export function createWorldMaterial(opts: { warn?: { value: number } } = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp(),
    fog: false,
  });
  const warn = opts.warn ?? { value: 0 };
  mat.userData.warn = warn;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, mv, { uWarn: warn });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aFace;
attribute vec3 aFx;
attribute float aRole;
varying float vRole;
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
vRole = aRole;
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
uniform vec3 uInk;
uniform float uSeam;
uniform float uRim;
uniform float uWarn;
uniform float uHazardAlt;
uniform float uSunPower;
uniform vec4 uPulse;
uniform float uPulseAmt;
uniform vec3 uPlayer;
uniform vec3 uShade;
uniform float uShadeAmt;
uniform float uMotif;
uniform float uMotifAmt;
uniform float uLip;
uniform float uGlow;
${fogGLSL}
${mvGLSL}
${surfaceDecl}
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
vec3 vsEmissive = vec3(0.0);
float vsInk = 0.0;      // 0..1 ink line coverage (applied after lighting so lines stay black)
float vsHatch = 0.0;    // 0..1 hatch stroke coverage, shown only where the surface is in shadow
float vsH2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// line coverage of a value's distance to the nearest integer, anti-aliased, width w (metres)
float vsLine(float x, float w) { float d = abs(fract(x + 0.5) - 0.5); float aa = fwidth(x) + 1e-5; return 1.0 - smoothstep(w, w + aa, d); }
// ---- per-level floor motifs, painted on walkable tops in world space ----
// returns (darken, lighten, glow) coverage
vec3 vsMotif(vec2 p, float px) {
  vec3 m = vec3(0.0);
  float fade = clamp(0.035 / (px + 1e-4), 0.0, 1.0);   // motifs dissolve into flat tone far away
  if (uMotif < 1.5) {
    // Training: a gym floor. 1.25 m tiles with fine grout, every 4th line a bold lane line,
    // and scattered lighter tiles
    vec2 g = p / 1.25;
    float grout = max(vsLine(g.x, 0.012), vsLine(g.y, 0.012));
    float lane = max(vsLine(p.x / 5.0, 0.006), vsLine(p.y / 5.0, 0.006));
    float lit = step(0.82, vsH2(floor(g)));
    m = vec3(grout * 0.5 + lane * 0.2, lit * 0.6, 0.0);
  } else if (uMotif < 2.5) {
    // Awakening: worn marble. Warped veins, a rarer gilded vein that catches the sun
    vec2 q = p * 0.33 + vec2(vsNoise(vec3(p * 0.4, 1.0)), vsNoise(vec3(p * 0.4, 7.0))) * 1.6;
    float v1 = vsLine(q.x + q.y * 0.35 + vsNoise(vec3(q * 2.0, 3.0)) * 0.5, 0.018);
    float v2 = vsLine((q.x - q.y) * 0.5 + 0.3, 0.008);
    float slab = max(vsLine(p.x / 3.0, 0.004), vsLine(p.y / 3.0, 0.004));
    m = vec3(v1 * 0.28 + slab * 0.45, 0.0, v2 * 0.5);
  } else if (uMotif < 3.5) {
    // Verticality: a hex lattice of light-catching seams
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 pp = p / 1.1;
    vec2 a = mod(pp, r) - h;
    vec2 b = mod(pp - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 ag = abs(gv);
    float hd = 0.5 - max(dot(ag, normalize(vec2(1.0, 1.7320508))), ag.x);
    float aa = fwidth(hd) + 1e-5;
    float seam = 1.0 - smoothstep(0.018, 0.018 + aa, hd);
    m = vec3(seam * 0.55, 0.0, seam * 0.22);
  } else {
    // Momentum: circuit traces with pads, pulses of light running along them
    vec2 c = floor(p / 2.0);
    float hsh = vsH2(c);
    vec2 f = p / 2.0 - c;
    float horiz = step(0.5, hsh);
    float tline = horiz > 0.5 ? vsLine((f.y - 0.25 - hsh * 0.5) * 2.0, 0.025) : vsLine((f.x - 0.25 - hsh * 0.5) * 2.0, 0.025);
    float pr = length(f - vec2(0.25 + hsh * 0.5));
    float pad = (1.0 - smoothstep(0.045, 0.045 + fwidth(f.x) * 2.0, pr)) * smoothstep(0.025, 0.025 + fwidth(f.x) * 2.0, pr);
    float along = horiz > 0.5 ? p.x : p.y;
    float pulse = smoothstep(0.85, 1.0, fract(along * 0.12 - uTime * 0.6 + hsh * 7.0));
    float edge = max(vsLine(p.x / 2.0, 0.004), vsLine(p.y / 2.0, 0.004));
    m = vec3(edge * 0.45 + tline * 0.25, 0.0, (tline + pad) * (0.25 + pulse * 1.3));
  }
  return m * fade * uMotifAmt;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float u = vFace.x, v = vFace.y, fw = vFace.z, fh = vFace.w;
  float edge = min(min(u, fw - u), min(v, fh - v));
  float px = fwidth(edge) + 0.0002;            // metres per pixel on this face
  float up = vWNormal.y;
  bool boxFace = fw < 99.0;
  vec3 c = diffuseColor.rgb;
  mvU = u; mvV = v; mvFw = fw; mvFh = fh; mvEdge = edge; mvPx = px; mvUp = up; mvBox = boxFace ? 1.0 : 0.0;
  mvSdfV = uUniOn > 0.5 ? mvSdf(vWPos) : 1000.0;
  mvM = uUniOn > 0.5 ? mvMask(mvSdfV) : 0.0;

  // ---- painted tone: crisp-edged swatches instead of smooth noise, like gouache blocks ----
  float n1 = vsNoise(vWPos * 0.21);
  float n2 = vsNoise(vWPos * 0.83 + 11.0);
  float swatch = smoothstep(0.5, 0.52, n1) * 0.6 + smoothstep(0.62, 0.64, n2) * 0.4;
  c *= 0.93 + swatch * 0.11;
  c *= 1.0 + up * 0.14;                        // tops read lighter, undersides sink
  // a soft painted gradient up every wall: darker at the foot
  if (abs(up) < 0.5 && boxFace) c *= 0.8 + 0.2 * smoothstep(0.0, 2.2, v);

  // ---- floor identity + the safe-ground lip on walkable tops ----
  float walk = smoothstep(0.75, 0.9, up) * (boxFace ? 1.0 : 0.0) * (1.0 - step(0.5, vFx.z));
  mvWalk = walk;
  if (walk > 0.0 && uMotif > 0.5) {
    vec3 mo = vsMotif(vWPos.xz, px) * walk;
    c = mix(c, c * 0.62, mo.x);
    c = mix(c, c * 1.12 + 0.03, mo.y);
    vsEmissive += uAccent * mo.z * 0.35 * uGlow;
    c = mix(c, mix(c, uAccent, 0.5), mo.z * 0.5);
  }
  if (boxFace) {
    // ---- ink: a black line along every block edge, never thinner than ~1.3 px ----
    float w = max(0.028, px * 1.3);
    float faceMin = min(fw, fh);
    float tiny = clamp(faceMin / (px * 9.0), 0.0, 1.0);   // faces only a few pixels wide stay clean
    vsInk = (1.0 - smoothstep(w, w + px, edge)) * tiny;
    mvTiny = tiny;
    // an inner highlight line just inside the ink on lit tops: the "drawn" bevel
    float hl = smoothstep(w + px, w + px * 2.0, edge) * (1.0 - smoothstep(w * 2.4, w * 2.4 + px, edge));
    c += hl * uRim * (0.25 + 0.75 * max(up, 0.0)) * mix(vec3(1.0), uAccent, 0.3) * tiny;
    // a painted band just inside the edge of walkable ground: reads as "safe to land"
    float lipBand = smoothstep(w + px, w + px * 2.0, edge) * (1.0 - smoothstep(0.16, 0.16 + px * 1.5, edge));
    c = mix(c, mix(c * 1.35 + 0.06, uAccent, 0.35), lipBand * walk * uLip * tiny * step(1.0, faceMin));
    mvLip = lipBand * walk * max(uLip, 0.5) * tiny * step(1.0, faceMin);
    // panel seams every 2.5 m as thin ink scratches
    vec2 cell = abs(fract(vec2(u - fw * 0.5, v - fh * 0.5) / 2.5 + 0.5) - 0.5) * 2.5;
    float seamD = min(cell.x, cell.y);
    float seam = (1.0 - smoothstep(0.008, 0.012 + fwidth(seamD), seamD)) * step(1.6, faceMin);
    seam *= clamp(0.02 / (px + 0.0001), 0.0, 1.0);        // fades out in the distance
    c = mix(c, c * 0.45, seam * min(1.0, uSeam * 6.0));
    // ---- hatching strokes (only revealed in shadow, see below) ----
    float hk = (u + v) * 5.5 + n2 * 0.9;
    float hline = abs(fract(hk) - 0.5);
    float hfade = clamp(1.0 - fwidth(hk) * 2.2, 0.0, 1.0);
    vsHatch = (1.0 - smoothstep(0.1, 0.16, hline)) * hfade * step(0.5, faceMin);
  }

  // ---- wall-runnable: painted rails and a band of bold chevrons on vertical faces ----
  if (vFx.x > 0.5 && abs(up) < 0.5) {
    float rail = (1.0 - smoothstep(0.05, 0.06 + px, abs(v - 0.45))) + (1.0 - smoothstep(0.05, 0.06 + px, abs(v - (fh - 0.45))));
    float inside = smoothstep(0.55, 0.75, v) * smoothstep(fh - 0.55, fh - 0.75, v);
    float vv = mod(v - 0.45, 3.2) - 1.6;
    float strip = (1.0 - smoothstep(0.3, 0.31 + px, abs(vv))) * inside;
    float chev = abs(fract(u * 0.8 - uTime * 0.45 - abs(vv) * 1.1) - 0.5);
    float chevron = (1.0 - smoothstep(0.09, 0.1 + fwidth(chev), chev)) * strip;
    float guide = (1.0 - smoothstep(0.02, 0.03 + px, abs(abs(vv) - 0.33))) * inside;
    // the wall wakes up as the player gets close
    float near = 1.0 - smoothstep(3.0, 16.0, distance(vWPos, uPlayer));
    float paint = clamp(rail + chevron + guide * 0.7, 0.0, 1.0);
    mvPaint = paint; mvNear = near; mvRun = inside;
    c = mix(c, c * 0.72, inside * 0.6);
    c = mix(c, uAccent, paint);
    vsEmissive += uAccent * paint * (0.35 + near * 0.9) * uGlow;
    vsHatch *= 1.0 - paint;
  }
  // ---- glow strips / accent pieces ----
  if (vFx.y > 0.0) {
    mvGlow = vFx.y;
    vsEmissive += diffuseColor.rgb * vFx.y * uGlow * (1.5 + 0.35 * sin(uTime * 1.7 + vWPos.x * 0.3 + vWPos.z * 0.3));
    vsInk = 0.0;
    vsHatch = 0.0;
  }
  // ---- hazard: bold black-and-colour warning stripes (pattern as well as colour) ----
  if (vFx.z > 0.5) {
    float d = fract((vWPos.x + vWPos.y + vWPos.z) * 0.7 + uTime * 0.9);
    float stripe = smoothstep(0.46, 0.5, d) * (1.0 - smoothstep(0.96, 1.0, d));
    float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
    mvHaz = 1.0; mvStripe = stripe;
    c = mix(uInk, uHazard, stripe);
    vsEmissive += uHazard * stripe * (0.9 + uHazardAlt * 1.2) * pulse;
    vsHatch = 0.0;
  }
  // ---- telegraph: about to move / collapse ----
  if (uWarn > 0.001) {
    float flick = 0.55 + 0.45 * sin(uTime * 22.0);
    float crack = smoothstep(0.55, 0.6, vsNoise(vWPos * 2.3 + 7.0));
    vsEmissive += uHazard * uWarn * (0.5 + crack * 2.0) * flick;
    mvWarn = uWarn * (0.5 + crack) * flick;
    c = mix(c, uHazard, uWarn * 0.25 * flick);
  }
  // ---- the world answers a landing: a ring of light runs out across nearby surfaces ----
  float age = uTime - uPulse.w;
  if (age > 0.0 && age < 0.7 && uPulseAmt > 0.0) {
    float pd = distance(vWPos, uPulse.xyz);
    float ring = (1.0 - smoothstep(0.0, 0.22, abs(pd - age * 13.0))) * (1.0 - age / 0.7);
    vsEmissive += uAccent * ring * uPulseAmt * 1.4;
    mvRing = ring * uPulseAmt;
  }
  diffuseColor.rgb = c;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vsEmissive;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  // how lit is this pixel by the sun (0 = in shadow, cast or self)? hatch and cool the shadows
  float sunLit = max(max(reflectedLight.directDiffuse.r, reflectedLight.directDiffuse.g), reflectedLight.directDiffuse.b)
    / max(max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) * 0.3183 * uSunPower, 0.0001);
  float shade = 1.0 - smoothstep(0.3, 0.5, sunLit);
  outgoingLight *= 1.0 - vsHatch * shade * 0.3;
  // coloured fill in the shade: shadows become a designed tone, not just "darker", and dark
  // levels keep readable mid-tones
  outgoingLight += diffuseColor.rgb * uShade * uShadeAmt * (0.35 + 0.65 * shade) * 0.55;
  outgoingLight = mix(outgoingLight, uInk, vsInk * 0.92);
  mvLit = clamp(sunLit, 0.0, 1.0);
  mvNdl = dot(normalize(vWNormal), uSunDir);
  mvResolve(outgoingLight);
}
#include <opaque_fragment>`,
      )
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = mvCompose(cameraPosition);`);
  };
  mat.customProgramCacheKey = () => 'vs-world-mv1';
  return mat;
}
